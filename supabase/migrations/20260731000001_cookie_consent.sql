-- Persist cookie-consent decisions to the account row, so the choice
-- survives a "clear browser data" for logged-in users. The cookie
-- (see src/utils/cookies.js) remains the fast, works-when-logged-out
-- source of truth; this column is the fallback that lets it be restored.
alter table accounts
  add column if not exists cookie_consent text,          -- 'accepted' | 'declined' | null
  add column if not exists cookie_consent_at timestamptz;
