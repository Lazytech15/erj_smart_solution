// supabase/functions/send-otp/index.ts
//
// Generates a 6-digit one-time code, stores its hash (never the code
// itself) with a 10-minute expiry, and emails it via _shared/email.ts.
// Pair with verify-otp to check what the user typed back in.
//
// Call from the client:
//   await supabase.functions.invoke('send-otp', {
//     body: { email: user.email, purpose: 'password_change' },
//   });
//
// Deploy: supabase functions deploy send-otp
// Needs SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-injected) + RESEND_API_KEY / RESEND_FROM.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders() });

  const { email, purpose } = await req.json().catch(() => ({}));
  if (!email || !purpose) {
    return new Response(JSON.stringify({ ok: false, error: "email and purpose are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  // Simple throttle: don't allow more than one active (unused, unexpired)
  // code per email+purpose — re-sending just resets the same slot.
  await supabase.from("otp_codes").delete().eq("email", email).eq("purpose", purpose).is("used_at", null);

  const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
  const codeHash = await sha256(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error } = await supabase.from("otp_codes").insert({
    email,
    code_hash: codeHash,
    purpose,
    expires_at: expiresAt,
  });
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  const result = await sendEmail({
    to: email,
    subject: "Your verification code",
    heading: "Your verification code",
    body: `<p>Use this code to confirm your request. It expires in 10 minutes.</p>
           <p style="font-size:28px;font-weight:bold;letter-spacing:6px;text-align:center;margin:20px 0;">${code}</p>
           <p style="color:#9aa0ac;">If you didn't request this, you can safely ignore this email.</p>`,
  });

  if (!result.ok) {
    return new Response(JSON.stringify(result), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders() } });
});
