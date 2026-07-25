import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { supabase, withAuthTimeout } from '../utils/supabase';
import { cacheClear } from '../utils/cache';
import {
  evaluateABACPolicy,
  recordLoginAttempt,
  can as abacCan,
  ABAC_RESULT,
} from '../utils/abac';
import {
  startSessionPolicy,
  getSessionPolicy,
  clearSessionPolicy,
  isSessionPolicyExpired,
  isInactivityExpired,
  touchActivity,
  setLogoutReason,
} from '../utils/sessionPolicy';

// How often to poll for a lapsed session policy while the app is sitting
// open (e.g. left on the dashboard overnight — this is what force-logs-out
// at midnight without needing a page reload).
const POLICY_CHECK_INTERVAL_MS = 30 * 1000;

// User-activity events that count as "not idle" for the 30-minute timeout.
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'wheel', 'touchstart', 'scroll'];

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
    avatarUrl:        profile?.avatar_url          ?? null,
    twoFactorEnabled: profile?.two_factor_enabled  ?? false,
    createdAt:      authUser.created_at,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(undefined); // undefined = "not yet resolved"
  const [authReady, setAuthReady] = useState(false);

  const pendingUserRef = useRef(null);
  const pendingAbacRef = useRef(null);

  // ── Bootstrap: restore session on mount ────────────────────────────────────
  // Guards against the app getting stuck on the loading screen forever:
  //  1. Hard timeout — if Supabase doesn't respond in time (e.g. a stale
  //     session/lock left over from an improperly-closed browser tab), we
  //     stop waiting and treat the user as logged out.
  //  2. Explicit expiry check — a resolved session whose token has already
  //     expired is treated the same as no session.
  //  3. try/catch/finally — any error still guarantees authReady flips to
  //     true so the router can make a decision instead of hanging.
  const SESSION_RESTORE_TIMEOUT_MS = 8000;

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      let timeoutId;
      try {
        const timeout = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('session-restore-timeout')), SESSION_RESTORE_TIMEOUT_MS);
        });

        const { data: { session } } = await Promise.race([
          supabase.auth.getSession(),
          timeout,
        ]);
        clearTimeout(timeoutId);

        const isExpired = session?.expires_at && session.expires_at * 1000 <= Date.now();

        // Security policy layer: force re-login past midnight (or past 24h
        // for "remember me" sessions), independent of the JWT's own expiry.
        const policyExpired = session?.user ? isSessionPolicyExpired() : false;

        if (session?.user && !isExpired && !policyExpired && mounted) {
          // Backfill a policy for sessions that predate this feature (or any
          // other edge case where one wasn't recorded) — default, non-"remember
          // me" terms, so it's still bound by the midnight/30-min-idle rules.
          if (!getSessionPolicy()) startSessionPolicy(false);
          const profile = await fetchProfile(session.user.id);
          setUser(buildUser(session.user, profile));
        } else if (mounted) {
          if (isExpired || policyExpired) {
            if (policyExpired) setLogoutReason('session_expired');
            // Clear the stale/expired session so it isn't picked up again.
            await supabase.auth.signOut().catch(() => {});
            clearSessionPolicy();
          }
          setUser(null);
        }
      } catch (err) {
        // Timed out or Supabase threw (e.g. bad/stale refresh token, offline).
        // Fail safe to "logged out" rather than hanging indefinitely.
        clearTimeout(timeoutId);
        console.warn('Session restore failed, treating as logged out:', err);
        if (mounted) setUser(null);
      } finally {
        if (mounted) setAuthReady(true);
      }
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
      .select('role, name, employee_id, subscription_id, permissions, avatar_url, two_factor_enabled')
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
    // Block the onAuthStateChange SIGNED_IN listener from the very start.
    // signUp()/signInWithPassword() below establish the Supabase session (and
    // fire SIGNED_IN) internally before their own promises resolve to us —
    // i.e. before the accounts row is even inserted. If pendingUserRef were
    // only set at the end (after insert), the listener's guard would still
    // be open during that window, fetch a profile that doesn't exist yet,
    // and setUser() a bogus admin (subscriptionId: null). Since `subscribe()`
    // already set an active subscription by this point, that premature user
    // makes PublicRoute redirect straight to /app/dashboard, skipping
    // /onboard entirely. A sentinel here keeps the guard closed the whole time.
    pendingUserRef.current = true;

    let safe;
    try {
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

      safe = { id: authUid, email: adminEmail, role: 'admin', name: adminName, employeeId: null, subscriptionId, createdAt: new Date().toISOString() };
    } catch (err) {
      // Registration failed partway through — release the guard so the
      // SIGNED_IN listener (or a subsequent real login) behaves normally again.
      pendingUserRef.current = null;
      throw err;
    }

    // Prime pendingUserRef exactly like login() does, so that commitLogin()
    // (called by OnboardingPage after TransitionLoadingScreen finishes) can
    // actually set the user. Without this, commitLogin() found nothing in
    // pendingUserRef and silently no-op'd — `user` only got set later (and
    // racily) via the onAuthStateChange SIGNED_IN listener.
    // Same reasoning as login(): written immediately (not deferred to
    // commitLogin) so a refresh during onboarding's transition screen can't
    // leave the session with no policy on record. Onboarding has no
    // "remember me" control, so this always uses the default (midnight-
    // expiry, 30-min-idle) terms.
    startSessionPolicy(false);

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
  // Shared tail-end of the login flow: profile fetch → ABAC → bookkeeping.
  // Used both by a normal (no-2FA) login and after a 2FA code is verified.
  const finishLogin = useCallback(async (authUser, email, rememberMe) => {
    const profile = await fetchProfile(authUser.id);
    const safe    = buildUser(authUser, profile);

    const abacResult = await evaluateABACPolicy(safe);
    if (abacResult.result === ABAC_RESULT.DENY) {
      recordLoginAttempt(email, false);
      await supabase.auth.signOut(); // undo the Auth sign-in
      pendingUserRef.current = null; // release the guard — no session survives a DENY
      throw new Error(abacResult.reason);
    }

    recordLoginAttempt(email, true);

    pendingUserRef.current = safe;
    pendingAbacRef.current = abacResult;

    // Written here (not in commitLogin) deliberately: commitLogin only runs
    // once the "Signing you in…" transition animation finishes, a couple of
    // seconds later. If the page were refreshed in that window, commitLogin
    // would never run, leaving no policy on record — and the bootstrap
    // restore path would then backfill a default (non-"remember me") one,
    // silently discarding whatever the user actually chose on the login
    // form. Setting it right here, as soon as credentials are verified,
    // means it's correct even if the tab is refreshed mid-transition.
    startSessionPolicy(rememberMe);

    return { user: safe, abac: abacResult };
  }, []);

  const login = useCallback(async (email, password, rememberMe = false) => {
    // Block the onAuthStateChange SIGNED_IN listener from the very start —
    // signInWithPassword() fires SIGNED_IN internally as soon as it
    // establishes a session, before its own promise resolves to us. If the
    // guard were only set later (e.g. after the MFA check below, which adds
    // its own awaits), the listener's `if (!pendingUserRef.current)` branch
    // would race ahead, fetch the profile, and log the user straight in —
    // skipping the two-factor prompt entirely. Setting a sentinel here keeps
    // the guard closed for the whole flow, same fix as registerCompanyAdmin.
    pendingUserRef.current = true;

    // ── Credential check via Supabase Auth ──────────────────────────────────
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      pendingUserRef.current = null; // release the guard — sign-in never happened
      recordLoginAttempt(email, false);
      // Surface a friendly message instead of Supabase's raw error
      throw new Error('Invalid email or password');
    }

    const authUser = signInData.user;

    // ── Two-factor check ─────────────────────────────────────────────────────
    // signInWithPassword() only grants "aal1". If the account has a verified
    // TOTP factor, Supabase requires stepping up to "aal2" before the
    // session is fully trusted — surface that to the caller instead of
    // completing login, so the UI can prompt for the 6-digit code.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === 'aal2' && aal.nextLevel !== aal.currentLevel) {
      // Keep the guard closed (pendingUserRef stays truthy) — the session is
      // live at aal1 but must not be treated as logged in yet. It's released
      // once verifyMfaAndLogin() finishes (success → real user object) or
      // the login page cancels the challenge (which signs the session out,
      // triggering the SIGNED_OUT branch instead).
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const factor = factorsData?.totp?.find(f => f.status === 'verified');
      const mfaError = new Error('Two-factor code required.');
      mfaError.mfaRequired = true;
      mfaError.factorId = factor?.id ?? null;
      throw mfaError;
    }

    return finishLogin(authUser, email, rememberMe);
  }, [finishLogin]);

  // ── verifyMfaAndLogin ────────────────────────────────────────────────────
  // Completes login after `login()` threw `{ mfaRequired: true, factorId }`.
  const verifyMfaAndLogin = useCallback(async (factorId, code, email, rememberMe = false) => {
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) throw new Error(challengeError.message || 'Could not start verification.');

    const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) {
      recordLoginAttempt(email, false);
      throw new Error('Invalid or expired code. Please try again.');
    }

    const authUser = verifyData.user;
    return finishLogin(authUser, email, rememberMe);
  }, [finishLogin]);

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
  // supabase.auth.signOut() is a network call and can throw (offline, already-
  // expired/invalid session, timeout, etc.). Previously that would abort this
  // function before any local state was cleared, so a failed sign-out request
  // left the user looking "still logged in" with nothing wiped. The try/finally
  // here guarantees local session state and sensitive localStorage data are
  // always cleared, regardless of whether the remote call succeeds.
  const logout = useCallback(async (reason = null) => {
    // Recorded first (before signOut/clearSessionPolicy) so it's on disk
    // even if the network call below hangs or throws.
    if (reason) setLogoutReason(reason);
    try {
      // supabase-js's own fetch has a timeout (see utils/supabase.js), but as
      // a belt-and-suspenders measure — this is the call that gates the
      // force-logout notice ever reaching the user — never let it hang this
      // function open longer than a few seconds. If it wins the race, local
      // state is still cleared below and the user is treated as logged out
      // locally even if the remote sign-out request is still in flight.
      await withAuthTimeout(supabase.auth.signOut(), 'signOut');
    } catch (err) {
      console.warn('supabase.auth.signOut() failed or timed out, clearing local session anyway:', err);
    } finally {
      clearSessionPolicy();
      cacheClear();

      // Defense-in-depth: supabase-js normally strips its own auth token from
      // localStorage as part of signOut(), but if signOut() threw before it
      // got that far, don't leave a stale JWT sitting around.
      try {
        Object.keys(localStorage)
          .filter((key) => key.startsWith('sb-') && key.endsWith('-auth-token'))
          .forEach((key) => localStorage.removeItem(key));
      } catch { /* localStorage unavailable — nothing more we can do */ }

      setUser(null);
    }
  }, []);

  // ── Session policy enforcement while the app stays open ────────────────────
  // Both checks below run off the SAME 30s poll, driven by real wall-clock
  // timestamps (isSessionPolicyExpired / isInactivityExpired both compare
  // against Date.now()) rather than a single long-lived setTimeout.
  //
  // A raw `setTimeout(fn, 30 * 60 * 1000)` looks right but is not reliable in
  // practice: browsers throttle (Chrome) or fully suspend ("freeze") timers
  // in backgrounded/idle tabs, and laptop sleep pauses JS execution outright.
  // The effect could also silently be torn down/re-created (e.g. every
  // TOKEN_REFRESHED swaps in a new `user` object reference, re-running this
  // whole effect and resetting the timer) without that being a real activity
  // event. Any of those either delays the eventual logout indefinitely or
  // resets the clock behind the scenes — which is exactly the symptom of
  // "stayed idle 30+ minutes and never got logged out."
  //
  // Polling a persisted `lastActivityAt` timestamp every 30s is self-healing
  // instead: whenever the interval actually gets to run — even very late,
  // right after the tab wakes back up — it immediately sees the true idle
  // duration and acts on it, the same way the midnight/24h policy check
  // already does.
  useEffect(() => {
    if (!user) return;

    const checkPolicy = () => {
      if (isSessionPolicyExpired()) {
        logout('session_expired');
      } else if (isInactivityExpired()) {
        logout('inactivity');
      }
    };

    const policyInterval = setInterval(checkPolicy, POLICY_CHECK_INTERVAL_MS);

    // Throttle activity writes — mousemove/scroll fire constantly and there's
    // no need to hit localStorage on every single one.
    const ACTIVITY_WRITE_THROTTLE_MS = 5000;
    let lastWrite = 0;
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastWrite < ACTIVITY_WRITE_THROTTLE_MS) return;
      lastWrite = now;
      touchActivity();
    };
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }));

    // Re-check immediately on return-to-tab too, so a stale/backgrounded tab
    // doesn't have to wait out the rest of the 30s poll interval before the
    // user sees the notice — this is on top of the interval above, not a
    // replacement for it (the interval still catches the case where the app
    // is left open and never brought back to the foreground at all).
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkPolicy();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Also catch it right away in case it's already overdue when this effect
    // (re)attaches, e.g. after a TOKEN_REFRESHED-driven remount.
    checkPolicy();

    return () => {
      clearInterval(policyInterval);
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, handleActivity));
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, logout]);

  // ── refreshProfile ──────────────────────────────────────────────────────────
  // Re-fetches the `accounts` row for the current user and merges it into
  // state. Used after a profile edit (e.g. display name change) so the
  // sidebar/header reflect it immediately without a full page reload.
  const refreshProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    const profile = await fetchProfile(session.user.id);
    const updated = buildUser(session.user, profile);
    setUser(updated);
    return updated;
  }, []);

  // ── can ──────────────────────────────────────────────────────────────────────
  const can = useCallback((permission) => abacCan(user, permission), [user]);

  return (
    <AuthContext.Provider value={{ user, authReady, login, verifyMfaAndLogin, commitLogin, logout, can, registerCompanyAdmin, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};