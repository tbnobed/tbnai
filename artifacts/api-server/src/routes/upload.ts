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
import { getAuth } from "@clerk/express";
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
  "application/octet-stream", // fallback some browsers use for PDFs
]);
const ALLOWED_EXT = new Set([".pdf", ".txt", ".text"]);

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
      cb(new Error(`Unsupported file type: ${file.mimetype}. Upload PDF or plain text files.`));
    }
  },
});

router.post(
  "/books/upload",
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
      res.status(400).json({ error: "No file uploaded. Send a PDF or text file in the 'file' field." });
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

// Global multer error handler for this router
router.use((err: any, _req: any, res: any, _next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.` });
      return;
    }
  }
  res.status(400).json({ error: err.message ?? "Upload failed." });
});

export default router;
