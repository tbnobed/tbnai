import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  customType,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { booksTable } from "./books";

// pgvector column — dimensions must match the embedding model's output size.
// Default 1536 (OpenAI text-embedding-3-small). Override EMBEDDING_DIMENSIONS
// env var if your local model produces a different size.
export const EMBEDDING_DIMENSIONS = parseInt(
  process.env.EMBEDDING_DIMENSIONS ?? "1536",
  10,
);

export const vectorColumn = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? EMBEDDING_DIMENSIONS})`;
  },
  fromDriver(value: string): number[] {
    // pgvector returns strings like "[0.1,0.2,...]"
    return JSON.parse(value);
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
});

export const chunksTable = pgTable("chunks", {
  id: serial("id").primaryKey(),
  bookId: integer("book_id")
    .notNull()
    .references(() => booksTable.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  chapterTitle: text("chapter_title"),
  pageStart: integer("page_start"),
  pageEnd: integer("page_end"),
  embedding: vectorColumn("embedding", {
    dimensions: EMBEDDING_DIMENSIONS,
  }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertChunkSchema = createInsertSchema(chunksTable).omit({
  id: true,
  createdAt: true,
});
export type InsertChunk = z.infer<typeof insertChunkSchema>;
export type Chunk = typeof chunksTable.$inferSelect;
