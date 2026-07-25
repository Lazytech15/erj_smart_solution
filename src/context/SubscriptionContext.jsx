import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { getSubscription, putSubscription, getAttendanceRecords, putAttendanceRecords, getPendingRegistrations, insertPendingRegistration, updatePendingRegistration, deletePendingRegistration, createEmployeeAccount, updateEmployeeAccount, getEmployeeAccount } from '../utils/db';
import { useAuth } from './AuthContext';

export const PLANS = [
  {
    id: 'free_trial',
    name: 'Free Trial',
    tagline: 'Try the basics — no card needed',
    price: 0, currency: 'PHP', period: '14-day trial', maxSeats: 200, color: '#26c6da',
    badge: 'Free Trial', isTrial: true,
    features: ['Includes a free 14-day trial of everything below','Up to 200 employees','Clock-in / Clock-out','Attendance records','Basic leave management','CSV export','Email support','Mobile app (iOS & Android)','Shift management','Department management','Analytics & reports','Overtime tracking','SMS notifications','Priority support'],
    limits: { reports: true, shifts: true, departments: true, biometric: false, api: false, sms: true, mobileApp: true, emailNotifs: true },
  },
  {
    id: 'starter',
    name: 'Starter', tagline: 'For small teams getting started',
    price: 150, currency: 'PHP', period: 'employee / month', maxSeats: 25,
    color: '#26c6da', colorDark: '#00acc1', badge: null,
    features: ['Up to 25 employees','Clock-in / Clock-out','Attendance records','Basic leave management','CSV export','Email support','Mobile app (iOS & Android)','Shift management'],
    limits: { reports: false, shifts: true, departments: false, biometric: false, api: false, sms: false, mobileApp: true, emailNotifs: true },
  },
  {
    id: 'growth',
    name: 'Growth', tagline: 'For growing teams with more complexity',
    price: 250, currency: 'PHP', period: 'employee / month', maxSeats: 200,
    color: '#26a69a', colorDark: '#00897b', badge: 'Most Popular',
    features: ['Up to 200 employees','Clock-in / Clock-out','Attendance records','Basic leave management','CSV export','Email support','Mobile app (iOS & Android)','Shift management','Department management','Analytics & reports','Overtime tracking','SMS notifications','Priority support'],
    limits: { reports: true, shifts: true, departments: true, biometric: false, api: false, sms: true, mobileApp: true, emailNotifs: true },
  },
  {
    id: 'enterprise',
    name: 'Enterprise', tagline: 'For large organisations with custom needs',
    price: 400, currency: 'PHP', period: 'employee / month', maxSeats: Infinity,
    color: '#ef5350', colorDark: '#e53935', badge: 'Full Access',
    features: ['Unlimited employees','Clock-in / Clock-out','Attendance records','Basic leave management','CSV export','Email support','Mobile app (iOS & Android)','Shift management','Department management','Analytics & reports','Overtime tracking','SMS notifications','Priority support','Biometric device integration','API access & webhooks','Custom attendance policies','Dedicated account manager','SLA guarantee'],
    limits: { reports: true, shifts: true, departments: true, biometric: true, api: true, sms: true, mobileApp: true, emailNotifs: true },
  },
];

const SubscriptionContext = createContext(null);

const AVATAR_COLORS = [
  '#4f6ef7','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#ec4899','#06b6d4','#84cc16','#f97316','#14b8a6',
];

// Keep the departments list in sync with what employees actually have typed in.
// - Any non-empty department typed on an employee that isn't tracked yet gets added,
//   and is remembered in `autoDepartments` so we know it was auto-created (not manual).
// - An auto-created department with zero employees in it gets pruned automatically
//   to free up space. Departments the user manually added on the Departments page
//   are left alone even at 0 employees, so pre-creating a department ahead of an
//   upcoming hire still works.
function syncDepartments(departments, autoDepartments, employees) {
  const list = departments || [];
  const autoSet = new Set(autoDepartments || []);
  const used = new Set(
    (employees || [])
      .map(e => (e.department || '').trim())
      .filter(Boolean)
  );

  // Any typed department not already tracked is new — add it and mark it as auto-created.
  const newNames = [...used].filter(name => !list.includes(name));

  // Only prune departments that were auto-created AND now have zero employees.
  const pruned = list.filter(name => used.has(name) || !autoSet.has(name));

  const nextDepartments = [...pruned, ...newNames];
  const nextAuto = [...autoSet, ...newNames].filter(name => nextDepartments.includes(name));

  return { departments: nextDepartments, autoDepartments: nextAuto };
}

