import { useState, useRef, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  UploadCloud,
  FileText,
  X,
  Loader2,
  CheckCircle,
  BookOpen,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

interface UploadedBook {
  id: number;
  title: string;
  author: string;
  status: string;
}

function useUploadBook() {
  return useMutation({
    mutationFn: async (formData: FormData): Promise<UploadedBook> => {
      const res = await fetch(`${BASE_URL}/api/books/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed.");
      return json as UploadedBook;
    },
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [form, setForm] = useState({
    title: "",
    author: "",
    publishedYear: "",
    description: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const upload = useUploadBook();

  const handleFile = useCallback((file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "txt", "text"].includes(ext ?? "")) {
      toast({
        variant: "destructive",
        title: "Unsupported file type",
        description: "Please upload a PDF or plain text file.",
      });
      return;
    }
    setSelectedFile(file);
    // Pre-fill title from filename if empty
    if (!form.title) {
      const nameWithoutExt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      setForm((f) => ({
        ...f,
        title: f.title || nameWithoutExt.replace(/\b\w/g, (c) => c.toUpperCase()),
      }));
    }
  }, [form.title, toast]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    const fd = new FormData();
    fd.append("file", selectedFile);
    fd.append("title", form.title.trim());
    fd.append("author", form.author.trim());
    if (form.publishedYear) fd.append("publishedYear", form.publishedYear);
    if (form.description.trim()) fd.append("description", form.description.trim());

    upload.mutate(fd);
  };

  const reset = () => {
    setSelectedFile(null);
    setForm({ title: "", author: "", publishedYear: "", description: "" });
    upload.reset();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Success state ──────────────────────────────────────────────────────────
  if (upload.isSuccess && upload.data) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-9 h-9 text-green-600" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-3">
            Book uploaded successfully
          </h1>
          <p className="text-muted-foreground mb-2">
            <strong className="text-foreground">{upload.data.title}</strong> has been added to the archive.
          </p>
          <p className="text-sm text-muted-foreground mb-10">
            Ingestion is running in the background — the book will appear as{" "}
            <strong>Ready</strong> in the Library once processing completes.
            Large PDFs may take a few minutes.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/library">
              <Button variant="outline">
                <BookOpen className="w-4 h-4 mr-2" />
                View Library
              </Button>
            </Link>
            <Button onClick={reset} data-testid="button-upload-another">
              <UploadCloud className="w-4 h-4 mr-2" />
              Upload another
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── Upload form ────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="font-serif text-4xl font-bold text-foreground mb-3">Upload a Book</h1>
          <p className="text-muted-foreground">
            Upload a PDF or text file. The archive will process and index it automatically so staff can search it.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Drop zone */}
          <div>
            <Label className="mb-2 block">Book file (PDF or .txt)</Label>
            <div
              className={cn(
                "relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : selectedFile
                    ? "border-green-400 bg-green-50"
                    : "border-border hover:border-primary/50 hover:bg-muted/30",
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => !selectedFile && fileInputRef.current?.click()}
              data-testid="upload-dropzone"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.text"
                className="sr-only"
                onChange={onFileChange}
                data-testid="input-file"
              />

              {selectedFile ? (
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-6 h-6 text-green-600" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-medium text-foreground truncate">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">{formatBytes(selectedFile.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div>
                  <UploadCloud className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-medium text-foreground mb-1">
                    {isDragging ? "Drop the file here" : "Drag and drop a file, or click to browse"}
                  </p>
                  <p className="text-sm text-muted-foreground">PDF or plain text — up to 200 MB</p>
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
            <h2 className="font-serif text-lg font-semibold text-foreground">Book details</h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. The Purpose Driven Life"
                  required
                  data-testid="input-title"
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="author">Author *</Label>
                <Input
                  id="author"
                  value={form.author}
                  onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                  placeholder="e.g. Rick Warren"
                  required
                  data-testid="input-author"
                />
              </div>

              <div>
                <Label htmlFor="publishedYear">Published year</Label>
                <Input
                  id="publishedYear"
                  type="number"
                  min={1800}
                  max={new Date().getFullYear()}
                  value={form.publishedYear}
                  onChange={(e) => setForm((f) => ({ ...f, publishedYear: e.target.value }))}
                  placeholder="e.g. 2002"
                  data-testid="input-year"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief summary or notes about this book…"
                rows={3}
                data-testid="input-description"
              />
            </div>
          </div>

          {/* Error */}
          {upload.isError && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{upload.error?.message}</p>
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!selectedFile || !form.title.trim() || !form.author.trim() || upload.isPending}
            data-testid="button-upload-submit"
          >
            {upload.isPending ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Uploading and processing…
              </>
            ) : (
              <>
                <UploadCloud className="w-5 h-5 mr-2" />
                Upload and index book
              </>
            )}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
