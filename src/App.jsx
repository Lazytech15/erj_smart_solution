import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SubscriptionProvider, useSubscription } from './context/SubscriptionContext';
import { ToastProvider } from './context/ToastContext';
import AppLayout from './components/layout/AppLayout';
import LoadingScreen from './components/LoadingScreen';

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
  if (loading) return <LoadingScreen />;                              // wait for DB load
  if (!subscription) return <Navigate to="/pricing" replace />;
  // Cancelled: allow access only to /app/subscription so they can reactivate
  if (subscription.status === 'cancelled') {
    const allowed = window.location.pathname === '/app/subscription';
    if (!allowed) return <Navigate to="/app/subscription" replace />;
  }
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

  if (loading) return <LoadingScreen />;
  // Allow logged-in users with cancelled subscriptions to see public pages (e.g. pricing to reactivate)
  if (user && subscription?.status !== 'cancelled') return <Navigate to="/app/dashboard" replace />;
  return children;
}

/**
 * Shows the loading splash on the very first page load (e.g. hard refresh),
 * then fades it out once the app shell has mounted. Keeps a minimum
 * display time so it doesn't just flash for a frame on fast connections.
 */
function FirstLoadGate({ children }) {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  // Initialize synchronously — if the page is already loaded (common in SPAs
  // after a hot-reload or navigation), readyState is already 'complete' before
  // this component even mounts, so the useEffect listener would never fire.
  const [appReady, setAppReady] = useState(() => document.readyState === 'complete');

  // Only attach the listener when the page hasn't finished loading yet
  useEffect(() => {
    if (document.readyState === 'complete') {
      // Already ready (handles the race where readyState changed between the
      // useState initializer and the effect running)
      setAppReady(true);
      return;
    }
    const onLoad = () => setAppReady(true);
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  // Called by LoadingScreen once its progress bar finishes at 100%
  const handleLoadComplete = () => {
    setFading(true);
    setTimeout(() => setVisible(false), 320); // matches fade-out transition
  };

  return (
    <>
      {children}
      {visible && (
        <div className={`erj-first-load${fading ? ' erj-first-load--out' : ''}`}>
          <LoadingScreen
            label="Loading…"
            onComplete={appReady ? handleLoadComplete : undefined}
          />
        </div>
      )}
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
            <FirstLoadGate>
              <AppRoutes />
            </FirstLoadGate>
          </ToastProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
