/**
 * SendGrid email helper.
 *
 * All configuration comes from environment variables — no Replit-specific
 * hosting assumed. Works identically in Docker Compose and local dev.
 *
 * Required env vars:
 *   SENDGRID_API_KEY   — your SendGrid API key (sg.xxx...)
 *   SENDGRID_FROM_EMAIL — verified sender address in SendGrid
 *   SENDGRID_FROM_NAME  — display name (optional, defaults to "Archive Search")
 *   APP_BASE_URL        — public-facing base URL (e.g. https://archive.obedtv.com)
 */
import sgMail from "@sendgrid/mail";
import { logger } from "./logger";

function getSgClient(): typeof sgMail {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) {
    throw new Error(
      "SENDGRID_API_KEY is not set. Add it to your .env file or Docker Compose environment.",
    );
  }
  sgMail.setApiKey(key);
  return sgMail;
}

function getAppBaseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (!url) {
    throw new Error(
      "APP_BASE_URL is not set. Set it to the public URL of the app (e.g. https://archive.obedtv.com).",
    );
  }
  return url.replace(/\/$/, "");
}

export async function sendInviteEmail(params: {
  toEmail: string;
  invitedBy: string;
  tempPassword: string;
}): Promise<void> {
  const { toEmail, invitedBy, tempPassword } = params;
  const sg = getSgClient();
  const baseUrl = getAppBaseUrl();

  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!fromEmail) {
    throw new Error(
      "SENDGRID_FROM_EMAIL is not set. Add the verified sender address to your environment.",
    );
  }
  const fromName =
    process.env.SENDGRID_FROM_NAME ?? "Archive Search";

  const signInUrl = `${baseUrl}/sign-in`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You've been invited to Archive Search</title>
</head>
<body style="margin:0;padding:0;background-color:#fdf8f4;font-family:'Source Sans 3',Georgia,serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding:48px 24px;">
        <table role="presentation" width="520" cellspacing="0" cellpadding="0"
               style="background:#fffcf9;border:1px solid #e8ddd4;border-radius:12px;overflow:hidden;max-width:520px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#c26b22;padding:32px 40px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
                Archive Search
              </p>
              <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.75);">
                TBNai
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#2d1f14;line-height:1.2;">
                You've been invited
              </h1>
              <p style="margin:0 0 12px;font-size:16px;color:#6b5744;line-height:1.6;">
                ${invitedBy} has invited you to access the TBNai book archive search tool.
              </p>
              <p style="margin:0 0 24px;font-size:16px;color:#6b5744;line-height:1.6;">
                Ask plain-English questions and get synthesized answers drawn from the full text of
                the published book catalog — with citations back to book, chapter, and page.
              </p>
              <p style="margin:0 0 8px;font-size:14px;color:#6b5744;">Sign in with:</p>
              <p style="margin:0 0 32px;font-size:15px;color:#2d1f14;line-height:1.8;">
                Email: <strong>${toEmail}</strong><br>
                Temporary password: <strong style="font-family:monospace;">${tempPassword}</strong>
              </p>

              <!-- CTA -->
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="border-radius:8px;background:#c26b22;">
                    <a href="${signInUrl}"
                       style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;
                              color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:0.1px;">
                      Access the archive
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0;font-size:13px;color:#9b836e;">
                If you weren't expecting this invitation, you can ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e8ddd4;">
              <p style="margin:0;font-size:12px;color:#b89f8e;line-height:1.6;">
                If the button above doesn't work, copy and paste this link into your browser:<br>
                <a href="${signInUrl}" style="color:#c26b22;word-break:break-all;">${signInUrl}</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `
You've been invited to Archive Search

${invitedBy} has invited you to access the TBNai book archive search tool.

Ask plain-English questions and get synthesized answers drawn from the full text of the published book catalog — with citations back to book, chapter, and page.

Sign in at: ${signInUrl}
Email: ${toEmail}
Temporary password: ${tempPassword}
  `.trim();

  await sg.send({
    to: toEmail,
    from: { email: fromEmail, name: fromName },
    subject: "You've been invited to Archive Search",
    html,
    text,
  });

  logger.info({ toEmail, invitedBy }, "Invite email sent via SendGrid");
}
