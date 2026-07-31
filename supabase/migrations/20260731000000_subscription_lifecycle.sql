-- Subscription lifecycle: columns + daily cron trigger.
-- Run this in the Supabase SQL editor, or via `supabase db push`.

-- 1. New tracking columns on subscriptions.
alter table subscriptions
  add column if not exists grace_started_at timestamptz,
  add column if not exists final_warning_sent_at timestamptz;

-- 2. Extensions needed for scheduling + calling the edge function over HTTP.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 3. Schedule the edge function to run once a day at 00:00 UTC.
--    Replace <PROJECT_REF> and <SUBSCRIPTION_LIFECYCLE_SECRET> below, or better,
--    set them via `alter database ... set` / Vault and reference here.
select cron.schedule(
  'subscription-lifecycle-daily',
  '0 0 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/subscription-lifecycle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<SUBSCRIPTION_LIFECYCLE_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To remove the schedule later:
-- select cron.unschedule('subscription-lifecycle-daily');
