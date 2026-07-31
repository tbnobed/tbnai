import { useState } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignInPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in — go to the app.
  if (user) return <Redirect to="/search" />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // Full-page navigation: immune to the render race where the router
      // bounces back to /sign-in before the auth context has updated.
      window.location.assign(`${basePath}/search`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background px-4">
      <img
        src={`${basePath}/logo.png`}
        alt="TBNai"
        className="w-[440px] max-w-full h-auto"
      />
      <div className="w-[440px] max-w-full rounded-2xl bg-white shadow-lg border border-[hsl(206,30%,89%)] p-8">
        <h1 className="text-xl font-bold text-foreground mb-1">
          Welcome to TBNai
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Sign in to search the archive
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="input-email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="input-password"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" data-testid="text-signin-error">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={submitting}
            data-testid="button-sign-in"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
