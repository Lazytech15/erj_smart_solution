import axios from 'axios';
import { encryptPayload, decryptPayload } from '../utils/crypto';
import { cached, cacheInvalidate } from '../utils/cache';

/**
 * Axios instance for all API calls.
 *
 * Encryption is controlled by VITE_ENCRYPT_PAYLOADS in your .env:
 *   VITE_ENCRYPT_PAYLOADS=true   → AES-256-CBC on every request/response
 *   VITE_ENCRYPT_PAYLOADS=false  → plaintext (useful for local dev/debugging)
 *
 * The encryption key must also be set:
 *   VITE_ENCRYPTION_KEY=<strong passphrase matching your server's key>
 */
const ENCRYPT = import.meta.env.VITE_ENCRYPT_PAYLOADS === 'true';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor — attach auth token + encrypt outbound payload ────────
api.interceptors.request.use(
  async (config) => {
    // Attach JWT if present
    const token = localStorage.getItem('attms_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;

    // Encrypt body when enabled and there is a body to encrypt
    if (ENCRYPT && config.data != null) {
      try {
        config.data = await encryptPayload(config.data);
      } catch (err) {
        console.error('[api] Failed to encrypt request payload:', err.message);
        return Promise.reject(err);
      }
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// ── Response interceptor — decrypt inbound payload + invalidate cache ─────────
api.interceptors.response.use(
  async (response) => {
    // Only attempt decryption when the server signals the payload is encrypted
    if (response.data?.encrypted === true) {
      try {
        response.data = await decryptPayload(response.data);
      } catch (err) {
        return Promise.reject(new Error(`[api] Decryption error: ${err.message}`));
      }
    }

    // Any successful write invalidates cached GETs for that same resource,
    // so the next read is never stale right after a save.
    const method = response.config.method?.toLowerCase();
    if (method && method !== 'get') {
      const basePath = response.config.url?.split('?')[0];
      if (basePath) cacheInvalidate(`GET:${basePath}`);
    }

    return response;
  },
  (error) => {
    const msg = error.response?.data?.message || error.message || 'An error occurred';
    return Promise.reject(new Error(msg));
  },
);

/**
 * Drop-in replacement for api.get() that serves repeat reads from an
 * in-memory cache for `ttlMs` (default 60s) instead of hitting the server.
 * Concurrent calls to the same URL+params share one in-flight request.
 * Usage: `await api.cachedGet('/reports/summary', { params: { month } })`
 */
api.cachedGet = (url, config = {}, ttlMs = 60_000) => {
  const key = `GET:${url}:${JSON.stringify(config.params ?? {})}`;
  return cached(key, () => api.get(url, config), ttlMs);
};

export default api;
