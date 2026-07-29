import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Supabase-js's underlying fetch() calls have no timeout of their own. If the
// browser stalls or silently drops the connection — which reliably happens
// after a tab sits backgrounded/inactive for a few minutes — the returned
// promise just hangs forever instead of rejecting. Nothing downstream ever
// resolves: buttons stay stuck on their loading state, and (worse) db.js's
// `cached()` helper stores that dead promise as "in flight" for its key, so
// every future call for that key is handed the same promise that will never
// settle — permanently, until a full page reload wipes the in-memory map.
// Fix: force every request through a hard timeout so a stalled connection
// fails fast (rejects) instead of hanging forever. Exported so other Supabase
// clients in the app (e.g. the no-session client in db.js) share it.
export const FETCH_TIMEOUT_MS = 15_000;

function anySignal(signals) {
  const controller = new AbortController();
  signals.forEach((s) => {
    if (s.aborted) controller.abort();
    else s.addEventListener('abort', () => controller.abort(), { once: true });
  });
  return controller.signal;
}

// Tracks every in-flight request's own abort controller + wall-clock
// deadline. The setTimeout below is the common-case trigger, but — same
// caveat as sessionPolicy.js's inactivity timer — a lone setTimeout is not
// reliable in a backgrounded/idle tab: Chrome can throttle or fully freeze
// JS timers there, so the timer that's supposed to call controller.abort()
// may simply never run. When that happens the request just sits open
// indefinitely (this is what the Network tab showed: rows still pending
// after 250+ seconds), and everything queued behind it — including the
// auth lock — backs up forever.
// Fix: also track each deadline by real timestamp, and sweep for anything
// overdue the moment the tab becomes visible again (self-healing, same
// pattern as the session-policy poll), instead of trusting the timer alone.
const inFlightRequests = new Map(); // controller -> deadline (ms epoch)

function sweepOverdueRequests() {
  const now = Date.now();
  for (const [controller, deadline] of inFlightRequests) {
    if (now >= deadline) controller.abort();
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sweepOverdueRequests();
  });
  // Backstop: visibilitychange doesn't fire for every wake-up path (e.g.
  // laptop sleep/resume can vary by OS/browser), so also sweep periodically.
  // This interval is just as subject to throttling as the per-request one,
  // but between the two of them — plus the visibility check — an overdue
  // request gets caught as soon as ANY of these actually gets to run.
  setInterval(sweepOverdueRequests, 10_000);
}

// Browsers cap concurrent connections to a single host (historically 6 for
// HTTP/1.1). Every timeout/retry mechanism in this file gives up on the JS
// side after its own budget, but the *browser* doesn't necessarily close the
// underlying socket that quickly. Pile up enough concurrent requests — write
// retries, session-resume retries, and the recurring notification/attendance
// pollers all firing within the same window — and the connection slots get
// fully occupied by requests that are each individually "fine" but
// collectively exceed the cap. Every *new* request, including totally
// unrelated ones like clicking Save or a plain getSession() check, then
// queues invisibly waiting for a free slot — with no network error and often
// no visible activity — which reproduces exactly the "everything times out
// together even though the internet is fine, only a reload fixes it" symptom.
// A small in-JS queue keeps at most MAX_CONCURRENT_REQUESTS actually in
// flight at once; anything beyond that waits its turn here instead of
// occupying (and starving) a real browser connection.
const MAX_CONCURRENT_REQUESTS = 4;
let activeRequestCount = 0;
const requestQueue = [];

function runNext() {
  if (activeRequestCount >= MAX_CONCURRENT_REQUESTS || requestQueue.length === 0) return;
  activeRequestCount++;
  const { resolve } = requestQueue.shift();
  resolve();
}

function acquireSlot() {
  return new Promise((resolve) => {
    requestQueue.push({ resolve });
    runNext();
  });
}

function releaseSlot() {
  activeRequestCount--;
  runNext();
}

export function fetchWithTimeout(url, options = {}) {
  return acquireSlot().then(() => {
    const controller = new AbortController();
    const deadline = Date.now() + FETCH_TIMEOUT_MS;
    inFlightRequests.set(controller, deadline);
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const signal = options.signal
      ? anySignal([options.signal, controller.signal])
      : controller.signal;

    return fetch(url, { ...options, signal }).finally(() => {
      clearTimeout(timeoutId);
      inFlightRequests.delete(controller);
      releaseSlot();
    });
  });
}

