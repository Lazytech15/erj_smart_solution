import { createContext, useContext, useState, useCallback } from 'react';
import { getAccount, putAccount, getAllAccounts } from '../utils/db';

const AuthContext = createContext(null);

// attms_user in localStorage holds only the lightweight session
// (no password, just id/email/role/name/subscriptionId).
// All real account data lives in IndexedDB  accounts  store.
const USER_KEY = 'attms_user';

function loadSession() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => loadSession());

  // Called from SignupPage after subscribe() creates the subscription.
  // Stores the admin account in IndexedDB keyed by email.
  const registerCompanyAdmin = useCallback(async ({ adminName, adminEmail, password, subscriptionId }) => {
    const admin = {
      email: adminEmail,
      password,
      role: 'admin',
      name: adminName,
      id: `admin_${Date.now()}`,
      employeeId: null,
      subscriptionId,
    };
    await putAccount(admin);
    return admin;
  }, []);

  const login = useCallback(async (email, password) => {
    const found = await getAccount(email);
    if (!found || found.password !== password) throw new Error('Invalid email or password');
    const { password: _, ...safe } = found;
    setUser(safe);
    localStorage.setItem(USER_KEY, JSON.stringify(safe));
    return safe;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(USER_KEY);
  }, []);

  const can = useCallback((permission) => {
    if (!user) return false;
    const perms = {
      admin:    ['view_all','edit_all','manage_users','view_reports','approve_leave','manage_shifts','system_settings'],
      hr:       ['view_all','edit_all','view_reports','approve_leave','manage_shifts'],
      manager:  ['view_team','edit_team','view_reports','approve_leave'],
      employee: ['view_own','request_leave','clock_in_out'],
    };
    return perms[user.role]?.includes(permission) ?? false;
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, login, logout, can, registerCompanyAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
