import { useEffect, useState, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ConnectionIssueModal from './components/ConnectionIssueModal';
import { SubscriptionProvider, useSubscription } from './context/SubscriptionContext';
import { ToastProvider } from './context/ToastContext';
import { NotificationsProvider } from './context/NotificationsContext';
import AppLayout from './components/layout/AppLayout';
import PlanGate from './components/PlanGate';
import LoadingScreen from './components/LoadingScreen';
import CookieConsentBanner from './components/CookieConsentBanner';
import { loadDraft, findDraftsByPrefix } from './utils/formDraft';
import { employeeDraftKey, isAddEmployeeFormMeaningful, csvImportDraftKey, isCsvImportDraftMeaningful } from './utils/employeeDraft';
import {
  editEmployeeDraftPrefix, isEditEmployeeFormMeaningful,
  attendanceDraftPrefix, isAttendanceFormMeaningful,
  leaveDraftPrefix, isLeaveFormMeaningful,
  shiftDraftPrefix, isShiftFormMeaningful,
  departmentDraftKey, isDepartmentFormMeaningful,
} from './utils/draftKeys';

import LandingPage from './pages/public/LandingPage';
import PricingPage from './pages/public/PricingPage';
import SignupPage from './pages/public/SignupPage';
import OnboardingPage from './pages/public/OnboardingPage';
import EmployeeRegisterPage from './pages/public/EmployeeRegisterPage';
import LoginPage from './pages/LoginPage';

import DashboardPage from './pages/DashboardPage';
import AttendancePage from './pages/AttendancePage';
import TimeRenderPage from './pages/TimeRenderPage';
import EmployeesPage from './pages/EmployeesPage';
import LeavePage from './pages/LeavePage';
import ReportsPage from './pages/ReportsPage';
import ShiftsPage from './pages/ShiftsPage';
import DepartmentsPage from './pages/DepartmentsPage';
import SettingsPage from './pages/SettingsPage';
import SubscriptionPage from './pages/SubscriptionPage';
import ProfilePage from './pages/ProfilePage';
import HelpCenterPage from './pages/HelpCenterPage';
import SuperAdminLayout from './components/layout/SuperAdminLayout';
import SuperAdminPage from './pages/SuperAdminPage';

/**
 * Guard: requires auth + a valid subscription.
 * By the time a user reaches here after login, the subscription is already
 * fetched (TransitionLoadingScreen waited for it), so loading is near-instant.
 */
function PrivateRoute({ children }) {
  const { user, authReady } = useAuth();
  const { subscription, loading, trialDaysLeft } = useSubscription();
  const location = useLocation();

  // Wait for the Supabase Auth session to be resolved before making a decision
  if (!authReady) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (loading) return <LoadingScreen />;
  if (!subscription) return <Navigate to="/pricing" replace />;

  // A subscription row exists as soon as signup completes — well before the
  // admin has actually finished /onboard (enrolled anyone, hit "Finish
  // setup"). Previously nothing distinguished that from a fully-onboarded
  // subscription, so a reload (or any other navigation) that ever landed
  // the user on /app/* mid-onboarding just... stayed there, silently
  // dropping the in-progress enrollment flow. Send them back to finish it.
  if (subscription.onboardingComplete === false) {
    return <Navigate to="/onboard" replace />;
  }

  if (subscription.status === 'cancelled' && location.pathname !== '/app/subscription') {
    return <Navigate to="/app/subscription" replace />;
  }

  // Trial expired — everything except Subscription & Billing is locked until
  // the client activates a paid plan.
  if (subscription.status === 'trialing' && trialDaysLeft <= 0 && location.pathname !== '/app/subscription') {
    return <Navigate to="/app/subscription" replace />;
  }

  // Suspended (set by the subscription-lifecycle cron, ~7 days after a missed
  // payment) — same lockdown as cancelled/trial-expired: everything except
  // Subscription & Billing redirects to the reactivation screen. Historical
  // data stays intact in the DB, just inaccessible until they reactivate.
  // NOTE: `grace_period` (days 0-7 after a missed payment) intentionally
  // does NOT lock anything — the system stays fully usable during grace.
  if (subscription.status === 'suspended' && location.pathname !== '/app/subscription') {
    return <Navigate to="/app/subscription" replace />;
  }

  return children;
}

/**
 * Role-only guard — only used for nested routes already inside a PrivateRoute.
 */
function RoleRoute({ children, roles }) {
  const { user } = useAuth();
  if (roles && !roles.includes(user?.role)) return <Navigate to="/app/dashboard" replace />;
  return children;
}

/**
 * Guard for the superadmin (platform owner) area.
 * Deliberately independent of PrivateRoute/SubscriptionProvider — the
 * superadmin is not scoped to any single company's subscription, so it
 * must not be redirected to /pricing for lacking one.
 */
function SuperAdminRoute({ children }) {
  const { user, authReady } = useAuth();

  if (!authReady) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!['superadmin', 'sub_superadmin'].includes(user.role)) return <Navigate to="/app/dashboard" replace />;

  return children;
}

