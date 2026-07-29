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
const inFlightRequests = new Map(); // controller -> { deadline, kind }

// Requests are tagged by which Supabase subsystem they belong to, based on
// the request URL (auth calls hit `/auth/v1/...`, everything else — table
// reads/writes, RPC — hits `/rest/v1/...` or similar). This lets a targeted
// reset (see forceResetStuckAuthState below) abort only the auth-lock call
// that's actually stuck, instead of every unrelated request that happens to
// be in flight at the same moment.
function requestKindFromUrl(url) {
  const str = typeof url === 'string' ? url : url?.toString?.() ?? '';
  return str.includes('/auth/v1/') ? 'auth' : 'data';
}

function sweepOverdueRequests() {
  const now = Date.now();
  for (const [controller, meta] of inFlightRequests) {
    if (now >= meta.deadline) controller.abort();
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
// A small in-JS queue keeps at most MAX_CONCURRENT_REQUESTS_PER_TAB actually
// in flight at once; anything beyond that waits its turn here instead of
// occupying (and starving) a real browser connection.
//
// THIS BUDGET IS PER TAB, AND THAT'S THE BUG BEHIND "only happens when I have
// it open in another tab / browser window": activeRequestCount/requestQueue
// below are plain in-memory module state, invisible to any other tab. Every
// tab independently believes it can safely run 4 concurrent requests — but
// the real per-host connection cap this whole mechanism exists to respect is
// shared by the BROWSER across every tab of the same origin, not handed out
// fresh per tab. Two tabs open at once (e.g. the app left open in one window
// and reopened in another) can together fire up to 2 x 4 = 8 concurrent
// requests at a shared 6-connection budget — reproducing, between tabs, the
// exact socket-starvation pileup this file already guards against within a
// single tab. Worse, the self-heal (forceResetStuckAuthState, below) only
// resets the CALLING tab's bookkeeping — it can't do anything about a
// *different* tab that's still holding sockets, so the reset appears to run
// (it's logged) but the timeouts keep coming back.
//
// Fix: give every tab a live, browser-native view of how many sibling tabs
// are currently open, via navigator.locks — each tab just holds its own
// uniquely-named lock for its whole lifetime as a presence marker (the
// browser auto-releases it on close/crash/navigation, no cleanup needed),
// and any tab can list currently-held locks to count how many are alive
// right now. Note this never WAITS to acquire a *shared* lock name the way
// the old navigator.locks-based auth lock did (see inProcessLock above for
// why that got replaced) — each tab's presence lock has a unique name it's
// guaranteed to get instantly, so there's no queue here to get stuck. Then
// simply divide the same conservative single-tab budget this file already
// chose (4) by however many tabs are actually open, so the *combined* total
// across all tabs stays close to what one tab alone was already using.
const MAX_CONCURRENT_REQUESTS_PER_TAB = 4;
let openTabCount = 1;

if (typeof navigator !== 'undefined' && navigator.locks?.query && typeof document !== 'undefined') {
  const tabId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  // Held for the entire life of the tab; intentionally never resolves the
  // inner promise — that's what keeps the lock (and this tab's "I'm open"
  // signal) alive until the browser tears the page down.
  const presenceController = new AbortController();
  navigator.locks
    .request(`app-tab-presence:${tabId}`, { signal: presenceController.signal }, () => new Promise(() => {}))
    .catch(() => {});

  // Vite HMR replaces this module in place whenever it (or a file that
  // imports it) is edited — that is NOT a tab close/crash/navigation, so the
  // "browser auto-releases it on teardown" assumption above never kicks in
  // for HMR. Every hot reload during a dev session was silently acquiring
  // ANOTHER presence lock on top of the still-held old one, permanently
  // inflating openTabCount for the rest of the session (this tab looking
  // like more and more "sibling tabs" to itself) and shrinking its own real
  // connection-slot budget (MAX_CONCURRENT_REQUESTS_PER_TAB / openTabCount)
  // until routine request bursts (e.g. the handful of queries fired right
  // after login) blew past it and started queuing/timing out — exactly the
  // cascading failure this file's own recovery logging shows. Abort this
  // tab's own lock right before the module is torn down for a hot reload so
  // it doesn't outlive the code that's supposed to be holding it.
  if (import.meta.hot) {
    import.meta.hot.dispose(() => presenceController.abort());
  }

  async function refreshOpenTabCount() {
    try {
      const state = await navigator.locks.query();
      const held = (state.held || []).filter((l) => l.name?.startsWith('app-tab-presence:'));
      openTabCount = Math.max(1, held.length);
    } catch {
      // query() unsupported/failed — keep the last known count (starts at 1,
      // i.e. behaves exactly like the old single-tab-only logic).
    }
    // A closed sibling tab freeing up budget should let anything already
    // queued here proceed immediately, not wait for its own next tick.
    runNext();
  }
  refreshOpenTabCount();
  setInterval(refreshOpenTabCount, 5_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshOpenTabCount();
  });
}

// Never drop to true single-request serialization even with many tabs open —
// a little oversubscription under heavy multi-tab use is a far smaller risk
// than re-introducing single-file queuing latency for every save/poll.
function currentSlotBudget() {
  return Math.max(2, Math.floor(MAX_CONCURRENT_REQUESTS_PER_TAB / openTabCount));
}

let activeRequestCount = 0;
const requestQueue = [];

function runNext() {
  if (activeRequestCount >= currentSlotBudget() || requestQueue.length === 0) return;
  activeRequestCount++;
  const entry = requestQueue.shift();
  clearTimeout(entry.timer);
  entry.resolve();
}

// Every other wait in this file is bounded — FETCH_TIMEOUT_MS,
// DB_CALL_TIMEOUT_MS, AUTH_CALL_TIMEOUT_MS, LOCK_FN_TIMEOUT_MS,
// IN_FLIGHT_SAFETY_TIMEOUT_MS — except this one. acquireSlot() only
// resolves when releaseSlot() (below) calls runNext(), which only happens
// once activeRequestCount actually decrements. A request sitting in
// requestQueue hasn't been given a controller yet, so it isn't in
// inFlightRequests either — invisible to sweepOverdueRequests AND to
// forceResetStuckAuthState. So if activeRequestCount ever drifts out of
// sync with reality (a slot acquired whose owner's fetch never truly
// settles even after abort() — see the note on releaseSlot below for why
// that can happen), every *future* request queues here forever with zero
// visible network activity and nothing in this file can ever recover it —
// this is what actually required a hard reload. Give the queue wait itself
// a hard ceiling so a request that's waited too long for a slot fails
// fast and visibly instead of hanging silently.
const QUEUE_WAIT_TIMEOUT_MS = FETCH_TIMEOUT_MS;

function acquireSlot() {
  return new Promise((resolve, reject) => {
    const entry = { resolve };
    entry.timer = setTimeout(() => {
      const idx = requestQueue.indexOf(entry);
      if (idx === -1) return; // already granted a slot; timer fired too late to matter
      requestQueue.splice(idx, 1);
      reject(new Error('Timed out waiting for an available connection slot'));
    }, QUEUE_WAIT_TIMEOUT_MS);
    requestQueue.push(entry);
    runNext();
  });
}

function releaseSlot() {
  activeRequestCount--;
  runNext();
}

export function fetchWithTimeout(url, options = {}) {
  const kind = requestKindFromUrl(url);
  console.debug(`[fetch] queuing (${kind}):`, typeof url === 'string' ? url : url?.toString?.());
  return acquireSlot().then(() => {
    console.debug(`[fetch] slot granted, dispatching (${kind}):`, typeof url === 'string' ? url : url?.toString?.());
    const controller = new AbortController();
    const deadline = Date.now() + FETCH_TIMEOUT_MS;
    inFlightRequests.set(controller, { deadline, kind });
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
// Diagnostic-only counter, not used for any control flow — just gives each
// lock attempt a distinguishable id in the console so overlapping/queued
// attempts for the same lock name can be told apart when reading the logs.
let lockAttemptSeq = 0;
async function inProcessLock(name, acquireTimeout, fn) {
  const attemptId = ++lockAttemptSeq;
  console.debug(`[authLock #${attemptId}] requesting "${name}" (queue depth before this: ${lockChains.has(name) ? 1 : 0})`);
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
  console.debug(`[authLock #${attemptId}] acquired "${name}", running holder`);

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
    console.debug(`[authLock #${attemptId}] releasing "${name}"`);
    release();
    if (lockChains.get(name) === current) lockChains.delete(name);
  }
}

// The client itself is reassignable (see recreateSupabaseClient below) —
// every importer uses `import { supabase } from ...`, which is a live ES
// module binding, so reassigning this reference updates what every caller
// sees without them needing to re-import anything.
function buildSupabaseClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      lock: inProcessLock,
    },
    global: {
      fetch: fetchWithTimeout,
    },
  });
}

