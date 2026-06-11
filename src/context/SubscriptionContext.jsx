import { createContext, useContext, useState, useCallback } from 'react';

export const PLANS = [
  {
    id: 'free_trial',
    name: 'Free Trial',
    tagline: 'Try the basics — no card needed',
    price: 0,
    currency: 'PHP',
    period: '14-day trial',
    maxSeats: 15,
    color: '#26c6da',
    badge: 'Free Trial',
    isTrial: true,
    features: [
      'Up to 15 employees',
      'Clock-in / Clock-out',
      'Attendance records',
      'Basic leave management',
      'CSV export',
    ],
    limits: { reports: false, shifts: false, departments: false, biometric: false, api: false },
  },
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'For small teams getting started',
    price: 150,
    currency: 'PHP',
    period: 'employee / month',
    maxSeats: 25,
    color: '#26c6da',
    colorDark: '#00acc1',
    badge: null,
    features: [
      'Up to 25 employees',
      'Clock-in / Clock-out',
      'Attendance records',
      'Basic leave management',
      'CSV export',
      'Email support',
    ],
    limits: { reports: false, shifts: false, departments: false, biometric: false, api: false },
  },
  {
    id: 'growth',
    name: 'Growth',
    tagline: 'For growing teams with more complexity',
    price: 250,
    currency: 'PHP',
    period: 'employee / month',
    maxSeats: 200,
    color: '#26a69a',
    colorDark: '#00897b',
    badge: 'Most Popular',
    features: [
      'Up to 200 employees',
      'Clock-in / Clock-out',
      'Attendance records',
      'Basic leave management',
      'CSV export',
      'Email support',
      'Shift management',
      'Department management',
      'Analytics & reports',
      'Overtime tracking',
      'Priority support',
    ],
    limits: { reports: true, shifts: true, departments: true, biometric: false, api: false },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For large organisations with custom needs',
    price: 400,
    currency: 'PHP',
    period: 'employee / month',
    maxSeats: Infinity,
    color: '#ef5350',
    colorDark: '#e53935',
    badge: 'Full Access',
    features: [
      'Unlimited employees',
      'Clock-in / Clock-out',
      'Attendance records',
      'Basic leave management',
      'CSV export',
      'Email support',
      'Shift management',
      'Department management',
      'Analytics & reports',
      'Overtime tracking',
      'Priority support',
      'Biometric device integration',
      'API access & webhooks',
      'Custom attendance policies',
      'Dedicated account manager',
      'SLA guarantee',
    ],
    limits: { reports: true, shifts: true, departments: true, biometric: true, api: true },
  },
];

const SubscriptionContext = createContext(null);

const STORAGE_KEY = 'attms_subscription';

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const AVATAR_COLORS = [
  '#4f6ef7','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#ec4899','#06b6d4','#84cc16','#f97316','#14b8a6',
];

