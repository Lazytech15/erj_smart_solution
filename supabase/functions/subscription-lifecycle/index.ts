// supabase/functions/subscription-lifecycle/index.ts
//
// Runs once every 24h (scheduled via pg_cron, see migrations/xxxx_subscription_lifecycle.sql).
// Walks every subscription and moves it through the billing lifecycle:
//
//   Day 0   billing.nextBillingDate has passed -> status: grace_period   (system stays fully usable)
//   Day 7   7 days into grace_period            -> status: suspended     (logins/clock-ins blocked)
//   Day 25  25 days into grace_period            -> final warning email, 5 days left
//   Day 31+ 30+ days into grace_period            -> irreversible hard delete of the account + all data
//
// Deploy:   supabase functions deploy subscription-lifecycle
// Secrets:  supabase secrets set RESEND_API_KEY=... RESEND_FROM="ERJ Smart Solutions <no-reply@yourdomain.com>"
//           supabase secrets set APP_URL=https://yourdomain.com   (links the emails below to /app/subscription)
// Schedule: handled by pg_cron + pg_net, see the accompanying migration.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Shared secret so this function can't be triggered by anyone who merely
// guesses the URL. pg_cron sends it as a header (see migration).
const CRON_SECRET = Deno.env.get("SUBSCRIPTION_LIFECYCLE_SECRET");
// Base URL of the deployed frontend, used to link straight to the Renew now
// button on /app/subscription from the emails below.
// Secrets: supabase secrets set APP_URL=https://yourdomain.com
const APP_URL = Deno.env.get("APP_URL") ?? "https://erjsmartsolutions.eablao.dev/";
const RENEW_URL = `${APP_URL}/app/subscription`;

const DAY_MS = 24 * 60 * 60 * 1000;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Subscription = {
  subscription_id: string;
  status: string | null;
  billing: { nextBillingDate?: string | null } | null;
  company: { name?: string } | null;
  grace_started_at: string | null;
  final_warning_sent_at: string | null;
  cancel_at_period_end: boolean | null;
};

async function getAdminEmail(subscriptionId: string): Promise<string | null> {
  const { data } = await supabase
    .from("accounts")
    .select("email")
    .eq("subscription_id", subscriptionId)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  return data?.email ?? null;
}

async function hardDelete(subscriptionId: string) {
  // Cascade: wipe every table keyed by subscription_id. Order doesn't
  // matter here since none of these tables reference each other via FK —
  // they're all independently keyed off subscription_id.
  const tables = ["accounts", "announcements", "pending_registrations", "subscriptions"];
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq("subscription_id", subscriptionId);
    if (error) {
      console.error(`[hardDelete] failed to delete from ${table} for ${subscriptionId}:`, error.message);
      throw error;
    }
  }
}

