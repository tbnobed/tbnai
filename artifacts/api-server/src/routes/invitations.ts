/**
 * POST /admin/invite
 *
 * Creates a Clerk user account for the given email (if one doesn't already
 * exist), adds them to the Clerk allowlist, generates a 24-hour sign-in
 * token, and sends the invite link via SendGrid.
 *
 * All external service calls (Clerk API, SendGrid) use environment variables
 * only — no Replit-specific hosting assumed. Works identically in Docker
 * Compose and local dev.
 */
import { Router, type IRouter } from "express";
import { getAuth, createClerkClient } from "@clerk/express";
import { sendInviteEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is not set");
  return createClerkClient({ secretKey });
}

router.post("/admin/invite", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const email: string = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  if (!email || !EMAIL_RE.test(email)) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }
  const clerk = clerkClient();

  // 1. Add to Clerk allowlist (idempotent — ignore "already exists" errors)
  try {
    await clerk.allowlistIdentifiers.createAllowlistIdentifier({
      identifier: email,
      notify: false,
    });
  } catch (err: any) {
    const alreadyExists = err?.errors?.some?.(
      (e: any) => e.code === "already_exists" || e.code === "form_identifier_exists",
    );
    if (!alreadyExists) {
      logger.error({ email, err }, "Failed to add email to Clerk allowlist");
      res.status(500).json({ error: "Failed to configure access for this email." });
      return;
    }
    logger.debug({ email }, "Email already on Clerk allowlist, skipping");
  }

  // 2. Create Clerk user if they don't already have an account
  let userId: string;
  try {
    const existing = await clerk.users.getUserList({
      emailAddress: [email],
    });

    if (existing.totalCount > 0 && existing.data[0]) {
      userId = existing.data[0].id;
      logger.debug({ email, userId }, "Clerk user already exists");
    } else {
      const newUser = await clerk.users.createUser({
        emailAddress: [email],
        skipPasswordRequirement: true,
      });
      userId = newUser.id;
      logger.info({ email, userId }, "Created new Clerk user for invite");
    }
  } catch (err: any) {
    logger.error({ email, err }, "Failed to create/find Clerk user");
    res.status(500).json({ error: "Failed to create account for this email." });
    return;
  }

  // 3. Generate a 24-hour sign-in token
  let signInToken: string;
  try {
    const tokenResponse = await clerk.signInTokens.createSignInToken({
      userId,
      expiresInSeconds: 86400, // 24 hours
    });
    signInToken = tokenResponse.token;
  } catch (err: any) {
    logger.error({ email, userId, err }, "Failed to generate Clerk sign-in token");
    res.status(500).json({ error: "Failed to generate sign-in link." });
    return;
  }

  // 4. Look up the inviter's email for the "invited by" field
  let invitedBy = "The Archive Search team";
  try {
    const inviter = await clerk.users.getUser(auth.userId);
    const primaryEmail = inviter.emailAddresses.find(
      (e) => e.id === inviter.primaryEmailAddressId,
    );
    if (primaryEmail?.emailAddress) {
      invitedBy = primaryEmail.emailAddress;
    }
  } catch {
    // Non-fatal — fall back to generic name
  }

  // 5. Send invite email via SendGrid
  try {
    await sendInviteEmail({ toEmail: email, invitedBy, signInToken });
  } catch (err: any) {
    logger.error({ email, err }, "Failed to send invite email via SendGrid");
    res.status(500).json({
      error: err.message ?? "Failed to send the invite email. Check SENDGRID_API_KEY and SENDGRID_FROM_EMAIL.",
    });
    return;
  }

  res.status(200).json({ message: `Invite sent to ${email}` });
});

export default router;
