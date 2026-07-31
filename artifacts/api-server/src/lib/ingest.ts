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
import { detectBookMetadata } from "./metadata";
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

/** Strip HTML tags/entities from an (X)HTML string, keeping readable text. */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi, "\n\n$2\n\n")
    .replace(/<(p|div|br|li|tr)[^>]*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Zip-bomb guards for EPUB extraction
const EPUB_MAX_ENTRIES = 5000;
const EPUB_MAX_ENTRY_CHARS = 20_000_000; // ~20 MB of text per entry
const EPUB_MAX_TOTAL_CHARS = 100_000_000; // ~100 MB of text total

/** Read one XML/HTML attribute value (single- or double-quoted). */
function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`[\\s"']${name}\\s*=\\s*("([^"]*)"|'([^']*)')`));
  return m?.[2] ?? m?.[3];
}

/** Extract text from an EPUB (a zip of XHTML files, read in spine order). */
async function extractEpubText(filePath: string): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await fs.readFile(filePath));

  if (Object.keys(zip.files).length > EPUB_MAX_ENTRIES) {
    throw new Error("EPUB rejected: too many entries in archive");
  }

  let totalChars = 0;
  const readEntry = async (entryPath: string): Promise<string | undefined> => {
    const text = await zip.file(entryPath)?.async("string");
    if (text === undefined) return undefined;
    if (text.length > EPUB_MAX_ENTRY_CHARS) {
      throw new Error("EPUB rejected: archive entry too large");
    }
    totalChars += text.length;
    if (totalChars > EPUB_MAX_TOTAL_CHARS) {
      throw new Error("EPUB rejected: uncompressed content too large");
    }
    return text;
  };

  // 1. Find the OPF package file via META-INF/container.xml
  const container = await readEntry("META-INF/container.xml");
  const rootfileTag = container?.match(/<rootfile\s[\s\S]*?>/)?.[0];
  const opfPathRaw = rootfileTag ? attr(rootfileTag, "full-path") : undefined;
  if (!opfPathRaw) throw new Error("Invalid EPUB: missing container.xml/OPF");
  const opfPath = decodeURIComponent(opfPathRaw);

  const opf = await readEntry(opfPath);
  if (!opf) throw new Error(`Invalid EPUB: OPF not found at ${opfPath}`);
  const opfDir = path.posix.dirname(opfPath);

  // 2. Map manifest ids → hrefs, then walk the spine in reading order
  const manifest = new Map<string, string>();
  for (const m of opf.matchAll(/<item\s[\s\S]*?>/g)) {
    const id = attr(m[0], "id");
    const href = attr(m[0], "href");
    if (id && href) manifest.set(id, href);
  }
  const spineIds = [...opf.matchAll(/<itemref\s[\s\S]*?>/g)]
    .map((m) => attr(m[0], "idref"))
    .filter((id): id is string => Boolean(id));

  const parts: string[] = [];
  for (const id of spineIds) {
    const href = manifest.get(id);
    if (!href) continue;
    const decoded = decodeURIComponent(href);
    const entryPath =
      opfDir === "." ? decoded : path.posix.join(opfDir, decoded);
    const html = await readEntry(entryPath);
    if (html) parts.push(htmlToText(html));
  }

  if (parts.length === 0) throw new Error("EPUB contained no readable content");
  return parts.join("\n\n");
}

const COVER_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
const COVER_MAX_BYTES = 10_000_000;

/**
 * Extract the cover image from an EPUB, if present.
 * Looks for a manifest item with properties="cover-image" (EPUB 3),
 * then a <meta name="cover" content="…"> pointing at a manifest id (EPUB 2).
 */
