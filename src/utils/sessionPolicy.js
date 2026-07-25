// ── Session policy ────────────────────────────────────────────────────────
// Independent of the Supabase JWT's own (1hr, auto-refreshed) expiry.
// This layer answers: "should this browser still be considered logged in
// right now, from a security-policy standpoint?"
//
// Two modes, chosen at login time:
//   • Default (not "remember me"):
//       - session is force-expired at the next local 00:00:00 (midnight)
//       - session is also force-expired after 30 minutes of no user activity
//   • "Remember me (24 hours)":
//       - session is force-expired 24 hours after login
//       - NOT subject to the 30-minute inactivity timeout
//
// Persisted in localStorage (not sessionStorage) so it survives the browser
// being closed and reopened — that's the whole point: closing the tab
// should not itself extend or reset the clock.

const STORAGE_KEY = 'erj_session_policy';

// Set right before a force-logout (inactivity or policy-expiry) and read once
// by LoginPage on mount so it can explain *why* the user landed back here.
// Lives in localStorage (not React state/router state) because the logout
// can be triggered from AuthContext itself, outside any component that has
// navigate()/location.state available — the redirect to /login happens via
// the ProtectedRoute's <Navigate> once `user` flips to null.
const LOGOUT_REASON_KEY = 'erj_logout_reason';

export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const REMEMBER_ME_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Timestamp (ms) of the next local midnight after `from`. */
function nextMidnight(from = new Date()) {
  const d = new Date(from);
  d.setHours(24, 0, 0, 0); // rolls over to 00:00:00 of the following day
  return d.getTime();
}

/** Call once, right after a successful login, to start a new policy window. */
export function startSessionPolicy(rememberMe) {
  const now = Date.now();
  const policy = {
    rememberMe: !!rememberMe,
    loginAt: now,
    expiresAt: rememberMe ? now + REMEMBER_ME_DURATION_MS : nextMidnight(now),
    // Timestamp-based idle tracking (see touchActivity/isInactivityExpired
    // below) instead of a single long-lived setTimeout — see comment there
    // for why.
    lastActivityAt: now,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(policy));
  return policy;
}

export function getSessionPolicy() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const policy = JSON.parse(raw);
    if (!policy || typeof policy.expiresAt !== 'number') return null;
    return policy;
  } catch {
    return null;
  }
}

export function clearSessionPolicy() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Record fresh user activity. Persisted (not just kept in a JS closure/ref)
 * so the "last seen active" moment survives a page reload and is readable
 * from anywhere, and so idle time can be measured against a real wall-clock
 * timestamp instead of relying on a single setTimeout staying alive.
 *
 * Browsers throttle (or fully freeze) timers in backgrounded/idle tabs, so a
 * lone `setTimeout(..., 30 * 60 * 1000)` is not reliable: it can fire very
 * late, or effectively never until the tab happens to regain focus. Storing
 * `lastActivityAt` and re-checking `Date.now() - lastActivityAt` on every
 * tick of the existing 30s policy-poll interval (which already has to be
 * timestamp-based for the midnight check to self-heal) makes idle detection
 * just as self-healing: whenever that interval actually gets to run, it
 * immediately knows the true elapsed idle time, however late it runs.
 */
export function touchActivity() {
  const policy = getSessionPolicy();
  if (!policy) return;
  policy.lastActivityAt = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(policy));
  } catch { /* localStorage unavailable — non-fatal */ }
}

/**
 * True if the current policy is NOT "remember me" and more than
 * INACTIVITY_TIMEOUT_MS has elapsed since the last recorded activity.
 * "Remember me" sessions are never subject to the idle timeout.
 */
export function isInactivityExpired() {
  const policy = getSessionPolicy();
  if (!policy || policy.rememberMe) return false;
  const last = typeof policy.lastActivityAt === 'number' ? policy.lastActivityAt : policy.loginAt;
  return Date.now() - last >= INACTIVITY_TIMEOUT_MS;
}

/**
 * True if there IS a recorded policy and it has lapsed. A *missing* policy
 * (e.g. a session that predates this feature) is handled by the caller —
 * see AuthContext's bootstrap, which backfills a fresh policy rather than
 * force-logging-out a session that Supabase itself still considers valid.
 */
export function isSessionPolicyExpired() {
  const policy = getSessionPolicy();
  if (!policy) return false;
  return Date.now() >= policy.expiresAt;
}

/**
 * Record why a force-logout happened, so the next screen (LoginPage) can
 * tell the user. Call this right before clearing the session, not after —
 * it needs to land in localStorage before the redirect to /login occurs.
 */
export function setLogoutReason(reason) {
  try {
    localStorage.setItem(LOGOUT_REASON_KEY, reason);
  } catch { /* localStorage unavailable — non-fatal, notice is best-effort */ }
}

/** Read-and-clear: the notice should only ever show once. */
export function consumeLogoutReason() {
  try {
    const reason = localStorage.getItem(LOGOUT_REASON_KEY);
    if (reason) localStorage.removeItem(LOGOUT_REASON_KEY);
    return reason;
  } catch {
    return null;
  }
}