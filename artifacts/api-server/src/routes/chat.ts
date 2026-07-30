import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { desc, eq, and, asc } from "drizzle-orm";
import { db, conversationsTable, messagesTable } from "@workspace/db";
import {
  SubmitChatMessageBody,
  GetConversationParams,
  DeleteConversationParams,
} from "@workspace/api-zod";
import {
  embedText,
  retrieveRelevantChunks,
  generateChatAnswer,
  type ChatHistoryMessage,
} from "../lib/rag";

const router: IRouter = Router();

/** How many prior user turns to blend into the retrieval query so follow-ups
 * like "what about his later work?" retrieve the right passages. */
const RETRIEVAL_CONTEXT_TURNS = 2;

/** POST /chat — conversational RAG */
router.post("/chat", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = SubmitChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { conversationId, message } = parsed.data;

  // Resolve or create the conversation
  let conversation;
  if (conversationId != null) {
    [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, conversationId),
          eq(conversationsTable.userId, auth.userId),
        ),
      );
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
  } else {
    [conversation] = await db
      .insert(conversationsTable)
      .values({
        userId: auth.userId,
        title: message.length > 80 ? message.slice(0, 77) + "…" : message,
      })
      .returning();
    if (!conversation) {
      res.status(500).json({ error: "Failed to create conversation" });
      return;
    }
  }

  // Full prior history, oldest first
  const priorMessages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversation.id))
    .orderBy(asc(messagesTable.createdAt), asc(messagesTable.id));

  const history: ChatHistoryMessage[] = priorMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  req.log.info(
    {
      conversationId: conversation.id,
      historyLength: history.length,
      userId: auth.userId,
    },
    "Chat message received",
  );

  // Blend recent turns into the retrieval query so follow-up questions
  // ("what about that author's other books?") retrieve relevant passages.
  // Includes the last assistant answer so entities it introduced are
  // represented in the embedding.
  const recentUserTurns = priorMessages
    .filter((m) => m.role === "user")
    .slice(-RETRIEVAL_CONTEXT_TURNS)
    .map((m) => m.content);
  const lastAssistant = [...priorMessages]
    .reverse()
    .find((m) => m.role === "assistant");
  const retrievalQuery = [
    ...recentUserTurns,
    lastAssistant ? lastAssistant.content.slice(0, 1000) : null,
    message,
  ]
    .filter(Boolean)
    .join("\n");

  const queryEmbedding = await embedText(retrievalQuery);
  const chunks = await retrieveRelevantChunks(queryEmbedding);
  const { answer, citations } = await generateChatAnswer(
    history,
    message,
    chunks,
  );

  // Save the user/assistant pair and touch the conversation atomically so a
  // failure can't leave an unmatched turn.
  const { savedUser, savedAssistant } = await db.transaction(async (tx) => {
    const [savedUser] = await tx
      .insert(messagesTable)
      .values({
        conversationId: conversation.id,
        role: "user",
        content: message,
        citations: null,
      })
      .returning();

    const [savedAssistant] = await tx
      .insert(messagesTable)
      .values({
        conversationId: conversation.id,
        role: "assistant",
        content: answer,
        citations,
      })
      .returning();

    await tx
      .update(conversationsTable)
      .set({ updatedAt: new Date() })
      .where(eq(conversationsTable.id, conversation.id));

    return { savedUser, savedAssistant };
  });

  if (!savedUser || !savedAssistant) {
    res.status(500).json({ error: "Failed to save messages" });
    return;
  }

  res.json({
    conversationId: conversation.id,
    userMessage: serializeMessage(savedUser),
    assistantMessage: serializeMessage(savedAssistant),
  });
});

/** GET /chat/conversations — current user's conversations, most recent first */
router.get("/chat/conversations", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const conversations = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.userId, auth.userId))
    .orderBy(desc(conversationsTable.updatedAt))
    .limit(50);

  res.json(
    conversations.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  );
});

/** GET /chat/conversations/:id — conversation with all messages */
router.get("/chat/conversations/:id", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = GetConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, params.data.id),
        eq(conversationsTable.userId, auth.userId),
      ),
    );

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversation.id))
    .orderBy(asc(messagesTable.createdAt), asc(messagesTable.id));

  res.json({
    conversation: {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    },
    messages: messages.map(serializeMessage),
  });
});

/** DELETE /chat/conversations/:id */
router.delete("/chat/conversations/:id", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = DeleteConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, params.data.id),
        eq(conversationsTable.userId, auth.userId),
      ),
    );

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  await db
    .delete(messagesTable)
    .where(eq(messagesTable.conversationId, conversation.id));
  await db
    .delete(conversationsTable)
    .where(eq(conversationsTable.id, conversation.id));

  res.status(204).end();
});

function serializeMessage(m: {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  citations: unknown;
  createdAt: Date;
}) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    role: m.role,
    content: m.content,
    citations: m.citations ?? null,
    createdAt: m.createdAt,
  };
}

export default router;