Deno.serve(async (req) => {
  if (CRON_SECRET) {
    const provided = req.headers.get("x-cron-secret");
    if (provided !== CRON_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const now = Date.now();
  const results = { grace: 0, suspended: 0, warned: 0, deleted: 0, cancelled: 0, errors: [] as string[] };

  const { data: subs, error } = await supabase
    .from("subscriptions")
    .select("subscription_id, status, billing, company, grace_started_at, final_warning_sent_at, cancel_at_period_end");

  if (error) {
    console.error("[subscription-lifecycle] failed to load subscriptions:", error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }

  for (const sub of (subs ?? []) as Subscription[]) {
    try {
      const companyName = sub.company?.name ?? "your workspace";
      const nextBilling = sub.billing?.nextBillingDate ? new Date(sub.billing.nextBillingDate).getTime() : null;

      // ── Pending cancellation: the client clicked Cancel, which no longer
      // locks them out immediately (see cancel_at_period_end migration) —
      // it just marks intent. Once their paid-through period actually
      // ends, finalize it here instead of ever routing them through
      // grace_period/suspension (they didn't fail a payment, they chose to
      // leave — no need to chase them for a renewal).
      if (
        sub.cancel_at_period_end &&
        (sub.status === "active" || sub.status === "trialing") &&
        nextBilling !== null &&
        now >= nextBilling
      ) {
        await supabase
          .from("subscriptions")
          .update({ status: "cancelled" })
          .eq("subscription_id", sub.subscription_id);

        const adminEmail = await getAdminEmail(sub.subscription_id);
        if (adminEmail) {
          await sendEmail({
            to: adminEmail,
            subject: "Your subscription has ended",
            heading: `${companyName}: subscription ended`,
            body: `<p>As requested, <strong>${companyName}</strong>'s subscription has now ended and billing has stopped.</p>
                   <p>Your data is safe — you can reactivate any time from the Subscription page.</p>
                   <p><a href="${RENEW_URL}">Reactivate</a></p>`,
          });
        }
        results.cancelled++;
        continue;
      }

      // ── Day 0: payment due date has passed and account is still active ──
      if (sub.status === "active" && nextBilling !== null && now >= nextBilling) {
        await supabase
          .from("subscriptions")
          .update({ status: "grace_period", grace_started_at: new Date(now).toISOString() })
          .eq("subscription_id", sub.subscription_id);

        const adminEmail = await getAdminEmail(sub.subscription_id);
        if (adminEmail) {
          await sendEmail({
            to: adminEmail,
            subject: "Payment failed — action needed",
            heading: `Payment issue on ${companyName}`,
            body: `<p>We couldn't process your latest payment for <strong>${companyName}</strong>.</p>
                   <p>Your account is still fully active for now, but please renew within
                   the next 7 days to avoid a temporary suspension.</p>
                   <p><a href="${RENEW_URL}">Renew now</a></p>`,
          });
        }
        results.grace++;
        continue;
      }

      // From here on we only care about accounts already in grace_period / suspended.
      if (!sub.grace_started_at) continue;
      const graceStart = new Date(sub.grace_started_at).getTime();
      const daysSinceGrace = (now - graceStart) / DAY_MS;

      // ── Day 7: move grace_period -> suspended ──
      if (sub.status === "grace_period" && daysSinceGrace >= 7) {
        await supabase
          .from("subscriptions")
          .update({ status: "suspended" })
          .eq("subscription_id", sub.subscription_id);

        const adminEmail = await getAdminEmail(sub.subscription_id);
        if (adminEmail) {
          await sendEmail({
            to: adminEmail,
            subject: "Your account has been suspended",
            heading: `${companyName} is suspended`,
            body: `<p>Because payment hasn't been resolved, <strong>${companyName}</strong> has been suspended.</p>
                   <p>Logins and employee clock-ins are blocked. Your historical data is safe and hidden until
                   you reactivate.</p>
                   <p><a href="${RENEW_URL}">Reactivate your subscription</a></p>`,
          });
        }
        results.suspended++;
        continue;
      }

      // ── Day 25: final warning, 5 days before hard delete ──
      if (sub.status === "suspended" && daysSinceGrace >= 25 && !sub.final_warning_sent_at) {
        await supabase
          .from("subscriptions")
          .update({ final_warning_sent_at: new Date(now).toISOString() })
          .eq("subscription_id", sub.subscription_id);

        const adminEmail = await getAdminEmail(sub.subscription_id);
        if (adminEmail) {
          await sendEmail({
            to: adminEmail,
            subject: "Final notice: your data will be permanently deleted in 5 days",
            heading: `${companyName}: 5 days left`,
            body: `<p>This is a final notice. <strong>${companyName}</strong> has been suspended for 25 days.</p>
                   <p>Exactly <strong>5 days</strong> remain before all account data — including employee profiles
                   and attendance history — is <strong>permanently and irreversibly deleted</strong>.</p>
                   <p><a href="${RENEW_URL}">Reactivate now to prevent data loss</a></p>`,
          });
        }
        results.warned++;
        continue;
      }

      // ── Day 31+: hard delete ──
      if (sub.status === "suspended" && daysSinceGrace >= 30) {
        const adminEmail = await getAdminEmail(sub.subscription_id);
        // Send the confirmation before deleting — the accounts row (and its
        // email) won't exist anymore once hardDelete runs.
        if (adminEmail) {
          await sendEmail({
            to: adminEmail,
            subject: "Your account and data have been permanently deleted",
            heading: `${companyName}: account deleted`,
            body: `<p>As previously warned, <strong>${companyName}</strong> and all associated data —
                   employee profiles, attendance records, and account settings — have now been
                   permanently deleted. This action cannot be undone.</p>`,
          });
        }
        await hardDelete(sub.subscription_id);
        results.deleted++;
        continue;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[subscription-lifecycle] error processing ${sub.subscription_id}:`, msg);
      results.errors.push(`${sub.subscription_id}: ${msg}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { "Content-Type": "application/json" },
  });
});