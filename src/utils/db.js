import { supabase } from './supabase';

// ── Account helpers ──────────────────────────────────────────────────────────

export async function getAccount(email) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('email', email)
    .single();
  if (error) return null;
  return {
    email:          data.email,
    password:       data.password,
    role:           data.role,
    name:           data.name,
    id:             data.id,
    employeeId:     data.employee_id,
    subscriptionId: data.subscription_id,
    createdAt:      data.created_at,
  };
}

export async function putAccount(account) {
  const { error } = await supabase
    .from('accounts')
    .upsert({
      email:           account.email,
      password:        account.password,
      role:            account.role,
      name:            account.name,
      id:              account.id,
      employee_id:     account.employeeId     ?? null,
      subscription_id: account.subscriptionId ?? null,
    });
  if (error) throw error;
}

// ── Subscription helpers ─────────────────────────────────────────────────────

export async function getSubscription(subscriptionId) {
  // Fetch subscription and employee accounts in parallel.
  // The accounts table is the source of truth for employee_id as used by the
  // mobile app — we cross-reference it so leave requests submitted from mobile
  // (which use accounts.employee_id) can be matched to enrolledEmployees
  // (which use a separately-generated Date.now() id that may differ by a few ms).
  const [{ data, error }, { data: accountRows }] = await Promise.all([
    supabase.from('subscriptions').select('*').eq('subscription_id', subscriptionId).single(),
    supabase.from('accounts').select('employee_id, name').eq('subscription_id', subscriptionId).eq('role', 'employee'),
  ]);
  if (error) return null;

  // Build a name → accountEmployeeId map from the accounts table.
  // We normalise names to lowercase for fuzzy matching.
  const accountsByName = {};
  for (const row of (accountRows ?? [])) {
    if (row.employee_id) {
      accountsByName[row.name?.toLowerCase().trim()] = String(row.employee_id);
    }
  }

  // Attach accountEmployeeId to each enrolled employee so LeavePage can match
  // leave requests on EITHER id (enrolledEmployee.id OR accountEmployeeId).
  const enrolledEmployees = (data.enrolled_employees ?? []).map(emp => {
    const fullName = `${emp.firstName ?? ''} ${emp.lastName ?? ''}`.toLowerCase().trim();
    const accountEmployeeId = accountsByName[fullName] ?? null;
    return {
      ...emp,
      id: emp.id != null ? String(emp.id) : emp.id,
      // The ID as stored in accounts.employee_id — what mobile app uses
      accountEmployeeId: accountEmployeeId ?? (emp.accountEmployeeId ? String(emp.accountEmployeeId) : null),
    };
  });

  // Normalise leave requests: handle mobile-submitted records that use
  // `type` instead of `leaveType`, `submittedAt` instead of `createdAt`.
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
    // Tracks which department names were auto-added from typed employee input
    // (vs. manually created on the Departments page). Stored inside `settings`
    // so it doesn't require a database schema change. Defaults to "every
    // existing department is manual" for older records that predate this field,
    // which is the safe choice — it just means they won't be auto-pruned.
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
      // autoDepartments rides along inside settings (no dedicated column) so we
      // can track which departments were auto-added from typed employee input.
      settings:           { ...(state.settings ?? {}), autoDepartments: state.autoDepartments ?? [] },
      status:             state.status,
      trial_ends_at:      state.trialEndsAt        ?? null,
    });
  if (error) throw error;
}

// ── Pending Registrations helpers ─────────────────────────────────────────────

export async function getPendingRegistrations(subscriptionId) {
  const { data, error } = await supabase
    .from('pending_registrations')
    .select('*')
    .eq('subscription_id', subscriptionId)
    .order('submitted_at', { ascending: true });
  if (error) return [];
  return data.map(r => ({
    id:             r.id,
    subscriptionId: r.subscription_id,
    firstName:      r.first_name,
    middleName:     r.middle_name   ?? '',
    lastName:       r.last_name,
    suffix:         r.suffix        ?? '',
    email:          r.email,
    phone:          r.phone         ?? '',
    role:           r.role,
    department:     r.department    ?? '',
    joinDate:       r.join_date     ?? '',
    shiftId:        r.shift_id      ?? '',
    employeeCode:   r.employee_code ?? '',
    notes:          r.notes         ?? '',
    submittedAt:    r.submitted_at,
    username:       r.username      ?? '',
    password:       r.password      ?? '',
  }));
}

export async function insertPendingRegistration(subscriptionId, form) {
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
      username:        form.username    ?? null,
      password:        form.password    ?? null,
      submitted_at:    new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data.id;
}

export async function updatePendingRegistration(id, form) {
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
      username:      form.username    ?? null,
      password:      form.password    ?? null,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deletePendingRegistration(id) {
  const { error } = await supabase
    .from('pending_registrations')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Announcements helpers ─────────────────────────────────────────────────────

export async function getAnnouncements(subscriptionId) {
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
}

export async function markAnnouncementRead(id) {
  const { error } = await supabase
    .from('announcements')
    .update({ is_read: true })
    .eq('id', id);
  if (error) throw error;
}

export async function markAllAnnouncementsRead(subscriptionId) {
  const { error } = await supabase
    .from('announcements')
    .update({ is_read: true })
    .eq('subscription_id', subscriptionId)
    .eq('is_read', false);
  if (error) throw error;
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
  return data.id;
}

export async function deleteAnnouncement(id) {
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Employee Mobile Account helpers ──────────────────────────────────────────

export async function createEmployeeAccount({ employeeId, subscriptionId, name, email, username, password }) {
  const { data: existing } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', username)
    .maybeSingle();
  if (existing) throw new Error(`Username "${username}" is already taken.`);

  const { error } = await supabase
    .from('accounts')
    .insert({
      id:              username,
      email:           email,
      password:        password,
      role:            'employee',
      name:            name,
      employee_id:     employeeId,
      subscription_id: subscriptionId,
    });
  if (error) throw new Error(error.message);
}

export async function updateEmployeeAccount(employeeId, { username, password, name, email }) {
  const updates = {};
  if (name)     updates.name     = name;
  if (email)    updates.email    = email;
  if (password) updates.password = password;
  if (username) updates.id = username;

  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase
    .from('accounts')
    .update(updates)
    .eq('employee_id', employeeId)
    .eq('role', 'employee');
  if (error) throw new Error(error.message);
}

export async function getEmployeeAccount(employeeId) {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, email, name')
    .eq('employee_id', employeeId)
    .eq('role', 'employee')
    .maybeSingle();
  if (error || !data) return null;
  return { username: data.id, email: data.email, name: data.name };
}
// ── Attendance-only helpers ───────────────────────────────────────────────────

/** Fetch only the attendance_records column — avoids overwriting mobile data. */
export async function getAttendanceRecords(subscriptionId) {
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
}

/** Patch ONLY the attendance_records column — leaves all other columns untouched. */
export async function putAttendanceRecords(subscriptionId, records) {
  const { error } = await supabase
    .from('subscriptions')
    .update({ attendance_records: records })
    .eq('subscription_id', subscriptionId);
  if (error) throw error;
}