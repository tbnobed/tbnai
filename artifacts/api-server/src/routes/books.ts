import { Router, type IRouter } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { sessionAuth as getAuth } from "../lib/auth";
import { eq, count } from "drizzle-orm";
import { db, booksTable, chunksTable } from "@workspace/db";
import {
  ListBooksQueryParams,
  CreateBookBody,
  GetBookParams,
  UpdateBookParams,
  UpdateBookBody,
  DeleteBookParams,
  ReindexBookParams,
  ListBookChunksParams,
} from "@workspace/api-zod";
import { ingestBook } from "../lib/ingest";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

/** GET /books */
router.get("/books", requireAuth, async (req, res): Promise<void> => {
  const queryParams = ListBooksQueryParams.safeParse(req.query);
  const { status, limit = 50, offset = 0 } = queryParams.success
    ? queryParams.data
    : { status: undefined, limit: 50, offset: 0 };

  const query = db.select().from(booksTable);
  const countQuery = db.select({ count: count() }).from(booksTable);

  const [books, totalResult] = await Promise.all([
    status
      ? query.where(eq(booksTable.status, status)).limit(limit).offset(offset)
      : query.limit(limit).offset(offset),
    status
      ? countQuery.where(eq(booksTable.status, status))
      : countQuery,
  ]);

  res.json({ books, total: totalResult[0]?.count ?? 0 });
});

/** POST /books */
router.post("/books", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateBookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [book] = await db
    .insert(booksTable)
    .values({
      title: parsed.data.title,
      author: parsed.data.author,
      publishedYear: parsed.data.publishedYear ?? null,
      description: parsed.data.description ?? null,
      filePath: parsed.data.filePath,
      status: "pending",
    })
    .returning();

  if (!book) {
    res.status(500).json({ error: "Failed to create book" });
    return;
  }

  req.log.info({ bookId: book.id }, "Book registered, queuing ingest");

  // Fire-and-forget background ingest
  ingestBook(book.id).catch((err) => {
    req.log.error({ bookId: book.id, err }, "Background ingest failed");
  });

  res.status(201).json(book);
});

/** GET /books/:id */
router.get("/books/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetBookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [book] = await db
    .select()
    .from(booksTable)
    .where(eq(booksTable.id, params.data.id));

  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  res.json(book);
});

/** PATCH /books/:id */
router.patch("/books/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateBookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateBookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.title != null) updates.title = parsed.data.title;
  if (parsed.data.author != null) updates.author = parsed.data.author;
  if ("publishedYear" in parsed.data) updates.publishedYear = parsed.data.publishedYear;
  if ("description" in parsed.data) updates.description = parsed.data.description;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [book] = await db
    .update(booksTable)
    .set(updates)
    .where(eq(booksTable.id, params.data.id))
    .returning();

  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  res.json(book);
});

/** DELETE /books/:id */
router.delete("/books/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteBookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [book] = await db
    .delete(booksTable)
    .where(eq(booksTable.id, params.data.id))
    .returning();

  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  // Best-effort cleanup of the extracted cover file
  if (book.coverPath) {
    const coversDir = path.resolve(process.env.BOOKS_DIR ?? "./books", "covers");
    fs.unlink(path.join(coversDir, path.basename(book.coverPath))).catch(
      () => {},
    );
  }

  res.sendStatus(204);
});

/** POST /books/:id/reindex */
router.post(
  "/books/:id/reindex",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ReindexBookParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [book] = await db
      .select()
      .from(booksTable)
      .where(eq(booksTable.id, params.data.id));

    if (!book) {
      res.status(404).json({ error: "Book not found" });
      return;
    }

    req.log.info({ bookId: book.id }, "Reindex triggered");

    ingestBook(book.id).catch((err) => {
      req.log.error({ bookId: book.id, err }, "Reindex failed");
    });

    // Return immediately with status set to processing
    const [updated] = await db
      .update(booksTable)
      .set({ status: "processing" })
      .where(eq(booksTable.id, params.data.id))
      .returning();

    res.status(202).json(updated ?? book);
  },
);

/** GET /books/:id/chunks */
router.get(
  "/books/:id/chunks",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListBookChunksParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [book] = await db
      .select()
      .from(booksTable)
      .where(eq(booksTable.id, params.data.id));

    if (!book) {
      res.status(404).json({ error: "Book not found" });
      return;
    }

    const [chunks, totalResult] = await Promise.all([
      db
        .select({
          id: chunksTable.id,
          bookId: chunksTable.bookId,
          chunkIndex: chunksTable.chunkIndex,
          content: chunksTable.content,
          chapterTitle: chunksTable.chapterTitle,
          pageStart: chunksTable.pageStart,
          pageEnd: chunksTable.pageEnd,
          createdAt: chunksTable.createdAt,
        })
        .from(chunksTable)
        .where(eq(chunksTable.bookId, params.data.id))
        .orderBy(chunksTable.chunkIndex)
        .limit(100),
      db
        .select({ count: count() })
        .from(chunksTable)
        .where(eq(chunksTable.bookId, params.data.id)),
    ]);

    res.json({ chunks, total: totalResult[0]?.count ?? 0 });
  },
);

/** GET /books/:id/cover — serve the extracted cover image */
router.get(
  "/books/:id/cover",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetBookParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [book] = await db
      .select()
      .from(booksTable)
      .where(eq(booksTable.id, params.data.id));

    if (!book?.coverPath) {
      res.status(404).json({ error: "No cover" });
      return;
    }

    // Never serve the DB path directly — reconstruct it from the covers
    // directory + basename so a bad DB value can't reach arbitrary files.
    const coversDir = path.resolve(process.env.BOOKS_DIR ?? "./books", "covers");
    const safePath = path.join(coversDir, path.basename(book.coverPath));

    res.sendFile(safePath, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: "No cover" });
    });
  },
);

/** GET /books/:id/content — full text in reading order (reader view) */
router.get(
  "/books/:id/content",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetBookParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [book] = await db
      .select()
      .from(booksTable)
      .where(eq(booksTable.id, params.data.id));

    if (!book) {
      res.status(404).json({ error: "Book not found" });
      return;
    }

    const chunks = await db
      .select({
        chunkIndex: chunksTable.chunkIndex,
        chapterTitle: chunksTable.chapterTitle,
        content: chunksTable.content,
      })
      .from(chunksTable)
      .where(eq(chunksTable.bookId, params.data.id))
      .orderBy(chunksTable.chunkIndex);

    // Chunks overlap by INGEST_CHUNK_OVERLAP words for retrieval quality.
    // Strip the overlap only when it verifiably matches the tail of the
    // previous chunk, so a config change can't corrupt the reading text.
    const overlap = parseInt(process.env.INGEST_CHUNK_OVERLAP ?? "100", 10);
    const sections = chunks.map((c, i) => {
      let content = c.content;
      if (i > 0 && overlap > 0 && Number.isFinite(overlap)) {
        const words = c.content.split(/\s+/);
        const prevWords = chunks[i - 1]!.content.split(/\s+/);
        const prefix = words.slice(0, overlap).join(" ");
        const prevTail = prevWords.slice(-overlap).join(" ");
        if (words.length > overlap && prefix === prevTail) {
          content = words.slice(overlap).join(" ");
        }
      }
      return {
        chunkIndex: c.chunkIndex,
        chapterTitle: c.chapterTitle,
        content,
      };
    });

    res.json({ book, sections });
  },
);

export default router;