export let supabase = buildSupabaseClient();

// Dispatched whenever the client is torn down and rebuilt (see
// recreateSupabaseClient below). Anything holding a subscription tied to
// the OLD client instance — most importantly AuthContext's
// supabase.auth.onAuthStateChange listener — is now listening to a client
// that's being discarded and will never fire again. Listen for this event
// and re-subscribe against the new `supabase` reference.
export const SUPABASE_CLIENT_RECREATED_EVENT = 'supabase:client-recreated';

// ── Nuclear option: rebuild the client entirely ─────────────────────────────
// Everything above this point (fetchWithTimeout's slot queue + its own
// timeout, inProcessLock with its acquire/hold timeouts, withAuthTimeout/
// withDbTimeout) is a layer WE wrote and fully control — every one of them
// has a way to fail fast and recover. What none of them can reach is
// GoTrueClient's own PRIVATE internal state (its in-memory session cache,
// its own retry/refresh bookkeeping) — that's inside supabase-js itself,
// invoked before our `lock` or `fetch` overrides are ever called for a
// given request. If something in there gets wedged, calls die with zero
// trace in our own logging (no authLock line, no [fetch] line) and no
// amount of patching our wrapper code reaches it — confirmed by the console
// trace showing exactly that: the last successful authLock cycle followed
// by silence, repeating on every subsequent attempt.
// The only thing guaranteed to reset that private state short of a full
// page reload is discarding the GoTrueClient instance and constructing a
// fresh one. This does throw away any of the old client's own in-flight
// promises, but by the time this runs the pollers have already given up
// on those (consecutive-failure threshold), so there's nothing worth
// preserving on the old instance.
export function recreateSupabaseClient() {
  console.warn('[supabase] Rebuilding the Supabase client after repeated unrecoverable failures.');
  supabase = buildSupabaseClient();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SUPABASE_CLIENT_RECREATED_EVENT));
  }
}

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
//
// IMPORTANT: this only touches auth-kind requests (see requestKindFromUrl
// above). It used to abort every entry in inFlightRequests indiscriminately,
// which meant a stuck resume-time getSession() call would also abort
// whatever unrelated data request (a poll tick, a putSubscription write,
// etc.) happened to be in flight at that exact moment — those requests
// hadn't actually timed out on their own, they were just collateral damage,
// which is what made unrelated failures (attendance poll, notifications
// poll, a save) all appear to fail together the instant a tab regained
// focus. Scoping the abort to auth-kind entries means only the genuinely
// wedged auth call gets cut short; other in-flight requests keep running
// and succeed or fail on their own independent timeout.
// Tracks how many times in a row forceResetStuckAuthState has been called
// with no successful request in between. Our own bookkeeping (locks,
// in-flight requests, connection slots) is cheap to reset and safe to try
// first — but if it keeps getting called again right after, that bookkeeping
// was never the actual problem. Escalate to rebuilding the client itself
// once that's happened enough times in a row.
let consecutiveForceResets = 0;
const FORCE_RESET_ESCALATION_THRESHOLD = 2;

