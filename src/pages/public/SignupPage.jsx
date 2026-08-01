import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Check, Building2, CreditCard, Users, Eye, EyeOff, Zap, ShieldCheck, Loader2 } from 'lucide-react';
import { PLANS, useSubscription } from '../../context/SubscriptionContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Spinner } from '../../components/ui';
import { supabase } from '../../utils/supabase';
import PasswordStrengthField, { isPasswordStrong } from '../../components/PasswordStrengthField';
import LegalModal from '../../components/LegalModal';
import { useFormDraft } from '../../hooks/useFormDraft';
import { useSensitiveFormDraft } from '../../hooks/useSensitiveFormDraft';
import { signupDraftKey, isSignupFormMeaningful } from '../../utils/draftKeys';
import DraftRestoredBanner from '../../components/DraftRestoredBanner';
import OtpInput from '../../components/OtpInput';

const OTP_PURPOSE = 'signup_verification';
const RESEND_COOLDOWN_SECONDS = 30;

const INDUSTRIES = ['Technology','Healthcare','Finance & Banking','Manufacturing','Retail','Education','Logistics','Construction','Media & Entertainment','Other'];
const COMPANY_SIZES = ['1–10','11–50','51–200','201–500','501–1,000','1,000+'];

/* ── Main Page ── */
export default function SignupPage() {
  const [params] = useSearchParams();
  const planId = params.get('plan') || 'growth';
  const plan = PLANS.find(p => p.id === planId) || PLANS[2];
  const isTrialPlan = planId === 'free_trial';

  const STEPS = isTrialPlan
    ? [
        { id: 'company', label: 'Company', icon: Building2 },
        { id: 'account', label: 'Account', icon: Users },
      ]
    : [
        { id: 'company', label: 'Company', icon: Building2 },
        { id: 'account', label: 'Account', icon: Users },
        { id: 'billing', label: 'Billing',  icon: CreditCard },
      ];

  const navigate = useNavigate();
  const toast = useToast();
  const { subscribe, discardSubscription } = useSubscription();
  const { registerCompanyAdmin } = useAuth();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [legalModal, setLegalModal] = useState(null); // 'terms' | 'privacy' | null

  const [company, setCompany] = useState({ name: '', industry: 'Technology', size: '11–50', address: '' });
  const [account, setAccount] = useState({ adminName: '', adminEmail: '', password: '', confirmPassword: '' });

  const cf = k => v => setCompany(p => ({ ...p, [k]: v }));
  const af = k => v => setAccount(p => ({ ...p, [k]: v }));

  const [errors, setErrors] = useState({});

  // ── Email OTP verification ──
  const [otpStatus, setOtpStatus] = useState('idle'); // idle | sending | sent | verifying | verified
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState(''); // email the current 'verified' status applies to
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef(null);

  useEffect(() => () => clearInterval(cooldownRef.current), []);

  function startResendCooldown() {
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(s => {
        if (s <= 1) { clearInterval(cooldownRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  const emailIsVerified = otpStatus === 'verified' && verifiedEmail === account.adminEmail;

  // ── Draft persistence (survives accidental reload / tab discard) ──
  // Non-sensitive fields (company info, name, email, step, verification
  // status) are saved to localStorage and last up to 24h. Passwords and
  // card details are saved separately, encrypted, to sessionStorage (see
  // useSensitiveFormDraft below) — they still survive a reload, but never
  // sit on disk and disappear the moment the tab is closed.
  // We DO persist "a code was sent to this email" and "this email was
  // verified" (never the code itself — that only ever exists as a hash
  // server-side) so a reload doesn't throw away a completed verification
  // or hide the code-entry box while the emailed code is still valid.
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftRestoreMessage, setDraftRestoreMessage] = useState('');
  const draftKey = signupDraftKey(planId);
  const sensitiveDraftKey = `${draftKey}:sensitive`;

  // Tracks whether the encrypted sensitive draft (password/card) has
  // finished its once-on-mount restore attempt yet, so the two restore
  // paths (plain + sensitive) can be combined into a single banner message
  // instead of flashing two separate toasts.
  const sensitiveRestoredRef = useRef({ hadPassword: false });

  const { clear: clearFormDraft } = useFormDraft(
    draftKey,
    {
      step,
      company,
      account: { adminName: account.adminName, adminEmail: account.adminEmail },
      otpSent: otpStatus === 'sent' || otpStatus === 'verifying',
      otpVerified: emailIsVerified,
    },
    {
      isMeaningful: isSignupFormMeaningful,
      onRestore: (draft) => {
        if (draft.company) setCompany(prev => ({ ...prev, ...draft.company }));
        if (draft.account) setAccount(prev => ({ ...prev, adminName: draft.account.adminName || '', adminEmail: draft.account.adminEmail || '' }));
        if (typeof draft.step === 'number' && draft.step < STEPS.length) setStep(draft.step);
        if (draft.otpVerified && draft.account?.adminEmail) {
          setOtpStatus('verified');
          setVerifiedEmail(draft.account.adminEmail);
        } else if (draft.otpSent && draft.account?.adminEmail) {
          setOtpStatus('sent');
        }
        setDraftRestored(true);
        announceRestore();
      },
    }
  );

  // Sensitive fields (password, confirm-password, card details) — kept out
  // of the plain draft above and restored separately from encrypted
  // sessionStorage, so going Back a step (or an accidental reload) never
  // silently empties the password field and breaks submit downstream.
  const { clear: clearSensitiveDraft } = useSensitiveFormDraft(
    sensitiveDraftKey,
    {
      password: account.password,
      confirmPassword: account.confirmPassword,
    },
    {
      isMeaningful: (d) => Boolean(d.password),
      onRestore: (draft) => {
        if (draft.password || draft.confirmPassword) {
          setAccount(prev => ({
            ...prev,
            password: draft.password || prev.password,
            confirmPassword: draft.confirmPassword || prev.confirmPassword,
          }));
          sensitiveRestoredRef.current.hadPassword = true;
        }
        setDraftRestored(true);
        announceRestore();
      },
    }
  );

  // Combines whichever of the two restores actually fired into one banner
  // message. Both hooks restore once on mount (order isn't guaranteed), so
  // this recomputes the message each time either one reports in.
  function announceRestore() {
    const { hadPassword } = sensitiveRestoredRef.current;
    let message = 'Restored your signup details from before the page reloaded.';
    if (hadPassword) message += ' Your password was restored too.';
    setDraftRestoreMessage(message);
  }

  function discardDraft() {
    clearFormDraft();
    clearSensitiveDraft();
    setDraftRestored(false);
  }

  function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function humanizeOtpError(message, fallback) {
    const m = (message || '').toLowerCase();
    if (!m) return fallback;
    if (m.includes('incorrect code')) return "That code doesn't look right. Please try again.";
    if (m.includes('expired')) return 'This code has expired. Send a new one and try again.';
    if (m.includes('no active code')) return 'This code is no longer valid. Send a new one and try again.';
    if (m.includes('non-2xx') || m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed')) {
      return fallback;
    }
    if (m.includes('required')) return 'Enter the 6-digit code';
    return message || fallback;
  }

  async function extractFunctionError(error, data) {
    if (data?.error) return data.error;
    const ctx = error && error.context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const clone = typeof ctx.clone === 'function' ? ctx.clone() : ctx;
        const body = await clone.json();
        if (body?.error) return body.error;
      } catch {
        // response body wasn't JSON or already consumed - fall through
      }
    }
    return error?.message;
  }

  const otpErrorTimeoutRef = useRef(null);
  function showOtpError(message) {
    setOtpError(message);
    clearTimeout(otpErrorTimeoutRef.current);
    if (message) {
      otpErrorTimeoutRef.current = setTimeout(() => setOtpError(''), 10000);
    }
  }
  useEffect(() => () => clearTimeout(otpErrorTimeoutRef.current), []);

  async function sendOtp() {
    if (!isValidEmail(account.adminEmail)) {
      setErrors(prev => ({ ...prev, adminEmail: 'Enter a valid email before sending a code' }));
      return;
    }
    showOtpError('');
    setOtpStatus('sending');
    try {
      const { data, error } = await supabase.functions.invoke('send-otp', {
        body: { email: account.adminEmail, purpose: OTP_PURPOSE },
      });
      if (error || !data?.ok) {
        const raw = await extractFunctionError(error, data);
        throw new Error(raw);
      }
      setOtpStatus('sent');
      setOtpCode('');
      startResendCooldown();
      toast(`Verification code sent to ${account.adminEmail}`, 'success');
    } catch (err) {
      setOtpStatus('idle');
      showOtpError(humanizeOtpError(err.message, "We couldn't send the code. Please try again."));
    }
  }

  async function verifyOtp(codeOverride) {
    const code = (codeOverride ?? otpCode).trim();
    if (code.length !== 6) {
      showOtpError('Enter the 6-digit code');
      return;
    }
    showOtpError('');
    setOtpStatus('verifying');
    try {
      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: { email: account.adminEmail, purpose: OTP_PURPOSE, code },
      });
      if (error || !data?.ok) {
        const raw = await extractFunctionError(error, data);
        throw new Error(raw);
      }
      setOtpStatus('verified');
      setVerifiedEmail(account.adminEmail);
      showOtpError('');
      setErrors(prev => ({ ...prev, adminEmail: undefined }));
    } catch (err) {
      setOtpStatus('sent');
      showOtpError(humanizeOtpError(err.message, "That code doesn't look right. Please try again."));
    }
  }

  // Reset verification whenever the email is edited after being verified/sent
  function handleEmailChange(v) {
    af('adminEmail')(v);
    if (otpStatus !== 'idle') {
      setOtpStatus('idle');
      setOtpCode('');
      setOtpError('');
      clearTimeout(otpErrorTimeoutRef.current);
      setVerifiedEmail('');
      setResendCooldown(0);
      clearInterval(cooldownRef.current);
    }
  }

  function validateStep() {
    const e = {};
    if (step === 0) {
      if (!company.name.trim()) e.name = 'Company name is required';
      if (!company.address.trim()) e.address = 'Address is required';
    }
    if (step === 1) {
      if (!account.adminName.trim()) e.adminName = 'Your name is required';
      if (!account.adminEmail.includes('@')) e.adminEmail = 'Valid email required';
      else if (!emailIsVerified) e.adminEmail = 'Please verify your email with the code we sent';
      if (!account.password) e.password = 'Password is required';
      else if (!isPasswordStrong(account.password)) e.password = 'Password does not meet all requirements';
      if (account.password !== account.confirmPassword) e.confirmPassword = 'Passwords do not match';
    }
    if (step === 2 && !isTrialPlan) {
      if (!agreedToTerms) e.terms = 'You must agree to the terms to continue';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function nextStep() {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) setStep(s => s + 1);
  }

  async function handleSubmit() {
    if (!validateStep()) return;
    setLoading(true);
    let newSub;
    try {
      await new Promise(r => setTimeout(r, 1200));
      newSub = await subscribe(planId, { ...company, adminName: account.adminName, adminEmail: account.adminEmail }, null);
      await registerCompanyAdmin({
        adminName: account.adminName,
        adminEmail: account.adminEmail,
        password: account.password,
        subscriptionId: newSub.subscriptionId,
      });
      // registerCompanyAdmin already signs the user in — no need to call login() again.
      clearFormDraft();
      clearSensitiveDraft();
      toast(
        isTrialPlan
          ? 'Your 14-day free trial has started. Welcome!'
          : 'Account created! Add your team, then finish setup to complete payment.',
        'success'
      );
      navigate('/onboard');
    } catch (err) {
      // subscribe() already wrote the subscription row to Supabase before
      // registerCompanyAdmin ran — if that (or anything after it) failed,
      // the row would otherwise be left behind as an orphan with no linked
      // account, and retrying would create ANOTHER one on top of it
      // (duplicate company entries). Roll it back so a retry starts clean.
      if (newSub?.subscriptionId) {
        try {
          await discardSubscription(newSub.subscriptionId);
        } catch (rollbackErr) {
          console.error('[SignupPage] failed to roll back orphaned subscription:', rollbackErr);
        }
      }
      toast(err.message || 'Something went wrong', 'error');
    } finally {
      setLoading(false);
    }
  }

  const isFinalStep = step === STEPS.length - 1;
  const inputClass = "w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-900 bg-slate-50 border border-slate-200 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:bg-white placeholder-slate-300";
  const labelClass = "block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide";
  const errorClass = "text-xs text-red-600 mt-1";

  return (
    <>
      {/* Legal Modal */}
      {legalModal && <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />}

      <div className="min-h-screen flex" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

        {/* ── Left dark panel ── */}
        <div
          className="hidden lg:flex flex-col w-80 shrink-0 relative overflow-hidden"
          style={{ background: 'linear-gradient(145deg, #0f172a 0%, #1e1b4b 60%, #1e1b4b 100%)' }}
        >
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
          <div className="absolute -bottom-32 -right-16 w-80 h-80 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)' }} />

          <div className="relative z-10 flex flex-col h-full p-10">
            {/* Logo — bigger, with full brand name */}
            <div className="flex items-center gap-3 mb-10">
              <img
                src="/logo.svg"
                alt="ERJ Smart Solutions"
                className="w-20 h-20 object-contain shrink-0"
                style={{ filter: 'brightness(0) invert(1)' }}
              />
              <div>
                <span className="text-white font-bold text-sm leading-tight block">ERJ Smart Solutions</span>
                {/* <span className="text-slate-400 text-xs leading-tight">Smart Solutions</span> */}
              </div>
            </div>

            {/* Plan summary card */}
            <div
              className="rounded-xl p-4 mb-6"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <p className="text-xs text-slate-400 mb-1">Selected plan</p>
              <div className="flex items-center gap-2">
                <p className="text-white font-bold text-lg">{plan.name}</p>
                {isTrialPlan && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500 text-white">
                    FREE TRIAL
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-xs mt-0.5">${plan.price} per employee / month</p>
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <p className="text-xs text-slate-500 mb-2">Includes:</p>
                <ul className="space-y-1.5">
                  {plan.features.slice(0, 4).map(f => (
                    <li key={f} className="flex items-start gap-1.5 text-xs text-slate-300">
                      <Check size={10} className="mt-0.5 shrink-0" style={{ color: '#818cf8' }} /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Trial callout */}
            {isTrialPlan && (
              <div
                className="p-3 rounded-xl mb-6"
                style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap size={11} style={{ color: '#a5b4fc' }} />
                  <p className="text-xs font-bold" style={{ color: '#a5b4fc' }}>14-day free trial</p>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  No credit card required. Explore all Starter features free. Upgrade anytime to unlock more.
                </p>
              </div>
            )}

            {/* Step progress */}
            <div className="space-y-3">
              {STEPS.map((s, i) => {
                const done = i < step;
                const active = i === step;
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{
                        background: done ? '#6366f1' : active ? '#ffffff' : 'rgba(255,255,255,0.1)',
                        color: done ? '#fff' : active ? '#0f172a' : '#64748b',
                      }}
                    >
                      {done ? <Check size={12} /> : i + 1}
                    </div>
                    <span
                      className="text-xs font-medium"
                      style={{ color: active ? '#ffffff' : done ? '#a5b4fc' : '#475569' }}
                    >
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-auto text-xs text-slate-500 leading-relaxed">
              🔒 256-bit SSL encryption<br />
              All data stored securely in your region.
            </div>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 flex flex-col items-center justify-center p-8" style={{ background: '#F3F4F4' }}>
          <div className="w-full max-w-[440px]">

            {/* Mobile logo */}
            <div className="lg:hidden flex items-center gap-3 mb-10">
              <img src="/logo.svg" alt="ERJ Smart Solutions" className="h-10 w-auto" />
              <div>
                <span className="font-bold text-slate-900 text-base block leading-tight">ERJ</span>
                <span className="text-slate-400 text-xs">Smart Solutions</span>
              </div>
            </div>

            {/* Back to pricing */}
            <button
              onClick={() => navigate('/pricing')}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 transition-colors mb-6"
            >
              <ArrowLeft size={14} /> Back to pricing
            </button>

            {/* White card */}
            <div
              className="bg-white rounded-2xl p-8"
              style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)' }}
            >
              {/* Step heading */}
              <div className="mb-6">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                  Step {step + 1} of {STEPS.length}
                </p>
                <h1 className="text-2xl font-bold text-slate-900">
                  {step === 0 && 'Tell us about your company'}
                  {step === 1 && 'Create your admin account'}
                  {step === 2 && 'Add a payment method'}
                </h1>
                <p className="text-sm text-slate-400 mt-1">
                  {step === 0 && "We'll set up your workspace with these details."}
                  {step === 1 && isTrialPlan && 'Your free trial starts right after this.'}
                  {step === 1 && !isTrialPlan && 'This account will have full admin access.'}
                  {step === 2 && `You'll be charged $${plan.price}/employee/month after activation.`}
                </p>
              </div>

              {draftRestored && (
                <DraftRestoredBanner
                  className="mb-4"
                  message={draftRestoreMessage || 'Restored your signup details from before the page reloaded.'}
                  onDiscard={discardDraft}
                />
              )}

              {/* Step 0: Company */}
              {step === 0 && (
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Company Name</label>
                    <input className={`${inputClass} ${errors.name ? 'border-red-400' : ''}`}
                      value={company.name} onChange={e => cf('name')(e.target.value)} placeholder="ACME Corporation" />
                    {errors.name && <p className={errorClass}>{errors.name}</p>}
                  </div>
                  <div>
                    <label className={labelClass}>Industry</label>
                    <select className={inputClass} value={company.industry} onChange={e => cf('industry')(e.target.value)}>
                      {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Company Size</label>
                    <select className={inputClass} value={company.size} onChange={e => cf('size')(e.target.value)}>
                      {COMPANY_SIZES.map(s => <option key={s} value={s}>{s} employees</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Office Address</label>
                    <input className={`${inputClass} ${errors.address ? 'border-red-400' : ''}`}
                      value={company.address} onChange={e => cf('address')(e.target.value)} placeholder="123 Ayala Ave, Makati City" />
                    {errors.address && <p className={errorClass}>{errors.address}</p>}
                  </div>
                </div>
              )}

              {/* Step 1: Account */}
              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Your Full Name</label>
                    <input className={`${inputClass} ${errors.adminName ? 'border-red-400' : ''}`}
                      value={account.adminName} onChange={e => af('adminName')(e.target.value)} placeholder="Maria Santos" />
                    {errors.adminName && <p className={errorClass}>{errors.adminName}</p>}
                  </div>
                  <div>
                    <label className={labelClass}>Work Email</label>
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <input type="email" disabled={emailIsVerified}
                          className={`${inputClass} ${errors.adminEmail ? 'border-red-400' : ''} ${emailIsVerified ? 'opacity-70' : ''}`}
                          value={account.adminEmail} onChange={e => handleEmailChange(e.target.value)} placeholder="maria@company.com" />
                      </div>
                      {emailIsVerified ? (
                        <div className="flex items-center gap-1 px-3 py-2.5 rounded-xl text-xs font-semibold shrink-0"
                          style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
                          <ShieldCheck size={13} /> Verified
                        </div>
                      ) : (
                        <button type="button" onClick={sendOtp} disabled={otpStatus === 'sending' || resendCooldown > 0}
                          className="shrink-0 flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all"
                          style={{
                            background: (otpStatus === 'sending' || resendCooldown > 0) ? '#e2e8f0' : '#eef2ff',
                            color: (otpStatus === 'sending' || resendCooldown > 0) ? '#94a3b8' : '#4f46e5',
                          }}>
                          {otpStatus === 'sending'
                            ? <><Loader2 size={13} className="animate-spin" /> Sending</>
                            : resendCooldown > 0
                              ? `Resend in ${resendCooldown}s`
                              : otpStatus === 'sent'
                                ? 'Resend code'
                                : 'Send code'}
                        </button>
                      )}
                    </div>
                    {errors.adminEmail && <p className={errorClass}>{errors.adminEmail}</p>}

                    {(otpStatus === 'sent' || otpStatus === 'verifying') && (
                      <div className="mt-2.5 p-4 rounded-xl" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <p className="text-xs text-slate-500 mb-3 text-center">
                          Enter the 6-digit code we sent to <span className="font-semibold text-slate-700">{account.adminEmail}</span>
                        </p>
                        <OtpInput
                          length={6}
                          value={otpCode}
                          disabled={otpStatus === 'verifying'}
                          error={Boolean(otpError)}
                          autoFocus
                          onChange={code => { setOtpCode(code); setOtpError(''); }}
                          onComplete={verifyOtp}
                        />
                        <div className="flex justify-center mt-3">
                          <button type="button" onClick={() => verifyOtp()} disabled={otpStatus === 'verifying' || otpCode.length !== 6}
                            className="flex items-center justify-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold text-white transition-all"
                            style={{ background: (otpStatus === 'verifying' || otpCode.length !== 6) ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
                            {otpStatus === 'verifying' ? <Loader2 size={13} className="animate-spin" /> : 'Verify'}
                          </button>
                        </div>
                        {otpError && <p className={`${errorClass} text-center`}>{otpError}</p>}
                      </div>
                    )}
                    {otpStatus === 'idle' && otpError && <p className={`${errorClass} mt-1`}>{otpError}</p>}
                  </div>

                  {/* Password with strength checker */}
                  <PasswordStrengthField
                    variant="signup"
                    value={account.password}
                    onChange={v => af('password')(v)}
                    error={errors.password}
                    label="Password"
                    placeholder="Create a strong password"
                  />

                  {/* Confirm Password */}
                  <div>
                    <label className={labelClass}>Confirm Password</label>
                    <input type="password" className={`${inputClass} ${errors.confirmPassword ? 'border-red-400' : ''}`}
                      value={account.confirmPassword} onChange={e => af('confirmPassword')(e.target.value)} placeholder="Re-enter password" />
                    {errors.confirmPassword
                      ? <p className={errorClass}>{errors.confirmPassword}</p>
                      : account.confirmPassword && account.password === account.confirmPassword && (
                        <p className="text-[10px] text-emerald-500 mt-1 flex items-center gap-1">
                          <Check size={9} strokeWidth={3} /> Passwords match
                        </p>
                      )
                    }
                  </div>
                </div>
              )}

              {/* Step 2: Plan review (no card fields — payment happens on PayMongo's
                  hosted Checkout page at "Finish setup", once seats are known) */}
              {step === 2 && !isTrialPlan && (
                <div className="space-y-4">
                  <div className="flex items-start gap-2 p-3 rounded-xl text-xs"
                    style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', color: '#4338ca' }}>
                    <Check size={13} className="mt-0.5 shrink-0" />
                    You'll enter your payment details securely on the next screen, once you've enrolled your team.
                  </div>
                  <div className="rounded-xl p-4 space-y-2" style={{ background: '#f8fafc' }}>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Plan</span>
                      <span className="font-semibold">{plan.name} — ${plan.price}/emp/mo</span>
                    </div>
                    <div className="pt-2 text-xs text-slate-500" style={{ borderTop: '1px solid #e2e8f0' }}>
                      Billed monthly per enrolled employee. You won't be charged until you finish setting up your workspace.
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>What's included</label>
                    <ul className="space-y-1.5 mt-1">
                      {plan.features.slice(0, 6).map(f => (
                        <li key={f} className="flex items-start gap-1.5 text-xs text-slate-600">
                          <Check size={11} className="mt-0.5 shrink-0" style={{ color: '#6366f1' }} /> {f}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* ── Terms & Conditions checkbox ── */}
                  <div className={`rounded-xl p-3.5 ${errors.terms ? 'ring-1 ring-red-400' : ''}`}
                    style={{ background: errors.terms ? '#fef2f2' : '#f8fafc', border: `1px solid ${errors.terms ? '#fca5a5' : '#e2e8f0'}` }}>
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                      <div className="relative mt-0.5 shrink-0">
                        <input
                          type="checkbox"
                          checked={agreedToTerms}
                          onChange={e => {
                            setAgreedToTerms(e.target.checked);
                            if (e.target.checked) setErrors(prev => ({ ...prev, terms: undefined }));
                          }}
                          className="sr-only"
                        />
                        <div
                          className="w-4.5 h-4.5 rounded flex items-center justify-center transition-all"
                          style={{
                            width: '18px', height: '18px',
                            background: agreedToTerms ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : '#ffffff',
                            border: agreedToTerms ? 'none' : '2px solid #cbd5e1',
                            boxShadow: agreedToTerms ? '0 2px 6px rgba(99,102,241,0.3)' : 'none',
                          }}
                        >
                          {agreedToTerms && <Check size={11} color="white" strokeWidth={3} />}
                        </div>
                      </div>
                      <span className="text-xs text-slate-600 leading-relaxed">
                        I agree to the{' '}
                        <button
                          type="button"
                          onClick={e => { e.preventDefault(); setLegalModal('terms'); }}
                          className="font-semibold hover:underline"
                          style={{ color: '#6366f1' }}
                        >
                          Terms of Service
                        </button>
                        {' '}and{' '}
                        <button
                          type="button"
                          onClick={e => { e.preventDefault(); setLegalModal('privacy'); }}
                          className="font-semibold hover:underline"
                          style={{ color: '#6366f1' }}
                        >
                          Privacy Policy
                        </button>
                        {' '}of ERJ Smart Solutions.
                      </span>
                    </label>
                    {errors.terms && (
                      <p className="text-xs text-red-500 mt-2 ml-7">{errors.terms}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Navigation buttons */}
              <div className="flex items-center gap-3 mt-7">
                {step > 0 && (
                  <button onClick={() => setStep(s => s - 1)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
                    style={{ background: '#f1f5f9', color: '#475569' }}>
                    <ArrowLeft size={14} /> Back
                  </button>
                )}
                {!isFinalStep ? (
                  <button onClick={nextStep}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}>
                    Continue <ArrowRight size={14} />
                  </button>
                ) : (
                  <button onClick={handleSubmit} disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all"
                    style={{
                      background: loading ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                      boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
                    }}>
                    {loading ? <Spinner size={14} /> : isTrialPlan
                      ? <><Zap size={14} /> Start free trial <ArrowRight size={14} /></>
                      : <>Continue to setup <ArrowRight size={14} /></>
                    }
                  </button>
                )}
              </div>
            </div>

            {/* Bottom note — clickable links open modals */}
            <p className="text-xs text-slate-400 text-center mt-5">
              By continuing you agree to our{' '}
              <button onClick={() => setLegalModal('terms')}
                className="text-indigo-600 font-semibold hover:underline">Terms of Service</button>
              {' '}and{' '}
              <button onClick={() => setLegalModal('privacy')}
                className="text-indigo-600 font-semibold hover:underline">Privacy Policy</button>.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}