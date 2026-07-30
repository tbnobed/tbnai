/**
 * RAG pipeline — embed a query, retrieve top-k chunks via pgvector,
 * synthesize an answer with the local LLM, and return citations.
 */
import OpenAI from "openai";
import { sql } from "drizzle-orm";
import { db, booksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const CHAT_MODEL = process.env.CHAT_MODEL ?? "gpt-oss-120b";
const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
const TOP_K = parseInt(process.env.RAG_TOP_K ?? "8", 10);
const MIN_SIMILARITY = parseFloat(process.env.RAG_MIN_SIMILARITY ?? "0.3");

function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_BASE_URL) {
    throw new Error("OPENAI_BASE_URL environment variable is required");
  }
  return new OpenAI({
    baseURL: process.env.OPENAI_BASE_URL,
    apiKey: process.env.OPENAI_API_KEY ?? "local",
  });
}

export async function embedText(text: string): Promise<number[]> {
  const client = getOpenAIClient();
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0]!.embedding;
}

export interface RetrievedChunk {
  id: number;
  bookId: number;
  bookTitle: string;
  bookAuthor: string;
  content: string;
  chapterTitle: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  similarity: number;
}

export async function retrieveRelevantChunks(
  queryEmbedding: number[],
  topK = TOP_K,
  minSimilarity = MIN_SIMILARITY,
): Promise<RetrievedChunk[]> {
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  // pgvector cosine distance: <=> returns 0 (identical) to 2 (opposite)
  // similarity = 1 - cosine_distance
  const rows = await db.execute<{
    id: number;
    book_id: number;
    book_title: string;
    book_author: string;
    content: string;
    chapter_title: string | null;
    page_start: number | null;
    page_end: number | null;
    similarity: number;
  }>(
    sql`
      SELECT
        c.id,
        c.book_id,
        b.title AS book_title,
        b.author AS book_author,
        c.content,
        c.chapter_title,
        c.page_start,
        c.page_end,
        1 - (c.embedding <=> ${vectorStr}::vector) AS similarity
      FROM chunks c
      JOIN books b ON b.id = c.book_id
      WHERE b.status = 'ready'
        AND 1 - (c.embedding <=> ${vectorStr}::vector) >= ${minSimilarity}
      ORDER BY c.embedding <=> ${vectorStr}::vector
      LIMIT ${topK}
    `,
  );

  return rows.rows.map((r) => ({
    id: r.id,
    bookId: r.book_id,
    bookTitle: r.book_title,
    bookAuthor: r.book_author,
    content: r.content,
    chapterTitle: r.chapter_title,
    pageStart: r.page_start,
    pageEnd: r.page_end,
    similarity: typeof r.similarity === "string" ? parseFloat(r.similarity) : r.similarity,
  }));
}

export interface RagAnswer {
  answer: string;
  citations: Array<{
    bookId: number;
    bookTitle: string;
    author: string;
    chapterTitle: string | null;
    pageStart: number | null;
    pageEnd: number | null;
    excerpt: string;
    relevanceScore: number;
  }>;
}

export async function generateAnswer(
  query: string,
  chunks: RetrievedChunk[],
): Promise<RagAnswer> {
  const client = getOpenAIClient();

  if (chunks.length === 0) {
    return {
      answer:
        "No relevant passages were found in the archive for this question. Please try rephrasing, or the topic may not be covered in the current catalog.",
      citations: [],
    };
  }

  // Build the context block
  const contextText = chunks
    .map((c, i) => {
      const location = [
        c.chapterTitle ? `Chapter: ${c.chapterTitle}` : null,
        c.pageStart != null
          ? c.pageEnd != null && c.pageEnd !== c.pageStart
            ? `Pages ${c.pageStart}–${c.pageEnd}`
            : `Page ${c.pageStart}`
          : null,
      ]
        .filter(Boolean)
        .join(", ");
      return `[${i + 1}] "${c.bookTitle}" by ${c.bookAuthor}${location ? ` (${location})` : ""}:\n${c.content}`;
    })
    .join("\n\n---\n\n");

  const systemPrompt = `You are a knowledgeable research assistant for TBNStudios.ai, a book archive search tool. Your role is to answer staff questions accurately and helpfully using only the provided source passages from the archive.

Guidelines:
- Answer in clear, precise prose suitable for editors, researchers, and programming staff.
- Synthesize across multiple sources when relevant — do not merely quote.
- If the passages don't fully address the question, say so honestly while sharing what is available.
- Use a respectful, scholarly tone appropriate for broadcasting and publishing research.
- Do not invent information not present in the passages.
- Do not cite passage numbers in your answer text; the citations will be shown separately.`;

  const userPrompt = `Question: ${query}

Source passages from the archive:

${contextText}

Please provide a clear, synthesized answer based solely on these passages.`;

  const completion = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 1024,
  });

  const answer =
    completion.choices[0]?.message?.content?.trim() ??
    "Unable to generate an answer. Please try again.";

  // Deduplicate citations by book — keep highest similarity per book
  const citationMap = new Map<
    number,
    {
      bookId: number;
      bookTitle: string;
      author: string;
      chapterTitle: string | null;
      pageStart: number | null;
      pageEnd: number | null;
      excerpt: string;
      relevanceScore: number;
    }
  >();

  for (const chunk of chunks) {
    const existing = citationMap.get(chunk.bookId);
    if (!existing || chunk.similarity > existing.relevanceScore) {
      citationMap.set(chunk.bookId, {
        bookId: chunk.bookId,
        bookTitle: chunk.bookTitle,
        author: chunk.bookAuthor,
        chapterTitle: chunk.chapterTitle,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        excerpt: chunk.content.slice(0, 300) + (chunk.content.length > 300 ? "…" : ""),
        relevanceScore: parseFloat(chunk.similarity.toFixed(4)),
      });
    }
  }

  logger.info(
    { query, chunkCount: chunks.length, citationCount: citationMap.size },
    "RAG answer generated",
  );

  return {
    answer,
    citations: Array.from(citationMap.values()).sort(
      (a, b) => b.relevanceScore - a.relevanceScore,
    ),
  };
}
