import { AppShell } from "@/components/app-shell";
import { useListSearchHistory } from "@workspace/api-client-react";
import { Clock, BookOpen } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function HistoryPage() {
  const { data, isLoading } = useListSearchHistory();

  const results = data?.results || [];

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="font-serif text-4xl font-bold text-foreground mb-3">Search History</h1>
          <p className="text-muted-foreground">
            Your past searches and their answers. Click any result to view the full answer and citations.
          </p>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading history...</div>
        ) : results.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-serif text-xl font-semibold text-foreground mb-2">No search history</h3>
            <p className="text-muted-foreground">Your searches will appear here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {results.map((result) => (
              <div
                key={result.id}
                className="bg-card border border-card-border rounded-lg p-6"
                data-testid={`history-${result.id}`}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-serif text-lg font-semibold text-foreground mb-1.5">
                      {result.queryText}
                    </h3>
                    <p className="text-muted-foreground text-sm flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDistanceToNow(new Date(result.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  {result.citations.length > 0 && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-shrink-0">
                      <BookOpen className="w-4 h-4" />
                      {result.citations.length} citation{result.citations.length !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>

                <div className="bg-muted/30 rounded-md p-4 mb-3">
                  <p className="text-foreground leading-relaxed line-clamp-3">{result.answer}</p>
                </div>

                {result.citations.length > 0 && (
                  <div className="space-y-2">
                    {result.citations.slice(0, 2).map((citation, idx) => (
                      <div
                        key={idx}
                        className="text-sm text-muted-foreground border-l-2 border-primary/30 pl-3"
                      >
                        <span className="font-medium text-foreground">{citation.bookTitle}</span>
                        {" by "}
                        {citation.author}
                        {citation.chapterTitle && ` • ${citation.chapterTitle}`}
                      </div>
                    ))}
                    {result.citations.length > 2 && (
                      <p className="text-sm text-muted-foreground pl-3">
                        +{result.citations.length - 2} more citation{result.citations.length - 2 !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
