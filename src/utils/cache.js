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
// that's the auth lock (12s, see inProcessLock in utils/supabase.js) plus
// the per-fetch timeout (15s, FETCH_TIMEOUT_MS), which can run sequentially
// for a single call (resolve the session, THEN issue the request) for up to
// ~27s worst case. This was previously set to 20s — SHORTER than that
// worst case — so this safety net was giving up and clearing its own
// bookkeeping while the real underlying call was still legitimately
// running (and still holding the auth lock) for several more seconds.
// Any other call made during that gap would queue behind a lock this layer
// had already "moved on" from, i.e. the exact "one thing times out and
// everything after it hangs" pattern. Keep this comfortably above the sum
// of the layers it wraps, with margin, whenever those change.
const IN_FLIGHT_SAFETY_TIMEOUT_MS = 32_000;

export async function cached(key, fn, ttlMs = DEFAULT_TTL_MS) {
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;

  if (inFlight.has(key)) return inFlight.get(key);

  let safetyTimer;
  const promise = (async () => {
    try {
      const safety = new Promise((_, reject) => {
        safetyTimer = setTimeout(
          () => reject(new Error(`cached(): "${key}" timed out without settling`)),
          IN_FLIGHT_SAFETY_TIMEOUT_MS
        );
      });

      const value = await Promise.race([fn(), safety]);
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
