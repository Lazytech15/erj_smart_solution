// ── First-party cookie helpers ──────────────────────────────────────────────
// Deliberately separate from utils/sessionPolicy.js (localStorage) and from
// Supabase's own auth-token storage. These cookies never carry
// authentication and are never read to decide whether someone is logged in
// — they only back small, non-sensitive convenience features (e.g.
// remembering the last-used login email) that the user has explicitly
// opted into via the cookie-consent banner. Session/security state must
// keep living in sessionPolicy.js so it's never accidentally relaxed by
// this file.

export const CONSENT_COOKIE = 'erj_cookie_consent'; // 'accepted' | 'declined'
export const LAST_EMAIL_COOKIE = 'erj_last_email';

const DEFAULT_DAYS = 365;

/** Read a cookie by name. Returns null if not present. */
export function getCookie(name) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  if (!match) return null;
  try {
    return decodeURIComponent(match.split('=').slice(1).join('='));
  } catch {
    return null;
  }
}

/** Set a cookie. `days` controls expiry (defaults to ~1 year). */
export function setCookie(name, value, days = DEFAULT_DAYS) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${secure}`;
}

/** Delete a cookie by name. */
export function deleteCookie(name) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
}

/** True once the person has made an explicit accept/decline choice. */
export function hasConsentDecision() {
  return getCookie(CONSENT_COOKIE) !== null;
}

/** True only if the person explicitly accepted (declining stays "no cookies"). */
export function hasAcceptedCookies() {
  return getCookie(CONSENT_COOKIE) === 'accepted';
}
