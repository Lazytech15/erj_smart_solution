// supabase/functions/send-test-email/index.ts
//
// One-off sanity check for the Resend setup. Deploy this, then hit it once
// with a POST request containing your own email address — if it lands in
// your inbox, RESEND_API_KEY + RESEND_FROM (your verified domain) are
// wired up correctly and every other function using _shared/email.ts will
// work the same way.
//
// Deploy:
//   supabase functions deploy send-test-email
//
// Call it (replace the project ref, anon key, and your email):
//   curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/send-test-email" \
//     -H "Authorization: Bearer <ANON_KEY>" \
//     -H "Content-Type: application/json" \
//     -d '{"to":"you@example.com"}'
//
// You should get back { "ok": true, "id": "..." } and an email within a
// few seconds. If ok:false, the `error` field explains why (bad API key,
// unverified domain, etc).

import { sendEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Send a POST with a JSON body: { \"to\": \"you@example.com\" }", { status: 405 });
  }

  let to: string | undefined;
  try {
    const body = await req.json();
    to = body?.to;
  } catch {
    // ignore — handled by the check below
  }

  if (!to) {
    return new Response(JSON.stringify({ ok: false, error: "Missing `to` in request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await sendEmail({
    to,
    subject: "Test email from ERJ Smart Solutions",
    heading: "It works! 🎉",
    body: `<p>This is a test email confirming your Resend setup is wired up correctly.</p>
           <p>If you're seeing this, <strong>RESEND_API_KEY</strong> and <strong>RESEND_FROM</strong>
           are configured correctly and your domain is verified.</p>`,
  });

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
});
