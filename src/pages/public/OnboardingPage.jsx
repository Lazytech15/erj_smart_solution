import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users, UserPlus, Check, ArrowRight, Upload,
  Trash2, ChevronDown, ChevronUp, AlertCircle, RefreshCw, PenLine, Wand2, Download
} from 'lucide-react';
import { useSubscription } from '../../context/SubscriptionContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getSubscription } from '../../utils/db';
import { cacheInvalidate } from '../../utils/cache';
import { startCheckout } from '../../utils/paymongo';
import { generateEmployeeCode, downloadCSVTemplate, parseCSV } from '../../utils/csvImport';
import { onboardingEmployeeDraftKey, isAddEmployeeFormMeaningful } from '../../utils/employeeDraft';
import { useFormDraft } from '../../hooks/useFormDraft';
import { InputField, Avatar, Spinner } from '../../components/ui';
import LoadingScreen from '../../components/LoadingScreen';
import TransitionLoadingScreen from '../../components/TransitionLoadingScreen';
import DraftRestoredBanner from '../../components/DraftRestoredBanner';

const DEPARTMENTS_SUGGESTIONS = [
  'Engineering', 'Human Resources', 'Finance', 'Operations',
  'Marketing', 'Sales', 'Customer Support', 'Legal', 'IT', 'Procurement',
];
const ROLES_SUGGESTIONS = [
  'Manager', 'Team Lead', 'Senior Engineer', 'Engineer',
  'Analyst', 'Specialist', 'Associate', 'Coordinator',
];

/* ── Phone helpers ── */
function toLocalPhone(full) {
  if (!full) return '';
  const digits = full.replace(/^\+63/, '').replace(/\D/g, '');
  return digits.slice(0, 10);
}
function toFullPhone(local) {
  const digits = local.replace(/\D/g, '').slice(0, 10);
  return digits ? `+63${digits}` : '';
}

