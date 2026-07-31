# Subscription Lifecycle + Email

## What's included
- `supabase/functions/subscription-lifecycle/index.ts` — the daily cron job (Day 0 → grace, Day 7 → suspended, Day 25 → final warning, Day 31+ → hard delete + cascade).
- `supabase/functions/_shared/email.ts` — reusable Resend sender: pass `to`, `subject`, `body` (HTML), optional `attachments` and `inlineImages`. Any function can import it.
- `supabase/functions/send-employee-invite/` — emails a newly-created employee their username + temp password. Call after `createEmployeeAccount()`.
- `supabase/functions/send-otp/` + `supabase/functions/verify-otp/` — generic emailed one-time-code flow, reusable for password-change confirmation, sensitive-action step-up, etc.
- `supabase/migrations/20260731000000_subscription_lifecycle.sql` — adds `grace_started_at` / `final_warning_sent_at` columns and schedules the daily cron via `pg_cron` + `pg_net`.
- `supabase/migrations/20260731000001_cookie_consent.sql` — adds `cookie_consent` / `cookie_consent_at` to `accounts`.
- `supabase/migrations/20260731000002_otp_codes.sql` — the `otp_codes` table backing send-otp/verify-otp.

## Setup
1. **Apply the migration**: paste `supabase/migrations/20260731000000_subscription_lifecycle.sql` into the Supabase SQL editor, filling in your `<PROJECT_REF>` and a secret string for `<SUBSCRIPTION_LIFECYCLE_SECRET>`.
2. **Set secrets** for the function:
   ```
   supabase secrets set RESEND_API_KEY=re_xxxxxxxx
   supabase secrets set RESEND_FROM="ERJ Smart Solutions <no-reply@yourdomain.com>"
   supabase secrets set SUBSCRIPTION_LIFECYCLE_SECRET=<same secret as in the SQL>
   ```
   (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are already injected automatically for edge functions.)
3. **Deploy**:
   ```
   supabase functions deploy subscription-lifecycle
   supabase functions deploy send-employee-invite
   supabase functions deploy send-otp
   supabase functions deploy verify-otp
   ```
4. **Verify domain in Resend** so `RESEND_FROM` can actually send. (Already verified for eablao.dev — confirmed working.)

## Using the email helper elsewhere
```ts
import { sendEmail } from "../_shared/email.ts";

await sendEmail({
  to: "someone@example.com",
  subject: "Here's your report",
  heading: "Monthly report",
  body: "<p>Attached is your report for July.</p><img src=\"cid:chart\" />",
  attachments: [{ filename: "report.pdf", content: base64PdfString }],
  inlineImages: [{ filename: "chart.png", content: base64PngString, cid: "chart" }],
});
```

## Notes / things worth deciding
- The cron reads `billing.nextBillingDate` on the `subscriptions` row as the expiration reference — that's the field `SubscriptionContext.jsx` already sets on subscribe/renew.
- Hard delete removes rows from `accounts`, `announcements`, `pending_registrations`, and `subscriptions` for that `subscription_id` — no Storage buckets are touched since none currently store subscription-scoped files; add a `storage.remove(...)` call in `hardDelete()` if that changes.
- The admin email is looked up from `accounts` where `role = 'admin'`. If your schema doesn't use that literal role value, adjust `getAdminEmail()`.
- The function is protected by a shared-secret header rather than being public, since it does destructive work.

---

# PayMongo (test mode)

## What's included
- `supabase/functions/create-checkout-session/` — call this from the frontend to get back a PayMongo hosted checkout URL for a plan purchase/renewal. Does not touch the database.
- `supabase/functions/paymongo-webhook/` — receives PayMongo's `checkout_session.payment.paid` event, verifies its signature, and activates the subscription (`status: active`, rolls `billing.nextBillingDate` forward 30 days, clears grace/suspension state). This is what makes billing actually recurring instead of the old one-time 30-day countdown.
- `src/utils/paymongo.js` — frontend helper (`startCheckout(...)`) that calls `create-checkout-session` and redirects to PayMongo.

## Setup
1. **Get your test keys**: PayMongo Dashboard → Developers → API Keys (make sure you're in **test mode**, top-right toggle). You need the secret key (`sk_test_...`).
2. **Set secrets**:
   ```
   supabase secrets set PAYMONGO_SECRET_KEY=sk_test_xxxxxxxx
   ```
3. **Deploy the checkout function**:
   ```
   supabase functions deploy create-checkout-session
   ```
4. **Deploy the webhook function** — this one must skip Supabase's own JWT check, since PayMongo calls it directly without a Supabase auth token:
   ```
   supabase functions deploy paymongo-webhook --no-verify-jwt
   ```
5. **Register the webhook with PayMongo** (test mode), pointing at the function you just deployed:
   ```bash
   curl https://api.paymongo.com/v1/webhooks \
     -u sk_test_xxxxxxxx: \
     -H "Content-Type: application/json" \
     -d '{
       "data": {
         "attributes": {
           "url": "https://<PROJECT_REF>.supabase.co/functions/v1/paymongo-webhook",
           "events": ["checkout_session.payment.paid"]
         }
       }
     }'
   ```
   The response includes `secret_key` (looks like `whsk_...`) — copy it.
6. **Set the webhook secret** (from step 5) and redeploy so the function picks it up:
   ```
   supabase secrets set PAYMONGO_WEBHOOK_SECRET=whsk_xxxxxxxx
   supabase functions deploy paymongo-webhook --no-verify-jwt
   ```

## Using it from the frontend
```js
import { startCheckout } from '../utils/paymongo';

await startCheckout({
  subscriptionId: subscription.subscriptionId,
  planId: 'growth',
  planName: 'Growth',
  amountPhp: 250 * seatsUsed,   // price-per-employee * seats, whole pesos
  seats: seatsUsed,
  email: adminEmail,
});
// browser redirects to PayMongo's hosted checkout; on success it returns to
// /app/subscription?checkout=success and the webhook has already activated
// the subscription by the time the user lands back.
```

## Testing
- Use PayMongo's test card numbers (see their Testing docs) on the hosted checkout — no real money moves in test mode.
- Watch **Supabase → Edge Functions → paymongo-webhook → Logs** to confirm the event arrives and the subscription row updates.
- Check the `subscriptions` row afterward: `status` should be `active` and `billing.nextBillingDate` ~30 days out.

## Notes / things worth deciding
- This only wires up **checkout → activation**. It does not yet auto-charge on renewal — PayMongo Checkout Sessions are one-time-use, so a real recurring-billing setup would need either the customer coming back to pay each cycle (with `subscription-lifecycle` emailing them when `nextBillingDate` approaches) or moving to PayMongo's saved-card/recurring charge flow later.
- Trial expiration still isn't wired into either function — a `trialing` subscription reaching the end of `trialEndsAt` doesn't yet prompt a checkout or get suspended. Worth adding a "trial ending" email + forced checkout redirect.
- `create-checkout-session` currently trusts whatever `amountPhp` the frontend sends — for production, compute the amount server-side from `planId` + seat count instead of accepting it from the client, so nobody can tamper with the price in the request.

-Card Number	Brand	CVC	Expiry
-4343 4343 4343 4345	Visa	any 3 digits	any future date
-5555 4444 4444 4457	Mastercard	any 3 digits	any future date
