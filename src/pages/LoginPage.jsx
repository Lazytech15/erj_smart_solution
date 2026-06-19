import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, Clock, FileText, Users, Shield, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui';
import TransitionLoadingScreen from '../components/TransitionLoadingScreen';
import { getSubscription } from '../utils/db';
import { ABAC_RESULT } from '../utils/abac';

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
  const { login, commitLogin } = useAuth();
  const toast   = useToast();
  const navigate = useNavigate();

  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPw,      setShowPw]      = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [subscriptionPromise, setSubscriptionPromise] = useState(null);

  /** Stores ABAC flags so we can show a notice after login completes */
  const [securityFlags, setSecurityFlags] = useState([]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { user, abac } = await login(email, password);
      toast('Welcome back!', 'success');

      // Stash flags so we can show the banner after commitLogin
      if (abac?.flags?.length) {
        setSecurityFlags(abac.flags);
      }

      const subPromise = user?.subscriptionId
        ? getSubscription(user.subscriptionId)
        : Promise.resolve(null);

      setSubscriptionPromise(subPromise);
      setTransitioning(true);
    } catch (err) {
      setError(err.message);
      setLoading(false);
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

          navigate('/app/dashboard');
        }}
      />
    );
  }

  return (
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
            className="grid grid-cols-3 gap-4 mt-10 pt-8 border-t"
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
                  <button type="button" className="text-xs text-indigo-600 hover:underline font-medium">
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
  );
}
