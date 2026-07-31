// supabase/functions/paymongo-webhook/index.ts
//
// Receives PayMongo webhook events. On checkout_session.payment.paid,
// activates the subscription: status -> active, rolls billing.nextBillingDate
// forward 30 days, clears any grace/suspension state. This is the missing
// piece that makes recurring billing real instead of a one-time 30-day
// countdown set at signup.
//
// Deploy:  supabase functions deploy paymongo-webhook --no-verify-jwt
//          (--no-verify-jwt is required: PayMongo calls this directly, not
//          through Supabase's own auth, so it won't send a Supabase JWT)
// Secrets: supabase secrets set PAYMONGO_WEBHOOK_SECRET=whsk_xxxxx
//
// After deploying, register the webhook with PayMongo (test mode) pointing at:
//   https://<PROJECT_REF>.supabase.co/functions/v1/paymongo-webhook
// listening for: checkout_session.payment.paid
// See SUBSCRIPTION_LIFECYCLE_README.md for the exact curl command.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYMONGO_WEBHOOK_SECRET = Deno.env.get("PAYMONGO_WEBHOOK_SECRET")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const DAY_MS = 24 * 60 * 60 * 1000;

// PayMongo signs webhooks as: t=<timestamp>,te=<test-mode-sig>,li=<live-mode-sig>
// We're in test mode, so we verify against `te`.
async function verifySignature(rawBody: string, signatureHeader: string): Promise<boolean> {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k, v];
    })
  );
  const { t, te } = parts;
  if (!t || !te) return false;

  const signedPayload = `${t}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(PAYMONGO_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const computed = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computed === te;
}

Deno.serve(async (req) => {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("paymongo-signature");

  if (!signatureHeader || !(await verifySignature(rawBody, signatureHeader))) {
    console.error("[paymongo-webhook] signature verification failed");
    return new Response("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const eventType = event?.data?.attributes?.type;

  if (eventType !== "checkout_session.payment.paid") {
    // Ack anything we don't act on yet so PayMongo doesn't retry it forever.
    return new Response(JSON.stringify({ ok: true, ignored: eventType }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const checkoutSession = event?.data?.attributes?.data;
  const metadata = checkoutSession?.attributes?.metadata ?? {};
  const { subscriptionId, planId } = metadata;

  if (!subscriptionId) {
    console.error("[paymongo-webhook] no subscriptionId in metadata:", JSON.stringify(metadata));
    return new Response(JSON.stringify({ ok: false, error: "missing subscriptionId in metadata" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = Date.now();

  // Fetch the current row first so we only patch nextBillingDate inside
  // `billing` rather than clobbering card4/expiry/cardName already stored there.
  const { data: existing, error: fetchError } = await supabase
    .from("subscriptions")
    .select("billing")
    .eq("subscription_id", subscriptionId)
    .maybeSingle();

  if (fetchError) {
    console.error("[paymongo-webhook] failed to fetch subscription:", fetchError.message);
    return new Response(JSON.stringify({ ok: false, error: fetchError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const mergedBilling = {
    ...(existing?.billing ?? {}),
    nextBillingDate: new Date(now + 30 * DAY_MS).toISOString(),
  };

  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "active",
      ...(planId ? { plan_id: planId } : {}),
      grace_started_at: null,
      final_warning_sent_at: null,
      billing: mergedBilling,
    })
    .eq("subscription_id", subscriptionId);

  if (error) {
    console.error("[paymongo-webhook] failed to update subscription:", error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, subscriptionId }), {
    headers: { "Content-Type": "application/json" },
  });
});