// Every layer above this point is something the app can repair on its own —
// a rebuild included. But if a rebuild ALSO doesn't lead to a success before
// the pollers give up and force-reset again, that's no longer "supabase-js's
// private state was wedged" (a rebuild fixes that) — it's a real outage or a
// dead network path, which nothing in this file can talk its way around.
// Surface the same "connection issue, please reload" prompt the resume-time
// session check (checkSessionOnResume, below) already uses for this exact
// situation, instead of silently rebuilding and retrying forever with the
// user never told anything is wrong. Reset in notifySupabaseRequestSucceeded
// alongside consecutiveForceResets so a client that recovers isn't penalized
// by a past bad streak.
let consecutiveRebuildsWithoutSuccess = 0;
const REBUILD_ESCALATION_THRESHOLD = 2;

export function forceResetStuckAuthState() {
  console.warn('[supabase] Forcing reset of internal auth lock / in-flight request state after repeated failures.');
  lockChains.clear();
  for (const [controller, meta] of inFlightRequests) {
    if (meta.kind === 'auth') {
      try { controller.abort(); } catch { /* already aborted/settled */ }
      inFlightRequests.delete(controller);
    }
  }
  // acquireSlot()'s own timeout (above) stops a *new* request from queuing
  // forever, but it can't repair activeRequestCount itself if it's already
  // drifted above reality — every future request would keep queuing behind
  // a budget that no longer reflects any real in-flight work. This is the
  // one piece of bookkeeping in this file with no other self-healing path,
  // so as a last resort, zero it and let anything already queued proceed.
  activeRequestCount = 0;
  runNext();

  consecutiveForceResets++;
  if (consecutiveForceResets >= FORCE_RESET_ESCALATION_THRESHOLD) {
    consecutiveForceResets = 0;
    recreateSupabaseClient();
    consecutiveRebuildsWithoutSuccess++;
    if (consecutiveRebuildsWithoutSuccess >= REBUILD_ESCALATION_THRESHOLD) {
      reportUnrecoverableConnectionIssue();
    }
  }
}