/**
 * Guard for pages that should only be visible when NOT logged in.
 *
 * Waits for authReady before redirecting so we don't briefly flash the login
 * page while Supabase Auth resolves the persisted session.
 */
function PublicRoute({ children }) {
  const { user, authReady } = useAuth();
  const { subscription, loading } = useSubscription();

  if (!authReady) return <LoadingScreen />;
  if (['superadmin', 'sub_superadmin'].includes(user?.role)) return <Navigate to="/superadmin" replace />;
  if (user && (loading || !subscription)) return <LoadingScreen />;
  if (user && subscription.onboardingComplete === false) return <Navigate to="/onboard" replace />;
  if (user && subscription.status !== 'cancelled') return <Navigate to="/app/dashboard" replace />;
  return children;
}

/**
 * Shows the ERJ splash screen on the very first hard load of the session.
 * Uses sessionStorage so it only ever shows once — re-renders caused by
 * state changes (e.g. commitLogin) will never bring it back.
 */
const SPLASH_KEY = 'erj_splash_shown';

function FirstLoadGate({ children }) {
  const alreadySeen = sessionStorage.getItem(SPLASH_KEY) === '1';
  const [visible, setVisible] = useState(!alreadySeen);
  const [fading, setFading] = useState(false);

  const handleLoadComplete = () => {
    sessionStorage.setItem(SPLASH_KEY, '1');
    setFading(true);
    setTimeout(() => setVisible(false), 320);
  };

  if (!visible) return children;

  return (
    <>
      {children}
      <div className={`erj-first-load${fading ? ' erj-first-load--out' : ''}`}>
        <LoadingScreen
          label="Loading…"
          onComplete={handleLoadComplete}
        />
      </div>
    </>
  );
}

/**
 * A hard reload always lands on whatever route was in the address bar —
 * but plenty of things (a fresh login, a session-resume redirect, opening
 * the app from a bookmark/PWA icon) drop the user on /app/dashboard
 * regardless of what they were doing. If they have an unsaved form draft
 * sitting in localStorage — Add/Edit Employee, an attendance record, a
 * leave request, a shift, or a new department — this jumps them straight
 * to the page that owns it (where the page's own restore logic takes
 * over and reopens the right modal with the restored data) instead of
 * leaving it to be found only if they happen to navigate there manually.
 *
 * Runs at most once per app boot — the ref guard means this checks on the
 * very first settled render and then gets out of the way, so it never
 * fights with the user's own navigation afterward.
 *
 * Each entry below only checks "is there a draft worth resuming", using
 * the same isMeaningful logic the destination page itself uses — the
 * actual restore (finding the record, opening the modal, showing the
 * banner) still happens there once it mounts.
 */
function hasResumableEditDraft(prefix, records, isMeaningful) {
  for (const { key, data } of findDraftsByPrefix(prefix)) {
    const idPart = key.slice(prefix.length);
    if (idPart === 'add') {
      if (isMeaningful(data, null)) return true;
      continue;
    }
    const target = records.find(r => String(r.id) === idPart);
    if (target && isMeaningful(data, target)) return true;
  }
  return false;
}

