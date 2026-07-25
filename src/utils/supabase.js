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

export function fetchWithTimeout(url, options = {}) {
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
  const LOCK_FN_TIMEOUT_MS = 12_000;

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
// legitimately take: the auth lock (LOCK_FN_TIMEOUT_MS, 12s) plus a single
// fetch (FETCH_TIMEOUT_MS, 15s) run sequentially inside a call like
// signOut() — up to ~27s worst case. This was previously 10s, shorter than
// that chain, which meant withAuthTimeout was giving up and letting the UI
// move on (e.g. clearing local session on logout) while the real signOut()
// call — and the lock it was holding — was still legitimately running for
// several more seconds. The very next auth call (e.g. signing back in)
// could then queue behind a lock this layer had already stopped waiting on.
export const AUTH_CALL_TIMEOUT_MS = 30_000;

export function withAuthTimeout(promise, label = 'auth-call') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), AUTH_CALL_TIMEOUT_MS)
    ),
  ]);
}

// Note: the previous manual `visibilitychange` → `getSession()` call was
// removed. supabase-js already listens for tab focus/visibility internally
// to refresh the session, so the manual call was redundant — and, worse,
// was the second concurrent caller that could race the SDK's own internal
// refresh and trigger the deadlock described above.