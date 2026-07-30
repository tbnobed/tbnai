import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useListBooks, useListBookChunks, Book } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, BookOpen, Calendar, FileText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function LibraryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const { data: booksData, isLoading } = useListBooks();
  const { data: chunksData } = useListBookChunks(selectedBook?.id || 0, {
    query: { enabled: !!selectedBook },
  });

  const books = booksData?.books || [];
  const filteredBooks = books.filter(
    (book) =>
      book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      book.author.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="font-serif text-4xl font-bold text-foreground mb-3">Book Catalog</h1>
          <p className="text-muted-foreground mb-6">
            Browse all books in the TBNai library. Click any book to view its ingestion details and text chunks.
          </p>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by title or author..."
              className="pl-10"
              data-testid="input-search-books"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading catalog...</div>
        ) : filteredBooks.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-serif text-xl font-semibold text-foreground mb-2">No books found</h3>
            <p className="text-muted-foreground">
              {searchTerm ? "Try a different search term" : "The catalog is empty"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBooks.map((book) => (
              <button
                key={book.id}
                onClick={() => setSelectedBook(book)}
                className="w-full bg-card border border-card-border rounded-lg p-6 hover:border-primary/30 transition-colors text-left group"
                data-testid={`book-${book.id}`}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-serif text-xl font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
                      {book.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>{book.author}</span>
                      {book.publishedYear && (
                        <>
                          <span className="text-border">•</span>
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            {book.publishedYear}
                          </span>
                        </>
                      )}
                      <span className="text-border">•</span>
                      <span className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        {book.totalChunks} chunks
                      </span>
                    </div>
                  </div>
                  <StatusBadge status={book.status} />
                </div>
                {book.description && (
                  <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2">
                    {book.description}
                  </p>
                )}
                {book.status === "error" && book.errorMessage && (
                  <p className="text-destructive text-sm mt-2">{book.errorMessage}</p>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Book details dialog */}
        <Dialog open={!!selectedBook} onOpenChange={() => setSelectedBook(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">{selectedBook?.title}</DialogTitle>
              <p className="text-muted-foreground">{selectedBook?.author}</p>
            </DialogHeader>

            <div className="space-y-4 overflow-auto flex-1">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <div className="mt-1">
                    <StatusBadge status={selectedBook?.status || "pending"} />
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Total chunks:</span>
                  <div className="mt-1 font-medium">{selectedBook?.totalChunks || 0}</div>
                </div>
                {selectedBook?.publishedYear && (
                  <div>
                    <span className="text-muted-foreground">Published:</span>
                    <div className="mt-1 font-medium">{selectedBook.publishedYear}</div>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Added:</span>
                  <div className="mt-1 font-medium">
                    {selectedBook && new Date(selectedBook.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {selectedBook?.description && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Description</h4>
                  <p className="text-foreground leading-relaxed">{selectedBook.description}</p>
                </div>
              )}

              {chunksData && chunksData.chunks.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Text Chunks ({chunksData.total})
                  </h4>
                  <ScrollArea className="h-64 rounded-md border border-border">
                    <div className="p-4 space-y-3">
                      {chunksData.chunks.map((chunk) => (
                        <div key={chunk.id} className="text-sm border-b border-border pb-3 last:border-0">
                          <div className="flex items-center gap-2 text-muted-foreground mb-1.5 text-xs">
                            <span>Chunk {chunk.chunkIndex + 1}</span>
                            {chunk.chapterTitle && (
                              <>
                                <span>•</span>
                                <span>{chunk.chapterTitle}</span>
                              </>
                            )}
                            {(chunk.pageStart || chunk.pageEnd) && (
                              <>
                                <span>•</span>
                                <span>
                                  {chunk.pageStart === chunk.pageEnd
                                    ? `p. ${chunk.pageStart}`
                                    : `pp. ${chunk.pageStart}–${chunk.pageEnd}`}
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-foreground/80 leading-relaxed line-clamp-3">{chunk.content}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
