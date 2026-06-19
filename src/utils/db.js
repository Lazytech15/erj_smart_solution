import { supabase } from './supabase';
import { createClient } from '@supabase/supabase-js';
import { encryptField, decryptField, encryptFields, decryptFields } from './crypto';
import { cached, cacheInvalidate } from './cache';

// A second, isolated Supabase client used ONLY for creating employee Auth accounts.
// It uses persistSession:false so signUp() never overwrites the admin's active session.
const supabaseNoSession = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'erj_nosession_client',
    },
  }
);

// Reads are cached in-memory for 60s — dashboard/report views re-render
// often (filters, tab switches, context refreshes) without the underlying
// data actually changing that frequently. Every write function below
// invalidates the matching key(s) immediately on success, so nobody ever
// sees stale data right after they save something.
const READ_TTL_MS = 60_000;

// ─── Account helpers ──────────────────────────────────────────────────────────
// NOTE: Passwords are now managed exclusively by Supabase Auth.
// The `accounts` table stores profile metadata only (role, name, employee_id,
// subscription_id, auth_uid). No password field is written here.

/**
 * Fetch a profile row by email.
 * Used by legacy callers — prefer fetching by auth_uid where possible.
 */
export async function getAccount(email) {
  return cached(`account:${email}`, async () => {
    const { data, error } = await supabase
      .from('accounts')
      .select('auth_uid, email, role, name, employee_id, subscription_id, created_at')
      .eq('email', email)
      .maybeSingle();
    if (error || !data) return null;

    return {
      email:          data.email,
      role:           data.role,
      name:           data.name,
      id:             data.auth_uid,
      employeeId:     data.employee_id,
      subscriptionId: data.subscription_id,
      createdAt:      data.created_at,
    };
  }, READ_TTL_MS);
}

/**
 * Upsert a profile row in `accounts`.
 * This does NOT store a password — auth is handled by supabase.auth.
 * `account.id` must be the Supabase Auth UUID (auth_uid).
 */
export async function putAccount(account) {
  const { error } = await supabase.from('accounts').upsert({
    auth_uid:        account.id,
    email:           account.email,
    role:            account.role,
    name:            account.name,
    employee_id:     account.employeeId     ?? null,
    subscription_id: account.subscriptionId ?? null,
  }, { onConflict: 'auth_uid' });
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
 *
 * Fields left plaintext for Supabase filtering:
 *   - subscription_id, email, first_name, last_name, role, department, username, etc.
 *   - username is now derived from the email local-part (no longer a secret credential)
 */
const PENDING_SENSITIVE_FIELDS = ['password'];

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
  // Encrypt password before insert (username is now derived from email, stored plaintext)
  const encCredentials = await encryptFields(
    { password: form.password ?? null },
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
      username:        form.username    ?? null,   // plaintext, derived from email
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
  // Encrypt password before update (username is plaintext)
  const encCredentials = await encryptFields(
    { password: form.password ?? null },
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
      username:      form.username    ?? null,   // plaintext, derived from email
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
// Employees authenticate via Supabase Auth (email + password).
// The `accounts` table stores profile metadata; passwords live only in Auth.
//
// Uses supabase.auth.signUp (anon key) instead of auth.admin.createUser
// (service-role key) so this works safely from the browser.

export async function createEmployeeAccount({ employeeId, subscriptionId, name, email, username, password }) {
  // 1. Check that the email is not already taken in the accounts table
  const { data: existingProfile } = await supabase
    .from('accounts')
    .select('auth_uid')
    .eq('email', email)
    .maybeSingle();
  if (existingProfile) throw new Error(`An account with email "${email}" already exists.`);

  // 2. Create the Supabase Auth user via the isolated no-session client.
  //    Using supabaseNoSession (persistSession:false) ensures this signUp call
  //    NEVER overwrites the currently logged-in admin's session.
  const { data: authData, error: authError } = await supabaseNoSession.auth.signUp({
    email,
    password,
    options: {
      data: { name, username, employee_id: employeeId },
      // Suppress the confirmation email — HR already verified the employee.
      emailRedirectTo: undefined,
    },
  });
  if (authError) throw new Error(authError.message);

  // signUp returns a user even when email confirmation is required.
  // If identities is empty the email is already registered in Auth.
  const authUser = authData?.user;
  if (!authUser) throw new Error('Auth sign-up did not return a user.');
  if (authUser.identities && authUser.identities.length === 0) {
    throw new Error(`Auth account for "${email}" already exists.`);
  }

  const authUid = authUser.id;

  // 3. Insert profile row in accounts table.
  //    IMPORTANT: use supabaseNoSession here, NOT the admin supabase client.
  //    After signUp() above, supabaseNoSession is now authenticated as the new
  //    employee (auth.uid() === authUid), so the RLS insert policy passes.
  //    Using the admin client would fail because admin's auth.uid() !== authUid.
  const { error: profileError } = await supabaseNoSession.from('accounts').insert({
    auth_uid:        authUid,
    email,
    role:            'employee',
    name,
    employee_id:     employeeId,
    subscription_id: subscriptionId,
    username,                   // derived from email local-part
  });
  if (profileError) throw new Error(profileError.message);

  cacheInvalidate(`empacct:${employeeId}`);
}

export async function updateEmployeeAccount(employeeId, { username, password, name, email }) {
  // Fetch the auth_uid so we can update Auth user metadata / password
  const { data: profile } = await supabase
    .from('accounts')
    .select('auth_uid')
    .eq('employee_id', employeeId)
    .eq('role', 'employee')
    .maybeSingle();

  if (!profile?.auth_uid) return; // no Auth account yet — nothing to update

  // Update Auth user (password and/or email)
  const authUpdates = {};
  if (password) authUpdates.password = password;
  if (email)    authUpdates.email    = email;
  if (Object.keys(authUpdates).length > 0) {
    const { error: authError } = await supabase.auth.admin.updateUserById(
      profile.auth_uid,
      authUpdates,
    );
    if (authError) throw new Error(authError.message);
  }

  // Update profile row
  const profileUpdates = {};
  if (name)     profileUpdates.name     = name;
  if (email)    profileUpdates.email    = email;
  if (username) profileUpdates.username = username;

  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileError } = await supabase
      .from('accounts')
      .update(profileUpdates)
      .eq('employee_id', employeeId)
      .eq('role', 'employee');
    if (profileError) throw new Error(profileError.message);
  }

  cacheInvalidate(`empacct:${employeeId}`);
}

export async function getEmployeeAccount(employeeId) {
  return cached(`empacct:${employeeId}`, async () => {
    const { data, error } = await supabase
      .from('accounts')
      .select('auth_uid, email, name, username')
      .eq('employee_id', employeeId)
      .eq('role', 'employee')
      .maybeSingle();
    if (error || !data) return null;
    return { authUid: data.auth_uid, username: data.username, email: data.email, name: data.name };
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