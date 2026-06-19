import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { getAccount, putAccount } from '../utils/db';
import { cacheClear } from '../utils/cache';
import {
  evaluateABACPolicy,
  recordLoginAttempt,
  can as abacCan,
  ABAC_RESULT,
} from '../utils/abac';

const AuthContext = createContext(null);

const USER_KEY = 'attms_user';

function loadSession() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => loadSession());

  /**
   * pendingUserRef holds the validated+ABAC-checked user waiting for the
   * transition animation to finish before being committed.
   */
  const pendingUserRef = useRef(null);

  /**
   * pendingAbacRef holds the ABAC evaluation result so LoginPage can
   * decide whether to show a security flag notice after transition.
   */
  const pendingAbacRef = useRef(null);

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
   * login()
   *
   * 1. Verifies credentials against Supabase.
   * 2. Runs the ABAC policy engine (time, device, IP/location).
   * 3. On DENY  → throws an error (login rejected).
   * 4. On ALLOW/FLAG → stores user + abac result in refs for commitLogin().
   *
   * Does NOT set user state yet — call commitLogin() from the transition screen.
   */
  const login = useCallback(async (email, password) => {
    // ── Credential check ──────────────────────────────────────────────────
    const found = await getAccount(email);
    if (!found || found.password !== password) {
      recordLoginAttempt(email, false);
      throw new Error('Invalid email or password');
    }

    const { password: _, ...safe } = found;

    // ── ABAC evaluation ───────────────────────────────────────────────────
    const abacResult = await evaluateABACPolicy(safe);

    if (abacResult.result === ABAC_RESULT.DENY) {
      recordLoginAttempt(email, false);
      throw new Error(abacResult.reason);
    }

    // ALLOW or FLAG — record success and continue
    recordLoginAttempt(email, true);

    pendingUserRef.current  = safe;
    pendingAbacRef.current  = abacResult;

    return { user: safe, abac: abacResult };
  }, []);

  /**
   * commitLogin()
   *
   * Called by TransitionLoadingScreen.onComplete.
   * Actually sets user state and persists to localStorage.
   * Returns the ABAC result so callers can show flag notices.
   */
  const commitLogin = useCallback(() => {
    const safe = pendingUserRef.current;
    const abac = pendingAbacRef.current;
    if (!safe) return null;

    pendingUserRef.current = null;
    pendingAbacRef.current = null;

    setUser(safe);
    localStorage.setItem(USER_KEY, JSON.stringify(safe));

    return abac; // caller can inspect abac.flags / abac.result
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(USER_KEY);
    cacheClear();
  }, []);

  /**
   * can(permission)
   * Checks whether the current user's role grants the given permission.
   * The full ABAC time/device/location checks only run at login time.
   */
  const can = useCallback((permission) => abacCan(user, permission), [user]);

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
