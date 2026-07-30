/**
 * Server-side admin authorization.
 *
 * A user is an admin if either:
 *   - their Clerk publicMetadata.role === "admin", or
 *   - their primary email is listed in the ADMIN_EMAILS env var
 *     (comma-separated, case-insensitive).
 *
 * Configured entirely via environment variables — works identically in
 * Docker Compose and local dev.
 */
import { createClerkClient } from "@clerk/express";
import { logger } from "./logger";

function clerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is not set");
  return createClerkClient({ secretKey });
}

function adminEmailAllowlist(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

// Small in-memory cache so every admin request doesn't hit the Clerk API.
const cache = new Map<string, { isAdmin: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

export async function isAdminUser(userId: string): Promise<boolean> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.isAdmin;

  let isAdmin = false;
  try {
    const user = await clerkClient().users.getUser(userId);
    if (user.publicMetadata?.role === "admin") {
      isAdmin = true;
    } else {
      const allowlist = adminEmailAllowlist();
      if (allowlist.size > 0) {
        const primaryEmail = user.emailAddresses
          .find((e) => e.id === user.primaryEmailAddressId)
          ?.emailAddress?.toLowerCase();
        if (primaryEmail && allowlist.has(primaryEmail)) isAdmin = true;
      }
    }
  } catch (err) {
    logger.error({ userId, err }, "Failed to resolve admin status");
    return false;
  }

  cache.set(userId, { isAdmin, expiresAt: Date.now() + CACHE_TTL_MS });
  return isAdmin;
}
