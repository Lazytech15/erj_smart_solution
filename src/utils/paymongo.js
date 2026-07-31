// src/utils/paymongo.js
//
// Calls the create-checkout-session edge function and redirects the browser
// to PayMongo's hosted checkout page. The subscription itself only becomes
// "active" once PayMongo confirms payment via the paymongo-webhook function —
// this file just kicks off the checkout, it never touches subscription status.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * @param {Object} params
 * @param {string} params.subscriptionId
 * @param {string} params.planId
 * @param {string} params.planName
 * @param {number} params.amountPhp   total PHP amount for this billing cycle (e.g. price * seats)
 * @param {number} [params.seats]
 * @param {string} [params.email]
 * @returns {Promise<void>} redirects the browser on success; throws on failure
 */
export async function startCheckout({ subscriptionId, planId, planName, amountPhp, seats, email }) {
  const resp = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      subscriptionId,
      planId,
      planName,
      amountPhp,
      seats,
      email,
      successUrl: `${window.location.origin}/app/subscription?checkout=success`,
      cancelUrl: `${window.location.origin}/app/subscription?checkout=cancelled`,
    }),
  });

  const json = await resp.json();
  if (!resp.ok || !json.ok) {
    throw new Error(json?.error ?? 'Failed to start checkout');
  }

  window.location.href = json.checkoutUrl;
}
