import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, Clock, FileText, Users, Shield, ShieldCheck, AlertTriangle, CheckCircle, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui';
import TransitionLoadingScreen from '../components/TransitionLoadingScreen';
import { getSubscription } from '../utils/db';
import { ABAC_RESULT } from '../utils/abac';
import { supabase } from '../utils/supabase';
import { consumeLogoutReason } from '../utils/sessionPolicy';

/** Human-readable copy for each force-logout reason. */
const LOGOUT_NOTICES = {
  inactivity: {
    title: 'Signed out due to inactivity',
    message: "You were signed out because there was no activity for 30 minutes. This helps keep your account secure. Please sign in again to continue.",
  },
  session_expired: {
    title: 'Session expired',
    message: "Your session has ended (sessions without \u201CRemember me\u201D reset at midnight; \u201CRemember me\u201D sessions last 24 hours). Please sign in again to continue.",
  },
};

const FEATURES = [
  { icon: Clock,  label: 'Real-time attendance tracking' },
  { icon: FileText, label: 'Automated payroll reports' },
  { icon: Users,  label: 'Biometric device integration' },
  { icon: Shield, label: 'Attribute-based access control' },
];

/** Human-readable labels for ABAC flag codes */
function describeFlagCode(code) {
  if (code.startsWith('off_hours_login'))    return 'Login outside normal business hours';
  if (code.startsWith('country_change'))     return `Login from a new country (${code.split(':')[1]})`;
  if (code.startsWith('ip_change'))          return 'Login from a new IP address';
  if (code === 'new_device')                 return 'Login from an unrecognised device';
  if (code === 'suspicious_hour_employee')   return 'Login between 1:00 AM – 4:00 AM';
  if (code === 'weekend_privileged_login')   return 'Weekend login on a privileged account';
  return code;
}

