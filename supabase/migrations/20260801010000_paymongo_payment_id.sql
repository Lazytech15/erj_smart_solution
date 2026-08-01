-- Tracks the PayMongo Payment id (e.g. "pay_xxx") that most recently
-- activated/renewed this subscription. Previously nothing recorded which
-- PayMongo payment corresponded to which subscription row at all — the
-- webhook only ever wrote `status`/`billing`, with no reference back to
-- PayMongo's own records. That made it impossible to:
--   1. Trace a specific charge on the PayMongo dashboard back to a
--      subscription row (or vice versa) when investigating a payment issue.
--   2. Detect a duplicate webhook delivery for the same payment (PayMongo
--      retries on anything other than a 200) and skip re-applying it —
--      without this, a retried delivery would push nextBillingDate another
--      30 days forward every time it retried, not just once.
alter table subscriptions
  add column if not exists paymongo_payment_id text;

-- Speeds up the idempotency check in paymongo-webhook (looking up whether
-- a given payment id has already been recorded) and doubles as a quick way
-- to search Table Editor by payment id when investigating a specific charge.
create index if not exists subscriptions_paymongo_payment_id_idx
  on subscriptions (paymongo_payment_id);