export function SubscriptionProvider({ children }) {
  const [subscription, setSubscription] = useState(() => loadState());

  const subscribe = useCallback((planId, company, billing) => {
    const isTrial = planId === 'free_trial';
    const trialEndsAt = isTrial
      ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const state = {
      planId,
      company,
      billing: { ...billing, nextBillingDate },
      enrolledEmployees: [],
      departments: ['Engineering', 'Human Resources', 'Finance', 'Operations', 'Marketing', 'Sales', 'Customer Support'],
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
        timezone: 'Asia/Manila',
        dateFormat: 'MMM d, yyyy',
        lateThreshold: '15',
        overtimeMin: '30',
        autoClockout: true,
        requireReason: true,
        encryptPayloads: true,
        emailNotifs: true,
        smsNotifs: false,
        biometricSync: false,
        mobileClockIn: true,
        geoFencing: false,
        maxLeavePerMonth: '5',
      },
      createdAt: new Date().toISOString(),
      status: isTrial ? 'trialing' : 'active',
      trialEndsAt,
    };
    setSubscription(state);
    saveState(state);
    return state;
  }, []);

  const enrollEmployee = useCallback((employee) => {
    setSubscription(prev => {
      const plan = PLANS.find(p => p.id === prev.planId);
      if (prev.enrolledEmployees.length >= plan.maxSeats) {
        throw new Error(`Your ${plan.name} plan supports up to ${plan.maxSeats} employees. Please upgrade.`);
      }
      const next = {
        ...prev,
        enrolledEmployees: [
          ...prev.enrolledEmployees,
          {
            ...employee,
            id: Date.now(),
            employeeCode: `EMP-${String(prev.enrolledEmployees.length + 1).padStart(4, '0')}`,
            status: 'active',
            avatarColor: AVATAR_COLORS[prev.enrolledEmployees.length % AVATAR_COLORS.length],
          },
        ],
      };
      saveState(next);
      return next;
    });
  }, []);

  const removeEmployee = useCallback((employeeId) => {
    setSubscription(prev => {
      const next = { ...prev, enrolledEmployees: prev.enrolledEmployees.filter(e => e.id !== employeeId) };
      saveState(next);
      return next;
    });
  }, []);

  const updateEmployee = useCallback((employeeId, updates) => {
    setSubscription(prev => {
      const next = {
        ...prev,
        enrolledEmployees: prev.enrolledEmployees.map(e => e.id === employeeId ? { ...e, ...updates } : e),
      };
      saveState(next);
      return next;
    });
  }, []);

  const cancelSubscription = useCallback(() => {
    setSubscription(prev => {
      const next = { ...prev, status: 'cancelled' };
      saveState(next);
      return next;
    });
  }, []);

  const upgradePlan = useCallback((planId) => {
    setSubscription(prev => {
      const next = { ...prev, planId, status: 'active' };
      saveState(next);
      return next;
    });
  }, []);

  const clearSubscription = useCallback(() => {
    setSubscription(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const updateSettings = useCallback((updates) => {
    setSubscription(prev => {
      const next = { ...prev, settings: { ...prev.settings, ...updates } };
      saveState(next);
      return next;
    });
  }, []);

  // Attendance record helpers
  const addAttendanceRecord = useCallback((record) => {
    setSubscription(prev => {
      const next = {
        ...prev,
        attendanceRecords: [
          ...prev.attendanceRecords,
          { ...record, id: Date.now() + Math.random() },
        ],
      };
      saveState(next);
      return next;
    });
  }, []);

  const updateAttendanceRecord = useCallback((recordId, updates) => {
    setSubscription(prev => {
      const next = {
        ...prev,
        attendanceRecords: prev.attendanceRecords.map(r => r.id === recordId ? { ...r, ...updates } : r),
      };
      saveState(next);
      return next;
    });
  }, []);

  // Leave request helpers
  const addLeaveRequest = useCallback((req) => {
    setSubscription(prev => {
      const next = {
        ...prev,
        leaveRequests: [
          ...prev.leaveRequests,
          { ...req, id: Date.now() + Math.random(), status: 'pending', createdAt: new Date().toISOString() },
        ],
      };
      saveState(next);
      return next;
    });
  }, []);

  const updateLeaveRequest = useCallback((reqId, updates) => {
    setSubscription(prev => {
      const next = {
        ...prev,
        leaveRequests: prev.leaveRequests.map(r => r.id === reqId ? { ...r, ...updates } : r),
      };
      saveState(next);
      return next;
    });
  }, []);

  // Department helpers
  const addDepartment = useCallback((name) => {
    setSubscription(prev => {
      const next = { ...prev, departments: [...prev.departments, name] };
      saveState(next);
      return next;
    });
  }, []);

  const removeDepartment = useCallback((name) => {
    setSubscription(prev => {
      const next = { ...prev, departments: prev.departments.filter(d => d !== name) };
      saveState(next);
      return next;
    });
  }, []);

  // Shift helpers
  const addShift = useCallback((shift) => {
    setSubscription(prev => {
      const next = {
        ...prev,
        shifts: [...prev.shifts, { ...shift, id: Date.now() }],
      };
      saveState(next);
      return next;
    });
  }, []);

  const removeShift = useCallback((shiftId) => {
    setSubscription(prev => {
      const next = { ...prev, shifts: prev.shifts.filter(s => s.id !== shiftId) };
      saveState(next);
      return next;
    });
  }, []);

  const currentPlan = subscription ? PLANS.find(p => p.id === subscription.planId) : null;
  const seatsUsed = subscription?.enrolledEmployees?.length ?? 0;
  const seatsAvailable = currentPlan ? (currentPlan.maxSeats === Infinity ? Infinity : currentPlan.maxSeats - seatsUsed) : 0;
  const trialDaysLeft = subscription?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(subscription.trialEndsAt) - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <SubscriptionContext.Provider value={{
      subscription,
      currentPlan,
      seatsUsed,
      seatsAvailable,
      trialDaysLeft,
      subscribe,
      enrollEmployee,
      removeEmployee,
      updateEmployee,
      cancelSubscription,
      upgradePlan,
      clearSubscription,
      updateSettings,
      addAttendanceRecord,
      updateAttendanceRecord,
      addLeaveRequest,
      updateLeaveRequest,
      addDepartment,
      removeDepartment,
      addShift,
      removeShift,
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
