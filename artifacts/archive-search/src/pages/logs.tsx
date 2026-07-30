import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useListAdminLogs } from "@workspace/api-client-react";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Search,
  User,
  Bot,
  X,
} from "lucide-react";

const PAGE_SIZE = 25;

export default function LogsPage() {
  // Draft filter state (edited freely), applied on submit
  const [qDraft, setQDraft] = useState("");
  const [userIdDraft, setUserIdDraft] = useState("");

  // Applied filters
  const [q, setQ] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);

  const params: Record<string, unknown> = {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };
  if (q) params.q = q;
  if (userId) params.userId = userId;
  if (role !== "all") params.role = role;
  // UTC calendar-day bounds, consistent on both ends
  if (from) params.from = `${from}T00:00:00.000Z`;
  if (to) params.to = `${to}T23:59:59.999Z`;

  const logsQuery = useListAdminLogs(params);
  const entries = logsQuery.data?.entries ?? [];
  const total = logsQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const applyFilters = (e?: React.FormEvent) => {
    e?.preventDefault();
    setQ(qDraft.trim());
    setUserId(userIdDraft.trim());
    setPage(0);
  };

  const clearFilters = () => {
    setQDraft("");
    setUserIdDraft("");
    setQ("");
    setUserId("");
    setRole("all");
    setFrom("");
    setTo("");
    setPage(0);
  };

  const hasFilters = q || userId || role !== "all" || from || to;

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
          Activity Logs
        </h1>
        <p className="text-muted-foreground mb-8">
          Full record of every question and answer across all users and
          conversations.
        </p>

        {/* Filters */}
        <form
          onSubmit={applyFilters}
          className="bg-card border border-card-border rounded-lg p-4 mb-6 grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
        >
          <div className="md:col-span-4">
            <Label htmlFor="log-search" className="text-xs">
              Search text
            </Label>
            <Input
              id="log-search"
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              placeholder="Search messages…"
              data-testid="input-log-search"
            />
          </div>
          <div className="md:col-span-3">
            <Label htmlFor="log-user" className="text-xs">
              User ID
            </Label>
            <Input
              id="log-user"
              value={userIdDraft}
              onChange={(e) => setUserIdDraft(e.target.value)}
              placeholder="user_…"
              data-testid="input-log-user"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Type</Label>
            <Select
              value={role}
              onValueChange={(v) => {
                setRole(v);
                setPage(0);
              }}
            >
              <SelectTrigger data-testid="select-log-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="user">Questions</SelectItem>
                <SelectItem value="assistant">Answers</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-3 grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="log-from" className="text-xs">
                From
              </Label>
              <Input
                id="log-from"
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(0);
                }}
                data-testid="input-log-from"
              />
            </div>
            <div>
              <Label htmlFor="log-to" className="text-xs">
                To
              </Label>
              <Input
                id="log-to"
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(0);
                }}
                data-testid="input-log-to"
              />
            </div>
          </div>
          <div className="md:col-span-12 flex gap-2">
            <Button type="submit" size="sm" data-testid="button-apply-filters">
              <Search className="w-4 h-4 mr-2" />
              Apply
            </Button>
            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                data-testid="button-clear-filters"
              >
                <X className="w-4 h-4 mr-2" />
                Clear filters
              </Button>
            )}
          </div>
        </form>

        {/* Results */}
        {logsQuery.isLoading ? (
          <div className="bg-card border border-card-border rounded-lg p-12 text-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-card border border-card-border rounded-lg p-12 text-center text-muted-foreground">
            No log entries{hasFilters ? " match these filters" : " yet"}.
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="bg-card border border-card-border rounded-lg p-4"
                data-testid={`log-entry-${entry.id}`}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 text-xs text-muted-foreground">
                  <Badge
                    variant={entry.role === "user" ? "default" : "secondary"}
                    className="gap-1"
                  >
                    {entry.role === "user" ? (
                      <User className="w-3 h-3" />
                    ) : (
                      <Bot className="w-3 h-3" />
                    )}
                    {entry.role === "user" ? "Question" : "Answer"}
                  </Badge>
                  <span className="font-medium text-foreground">
                    {entry.conversationTitle}
                  </span>
                  <span>·</span>
                  <span className="font-mono">{entry.userId}</span>
                  <span>·</span>
                  <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  {entry.role === "assistant" && entry.citationCount > 0 && (
                    <>
                      <span>·</span>
                      <span>
                        {entry.citationCount} citation
                        {entry.citationCount === 1 ? "" : "s"}
                      </span>
                    </>
                  )}
                </div>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap line-clamp-4">
                  {entry.content}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between mt-6">
            <p className="text-sm text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–
              {Math.min((page + 1) * PAGE_SIZE, total)} of {total} entries
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0 || logsQuery.isFetching}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground px-2">
                Page {page + 1} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= pageCount || logsQuery.isFetching}
                onClick={() => setPage((p) => p + 1)}
                data-testid="button-next-page"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
