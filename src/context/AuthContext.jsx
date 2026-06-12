import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { getAccount, putAccount } from '../utils/db';

const AuthContext = createContext(null);

const USER_KEY = 'attms_user';

function loadSession() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => loadSession());
  // Holds a validated user object waiting to be committed after the
  // transition animation finishes. PublicRoute only reads `user`, so
  // the route stays on LoginPage while the animation plays.
  const pendingUserRef = useRef(null);

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

  /**
   * Validates credentials and stores the safe user in pendingUserRef.
   * Does NOT set user state yet — call commitLogin() to do that.
   */
  const login = useCallback(async (email, password) => {
    const found = await getAccount(email);
    if (!found || found.password !== password) throw new Error('Invalid email or password');
    const { password: _, ...safe } = found;
    pendingUserRef.current = safe;
    return safe;
  }, []);

  /**
   * Actually commits the pending login — sets user state and persists
   * to localStorage. Call this from the transition screen's onComplete.
   */
  const commitLogin = useCallback(() => {
    const safe = pendingUserRef.current;
    if (!safe) return;
    pendingUserRef.current = null;
    setUser(safe);
    localStorage.setItem(USER_KEY, JSON.stringify(safe));
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
    <AuthContext.Provider value={{ user, login, commitLogin, logout, can, registerCompanyAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
