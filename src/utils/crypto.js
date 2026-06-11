const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;

async function deriveKey(passphrase) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('attms-salt-v1'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptPayload(data, passphrase = 'default-dev-key') {
  try {
    const key = await deriveKey(passphrase);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded);
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return { encrypted: true, payload: btoa(String.fromCharCode(...combined)) };
  } catch {
    return { encrypted: false, payload: data };
  }
}

export async function decryptPayload(response, passphrase = 'default-dev-key') {
  if (!response?.encrypted) return response?.payload ?? response;
  try {
    const key = await deriveKey(passphrase);
    const combined = new Uint8Array(atob(response.payload).split('').map(c => c.charCodeAt(0)));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    return response?.payload ?? response;
  }
}

export function generateToken(length = 32) {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}