/**
 * ERJ Smart Solutions — Encryption Utility
 * ==========================================
 * AES-256-CBC + HMAC-SHA-256 (Encrypt-then-MAC)
 *
 * Architecture
 * ────────────
 * This app talks to Supabase directly — there is no custom API server that
 * can transparently encrypt/decrypt on the wire.  The `api.js` interceptor
 * approach only works when requests go through your own backend.
 *
 * Instead we use **field-level encryption**: sensitive columns are encrypted
 * before they are written to Supabase and decrypted after they are read back.
 * Everything else (IDs, timestamps, non-sensitive metadata) is stored as-is so
 * Supabase can still filter/sort on it.
 *
 * Columns encrypted
 * ─────────────────
 *   accounts            → password
 *   pending_registrations → password, username (credentials)
 *
 * Columns intentionally NOT encrypted
 * ─────────────────────────────────────
 *   Anything Supabase needs to filter on (email, subscription_id, employee_id,
 *   role, names) — encrypting these would break .eq() / .select() queries.
 *   If you need those private too, the right path is Row-Level Security (RLS)
 *   on the Supabase side, which is separate from this utility.
 *
 * Environment variables  (.env / .env.production)
 * ───────────────────────────────────────────────
 *   VITE_ENCRYPTION_KEY=<strong passphrase, min 20 chars>
 *   VITE_ENCRYPT_PAYLOADS=true        # set false to disable (dev only)
 *
 * Wire format (stored in DB as a plain string)
 * ─────────────────────────────────────────────
 *   "enc:v1:<base64 JSON { iv, ct, mac }>"
 *
 * The "enc:v1:" prefix lets you reliably detect an encrypted field vs a
 * legacy plaintext value, so old records and new records can coexist during
 * a gradual migration.
 *
 * Key derivation
 * ──────────────
 *   PBKDF2(passphrase, static-salt, 200_000 iter, SHA-256) → 256-bit AES key
 *   PBKDF2(passphrase, different-static-salt, 200_000 iter, SHA-256) → 256-bit HMAC key
 *   Keys are cached in memory after the first derivation (expensive op).
 */

const ALGO               = 'AES-CBC';
const KEY_BITS           = 256;
const IV_BYTES           = 16;
const PBKDF2_ITERATIONS  = 200_000;
const SALT_ENC           = 'erj-attms-enc-salt-v1';
const SALT_MAC           = 'erj-attms-mac-salt-v1';
const ENC_PREFIX         = 'enc:v1:';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2)
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// ─── Key derivation (cached) ─────────────────────────────────────────────────

const _keyCache = new Map();

async function deriveKeys(passphrase) {
  if (_keyCache.has(passphrase)) return _keyCache.get(passphrase);

  const enc          = new TextEncoder();
  const baseMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );

  const [encKey, macKey] = await Promise.all([
    crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode(SALT_ENC), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      baseMaterial,
      { name: ALGO, length: KEY_BITS },
      false,
      ['encrypt', 'decrypt'],
    ),
    crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode(SALT_MAC), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      baseMaterial,
      { name: 'HMAC', hash: 'SHA-256', length: KEY_BITS },
      false,
      ['sign', 'verify'],
    ),
  ]);

  const keys = { encKey, macKey };
  _keyCache.set(passphrase, keys);
  return keys;
}

// ─── Internal low-level encrypt / decrypt ────────────────────────────────────

function getPassphrase() {
  const key = import.meta.env.VITE_ENCRYPTION_KEY;
  if (!key) throw new Error('[crypto] VITE_ENCRYPTION_KEY is not set in .env');
  return key;
}

function isEncryptionEnabled() {
  return import.meta.env.VITE_ENCRYPT_PAYLOADS === 'true';
}

/**
 * _encryptString(plaintext) → "enc:v1:<base64JSON>"
 *
 * Low-level: encrypts a raw string (not an object).
 * Returns the prefixed cipher token ready to store in a DB column.
 */
async function _encryptString(plaintext) {
  const passphrase        = getPassphrase();
  const { encKey, macKey } = await deriveKeys(passphrase);

  const iv        = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ivHex     = bufToHex(iv);
  const encoded   = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: ALGO, iv }, encKey, encoded);
  const ctB64     = bufToBase64(cipherBuf);

  const macInput  = new TextEncoder().encode(`${ivHex}:${ctB64}`);
  const macBuf    = await crypto.subtle.sign('HMAC', macKey, macInput);
  const macHex    = bufToHex(macBuf);

  const envelope  = JSON.stringify({ iv: ivHex, ct: ctB64, mac: macHex });
  return ENC_PREFIX + btoa(envelope);
}

/**
 * _decryptString(token) → plaintext string
 *
 * Low-level: verifies HMAC and decrypts a "enc:v1:…" token.
 * Throws on MAC failure or bad format — never silently returns garbage.
 */
