// _shared/email.ts
//
// Reusable Resend email sender for use from any Supabase Edge Function.
//
// Usage:
//   import { sendEmail } from "../_shared/email.ts";
//
//   await sendEmail({
//     to: "admin@example.com",
//     subject: "Your subscription is suspended",
//     heading: "Action required",              // optional — rendered as the big header inside the template
//     body: "<p>Your account has been suspended...</p>", // HTML string (or use `text` for plain text)
//     attachments: [
//       { filename: "invoice.pdf", content: base64Pdf },       // base64 string
//     ],
//     inlineImages: [
//       { filename: "logo.png", content: base64Png, cid: "logo" }, // reference in body as <img src="cid:logo">
//     ],
//   });

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const DEFAULT_FROM = Deno.env.get("RESEND_FROM") ?? "ERJ Smart Solutions <no-reply@eablao.dev>";

export interface EmailAttachment {
  /** File name shown to the recipient, e.g. "invoice.pdf" */
  filename: string;
  /** Base64-encoded file content */
  content: string;
  /** Optional explicit content type. Inferred from filename extension if omitted. */
  contentType?: string;
}

export interface InlineImage extends EmailAttachment {
  /** Content-ID used to reference the image inside the HTML body via cid:<cid> */
  cid: string;
}

export interface SendEmailOptions {
  /** One recipient, or several */
  to: string | string[];
  /** Email subject line */
  subject: string;
  /** Optional big header/title rendered inside the default wrapper template */
  heading?: string;
  /** HTML body. Either this or `text` is required. Can reference inline images via cid:<cid>. */
  body?: string;
  /** Plain-text fallback / plain-text-only body */
  text?: string;
  /** Regular file attachments (base64) */
  attachments?: EmailAttachment[];
  /** Images referenced inline in the HTML body via cid: */
  inlineImages?: InlineImage[];
  /** Override the default From address */
  from?: string;
  /** Optional reply-to address */
  replyTo?: string;
  /** Optional CC / BCC */
  cc?: string | string[];
  bcc?: string | string[];
}

function extToContentType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    csv: "text/csv",
    txt: "text/plain",
    json: "application/json",
    zip: "application/zip",
  };
  return map[ext] ?? "application/octet-stream";
}

/**
 * Wraps arbitrary HTML body content in a branded email shell.
 *
 * Font stack: Open Sans is loaded via a web-font <link> for clients that
 * support it (Apple Mail, most webmail in an iframe, etc.), with a system
 * "humanist sans" fallback chain for the many clients (Outlook desktop,
 * Gmail's own rendering path in some cases) that strip <link>/@import and
 * fall back to inline font-family — Segoe UI / Helvetica / Arial are the
 * closest visual match to Open Sans on Windows/macOS respectively, so the
 * email stays readable either way instead of collapsing to a serif default.
 */
const FONT_STACK =
  "'Open Sans','Segoe UI',Helvetica,Arial,sans-serif";

function renderTemplate(heading: string | undefined, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
    <!--[if mso]>
    <style>
      * { font-family: 'Segoe UI', Arial, sans-serif !important; }
    </style>
    <![endif]-->
  </head>
  <body style="margin:0;padding:0;background:#eef0f6;font-family:${FONT_STACK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f6;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(30,41,86,0.08);">
            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:28px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ffffff;opacity:0.85;margin-right:8px;"></span>
                    </td>
                    <td style="vertical-align:middle;">
                      <span style="color:#ffffff;font-size:17px;font-weight:700;font-family:${FONT_STACK};letter-spacing:-0.01em;">ERJ Smart Solutions</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:36px 32px 32px;color:#1e293b;font-size:14px;line-height:1.65;font-family:${FONT_STACK};">
                ${heading ? `<h1 style="margin:0 0 18px;font-size:21px;font-weight:800;color:#0f172a;font-family:${FONT_STACK};letter-spacing:-0.01em;">${heading}</h1>` : ""}
                ${bodyHtml}
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #eef0f6;">
                <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;font-family:${FONT_STACK};">
                  This is an automated message from <strong style="color:#64748b;">ERJ Smart Solutions</strong>. Please do not reply directly to this email.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:20px 0 0;color:#a3a9b7;font-size:11px;font-family:${FONT_STACK};">
            © ${new Date().getFullYear()} ERJ Smart Solutions. All rights reserved.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Sends an email through Resend. Reusable across any edge function —
 * pass a recipient, subject, and body (HTML or plain text), plus optional
 * attachments and inline images.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }
  if (!opts.body && !opts.text) {
    return { ok: false, error: "Either `body` (HTML) or `text` must be provided" };
  }

  const attachments = [
    ...(opts.attachments ?? []).map((a) => ({
      filename: a.filename,
      content: a.content,
      content_type: a.contentType ?? extToContentType(a.filename),
    })),
    // Inline images are sent as attachments with a Content-ID so the HTML
    // body's <img src="cid:xxx"> tags resolve them.
    ...(opts.inlineImages ?? []).map((img) => ({
      filename: img.filename,
      content: img.content,
      content_type: img.contentType ?? extToContentType(img.filename),
      content_id: img.cid,
    })),
  ];

  const html = opts.body ? renderTemplate(opts.heading, opts.body) : undefined;

  const payload: Record<string, unknown> = {
    from: opts.from ?? DEFAULT_FROM,
    to: opts.to,
    subject: opts.subject,
    ...(html ? { html } : {}),
    ...(opts.text ? { text: opts.text } : {}),
    ...(attachments.length ? { attachments } : {}),
    ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
    ...(opts.cc ? { cc: opts.cc } : {}),
    ...(opts.bcc ? { bcc: opts.bcc } : {}),
  };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("[sendEmail] Resend error:", res.status, data);
      return { ok: false, error: data?.message ?? `Resend responded with ${res.status}` };
    }

    return { ok: true, id: data?.id };
  } catch (err) {
    console.error("[sendEmail] request failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
