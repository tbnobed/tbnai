import { useMemo } from "react";
import { Link, useParams } from "wouter";
import { AppShell } from "@/components/app-shell";
import {
  useGetBookContent,
  getGetBookContentQueryKey,
} from "@workspace/api-client-react";
import { ArrowLeft, Loader2, BookOpen } from "lucide-react";

export default function ReaderPage() {
  const params = useParams<{ id: string }>();
  const bookId = Number(params.id);

  const contentQuery = useGetBookContent(bookId, {
    query: {
      enabled: Number.isFinite(bookId),
      queryKey: getGetBookContentQueryKey(bookId),
      staleTime: Infinity,
    },
  });

  const book = contentQuery.data?.book;
  const sections = contentQuery.data?.sections ?? [];

  // Group consecutive sections under their chapter heading
  const chapters = useMemo(() => {
    const out: Array<{ title: string | null; text: string[] }> = [];
    for (const s of sections) {
      const last = out[out.length - 1];
      if (last && last.title === s.chapterTitle) {
        last.text.push(s.content);
      } else {
        out.push({ title: s.chapterTitle, text: [s.content] });
      }
    }
    return out;
  }, [sections]);

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link
          href="/library"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8"
          data-testid="link-back-to-library"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to catalog
        </Link>

        {contentQuery.isLoading ? (
          <div className="flex items-center gap-3 text-muted-foreground py-24 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading book…</span>
          </div>
        ) : contentQuery.isError || !book ? (
          <div className="text-center py-24">
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Book not found.</p>
          </div>
        ) : (
          <article>
            <header className="mb-10 flex items-start gap-6">
              {book.coverPath && (
                <img
                  src={`/api/books/${book.id}/cover`}
                  alt=""
                  className="w-28 rounded-md border border-border shadow-sm flex-shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <div>
                <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
                  {book.title}
                </h1>
                <p className="text-muted-foreground">
                  {book.author}
                  {book.publishedYear ? ` · ${book.publishedYear}` : ""}
                </p>
              </div>
            </header>

            {sections.length === 0 ? (
              <p className="text-muted-foreground">
                No text is available for this book yet.
              </p>
            ) : (
              <div className="space-y-10">
                {chapters.map((ch, i) => (
                  <section key={i}>
                    {ch.title && (
                      <h2 className="font-serif text-xl font-semibold text-foreground mb-4">
                        {ch.title}
                      </h2>
                    )}
                    <div className="space-y-4 text-foreground/90 leading-relaxed">
                      {ch.text.map((t, j) => (
                        <p key={j} className="whitespace-pre-wrap">
                          {t}
                        </p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </article>
        )}
      </div>
    </AppShell>
  );
}
