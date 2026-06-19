/**
 * ABAC — Attribute-Based Access Control
 *
 * Evaluates four attribute axes on every login attempt:
 *   1. Identity / Role  — what the user IS
 *   2. Time             — WHEN they are logging in (always in PST / UTC+8)
 *   3. Device           — WHAT device they are using
 *   4. Location / IP    — WHERE the request is coming from
 *
 * The result is always one of:
 *   ALLOW  — all checks passed, proceed normally
 *   DENY   — hard block (wrong hours, blacklisted IP, etc.)
 *   FLAG   — allow but record a security alert (unusual but not impossible)
 */

// ─── Timezone helpers (Philippines Standard Time = UTC+8, no DST) ────────────

const PH_TZ = 'Asia/Manila';

/**
 * Returns the current time formatted in PST as a readable string
 * that is safe to store in Supabase as a text column.
 * Example: "2026-06-19 09:39:11 PST"
 *
 * Supabase always stores timestamptz in UTC. Storing this as a separate
 * text column lets you read Philippine time directly in the Table Editor
 * without doing mental +8 arithmetic.
 */
function nowInPST() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PH_TZ,
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
    hour:     '2-digit',
    minute:   '2-digit',
    second:   '2-digit',
    hour12:   false,
  }).formatToParts(new Date());

  const get = (t) => parts.find(p => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} PST`;
}

/**
 * Returns the current hour (0–23) in PST.
 * Uses Intl so it's correct even if the user's browser is set to
 * a different timezone (e.g. a VPN user in a different region).
 */
function hourInPST() {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: PH_TZ,
    hour:     'numeric',
    hour12:   false,
  }).format(new Date());
  const n = parseInt(h, 10);
  return isNaN(n) ? new Date().getHours() : n; // fallback to browser local
}

/**
 * Returns the day-of-week (0=Sun … 6=Sat) in PST.
 */
function dayInPST() {
  const label = new Date().toLocaleDateString('en-US', {
    timeZone: PH_TZ,
    weekday:  'short',
  });
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(label);
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const ABAC_RESULT = {
  ALLOW: 'ALLOW',
  DENY:  'DENY',
  FLAG:  'FLAG',
};

/**
 * Business-hours policy per role — all hours in PST (UTC+8).
 * Outside these windows the login is DENIED for admin / hr / manager
 * and FLAGGED for employee (shift work).
 */
const ROLE_HOURS = {
  admin:    { start: 5, end: 22 },   // 5 AM – 10 PM PST
  hr:       { start: 5, end: 22 },
  manager:  { start: 5, end: 23 },
  employee: { start: 0, end: 24 },   // employees: any hour (shift work)
};

/**
 * Hours (PST) that are always suspicious regardless of role.
 * Logins between 01:00–03:59 PST are DENIED for privileged roles
 * and FLAGGED for employees.
 */
const ATTACKER_HOURS = { start: 1, end: 4 }; // 1 AM – 3:59 AM PST

// Storage keys
const DEVICE_KEY  = 'abac_device_id';
const SESSION_KEY = 'abac_session';
const AUDIT_KEY   = 'abac_audit_log';

// Brute-force lockout settings
const MAX_ATTEMPTS      = 5;
const LOCKOUT_MINUTES   = 15;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

// ─── Device fingerprinting ────────────────────────────────────────────────────

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    const raw = [
      navigator.userAgent,
      navigator.language,
      screen.width,
      screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency ?? '',
      navigator.platform ?? '',
    ].join('|');

    let hash = 5381;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash * 33) ^ raw.charCodeAt(i);
    }
    id = (hash >>> 0).toString(16) + '-' + Date.now().toString(36);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function getTrustedDevices(email) {
  try {
    const raw = localStorage.getItem(`abac_devices_${email}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function trustDevice(email, deviceId) {
  const devices = getTrustedDevices(email);
  if (!devices.includes(deviceId)) {
    devices.push(deviceId);
    if (devices.length > 5) devices.shift();
    localStorage.setItem(`abac_devices_${email}`, JSON.stringify(devices));
  }
}

// ─── Brute-force / rate-limit tracking ───────────────────────────────────────

