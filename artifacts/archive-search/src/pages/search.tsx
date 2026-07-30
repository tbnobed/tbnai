import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitSearch } from "@workspace/api-client-react";
import { SearchResult } from "@workspace/api-client-react";
import { Search, Loader2, BookOpen, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const submitSearch = useSubmitSearch();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    submitSearch.mutate(
      { data: { query: query.trim() } },
      {
        onSuccess: (data) => {
          setResult(data);
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Search failed",
            description: "An error occurred while searching. Please try again.",
          });
        },
      }
    );
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Search input */}
        <div className="mb-12">
          <h1 className="font-serif text-4xl font-bold text-foreground mb-3">Search the Archive</h1>
          <p className="text-muted-foreground mb-8">
            Ask a question in plain English. The tool will search across all published books and return a synthesized answer with citations.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What theological themes appear in the discussion of covenant relationships?"
              className="min-h-[120px] text-base resize-none"
              data-testid="input-search-query"
            />
            <Button
              type="submit"
              disabled={!query.trim() || submitSearch.isPending}
              size="lg"
              className="w-full sm:w-auto"
              data-testid="button-submit-search"
            >
              {submitSearch.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5 mr-2" />
                  Search
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Results */}
        {submitSearch.isPending && (
          <div className="bg-card border border-card-border rounded-lg p-12 text-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Searching TBNStudios.ai...</p>
          </div>
        )}

        {result && !submitSearch.isPending && (
          <div className="space-y-8">
            {/* Answer */}
            <div className="bg-card border border-card-border rounded-lg p-8">
              <h2 className="font-serif text-2xl font-semibold text-foreground mb-4">Answer</h2>
              <div className="prose prose-lg max-w-none text-foreground leading-relaxed">
                <p>{result.answer}</p>
              </div>
            </div>

            {/* Citations */}
            {result.citations.length > 0 && (
              <div>
                <h2 className="font-serif text-2xl font-semibold text-foreground mb-4">
                  Citations ({result.citations.length})
                </h2>
                <div className="space-y-4">
                  {result.citations.map((citation, idx) => (
                    <div
                      key={idx}
                      className="bg-card border border-card-border rounded-lg p-6 hover:border-primary/30 transition-colors"
                      data-testid={`citation-${idx}`}
                    >
                      <div className="flex items-start gap-4 mb-3">
                        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <BookOpen className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-serif text-lg font-semibold text-foreground mb-1">
                            {citation.bookTitle}
                          </h3>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <span>{citation.author}</span>
                            {citation.chapterTitle && (
                              <>
                                <span className="text-border">•</span>
                                <span>{citation.chapterTitle}</span>
                              </>
                            )}
                            {(citation.pageStart || citation.pageEnd) && (
                              <>
                                <span className="text-border">•</span>
                                <span className="flex items-center gap-1.5">
                                  <FileText className="w-3.5 h-3.5" />
                                  {citation.pageStart === citation.pageEnd
                                    ? `p. ${citation.pageStart}`
                                    : `pp. ${citation.pageStart}–${citation.pageEnd}`}
                                </span>
                              </>
                            )}
                            <span className="text-border">•</span>
                            <span className="text-primary font-medium">
                              {Math.round(citation.relevanceScore * 100)}% relevance
                            </span>
                          </div>
                        </div>
                      </div>
                      <blockquote className="border-l-2 border-primary/30 pl-4 text-foreground/90 italic leading-relaxed">
                        "{citation.excerpt}"
                      </blockquote>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