// supabase-js serializes internal auth calls (getSession, refreshSession, etc.)
// through the browser's navigator.locks API so concurrent callers don't race
// each other refreshing the same token. That lock is known to get stuck in
// some browsers/dev setups — most easily reproduced by React 18 StrictMode,
// which mounts the auth listener twice in quick succession.
//
// We previously bypassed the lock entirely (a no-op that just ran the
// callback directly). That removed the *stuck* lock, but it also removed
// the mutual exclusion itself — so two overlapping calls that both needed
// to refresh the session (e.g. supabase-js's own internal focus/refresh
// listener firing at the same moment as another caller doing the same
// thing after a tab sits idle/backgrounded for a minute or two) could both
// start refreshing at once. Without a lock serializing them, the second
// caller's internal "wait for the in-progress refresh" promise could be
// left waiting on a refresh that the first caller's logic never signals
// back to it — a deadlock that happens *before* any fetch() is ever
// issued, which is why it shows zero network activity: buttons (Save,
// Logout, etc.) that depend on a resolved session just hang forever.
//
// Fix: keep a REAL lock, just implement it ourselves in-process (a simple
// promise chain) instead of navigator.locks, so we get serialization
// without the cross-tab API that was getting stuck.
const lockChains = new Map();
async function inProcessLock(name, acquireTimeout, fn) {
  // .catch(() => {}) here is load-bearing: if we awaited the previous
  // holder's promise directly and it had REJECTED (e.g. a transient auth
  // error while the connection was flaky), `await previous` below would
  // throw immediately — before this call ever reaches fn(). Every next
  // caller for the same lock name would inherit that same rejection and
  // also bail before calling fn(), forever, since nothing would ever
  // replace the poisoned chain entry. That reproduced exactly "works the
  // first time, then nothing happens on the next attempt, only a refresh
  // fixes it" — a failed request anywhere would permanently wedge this
  // lock for every future request. Swallowing the rejection here just
  // means "wait for the previous holder to finish, success or not" — its
  // actual success/failure is that caller's own concern, not ours to
  // propagate.
  const previous = (lockChains.get(name) || Promise.resolve()).catch(() => {});
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  // Store `current` itself (not a derived promise) so the cleanup check
  // below actually matches and the map entry gets removed once this lock
  // is free — previously it stored a *different* promise object than what
  // was compared against, so the entry was never cleaned up.
  lockChains.set(name, current);

  // Don't wait forever behind a jammed predecessor — acquireTimeout <= 0
  // means "don't wait, fail fast if not immediately available" per the
  // navigator.locks contract supabase-js expects.
  if (acquireTimeout != null && acquireTimeout >= 0) {
    await Promise.race([
      previous,
      new Promise((resolve) => setTimeout(resolve, acquireTimeout)),
    ]);
  } else {
    await previous;
  }

  // Bound how long any single lock holder can hold the lock. Without this,
  // an operation that a caller elsewhere gives up *waiting* on (e.g.
  // withAuthTimeout racing a hung signOut() and moving on after 10s) keeps
  // running in the background and — since fn() never actually returns —
  // this lock's release() would never be called. Every future caller for
  // the same lock name (e.g. the next signInWithPassword()) would then
  // queue behind a lock that's held by an abandoned operation forever: the
  // exact "works once, then the very next auth action just spins forever"
  // pattern. Racing fn() itself against a timeout guarantees release()
  // always runs on schedule, regardless of what the real operation ends up
  // doing later (it's simply on its own once we stop waiting on it here).
  const LOCK_FN_TIMEOUT_MS = 6_000;

  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`lock "${name}" holder timed out`)), LOCK_FN_TIMEOUT_MS)
      ),
    ]);
  } finally {
    release();
    if (lockChains.get(name) === current) lockChains.delete(name);
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: inProcessLock,
  },
  global: {
    fetch: fetchWithTimeout,
  },
});

// Timeout guard for the auth calls themselves (getSession, signOut, ...).
// fetchWithTimeout above only protects the actual network request — it
// can't help if the hang happens earlier, inside supabase-js's own session/
// lock resolution, before fetch() is ever called. Wrap those calls so a
// stuck internal state still fails fast instead of hanging the UI forever.
// Must stay longer than the worst-case time the layers underneath can
// legitimately take: the auth lock (LOCK_FN_TIMEOUT_MS, 6s) plus a single
// fetch (FETCH_TIMEOUT_MS, 15s) run sequentially inside a call like
// signOut() — up to ~21s worst case, with a little headroom. (This used to
// assume a 12s lock timeout — 27s worst case, rounded up to a 30s budget.
// After shortening LOCK_FN_TIMEOUT_MS to 6s, keeping this at 30s just meant
// logout could sit waiting for up to 9 extra seconds it no longer needs, on
// top of everything that already made this slow.) Keeping it shorter than
// this bound risks giving up on a legitimately-still-running signOut() while
// its lock is still held — see the note above for why that's worse.
export const AUTH_CALL_TIMEOUT_MS = 22_000;