function getAttempts(email) {
  try {
    const raw = localStorage.getItem(`abac_attempts_${email}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function recordAttempt(email, success) {
  const now   = Date.now();
  const fresh = getAttempts(email).filter(a => now - a.ts < ATTEMPT_WINDOW_MS);
  fresh.push({ ts: now, success });
  localStorage.setItem(`abac_attempts_${email}`, JSON.stringify(fresh));
  return fresh;
}

function isLockedOut(email) {
  const now      = Date.now();
  const attempts = getAttempts(email).filter(a => now - a.ts < ATTEMPT_WINDOW_MS);
  const failures = attempts.filter(a => !a.success);
  if (failures.length < MAX_ATTEMPTS) return { locked: false };
  const oldestFailure = failures[failures.length - MAX_ATTEMPTS];
  const unlocksAt     = oldestFailure.ts + LOCKOUT_MINUTES * 60 * 1000;
  if (now < unlocksAt) {
    const minsLeft = Math.ceil((unlocksAt - now) / 60000);
    return { locked: true, minsLeft };
  }
  return { locked: false };
}

// ─── Audit log ───────────────────────────────────────────────────────────────

/**
 * Appends an entry to the local audit cache AND sends it to Supabase.
 *
 * Two time values are always saved:
 *   created_at     — auto-set by Supabase in UTC (standard, don't change)
 *   local_time_pst — human-readable PST string, e.g. "2026-06-19 09:39:11 PST"
 *                    so you can read Philippine time directly in the Table Editor
 *                    without doing +8 mental math.
 */
export function appendAuditLog(entry) {
  const pstTime = nowInPST();
  const record  = { ...entry, ts: new Date().toISOString(), local_time_pst: pstTime };

  // ── Local cache (last 200 entries) ───────────────────────────────────────
  try {
    const log = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
    log.unshift(record);
    if (log.length > 200) log.length = 200;
    localStorage.setItem(AUDIT_KEY, JSON.stringify(log));
  } catch { /* non-fatal */ }

  // ── Supabase persistence (fire-and-forget) ───────────────────────────────
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
      fetch(`${supabaseUrl}/rest/v1/audit_logs`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify({
          email:          entry.email      ?? null,
          role:           entry.role       ?? null,
          device_id:      entry.deviceId   ?? null,
          event:          entry.event      ?? 'UNKNOWN',
          flags:          entry.flags      ?? [],
          geo_info:       entry.geoInfo    ?? null,
          hour:           entry.hour       ?? null,
          is_new_device:  entry.isNewDevice ?? null,
          reason:         entry.reason     ?? null,
          local_time_pst: pstTime,          // ← readable PH time
        }),
      }).catch(() => { /* fire-and-forget */ });
    }
  } catch { /* non-fatal */ }
}

export function getAuditLog() {
  try {
    return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
  } catch {
    return [];
  }
}

// ─── IP / geo fetch ──────────────────────────────────────────────────────────

async function fetchGeoInfo() {
  try {
    const res = await Promise.race([
      fetch('https://ipapi.co/json/'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
    ]);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      ip:      data.ip      ?? 'unknown',
      country: data.country ?? 'unknown',
      city:    data.city    ?? 'unknown',
    };
  } catch {
    return null;
  }
}

function assessGeoRisk(email, geoInfo) {
  if (!geoInfo) return 'unknown';
  const sessionRaw = localStorage.getItem(`${SESSION_KEY}_${email}`);
  if (!sessionRaw) return 'new';
  try {
    const session = JSON.parse(sessionRaw);
    if (session.country && session.country !== geoInfo.country) return 'country_change';
    if (session.ip      && session.ip      !== geoInfo.ip)      return 'ip_change';
    return 'known';
  } catch {
    return 'unknown';
  }
}

function saveGeoSession(email, geoInfo) {
  if (!geoInfo) return;
  localStorage.setItem(`${SESSION_KEY}_${email}`, JSON.stringify(geoInfo));
}

// ─── Main policy evaluation ───────────────────────────────────────────────────

/**
 * evaluateABACPolicy
 *
 * Call AFTER credentials are verified, BEFORE committing the login.
 * All time comparisons use PST (UTC+8) via hourInPST() / dayInPST().
 */
export async function evaluateABACPolicy(user) {
  const { email, role } = user;
  const deviceId = getDeviceId();
  const flags    = [];

  // ── 1. Brute-force lockout ──────────────────────────────────────────────
  const lockout = isLockedOut(email);
  if (lockout.locked) {
    const reason = `Too many failed attempts. Try again in ${lockout.minsLeft} minute(s).`;
    appendAuditLog({ email, role, deviceId, event: 'LOCKOUT', reason });
    return { result: ABAC_RESULT.DENY, reason, flags, geoInfo: null, deviceId, isNewDevice: false };
  }

  // ── 2. Time policy (all hours in PST) ──────────────────────────────────
  const hour = hourInPST();   // ← always Philippine time
  const day  = dayInPST();    // ← always Philippine day-of-week

  const inAttackerWindow = hour >= ATTACKER_HOURS.start && hour < ATTACKER_HOURS.end;
  const allowed          = ROLE_HOURS[role] ?? ROLE_HOURS.employee;
  const inAllowedHours   = hour >= allowed.start && hour < allowed.end;

  const localTimeStr = nowInPST(); // for human-readable error messages

  if (inAttackerWindow && ['admin', 'hr', 'manager'].includes(role)) {
    const reason = `Login at ${localTimeStr} denied — privileged accounts cannot sign in between 1:00 AM and 4:00 AM PST. Contact your administrator if urgent.`;
    appendAuditLog({ email, role, deviceId, event: 'DENY_ATTACKER_HOURS', hour });
    return { result: ABAC_RESULT.DENY, reason, flags, geoInfo: null, deviceId, isNewDevice: false };
  }

  if (!inAllowedHours) {
    if (role === 'employee') {
      flags.push(`off_hours_login:${hour}:00`);
    } else {
      const reason = `Login at ${localTimeStr} is outside permitted hours for ${role} accounts (${allowed.start}:00 – ${allowed.end}:00 PST).`;
      appendAuditLog({ email, role, deviceId, event: 'DENY_OFF_HOURS', hour });
      return { result: ABAC_RESULT.DENY, reason, flags, geoInfo: null, deviceId, isNewDevice: false };
    }
  }

  if (inAttackerWindow && role === 'employee') {
    flags.push('suspicious_hour_employee');
  }

  if (day === 0 || day === 6) {
    if (['admin', 'hr'].includes(role)) {
      flags.push('weekend_privileged_login');
    }
  }

  // ── 3. Device check ────────────────────────────────────────────────────
  const trusted     = getTrustedDevices(email);
  const isNewDevice = !trusted.includes(deviceId);
  if (isNewDevice) {
    flags.push('new_device');
    if (['admin', 'hr'].includes(role) && (inAttackerWindow || !inAllowedHours)) {
      const reason = 'Unrecognised device + off-hours access denied for privileged account. Sign in during business hours from a known device.';
      appendAuditLog({ email, role, deviceId, event: 'DENY_NEW_DEVICE_OFF_HOURS' });
      return { result: ABAC_RESULT.DENY, reason, flags, geoInfo: null, deviceId, isNewDevice };
    }
  }

  // ── 4. IP / geo check ──────────────────────────────────────────────────
  const geoInfo = await fetchGeoInfo();
  const geoRisk = assessGeoRisk(email, geoInfo);

  if (geoRisk === 'country_change') {
    if (['admin', 'hr'].includes(role)) {
      const reason = `Login from a new country (${geoInfo?.country}) denied for privileged account. If you are travelling, contact support.`;
      appendAuditLog({ email, role, deviceId, event: 'DENY_COUNTRY_CHANGE', geoInfo });
      return { result: ABAC_RESULT.DENY, reason, flags, geoInfo, deviceId, isNewDevice };
    }
    flags.push(`country_change:${geoInfo?.country}`);
  }

  if (geoRisk === 'ip_change') {
    flags.push(`ip_change:${geoInfo?.ip}`);
  }

  // ── 5. Aggregate risk ──────────────────────────────────────────────────
  const result = flags.length >= 2 ? ABAC_RESULT.FLAG : ABAC_RESULT.ALLOW;

  if (result === ABAC_RESULT.ALLOW) {
    saveGeoSession(email, geoInfo);
    trustDevice(email, deviceId);
  }

  appendAuditLog({ email, role, deviceId, event: result, flags, hour, geoInfo, isNewDevice });

  return { result, reason: null, flags, geoInfo, deviceId, isNewDevice };
}

// ─── Permission matrix ────────────────────────────────────────────────────────

const ROLE_PERMISSIONS = {
  admin:    ['view_all','edit_all','manage_users','view_reports','approve_leave','manage_shifts','system_settings','view_audit_log'],
  hr:       ['view_all','edit_all','view_reports','approve_leave','manage_shifts'],
  manager:  ['view_team','edit_team','view_reports','approve_leave'],
  employee: ['view_own','request_leave','clock_in_out'],
};

export function can(user, permission) {
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
}

export function recordLoginAttempt(email, success) {
  return recordAttempt(email, success);
}
