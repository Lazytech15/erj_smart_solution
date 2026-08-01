// supabase/functions/create-checkout-session/index.ts
//
// Called from the frontend (SubscriptionPage / SignupPage) when the user picks
// a paid plan. Creates a PayMongo Checkout Session and returns the hosted
// checkout URL to redirect the browser to. PayMongo does the card entry;
// our webhook (paymongo-webhook) is what actually flips the subscription to
// "active" once payment succeeds — this function does NOT touch the DB.
//
// Deploy:  supabase functions deploy create-checkout-session
// Secrets: supabase secrets set PAYMONGO_SECRET_KEY=sk_test_xxxxx
//
// Request body: { subscriptionId, planId, planName, amountPhp, seats, email, successUrl, cancelUrl }
//   amountPhp is the TOTAL peso amount for this billing cycle (e.g. price-per-employee * seats),
//   as a whole number of pesos (we convert to centavos below).

const PAYMONGO_SECRET_KEY = Deno.env.get("PAYMONGO_SECRET_KEY")!;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    const body = await req.json();
    const { subscriptionId, planId, planName, amountPhp, seats, email, successUrl, cancelUrl, changeType } = body;

    if (!subscriptionId || !planId || !amountPhp) {
      return new Response(JSON.stringify({ ok: false, error: "subscriptionId, planId, and amountPhp are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // PayMongo amounts are in centavos (smallest currency unit).
    const amountCentavos = Math.round(Number(amountPhp) * 100);

    const payload = {
      data: {
        attributes: {
          billing: email ? { email } : undefined,
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          line_items: [
            {
              currency: "PHP",
              amount: amountCentavos,
              name: `${planName ?? planId} plan`,
              quantity: 1,
              description: seats ? `${seats} employee seat(s)` : undefined,
            },
          ],
          payment_method_types: ["card", "gcash", "paymaya"],
          description: `ERJ Smart Solutions — ${planName ?? planId} plan`,
          // Round-trips through PayMongo untouched — our webhook reads this
          // back to know which subscription row to update, and (when
          // present) whether this is a prorated mid-cycle plan-change
          // charge rather than a normal signup/renewal — see
          // paymongo-webhook for what that changes.
          metadata: { subscriptionId, planId, ...(changeType ? { changeType } : {}) },
          success_url: successUrl ?? "https://eablao.dev/app/subscription?checkout=success",
          cancel_url: cancelUrl ?? "https://eablao.dev/app/subscription?checkout=cancelled",
        },
      },
    };

    const resp = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(PAYMONGO_SECRET_KEY + ":")}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await resp.json();

    if (!resp.ok) {
      console.error("[create-checkout-session] PayMongo error:", JSON.stringify(json));
      return new Response(JSON.stringify({ ok: false, error: json?.errors?.[0]?.detail ?? "PayMongo request failed" }), {
        status: resp.status,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    const checkoutUrl = json?.data?.attributes?.checkout_url;
    const checkoutSessionId = json?.data?.id;

    return new Response(JSON.stringify({ ok: true, checkoutUrl, checkoutSessionId }), {
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[create-checkout-session] error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
});
