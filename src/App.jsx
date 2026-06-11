import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SubscriptionProvider, useSubscription } from './context/SubscriptionContext';
import { ToastProvider } from './context/ToastContext';
import AppLayout from './components/layout/AppLayout';

// Public (pre-auth) pages
import LandingPage from './pages/public/LandingPage';
import PricingPage from './pages/public/PricingPage';
import SignupPage from './pages/public/SignupPage';
import OnboardingPage from './pages/public/OnboardingPage';
import LoginPage from './pages/LoginPage';

// App pages
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
 * Guard: user must be logged in.
 * Also checks if this user's subscription exists — if not, redirect to /pricing.
 */
function PrivateRoute({ children, roles }) {
  const { user } = useAuth();
  const { subscription } = useSubscription();

  if (!user) return <Navigate to="/login" replace />;
  if (!subscription) return <Navigate to="/pricing" replace />;
  if (subscription.status === 'cancelled') return <Navigate to="/pricing" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/app/dashboard" replace />;
  return children;
}

/**
 * Guard: user must NOT be logged in (public pages).
 * If already logged in with an active subscription, send to dashboard.
 */
function PublicRoute({ children }) {
  const { user } = useAuth();
  const { subscription } = useSubscription();
  if (user && subscription && subscription.status !== 'cancelled') {
    return <Navigate to="/app/dashboard" replace />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* ── Public / marketing ── */}
      <Route path="/"         element={<LandingPage />} />
      <Route path="/pricing"  element={<PublicRoute><PricingPage /></PublicRoute>} />
      <Route path="/signup"   element={<PublicRoute><SignupPage /></PublicRoute>} />
      <Route path="/onboard"  element={<OnboardingPage />} />
      <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />

      {/* ── App shell (authenticated) ── */}
      <Route path="/app" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
        <Route index element={<Navigate to="/app/dashboard" replace />} />
        <Route path="dashboard"    element={<DashboardPage />} />
        <Route path="attendance"   element={<AttendancePage />} />
        <Route path="employees"    element={<PrivateRoute roles={['admin','hr','manager']}><EmployeesPage /></PrivateRoute>} />
        <Route path="leave"        element={<LeavePage />} />
        <Route path="reports"      element={<PrivateRoute roles={['admin','hr','manager']}><ReportsPage /></PrivateRoute>} />
        <Route path="shifts"       element={<PrivateRoute roles={['admin','hr']}><ShiftsPage /></PrivateRoute>} />
        <Route path="departments"  element={<PrivateRoute roles={['admin','hr']}><DepartmentsPage /></PrivateRoute>} />
        <Route path="settings"     element={<PrivateRoute roles={['admin']}><SettingsPage /></PrivateRoute>} />
        <Route path="subscription" element={<PrivateRoute roles={['admin']}><SubscriptionPage /></PrivateRoute>} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SubscriptionProvider>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </SubscriptionProvider>
    </BrowserRouter>
  );
}
