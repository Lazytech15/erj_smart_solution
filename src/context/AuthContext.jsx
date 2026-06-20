import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { cacheClear } from '../utils/cache';
import {
  evaluateABACPolicy,
  recordLoginAttempt,
  can as abacCan,
  ABAC_RESULT,
} from '../utils/abac';

const AuthContext = createContext(null);

/**
 * Maps a Supabase Auth user + profile row → the app's `user` shape.
 * Profile row comes from the `accounts` table and carries role, name,
 * employeeId, subscriptionId — things Supabase Auth doesn't store natively.
 */
function buildUser(authUser, profile) {
  return {
    id:             authUser.id,           // supabase auth UUID
    email:          authUser.email,
    role:           profile?.role            ?? 'employee',
    name:           profile?.name            ?? authUser.email,
    employeeId:     profile?.employee_id     ?? null,
    subscriptionId: profile?.subscription_id ?? null,
    permissions:    profile?.permissions     ?? [],
    createdAt:      authUser.created_at,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(undefined); // undefined = "not yet resolved"
  const [authReady, setAuthReady] = useState(false);

  const pendingUserRef = useRef(null);
  const pendingAbacRef = useRef(null);

  // ── Bootstrap: restore session on mount ────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && mounted) {
        const profile = await fetchProfile(session.user.id);
        setUser(buildUser(session.user, profile));
      } else if (mounted) {
        setUser(null);
      }
      if (mounted) setAuthReady(true);
    }

    restoreSession();

    // Listen for future auth state changes (token refresh, sign-out, etc.)
    // SIGNED_IN is intentionally excluded here: both login() and registerCompanyAdmin()
    // call signInWithPassword/signUp which fire SIGNED_IN. We let those callers
    // manage state themselves (via pendingUserRef / direct setUser) to avoid races.
    // TOKEN_REFRESHED handles silent session renewal; INITIAL_SESSION handles restores
    // on hard reload (supplementing the getSession() call above for edge cases).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT' || !session?.user) {
        setUser(null);
        setAuthReady(true);
      } else if (event === 'TOKEN_REFRESHED') {
        // Silently refresh the user object when the JWT is renewed
        const profile = await fetchProfile(session.user.id);
        setUser(buildUser(session.user, profile));
      } else if (event === 'SIGNED_IN') {
        // Only auto-set user from onAuthStateChange on SIGNED_IN if no
        // pending login() flow is in progress (i.e. not going through the
        // ABAC + TransitionLoadingScreen path).
        if (!pendingUserRef.current) {
          const profile = await fetchProfile(session.user.id);
          setUser(buildUser(session.user, profile));
          setAuthReady(true);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ── Profile helper ──────────────────────────────────────────────────────────
  async function fetchProfile(authUid) {
    const { data } = await supabase
      .from('accounts')
      .select('role, name, employee_id, subscription_id, permissions')
      .eq('auth_uid', authUid)
      .maybeSingle();
    return data ?? null;
  }

  // ── registerCompanyAdmin ────────────────────────────────────────────────────
  /**
   * Called during onboarding/signup.
   * 1. Creates the Supabase Auth user (email + password).
   * 2. Inserts a profile row in `accounts` linking auth_uid → role/name/subscription.
   */
  const registerCompanyAdmin = useCallback(async ({ adminName, adminEmail, password, subscriptionId }) => {
    // 1. Create the Supabase Auth user.
    //    signUp() returns the user immediately even when email confirmation is
    //    enabled, but the session will be null until confirmed. We handle both
    //    cases so this works regardless of your Supabase email settings.
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email:    adminEmail,
      password: password,
      options: { data: { name: adminName } },
    });
    if (signUpError) throw new Error(signUpError.message);

    const authUid = signUpData.user?.id;
    if (!authUid) throw new Error('Sign-up succeeded but no user ID was returned.');

    // 2. Insert profile row — authUid is always available even before confirmation.
    const { error: profileError } = await supabase.from('accounts').insert({
      auth_uid:        authUid,
      email:           adminEmail,
      role:            'admin',
      name:            adminName,
      employee_id:     null,
      subscription_id: subscriptionId,
    });
    if (profileError) throw new Error(profileError.message);

    // 3. If Supabase returned a live session (email confirmation disabled),
    //    we are already signed in. If the session is null (confirmation email
    //    was sent), sign in with password immediately so onboarding can
    //    continue without forcing the admin to check their inbox first.
    if (!signUpData.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email:    adminEmail,
        password: password,
      });
      if (signInError) {
        // Supabase is strictly blocking unconfirmed logins — surface a clear message.
        throw new Error(
          'Account created — please check your email to confirm your address before signing in.',
        );
      }
    }

    const safe = { id: authUid, email: adminEmail, role: 'admin', name: adminName, employeeId: null, subscriptionId, createdAt: new Date().toISOString() };

    // Prime pendingUserRef exactly like login() does, so that commitLogin()
    // (called by OnboardingPage after TransitionLoadingScreen finishes) can
    // actually set the user. Without this, commitLogin() found nothing in
    // pendingUserRef and silently no-op'd — `user` only got set later (and
    // racily) via the onAuthStateChange SIGNED_IN listener.
    pendingUserRef.current = safe;
    pendingAbacRef.current = null;

    return safe;
  }, []);

  // ── login ───────────────────────────────────────────────────────────────────
  /**
   * 1. Signs in with Supabase Auth (email + password).
   * 2. Fetches the profile row to get role / subscriptionId.
   * 3. Runs ABAC policy.
   * 4. On DENY → throws. On ALLOW/FLAG → stores in refs for commitLogin().
   */
  const login = useCallback(async (email, password) => {
    // ── Credential check via Supabase Auth ──────────────────────────────────
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      recordLoginAttempt(email, false);
      // Surface a friendly message instead of Supabase's raw error
      throw new Error('Invalid email or password');
    }

    const authUser = signInData.user;

    // ── Fetch profile row ────────────────────────────────────────────────────
    const profile = await fetchProfile(authUser.id);
    const safe    = buildUser(authUser, profile);

    // ── ABAC evaluation ──────────────────────────────────────────────────────
    const abacResult = await evaluateABACPolicy(safe);
    if (abacResult.result === ABAC_RESULT.DENY) {
      recordLoginAttempt(email, false);
      await supabase.auth.signOut(); // undo the Auth sign-in
      throw new Error(abacResult.reason);
    }

    recordLoginAttempt(email, true);

    pendingUserRef.current = safe;
    pendingAbacRef.current = abacResult;

    return { user: safe, abac: abacResult };
  }, []);

  // ── commitLogin ─────────────────────────────────────────────────────────────
  /**
   * Called by TransitionLoadingScreen.onComplete.
   * Supabase Auth session is already set; we just push the user into state.
   */
  const commitLogin = useCallback(() => {
    const safe = pendingUserRef.current;
    const abac = pendingAbacRef.current;
    if (!safe) return null;

    pendingUserRef.current = null;
    pendingAbacRef.current = null;

    setUser(safe);
    return abac;
  }, []);

  // ── logout ───────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    cacheClear();
  }, []);

  // ── can ──────────────────────────────────────────────────────────────────────
  const can = useCallback((permission) => abacCan(user, permission), [user]);

  return (
    <AuthContext.Provider value={{ user, authReady, login, commitLogin, logout, can, registerCompanyAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
