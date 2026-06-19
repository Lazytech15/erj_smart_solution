import { supabase } from './supabase';
import { encryptField, decryptField, encryptFields, decryptFields } from './crypto';
import { cached, cacheInvalidate } from './cache';

// Reads are cached in-memory for 60s — dashboard/report views re-render
// often (filters, tab switches, context refreshes) without the underlying
// data actually changing that frequently. Every write function below
// invalidates the matching key(s) immediately on success, so nobody ever
// sees stale data right after they save something.
const READ_TTL_MS = 60_000;

// ─── Account helpers ──────────────────────────────────────────────────────────

/**
 * Sensitive fields encrypted at rest in the `accounts` table:
 *   - password  (never stored plaintext)
 *
 * Fields intentionally left plaintext so Supabase can filter on them:
 *   - email, role, subscription_id, employee_id, id, name
 */
const ACCOUNT_SENSITIVE_FIELDS = ['password'];

export async function getAccount(email) {
  return cached(`account:${email}`, async () => {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('email', email)
      .single();
    if (error) return null;

    // Decrypt sensitive fields after reading
    const decrypted = await decryptFields(data, ACCOUNT_SENSITIVE_FIELDS);

    return {
      email:          decrypted.email,
      password:       decrypted.password,
      role:           decrypted.role,
      name:           decrypted.name,
      id:             decrypted.id,
      employeeId:     decrypted.employee_id,
      subscriptionId: decrypted.subscription_id,
      createdAt:      decrypted.created_at,
    };
  }, READ_TTL_MS);
}

export async function putAccount(account) {
  // Encrypt sensitive fields before writing
  const encrypted = await encryptFields(
    {
      email:           account.email,
      password:        account.password,
      role:            account.role,
      name:            account.name,
      id:              account.id,
      employee_id:     account.employeeId     ?? null,
      subscription_id: account.subscriptionId ?? null,
    },
    ACCOUNT_SENSITIVE_FIELDS,
  );

  const { error } = await supabase.from('accounts').upsert(encrypted);
  if (error) throw error;
  cacheInvalidate(`account:${account.email}`);
}

// ─── Subscription helpers ─────────────────────────────────────────────────────

export async function getSubscription(subscriptionId) {
  return cached(`subscription:${subscriptionId}`, async () => {
    // Fetch subscription and employee accounts in parallel.
    const [{ data, error }, { data: accountRows }] = await Promise.all([
      supabase.from('subscriptions').select('*').eq('subscription_id', subscriptionId).single(),
      supabase.from('accounts').select('employee_id, name').eq('subscription_id', subscriptionId).eq('role', 'employee'),
    ]);
    if (error) return null;

    const accountsByName = {};
    for (const row of (accountRows ?? [])) {
      if (row.employee_id) {
        accountsByName[row.name?.toLowerCase().trim()] = String(row.employee_id);
      }
    }

    const enrolledEmployees = (data.enrolled_employees ?? []).map(emp => {
      const fullName = `${emp.firstName ?? ''} ${emp.lastName ?? ''}`.toLowerCase().trim();
      const accountEmployeeId = accountsByName[fullName] ?? null;
      return {
        ...emp,
        id: emp.id != null ? String(emp.id) : emp.id,
        accountEmployeeId: accountEmployeeId ?? (emp.accountEmployeeId ? String(emp.accountEmployeeId) : null),
      };
    });

    const leaveRequests = (data.leave_requests ?? []).map(r => ({
      ...r,
      leaveType:  r.leaveType  ?? r.type        ?? '',
      createdAt:  r.createdAt  ?? r.submittedAt ?? null,
      employeeId: r.employeeId != null ? String(r.employeeId) : r.employeeId,
    }));

    return {
      subscriptionId:    data.subscription_id,
      planId:            data.plan_id,
      company:           data.company,
      billing:           data.billing,
      enrolledEmployees,
      departments:       data.departments        ?? [],
      autoDepartments:   data.settings?.autoDepartments ?? [],
      shifts:            data.shifts             ?? [],
      attendanceRecords: (data.attendance_records ?? []).map(r => ({
        ...r,
        employeeId: r.employeeId != null ? String(r.employeeId) : r.employeeId,
      })),
      leaveRequests,
      settings: {
        leaveTypes: [],
        ...(data.settings ?? {}),
      },
      status:            data.status,
      trialEndsAt:       data.trial_ends_at,
      createdAt:         data.created_at,
    };
  }, READ_TTL_MS);
}

