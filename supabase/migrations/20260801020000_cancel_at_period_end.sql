-- Cancelling used to set status = 'cancelled' immediately, which PrivateRoute
-- (App.jsx) treats as an instant lockout — everything except
-- /app/subscription becomes inaccessible the moment someone clicks Cancel.
-- That contradicts the UI's own message ("Access continues until end of
-- billing period"). This column lets "wants to cancel" be tracked
-- separately from "is actually cancelled": status stays whatever it was
-- (active/trialing) until subscription-lifecycle's daily run notices
-- nextBillingDate has passed for a subscription with this flag set, and
-- only *then* flips status to 'cancelled' for real.
alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;
