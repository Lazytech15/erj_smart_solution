-- One-time-passcode storage, for any flow that needs an emailed OTP
-- (password change confirmation, sensitive-action step-up, etc).
create table if not exists otp_codes (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  code_hash   text not null,      -- sha256 of the 6-digit code, never store it plain
  purpose     text not null,      -- e.g. 'password_change', 'login_step_up'
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists otp_codes_email_purpose_idx on otp_codes (email, purpose);

-- Codes are only ever read/written by edge functions using the service-role
-- key, never directly by the client — so RLS stays default-deny.
alter table otp_codes enable row level security;
