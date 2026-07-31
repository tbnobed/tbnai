/**
 * POST /admin/invite — self-hosted user invitations.
 *
 * Creates a local account for the given email with a generated temporary
 * password. The temporary password is returned to the admin so it can be
 * shared directly; if SendGrid is configured (SENDGRID_API_KEY /
 * SENDGRID_FROM_EMAIL), an invite email is also sent.
 */
import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { hashPassword, requireAdmin } from "../lib/auth";
import { sendInviteEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateTempPassword(): string {
  // 12 chars, unambiguous alphabet
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

router.post("/admin/invite", requireAdmin, async (req, res): Promise<void> => {
  const email: string =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
  if (!email || !EMAIL_RE.test(email)) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await db.insert(usersTable).values({ email, passwordHash, role: "staff" });
  logger.info({ email }, "Created invited user account");

  // Best-effort email if SendGrid is configured; the password is returned
  // to the admin either way.
  let emailSent = false;
  if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) {
    try {
      await sendInviteEmail({
        toEmail: email,
        invitedBy: req.session.email ?? "The Archive Search team",
        tempPassword,
      });
      emailSent = true;
    } catch (err) {
      logger.error({ email, err }, "Failed to send invite email");
    }
  }

  res.status(200).json({
    message: emailSent
      ? `Invite email sent to ${email}.`
      : `Account created for ${email}. Share the temporary password with them directly.`,
    tempPassword,
  });
});

export default router;
