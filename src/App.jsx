import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SubscriptionProvider, useSubscription } from './context/SubscriptionContext';
import { ToastProvider } from './context/ToastContext';
import AppLayout from './components/layout/AppLayout';

import LandingPage from './pages/public/LandingPage';
import PricingPage from './pages/public/PricingPage';
import SignupPage from './pages/public/SignupPage';
import OnboardingPage from './pages/public/OnboardingPage';
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
 * Guard: requires a valid active subscription.
 * Waits for the async IndexedDB load before redirecting (avoids flash).
 */
function PrivateRoute({ children, roles }) {
  const { user } = useAuth();
  const { subscription, loading } = useSubscription();

  if (!user) return <Navigate to="/login" replace />;
  if (loading) return null;                                          // wait for DB load
  if (!subscription) return <Navigate to="/pricing" replace />;
  if (subscription.status === 'cancelled') return <Navigate to="/pricing" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/app/dashboard" replace />;
  return children;
}

/**
 * Guard for pages that should only be visible when NOT logged in.
 * Does NOT cover /onboard — that page handles its own auth check.
 */
function PublicRoute({ children }) {
  const { user } = useAuth();
  const { subscription, loading } = useSubscription();
  if (loading) return null;
  if (user && subscription && subscription.status !== 'cancelled') {
    return <Navigate to="/app/dashboard" replace />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* ── Marketing / public ── */}
      <Route path="/"        element={<LandingPage />} />
      <Route path="/pricing" element={<PublicRoute><PricingPage /></PublicRoute>} />
      <Route path="/signup"  element={<PublicRoute><SignupPage /></PublicRoute>} />
      <Route path="/login"   element={<PublicRoute><LoginPage /></PublicRoute>} />

      {/*
        /onboard is intentionally NOT wrapped in PublicRoute.
        After signup the user is logged in + has a subscription, so PublicRoute
        would immediately redirect them to /app/dashboard.
        OnboardingPage does its own check: if no subscription → /pricing.
      */}
      <Route path="/onboard" element={<OnboardingPage />} />

      {/* ── Authenticated app ── */}
      <Route path="/app" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
        <Route index element={<Navigate to="/app/dashboard" replace />} />
        <Route path="dashboard"   element={<DashboardPage />} />
        <Route path="attendance"  element={<AttendancePage />} />
        <Route path="employees"   element={<PrivateRoute roles={['admin','hr','manager']}><EmployeesPage /></PrivateRoute>} />
        <Route path="leave"       element={<LeavePage />} />
        <Route path="reports"     element={<PrivateRoute roles={['admin','hr','manager']}><ReportsPage /></PrivateRoute>} />
        <Route path="shifts"      element={<PrivateRoute roles={['admin','hr']}><ShiftsPage /></PrivateRoute>} />
        <Route path="departments" element={<PrivateRoute roles={['admin','hr']}><DepartmentsPage /></PrivateRoute>} />
        <Route path="settings"    element={<PrivateRoute roles={['admin']}><SettingsPage /></PrivateRoute>} />
        <Route path="subscription" element={<PrivateRoute roles={['admin']}><SubscriptionPage /></PrivateRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      {/* AuthProvider MUST be outer — SubscriptionProvider depends on useAuth() */}
      <AuthProvider>
        <SubscriptionProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