export default function LoginPage() {
  const { login, verifyMfaAndLogin, commitLogin } = useAuth();
  const toast   = useToast();
  const navigate = useNavigate();

  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [rememberMe,  setRememberMe]  = useState(false);
  const [showPw,      setShowPw]      = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [subscriptionPromise, setSubscriptionPromise] = useState(null);
  const loggedInRoleRef = useRef(null);

  /** Stores ABAC flags so we can show a notice after login completes */
  const [securityFlags, setSecurityFlags] = useState([]);

  /** Two-factor challenge step, entered after a password check reports the
   *  account requires a TOTP code (see login()'s `mfaRequired` throw). */
  const [mfaStep,   setMfaStep]   = useState(null); // { factorId } | null
  const [mfaCode,   setMfaCode]   = useState('');
  const [mfaError,  setMfaError]  = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  /** Forgot password flow */
  const [forgotMode,      setForgotMode]      = useState(false);
  const [forgotEmail,     setForgotEmail]     = useState('');
  const [forgotLoading,   setForgotLoading]   = useState(false);
  const [forgotSent,      setForgotSent]      = useState(false);
  const [forgotError,     setForgotError]     = useState('');

  /** Force-logout notice (inactivity / session expiry) — shown once, on landing here */
  const [logoutNotice, setLogoutNotice] = useState(null);
  useEffect(() => {
    const reason = consumeLogoutReason();
    if (reason && LOGOUT_NOTICES[reason]) setLogoutNotice(LOGOUT_NOTICES[reason]);
  }, []);

  async function handleForgotPassword(e) {
    e.preventDefault();
    setForgotError('');
    if (!forgotEmail.includes('@')) { setForgotError('Please enter a valid email.'); return; }
    setForgotLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setForgotSent(true);
    } catch (err) {
      setForgotError(err.message || 'Failed to send reset email.');
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { user, abac } = await login(email, password, rememberMe);
      toast('Welcome back!', 'success');
      loggedInRoleRef.current = user?.role ?? null;

      // Stash flags so we can show the banner after commitLogin
      if (abac?.flags?.length) {
        setSecurityFlags(abac.flags);
      }

      const subPromise = (user?.subscriptionId && !['superadmin', 'sub_superadmin'].includes(user?.role))
        ? getSubscription(user.subscriptionId)
        : Promise.resolve(null);

      setSubscriptionPromise(subPromise);
      setTransitioning(true);
    } catch (err) {
      if (err.mfaRequired) {
        setMfaStep({ factorId: err.factorId });
        setLoading(false);
        return;
      }
      setError(err.message);
      setLoading(false);
    }
  }

  async function handleVerifyMfa(e) {
    e.preventDefault();
    setMfaError('');
    if (!/^\d{6}$/.test(mfaCode)) { setMfaError('Enter the 6-digit code from your authenticator app.'); return; }
    setMfaLoading(true);
    try {
      const { user, abac } = await verifyMfaAndLogin(mfaStep.factorId, mfaCode, email, rememberMe);
      toast('Welcome back!', 'success');
      loggedInRoleRef.current = user?.role ?? null;
      if (abac?.flags?.length) setSecurityFlags(abac.flags);

      const subPromise = (user?.subscriptionId && !['superadmin', 'sub_superadmin'].includes(user?.role))
        ? getSubscription(user.subscriptionId)
        : Promise.resolve(null);

      setSubscriptionPromise(subPromise);
      setTransitioning(true);
    } catch (err) {
      setMfaError(err.message);
      setMfaLoading(false);
    }
  }

  if (transitioning) {
    return (
      <TransitionLoadingScreen
        label="Signing you in…"
        promise={subscriptionPromise}
        onComplete={() => {
          commitLogin();

          // Show a non-blocking toast for each security flag
          securityFlags.forEach(code => {
            toast(`Security notice: ${describeFlagCode(code)}`, 'warning');
          });

          navigate(['superadmin', 'sub_superadmin'].includes(loggedInRoleRef.current) ? '/superadmin' : '/app/dashboard');
        }}
      />
    );
  }

  return (
    <>
    <div className="min-h-screen flex" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Left panel */}
      <div
        className="hidden lg:flex flex-col w-[420px] shrink-0 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #0f172a 0%, #1e1b4b 60%, #1e1b4b 100%)' }}
      >
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
        <div className="absolute -bottom-32 -right-16 w-80 h-80 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)' }} />

        <div className="relative z-10 flex flex-col h-full p-12">
          <div className="flex items-center gap-3 mb-16">
            <img src="/logo.svg" alt="ERJ Smart Solutions" className="h-10 w-auto" style={{ filter: 'brightness(0) invert(1)' }} />
            <span className="text-white font-bold text-sm">ERJ Smart Solutions</span>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 w-fit"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Trusted by 500+ companies in the Philippines
            </div>

            <h2 className="text-white font-bold leading-tight mb-4" style={{ fontSize: '2rem', lineHeight: '1.2' }}>
              Complete workforce<br />
              <span style={{ color: '#818cf8' }}>attendance control.</span>
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-10" style={{ maxWidth: '320px' }}>
              Real-time tracking, automated reports, leave management, and biometric integration.
            </p>

            <div className="space-y-3">
              {FEATURES.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(99,102,241,0.15)' }}
                  >
                    <Icon size={13} style={{ color: '#818cf8' }} />
                  </div>
                  <span className="text-sm text-slate-300">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-10 pt-8 border-t"
            style={{ borderColor: 'rgba(255,255,255,0.07)' }}
          >
            {[
              { v: '₱150/mo', l: 'per employee' },
              { v: '14-day',  l: 'free trial' },
              { v: '3 Plans', l: 'to choose from' },
            ].map(({ v, l }) => (
              <div key={l}>
                <p className="text-white font-bold text-sm">{v}</p>
                <p className="text-slate-500 text-xs mt-0.5">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8" style={{ background: '#F3F4F4' }}>
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <img src="/logo.svg" alt="ERJ Smart Solutions" className="h-8 w-auto" />
            <span className="font-bold text-slate-900 text-sm">ERJ Smart Solutions</span>
          </div>

          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 mb-8 transition-colors"
          >
            <ArrowRight size={12} style={{ transform: 'rotate(180deg)' }} />
            Back to home
          </button>

          <div
            className="bg-white rounded-2xl p-8"
            style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)' }}
          >
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Sign in</h1>
            <p className="text-sm text-slate-400 mb-7">Enter your account credentials to continue.</p>

            {error && (
              <div
                className="flex items-start gap-2.5 p-3.5 rounded-xl mb-5 text-sm"
                style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}
              >
                {/* Show shield icon for ABAC policy blocks, warning icon otherwise */}
                {error.includes('1:00 AM') || error.includes('hours') || error.includes('country') || error.includes('device') ? (
                  <Shield size={15} className="mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                )}
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                  Email
                </label>
                <input
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-900 bg-slate-50 border border-slate-200 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:bg-white placeholder-slate-300"
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required autoFocus placeholder="admin@yourcompany.com"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Password
                  </label>
                  <button type="button" onClick={() => { setForgotMode(true); setForgotEmail(email); setForgotSent(false); setForgotError(''); }}
                    className="text-xs text-indigo-600 hover:underline font-medium">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl text-sm text-slate-900 bg-slate-50 border border-slate-200 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:bg-white"
                    type={showPw ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)} required
                  />
                  <button
                    type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors"
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 select-none cursor-pointer -mt-1">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400 cursor-pointer"
                />
                <span className="text-xs text-slate-500">
                  Remember me <span className="text-slate-400">(24 hours)</span>
                </span>
              </label>
              <p className="text-[11px] text-slate-400 -mt-2.5 leading-relaxed">
                {rememberMe
                  ? "You'll stay signed in for 24 hours, even if idle."
                  : 'Auto sign-out after 30 minutes of inactivity, or at midnight.'}
              </p>

              <button
                type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all mt-2"
                style={{
                  background: loading ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
                }}
              >
                {loading ? <Spinner size={15} /> : <>Sign in <ArrowRight size={14} /></>}
              </button>
            </form>
          </div>

          <p className="text-xs text-slate-400 text-center mt-5">
            Don't have an account?{' '}
            <button onClick={() => navigate('/pricing')} className="text-indigo-600 font-semibold hover:underline">
              Start free trial
            </button>
          </p>
        </div>
      </div>
    </div>

    {/* ── Force-logout notice ── */}
    {logoutNotice && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
              <LogOut size={22} className="text-amber-500" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">{logoutNotice.title}</h2>
            <p className="text-sm text-slate-500">{logoutNotice.message}</p>
            <button
              onClick={() => setLogoutNotice(null)}
              className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)' }}>
              Got it
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Forgot Password overlay ── */}
    {forgotMode && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl">
          {forgotSent ? (
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle size={24} className="text-emerald-500" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Check your email</h2>
              <p className="text-sm text-slate-500">
                We sent a password reset link to <strong>{forgotEmail}</strong>. Check your inbox and spam folder.
              </p>
              <button
                onClick={() => { setForgotMode(false); setForgotSent(false); }}
                className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)' }}>
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-slate-900 mb-1">Reset your password</h2>
              <p className="text-sm text-slate-400 mb-5">Enter your account email and we'll send you a reset link.</p>
              {forgotError && (
                <div className="flex items-center gap-2 p-3 rounded-xl mb-4 text-sm"
                  style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
                  <AlertTriangle size={14} className="shrink-0" />{forgotError}
                </div>
              )}
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Email</label>
                  <input
                    type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                    autoFocus required placeholder="admin@yourcompany.com"
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-900 bg-slate-50 border border-slate-200 outline-none focus:border-indigo-400 focus:ring-2 focus:bg-white"
                  />
                </div>
                <button type="submit" disabled={forgotLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                  style={{ background: forgotLoading ? '#a5b4fc' : 'linear-gradient(135deg,#6366f1,#4f46e5)' }}>
                  {forgotLoading ? <Spinner size={15} /> : 'Send reset link'}
                </button>
              </form>
              <button onClick={() => setForgotMode(false)}
                className="mt-3 w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors">
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    )}
    {/* ── Two-factor code overlay ── */}
    {mfaStep && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl">
          <div className="flex items-center gap-2.5 mb-1">
            <ShieldCheck size={18} className="text-indigo-500" />
            <h2 className="text-lg font-bold text-slate-900">Two-factor verification</h2>
          </div>
          <p className="text-sm text-slate-400 mb-5">Enter the 6-digit code from your authenticator app.</p>
          {mfaError && (
            <div className="flex items-center gap-2 p-3 rounded-xl mb-4 text-sm"
              style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
              <AlertTriangle size={14} className="shrink-0" />{mfaError}
            </div>
          )}
          <form onSubmit={handleVerifyMfa} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Authentication code</label>
              <input
                type="text" inputMode="numeric" autoComplete="one-time-code"
                value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus placeholder="000000" maxLength={6}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-900 bg-slate-50 border border-slate-200 outline-none focus:border-indigo-400 focus:ring-2 focus:bg-white tracking-[0.3em] text-center font-mono text-lg"
              />
            </div>
            <button type="submit" disabled={mfaLoading || mfaCode.length !== 6}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60"
              style={{ background: mfaLoading ? '#a5b4fc' : 'linear-gradient(135deg,#6366f1,#4f46e5)' }}>
              {mfaLoading ? <Spinner size={15} /> : 'Verify & sign in'}
            </button>
          </form>
          <button
            onClick={() => { setMfaStep(null); setMfaCode(''); setMfaError(''); supabase.auth.signOut(); }}
            className="mt-3 w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors">
            Cancel and go back
          </button>
        </div>
      </div>
    )}
    </>
  );
}
