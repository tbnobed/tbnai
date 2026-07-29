import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { desc, eq, count } from "drizzle-orm";
import { db, searchResultsTable } from "@workspace/db";
import {
  SubmitSearchBody,
  ListSearchHistoryQueryParams,
  ListRecentSearchesQueryParams,
  GetSearchResultParams,
} from "@workspace/api-zod";
import { embedText, retrieveRelevantChunks, generateAnswer } from "../lib/rag";

const router: IRouter = Router();

/** POST /search — RAG query */
router.post("/search", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = SubmitSearchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { query } = parsed.data;

  req.log.info({ query, userId: auth.userId }, "RAG search request");

  const queryEmbedding = await embedText(query);
  const chunks = await retrieveRelevantChunks(queryEmbedding);
  const { answer, citations } = await generateAnswer(query, chunks);

  const [saved] = await db
    .insert(searchResultsTable)
    .values({
      queryText: query,
      answer,
      citations,
      userId: auth.userId,
    })
    .returning();

  if (!saved) {
    res.status(500).json({ error: "Failed to save search result" });
    return;
  }

  res.json({
    id: saved.id,
    queryText: saved.queryText,
    answer: saved.answer,
    citations: saved.citations,
    userId: saved.userId,
    createdAt: saved.createdAt,
  });
});

/** GET /search/history — current user's search history */
router.get("/search/history", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const queryParams = ListSearchHistoryQueryParams.safeParse(req.query);
  const limit = queryParams.success ? queryParams.data.limit : 20;
  const offset = queryParams.success ? queryParams.data.offset : 0;

  const [results, totalResult] = await Promise.all([
    db
      .select()
      .from(searchResultsTable)
      .where(eq(searchResultsTable.userId, auth.userId))
      .orderBy(desc(searchResultsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(searchResultsTable)
      .where(eq(searchResultsTable.userId, auth.userId)),
  ]);

  res.json({
    results: results.map((r) => ({
      id: r.id,
      queryText: r.queryText,
      answer: r.answer,
      citations: r.citations,
      userId: r.userId,
      createdAt: r.createdAt,
    })),
    total: totalResult[0]?.count ?? 0,
  });
});

/** GET /search/recent — recent searches across all users (admin view) */
router.get("/search/recent", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const queryParams = ListRecentSearchesQueryParams.safeParse(req.query);
  const limit = queryParams.success ? queryParams.data.limit : 10;

  const results = await db
    .select()
    .from(searchResultsTable)
    .orderBy(desc(searchResultsTable.createdAt))
    .limit(limit);

  res.json(
    results.map((r) => ({
      id: r.id,
      queryText: r.queryText,
      answer: r.answer,
      citations: r.citations,
      userId: r.userId,
      createdAt: r.createdAt,
    })),
  );
});

/** GET /search/:id — single result */
router.get("/search/:id", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = GetSearchResultParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [result] = await db
    .select()
    .from(searchResultsTable)
    .where(eq(searchResultsTable.id, params.data.id));

  if (!result) {
    res.status(404).json({ error: "Search result not found" });
    return;
  }

  res.json({
    id: result.id,
    queryText: result.queryText,
    answer: result.answer,
    citations: result.citations,
    userId: result.userId,
    createdAt: result.createdAt,
  });
});

export default router;
