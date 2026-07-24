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