function PhoneField({ value, onChange, label = 'Phone' }) {
  const local = toLocalPhone(value);
  function handleChange(e) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 10);
    onChange(toFullPhone(raw));
  }
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-stretch rounded-xl border border-surface-300 overflow-hidden focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 transition-all"
        style={{ background: '#fff' }}>
        <span className="flex items-center px-3 text-sm font-semibold text-ink-500 bg-surface-50 border-r border-surface-200 select-none shrink-0">
          +63
        </span>
        <input
          type="tel"
          inputMode="numeric"
          value={local}
          onChange={handleChange}
          placeholder="9xx xxx xxxx"
          maxLength={10}
          className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none text-ink-800 placeholder-ink-300"
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Employee form
───────────────────────────────────────────── */
function EmployeeForm({ onAdd, seatsAvailable, currentPlan, existingCodes, departments }) {
  const { user } = useAuth();
  const toast = useToast();
  const activeDepts = departments.length > 0 ? departments : DEPARTMENTS_SUGGESTIONS;
  const [form, setForm] = useState({
    firstName: '', middleName: '', lastName: '', suffix: '', email: '', phone: '',
    role: '', department: '',
    joinDate: new Date().toISOString().split('T')[0],
    employeeCode: '',
  });
  const [idMode, setIdMode] = useState('manual');
  const [errors, setErrors] = useState({});
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    if (departments.length > 0 && !form.department) {
      setForm(p => ({ ...p, department: departments[0] }));
    }
  }, [departments]);

  // ── Draft persistence ────────────────────────────────────────────
  // Without this, a reload mid-onboarding (e.g. the admin switches tabs to
  // fill in the downloaded CSV template, and the browser reclaims/reloads
  // this tab in the background) silently wiped out whatever they'd already
  // typed into this form — same failure mode useFormDraft already fixes
  // for the Employees page's own Add Employee modal.
  const draftKey = onboardingEmployeeDraftKey(user?.id);
  const { clear: clearFormDraft } = useFormDraft(
    draftKey,
    { form, idMode },
    {
      isMeaningful: isAddEmployeeFormMeaningful,
      onRestore: (draft) => {
        setForm(prev => ({ ...prev, ...draft.form }));
        if (draft.idMode) setIdMode(draft.idMode);
        setDraftRestored(true);
        toast('Restored the employee details you were entering before the page reloaded.', 'info');
      },
    }
  );

  function discardDraft() {
    clearFormDraft();
    setForm(p => ({
      firstName: '', middleName: '', lastName: '', suffix: '', email: '', phone: '',
      role: '', department: activeDepts[0] || '',
      joinDate: new Date().toISOString().split('T')[0],
      employeeCode: '',
    }));
    setIdMode('manual');
    setErrors({});
    setDraftRestored(false);
  }

  const f = k => v => setForm(p => ({ ...p, [k]: v }));

  function regenerate() { setForm(p => ({ ...p, employeeCode: generateEmployeeCode() })); }

  function handleModeSwitch(mode) {
    setIdMode(mode);
    setForm(p => ({ ...p, employeeCode: mode === 'auto' ? generateEmployeeCode() : '' }));
    setErrors(e => ({ ...e, employeeCode: undefined }));
  }

  function validate() {
    const e = {};
    if (!form.firstName.trim()) e.firstName = 'Required';
    if (!form.lastName.trim()) e.lastName = 'Required';
    if (!form.email.includes('@')) e.email = 'Valid email required';
    if (!form.role.trim()) e.role = 'Required';
    const code = form.employeeCode.trim().toUpperCase();
    if (!code) e.employeeCode = 'Employee ID is required';
    else if (existingCodes.includes(code)) e.employeeCode = 'This ID is already in use';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleAdd() {
    if (!validate()) return;
    if (seatsAvailable === 0) return;
    onAdd({ ...form, employeeCode: form.employeeCode.trim().toUpperCase() });
    clearFormDraft();
    setForm({
      firstName: '', middleName: '', lastName: '', suffix: '', email: '', phone: '',
      role: '', department: activeDepts[0] || '',
      joinDate: new Date().toISOString().split('T')[0],
      employeeCode: '',
    });
    setIdMode('manual');
    setErrors({});
    setDraftRestored(false);
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <UserPlus size={15} className="text-brand-600" />
        <p className="text-sm font-semibold text-ink-900">Add an employee</p>
      </div>

      {draftRestored && (
        <DraftRestoredBanner
          message="Restored unsaved details from before the page reloaded."
          onDiscard={discardDraft}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <InputField label="First Name" value={form.firstName} onChange={f('firstName')} placeholder="Maria" error={errors.firstName} />
        <InputField label="Last Name" value={form.lastName} onChange={f('lastName')} placeholder="Santos" error={errors.lastName} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InputField label={<span>Middle Name <span className="text-ink-400 font-normal">(optional)</span></span>} value={form.middleName} onChange={f('middleName')} placeholder="Cristina" />
        <InputField label={<span>Suffix <span className="text-ink-400 font-normal">(optional)</span></span>} value={form.suffix} onChange={f('suffix')} placeholder="Jr., Sr., III…" />
      </div>

      <InputField label="Work Email" type="email" value={form.email} onChange={f('email')} placeholder="m.santos@company.com" error={errors.email} />

      <div className="grid grid-cols-2 gap-3">
        <PhoneField value={form.phone} onChange={f('phone')} />
        <InputField label="Start Date" type="date" value={form.joinDate} onChange={f('joinDate')} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Department</label>
          <input type="text" value={form.department} onChange={e => f('department')(e.target.value)}
            list="onb-dept-list" placeholder="Select or type…" className="input w-full" />
          <datalist id="onb-dept-list">
            {activeDepts.map(d => <option key={d} value={d} />)}
          </datalist>
        </div>
        <div>
          <label className="label">Job Title / Role</label>
          <input type="text" value={form.role} onChange={e => f('role')(e.target.value)}
            list="onb-role-list" placeholder="e.g. Frontend Engineer"
            className={`input ${errors.role ? 'border-danger-500' : ''}`} />
          <datalist id="onb-role-list">
            {ROLES_SUGGESTIONS.map(r => <option key={r} value={r} />)}
          </datalist>
          {errors.role && <p className="text-xs text-danger-600 mt-1">{errors.role}</p>}
        </div>
      </div>

      {/* Employee ID */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="label mb-0">Employee ID</label>
          <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: '#f1f5f9' }}>
            {[['manual', <PenLine size={10} />, 'Enter manually'], ['auto', <Wand2 size={10} />, 'Auto-generate']].map(([mode, icon, label]) => (
              <button key={mode} type="button" onClick={() => handleModeSwitch(mode)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-all"
                style={{
                  background: idMode === mode ? '#ffffff' : 'transparent',
                  color: idMode === mode ? '#6366f1' : '#94a3b8',
                  boxShadow: idMode === mode ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >{icon} {label}</button>
            ))}
          </div>
        </div>
        {idMode === 'auto' ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center px-3.5 py-2.5 rounded-xl border font-mono text-sm"
              style={{ background: '#f8fafc', border: `1px solid ${errors.employeeCode ? '#f87171' : '#e2e8f0'}`, color: '#6366f1', letterSpacing: '0.05em' }}>
              <span className="flex-1">{form.employeeCode}</span>
              <span className="text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded-md ml-2"
                style={{ background: 'rgba(99,102,241,0.08)', color: '#818cf8' }}>AUTO</span>
            </div>
            <button type="button" onClick={regenerate} title="Generate new ID"
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-brand-50 shrink-0"
              style={{ border: '1px solid #e2e8f0', color: '#6366f1' }}>
              <RefreshCw size={14} />
            </button>
          </div>
        ) : (
          <div>
            <input type="text" value={form.employeeCode}
              onChange={e => f('employeeCode')(e.target.value.toUpperCase())}
              placeholder="e.g. HR-001, TECH-SANTOS" autoFocus maxLength={20}
              className={`input font-mono uppercase ${errors.employeeCode ? 'border-danger-500' : ''}`} />
            <p className="text-xs text-ink-400 mt-1">Letters & numbers only · max 20 chars · stored uppercase</p>
          </div>
        )}
        {errors.employeeCode && <p className="text-xs text-danger-600 mt-1">{errors.employeeCode}</p>}
      </div>

      {seatsAvailable === 0 ? (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-warning-50 border border-warning-200 text-xs text-warning-700">
          <AlertCircle size={13} /> You've reached the seat limit for {currentPlan?.name}. Upgrade to add more employees.
        </div>
      ) : (
        <button onClick={handleAdd} className="btn-primary w-full justify-center">
          <UserPlus size={14} /> Add Employee
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main OnboardingPage
───────────────────────────────────────────── */
export default function OnboardingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const { commitLogin, authReady } = useAuth();
  const {
    subscription, loading, currentPlan, seatsUsed, seatsAvailable,
    enrollEmployee, removeEmployee, completeOnboarding, refreshSubscription,
  } = useSubscription();
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [readyPromise, setReadyPromise] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [csvErrors, setCsvErrors] = useState([]);
  const [csvImporting, setCsvImporting] = useState(false);
  // 'confirming' while we're polling Supabase for the webhook's write,
  // 'timeout' if it never lands in time — see the effect below.
  const [paymentCheck, setPaymentCheck] = useState(null);
  const isTrialPlan = subscription?.planId === 'free_trial';

  // How many times / how often to poll `subscriptions.status` before
  // showing the "still waiting" card below. This is intentionally short —
  // it's just when we switch from a full-screen spinner to the reassuring
  // "still confirming" message, NOT a hard giveup. See the auto-retry
  // effect below: PayMongo's webhook delivery can legitimately land after
  // this window (a few seconds to over a minute in test mode), and without
  // it retrying itself, this screen just sat there until the person noticed
  // and clicked "Check again" — which from the outside looked identical to
  // "returned from checkout and just got stuck on /onboard".
  const PAYMENT_POLL_INTERVAL_MS = 1500;
  const PAYMENT_POLL_MAX_ATTEMPTS = 10; // ~15s of the full-screen spinner
  const AUTO_RETRY_INTERVAL_MS = 5000; // background retry cadence once we're on the "still confirming" card

  // Polls Supabase directly for the subscription actually being flipped to
  // "active", instead of trusting ?checkout=success on its own. PayMongo's
  // hosted Checkout page sends the browser back here as soon as the *card*
  // succeeds, but the write that matters (paymongo-webhook flipping
  // `status` to "active") happens asynchronously, on PayMongo's own
  // schedule, and can lag behind that redirect by a few seconds — or never
  // arrive at all if the webhook is misconfigured or the call fails.
  // Previously this effect completed onboarding the instant the query param
  // showed up, so a slow/failed webhook meant the admin got dropped onto a
  // subscription that PrivateRoute still saw as unpaid/trialing (or that
  // just never left the loading state), which is what looked like the page
  // "reloading"/getting stuck after returning from checkout.
  async function confirmPaymentAndFinish(subscriptionId) {
    setSaving(true);
    setPaymentCheck('confirming');

    let confirmed = false;
    let fresh = null;
    for (let attempt = 0; attempt < PAYMENT_POLL_MAX_ATTEMPTS; attempt++) {
      cacheInvalidate(`subscription:${subscriptionId}`);
      fresh = await getSubscription(subscriptionId);
      if (fresh?.status === 'active') { confirmed = true; break; }
      await new Promise(r => setTimeout(r, PAYMENT_POLL_INTERVAL_MS));
    }

    if (!confirmed) {
      setSaving(false);
      setPaymentCheck('timeout');
      toast('Still confirming your payment with PayMongo — this can take a moment.', 'info');
      return;
    }

    setPaymentCheck(null);
    try {
      // IMPORTANT: pull the webhook's write (status: "active", the rolled
      // billing.nextBillingDate, paymongo_payment_id) into local state
      // *before* completeOnboarding() runs. completeOnboarding() persists
      // via update(), which patches onboardingComplete onto whatever
      // subRef.current currently holds and writes the *entire* row back —
      // and subRef.current at this point is still the snapshot fetched when
      // this page first loaded, from before the checkout redirect (still
      // showing the pre-payment status). Skipping this refresh meant that
      // write silently clobbered the webhook's activation with stale data
      // immediately after confirming it, which is what looked like "payment
      // succeeds, status briefly shows active, then the admin gets bounced
      // back to /onboard" (PrivateRoute/PublicRoute both send anyone with
      // onboardingComplete === false back there).
      await refreshSubscription();
      await completeOnboarding();
    } catch (err) {
      // Don't pretend this succeeded — completeOnboarding() failing here
      // means onboarding_complete never got flipped to true in Supabase, so
      // sending the user into the dashboard transition anyway just means
      // PrivateRoute bounces them straight back to /onboard on the very
      // next render. Surface it and let them retry instead.
      console.warn('[Onboarding] completeOnboarding failed:', err.message);
      setSaving(false);
      setPaymentCheck('timeout');
      toast('Payment confirmed, but we couldn\'t finish setting up your workspace. Please try again.', 'error');
      return;
    }
    setSaving(false);
    toast('Payment confirmed! Taking you to your dashboard.', 'success');
    setReadyPromise(Promise.resolve(fresh));
    setTransitioning(true);
  }

  // ── Return trip from PayMongo Checkout ──────────────────────────────────
  // Paid plans redirect the browser away to PayMongo's hosted Checkout page
  // at "Finish setup" (see handleFinish below) and PayMongo brings it back
  // here with ?checkout=success or ?checkout=cancelled (see paymongo.js).
  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (!checkout || !subscription) return;

    if (checkout === 'success') {
      confirmPaymentAndFinish(subscription.subscriptionId);
    } else if (checkout === 'cancelled') {
      toast('Checkout was cancelled — you can finish setup whenever you\'re ready.', 'info');
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('checkout');
        return next;
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, subscription?.subscriptionId]);

  // Keep retrying quietly in the background while the "still confirming"
  // card is up, instead of leaving it to a manual "Check again" click.
  useEffect(() => {
    if (paymentCheck !== 'timeout' || !subscription?.subscriptionId) return;
    const timer = setTimeout(() => {
      confirmPaymentAndFinish(subscription.subscriptionId);
    }, AUTO_RETRY_INTERVAL_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentCheck, subscription?.subscriptionId]);

  // Commit the pending login from registerCompanyAdmin() as soon as we land
  // here. Without this, `user` (and therefore `user.subscriptionId`) stays
  // unset for the entire onboarding page, since the SIGNED_IN listener in
  // AuthContext intentionally skips auto-setting `user` whenever a pending
  // login is queued (to avoid racing this exact flow). Calling commitLogin()
  // a second time at "Finish setup" is a harmless no-op since the ref is
  // cleared after the first call.
  useEffect(() => {
    commitLogin();
  }, [commitLogin]);

  useEffect(() => {
    // Without this, a hard page load (PayMongo Checkout does a full browser
    // redirect back here, not a client-side navigation) sees `user` still
    // `undefined` while the Supabase session is restoring. SubscriptionContext
    // has nothing to fetch yet, immediately reports loading=false/subscription=
    // null, and this effect used to fire right then — sending a perfectly
    // subscribed admin returning from a successful payment to /pricing before
    // their session (and therefore their subscription) ever got a chance to
    // load. Wait for auth to resolve first, same guard PrivateRoute already
    // uses for /app/*.
    if (!authReady) return;
    if (!loading && !subscription) navigate('/pricing');
  }, [subscription, loading, authReady, navigate]);

  useEffect(() => {
    if (subscription?.onboardingComplete) navigate('/app/dashboard', { replace: true });
  }, [subscription?.onboardingComplete, navigate]);

  if (!authReady || loading) return <LoadingScreen label="Setting up your workspace…" />;
  if (!subscription) return null;

  const enrolled = subscription.enrolledEmployees || [];
  const departments = subscription.departments || [];
  const existingCodes = enrolled.map(e => e.employeeCode);

  async function handleAdd(employee) {
    try {
      await enrollEmployee(employee);
      toast(`${[employee.firstName, employee.middleName, employee.lastName, employee.suffix].filter(Boolean).join(' ')} enrolled · ${employee.employeeCode}`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function handleRemove(id, name) {
    removeEmployee(id);
    toast(`${name} removed`, 'warning');
  }

  function handleCSVUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvErrors([]);
    setCsvImporting(true);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const { employees, errors } = parseCSV(ev.target.result);
      setCsvImporting(false);

      if (errors.length) {
        setCsvErrors(errors);
        if (employees.length === 0) return;
      }

      let added = 0;
      let skipped = 0;
      for (const emp of employees) {
        // Deduplicate by email or code
        const duplicate = enrolled.find(e => e.email === emp.email || (emp.employeeCode && e.employeeCode === emp.employeeCode));
        if (duplicate) { skipped++; continue; }
        if (seatsAvailable - added <= 0) { skipped++; continue; }
        try { await enrollEmployee(emp); added++; } catch { skipped++; }
      }

      toast(`${added} employee${added !== 1 ? 's' : ''} imported${skipped > 0 ? ` · ${skipped} skipped` : ''}`, added > 0 ? 'success' : 'warning');
    };
    reader.readAsText(file);
    e.target.value = ''; // reset so same file can be re-uploaded
  }

  async function handleFinish() {
    // Paid plans: send the browser to PayMongo's hosted Checkout page — that's
    // the one and only place a card gets entered. Onboarding isn't marked
    // complete here; it happens on the return trip (?checkout=success, above)
    // once PayMongo/the webhook have actually confirmed payment.
    if (!isTrialPlan) {
      setSaving(true);
      try {
        await startCheckout({
          subscriptionId: subscription.subscriptionId,
          planId: subscription.planId,
          planName: currentPlan?.name,
          amountPhp: (currentPlan?.price || 0) * Math.max(enrolled.length, 1),
          seats: Math.max(enrolled.length, 1),
          email: subscription.company?.adminEmail,
        });
        // startCheckout() redirects the browser on success — nothing left to do here.
      } catch (err) {
        setSaving(false);
        toast(err.message || 'Could not start checkout. Please try again.', 'error');
      }
      return;
    }

    // Trial plans: nothing to bill, so complete onboarding right away.
    setSaving(true);
    // Confirm the subscription row really exists in Supabase before we ever
    // navigate to the dashboard. Without this, ProtectedRoute's
    // getSubscription() call could race the original subscribe() write and
    // hit PGRST116 ("0 rows"), leaving the app stuck in a loading loop —
    // which is the exact bug this fixes.
    const confirmReady = getSubscription(subscription.subscriptionId);
    // Marks this subscription as done with onboarding so PrivateRoute no
    // longer bounces it back to /onboard on future visits to /app/*.
    try { await completeOnboarding(); } catch (err) { console.warn('[Onboarding] completeOnboarding failed:', err.message); }
    setSaving(false);
    toast(`Workspace ready! ${enrolled.length > 0 ? enrolled.length + ' employees enrolled. ' : ''}Taking you to your dashboard.`, 'success');
    setReadyPromise(confirmReady);
    setTransitioning(true);
  }

  if (transitioning) {
    return (
      <TransitionLoadingScreen
        label="Setting up your dashboard…"
        promise={readyPromise}
        onComplete={() => { commitLogin(); navigate('/app/dashboard'); }}
      />
    );
  }

  if (paymentCheck === 'confirming') {
    return <LoadingScreen label="Confirming your payment…" />;
  }

  if (paymentCheck === 'timeout') {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center px-4">
        <div className="card p-6 max-w-sm w-full text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-warning-50 flex items-center justify-center mx-auto">
            <AlertCircle size={20} className="text-warning-600" />
          </div>
          <p className="text-sm font-semibold text-ink-900">Still confirming your payment</p>
          <p className="text-sm text-ink-400">
            Your card was charged, but we're still waiting on PayMongo to confirm it on our end.
            This is usually quick — you can check again in a moment.
          </p>
          <button
            onClick={() => confirmPaymentAndFinish(subscription.subscriptionId)}
            disabled={saving}
            className="btn-primary w-full justify-center"
          >
            {saving ? <Spinner size={13} /> : 'Check again'}
          </button>
        </div>
      </div>
    );
  }

  const maxSeats = currentPlan?.maxSeats === Infinity ? '∞' : currentPlan?.maxSeats;

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-surface-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="ERJ" className="w-9 h-9 object-contain" />
          <span className="font-bold text-ink-900 text-sm">ERJ</span>
          <span className="text-ink-300 text-xs ml-2">/ Workspace setup</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-ink-400">
            <span className="font-semibold text-ink-900">{seatsUsed}</span> / {maxSeats} seats used
          </div>
          <div className="w-24 bg-surface-200 rounded-full h-1.5">
            <div className="bg-brand-600 h-1.5 rounded-full transition-all"
              style={{ width: currentPlan?.maxSeats === Infinity ? '10%' : `${(seatsUsed / currentPlan?.maxSeats) * 100}%` }} />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8 grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Left — forms */}
        <div className="lg:col-span-2 space-y-4">
          {/* Welcome card */}
          <div className="card p-5 bg-gradient-to-br from-brand-600 to-brand-700 border-0 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Check size={16} className="text-brand-200" />
              <p className="text-sm font-semibold text-brand-100">Subscription active</p>
            </div>
            <p className="font-bold text-lg leading-snug">{subscription.company.name}</p>
            <p className="text-brand-200 text-xs mt-0.5">{currentPlan?.name} plan · 14-day trial</p>
            <div className="mt-3 pt-3 border-t border-white/20 text-xs text-brand-100 space-y-1">
              <p>✓ Admin: {subscription.company.adminName}</p>
              <p>✓ {subscription.company.industry} · {subscription.company.size} employees</p>
            </div>
          </div>

          {/* Employee form */}
          <EmployeeForm
            onAdd={handleAdd}
            seatsAvailable={seatsAvailable}
            currentPlan={currentPlan}
            existingCodes={existingCodes}
            departments={departments}
          />

          {/* Bulk import */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink-600 flex items-center gap-1.5">
                <Upload size={12} /> Bulk import via CSV
              </p>
              <button
                onClick={downloadCSVTemplate}
                className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                <Download size={11} /> Download template
              </button>
            </div>

            {/* Column reference */}
            <div className="rounded-lg bg-surface-50 border border-surface-200 p-3 space-y-1.5">
              <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide">Required columns</p>
              <div className="flex flex-wrap gap-1">
                {['firstName', 'lastName', 'email'].map(c => (
                  <code key={c} className="text-[11px] px-1.5 py-0.5 rounded bg-danger-50 text-danger-600 font-mono">{c}</code>
                ))}
              </div>
              <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mt-2">Optional columns</p>
              <div className="flex flex-wrap gap-1">
                {['middleName', 'suffix', 'phone', 'role', 'department', 'employeeCode'].map(c => (
                  <code key={c} className="text-[11px] px-1.5 py-0.5 rounded bg-surface-100 text-ink-500 font-mono">{c}</code>
                ))}
              </div>
              <p className="text-[10px] text-ink-400 mt-1">employeeCode auto-generated if blank</p>
            </div>

            {/* Upload button */}
            <label className="btn-secondary w-full justify-center text-xs cursor-pointer">
              <Upload size={13} />
              {csvImporting ? 'Importing…' : 'Upload CSV file'}
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleCSVUpload} disabled={csvImporting} />
            </label>

            {/* CSV errors */}
            {csvErrors.length > 0 && (
              <div className="rounded-lg bg-warning-50 border border-warning-200 p-3 space-y-1">
                <p className="text-xs font-semibold text-warning-700">Import warnings</p>
                {csvErrors.map((err, i) => (
                  <p key={i} className="text-xs text-warning-600">{err}</p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right — enrolled list */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-ink-900">Enrolled Employees</h2>
              <p className="text-sm text-ink-400 mt-0.5">
                {enrolled.length === 0
                  ? 'Add employees on the left to get started'
                  : `${enrolled.length} employee${enrolled.length === 1 ? '' : 's'} enrolled`}
              </p>
            </div>
            {enrolled.length > 0 && (
              <button onClick={handleFinish} disabled={saving} className="btn-primary btn-sm">
                {saving ? <Spinner size={13} /> : <>Finish setup <ArrowRight size={13} /></>}
              </button>
            )}
          </div>

          {enrolled.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-surface-100 flex items-center justify-center mb-3">
                <Users size={24} className="text-ink-300" />
              </div>
              <p className="text-sm font-semibold text-ink-700 mb-1">No employees yet</p>
              <p className="text-sm text-ink-400 max-w-xs">Fill in the form on the left to enroll your first employee. You can add or remove employees any time from the dashboard.</p>
            </div>
          ) : (
            <div className="card divide-y divide-surface-100 overflow-hidden">
              {enrolled.map((emp) => (
                <div key={emp.id}>
                  <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-50 cursor-pointer"
                    onClick={() => setExpanded(expanded === emp.id ? null : emp.id)}>
                    <Avatar name={`${emp.firstName} ${emp.lastName}`} color={emp.avatarColor} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink-800">
                      {[emp.firstName, emp.middleName, emp.lastName, emp.suffix].filter(Boolean).join(' ')}
                    </p>
                      <p className="text-sm text-ink-400 truncate">{emp.role || '—'} · {emp.department || '—'}</p>
                    </div>
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md shrink-0"
                      style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1', letterSpacing: '0.04em' }}>
                      {emp.employeeCode}
                    </span>
                    <button onClick={e => { e.stopPropagation(); handleRemove(emp.id, [emp.firstName, emp.middleName, emp.lastName, emp.suffix].filter(Boolean).join(' ')); }}
                      className="p-1.5 rounded-lg text-ink-300 hover:text-danger-500 hover:bg-danger-50 transition-colors ml-1">
                      <Trash2 size={12} />
                    </button>
                    {expanded === emp.id ? <ChevronUp size={13} className="text-ink-300" /> : <ChevronDown size={13} className="text-ink-300" />}
                  </div>

                  {expanded === emp.id && (
                    <div className="px-5 pb-4 bg-surface-50 grid grid-cols-2 gap-2 text-sm">
                      {[
                        { l: 'Employee ID', v: emp.employeeCode },
                        { l: 'First Name', v: emp.firstName },
                        { l: 'Middle Name', v: emp.middleName || '—' },
                        { l: 'Last Name', v: emp.lastName },
                        { l: 'Suffix', v: emp.suffix || '—' },
                        { l: 'Email', v: emp.email },
                        { l: 'Phone', v: emp.phone || '—' },
                        { l: 'Start Date', v: emp.joinDate },
                        { l: 'Department', v: emp.department || '—' },
                        { l: 'Role', v: emp.role || '—' },
                      ].map(({ l, v }) => (
                        <div key={l}>
                          <p className="text-ink-400 font-medium text-xs">{l}</p>
                          <p className={`text-ink-700 font-semibold text-sm ${l === 'Employee ID' ? 'font-mono' : ''}`}>{v}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {enrolled.length > 0 && (
            <div className="mt-4 flex items-center justify-between text-xs text-ink-400">
              <span>You can always add more employees from the Employees page.</span>
              <button onClick={handleFinish} disabled={saving} className="btn-primary btn-sm">
                {saving ? <Spinner size={13} /> : <>Go to dashboard <ArrowRight size={13} /></>}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}