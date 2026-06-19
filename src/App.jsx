import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SubscriptionProvider, useSubscription } from './context/SubscriptionContext';
import { ToastProvider } from './context/ToastContext';
import { NotificationsProvider } from './context/NotificationsContext';
import AppLayout from './components/layout/AppLayout';
import PlanGate from './components/PlanGate';
import LoadingScreen from './components/LoadingScreen';

import LandingPage from './pages/public/LandingPage';
import PricingPage from './pages/public/PricingPage';
import SignupPage from './pages/public/SignupPage';
import OnboardingPage from './pages/public/OnboardingPage';
import EmployeeRegisterPage from './pages/public/EmployeeRegisterPage';
import LoginPage from './pages/LoginPage';

import DashboardPage from './pages/DashboardPage';
import AttendancePage from './pages/AttendancePage';
import EmployeesPage from './pages/EmployeesPage';
import LeavePage from './pages/LeavePage';
import ReportsPage from './pages/ReportsPage';
import ShiftsPage from './pages/ShiftsPage';
import DepartmentsPage from './pages/DepartmentsPage';
import SettingsPage from './pages/SettingsPage';
import SubscriptionPage from './pages/SubscriptionPage';

/**
 * Guard: requires auth + a valid subscription.
 * By the time a user reaches here after login, the subscription is already
 * fetched (TransitionLoadingScreen waited for it), so loading is near-instant.
 */
function PrivateRoute({ children }) {
  const { user, authReady } = useAuth();
  const { subscription, loading } = useSubscription();
  const location = useLocation();

  // Wait for the Supabase Auth session to be resolved before making a decision
  if (!authReady) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (loading) return <LoadingScreen />;
  if (!subscription) return <Navigate to="/pricing" replace />;

  if (subscription.status === 'cancelled' && location.pathname !== '/app/subscription') {
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
 * Guard for pages that should only be visible when NOT logged in.
 *
 * Waits for authReady before redirecting so we don't briefly flash the login
 * page while Supabase Auth resolves the persisted session.
 */
function PublicRoute({ children }) {
  const { user, authReady } = useAuth();
  const { subscription, loading } = useSubscription();

  if (!authReady) return <LoadingScreen />;
  if (user && (loading || !subscription)) return <LoadingScreen />;
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
        <Route path="leave"        element={<LeavePage />} />
        <Route path="subscription" element={<RoleRoute roles={['admin']}><SubscriptionPage /></RoleRoute>} />
        <Route path="employees"    element={<RoleRoute roles={['admin','hr','manager']}><EmployeesPage /></RoleRoute>} />
        <Route path="reports"      element={<RoleRoute roles={['admin','hr','manager']}><ReportsPage /></RoleRoute>} />
        <Route path="shifts"       element={<RoleRoute roles={['admin','hr']}><PlanGate feature="shifts"><ShiftsPage /></PlanGate></RoleRoute>} />
        <Route path="departments"  element={<RoleRoute roles={['admin','hr']}><DepartmentsPage /></RoleRoute>} />
        <Route path="settings"     element={<RoleRoute roles={['admin']}><SettingsPage /></RoleRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SubscriptionProvider>
          <NotificationsProvider>
          <ToastProvider>
            <FirstLoadGate>
              <AppRoutes />
            </FirstLoadGate>
          </ToastProvider>
          </NotificationsProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
