import { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

const USER_KEY = 'attms_user';
const SUB_USERS_KEY = 'attms_sub_users';

function loadUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}
function loadSubUsers() {
  try { return JSON.parse(localStorage.getItem(SUB_USERS_KEY)) || []; } catch { return []; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => loadUser());

  // Register the admin account for a new subscription (called from SignupPage)
  const registerCompanyAdmin = useCallback(({ adminName, adminEmail, password }) => {
    const subUsers = loadSubUsers();
    // Remove any existing admin for this email
    const filtered = subUsers.filter(u => u.email !== adminEmail);
    const admin = {
      id: `admin_${Date.now()}`,
      email: adminEmail,
      password,
      role: 'admin',
      name: adminName,
      employeeId: null,
    };
    filtered.push(admin);
    localStorage.setItem(SUB_USERS_KEY, JSON.stringify(filtered));
    return admin;
  }, []);

  const login = useCallback(async (email, password) => {
    // Check subscription-registered accounts first
    const subUsers = loadSubUsers();
    const found = subUsers.find(u => u.email === email && u.password === password);
    if (!found) throw new Error('Invalid email or password');
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