export async function extractEpubCover(
  filePath: string,
): Promise<{ data: Buffer; ext: string } | null> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await fs.readFile(filePath));
  if (Object.keys(zip.files).length > EPUB_MAX_ENTRIES) return null;

  const container = await zip.file("META-INF/container.xml")?.async("string");
  const rootfileTag = container?.match(/<rootfile\s[\s\S]*?>/)?.[0];
  const opfPathRaw = rootfileTag ? attr(rootfileTag, "full-path") : undefined;
  if (!opfPathRaw) return null;
  const opfPath = decodeURIComponent(opfPathRaw);
  const opf = await zip.file(opfPath)?.async("string");
  if (!opf) return null;
  const opfDir = path.posix.dirname(opfPath);

  const items = [...opf.matchAll(/<item\s[\s\S]*?>/g)].map((m) => m[0]);

  // EPUB 3: <item properties="cover-image" …>
  let href = items
    .filter((t) => /cover-image/.test(attr(t, "properties") ?? ""))
    .map((t) => attr(t, "href"))
    .find(Boolean);

  // EPUB 2: <meta name="cover" content="cover-id"/>
  if (!href) {
    const metaTag = items.length >= 0
      ? [...opf.matchAll(/<meta\s[\s\S]*?>/g)]
          .map((m) => m[0])
          .find((t) => attr(t, "name") === "cover")
      : undefined;
    const coverId = metaTag ? attr(metaTag, "content") : undefined;
    if (coverId) {
      const item = items.find((t) => attr(t, "id") === coverId);
      href = item ? attr(item, "href") : undefined;
    }
  }

  // Fallback: any image whose id or href mentions "cover"
  if (!href) {
    const item = items.find(
      (t) =>
        /image\//.test(attr(t, "media-type") ?? "") &&
        /cover/i.test(`${attr(t, "id") ?? ""} ${attr(t, "href") ?? ""}`),
    );
    href = item ? attr(item, "href") : undefined;
  }

  if (!href) return null;
  const decoded = decodeURIComponent(href);
  const entryPath = opfDir === "." ? decoded : path.posix.join(opfDir, decoded);
  const ext = path.posix.extname(entryPath).toLowerCase();
  if (!COVER_MIME[ext]) return null;

  const data = await zip.file(entryPath)?.async("nodebuffer");
  if (!data || data.length === 0 || data.length > COVER_MAX_BYTES) return null;
  return { data, ext };
}

/** Extract raw text from a PDF, EPUB, DOCX, or plain-text file. */
export async function extractText(
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

  if (ext === ".epub") {
    const text = await extractEpubText(filePath);
    return { text, pages: new Map([[0, 1]]) };
  }

  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return { text: result.value, pages: new Map([[0, 1]]) };
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
export async function ingestBook(
  bookId: number,
  opts: { detectMetadata?: boolean } = {},
): Promise<void> {
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

    // 1b. Auto-detect metadata (bulk uploads) — file metadata first, then LLM
    if (opts.detectMetadata) {
      const meta = await detectBookMetadata(book.filePath, text);
      const updates: Partial<typeof booksTable.$inferInsert> = {};
      if (meta.title) updates.title = meta.title;
      if (meta.author) updates.author = meta.author;
      if (meta.publishedYear) updates.publishedYear = meta.publishedYear;
      if (meta.description) updates.description = meta.description;
      // Never leave the placeholder author if detection came up empty
      if (!meta.author && book.author === "Detecting…") {
        updates.author = "Unknown";
      }
      if (Object.keys(updates).length > 0) {
        await db
          .update(booksTable)
          .set(updates)
          .where(eq(booksTable.id, bookId));
        logger.info({ bookId, ...updates }, "Auto-detected book metadata");
      } else {
        logger.warn({ bookId }, "Metadata auto-detection found nothing");
      }
    }

    // 1c. Extract cover image (EPUB only, best-effort)
    if (path.extname(book.filePath).toLowerCase() === ".epub") {
      try {
        const cover = await extractEpubCover(book.filePath);
        if (cover) {
          const booksDir = process.env.BOOKS_DIR ?? "./books";
          const coversDir = path.join(booksDir, "covers");
          await fs.mkdir(coversDir, { recursive: true });
          const coverPath = path.join(coversDir, `book-${bookId}${cover.ext}`);
          await fs.writeFile(coverPath, cover.data);
          await db
            .update(booksTable)
            .set({ coverPath })
            .where(eq(booksTable.id, bookId));
          logger.info({ bookId, coverPath }, "Cover image extracted");
        }
      } catch (err) {
        logger.warn({ bookId, err }, "Cover extraction failed (non-fatal)");
      }
    }

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
