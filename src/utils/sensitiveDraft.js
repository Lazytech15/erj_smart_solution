import { encryptField, decryptField } from './crypto';

/**
 * Sister module to formDraft.js, but for the fields that module deliberately
 * refuses to touch — passwords and card details.
 *
 * Two differences from the regular (localStorage) draft:
 *
 *   1. Backed by sessionStorage, not localStorage — the draft disappears the
 *      moment the tab/browser is closed, instead of sitting on disk for up
 *      to 24h. A reload or an accidental tab discard is exactly the case
 *      users hit ("I went back a step and my password was gone"); a closed
 *      browser is not.
 *   2. Every field is passed through the same AES-256-CBC field encryption
 *      already used for these columns in Supabase (see utils/crypto.js), so
 *      even something reading sessionStorage directly (a browser extension,
 *      devtools left open, etc.) doesn't get plaintext secrets for free.
 *
 * This still isn't "safe against a compromised machine" — nothing
 * client-side can be — but it closes the gap of "form data lost on
 * reload" without regressing to storing raw passwords/card numbers on disk.
 */

const VERSION = 1;

export async function saveSensitiveDraft(key, fields) {
  try {
    const encrypted = {};
    await Promise.all(
      Object.entries(fields).map(async ([k, v]) => {
        encrypted[k] = v ? await encryptField(v) : v;
      })
    );
    sessionStorage.setItem(key, JSON.stringify({ v: VERSION, savedAt: Date.now(), data: encrypted }));
  } catch {
    // best-effort — never break the form over this
  }
}

/**
 * Synchronous, unencrypted variant of saveSensitiveDraft — used only as an
 * emergency flush right before the tab hides/unloads/reloads.
 *
 * saveSensitiveDraft awaits WebCrypto (crypto.subtle) before writing, and
 * the browser does not guarantee a pending async task finishes during
 * `pagehide`/`beforeunload` — a reload that happens to land mid-encryption
 * could lose that last write entirely. This bypasses encryption and writes
 * plaintext directly and synchronously, so it's guaranteed to land before
 * the page actually goes away.
 *
 * This is safe to mix with the encrypted format: loadSensitiveDraft (via
 * decryptField) already passes through any value that isn't prefixed
 * "enc:v1:" unchanged, so a plaintext emergency-saved draft loads exactly
 * like a normal one. The very next debounced save (on the next page load,
 * once the user resumes typing) upgrades it back to encrypted.
 */
export function saveSensitiveDraftSync(key, fields) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ v: VERSION, savedAt: Date.now(), data: fields }));
  } catch {
    // best-effort
  }
}

export async function loadSensitiveDraft(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== VERSION || !parsed.data) return null;
    const decrypted = {};
    await Promise.all(
      Object.entries(parsed.data).map(async ([k, v]) => {
        decrypted[k] = v ? await decryptField(v) : v;
      })
    );
    return decrypted;
  } catch {
    return null;
  }
}

export function clearSensitiveDraft(key) {
  try { sessionStorage.removeItem(key); } catch { /* non-fatal */ }
}
