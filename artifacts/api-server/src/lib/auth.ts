/**
 * Self-hosted authentication: scrypt password hashing (Node stdlib, no
 * external deps), Postgres-backed sessions, and admin bootstrap from env.
 *
 * Env:
 *   SESSION_SECRET   — required, signs the session cookie
 *   ADMIN_EMAIL      — bootstrap admin account email
 *   ADMIN_PASSWORD   — bootstrap admin account password
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { logger } from "./logger";

const scryptAsync = promisify(scrypt);

// ── Password hashing ────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return (
    derived.length === expected.length && timingSafeEqual(derived, expected)
  );
}

// ── Session typing ──────────────────────────────────────────────────────────

declare module "express-session" {
  interface SessionData {
    userId?: number;
    email?: string;
    role?: "admin" | "staff";
  }
}

// ── Middleware ──────────────────────────────────────────────────────────────

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.session.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

/** Current user's ID as a string (conversations/searches store text IDs). */
export function sessionUserId(req: Request): string | null {
  return req.session?.userId != null ? String(req.session.userId) : null;
}

/**
 * Drop-in replacement for Clerk's getAuth(): returns { userId } from the
 * session so existing route code keeps working unchanged.
 */
export function sessionAuth(req: Request): { userId: string | null } {
  return { userId: sessionUserId(req) };
}

// ── Admin bootstrap ─────────────────────────────────────────────────────────

/**
 * Ensures the admin account from ADMIN_EMAIL/ADMIN_PASSWORD exists and its
 * password matches the env value. Runs at server startup.
 */
export async function bootstrapAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    logger.warn(
      "ADMIN_EMAIL / ADMIN_PASSWORD not set — no admin account bootstrapped",
    );
    return;
  }

  const passwordHash = await hashPassword(password);
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!existing) {
    await db.insert(usersTable).values({ email, passwordHash, role: "admin" });
    logger.info({ email }, "Bootstrapped admin account");
    return;
  }

  // Keep role admin, and sync the password to the env value so changing
  // ADMIN_PASSWORD in .env takes effect on restart.
  const passwordMatches = await verifyPassword(password, existing.passwordHash);
  if (existing.role !== "admin" || !passwordMatches) {
    await db
      .update(usersTable)
      .set({ role: "admin", ...(passwordMatches ? {} : { passwordHash }) })
      .where(eq(usersTable.id, existing.id));
    logger.info({ email }, "Updated admin account from env");
  }
}
