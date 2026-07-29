import {
  pgTable,
  text,
  serial,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface CitationRecord {
  bookId: number;
  bookTitle: string;
  author: string;
  chapterTitle: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  excerpt: string;
  relevanceScore: number;
}

export const searchResultsTable = pgTable("search_results", {
  id: serial("id").primaryKey(),
  queryText: text("query_text").notNull(),
  answer: text("answer").notNull(),
  citations: jsonb("citations").notNull().$type<CitationRecord[]>(),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSearchResultSchema = createInsertSchema(
  searchResultsTable,
).omit({ id: true, createdAt: true });
export type InsertSearchResult = z.infer<typeof insertSearchResultSchema>;
export type SearchResultRow = typeof searchResultsTable.$inferSelect;
