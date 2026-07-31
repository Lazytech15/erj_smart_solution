// supabase/functions/verify-otp/index.ts
//
// Verifies a code sent by send-otp. Marks it used on success so it can't
// be replayed, and rejects expired/mismatched/already-used codes.
//
// Call from the client:
//   const { data } = await supabase.functions.invoke('verify-otp', {
//     body: { email: user.email, purpose: 'password_change', code: '123456' },
//   });
//   if (data.ok) { /* proceed with the password change */ }
//
// Deploy: supabase functions deploy verify-otp

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  const { email, purpose, code } = await req.json().catch(() => ({}));
  if (!email || !purpose || !code) {
    return new Response(JSON.stringify({ ok: false, error: "email, purpose, and code are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  const { data: row, error } = await supabase
    .from("otp_codes")
    .select("id, code_hash, expires_at, used_at")
    .eq("email", email)
    .eq("purpose", purpose)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !row) {
    return new Response(JSON.stringify({ ok: false, error: "No active code for this email/purpose" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return new Response(JSON.stringify({ ok: false, error: "Code expired" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  const codeHash = await sha256(code);
  if (codeHash !== row.code_hash) {
    return new Response(JSON.stringify({ ok: false, error: "Incorrect code" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  await supabase.from("otp_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders() } });
});