// Generic timeout race, usable for any Supabase call (auth or plain table
// query alike). Extracted so the same protection can wrap writes (see
// DB_CALL_TIMEOUT_MS / withDbTimeout below), not just auth calls.
export function withTimeout(promise, ms, label = 'call') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    ),
  ]);
}

export function withAuthTimeout(promise, label = 'auth-call') {
  return withTimeout(promise, AUTH_CALL_TIMEOUT_MS, label);
}

// ── Writes had no timeout at all ─────────────────────────────────────────────
// Every READ in db.js goes through cached(), which races the query against a
// 32s safety timeout (cache.js) and aborts it on expiry. But every WRITE
// (putSubscription, insertPendingRegistration, markAnnouncementRead,
// putAttendanceRecords, etc.) was a bare `await supabase.from(...)` call with
// no timeout wrapper at all. If the same stall reads are hardened against
// (session/token resolution stuck inside supabase-js, ahead of
// fetchWithTimeout's own 15s window, which only covers fetch() itself once
// it's actually issued) happens during a write, that write's promise never
// settles — it just hangs forever. The calling page's try/catch never runs,
// so the "Could not save, please try again" toast never fires: the
// Save/Update button just spins with no feedback and no error, indistinguishable
// from the app being broken. This gives every write in db.js the same bounded
// worst case reads already have, so a stuck save fails fast and visibly
// instead of hanging silently.
export const DB_CALL_TIMEOUT_MS = 20_000;

export function withDbTimeout(promise, label = 'db-call') {
  return withTimeout(promise, DB_CALL_TIMEOUT_MS, label);
}

// ── Retry helper for idempotent writes ──────────────────────────────────────
// withDbTimeout above turns a stalled write into a fast, visible rejection —
// but a fast rejection on the FIRST attempt during the same kind of transient
// network blip that checkSessionOnResume now retries through (stale
// connection after real tab inactivity — see the comment above that
// function) still means the save just fails once and gives up, dumping the
// person back to "could not save, please try again" with no automatic
// recovery. For writes that are safe to retry (a plain upsert of the full
// current state, like putSubscription — re-sending it if the first attempt's
// response was merely lost in transit doesn't corrupt anything), retry with
// a short backoff before surfacing a real failure.
// `queryFn` must be a factory (() => promise), not a promise, since retrying
// means re-issuing the Supabase call, not re-awaiting an already-settled one.
const WRITE_RETRY_DELAYS_MS = [8_000];

export async function withRetryOnTimeout(queryFn, label = 'db-write') {
  for (let attempt = 0; ; attempt++) {
    try {
      return await withDbTimeout(queryFn(), label);
    } catch (err) {
      const knownOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (knownOffline || attempt >= WRITE_RETRY_DELAYS_MS.length) throw err;
      console.warn(`[${label}] attempt ${attempt + 1} failed, retrying:`, err?.message || err);
      await new Promise((resolve) => setTimeout(resolve, WRITE_RETRY_DELAYS_MS[attempt]));
    }
  }
}

// ── Last-resort recovery: force-clear a wedged lock/fetch state ─────────────
// Every individual layer above (fetchWithTimeout, inProcessLock,
// withAuthTimeout) is supposed to self-heal within its own bound. But if
// something outside those bounds still leaves lockChains or inFlightRequests
// holding a stale entry — e.g. a browser API misbehaving in a way none of the
// above anticipated — every future Supabase call (reads, login, logout) just
// queues behind it forever with zero visible network activity, and today the
// only way out is a full page reload.
//
// This is a blunt instrument: it does NOT try to gracefully finish whatever
// was stuck, it just wipes the bookkeeping so the next call starts clean,
// exactly like a reload would, but without losing app state. Callers (the
// pollers below) only reach for this after several consecutive failures —
// a healthy app should never need it.
export function forceResetStuckAuthState() {
  console.warn('[supabase] Forcing reset of internal auth lock / in-flight request state after repeated failures.');
  lockChains.clear();
  for (const controller of inFlightRequests.keys()) {
    try { controller.abort(); } catch { /* already aborted/settled */ }
  }
  inFlightRequests.clear();
}