function DraftResumeRedirect() {
  const { user, authReady } = useAuth();
  const { subscription, loading } = useSubscription();
  const location = useLocation();
  const navigate = useNavigate();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    // Wait until auth + subscription have actually settled — checking mid-
    // bootstrap risks reading a stale `user` from a previous render.
    if (!authReady || !user || loading || !subscription) return;
    // Only relevant once inside the authenticated app; don't interfere with
    // the marketing site, /login, or the post-login redirect itself.
    if (!location.pathname.startsWith('/app')) return;

    checkedRef.current = true;

    // Checked in order; the roles list mirrors AppRoutes' RoleRoute
    // guards, so this never sends someone somewhere they can't open.
    const checks = [
      {
        path: '/app/employees', roles: ['admin', 'hr', 'manager'],
        hasDraft: () => {
          const draft = loadDraft(employeeDraftKey(user.id));
          return draft && isAddEmployeeFormMeaningful(draft);
        },
      },
      {
        path: '/app/employees', roles: ['admin', 'hr', 'manager'],
        hasDraft: () => {
          const draft = loadDraft(csvImportDraftKey(user.id));
          return draft && isCsvImportDraftMeaningful(draft);
        },
      },
      {
        path: '/app/employees', roles: ['admin', 'hr', 'manager'],
        hasDraft: () => hasResumableEditDraft(
          editEmployeeDraftPrefix(user.id), subscription.enrolledEmployees || [], isEditEmployeeFormMeaningful,
        ),
      },
      {
        path: '/app/attendance', roles: null,
        hasDraft: () => hasResumableEditDraft(
          attendanceDraftPrefix(user.id), subscription.attendanceRecords || [], isAttendanceFormMeaningful,
        ),
      },
      {
        path: '/app/leave', roles: null,
        hasDraft: () => hasResumableEditDraft(
          leaveDraftPrefix(user.id), subscription.leaveRequests || [], isLeaveFormMeaningful,
        ),
      },
      {
        path: '/app/shifts', roles: ['admin', 'hr'],
        hasDraft: () => hasResumableEditDraft(
          shiftDraftPrefix(user.id), subscription.shifts || [], isShiftFormMeaningful,
        ),
      },
      {
        path: '/app/departments', roles: ['admin', 'hr'],
        hasDraft: () => {
          const draft = loadDraft(departmentDraftKey(user.id));
          return draft && isDepartmentFormMeaningful(draft);
        },
      },
    ];

    for (const { path, roles, hasDraft } of checks) {
      if (location.pathname === path) continue; // already there
      if (roles && !roles.includes(user.role)) continue; // wouldn't have access anyway
      if (hasDraft()) {
        navigate(path, { replace: true });
        return;
      }
    }
  }, [authReady, user, loading, subscription, location.pathname, navigate]);

  return null;
}

function AppRoutes() {
  return (
    <Routes>
      {/* ── Marketing / public ── */}
      <Route path="/"        element={<LandingPage />} />
      <Route path="/pricing" element={<PublicRoute><PricingPage /></PublicRoute>} />
      <Route path="/signup"  element={<PublicRoute><SignupPage /></PublicRoute>} />
      <Route path="/login"   element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<EmployeeRegisterPage />} />

      <Route path="/onboard" element={<OnboardingPage />} />

      {/* ── Authenticated app ── */}
      <Route path="/app" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
        <Route index element={<Navigate to="/app/dashboard" replace />} />
        <Route path="dashboard"    element={<DashboardPage />} />
        <Route path="attendance"   element={<AttendancePage />} />
        <Route path="time-render"  element={<TimeRenderPage />} />
        <Route path="leave"        element={<LeavePage />} />
        <Route path="subscription" element={<RoleRoute roles={['admin']}><SubscriptionPage /></RoleRoute>} />
        <Route path="employees"    element={<RoleRoute roles={['admin','hr','manager']}><EmployeesPage /></RoleRoute>} />
        <Route path="reports"      element={<RoleRoute roles={['admin','hr','manager']}><ReportsPage /></RoleRoute>} />
        <Route path="shifts"       element={<RoleRoute roles={['admin','hr']}><PlanGate feature="shifts"><ShiftsPage /></PlanGate></RoleRoute>} />
        <Route path="departments"  element={<RoleRoute roles={['admin','hr']}><DepartmentsPage /></RoleRoute>} />
        <Route path="settings"     element={<RoleRoute roles={['admin']}><SettingsPage /></RoleRoute>} />
        <Route path="profile"      element={<ProfilePage />} />
        <Route path="help"         element={<HelpCenterPage />} />
      </Route>

      {/* ── Superadmin (platform owner) ── */}
      <Route path="/superadmin" element={<SuperAdminRoute><SuperAdminLayout /></SuperAdminRoute>}>
        <Route index element={<SuperAdminPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <SubscriptionProvider>
          <NotificationsProvider>
          <ToastProvider>
            <FirstLoadGate>
              <AppRoutes />
            </FirstLoadGate>
            <DraftResumeRedirect />
            <ConnectionIssueModal />
            <CookieConsentBanner />
          </ToastProvider>
          </NotificationsProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
