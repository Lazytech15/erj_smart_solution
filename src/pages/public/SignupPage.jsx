import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Check, Building2, CreditCard, Users, Eye, EyeOff, Zap, X, FileText, Shield } from 'lucide-react';
import { PLANS, useSubscription } from '../../context/SubscriptionContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Spinner } from '../../components/ui';

const INDUSTRIES = ['Technology','Healthcare','Finance & Banking','Manufacturing','Retail','Education','Logistics','Construction','Media & Entertainment','Other'];
const COMPANY_SIZES = ['1–10','11–50','51–200','201–500','501–1,000','1,000+'];

/* ── Legal modal content ── */
const LEGAL_CONTENT = {
  terms: {
    title: 'Terms of Service',
    icon: FileText,
    sections: [
      {
        heading: '1. Acceptance of Terms',
        body: 'By accessing or using ERJ Smart Solutions ("Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not access or use the Service.',
      },
      {
        heading: '2. Use of Service',
        body: 'You may use the Service only for lawful purposes and in accordance with these Terms. You agree not to use the Service in any way that violates applicable laws or regulations, or in any manner that could damage, disable, overburden, or impair the Service.',
      },
      {
        heading: '3. Account Registration',
        body: 'To access certain features, you must register for an account. You agree to provide accurate, current, and complete information during registration and to update such information as needed. You are responsible for maintaining the confidentiality of your account credentials.',
      },
      {
        heading: '4. Subscription & Billing',
        body: 'Paid plans are billed monthly per enrolled employee. You authorize ERJ Smart Solutions to charge your payment method on file. All fees are non-refundable except as required by law. We reserve the right to change pricing with 30 days notice.',
      },
      {
        heading: '5. Data Ownership',
        body: 'You retain ownership of all data you upload or create in the Service. You grant us a limited license to process that data solely to provide the Service to you. We will not sell or share your data with third parties without your consent.',
      },
      {
        heading: '6. Termination',
        body: 'Either party may terminate this agreement at any time. Upon termination, your access to the Service will cease. We will retain your data for 30 days following termination, after which it will be permanently deleted.',
      },
      {
        heading: '7. Limitation of Liability',
        body: 'To the fullest extent permitted by law, ERJ Smart Solutions shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including lost profits, arising out of or related to your use of the Service.',
      },
      {
        heading: '8. Governing Law',
        body: 'These Terms shall be governed by and construed in accordance with the laws of the Republic of the Philippines, without regard to its conflict of law provisions.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    icon: Shield,
    sections: [
      {
        heading: '1. Information We Collect',
        body: 'We collect information you provide directly, such as your name, email address, company details, and payment information. We also collect usage data, device information, and log data when you interact with the Service.',
      },
      {
        heading: '2. How We Use Your Information',
        body: 'We use your information to provide, maintain, and improve the Service; process transactions; send transactional and promotional communications; monitor and analyze usage patterns; and comply with legal obligations.',
      },
      {
        heading: '3. Data Storage & Security',
        body: 'Your data is stored on secure servers within your selected region. We implement industry-standard security measures including 256-bit SSL encryption, regular security audits, and access controls to protect your data from unauthorized access.',
      },
      {
        heading: '4. Data Sharing',
        body: 'We do not sell your personal data. We may share data with trusted service providers who assist in operating the Service, subject to confidentiality agreements. We may disclose data if required by law or to protect the rights and safety of our users.',
      },
      {
        heading: '5. Cookies',
        body: 'We use cookies and similar tracking technologies to enhance your experience, analyze usage, and deliver relevant content. You can control cookie settings through your browser preferences, though some features may not function properly if cookies are disabled.',
      },
      {
        heading: '6. Your Rights',
        body: 'You have the right to access, correct, or delete your personal data at any time. You may also object to processing or request data portability. To exercise these rights, contact our Data Protection Officer at privacy@erj.ph.',
      },
      {
        heading: '7. Data Retention',
        body: 'We retain your data for as long as your account is active or as needed to provide the Service. After account termination, data is retained for 30 days before permanent deletion, unless longer retention is required by law.',
      },
      {
        heading: '8. Contact Us',
        body: 'For questions about this Privacy Policy or our data practices, please contact us at privacy@erj.ph or write to ERJ Smart Solutions, 8F BGC Corporate Center, 30th Street, Bonifacio Global City, Taguig City, Metro Manila, Philippines.',
      },
    ],
  },
};

/* ── Legal Modal Component ── */
function LegalModal({ type, onClose }) {
  const content = LEGAL_CONTENT[type];
  if (!content) return null;
  const Icon = content.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: '1px solid #e2e8f0' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(99,102,241,0.1)' }}
            >
              <Icon size={16} style={{ color: '#6366f1' }} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{content.title}</h2>
              <p className="text-xs text-slate-400">ERJ Smart Solutions · Last updated June 2025</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
            style={{ background: '#f1f5f9' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {content.sections.map(s => (
            <div key={s.heading}>
              <h3 className="text-sm font-bold text-slate-800 mb-1.5">{s.heading}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex justify-end"
          style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}
        >
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const { subscribe } = useSubscription();
  const { registerCompanyAdmin, login } = useAuth();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [legalModal, setLegalModal] = useState(null); // 'terms' | 'privacy' | null

  const [company, setCompany] = useState({ name: '', industry: 'Technology', size: '11–50', address: '' });
  const [account, setAccount] = useState({ adminName: '', adminEmail: '', password: '', confirmPassword: '' });
  const [billing, setBilling] = useState({ cardNumber: '', expiry: '', cvv: '', cardName: '' });

  const cf = k => v => setCompany(p => ({ ...p, [k]: v }));
  const af = k => v => setAccount(p => ({ ...p, [k]: v }));
  const bf = k => v => setBilling(p => ({ ...p, [k]: v }));

  const [errors, setErrors] = useState({});

  function validateStep() {
    const e = {};
    if (step === 0) {
      if (!company.name.trim()) e.name = 'Company name is required';
      if (!company.address.trim()) e.address = 'Address is required';
    }
    if (step === 1) {
      if (!account.adminName.trim()) e.adminName = 'Your name is required';
      if (!account.adminEmail.includes('@')) e.adminEmail = 'Valid email required';
      if (account.password.length < 8) e.password = 'Minimum 8 characters';
      if (account.password !== account.confirmPassword) e.confirmPassword = 'Passwords do not match';
    }
    if (step === 2 && !isTrialPlan) {
      if (billing.cardNumber.replace(/\s/g, '').length < 16) e.cardNumber = 'Enter a valid card number';
      if (!billing.expiry.match(/^\d{2}\/\d{2}$/)) e.expiry = 'Format: MM/YY';
      if (billing.cvv.length < 3) e.cvv = 'Enter CVV';
      if (!billing.cardName.trim()) e.cardName = 'Name on card required';
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
    try {
      await new Promise(r => setTimeout(r, 1200));
      const newSub = subscribe(planId, { ...company, adminName: account.adminName, adminEmail: account.adminEmail },
        isTrialPlan ? null : {
          card4: billing.cardNumber.slice(-4),
          expiry: billing.expiry,
          cardName: billing.cardName,
        }
      );
      await registerCompanyAdmin({
        adminName: account.adminName,
        adminEmail: account.adminEmail,
        password: account.password,
        subscriptionId: newSub.subscriptionId,
      });
      await login(account.adminEmail, account.password);
      toast(
        isTrialPlan
          ? 'Your 14-day free trial has started. Welcome!'
          : 'Subscription activated! Welcome to ERJ.',
        'success'
      );
      navigate('/onboard');
    } catch (err) {
      toast(err.message || 'Something went wrong', 'error');
    } finally {
      setLoading(false);
    }
  }

  function formatCard(val) {
    return val.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  }
  function formatExpiry(val) {
    return val.replace(/\D/g, '').slice(0, 4).replace(/^(\d{2})(\d)/, '$1/$2');
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
                    <input type="email" className={`${inputClass} ${errors.adminEmail ? 'border-red-400' : ''}`}
                      value={account.adminEmail} onChange={e => af('adminEmail')(e.target.value)} placeholder="maria@company.com" />
                    {errors.adminEmail && <p className={errorClass}>{errors.adminEmail}</p>}
                  </div>
                  <div>
                    <label className={labelClass}>Password</label>
                    <div className="relative">
                      <input type={showPw ? 'text' : 'password'}
                        className={`${inputClass} pr-10 ${errors.password ? 'border-red-400' : ''}`}
                        value={account.password} onChange={e => af('password')(e.target.value)} placeholder="Min. 8 characters" />
                      <button type="button" onClick={() => setShowPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors">
                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {errors.password && <p className={errorClass}>{errors.password}</p>}
                  </div>
                  <div>
                    <label className={labelClass}>Confirm Password</label>
                    <input type="password" className={`${inputClass} ${errors.confirmPassword ? 'border-red-400' : ''}`}
                      value={account.confirmPassword} onChange={e => af('confirmPassword')(e.target.value)} placeholder="Re-enter password" />
                    {errors.confirmPassword && <p className={errorClass}>{errors.confirmPassword}</p>}
                  </div>
                </div>
              )}

              {/* Step 2: Billing */}
              {step === 2 && !isTrialPlan && (
                <div className="space-y-4">
                  <div className="flex items-start gap-2 p-3 rounded-xl text-xs"
                    style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', color: '#4338ca' }}>
                    <Check size={13} className="mt-0.5 shrink-0" />
                    Your subscription activates immediately. Billed monthly per enrolled employee.
                  </div>
                  <div>
                    <label className={labelClass}>Card Number</label>
                    <input type="text" className={`${inputClass} font-mono ${errors.cardNumber ? 'border-red-400' : ''}`}
                      value={billing.cardNumber} onChange={e => bf('cardNumber')(formatCard(e.target.value))}
                      placeholder="1234 5678 9012 3456" maxLength={19} />
                    {errors.cardNumber && <p className={errorClass}>{errors.cardNumber}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Expiry</label>
                      <input type="text" className={`${inputClass} font-mono ${errors.expiry ? 'border-red-400' : ''}`}
                        value={billing.expiry} onChange={e => bf('expiry')(formatExpiry(e.target.value))}
                        placeholder="MM/YY" maxLength={5} />
                      {errors.expiry && <p className={errorClass}>{errors.expiry}</p>}
                    </div>
                    <div>
                      <label className={labelClass}>CVV</label>
                      <input type="text" className={`${inputClass} font-mono ${errors.cvv ? 'border-red-400' : ''}`}
                        value={billing.cvv} onChange={e => bf('cvv')(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="•••" />
                      {errors.cvv && <p className={errorClass}>{errors.cvv}</p>}
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Name on Card</label>
                    <input className={`${inputClass} ${errors.cardName ? 'border-red-400' : ''}`}
                      value={billing.cardName} onChange={e => bf('cardName')(e.target.value)} placeholder="Maria Santos" />
                    {errors.cardName && <p className={errorClass}>{errors.cardName}</p>}
                  </div>
                  <div className="rounded-xl p-4 space-y-2" style={{ background: '#f8fafc' }}>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Plan</span>
                      <span className="font-semibold">{plan.name} — ${plan.price}/emp/mo</span>
                    </div>
                    <div className="flex justify-between text-xs pt-2" style={{ borderTop: '1px solid #e2e8f0' }}>
                      <span className="text-slate-500">Due today (0 employees enrolled)</span>
                      <span className="font-bold text-slate-900">$0.00</span>
                    </div>
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
                      : <>Subscribe <ArrowRight size={14} /></>
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