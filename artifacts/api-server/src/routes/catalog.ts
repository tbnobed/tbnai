import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, count, sql } from "drizzle-orm";
import { db, booksTable, chunksTable, searchResultsTable } from "@workspace/db";

const router: IRouter = Router();

/** GET /catalog/stats */
router.get("/catalog/stats", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [statsRows, totalChunksResult, totalSearchesResult] = await Promise.all(
    [
      db
        .select({
          status: booksTable.status,
          count: count(),
        })
        .from(booksTable)
        .groupBy(booksTable.status),
      db.select({ count: count() }).from(chunksTable),
      db.select({ count: count() }).from(searchResultsTable),
    ],
  );

  const statsMap = Object.fromEntries(
    statsRows.map((r) => [r.status, r.count]),
  ) as Record<string, number>;

  const totalBooks = statsRows.reduce((s, r) => s + r.count, 0);

  res.json({
    totalBooks,
    booksReady: statsMap["ready"] ?? 0,
    booksProcessing: statsMap["processing"] ?? 0,
    booksError: statsMap["error"] ?? 0,
    totalChunks: totalChunksResult[0]?.count ?? 0,
    totalSearches: totalSearchesResult[0]?.count ?? 0,
  });
});

export default router;