export async function putSubscription(state) {
  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      subscription_id:    state.subscriptionId,
      plan_id:            state.planId,
      company:            state.company,
      billing:            state.billing,
      enrolled_employees: state.enrolledEmployees ?? [],
      departments:        state.departments        ?? [],
      shifts:             state.shifts             ?? [],
      attendance_records: state.attendanceRecords  ?? [],
      leave_requests:     state.leaveRequests      ?? [],
      settings:           { ...(state.settings ?? {}), autoDepartments: state.autoDepartments ?? [] },
      status:             state.status,
      trial_ends_at:      state.trialEndsAt        ?? null,
    });
  if (error) throw error;
  cacheInvalidate(`subscription:${state.subscriptionId}`);
  // attendance_records lives both on `subscriptions` and is read separately
  // via getAttendanceRecords() — keep that cache in sync too.
  cacheInvalidate(`attendance:${state.subscriptionId}`);
}

// ─── Pending Registrations helpers ─────────────────────────────────────────────

/**
 * Sensitive fields encrypted at rest in `pending_registrations`:
 *   - password   (employee initial credential)
 *   - username   (employee login name — not PII-critical but still a credential)
 *
 * Fields left plaintext for Supabase filtering:
 *   - subscription_id, email, first_name, last_name, role, department, etc.
 */
const PENDING_SENSITIVE_FIELDS = ['password', 'username'];

export async function getPendingRegistrations(subscriptionId) {
  return cached(`pending:${subscriptionId}`, async () => {
    const { data, error } = await supabase
      .from('pending_registrations')
      .select('*')
      .eq('subscription_id', subscriptionId)
      .order('submitted_at', { ascending: true });
    if (error) return [];

    // Decrypt credentials on each row
    return Promise.all(
      data.map(async (r) => {
        const dec = await decryptFields(r, PENDING_SENSITIVE_FIELDS);
        return {
          id:             dec.id,
          subscriptionId: dec.subscription_id,
          firstName:      dec.first_name,
          middleName:     dec.middle_name   ?? '',
          lastName:       dec.last_name,
          suffix:         dec.suffix        ?? '',
          email:          dec.email,
          phone:          dec.phone         ?? '',
          role:           dec.role,
          department:     dec.department    ?? '',
          joinDate:       dec.join_date     ?? '',
          shiftId:        dec.shift_id      ?? '',
          employeeCode:   dec.employee_code ?? '',
          notes:          dec.notes         ?? '',
          submittedAt:    dec.submitted_at,
          username:       dec.username      ?? '',
          password:       dec.password      ?? '',
        };
      })
    );
  }, READ_TTL_MS);
}

