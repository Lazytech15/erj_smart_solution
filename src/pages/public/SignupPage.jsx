import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, ArrowRight, ArrowLeft, Check, Building2, CreditCard, Users, Eye, EyeOff, Zap } from 'lucide-react';
import { PLANS, useSubscription } from '../../context/SubscriptionContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { InputField, SelectField, Spinner } from '../../components/ui';

const INDUSTRIES = ['Technology','Healthcare','Finance & Banking','Manufacturing','Retail','Education','Logistics','Construction','Media & Entertainment','Other'];
const COMPANY_SIZES = ['1–10','11–50','51–200','201–500','501–1,000','1,000+'];

export default function SignupPage() {
  const [params] = useSearchParams();
  const planId = params.get('plan') || 'growth';
  const plan = PLANS.find(p => p.id === planId) || PLANS[2];
  const isTrialPlan = planId === 'free_trial';

  // Starter: 2 steps (no billing). Growth/Enterprise: 3 steps.
  const STEPS = isTrialPlan
    ? [
        { id: 'company', label: 'Company',  icon: Building2 },
        { id: 'account', label: 'Account',  icon: Users },
      ]
    : [
        { id: 'company', label: 'Company',  icon: Building2 },
        { id: 'account', label: 'Account',  icon: Users },
        { id: 'billing', label: 'Billing',  icon: CreditCard },
      ];

  const navigate = useNavigate();
  const toast = useToast();
  const { subscribe } = useSubscription();
  const { registerCompanyAdmin, login } = useAuth();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

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
      subscribe(planId, { ...company, adminName: account.adminName, adminEmail: account.adminEmail },
        isTrialPlan ? null : {
          card4: billing.cardNumber.slice(-4),
          expiry: billing.expiry,
          cardName: billing.cardName,
        }
      );
      registerCompanyAdmin({
        adminName: account.adminName,
        adminEmail: account.adminEmail,
        password: account.password,
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

  return (
    <div className="min-h-screen bg-surface-50 flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-80 bg-ink-900 p-8 shrink-0">
        <div className="flex items-center gap-2.5 mb-10">
          <img src="/logo.svg" alt="ERJ" className="w-8 h-8 object-contain" />
          <span className="text-white font-bold text-sm">ERJ</span>
        </div>

        {/* Plan summary */}
        <div className="p-4 rounded-xl border border-white/10 bg-white/5 mb-4">
          <p className="text-sm text-ink-400 mb-1">Selected plan</p>
          <div className="flex items-center gap-2">
            <p className="text-white font-bold text-xl">{plan.name}</p>
            {isTrialPlan && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-500 text-white">
                FREE TRIAL
              </span>
            )}
          </div>
          <p className="text-ink-300 text-xs mt-0.5">${plan.price} per employee / month</p>
          <div className="mt-3 pt-3 border-t border-white/10">
            <p className="text-sm text-ink-400 mb-2">Includes:</p>
            <ul className="space-y-1.5">
              {plan.features.slice(0, 4).map(f => (
                <li key={f} className="flex items-start gap-1.5 text-sm text-ink-300">
                  <Check size={10} className="mt-0.5 shrink-0 text-brand-400" /> {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Trial callout for starter */}
        {isTrialPlan && (
          <div className="p-3 rounded-xl bg-brand-900/30 border border-brand-700/30 mb-6">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap size={11} className="text-brand-400" />
              <p className="text-xs font-bold text-brand-300">14-day free trial</p>
            </div>
            <p className="text-[11px] text-ink-400 leading-relaxed">
              No credit card required. Explore all Starter features free. Upgrade anytime to unlock more.
            </p>
          </div>
        )}

        {/* Steps progress */}
        <div className="space-y-3">
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <div key={s.id} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  done ? 'bg-brand-600 text-white' : active ? 'bg-white text-ink-900' : 'bg-white/10 text-ink-500'
                }`}>
                  {done ? <Check size={12} /> : i + 1}
                </div>
                <span className={`text-xs font-medium ${active ? 'text-white' : done ? 'text-brand-300' : 'text-ink-500'}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-auto text-sm text-ink-500 leading-relaxed">
          🔒 256-bit SSL encryption<br />
          All data stored securely in your region.
        </div>
      </div>

      {/* Main form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile header */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <img src="/logo.svg" alt="ERJ" className="w-9 h-9 object-contain" />
            <span className="font-bold text-ink-900 text-sm">ERJ</span>
          </div>

          <div className="mb-7">
            <p className="text-sm font-semibold text-ink-400 uppercase tracking-wide mb-1">
              Step {step + 1} of {STEPS.length}
            </p>
            <h1 className="text-2xl font-bold text-ink-900">
              {step === 0 && 'Tell us about your company'}
              {step === 1 && 'Create your admin account'}
              {step === 2 && 'Add a payment method'}
            </h1>
            <p className="text-sm text-ink-400 mt-1">
              {step === 0 && "We'll set up your workspace with these details."}
              {step === 1 && isTrialPlan && 'Your free trial starts right after this.'}
              {step === 1 && !isTrialPlan && 'This account will have full admin access.'}
              {step === 2 && `You'll be charged $${plan.price}/employee/month after activation.`}
            </p>
          </div>

          {/* Step 0: Company */}
          {step === 0 && (
            <div className="space-y-4">
              <InputField label="Company Name" value={company.name} onChange={cf('name')} placeholder="ACME Corporation" error={errors.name} />
              <SelectField label="Industry" value={company.industry} onChange={cf('industry')}
                options={INDUSTRIES.map(i => ({ value: i, label: i }))} />
              <SelectField label="Company Size" value={company.size} onChange={cf('size')}
                options={COMPANY_SIZES.map(s => ({ value: s, label: s + ' employees' }))} />
              <InputField label="Office Address" value={company.address} onChange={cf('address')} placeholder="123 Ayala Ave, Makati City" error={errors.address} />
            </div>
          )}

          {/* Step 1: Account */}
          {step === 1 && (
            <div className="space-y-4">
              <InputField label="Your Full Name" value={account.adminName} onChange={af('adminName')} placeholder="Maria Santos" error={errors.adminName} />
              <InputField label="Work Email" type="email" value={account.adminEmail} onChange={af('adminEmail')} placeholder="maria@company.com" error={errors.adminEmail} />
              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={account.password}
                    onChange={e => af('password')(e.target.value)}
                    placeholder="Min. 8 characters"
                    className={`input pr-10 ${errors.password ? 'border-danger-500' : ''}`}
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300">
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {errors.password && <p className="text-sm text-danger-600 mt-1">{errors.password}</p>}
              </div>
              <InputField label="Confirm Password" type="password" value={account.confirmPassword} onChange={af('confirmPassword')} placeholder="Re-enter password" error={errors.confirmPassword} />
            </div>
          )}

          {/* Step 2: Billing (Growth / Enterprise only) */}
          {step === 2 && !isTrialPlan && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-brand-50 border border-brand-100 text-xs text-brand-700 flex items-start gap-2">
                <Check size={13} className="mt-0.5 shrink-0" />
                Your subscription activates immediately. Billed monthly per enrolled employee.
              </div>
              <div>
                <label className="label">Card Number</label>
                <input
                  type="text"
                  value={billing.cardNumber}
                  onChange={e => bf('cardNumber')(formatCard(e.target.value))}
                  placeholder="1234 5678 9012 3456"
                  maxLength={19}
                  className={`input font-mono ${errors.cardNumber ? 'border-danger-500' : ''}`}
                />
                {errors.cardNumber && <p className="text-sm text-danger-600 mt-1">{errors.cardNumber}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Expiry</label>
                  <input
                    type="text"
                    value={billing.expiry}
                    onChange={e => bf('expiry')(formatExpiry(e.target.value))}
                    placeholder="MM/YY"
                    maxLength={5}
                    className={`input font-mono ${errors.expiry ? 'border-danger-500' : ''}`}
                  />
                  {errors.expiry && <p className="text-sm text-danger-600 mt-1">{errors.expiry}</p>}
                </div>
                <div>
                  <label className="label">CVV</label>
                  <input
                    type="text"
                    value={billing.cvv}
                    onChange={e => bf('cvv')(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="•••"
                    className={`input font-mono ${errors.cvv ? 'border-danger-500' : ''}`}
                  />
                  {errors.cvv && <p className="text-sm text-danger-600 mt-1">{errors.cvv}</p>}
                </div>
              </div>
              <InputField label="Name on Card" value={billing.cardName} onChange={bf('cardName')} placeholder="Maria Santos" error={errors.cardName} />
              <div className="p-4 rounded-xl bg-surface-100 space-y-2">
                <div className="flex justify-between text-ink-600">
                  <span className="text-xs">Plan</span>
                  <span className="text-xs font-semibold">{plan.name} — ${plan.price}/emp/mo</span>
                </div>
                <div className="flex justify-between text-ink-600 pt-2 border-t border-surface-200">
                  <span className="text-xs">Due today (0 employees enrolled)</span>
                  <span className="text-xs font-bold text-ink-900">$0.00</span>
                </div>
              </div>
            </div>
          )}

          {/* Nav buttons */}
          <div className="flex items-center gap-3 mt-7">
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} className="btn-secondary flex-1 justify-center">
                <ArrowLeft size={14} /> Back
              </button>
            )}
            {!isFinalStep ? (
              <button onClick={nextStep} className="btn-primary flex-1 justify-center">
                Continue <ArrowRight size={14} />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1 justify-center">
                {loading ? <Spinner size={14} /> : isTrialPlan
                  ? <><Zap size={14} /> Start free trial <ArrowRight size={14} /></>
                  : <>Activate subscription <ArrowRight size={14} /></>
                }
              </button>
            )}
          </div>

          <p className="text-sm text-ink-400 text-center mt-5">
            By continuing you agree to our{' '}
            <span className="text-brand-600 hover:underline cursor-pointer">Terms of Service</span> and{' '}
            <span className="text-brand-600 hover:underline cursor-pointer">Privacy Policy</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
