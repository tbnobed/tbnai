import { Link } from "wouter";
import { BookOpen, Search, Library, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Landing() {
  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-serif font-semibold text-lg text-foreground leading-tight">Archive Search</h1>
              <p className="text-xs text-muted-foreground">Ministry Library</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/sign-in">
              <Button variant="ghost" size="sm" data-testid="button-signin">
                Sign in
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm" data-testid="button-signup">
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8">
          <Sparkles className="w-4 h-4" />
          Scholarly reference companion
        </div>
        <h2 className="font-serif text-5xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
          Ask a question.<br />Find the answer.
        </h2>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed">
          Search the full text of our published book archive with plain-English questions. Get synthesized answers with citations back to book, chapter, and page.
        </p>
        <Link href="/sign-up">
          <Button size="lg" className="text-base px-8" data-testid="button-hero-signup">
            <Search className="w-5 h-5 mr-2" />
            Start searching
          </Button>
        </Link>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-card border border-card-border rounded-lg p-8">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Search className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-serif text-xl font-semibold text-foreground mb-3">Natural language search</h3>
            <p className="text-muted-foreground leading-relaxed">
              Ask questions the way you'd ask a colleague. No keywords, no Boolean operators — just plain English.
            </p>
          </div>

          <div className="bg-card border border-card-border rounded-lg p-8">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-serif text-xl font-semibold text-foreground mb-3">Complete citations</h3>
            <p className="text-muted-foreground leading-relaxed">
              Every answer includes citations with book title, author, chapter, and page numbers so you can verify and cite with confidence.
            </p>
          </div>

          <div className="bg-card border border-card-border rounded-lg p-8">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Library className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-serif text-xl font-semibold text-foreground mb-3">Full archive access</h3>
            <p className="text-muted-foreground leading-relaxed">
              Search across the entire published catalog. The tool indexes every chapter and page, so no insight is left unfound.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <p className="text-sm text-muted-foreground text-center">
            Built for editors, researchers, and programming staff.
          </p>
        </div>
      </footer>
    </div>
  );
}
