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
    console.log(`[paymongo-webhook] ignored event type: ${eventType}`);
    return new Response(JSON.stringify({ ok: true, ignored: eventType }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const checkoutSession = event?.data?.attributes?.data;
  const metadata = checkoutSession?.attributes?.metadata ?? {};
  const { subscriptionId, planId, changeType } = metadata;
  const isPlanChange = changeType === "plan_change";

  // PayMongo attaches the actual Payment resource(s) created for this
  // checkout under `payments` — this is the id (e.g. "pay_xxx") you'd look
  // up on the PayMongo dashboard to trace this exact charge. There can in
  // theory be more than one (e.g. a failed attempt followed by a
  // successful one); the paid one is what triggered this event, so the
  // most recent entry is what we want.
  //
  // In practice, for async payment methods (GCash, Maya) the embedded
  // checkout_session snapshot delivered with this event can still show
  // `payments: []` and `payment_intent.attributes.status: "processing"`
  // even though this is the `checkout_session.payment.paid` event — the
  // Payment resource just hasn't been attached to the *session's own*
  // `payments` array yet at delivery time. Relying on that field alone is
  // what left `paymongo_payment_id` empty even though `status` correctly
  // went to "active" — the update below only sets paymongo_payment_id
  // `if (paymentId)`, so a null here just silently skipped it forever
  // (there's no follow-up event that fills it in later). Fall back to the
  // payment intent's own `payments` array, and finally to the payment
  // intent id itself — pi_xxx still uniquely identifies this exact charge
  // even before a pay_xxx Payment resource is visible here.
  const sessionPayments = checkoutSession?.attributes?.payments ?? [];
  const intentPayments = checkoutSession?.attributes?.payment_intent?.attributes?.payments ?? [];
  const paymentIntentId = checkoutSession?.attributes?.payment_intent?.id ?? null;
  const paymentId =
    sessionPayments[sessionPayments.length - 1]?.id ??
    intentPayments[intentPayments.length - 1]?.id ??
    paymentIntentId ??
    null;

  if (!subscriptionId) {
    console.error("[paymongo-webhook] no subscriptionId in metadata:", JSON.stringify(metadata));
    return new Response(JSON.stringify({ ok: false, error: "missing subscriptionId in metadata" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = Date.now();

  // Fetch the current row first so we only patch nextBillingDate inside
  // `billing` rather than clobbering card4/expiry/cardName already stored there,
  // and so we can compare against the last payment id we recorded (below).
  const { data: existing, error: fetchError } = await supabase
    .from("subscriptions")
    .select("billing, paymongo_payment_id")
    .eq("subscription_id", subscriptionId)
    .maybeSingle();

  if (fetchError) {
    console.error("[paymongo-webhook] failed to fetch subscription:", fetchError.message);
    return new Response(JSON.stringify({ ok: false, error: fetchError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // PayMongo retries a webhook delivery on anything other than a 200 — if
  // an earlier successful delivery's response got lost in transit (rather
  // than actually failing), the retry would otherwise push nextBillingDate
  // another 30 days forward a second time for the exact same charge.
  // Recognizing "we already recorded this payment id" makes re-delivery
  // safe to just re-acknowledge instead of re-applying.
  if (paymentId && existing?.paymongo_payment_id === paymentId) {
    console.log(`[paymongo-webhook] payment ${paymentId} already recorded for ${subscriptionId} — skipping duplicate delivery`);
    return new Response(JSON.stringify({ ok: true, subscriptionId, duplicate: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // A plan-change charge (see isPlanChange above) is a mid-cycle top-up for
  // the price difference, not a renewal — it must NOT push nextBillingDate
  // out another 30 days, or every upgrade would silently give the client a
  // free extra chunk of runway on top of what they already paid for this
  // cycle. Only a real renewal/initial-signup payment rolls the cycle
  // forward; a plan change keeps whatever nextBillingDate already existed.
  const mergedBilling = {
    ...(existing?.billing ?? {}),
    ...(isPlanChange ? {} : { nextBillingDate: new Date(now + 30 * DAY_MS).toISOString() }),
  };

  const { data: updated, error } = await supabase
    .from("subscriptions")
    .update({
      status: "active",
      ...(planId ? { plan_id: planId } : {}),
      ...(paymentId ? { paymongo_payment_id: paymentId } : {}),
      grace_started_at: null,
      final_warning_sent_at: null,
      billing: mergedBilling,
      // The client used to be the only thing that ever set this (see
      // OnboardingPage's confirmPaymentAndFinish -> completeOnboarding),
      // via a separate write that runs *after* this one, triggered by the
      // browser polling for status==="active" once it's back from PayMongo's
      // hosted Checkout. That's fragile: it depends on the browser actually
      // making it back here, the poll landing before it gives up, and that
      // follow-up write not getting clobbered by/racing stale client state.
      // We already have server-side proof payment succeeded right here, so
      // just flip it in the same update — the client no longer needs to
      // finish anything for this subscription to stop being routed back to
      // /onboard by PrivateRoute/PublicRoute.
      onboarding_complete: true,
      cancel_at_period_end: false,
    })
    .eq("subscription_id", subscriptionId)
    .select("subscription_id"); // needed to detect a zero-row match below

  if (error) {
    console.error("[paymongo-webhook] failed to update subscription:", error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Supabase/PostgREST does NOT error on an update that matches zero rows —
  // it reports success with nothing changed. Without this check, a
  // subscriptionId mismatch (stale test-mode id, whitespace, casing, a row
  // that was deleted/recreated, etc.) meant this function always returned
  // 200 to PayMongo — so PayMongo never retried it — while silently never
  // touching the actual row. That "successful no-op" is what looked like
  // "the webhook fires but the subscription never activates".
  if (!updated || updated.length === 0) {
    console.error(
      `[paymongo-webhook] update matched 0 rows for subscriptionId=${JSON.stringify(subscriptionId)} — ` +
      `no subscription row has this subscription_id. Check for a mismatch (casing/whitespace/stale id) ` +
      `between what create-checkout-session sent as metadata.subscriptionId and the actual column value.`
    );
    return new Response(
      JSON.stringify({ ok: false, error: "no matching subscription row", subscriptionId }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log(`[paymongo-webhook] activated subscription ${subscriptionId}${paymentId ? ` (payment ${paymentId})` : ""}`);
  return new Response(JSON.stringify({ ok: true, subscriptionId, paymentId }), {
    headers: { "Content-Type": "application/json" },
  });
});
