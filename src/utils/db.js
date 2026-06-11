/**
 * db.js — IndexedDB wrapper for ERJ attendance management system
 *
 * Database layout
 * ───────────────
 * DB name : attms_db
 * Stores  :
 *   accounts        – all registered user accounts (keyed by email)
 *   subscriptions   – one record per tenant, keyed by subscriptionId
 *
 * All subscription data (employees, attendance, leaves, shifts, departments,
 * settings) lives inside the single  subscriptions  record for that tenant.
 * This keeps each subscriber's data fully isolated.
 */

const DB_NAME    = 'attms_db';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('accounts')) {
        db.createObjectStore('accounts', { keyPath: 'email' });
      }
      if (!db.objectStoreNames.contains('subscriptions')) {
        db.createObjectStore('subscriptions', { keyPath: 'subscriptionId' });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

// ── Generic helpers ──────────────────────────────────────────────────────────

async function dbGet(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

async function dbPut(store, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function dbGetAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// ── Account helpers ──────────────────────────────────────────────────────────

export async function getAccount(email)       { return dbGet('accounts', email); }
export async function putAccount(account)     { return dbPut('accounts', account); }
export async function getAllAccounts()        { return dbGetAll('accounts'); }

// ── Subscription helpers ─────────────────────────────────────────────────────

export async function getSubscription(id)    { return dbGet('subscriptions', id); }
export async function putSubscription(state) { return dbPut('subscriptions', state); }
