/**
 * GET /admin/logs — full paginated activity log of all chat transactions
 * across every user and conversation, with filtering and free-text search.
 */
import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { desc, eq, and, gte, lte, or, ilike, count, type SQL } from "drizzle-orm";
import { db, conversationsTable, messagesTable } from "@workspace/db";
import { ListAdminLogsQueryParams } from "@workspace/api-zod";
import { isAdminUser } from "../lib/admin";

const router: IRouter = Router();

/** GET /admin/me — whether the current user is an admin (used by the UI) */
router.get("/admin/me", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({ isAdmin: await isAdminUser(auth.userId) });
});

router.get("/admin/logs", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await isAdminUser(auth.userId))) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const parsed = ListAdminLogsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { q, userId, role, from, to } = parsed.data;
  const limit = Math.min(Math.max(Math.trunc(parsed.data.limit ?? 25), 1), 100);
  const offset = Math.max(Math.trunc(parsed.data.offset ?? 0), 0);

  const conditions: SQL[] = [];
  if (userId) conditions.push(eq(conversationsTable.userId, userId));
  if (role === "user" || role === "assistant")
    conditions.push(eq(messagesTable.role, role));
  if (from) {
    const fromDate = new Date(from);
    if (isNaN(fromDate.getTime())) {
      res.status(400).json({ error: "Invalid 'from' date" });
      return;
    }
    conditions.push(gte(messagesTable.createdAt, fromDate));
  }
  if (to) {
    const toDate = new Date(to);
    if (isNaN(toDate.getTime())) {
      res.status(400).json({ error: "Invalid 'to' date" });
      return;
    }
    conditions.push(lte(messagesTable.createdAt, toDate));
  }
  if (q && q.trim()) {
    const pattern = `%${q.trim().replace(/[%_\\]/g, "\\$&")}%`;
    const textMatch = or(
      ilike(messagesTable.content, pattern),
      ilike(conversationsTable.title, pattern),
    );
    if (textMatch) conditions.push(textMatch);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalResult] = await Promise.all([
    db
      .select({
        id: messagesTable.id,
        conversationId: messagesTable.conversationId,
        conversationTitle: conversationsTable.title,
        userId: conversationsTable.userId,
        role: messagesTable.role,
        content: messagesTable.content,
        citations: messagesTable.citations,
        createdAt: messagesTable.createdAt,
      })
      .from(messagesTable)
      .innerJoin(
        conversationsTable,
        eq(messagesTable.conversationId, conversationsTable.id),
      )
      .where(where)
      .orderBy(desc(messagesTable.createdAt), desc(messagesTable.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(messagesTable)
      .innerJoin(
        conversationsTable,
        eq(messagesTable.conversationId, conversationsTable.id),
      )
      .where(where),
  ]);

  res.json({
    entries: rows.map((r) => ({
      id: r.id,
      conversationId: r.conversationId,
      conversationTitle: r.conversationTitle,
      userId: r.userId,
      role: r.role,
      content: r.content,
      citationCount: Array.isArray(r.citations) ? r.citations.length : 0,
      createdAt: r.createdAt,
    })),
    total: totalResult[0]?.count ?? 0,
  });
});

export default router;
