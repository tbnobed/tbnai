/**
 * Book ingest pipeline — reads a source file (PDF or plain text),
 * splits it into overlapping chunks, embeds each chunk, and stores
 * the vectors in the chunks table.
 *
 * Text extraction is best-effort; chapter/page detection uses heuristics.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { db, booksTable, chunksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { embedText } from "./rag";
import { logger } from "./logger";

// Chunking parameters — tune via env vars
const CHUNK_SIZE = parseInt(process.env.INGEST_CHUNK_SIZE ?? "600", 10); // ~words
const CHUNK_OVERLAP = parseInt(
  process.env.INGEST_CHUNK_OVERLAP ?? "100",
  10,
); // overlap in words

interface TextChunk {
  content: string;
  chapterTitle: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  chunkIndex: number;
}

/** Extract raw text from a PDF or plain-text file. */
async function extractText(
  filePath: string,
): Promise<{ text: string; pages: Map<number, number> }> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    // Dynamic import to keep the module optional at startup
    // pdf-parse has a mixed CJS/ESM export — handle both shapes
    const pdfMod = await import("pdf-parse");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse: any = (pdfMod as any).default ?? pdfMod;
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);

    // Build a rough character-offset → page map from page texts
    const pages = new Map<number, number>();
    let offset = 0;
    for (let i = 0; i < (data.numpages ?? 1); i++) {
      pages.set(offset, i + 1);
      // pdf-parse doesn't expose per-page text; use even split as fallback
      offset += Math.floor(data.text.length / (data.numpages || 1));
    }

    return { text: data.text as string, pages };
  }

  // Plain text / other formats — read as UTF-8
  const text = await fs.readFile(filePath, "utf-8");
  return { text, pages: new Map([[0, 1]]) };
}

/** Guess the current page number from character offset. */
function guessPage(
  charOffset: number,
  pageMap: Map<number, number>,
): number | null {
  let lastPage: number | null = null;
  for (const [offset, page] of pageMap) {
    if (offset <= charOffset) lastPage = page;
    else break;
  }
  return lastPage;
}

/** Detect chapter headings using simple heuristics. */
function detectChapter(line: string): string | null {
  const trimmed = line.trim();
  // "Chapter 1", "CHAPTER ONE", "1. TITLE", bare all-caps short lines
  if (/^chapter\s+\d+/i.test(trimmed)) return trimmed;
  if (/^\d+\.\s+[A-Z]/.test(trimmed) && trimmed.length < 80) return trimmed;
  if (/^[A-Z\s]{6,60}$/.test(trimmed) && !trimmed.includes("  ")) {
    return trimmed;
  }
  return null;
}

/** Split text into overlapping word-count chunks with metadata. */
function chunkText(
  text: string,
  pageMap: Map<number, number>,
): TextChunk[] {
  const lines = text.split(/\n+/);
  const chunks: TextChunk[] = [];
  let wordBuffer: string[] = [];
  let charOffset = 0;
  let currentChapter: string | null = null;
  let chunkIndex = 0;

  const flush = (startCharOffset: number, endCharOffset: number) => {
    if (wordBuffer.length < 20) return; // skip very short chunks
    const content = wordBuffer.join(" ").trim();
    chunks.push({
      content,
      chapterTitle: currentChapter,
      pageStart: guessPage(startCharOffset, pageMap),
      pageEnd: guessPage(endCharOffset, pageMap),
      chunkIndex: chunkIndex++,
    });
  };

  let startOffset = 0;

  for (const line of lines) {
    const chapter = detectChapter(line);
    if (chapter) currentChapter = chapter;

    const words = line.split(/\s+/).filter(Boolean);
    const lineOffset = charOffset;
    charOffset += line.length + 1;

    wordBuffer.push(...words);

    if (wordBuffer.length >= CHUNK_SIZE) {
      flush(startOffset, charOffset);
      // Keep overlap words
      wordBuffer = wordBuffer.slice(-CHUNK_OVERLAP);
      startOffset = charOffset - CHUNK_OVERLAP * 5; // rough char approximation
    }
  }

  if (wordBuffer.length > 0) flush(startOffset, charOffset);

  return chunks;
}

/**
 * Ingest a single book: extract text, chunk, embed, persist.
 * Call this from a background job after creating the book record.
 */
export async function ingestBook(bookId: number): Promise<void> {
  // Mark as processing
  await db
    .update(booksTable)
    .set({ status: "processing", errorMessage: null })
    .where(eq(booksTable.id, bookId));

  const [book] = await db
    .select()
    .from(booksTable)
    .where(eq(booksTable.id, bookId));

  if (!book) throw new Error(`Book ${bookId} not found`);

  logger.info({ bookId, filePath: book.filePath }, "Starting ingest");

  try {
    // 1. Extract text
    const { text, pages } = await extractText(book.filePath);

    // 2. Chunk
    const textChunks = chunkText(text, pages);
    logger.info({ bookId, chunkCount: textChunks.length }, "Text chunked");

    // 3. Delete old chunks (for reindex)
    await db.delete(chunksTable).where(eq(chunksTable.bookId, bookId));

    // 4. Embed and insert in batches
    const BATCH = parseInt(process.env.INGEST_EMBED_BATCH ?? "10", 10);
    let inserted = 0;

    for (let i = 0; i < textChunks.length; i += BATCH) {
      const batch = textChunks.slice(i, i + BATCH);
      const embedded = await Promise.all(
        batch.map(async (chunk) => ({
          bookId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          chapterTitle: chunk.chapterTitle,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          embedding: await embedText(chunk.content),
        })),
      );

      await db.insert(chunksTable).values(embedded);
      inserted += embedded.length;
      logger.debug({ bookId, inserted, total: textChunks.length }, "Embed batch done");
    }

    // 5. Mark ready
    await db
      .update(booksTable)
      .set({ status: "ready", totalChunks: inserted })
      .where(eq(booksTable.id, bookId));

    logger.info({ bookId, totalChunks: inserted }, "Ingest complete");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ bookId, err }, "Ingest failed");
    await db
      .update(booksTable)
      .set({ status: "error", errorMessage: message })
      .where(eq(booksTable.id, bookId));
    throw err;
  }
}