async function _decryptString(token) {
  if (!token.startsWith(ENC_PREFIX))
    throw new Error('[crypto] Token is missing enc:v1: prefix');

  const passphrase        = getPassphrase();
  const { encKey, macKey } = await deriveKeys(passphrase);

  const envelope  = JSON.parse(atob(token.slice(ENC_PREFIX.length)));
  const { iv: ivHex, ct: ctB64, mac: macHex } = envelope;

  // Verify HMAC first (Encrypt-then-MAC)
  const macInput  = new TextEncoder().encode(`${ivHex}:${ctB64}`);
  const valid     = await crypto.subtle.verify('HMAC', macKey, hexToBuf(macHex), macInput);
  if (!valid) throw new Error('[crypto] MAC verification failed — data may be tampered');

  const iv        = hexToBuf(ivHex);
  const cipherBuf = base64ToBuf(ctB64);
  const plainBuf  = await crypto.subtle.decrypt({ name: ALGO, iv }, encKey, cipherBuf);
  return new TextDecoder().decode(plainBuf);
}

// ─── Public field-level API ──────────────────────────────────────────────────

/**
 * encryptField(value)
 *
 * Encrypt a single string field before writing it to Supabase.
 *
 * - If VITE_ENCRYPT_PAYLOADS is not "true", returns the value as-is
 *   (dev / debug shortcut).
 * - If value is null/undefined, returns it unchanged.
 * - If value is already an "enc:v1:…" token (re-encrypt guard), returns as-is.
 *
 * Usage:
 *   const row = {
 *     email: form.email,                           // stored plain
 *     password: await encryptField(form.password), // stored encrypted
 *   };
 *   await supabase.from('accounts').insert(row);
 */
export async function encryptField(value) {
  if (!isEncryptionEnabled()) return value;
  if (value == null) return value;
  const str = String(value);
  if (str.startsWith(ENC_PREFIX)) return str; // already encrypted
  try {
    return await _encryptString(str);
  } catch (err) {
    console.warn('[crypto] encryptField failed, storing plaintext:', err.message);
    return value; // graceful degradation
  }
}

/**
 * decryptField(value)
 *
 * Decrypt a single field after reading it from Supabase.
 *
 * - If value is not an "enc:v1:…" token, returns it unchanged (backward
 *   compatible — old plaintext rows work automatically).
 * - If value is null/undefined, returns it unchanged.
 *
 * Usage:
 *   const account = data[0];
 *   account.password = await decryptField(account.password);
 */
export async function decryptField(value) {
  if (value == null) return value;
  const str = String(value);
  if (!str.startsWith(ENC_PREFIX)) return value; // plaintext / legacy row
  try {
    return await _decryptString(str);
  } catch (err) {
    console.error('[crypto] decryptField failed:', err.message);
    throw new Error('Failed to decrypt field. Key mismatch or tampered data.');
  }
}

/**
 * encryptFields(obj, fields)
 *
 * Convenience wrapper: encrypt multiple named fields in an object in parallel.
 *
 * Usage:
 *   const safeRow = await encryptFields(form, ['password', 'username']);
 */
export async function encryptFields(obj, fields) {
  const result = { ...obj };
  await Promise.all(
    fields.map(async (f) => {
      result[f] = await encryptField(obj[f]);
    })
  );
  return result;
}

/**
 * decryptFields(obj, fields)
 *
 * Convenience wrapper: decrypt multiple named fields from a DB row in parallel.
 *
 * Usage:
 *   const row = await decryptFields(dbRow, ['password', 'username']);
 */
export async function decryptFields(obj, fields) {
  if (!obj) return obj;
  const result = { ...obj };
  await Promise.all(
    fields.map(async (f) => {
      result[f] = await decryptField(obj[f]);
    })
  );
  return result;
}

// ─── Legacy payload API (kept for api.js interceptor compatibility) ───────────
// These wrap JSON objects — used if you ever route calls through a backend proxy.

/**
 * encryptPayload(data) — wraps a full JS value in an encrypted envelope.
 * Returns { encrypted: true, payload: "<base64>" }
 */
export async function encryptPayload(data) {
  try {
    const token = await _encryptString(JSON.stringify(data));
    // reuse the same token format but wrapped so api.js can detect it
    return { encrypted: true, payload: token.slice(ENC_PREFIX.length) };
  } catch (err) {
    console.warn('[crypto] encryptPayload failed, sending plaintext:', err.message);
    return { encrypted: false, payload: data };
  }
}

/**
 * decryptPayload(response) — decrypts a { encrypted, payload } envelope.
 */
export async function decryptPayload(response) {
  if (!response?.encrypted) return response?.payload ?? response;
  try {
    const token   = ENC_PREFIX + response.payload;
    const plain   = await _decryptString(token);
    return JSON.parse(plain);
  } catch (err) {
    console.error('[crypto] decryptPayload failed:', err.message);
    throw new Error('Failed to decrypt server response. Key mismatch or tampered data.');
  }
}

/**
 * generateToken(length) — cryptographically secure random hex token.
 */
export function generateToken(length = 32) {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}