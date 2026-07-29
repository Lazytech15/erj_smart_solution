/**
 * Tiny in-memory response cache with TTL + prefix-based invalidation.
 *
 * This app runs entirely in the browser (Vite/React + Supabase client),
 * so there is no server process to attach Redis/Memcached to — those are
 * out-of-process caches meant for a Node/PHP backend. The equivalent for
 * a client app is an in-memory cache that lives for the lifetime of the
 * tab/session, which is what this module provides.
 *
 * Usage:
 *   const hit = cacheGet('subscription:abc123');
 *   if (hit) return hit;
 *   const data = await fetchSomething();
 *   cacheSet('subscription:abc123', data, 60_000); // cache for 60s
 *   ...
 *   cacheInvalidate('subscription:abc123'); // on write
 */

const store = new Map();

/** Default time-to-live for cached entries, in ms. */
export const DEFAULT_TTL_MS = 60_000;

/**
 * @param {string} key
 * @returns {*} cached value, or undefined if missing/expired
 */
export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

/**
 * @param {string} key
 * @param {*} value
 * @param {number} ttlMs
 */
export function cacheSet(key, value, ttlMs = DEFAULT_TTL_MS) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Deletes a single key, or every key starting with `prefix` when it ends
 * with ':' (used to blow away a whole family of cached queries on write,
 * e.g. cacheInvalidate('pending:') clears pending registrations for every
 * subscription rather than tracking each one individually).
 * @param {string} keyOrPrefix
 */
export function cacheInvalidate(keyOrPrefix) {
  if (store.has(keyOrPrefix)) {
    store.delete(keyOrPrefix);
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(keyOrPrefix)) store.delete(key);
  }
}

/** Wipes the entire cache (e.g. on logout). */
export function cacheClear() {
  store.clear();
}

/**
 * Force-clears any currently in-flight cached() calls without waiting for
 * their own safety timeout. Used by the polling watchdog (see
 * supabase.js's forceResetStuckAuthState) to recover from a wedged
 * lower-level lock: clearing the lock alone doesn't help calls that are
 * already parked waiting on it — this drops their bookkeeping too, so the
 * *next* call for each key starts completely fresh instead of still being
 * handed a promise that's waiting on state that no longer exists.
 */
export function cacheForceClearInFlight() {
  inFlight.clear();
}

/**
 * Wraps an async function with cache-aside behavior: returns the cached
 * value if present, otherwise calls `fn`, caches the resolved value, and
 * returns it. Concurrent calls for the same key share one in-flight
 * request instead of firing duplicate queries.
 *
 * @param {string} key
 * @param {() => Promise<*>} fn
 * @param {number} ttlMs
 */
const inFlight = new Map();

// If `fn()` never settles (e.g. a stalled network connection with no timeout
// of its own), the promise stored in `inFlight` never settles either — every
// future call for that key would be handed that same dead promise forever,
// with no way to recover short of a full page reload. This safety timeout
// guarantees the in-flight slot is always released, even if fn() itself
// never resolves or rejects.
//
// IMPORTANT: this must stay LONGER than the worst-case time the layers
// underneath `fn()` can legitimately take to settle on their own — right now
// that's the auth lock (LOCK_FN_TIMEOUT_MS, 6s, see inProcessLock in
// utils/supabase.js) plus the per-fetch timeout (15s, FETCH_TIMEOUT_MS),
// which can run sequentially for a single call (resolve the session, THEN
// issue the request) for up to ~21s worst case — plus queueing time behind
// the per-tab connection-slot limiter (see MAX_CONCURRENT_REQUESTS_PER_TAB /
// currentSlotBudget in utils/supabase.js), which can add real delay under
// heavy multi-tab load. This was previously set to 20s — SHORTER than the
// lock+fetch worst case alone — so this safety net was giving up and
// clearing its own bookkeeping while the real underlying call was still
// legitimately running (and still holding the auth lock) for several more
// seconds. Any other call made during that gap would queue behind a lock
// this layer had already "moved on" from, i.e. the exact "one thing times
// out and everything after it hangs" pattern. Keep this comfortably above
// the sum of the layers it wraps, with margin, whenever those change.
const IN_FLIGHT_SAFETY_TIMEOUT_MS = 32_000;

export async function cached(key, fn, ttlMs = DEFAULT_TTL_MS) {
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;

  if (inFlight.has(key)) return inFlight.get(key);

  let safetyTimer;
  // Previously the safety timeout only gave up *waiting* on fn() — it never
  // actually cancelled the real request underneath. That left the genuine
  // network call (and the browser socket it was holding) running in the
  // background indefinitely. Repeat that a few times (e.g. a 15s poll that
  // keeps stalling) and every connection to the Supabase host ends up tied
  // up by zombied requests nobody is waiting on anymore — at which point
  // EVERY other fetch, including Save/Logout, just queues forever waiting
  // for a free socket, with no visible network activity and no error.
  // Passing fn() an AbortController and actually aborting it here tears
  // down the real connection the moment we give up on it, instead of
  // leaving it to (maybe) time out on its own later.
  const controller = new AbortController();
  const promise = (async () => {
    try {
      const safety = new Promise((_, reject) => {
        safetyTimer = setTimeout(() => {
          controller.abort();
          reject(new Error(`cached(): "${key}" timed out without settling`));
        }, IN_FLIGHT_SAFETY_TIMEOUT_MS);
      });

      const value = await Promise.race([fn(controller.signal), safety]);
      clearTimeout(safetyTimer);
      if (value !== null && value !== undefined) {
        cacheSet(key, value, ttlMs);
      }
      return value;
    } finally {
      clearTimeout(safetyTimer);
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}