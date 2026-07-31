/**
 * Book metadata auto-detection, used by the ingest pipeline for bulk uploads.
 *
 * Two layers:
 *  1. Native metadata embedded in the file (PDF info dict, EPUB OPF dc:*
 *     elements, DOCX core properties).
 *  2. LLM extraction from the opening pages of the text, used to fill any
 *     fields the file itself didn't provide.
 */
import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { logger } from "./logger";

const CHAT_MODEL = process.env.CHAT_MODEL ?? "gpt-oss-120b";

export interface DetectedMetadata {
  title: string | null;
  author: string | null;
  publishedYear: number | null;
  description: string | null;
}

const EMPTY: DetectedMetadata = {
  title: null,
  author: null,
  publishedYear: null,
  description: null,
};

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.replace(/\s+/g, " ").trim();
  if (!s || s.length > 300) return null;
  // Skip junk values like "untitled", "unknown", tool names
  if (/^(untitled|unknown|microsoft word|admin|user)/i.test(s)) return null;
  return s;
}

function cleanYear(value: unknown): number | null {
  const m = String(value ?? "").match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  if (!m) return null;
  const year = parseInt(m[1]!, 10);
  return year >= 1500 && year <= new Date().getFullYear() ? year : null;
}

/** Decode the handful of XML entities that show up in metadata fields. */
function xmlDecode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
}

function xmlTag(xml: string, tag: string): string | null {
  const m = xml.match(
    new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`),
  );
  return m?.[1] ? cleanString(xmlDecode(m[1])) : null;
}

/** Metadata embedded in the file itself. */
async function extractNativeMetadata(
  filePath: string,
): Promise<DetectedMetadata> {
  const ext = path.extname(filePath).toLowerCase();

  try {
    if (ext === ".pdf") {
      const pdfMod = await import("pdf-parse");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParse: any = (pdfMod as any).default ?? pdfMod;
      const data = await pdfParse(await fs.readFile(filePath));
      const info = data.info ?? {};
      return {
        title: cleanString(info.Title),
        author: cleanString(info.Author),
        publishedYear: cleanYear(info.CreationDate),
        description: cleanString(info.Subject),
      };
    }

    if (ext === ".epub") {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(await fs.readFile(filePath));
      const container = await zip
        .file("META-INF/container.xml")
        ?.async("string");
      const opfPath = container?.match(
        /full-path\s*=\s*(?:"([^"]+)"|'([^']+)')/,
      );
      const resolved = opfPath?.[1] ?? opfPath?.[2];
      if (!resolved) return EMPTY;
      const opf = await zip.file(decodeURIComponent(resolved))?.async("string");
      if (!opf) return EMPTY;
      return {
        title: xmlTag(opf, "title"),
        author: xmlTag(opf, "creator"),
        publishedYear: cleanYear(xmlTag(opf, "date")),
        description: xmlTag(opf, "description"),
      };
    }

    if (ext === ".docx") {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(await fs.readFile(filePath));
      const core = await zip.file("docProps/core.xml")?.async("string");
      if (!core) return EMPTY;
      return {
        title: xmlTag(core, "title"),
        author: xmlTag(core, "creator"),
        publishedYear: cleanYear(xmlTag(core, "created")),
        description: xmlTag(core, "description"),
      };
    }
  } catch (err) {
    logger.warn({ err, filePath }, "Native metadata extraction failed");
  }

  return EMPTY;
}

/** Ask the LLM to identify the book from its opening pages. */
async function detectMetadataWithLLM(
  text: string,
): Promise<DetectedMetadata> {
  if (!process.env.OPENAI_BASE_URL) return EMPTY;

  const client = new OpenAI({
    baseURL: process.env.OPENAI_BASE_URL,
    apiKey: process.env.OPENAI_API_KEY ?? "local",
  });

  const excerpt = text.slice(0, 8000);

  try {
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You identify books from their opening pages (cover, title page, copyright page, introduction). " +
            "Respond ONLY with a JSON object: " +
            '{"title": string|null, "author": string|null, "publishedYear": number|null, "description": string|null}. ' +
            "title: the book's full title. author: the primary author(s). " +
            "publishedYear: original or copyright publication year. " +
            "description: one or two sentences summarizing what the book is about, based only on the excerpt. " +
            "Use null for anything you cannot determine confidently. No other text.",
        },
        {
          role: "user",
          content: `Opening pages of the book:\n\n${excerpt}`,
        },
      ],
      temperature: 0,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return EMPTY;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      title: cleanString(parsed.title),
      author: cleanString(parsed.author),
      publishedYear: cleanYear(parsed.publishedYear),
      description:
        typeof parsed.description === "string" &&
        parsed.description.trim().length > 0
          ? parsed.description.trim().slice(0, 1000)
          : null,
    };
  } catch (err) {
    logger.warn({ err }, "LLM metadata detection failed");
    return EMPTY;
  }
}

/**
 * Detect book metadata: native file metadata first, LLM fills the gaps.
 * `text` is the already-extracted full text (only the start is used).
 */
export async function detectBookMetadata(
  filePath: string,
  text: string,
): Promise<DetectedMetadata> {
  const native = await extractNativeMetadata(filePath);

  const missing =
    !native.title || !native.author || !native.publishedYear || !native.description;
  const llm = missing ? await detectMetadataWithLLM(text) : EMPTY;

  return {
    title: native.title ?? llm.title,
    author: native.author ?? llm.author,
    publishedYear: native.publishedYear ?? llm.publishedYear,
    description: native.description ?? llm.description,
  };
}