export async function insertPendingRegistration(subscriptionId, form) {
  // Encrypt credentials before insert
  const encCredentials = await encryptFields(
    { password: form.password ?? null, username: form.username ?? null },
    PENDING_SENSITIVE_FIELDS,
  );

  const { data, error } = await supabase
    .from('pending_registrations')
    .insert({
      subscription_id: subscriptionId,
      first_name:      form.firstName,
      middle_name:     form.middleName  ?? null,
      last_name:       form.lastName,
      suffix:          form.suffix      ?? null,
      email:           form.email,
      phone:           form.phone       ?? null,
      role:            form.role,
      department:      form.department  ?? null,
      join_date:       form.joinDate    ?? null,
      shift_id:        form.shiftId     ?? null,
      employee_code:   form.employeeCode ?? null,
      notes:           form.notes       ?? null,
      username:        encCredentials.username,
      password:        encCredentials.password,
      submitted_at:    new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  cacheInvalidate(`pending:${subscriptionId}`);
  return data.id;
}

export async function updatePendingRegistration(id, form) {
  // Encrypt credentials before update
  const encCredentials = await encryptFields(
    { password: form.password ?? null, username: form.username ?? null },
    PENDING_SENSITIVE_FIELDS,
  );

  const { error } = await supabase
    .from('pending_registrations')
    .update({
      first_name:    form.firstName,
      middle_name:   form.middleName  ?? null,
      last_name:     form.lastName,
      suffix:        form.suffix      ?? null,
      email:         form.email,
      phone:         form.phone       ?? null,
      role:          form.role,
      department:    form.department  ?? null,
      join_date:     form.joinDate    ?? null,
      shift_id:      form.shiftId     ?? null,
      employee_code: form.employeeCode ?? null,
      notes:         form.notes       ?? null,
      username:      encCredentials.username,
      password:      encCredentials.password,
    })
    .eq('id', id);
  if (error) throw error;
  // subscriptionId isn't passed in here, so clear every pending-registration
  // cache rather than tracking ids -> subscription ourselves.
  cacheInvalidate('pending:');
}

export async function deletePendingRegistration(id) {
  const { error } = await supabase
    .from('pending_registrations')
    .delete()
    .eq('id', id);
  if (error) throw error;
  cacheInvalidate('pending:');
}

// ─── Announcements helpers ─────────────────────────────────────────────────────
// No sensitive fields — no encryption needed here.

export async function getAnnouncements(subscriptionId) {
  return cached(`announcements:${subscriptionId}`, async () => {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('subscription_id', subscriptionId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data.map(r => ({
      id:             r.id,
      subscriptionId: r.subscription_id,
      title:          r.title,
      body:           r.body,
      type:           r.type    ?? 'info',
      isRead:         r.is_read ?? false,
      createdAt:      r.created_at,
    }));
  }, READ_TTL_MS);
}

export async function markAnnouncementRead(id) {
  const { error } = await supabase
    .from('announcements')
    .update({ is_read: true })
    .eq('id', id);
  if (error) throw error;
  // id -> subscriptionId isn't known here, so clear all announcement caches.
  cacheInvalidate('announcements:');
}

export async function markAllAnnouncementsRead(subscriptionId) {
  const { error } = await supabase
    .from('announcements')
    .update({ is_read: true })
    .eq('subscription_id', subscriptionId)
    .eq('is_read', false);
  if (error) throw error;
  cacheInvalidate(`announcements:${subscriptionId}`);
}

export async function insertAnnouncement(subscriptionId, { title, body, type = 'info' }) {
  const { data, error } = await supabase
    .from('announcements')
    .insert({
      subscription_id: subscriptionId,
      title,
      body,
      type,
      is_read:    false,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  cacheInvalidate(`announcements:${subscriptionId}`);
  return data.id;
}

export async function deleteAnnouncement(id) {
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id);
  if (error) throw error;
  cacheInvalidate('announcements:');
}

// ─── Employee Mobile Account helpers ──────────────────────────────────────────

/**
 * Sensitive fields encrypted at rest in `accounts` for employee rows:
 *   - password
 * (username/id is the lookup key — cannot be encrypted or .eq() breaks)
 */

export async function createEmployeeAccount({ employeeId, subscriptionId, name, email, username, password }) {
  const { data: existing } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', username)
    .maybeSingle();
  if (existing) throw new Error(`Username "${username}" is already taken.`);

  const encryptedPassword = await encryptField(password);

  const { error } = await supabase
    .from('accounts')
    .insert({
      id:              username,
      email:           email,
      password:        encryptedPassword,
      role:            'employee',
      name:            name,
      employee_id:     employeeId,
      subscription_id: subscriptionId,
    });
  if (error) throw new Error(error.message);
  cacheInvalidate(`empacct:${employeeId}`);
}

export async function updateEmployeeAccount(employeeId, { username, password, name, email }) {
  const updates = {};
  if (name)     updates.name  = name;
  if (email)    updates.email = email;
  if (username) updates.id    = username;

  // Encrypt the new password if provided
  if (password) updates.password = await encryptField(password);

  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase
    .from('accounts')
    .update(updates)
    .eq('employee_id', employeeId)
    .eq('role', 'employee');
  if (error) throw new Error(error.message);
  cacheInvalidate(`empacct:${employeeId}`);
}

export async function getEmployeeAccount(employeeId) {
  return cached(`empacct:${employeeId}`, async () => {
    const { data, error } = await supabase
      .from('accounts')
      .select('id, email, name')
      .eq('employee_id', employeeId)
      .eq('role', 'employee')
      .maybeSingle();
    if (error || !data) return null;
    // id/email/name are not encrypted — return as-is
    return { username: data.id, email: data.email, name: data.name };
  }, READ_TTL_MS);
}

// ─── Attendance-only helpers ───────────────────────────────────────────────────

export async function getAttendanceRecords(subscriptionId) {
  return cached(`attendance:${subscriptionId}`, async () => {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('attendance_records')
      .eq('subscription_id', subscriptionId)
      .single();
    if (error) return null;
    return (data.attendance_records ?? []).map(r => ({
      ...r,
      employeeId: r.employeeId != null ? String(r.employeeId) : r.employeeId,
    }));
  }, READ_TTL_MS);
}

export async function putAttendanceRecords(subscriptionId, records) {
  const { error } = await supabase
    .from('subscriptions')
    .update({ attendance_records: records })
    .eq('subscription_id', subscriptionId);
  if (error) throw error;
  cacheInvalidate(`attendance:${subscriptionId}`);
  // attendance_records is also embedded in the cached subscription object.
  cacheInvalidate(`subscription:${subscriptionId}`);
}