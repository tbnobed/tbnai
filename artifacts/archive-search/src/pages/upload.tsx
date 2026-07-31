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
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");
const ALLOWED_EXTS = ["pdf", "txt", "text", "epub", "docx"];

interface UploadedBook {
  id: number;
  title: string;
  author: string;
  status: string;
}

/** Parse a JSON API response; turn non-JSON errors (e.g. proxy error pages) into readable messages. */
async function parseJsonResponse(res: Response): Promise<any> {
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON body — a proxy/server error page
  }
  if (!res.ok) {
    if (json?.error) throw new Error(json.error);
    if (res.status === 413) {
      throw new Error("Upload too large — the server rejected the request.");
    }
    throw new Error(`Upload failed (server responded with ${res.status}).`);
  }
  if (json === null) throw new Error("Unexpected response from server.");
  return json;
}

function useUploadBook() {
  return useMutation({
    mutationFn: async (formData: FormData): Promise<UploadedBook> => {
      const res = await fetch(`${BASE_URL}/api/books/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const json = await parseJsonResponse(res);
      return json as UploadedBook;
    },
  });
}

function useUploadBulk() {
  return useMutation({
    mutationFn: async (files: File[]): Promise<UploadedBook[]> => {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const res = await fetch(`${BASE_URL}/api/books/upload-bulk`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = await parseJsonResponse(res);
      return json.books as UploadedBook[];
    },
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPage() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
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
  const uploadBulk = useUploadBulk();

  const isBulk = selectedFiles.length > 1;
  const isPending = upload.isPending || uploadBulk.isPending;

  const addFiles = useCallback(
    (incoming: File[]) => {
      const valid: File[] = [];
      for (const file of incoming) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!ALLOWED_EXTS.includes(ext ?? "")) {
          toast({
            variant: "destructive",
            title: "Unsupported file type",
            description: `${file.name} — upload PDF, EPUB, DOCX, or plain text files.`,
          });
          continue;
        }
        valid.push(file);
      }
      if (valid.length === 0) return;

      setSelectedFiles((prev) => {
        const next = [...prev];
        for (const f of valid) {
          if (!next.some((p) => p.name === f.name && p.size === f.size)) {
            next.push(f);
          }
        }
        return next;
      });

      // Pre-fill title from filename for single uploads
      const first = valid[0];
      if (first && !form.title) {
        const nameWithoutExt = first.name
          .replace(/\.[^.]+$/, "")
          .replace(/[-_]/g, " ");
        setForm((f) => ({
          ...f,
          title:
            f.title || nameWithoutExt.replace(/\b\w/g, (c) => c.toUpperCase()),
        }));
      }
    },
    [form.title, toast],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles],
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0) return;

    if (isBulk) {
      uploadBulk.mutate(selectedFiles);
      return;
    }

    const fd = new FormData();
    fd.append("file", selectedFiles[0]!);
    fd.append("title", form.title.trim());
    fd.append("author", form.author.trim());
    if (form.publishedYear) fd.append("publishedYear", form.publishedYear);
    if (form.description.trim()) fd.append("description", form.description.trim());

    upload.mutate(fd);
  };

  const reset = () => {
    setSelectedFiles([]);
    setForm({ title: "", author: "", publishedYear: "", description: "" });
    upload.reset();
    uploadBulk.reset();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Success state ──────────────────────────────────────────────────────────
  const singleSuccess = upload.isSuccess && upload.data;
  const bulkSuccess = uploadBulk.isSuccess && uploadBulk.data;
  if (singleSuccess || bulkSuccess) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-9 h-9 text-green-600" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-3">
            {bulkSuccess
              ? `${uploadBulk.data.length} books uploaded`
              : "Book uploaded successfully"}
          </h1>
          {bulkSuccess ? (
            <p className="text-muted-foreground mb-2">
              Titles, authors, and details will be detected automatically while
              each book is indexed.
            </p>
          ) : (
            <p className="text-muted-foreground mb-2">
              <strong className="text-foreground">{upload.data!.title}</strong>{" "}
              has been added to the archive.
            </p>
          )}
          <p className="text-sm text-muted-foreground mb-10">
            Ingestion is running in the background — books appear as{" "}
            <strong>Ready</strong> in the Library once processing completes.
            Large files may take a few minutes each.
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
              Upload more
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const uploadError = upload.error ?? uploadBulk.error;

  // ── Upload form ────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="font-serif text-4xl font-bold text-foreground mb-3">Upload Books</h1>
          <p className="text-muted-foreground">
            Upload PDF, EPUB, DOCX, or text files. Select multiple files to bulk
            upload — titles, authors, and details are detected automatically
            during indexing.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Drop zone */}
          <div>
            <Label className="mb-2 block">Book files (PDF, EPUB, DOCX, or .txt)</Label>
            <div
              className={cn(
                "relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : selectedFiles.length > 0
                    ? "border-green-400 bg-green-50"
                    : "border-border hover:border-primary/50 hover:bg-muted/30",
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              data-testid="upload-dropzone"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.txt,.text,.epub,.docx"
                className="sr-only"
                onChange={onFileChange}
                data-testid="input-file"
              />

              {selectedFiles.length > 0 ? (
                <div className="space-y-2 text-left">
                  {selectedFiles.map((file, idx) => (
                    <div key={`${file.name}-${file.size}`} className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">{file.name}</p>
                        <p className="text-sm text-muted-foreground">{formatBytes(file.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(idx);
                        }}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <p className="text-sm text-muted-foreground pt-2 text-center">
                    Click or drop to add more files
                  </p>
                </div>
              ) : (
                <div>
                  <UploadCloud className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-medium text-foreground mb-1">
                    {isDragging ? "Drop files here" : "Drag and drop files, or click to browse"}
                  </p>
                  <p className="text-sm text-muted-foreground">PDF, EPUB, DOCX, or plain text — up to 200 MB each</p>
                </div>
              )}
            </div>
          </div>

          {/* Metadata — single upload only; bulk auto-detects */}
          {isBulk ? (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
              <Sparkles className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-sm text-foreground">
                <strong>{selectedFiles.length} files selected.</strong> Title,
                author, year, and description will be detected automatically for
                each book while it is indexed.
              </p>
            </div>
          ) : (
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
          )}

          {/* Error */}
          {uploadError && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{uploadError.message}</p>
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={
              selectedFiles.length === 0 ||
              (!isBulk && (!form.title.trim() || !form.author.trim())) ||
              isPending
            }
            data-testid="button-upload-submit"
          >
            {isPending ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <UploadCloud className="w-5 h-5 mr-2" />
                {isBulk
                  ? `Upload and index ${selectedFiles.length} books`
                  : "Upload and index book"}
              </>
            )}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
