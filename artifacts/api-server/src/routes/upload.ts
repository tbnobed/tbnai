/**
 * POST /books/upload — multipart file upload endpoint.
 *
 * Accepts a PDF or plain-text file plus book metadata, saves the file to the
 * books volume (BOOKS_DIR env var, default /books), creates a book record,
 * and fires off background ingestion.
 *
 * All paths come from environment variables — no Replit hosting assumed.
 */
import path from "node:path";
import fs from "node:fs";
import { Router, type IRouter } from "express";
import multer from "multer";
import { sessionAuth as getAuth, requireAuth } from "../lib/auth";
import { db, booksTable } from "@workspace/db";
import { ingestBook } from "../lib/ingest";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// In Docker: BOOKS_DIR=/books (bind-mounted volume).
// In local dev: falls back to ./books relative to cwd.
const BOOKS_DIR = process.env.BOOKS_DIR ?? "./books";
const MAX_FILE_SIZE_MB = parseInt(process.env.UPLOAD_MAX_MB ?? "200", 10);
const ALLOWED_MIME = new Set([
  "application/pdf",
  "text/plain",
  "text/html",
  "application/epub+zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream", // fallback some browsers use for PDFs
]);
const ALLOWED_EXT = new Set([".pdf", ".txt", ".text", ".epub", ".docx"]);

// Ensure the books directory exists — non-fatal so a missing Docker volume
// doesn't crash the whole server on startup.
try {
  if (!fs.existsSync(BOOKS_DIR)) {
    fs.mkdirSync(BOOKS_DIR, { recursive: true });
  }
} catch (err) {
  console.warn(`[upload] Could not create books directory at ${BOOKS_DIR}:`, err);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, BOOKS_DIR),
  filename: (_req, file, cb) => {
    // Sanitize and deduplicate: title-slug_timestamp.ext
    const ext = path.extname(file.originalname).toLowerCase() || ".pdf";
    const base = path.basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    const ts = Date.now();
    cb(null, `${base}_${ts}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_MIME.has(file.mimetype) || ALLOWED_EXT.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Upload PDF, EPUB, DOCX, or plain text files.`));
    }
  },
});

router.post(
  "/books/upload",
  // Auth BEFORE multer — never write unauthenticated uploads to disk
  requireAuth,
  upload.single("file"),
  async (req, res): Promise<void> => {
    const auth = getAuth(req);
    if (!auth?.userId) {
      // Clean up uploaded file if auth fails
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No file uploaded. Send a PDF, EPUB, DOCX, or text file in the 'file' field." });
      return;
    }

    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const author = typeof req.body?.author === "string" ? req.body.author.trim() : "";

    if (!title) {
      fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: "Book title is required." });
      return;
    }
    if (!author) {
      fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: "Author name is required." });
      return;
    }

    const publishedYear = req.body?.publishedYear
      ? parseInt(req.body.publishedYear, 10)
      : null;
    const description = typeof req.body?.description === "string"
      ? req.body.description.trim() || null
      : null;

    const filePath = req.file.path; // absolute path inside container, e.g. /books/my-book_123.pdf

    logger.info(
      { title, author, filePath, size: req.file.size },
      "Book file uploaded, creating record",
    );

    const [book] = await db
      .insert(booksTable)
      .values({
        title,
        author,
        publishedYear: publishedYear || null,
        description,
        filePath,
        status: "pending",
      })
      .returning();

    if (!book) {
      fs.unlink(req.file.path, () => {});
      res.status(500).json({ error: "Failed to create book record." });
      return;
    }

    // Fire-and-forget ingestion
    ingestBook(book.id).catch((err) => {
      logger.error({ bookId: book.id, err }, "Background ingest failed after upload");
    });

    res.status(201).json(book);
  },
);

// ── Bulk upload — metadata is auto-detected during ingestion ────────────────
const MAX_BULK_FILES = parseInt(process.env.UPLOAD_MAX_BULK_FILES ?? "20", 10);

router.post(
  "/books/upload-bulk",
  requireAuth,
  upload.array("files", MAX_BULK_FILES),
  async (req, res): Promise<void> => {
    const files = (req.files ?? []) as Express.Multer.File[];
    if (files.length === 0) {
      res.status(400).json({
        error: "No files uploaded. Send one or more files in the 'files' field.",
      });
      return;
    }

    const created: (typeof booksTable.$inferSelect)[] = [];
    try {
      for (const file of files) {
        // Placeholder title from the filename — replaced by auto-detection
        const placeholder = path
          .basename(file.originalname, path.extname(file.originalname))
          .replace(/[-_]+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 200) || "Untitled";

        const [book] = await db
          .insert(booksTable)
          .values({
            title: placeholder,
            author: "Detecting…",
            filePath: file.path,
            status: "pending",
          })
          .returning();
        if (book) created.push(book);
        else fs.unlink(file.path, () => {});
      }
    } catch (err) {
      // DB failure mid-batch — remove every uploaded file that has no book
      // record so nothing is orphaned on the books volume.
      const kept = new Set(created.map((b) => b.filePath));
      for (const file of files) {
        if (!kept.has(file.path)) fs.unlink(file.path, () => {});
      }
      logger.error({ err }, "Bulk upload failed while creating book records");
      res.status(500).json({ error: "Failed to create book records." });
      return;
    }

    logger.info({ count: created.length }, "Bulk upload received");

    // Ingest sequentially in the background so we don't overload the
    // embedding/LLM backend with parallel jobs.
    void (async () => {
      for (const book of created) {
        try {
          await ingestBook(book.id, { detectMetadata: true });
        } catch (err) {
          logger.error({ bookId: book.id, err }, "Bulk ingest failed for book");
        }
      }
    })();

    res.status(201).json({ books: created });
  },
);

// Global multer error handler for this router
router.use((err: any, req: any, res: any, _next: any) => {
  // Remove any files multer already wrote before the error (e.g. an
  // oversized or rejected file later in a bulk batch).
  const written: Express.Multer.File[] = [
    ...(req.file ? [req.file] : []),
    ...(Array.isArray(req.files) ? req.files : []),
  ];
  for (const f of written) {
    if (f?.path) fs.unlink(f.path, () => {});
  }
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.` });
      return;
    }
  }
  res.status(400).json({ error: err.message ?? "Upload failed." });
});

export default router;
