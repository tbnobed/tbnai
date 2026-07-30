import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useGetCatalogStats, useCreateBook, useDeleteBook, useReindexBook, useListBooks, getListBooksQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, RefreshCw, BarChart3, BookOpen, Loader2, UserPlus, Send } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

// ---------- invite hook (direct fetch — no codegen needed) ----------
function useInviteUser() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (email: string) => {
      const token = await getToken();
      const res = await fetch(`${BASE_URL}/api/admin/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send invite");
      return json as { message: string };
    },
  });
}

export default function AdminPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [deleteBookId, setDeleteBookId] = useState<number | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");

  const { data: stats } = useGetCatalogStats();
  const { data: booksData } = useListBooks();
  const createBook = useCreateBook();
  const deleteBook = useDeleteBook();
  const reindexBook = useReindexBook();
  const inviteUser = useInviteUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    title: "",
    author: "",
    publishedYear: "",
    description: "",
    filePath: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createBook.mutate(
      {
        data: {
          title: formData.title,
          author: formData.author,
          publishedYear: formData.publishedYear ? Number(formData.publishedYear) : null,
          description: formData.description || null,
          filePath: formData.filePath,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Book registered", description: "The book has been added and will be processed shortly." });
          setIsAddDialogOpen(false);
          setFormData({ title: "", author: "", publishedYear: "", description: "", filePath: "" });
          queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Registration failed", description: "An error occurred while adding the book." });
        },
      },
    );
  };

  const handleDelete = () => {
    if (!deleteBookId) return;
    deleteBook.mutate(
      { id: deleteBookId },
      {
        onSuccess: () => {
          toast({ title: "Book deleted", description: "The book and all its chunks have been removed." });
          setDeleteBookId(null);
          queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Deletion failed", description: "An error occurred while deleting the book." });
          setDeleteBookId(null);
        },
      },
    );
  };

  const handleReindex = (id: number) => {
    reindexBook.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Reindex started", description: "The book is being reprocessed." });
          queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Reindex failed", description: "An error occurred while reindexing the book." });
        },
      },
    );
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    inviteUser.mutate(inviteEmail.trim(), {
      onSuccess: (data) => {
        toast({ title: "Invite sent", description: data.message });
        setInviteEmail("");
        setIsInviteDialogOpen(false);
      },
      onError: (err: Error) => {
        toast({ variant: "destructive", title: "Invite failed", description: err.message });
      },
    });
  };

  const books = booksData?.books || [];

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="font-serif text-4xl font-bold text-foreground mb-3">Admin Panel</h1>
          <p className="text-muted-foreground">Manage the book catalog, view system statistics, and invite staff.</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid md:grid-cols-4 gap-4 mb-8">
            <div className="bg-card border border-card-border rounded-lg p-6">
              <div className="flex items-center gap-3 mb-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                <span className="text-sm text-muted-foreground">Total Books</span>
              </div>
              <p className="text-3xl font-bold text-foreground">{stats.totalBooks}</p>
            </div>
            <div className="bg-card border border-card-border rounded-lg p-6">
              <div className="flex items-center gap-3 mb-2">
                <BookOpen className="w-5 h-5 text-green-600" />
                <span className="text-sm text-muted-foreground">Ready</span>
              </div>
              <p className="text-3xl font-bold text-foreground">{stats.booksReady}</p>
            </div>
            <div className="bg-card border border-card-border rounded-lg p-6">
              <div className="flex items-center gap-3 mb-2">
                <Loader2 className="w-5 h-5 text-primary" />
                <span className="text-sm text-muted-foreground">Processing</span>
              </div>
              <p className="text-3xl font-bold text-foreground">{stats.booksProcessing}</p>
            </div>
            <div className="bg-card border border-card-border rounded-lg p-6">
              <div className="flex items-center gap-3 mb-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                <span className="text-sm text-muted-foreground">Total Searches</span>
              </div>
              <p className="text-3xl font-bold text-foreground">{stats.totalSearches}</p>
            </div>
          </div>
        )}

        {/* Team Access — Invite Users */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-serif text-2xl font-semibold text-foreground">Team Access</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Invite staff by email. They'll receive a sign-in link via SendGrid — no self-registration allowed.
              </p>
            </div>
            <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="button-invite-user">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Invite staff member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-serif text-2xl">Invite a Staff Member</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  Enter their email address. They'll receive an email with a one-time sign-in link (valid for 24 hours).
                  The link takes them directly into TBNai — no password setup required.
                </p>
                <form onSubmit={handleInvite} className="space-y-4 mt-2">
                  <div>
                    <Label htmlFor="invite-email">Email address</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="colleague@obedtv.com"
                      required
                      autoFocus
                      data-testid="input-invite-email"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { setIsInviteDialogOpen(false); setInviteEmail(""); }}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={inviteUser.isPending || !inviteEmail.trim()}
                      className="flex-1"
                      data-testid="button-send-invite"
                    >
                      {inviteUser.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</>
                      ) : (
                        <><Send className="w-4 h-4 mr-2" />Send invite</>
                      )}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Book Management */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-2xl font-semibold text-foreground">Book Management</h2>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-book">
                <Plus className="w-4 h-4 mr-2" />
                Register book
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-serif text-2xl">Register New Book</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                    data-testid="input-book-title"
                  />
                </div>
                <div>
                  <Label htmlFor="author">Author *</Label>
                  <Input
                    id="author"
                    value={formData.author}
                    onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                    required
                    data-testid="input-book-author"
                  />
                </div>
                <div>
                  <Label htmlFor="publishedYear">Published Year</Label>
                  <Input
                    id="publishedYear"
                    type="number"
                    value={formData.publishedYear}
                    onChange={(e) => setFormData({ ...formData, publishedYear: e.target.value })}
                    data-testid="input-book-year"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    data-testid="input-book-description"
                  />
                </div>
                <div>
                  <Label htmlFor="filePath">File path (inside container) *</Label>
                  <Input
                    id="filePath"
                    value={formData.filePath}
                    onChange={(e) => setFormData({ ...formData, filePath: e.target.value })}
                    placeholder="/books/title.pdf"
                    required
                    data-testid="input-book-filepath"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Path inside the Docker container — mount your books directory to <code>/books/</code>.
                  </p>
                </div>
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createBook.isPending} className="flex-1" data-testid="button-submit-book">
                    {createBook.isPending ? "Adding…" : "Add book"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Books list */}
        <div className="space-y-3">
          {books.length === 0 && (
            <div className="bg-card border border-card-border rounded-lg p-12 text-center">
              <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No books registered yet. Add the first one above.</p>
            </div>
          )}
          {books.map((book) => (
            <div
              key={book.id}
              className="bg-card border border-card-border rounded-lg p-6"
              data-testid={`admin-book-${book.id}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-serif text-xl font-semibold text-foreground mb-1">{book.title}</h3>
                  <p className="text-sm text-muted-foreground mb-2">{book.author}</p>
                  <StatusBadge status={book.status} />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReindex(book.id)}
                    disabled={reindexBook.isPending}
                    data-testid={`button-reindex-${book.id}`}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteBookId(book.id)}
                    disabled={deleteBook.isPending}
                    data-testid={`button-delete-${book.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Delete confirmation */}
        <AlertDialog open={!!deleteBookId} onOpenChange={() => setDeleteBookId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete book?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the book and all its text chunks. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppShell>
  );
}
