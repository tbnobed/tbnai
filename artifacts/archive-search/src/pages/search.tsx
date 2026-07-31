import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useSubmitChatMessage,
  useListConversations,
  useGetConversation,
  useDeleteConversation,
  useListBooks,
  getListConversationsQueryKey,
  getGetConversationQueryKey,
  type ChatMessage,
  type Citation,
} from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Loader2,
  BookOpen,
  FileText,
  Plus,
  MessageSquare,
  Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SearchPage() {
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [bookId, setBookId] = useState<number | null>(null);
  // Local optimistic message list for the active conversation
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(
    null,
  );

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const submitChat = useSubmitChatMessage();
  const deleteConversation = useDeleteConversation();
  const conversationsQuery = useListConversations();
  const booksQuery = useListBooks({ status: "ready", limit: 100 });
  const conversationQuery = useGetConversation(conversationId ?? 0, {
    query: {
      enabled: conversationId != null,
      queryKey: getGetConversationQueryKey(conversationId ?? 0),
    },
  });

  const messages: ChatMessage[] =
    conversationId != null ? (conversationQuery.data?.messages ?? []) : [];

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, pendingUserMessage, submitChat.isPending]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const message = input.trim();
    if (!message || submitChat.isPending) return;

    setInput("");
    setPendingUserMessage(message);

    submitChat.mutate(
      { data: { conversationId, message, bookId } },
      {
        onSuccess: (data) => {
          // Seed the cache with the new message pair so nothing flickers
          // while the refetch happens in the background.
          queryClient.setQueryData(
            getGetConversationQueryKey(data.conversationId),
            (prev: { conversation: unknown; messages: ChatMessage[] } | undefined) =>
              prev
                ? {
                    ...prev,
                    messages: [
                      ...prev.messages,
                      data.userMessage,
                      data.assistantMessage,
                    ],
                  }
                : prev,
          );
          setPendingUserMessage(null);
          setConversationId(data.conversationId);
          queryClient.invalidateQueries({
            queryKey: getGetConversationQueryKey(data.conversationId),
          });
          queryClient.invalidateQueries({
            queryKey: getListConversationsQueryKey(),
          });
        },
        onError: () => {
          setPendingUserMessage(null);
          setInput(message);
          toast({
            variant: "destructive",
            title: "Message failed",
            description: "An error occurred. Please try again.",
          });
        },
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const startNewConversation = () => {
    setConversationId(null);
    setPendingUserMessage(null);
    setInput("");
  };

  const handleDelete = (id: number) => {
    deleteConversation.mutate(
      { id },
      {
        onSuccess: () => {
          if (conversationId === id) startNewConversation();
          queryClient.invalidateQueries({
            queryKey: getListConversationsQueryKey(),
          });
        },
      },
    );
  };

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-0px)] max-h-screen">
        {/* Conversation list */}
        <aside className="hidden md:flex w-64 flex-col border-r border-border bg-sidebar">
          <div className="p-3">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={startNewConversation}
              data-testid="button-new-conversation"
            >
              <Plus className="w-4 h-4 mr-2" />
              New conversation
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
            {(conversationsQuery.data ?? []).map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer text-sm ${
                  c.id === conversationId
                    ? "bg-accent/10 text-foreground"
                    : "text-muted-foreground hover:bg-accent/5"
                }`}
                onClick={() => {
                  setConversationId(c.id);
                  setPendingUserMessage(null);
                }}
                data-testid={`conversation-${c.id}`}
              >
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 truncate">{c.title}</span>
                <button
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(c.id);
                  }}
                  aria-label="Delete conversation"
                  data-testid={`button-delete-conversation-${c.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Chat pane */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
              {messages.length === 0 && !pendingUserMessage && (
                <div className="text-center pt-24">
                  <h1 className="font-serif text-3xl font-bold text-foreground mb-3">
                    Ask the Archive
                  </h1>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Ask a question in plain English, then follow up
                    conversationally. Every answer is grounded in the book
                    archive with citations.
                  </p>
                </div>
              )}

              {messages.map((m) =>
                m.role === "user" ? (
                  <UserBubble key={m.id} content={m.content} />
                ) : (
                  <AssistantBubble
                    key={m.id}
                    content={m.content}
                    citations={m.citations ?? []}
                  />
                ),
              )}

              {pendingUserMessage && (
                <UserBubble content={pendingUserMessage} />
              )}
              {submitChat.isPending && (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Searching the archive…</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Composer */}
          <div className="border-t border-border bg-background">
            <div className="max-w-3xl mx-auto px-6 pt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground flex-shrink-0">
                Search in
              </span>
              <Select
                value={bookId == null ? "all" : String(bookId)}
                onValueChange={(v) => setBookId(v === "all" ? null : Number(v))}
              >
                <SelectTrigger
                  className="h-8 w-auto max-w-xs text-xs"
                  data-testid="select-book-scope"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All books</SelectItem>
                  {(booksQuery.data?.books ?? []).map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <form
              onSubmit={handleSubmit}
              className="max-w-3xl mx-auto px-6 py-4 flex items-end gap-3"
            >
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  conversationId == null
                    ? "Ask a question about the archive…"
                    : "Ask a follow-up…"
                }
                className="min-h-[52px] max-h-40 resize-none flex-1"
                rows={1}
                data-testid="input-chat-message"
              />
              <Button
                type="submit"
                size="icon"
                className="h-[52px] w-[52px] flex-shrink-0"
                disabled={!input.trim() || submitChat.isPending}
                data-testid="button-send-message"
              >
                {submitChat.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-lg bg-primary text-primary-foreground px-4 py-3 whitespace-pre-wrap leading-relaxed">
        {content}
      </div>
    </div>
  );
}

function AssistantBubble({
  content,
  citations,
}: {
  content: string;
  citations: Citation[];
}) {
  return (
    <div className="space-y-3">
      <div className="bg-card border border-card-border rounded-lg px-5 py-4">
        <p className="text-foreground leading-relaxed whitespace-pre-wrap">
          {content}
        </p>
      </div>
      {citations.length > 0 && (
        <div className="space-y-2">
          {citations.map((citation, idx) => (
            <div
              key={idx}
              className="bg-card border border-card-border rounded-lg p-4"
              data-testid={`citation-${idx}`}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-serif text-base font-semibold text-foreground">
                    {citation.bookTitle}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mb-2">
                    <span>{citation.author}</span>
                    {citation.chapterTitle && (
                      <span>{citation.chapterTitle}</span>
                    )}
                    {(citation.pageStart || citation.pageEnd) && (
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {citation.pageStart === citation.pageEnd
                          ? `p. ${citation.pageStart}`
                          : `pp. ${citation.pageStart}–${citation.pageEnd}`}
                      </span>
                    )}
                    <span className="text-primary font-medium">
                      {Math.round(citation.relevanceScore * 100)}% relevance
                    </span>
                  </div>
                  <blockquote className="border-l-2 border-primary/30 pl-3 text-sm text-foreground/90 italic leading-relaxed">
                    "{citation.excerpt}"
                  </blockquote>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