// Helper: set both React state AND the ref in one call
function useStateRef(initial) {
  const [state, setStateRaw] = useState(initial);
  const ref = useRef(initial);
  const setState = useCallback((val) => {
    // Support both direct values and updater functions
    if (typeof val === 'function') {
      const next = val(ref.current);
      ref.current = next;
      setStateRaw(next);
    } else {
      ref.current = val;
      setStateRaw(val);
    }
  }, []);
  return [state, setState, ref];
}

export function SubscriptionProvider({ children }) {
  const { user } = useAuth();
  // useStateRef keeps state and ref always in sync — no separate sync effect needed
  const [subscription, setSubscription, subRef] = useStateRef(null);
  const [loading, setLoading] = useState(true);
  const [pendingEmployees, setPendingEmployees] = useState([]);

  // ── Reload from Supabase whenever the logged-in user changes ──────────────
  const loadSubscription = useCallback(async (subscriptionId, { cancelledRef } = {}) => {
    setLoading(true);
    try {
      if (subscriptionId) {
        const [data, pending] = await Promise.all([
          getSubscription(subscriptionId),
          getPendingRegistrations(subscriptionId),
        ]);
        if (!cancelledRef?.current) {
          setSubscription(data ?? null);
          setPendingEmployees(pending);
        }
        return !!data;
      }
      return false;
    } catch (err) {
      // A failed/timed-out fetch (see cache.js — the underlying Supabase call
      // can genuinely hang past its own fetch-level timeout, e.g. stuck
      // behind an internal token-refresh after the JWT went stale during a
      // long idle period) used to leave `subscription` stuck at null with
      // nothing ever retrying it — the only way out was a manual page
      // refresh, since that's the only other thing that re-runs this load.
      // The retry effect below now keeps trying in the background instead.
      console.warn('[SubscriptionContext] load failed:', err?.message || err);
      if (!cancelledRef?.current) {
        setSubscription(null);
        setPendingEmployees([]);
      }
      return false;
    } finally {
      if (!cancelledRef?.current) setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    const cancelledRef = { current: false };
    setSubscription(null);      // clears both state and ref
    setPendingEmployees([]);
    loadSubscription(user?.subscriptionId, { cancelledRef });
    return () => { cancelledRef.current = true; };
  }, [user?.subscriptionId]); // eslint-disable-line

  // ── Self-heal a failed load instead of requiring a manual refresh ──────────
  // If the load above failed (subscription is null but we do have a logged-in
  // user with a subscriptionId), keep retrying: once promptly on the next
  // tab-focus (the most likely moment the underlying network/session is
  // actually usable again), and on a slow background interval as a backstop
  // for the case where the tab is never explicitly refocused.
  useEffect(() => {
    if (subscription || loading || !user?.subscriptionId) return;

    const cancelledRef = { current: false };
    const retry = () => {
      if (document.visibilityState !== 'visible') return;
      loadSubscription(user.subscriptionId, { cancelledRef });
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') retry();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const RETRY_INTERVAL_MS = 20_000;
    const interval = setInterval(retry, RETRY_INTERVAL_MS);

    return () => {
      cancelledRef.current = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, [subscription, loading, user?.subscriptionId, loadSubscription]);

  // ── Poll attendance_records every 15 s so mobile clock-ins appear live ───────
  // Skips ticks while the tab is hidden, and backs off after repeated
  // failures, instead of firing a fresh request every 15s no matter what.
  //
  // Why: each poll opens a connection to the Supabase host. Browsers cap
  // concurrent connections per host (6 for HTTP/1.1); if a request's
  // AbortController fires but the underlying socket doesn't actually free up
  // right away (this can happen when a connection went bad during a tab
  // being idle/backgrounded — the JS-level abort doesn't guarantee the OS
  // socket closes immediately), repeatedly opening new polling requests into
  // that situation can exhaust all 6 connections with zombied sockets. Once
  // that happens, EVERY fetch to that host — including Save/Logout — just
  // queues forever waiting for a socket, with no visible network activity
  // and no error, and only a full page reload (which resets the connection
  // pool) recovers. Not polling while hidden, and slowing down (rather than
  // hammering) after consecutive failures, keeps this from spiraling.
  useEffect(() => {
    if (!user?.subscriptionId) return;

    let consecutiveFailures = 0;
    let cancelled = false;

    async function tick() {
      if (document.visibilityState !== 'visible') return; // don't poll while backgrounded
      let records;
      try {
        records = await getAttendanceRecords(user.subscriptionId);
      } catch (err) {
        // getAttendanceRecords rejects (doesn't resolve to null) when the
        // underlying cached() call times out (see cache.js). Skip this
        // tick and keep existing data, same as the records === null case
        // below — but also count it so the interval below can slow down
        // instead of retrying at full speed into a bad connection.
        consecutiveFailures++;
        console.warn('[SubscriptionContext] attendance poll failed:', err?.message || err);
        return;
      }
      consecutiveFailures = 0;
      if (records === null || cancelled) return; // fetch failed — keep existing
      setSubscription(prev => {
        if (!prev) return prev;
        // Skip re-render if records haven't changed
        if (JSON.stringify(prev.attendanceRecords) === JSON.stringify(records)) return prev;
        return { ...prev, attendanceRecords: records };
      });
    }

    const BASE_INTERVAL_MS = 15000;
    const MAX_INTERVAL_MS = 120000; // back off to at most once every 2 min
    let timeoutId = setTimeout(runAndReschedule, BASE_INTERVAL_MS);

    async function runAndReschedule() {
      await tick();
      if (cancelled) return;
      // Exponential-ish backoff while failures persist, reset once healthy.
      const delay = Math.min(BASE_INTERVAL_MS * 2 ** consecutiveFailures, MAX_INTERVAL_MS);
      timeoutId = setTimeout(runAndReschedule, delay);
    }

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [user?.subscriptionId]); // eslint-disable-line


  // ── Core mutator: reads ref (always fresh), writes state + Supabase ──────────
  // Returns a Promise now (previously returned the plain object). No existing
  // caller in this file captures/uses that return value for anything other
  // than implicitly forwarding it from a wrapping useCallback, and no page
  // outside this file consumes it either — so this is safe. The Promise lets
  // callers that need confirmed persistence (e.g. OnboardingPage's
  // "Finish setup") await the actual Supabase write instead of racing it.
  const update = useCallback(async (updater) => {
    const current = subRef.current;
    if (!current) {
      // Previously returned null here — a silent no-op. Every caller in this
      // file (addShift, updateShift, addDepartment, etc.) is a fire-and-forget
      // useCallback, and none of their callers checked the return value, so a
      // null subscription (e.g. after a stalled/failed background reload —
      // see the SubscriptionContext poll/reload effects above) meant the
      // "save" quietly did nothing: no Supabase call, no error, but the
      // calling page still showed a success toast right after. Throwing here
      // instead turns that into a real rejection callers can catch.
      const err = new Error('subscription-not-loaded');
      console.warn('[SubscriptionContext] update() called but subscription is null — nothing was saved');
      throw err;
    }
    const next = updater(current);    // may throw synchronously (e.g. seat limit) — propagates to caller
    setSubscription(next);            // updates both ref and React state
    try {
      await putSubscription(next);    // AWAIT persist to Supabase
    } catch (err) {
      // Persist failed — roll back the optimistic local update so the UI
      // never shows a change as "saved" when it only exists in memory.
      setSubscription(current);
      throw err;
    }
    return next;
  }, []); // eslint-disable-line — subRef and setSubscription are stable refs

  // ── subscribe() — creates a brand-new subscription on sign-up ───────────────
  // IMPORTANT: this is now async and AWAITS the Supabase write before
  // returning. Previously putSubscription(state) was fire-and-forget, so the
  // very next screen (onboarding → dashboard) could call getSubscription()
  // before the row actually existed in Postgres, causing a PGRST116
  // ("0 rows") error on the .single() query and an infinite loading screen.
  const subscribe = useCallback(async (planId, company, billing) => {
    const isTrial = planId === 'free_trial';
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const state = {
      subscriptionId, planId, company,
      billing: billing
        ? { ...billing, nextBillingDate: new Date(Date.now() + 30*24*60*60*1000).toISOString() }
        : null,
      enrolledEmployees: [],
      // Starts empty — departments are now auto-added the moment someone types
      // a new one on an employee, and auto-removed the moment they're empty.
      departments: [],
      // Tracks which department names were auto-added from typed employee input
      // (as opposed to manually created on the Departments page), so only those
      // get auto-pruned once nobody is left in them.
      autoDepartments: [],
      shifts: [
        { id: 1, name: 'Morning Shift',   start: '06:00', end: '14:00', color: '#f59e0b' },
        { id: 2, name: 'Day Shift',       start: '08:00', end: '17:00', color: '#4f6ef7' },
        { id: 3, name: 'Afternoon Shift', start: '14:00', end: '22:00', color: '#10b981' },
        { id: 4, name: 'Night Shift',     start: '22:00', end: '06:00', color: '#8b5cf6' },
        { id: 5, name: 'Flexible',        start: '09:00', end: '18:00', color: '#ef4444' },
      ],
      attendanceRecords: [],
      leaveRequests: [],
      settings: {
        timezone: 'Asia/Manila', dateFormat: 'MMM d, yyyy',
        lateThreshold: '15', overtimeMin: '30',
        autoClockout: true, requireReason: true, encryptPayloads: true,
        emailNotifs: true, smsNotifs: false, biometricSync: false,
        mobileClockIn: true, geoFencing: false, maxLeavePerMonth: '5',
        leaveTypes: [],
      },
      createdAt: new Date().toISOString(),
      status: isTrial ? 'trialing' : 'active',
      trialEndsAt: isTrial ? new Date(Date.now() + 14*24*60*60*1000).toISOString() : null,
      // Marks this account as having consumed its one-time free trial. Set
      // once here and never cleared afterwards (upgradePlan only patches
      // planId/status), so even after the trial expires or the client moves
      // to a paid plan, free_trial can never be selected again from the
      // Change Plan picker.
      hasUsedTrial: isTrial,
    };
    setSubscription(state);         // sets both ref and React state (instant UI update)
    await putSubscription(state);   // AWAIT the Supabase write — caller now knows
                                     // the row exists before navigating away.
    return state;
  }, []); // eslint-disable-line

  // ── Employees ────────────────────────────────────────────────────────────────
  const enrollEmployee = useCallback(async (employee) => {
    // Generate the ID once here so both the enrolledEmployees entry and
    // the accounts row use the exact same value — calling Date.now() twice
    // (once inside update() and once after) gives different milliseconds.
    const empId = Date.now();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const rand  = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

    await update(prev => {
      const plan = PLANS.find(p => p.id === prev.planId);
      if (prev.enrolledEmployees.length >= plan.maxSeats) {
        throw new Error(`Your ${plan.name} plan supports up to ${plan.maxSeats} employees. Please upgrade.`);
      }
      // Resolve clockInMode from the assigned shift so the mobile app can read
      // it directly from the employee object without a second lookup.
      const assignedShift = employee.shiftId
        ? prev.shifts.find(s => String(s.id) === String(employee.shiftId))
        : null;
      const clockInMode = assignedShift?.clockInMode ?? 'remote';
      const nextEmployees = [
        ...prev.enrolledEmployees,
        {
          ...employee,
          id: empId,
          employeeCode: employee.employeeCode?.trim()
            ? employee.employeeCode.trim().toUpperCase()
            : `ERJ-${rand}${String(empId).slice(-3)}`,
          status: 'active',
          accountEmployeeId: String(empId),
          avatarColor: AVATAR_COLORS[prev.enrolledEmployees.length % AVATAR_COLORS.length],
          clockInMode,
        },
      ];
      return {
        ...prev,
        enrolledEmployees: nextEmployees,
        // Auto-add a freshly typed department (e.g. "Department of Agriculture")
        // and prune any auto-created department that's now unused.
        ...syncDepartments(prev.departments, prev.autoDepartments, nextEmployees),
      };
    });
    // Create mobile login account if credentials provided
    if (employee.email && employee.password) {
      const name = [employee.firstName, employee.lastName].filter(Boolean).join(' ');
      try {
        await createEmployeeAccount({
          employeeId:     String(empId),
          subscriptionId: subRef.current?.subscriptionId,
          name,
          email:    employee.email,
          username: employee.username,
          password: employee.password,
        });
      } catch (err) {
        // Re-throw so the caller (handleAdd) can show the error to the user.
        // The employee row is already saved locally; only the auth account failed.
        throw new Error(`Employee saved, but account creation failed: ${err.message}`);
      }
    }
  }, [update]);

  const removeEmployee = useCallback((id) => update(prev => {
    const nextEmployees = prev.enrolledEmployees.filter(e => e.id !== id);
    return {
      ...prev,
      enrolledEmployees: nextEmployees,
      // Removing an employee may leave an auto-created department with nobody
      // in it — free it up. Manually created departments are left alone.
      ...syncDepartments(prev.departments, prev.autoDepartments, nextEmployees),
    };
  }), [update]);
  const updateEmployee = useCallback(async (id, upd) => {
    // 1. Update the enrolledEmployees JSON in the subscription (local + Supabase)
    //    If shiftId is changing, also resolve and store clockInMode from the new
    //    shift so the mobile app can read it directly without a second lookup.
    update(prev => {
      let resolvedUpd = { ...upd };
      if (upd.shiftId !== undefined) {
        const assignedShift = upd.shiftId
          ? prev.shifts.find(s => String(s.id) === String(upd.shiftId))
          : null;
        resolvedUpd.clockInMode = assignedShift?.clockInMode ?? 'remote';
      }
      const nextEmployees = prev.enrolledEmployees.map(e => e.id === id ? { ...e, ...resolvedUpd } : e);
      return {
        ...prev,
        enrolledEmployees: nextEmployees,
        // If the department changed, add any newly typed department and
        // prune whichever auto-created department is now empty.
        ...syncDepartments(prev.departments, prev.autoDepartments, nextEmployees),
      };
    });

    // 2. Sync the accounts table if any account-related fields changed
    const accountFields = ['username', 'password', 'name', 'email'];
    const hasAccountUpdate = accountFields.some(f => upd[f] !== undefined);
    if (!hasAccountUpdate) return;

    try {
      const existing = await getEmployeeAccount(String(id));

      if (existing) {
        // Account exists — update it
        await updateEmployeeAccount(String(id), {
          name:     upd.name     ?? undefined,
          email:    upd.email    ?? undefined,
          password: upd.password ?? undefined,
          username: upd.username ?? undefined,
        });
      } else if (upd.username && upd.password) {
        // No account yet — create one now
        const current = subRef.current;
        const name = [upd.firstName, upd.lastName].filter(Boolean).join(' ');
        await createEmployeeAccount({
          employeeId:     String(id),
          subscriptionId: current?.subscriptionId,
          name:           name || upd.name || '',
          email:          upd.email ?? '',
          username:       upd.username,
          password:       upd.password,
        });
      }
    } catch (err) {
      console.warn('[updateEmployee] account sync failed:', err.message);
    }
  }, [update]);
  const cancelSubscription = useCallback(()        => update(prev => ({ ...prev, status: 'cancelled' })), [update]);
  const upgradePlan        = useCallback((planId)  => update(prev => {
    if (planId === 'free_trial' && prev.hasUsedTrial) {
      throw new Error('The free trial has already been used on this account.');
    }
    return { ...prev, planId, status: 'active' };
  }), [update]);
  const clearSubscription  = useCallback(()        => setSubscription(null), []);  // eslint-disable-line
  const updateSettings     = useCallback((upd)     => update(prev => ({ ...prev, settings: { ...prev.settings, ...upd } })), [update]);

  // ── Attendance ────────────────────────────────────────────────────────────────
  const addAttendanceRecord = useCallback((record) => {
    const newRecord = { ...record, id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
    setSubscription(prev => {
      if (!prev) return prev;
      const updated = { ...prev, attendanceRecords: [...prev.attendanceRecords, newRecord] };
      // Only patch attendance_records column — avoids overwriting mobile clock-ins
      putAttendanceRecords(prev.subscriptionId, updated.attendanceRecords);
      return updated;
    });
  }, []); // eslint-disable-line

  const updateAttendanceRecord = useCallback((recordId, updates) => {
    setSubscription(prev => {
      if (!prev) return prev;
      const updatedRecords = prev.attendanceRecords.map(r => r.id === recordId ? { ...r, ...updates } : r);
      // Only patch attendance_records column — avoids overwriting mobile clock-ins
      putAttendanceRecords(prev.subscriptionId, updatedRecords);
      return { ...prev, attendanceRecords: updatedRecords };
    });
  }, []); // eslint-disable-line

  // ── Leave ─────────────────────────────────────────────────────────────────────
  const addLeaveRequest = useCallback((req) => {
    return update(prev => ({
      ...prev,
      leaveRequests: [
        ...prev.leaveRequests,
        {
          ...req,
          id: `lv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
      ],
    }));
  }, [update]);

  const updateLeaveRequest = useCallback((reqId, updates) => {
    return update(prev => ({
      ...prev,
      leaveRequests: prev.leaveRequests.map(r => r.id === reqId ? { ...r, ...updates } : r),
    }));
  }, [update]);

  // ── Leave Types ───────────────────────────────────────────────────────────────
  const addLeaveType = useCallback((name, defaultBalance) => {
    return update(prev => {
      const existing = prev.settings?.leaveTypes ?? [];
      if (existing.some(t => t.name.toLowerCase() === name.toLowerCase())) {
        throw new Error(`Leave type "${name}" already exists.`);
      }
      const days = Number(defaultBalance) || 0;
      return {
        ...prev,
        settings: {
          ...prev.settings,
          leaveTypes: [
            ...existing,
            { name, defaultBalance: days },
          ],
        },
        // Seed all existing employees with the default balance for this new type
        enrolledEmployees: prev.enrolledEmployees.map(emp => ({
          ...emp,
          leaveBalances: {
            [name]: days,          // default for new type
            ...(emp.leaveBalances ?? {}), // don't overwrite if already set
          },
        })),
      };
    });
  }, [update]);

  const updateLeaveType = useCallback((name, updates) => {
    return update(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        leaveTypes: (prev.settings?.leaveTypes ?? []).map(t =>
          t.name === name ? { ...t, ...updates } : t
        ),
      },
    }));
  }, [update]);

  const removeLeaveType = useCallback((name) => {
    return update(prev => ({
      ...prev,
      // Remove from leaveTypes list
      settings: {
        ...prev.settings,
        leaveTypes: (prev.settings?.leaveTypes ?? []).filter(t => t.name !== name),
      },
      // Clear this leave type from every employee's leaveBalances
      enrolledEmployees: prev.enrolledEmployees.map(emp => {
        if (!emp.leaveBalances || !(name in emp.leaveBalances)) return emp;
        const { [name]: _removed, ...rest } = emp.leaveBalances;
        return { ...emp, leaveBalances: rest };
      }),
    }));
  }, [update]);

  // ── Leave Balances ────────────────────────────────────────────────────────────
  const setEmployeeLeaveBalance = useCallback((employeeId, typeName, value) => {
    return update(prev => ({
      ...prev,
      enrolledEmployees: prev.enrolledEmployees.map(emp =>
        String(emp.id) === String(employeeId)
          ? {
              ...emp,
              leaveBalances: {
                ...(emp.leaveBalances ?? {}),
                [typeName]: Number(value) || 0,
              },
            }
          : emp
      ),
    }));
  }, [update]);

  // ── Employee Self-Registration (Supabase-backed) ──────────────────────────
  const submitRegistration = useCallback(async (subscriptionId, form) => {
    const id = await insertPendingRegistration(subscriptionId, form);
    const newEntry = { ...form, id, subscriptionId, submittedAt: new Date().toISOString() };
    setPendingEmployees(prev => [...prev, newEntry]);
  }, []);

  const editPendingRegistration = useCallback(async (pendingId, form) => {
    await updatePendingRegistration(pendingId, form);
    setPendingEmployees(prev => prev.map(p => p.id === pendingId ? { ...p, ...form } : p));
  }, []);

  const approveEmployee = useCallback(async (pendingId, pendingList) => {
    const current = subRef.current;
    if (!current) return;
    const pending = (pendingList || []).find(p => p.id === pendingId);
    if (!pending) throw new Error('Pending registration not found.');
    const plan = PLANS.find(p => p.id === current.planId);
    if (current.enrolledEmployees.length >= plan.maxSeats) {
      throw new Error(`Seat limit reached for ${plan.name}. Upgrade to approve more employees.`);
    }
    // Generate ID once so enrolledEmployees and accounts row are always in sync
    const empId = Date.now();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const rand  = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const { id: _pid, subscriptionId: _sid, submittedAt: _s, notes: _n, ...rest } = pending;
    update(prev => {
      const nextEmployees = [
        ...prev.enrolledEmployees,
        {
          ...rest,
          id: empId,
          employeeCode: rest.employeeCode?.trim()
            ? rest.employeeCode.trim().toUpperCase()
            : `ERJ-${rand}${String(empId).slice(-3)}`,
          status: 'active',
          accountEmployeeId: String(empId),
          avatarColor: AVATAR_COLORS[prev.enrolledEmployees.length % AVATAR_COLORS.length],
        },
      ];
      return {
        ...prev,
        enrolledEmployees: nextEmployees,
        // Auto-add the department the employee typed during self-registration.
        ...syncDepartments(prev.departments, prev.autoDepartments, nextEmployees),
      };
    });
    await deletePendingRegistration(pendingId);
    setPendingEmployees(prev => prev.filter(p => p.id !== pendingId));
    // Create mobile login account if credentials provided
    if (pending.email && pending.password) {
      const name = [pending.firstName, pending.lastName].filter(Boolean).join(' ');
      try {
        await createEmployeeAccount({
          employeeId:     String(empId),
          subscriptionId: current.subscriptionId,
          name,
          email:    pending.email,
          username: pending.username,
          password: pending.password,
        });
      } catch (err) {
        console.warn('[approveEmployee] account creation failed:', err.message);
      }
    }
  }, [update]); // eslint-disable-line

  const rejectEmployee = useCallback(async (pendingId) => {
    await deletePendingRegistration(pendingId);
    setPendingEmployees(prev => prev.filter(p => p.id !== pendingId));
  }, []);

  // ── Departments ───────────────────────────────────────────────────────────────
  // Manually created departments are never marked "auto" — they survive at 0 employees
  // until someone removes them here on purpose.
  const addDepartment    = useCallback((name) => update(prev => ({ ...prev, departments: [...prev.departments, name] })), [update]);
  const removeDepartment = useCallback((name) => update(prev => ({
    ...prev,
    departments: prev.departments.filter(d => d !== name),
    autoDepartments: (prev.autoDepartments || []).filter(d => d !== name),
  })), [update]);

  // ── Shifts ────────────────────────────────────────────────────────────────────
  const addShift    = useCallback((shift)   => update(prev => ({ ...prev, shifts: [...prev.shifts, { id: Date.now(), ...shift }] })), [update]);
  const removeShift = useCallback((shiftId) => update(prev => ({ ...prev, shifts: prev.shifts.filter(s => s.id !== shiftId) })), [update]);
  const updateShift = useCallback((shiftId, upd) => update(prev => {
    const updatedShifts = prev.shifts.map(s => s.id === shiftId ? { ...s, ...upd } : s);
    // If clockInMode changed, propagate it to all employees assigned to this shift
    // so the mobile app always reads an up-to-date value from the employee object.
    let updatedEmployees = prev.enrolledEmployees;
    if (upd.clockInMode !== undefined) {
      updatedEmployees = prev.enrolledEmployees.map(e =>
        String(e.shiftId) === String(shiftId)
          ? { ...e, clockInMode: upd.clockInMode }
          : e
      );
    }
    return { ...prev, shifts: updatedShifts, enrolledEmployees: updatedEmployees };
  }), [update]);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const currentPlan    = subscription ? PLANS.find(p => p.id === subscription.planId) : null;
  const seatsUsed      = subscription?.enrolledEmployees?.length ?? 0;
  const seatsAvailable = currentPlan ? (currentPlan.maxSeats === Infinity ? Infinity : currentPlan.maxSeats - seatsUsed) : 0;
  const trialDaysLeft  = subscription?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(subscription.trialEndsAt) - Date.now()) / (1000*60*60*24)))
    : 0;

  return (
    <SubscriptionContext.Provider value={{
      subscription, loading, currentPlan, seatsUsed, seatsAvailable, trialDaysLeft,
      pendingEmployees,
      setPendingEmployeesExternal: setPendingEmployees,
      subscribe, enrollEmployee, removeEmployee, updateEmployee,
      submitRegistration, editPendingRegistration, approveEmployee, rejectEmployee,
      cancelSubscription, upgradePlan, clearSubscription, updateSettings,
      addAttendanceRecord, updateAttendanceRecord,
      addLeaveRequest, updateLeaveRequest,
      addLeaveType, updateLeaveType, removeLeaveType,
      setEmployeeLeaveBalance,
      addDepartment, removeDepartment,
      addShift, removeShift, updateShift,
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export const useSubscription = () => {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be within SubscriptionProvider');
  return ctx;
};