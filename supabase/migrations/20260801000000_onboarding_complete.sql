-- Ensures `onboarding_complete` exists on `subscriptions` and defaults to
-- false. The app already tracks this flag in memory (see subscribe() /
-- completeOnboarding() in SubscriptionContext.jsx) to distinguish "just
-- signed up, still on /onboard" from "onboarding actually finished" — but
-- until now the column was never written to or read from by src/utils/db.js,
-- so the flag never survived a reload.
--
-- Defaulting to false (rather than true) matters for any row inserted
-- before this column existed, or by any insert path that omits the
-- column: an unfinished/legacy row should never be silently treated as
-- fully onboarded.
alter table subscriptions
  add column if not exists onboarding_complete boolean not null default false;
