import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { getSubscription, putSubscription } from '../utils/db';
import { useAuth } from './AuthContext';

export const PLANS = [
  {
    id: 'free_trial',
    name: 'Free Trial',
    tagline: 'Try the basics — no card needed',
    price: 0, currency: 'PHP', period: '14-day trial', maxSeats: 15, color: '#26c6da',
    badge: 'Free Trial', isTrial: true,
    features: ['Up to 15 employees','Clock-in / Clock-out','Attendance records','Basic leave management','CSV export'],
    limits: { reports: false, shifts: false, departments: false, biometric: false, api: false, sms: false, mobileApp: false, emailNotifs: false },
  },
  {
    id: 'starter',
    name: 'Starter', tagline: 'For small teams getting started',
    price: 150, currency: 'PHP', period: 'employee / month', maxSeats: 25,
    color: '#26c6da', colorDark: '#00acc1', badge: null,
    features: ['Up to 25 employees','Clock-in / Clock-out','Attendance records','Basic leave management','CSV export','Email support','Mobile app (iOS & Android)'],
    limits: { reports: false, shifts: false, departments: false, biometric: false, api: false, sms: false, mobileApp: true, emailNotifs: true },
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

  // ── Reload from IndexedDB whenever the logged-in user changes ──────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setSubscription(null);      // clears both state and ref
      if (user?.subscriptionId) {
        const data = await getSubscription(user.subscriptionId);
        if (!cancelled) {
          setSubscription(data ?? null);   // sets both state and ref
        }
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [user?.subscriptionId]); // eslint-disable-line

  // ── Core mutator: reads ref (always fresh), writes state + IndexedDB ────────
  const update = useCallback((updater) => {
    const current = subRef.current;
    if (!current) {
      console.warn('[SubscriptionContext] update called but subscription is null');
      return null;
    }
    const next = updater(current);
    setSubscription(next);        // updates both ref and React state
    putSubscription(next);        // persist to IndexedDB
    return next;
  }, []); // eslint-disable-line — subRef and setSubscription are stable refs

  // ── subscribe() — creates a brand-new subscription on sign-up ───────────────
  const subscribe = useCallback((planId, company, billing) => {
    const isTrial = planId === 'free_trial';
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const state = {
      subscriptionId, planId, company,
      billing: billing
        ? { ...billing, nextBillingDate: new Date(Date.now() + 30*24*60*60*1000).toISOString() }
        : null,
      enrolledEmployees: [],
      departments: ['Engineering','Human Resources','Finance','Operations','Marketing','Sales','Customer Support'],
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
      },
      createdAt: new Date().toISOString(),
      status: isTrial ? 'trialing' : 'active',
      trialEndsAt: isTrial ? new Date(Date.now() + 14*24*60*60*1000).toISOString() : null,
    };
    setSubscription(state);   // sets both ref and React state
    putSubscription(state);   // persist immediately
    return state;
  }, []); // eslint-disable-line

  // ── Employees ────────────────────────────────────────────────────────────────
  const enrollEmployee = useCallback((employee) => {
    update(prev => {
      const plan = PLANS.find(p => p.id === prev.planId);
      if (prev.enrolledEmployees.length >= plan.maxSeats) {
        throw new Error(`Your ${plan.name} plan supports up to ${plan.maxSeats} employees. Please upgrade.`);
      }
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const rand  = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      return {
        ...prev,
        enrolledEmployees: [
          ...prev.enrolledEmployees,
          {
            ...employee,
            id: Date.now(),
            employeeCode: employee.employeeCode?.trim()
              ? employee.employeeCode.trim().toUpperCase()
              : `ERJ-${rand}${String(Date.now()).slice(-3)}`,
            status: 'active',
            avatarColor: AVATAR_COLORS[prev.enrolledEmployees.length % AVATAR_COLORS.length],
          },
        ],
      };
    });
  }, [update]);

  const removeEmployee     = useCallback((id)      => update(prev => ({ ...prev, enrolledEmployees: prev.enrolledEmployees.filter(e => e.id !== id) })), [update]);
  const updateEmployee     = useCallback((id, upd) => update(prev => ({ ...prev, enrolledEmployees: prev.enrolledEmployees.map(e => e.id === id ? { ...e, ...upd } : e) })), [update]);
  const cancelSubscription = useCallback(()        => update(prev => ({ ...prev, status: 'cancelled' })), [update]);
  const upgradePlan        = useCallback((planId)  => update(prev => ({ ...prev, planId, status: 'active' })), [update]);
  const clearSubscription  = useCallback(()        => setSubscription(null), []);  // eslint-disable-line
  const updateSettings     = useCallback((upd)     => update(prev => ({ ...prev, settings: { ...prev.settings, ...upd } })), [update]);

  // ── Attendance ────────────────────────────────────────────────────────────────
  const addAttendanceRecord = useCallback((record) => {
    update(prev => ({
      ...prev,
      attendanceRecords: [
        ...prev.attendanceRecords,
        { ...record, id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` },
      ],
    }));
  }, [update]);

  const updateAttendanceRecord = useCallback((recordId, updates) => {
    update(prev => ({
      ...prev,
      attendanceRecords: prev.attendanceRecords.map(r => r.id === recordId ? { ...r, ...updates } : r),
    }));
  }, [update]);

  // ── Leave ─────────────────────────────────────────────────────────────────────
  const addLeaveRequest = useCallback((req) => {
    update(prev => ({
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
    update(prev => ({
      ...prev,
      leaveRequests: prev.leaveRequests.map(r => r.id === reqId ? { ...r, ...updates } : r),
    }));
  }, [update]);

  // ── Departments ───────────────────────────────────────────────────────────────
  const addDepartment    = useCallback((name) => update(prev => ({ ...prev, departments: [...prev.departments, name] })), [update]);
  const removeDepartment = useCallback((name) => update(prev => ({ ...prev, departments: prev.departments.filter(d => d !== name) })), [update]);

  // ── Shifts ────────────────────────────────────────────────────────────────────
  const addShift    = useCallback((shift)   => update(prev => ({ ...prev, shifts: [...prev.shifts, { ...shift, id: Date.now() }] })), [update]);
  const removeShift = useCallback((shiftId) => update(prev => ({ ...prev, shifts: prev.shifts.filter(s => s.id !== shiftId) })), [update]);
  const updateShift = useCallback((shiftId, upd) => update(prev => ({ ...prev, shifts: prev.shifts.map(s => s.id === shiftId ? { ...s, ...upd } : s) })), [update]);

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
      subscribe, enrollEmployee, removeEmployee, updateEmployee,
      cancelSubscription, upgradePlan, clearSubscription, updateSettings,
      addAttendanceRecord, updateAttendanceRecord,
      addLeaveRequest, updateLeaveRequest,
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