// ── Force a session check on tab return ─────────────────────────────────────
// A previous manual `visibilitychange` → `getSession()` call was removed on
// the theory that supabase-js's own internal focus/visibility handling makes
// it redundant. In practice it isn't: supabase-js's auto-refresh timer is
// paused while the tab is hidden and, on resume, reschedules based on a
// stale "time until expiry" estimate rather than forcing an immediate check.
// After a long idle period the JWT can already be expired by the time the
// tab is visible again, and nothing proactively refreshes it — every
// mutating call (Save, Update, Logout) then goes out with a dead token,
// fails, and only a full page reload (whose bootstrap explicitly calls
// getSession()) actually fixes it.
//
// This restores that forced check, but safely: getSession() goes through
// the same inProcessLock as everything else, which now has a hard 12s
// timeout (LOCK_FN_TIMEOUT_MS) plus withAuthTimeout as a second backstop —
// so unlike before, a stuck attempt here can no longer wedge the lock for
// every other caller. `checkingSessionOnResume` dedupes rapid-fire
// visibility events (e.g. alt-tabbing quickly) so we don't stack up
// redundant calls.
// Dispatched when a resume-time session check can't be verified. AuthContext
// listens for this and forces a clean logout instead of leaving the app in
// limbo — see the reasoning above checkSessionOnResume for why "just log a
// warning and carry on" isn't good enough here.
export const SESSION_UNVERIFIABLE_EVENT = 'supabase:session-unverifiable';

// After the tab sits inactive for real minutes, the *underlying network
// connection* — not our own lock/fetch bookkeeping — can go stale (router
// NAT table entry expired, Wi-Fi power-saving drop, VPN needing to
// re-handshake, etc.). The browser looks "connected" but the very first
// request has to wait for that dead path to actually be detected and a new
// one negotiated, which routinely takes 10-30+ seconds — longer than a
// single quick retry gives it. So: keep retrying with backoff over a real
// window instead of giving up after one extra attempt, AND listen for the
// browser's own `online` event to retry immediately the moment connectivity
// is confirmed back, rather than guessing when it's safe to try again.
// A single retry, not a growing backoff loop: each retry is another entry
// into the SAME shared lock queue (see inProcessLock above — every
// authenticated call, not just this one, funnels through one lock keyed by
// a fixed name). Repeatedly retrying doesn't skip that congestion, it adds
// to it — under real contention the retries can pile up faster than the
// queue drains, turning a recoverable delay into a pileup that blows past
// every higher-level timeout. One retry, after a real pause to let whatever
// is currently ahead in the queue clear, is more likely to succeed than four
// retries that all compete for the same spot.
const RESUME_RETRY_DELAY_MS = 8_000;
const RESUME_RETRY_TIMEOUT_MS = 10_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let checkingSessionOnResume = false;
async function checkSessionOnResume() {
  if (checkingSessionOnResume) return;
  checkingSessionOnResume = true;
  try {
    await withAuthTimeout(supabase.auth.getSession(), 'resume-getSession');
    return; // session verified — done.
  } catch (firstErr) {
    console.warn('Session check on tab resume failed, will retry once:', firstErr);
    forceResetStuckAuthState();
  }

  await sleep(RESUME_RETRY_DELAY_MS);
  try {
    await withTimeout(supabase.auth.getSession(), RESUME_RETRY_TIMEOUT_MS, 'resume-getSession-retry');
    return; // recovered — session is fine, nothing further to do.
  } catch (retryErr) {
    // One retry failed too. Don't keep re-entering the shared lock queue —
    // surface the recovery prompt instead of retrying forever with no
    // feedback while adding more contention.
    console.warn('Session check on tab resume retry failed, forcing logout:', retryErr);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SESSION_UNVERIFIABLE_EVENT));
    }
  } finally {
    checkingSessionOnResume = false;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkSessionOnResume();
  });
}

if (typeof window !== 'undefined') {
  // The visibilitychange check above fires the moment you switch back to
  // the tab, which can be before the underlying network has actually
  // recovered from an idle-drop. The `online` event fires when the browser
  // itself confirms connectivity is back, so also trigger a check then.
  window.addEventListener('online', () => {
    if (document.visibilityState === 'visible') checkSessionOnResume();
  });
}