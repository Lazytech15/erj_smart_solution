import { supabase } from './supabase';

// ── Account helpers ──────────────────────────────────────────────────────────

export async function getAccount(email) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('email', email)
    .single();
  if (error) return null;
  // Map snake_case columns to camelCase so the rest of the app
  // can use consistent field names (subscriptionId, employeeId, etc.)
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
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('subscription_id', subscriptionId)
    .single();
  if (error) return null;
  return {
    subscriptionId:    data.subscription_id,
    planId:            data.plan_id,
    company:           data.company,
    billing:           data.billing,
    enrolledEmployees: data.enrolled_employees ?? [],
    departments:       data.departments        ?? [],
    shifts:            data.shifts             ?? [],
    attendanceRecords: data.attendance_records ?? [],
    leaveRequests:     data.leave_requests     ?? [],
    settings:          data.settings           ?? {},
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
      settings:           state.settings           ?? {},
      status:             state.status,
      trial_ends_at:      state.trialEndsAt        ?? null,
    });
  if (error) throw error;
}