// Surfaces recovery from an unrecoverable connection state. Two very
// different situations share this one entry point:
//  - Tab hidden/minimized right now: nobody can be mid-edit in a tab they
//    aren't looking at, so there's nothing an announced-reload-on-return
//    could lose. BUT calling location.reload() WHILE hidden is unreliable —
//    browsers throttle/defer navigation for background tabs, which can leave
//    the page torn down (aborted requests, cleared client/lock state — see
//    forceResetStuckAuthState above, already run by the time this fires)
//    without the actual page swap ever completing until the tab is looked
//    at again. That reproduced as "switch away, switch back, everything is
//    just broken" — worse than the modal it was meant to replace. Instead,
//    only set a flag here; the visibilitychange listener below fires the
//    real reload() the instant the tab is actually foregrounded, which
//    browsers execute reliably, and still happens before the person has any
//    chance to click or type anything.
//  - Tab visible right now: someone may genuinely be looking at unsaved
//    work, so reloading out from under them is exactly the destructive
//    surprise the modal was written to avoid — show the prompt and let them
//    choose the moment.
let reloadPendingOnReturn = false;

export function reportUnrecoverableConnectionIssue() {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    console.warn('[supabase] Unrecoverable connection issue while tab is hidden/minimized — will reload as soon as it is foregrounded.');
    reloadPendingOnReturn = true;
    return;
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_UNVERIFIABLE_EVENT));
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && reloadPendingOnReturn) {
      reloadPendingOnReturn = false;
      window.location.reload();
    }
  });
}

// Called by any caller after a request actually succeeds, so a past streak
// of stuck-state resets doesn't count against a client that's healthy again.
export function notifySupabaseRequestSucceeded() {
  consecutiveForceResets = 0;
  consecutiveRebuildsWithoutSuccess = 0;
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
    // hand off to reportUnrecoverableConnectionIssue, which reloads silently
    // if the tab is hidden/minimized right now (nothing to lose) or shows
    // the recovery prompt if it's visible (don't reload out from under
    // someone who may be looking at unsaved work).
    console.warn('Session check on tab resume retry failed:', retryErr);
    reportUnrecoverableConnectionIssue();
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
  // itself confirms connectivity is back — run the same check then too,
  // REGARDLESS of visibility (no `document.visibilityState === 'visible'`
  // guard here anymore). Checking only while visible meant a connection
  // that died while the tab was backgrounded was never verified — let alone
  // fixed — until the person actually switched back, at which point any
  // failure surfaces exactly when they're mid-edit. Checking on `online`
  // even while hidden lets checkSessionOnResume's own failure path (above)
  // reload silently while nobody's looking, so by the time the tab is
  // actually switched back to, it's already fresh.
  window.addEventListener('online', () => {
    checkSessionOnResume();
  });
}

// ── Unconditional hard reload on return ─────────────────────────────────────
// Everything above tries to be surgical: detect an actual connection
// failure, then decide whether it's safe to reload. In practice that still
// left gaps — the pollers that would have detected a failure skip all work
// while hidden by design (see SubscriptionContext/NotificationsContext), so
// a lot of "away for a while" cases never accumulate enough failures to
// trip anything at all, and the page just silently sits stale on return.
// This replaces the guesswork with a blunt, deterministic rule instead:
// ANY time the tab was hidden/minimized and comes back, hard reload — no
// failure detection required. document.visibilityState (the Page Visibility
// API) is supported the same way across every current browser (Chrome,
// Edge, Firefox, Safari, mobile included), so this doesn't need per-browser
// handling. `pageshow` with `event.persisted` covers the one case
// visibilitychange doesn't reliably catch on its own: a page restored from
// the browser's back-forward cache (e.g. a mobile swipe-back gesture) can
// come back to "visible" without necessarily firing visibilitychange first
// on every platform.
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  let wasHiddenForReload = false;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      wasHiddenForReload = true;
    } else if (document.visibilityState === 'visible' && wasHiddenForReload) {
      wasHiddenForReload = false;
      window.location.reload();
    }
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      window.location.reload();
    }
  });
}