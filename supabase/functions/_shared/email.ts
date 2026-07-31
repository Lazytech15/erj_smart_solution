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

/** Wraps arbitrary HTML body content in a minimal, branded email shell. */
function renderTemplate(heading: string | undefined, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:#4f6ef7;padding:20px 28px;">
                <span style="color:#ffffff;font-size:18px;font-weight:bold;">ERJ Smart Solutions</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;color:#1f2430;font-size:14px;line-height:1.6;">
                ${heading ? `<h2 style="margin:0 0 16px;font-size:20px;color:#1f2430;">${heading}</h2>` : ""}
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#fafafa;color:#9aa0ac;font-size:12px;">
                This is an automated message from ERJ Smart Solutions. Please do not reply directly to this email.
              </td>
            </tr>
          </table>
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
