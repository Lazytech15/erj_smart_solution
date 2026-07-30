/**
 * Lightweight localStorage-backed "form draft" persistence.
 *
 * utils/cache.js (in-memory) intentionally dies with the tab — it's a
 * response cache for data fetched *from* the server. This is the opposite
 * case: data typed *by* the user that hasn't been saved anywhere yet, which
 * needs to survive an actual page reload (the user alt-tabs to Excel to
 * check a number, the browser reclaims/discards the tab in the background,
 * they hit refresh by habit, etc.) so a half-filled form isn't lost.
 *
 * Only ever holds ONE draft per key. Callers are responsible for calling
 * clearDraft() once the form has been submitted successfully — this module
 * has no idea what "submitted" means for any given form.
 */

const VERSION = 1;

function safeParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * @param {string} key
 * @param {object} data  plain, JSON-serializable form data to persist
 */
export function saveDraft(key, data) {
  try {
    const payload = { v: VERSION, savedAt: Date.now(), data };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // localStorage unavailable (private browsing) or over quota — draft
    // saving is best-effort and must never break the form itself.
  }
}

/**
 * @param {string} key
 * @param {number} [ttlMs] drafts older than this are treated as stale and dropped (default 24h)
 * @returns {object|null} the saved `data`, or null if missing/expired/corrupt
 */
export function loadDraft(key, ttlMs = 24 * 60 * 60 * 1000) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = safeParse(raw);
    if (!parsed || parsed.v !== VERSION || !parsed.data) return null;
    if (Date.now() - parsed.savedAt > ttlMs) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

/** @param {string} key */
export function clearDraft(key) {
  try { localStorage.removeItem(key); } catch { /* non-fatal */ }
}

/**
 * Finds saved drafts whose key starts with `prefix` — used by "edit"-style
 * forms where the draft key encodes which record was being edited (e.g.
 * `draft:edit-employee:<userId>:<employeeId>`), so the page can discover
 * "was I editing something when the reload happened?" *before* it knows
 * which record that was, then re-open the right modal for it.
 *
 * Skips stale/corrupt entries the same way loadDraft() does.
 *
 * @param {string} prefix
 * @param {number} [ttlMs] same meaning as loadDraft's ttlMs (default 24h)
 * @returns {Array<{ key: string, data: object }>}
 */
export function findDraftsByPrefix(prefix, ttlMs = 24 * 60 * 60 * 1000) {
  const found = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const data = loadDraft(key, ttlMs);
      if (data) found.push({ key, data });
    }
  } catch {
    // localStorage unavailable — nothing to restore.
  }
  return found;
}
