/**
 * Self-hosted auth context. Session cookie is managed by the API server;
 * this context tracks the current user via /api/auth/me.
 */
import {
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface AuthUser {
  id: number;
  email: string;
  role: "admin" | "staff";
  isAdmin: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["auth-me"],
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<AuthUser | null> => {
      const res = await fetch(`${basePath}/api/auth/me`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return (await res.json()) as AuthUser;
    },
  });

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(`${basePath}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Sign-in failed");
      }
      const user = (await res.json()) as AuthUser;
      // New user context — drop all cached data, then seed the auth query
      queryClient.clear();
      queryClient.setQueryData(["auth-me"], user);
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    await fetch(`${basePath}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    queryClient.clear();
    queryClient.setQueryData(["auth-me"], null);
  }, [queryClient]);

  return (
    <AuthContext.Provider
      value={{ user: data ?? null, isLoading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
