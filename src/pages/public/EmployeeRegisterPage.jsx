import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Wand2, PenLine, RefreshCw, UserCheck } from 'lucide-react';
import { useSubscription } from '../../context/SubscriptionContext';
import PasswordStrengthField, { isPasswordStrong } from '../../components/PasswordStrengthField';

/* ── Phone helpers (mirrors EmployeesPage) ── */
function toLocalPhone(full) {
  if (!full) return '';
  const digits = full.replace(/^\+63/, '').replace(/\D/g, '');
  return digits.slice(0, 10);
}
function toFullPhone(local) {
  const digits = local.replace(/\D/g, '').slice(0, 10);
  return digits ? `+63${digits}` : '';
}
function PhoneField({ value, onChange }) {
  const local = toLocalPhone(value);
  function handleChange(e) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 10);
    onChange(toFullPhone(raw));
  }
  return (
    <div>
      <label className="label">Phone <span className="text-ink-400 font-normal">(optional)</span></label>
      <div className="flex items-stretch rounded-xl border border-surface-300 overflow-hidden focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 transition-all" style={{ background: '#fff' }}>
        <span className="flex items-center px-3 text-sm font-semibold text-ink-500 bg-surface-50 border-r border-surface-200 select-none shrink-0">+63</span>
        <input type="tel" inputMode="numeric" value={local} onChange={handleChange}
          placeholder="9xx xxx xxxx" maxLength={10}
          className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none text-ink-800 placeholder-ink-300" />
      </div>
    </div>
  );
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `ERJ-${rand}${String(Date.now()).slice(-3)}`;
}

const ROLES_SUGGESTIONS = ['Manager','Team Lead','Senior Engineer','Engineer','Analyst','Specialist','Associate','Coordinator'];

export default function EmployeeRegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { subscription, submitRegistration } = useSubscription();

  const DEPARTMENTS = subscription?.departments || [];
  const SHIFTS      = subscription?.shifts || [];

  const [submitted, setSubmitted] = useState(false);
  const [idMode, setIdMode] = useState('manual');
  const [errors, setErrors] = useState({});
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    email: '',
    phone: '',
    role: '',
    department: DEPARTMENTS[0] || '',
    joinDate: new Date().toISOString().split('T')[0],
    shiftId: '',
    employeeCode: '',
    notes: '',
    password: '',
    confirmPassword: '',
  });

  const f = (k) => (v) => setForm(prev => ({ ...prev, [k]: v }));

  function handleModeSwitch(mode) {
    setIdMode(mode);
    setForm(p => ({ ...p, employeeCode: mode === 'auto' ? generateCode() : '' }));
    setErrors(e => ({ ...e, employeeCode: undefined }));
  }

  function regenerate() {
    setForm(p => ({ ...p, employeeCode: generateCode() }));
  }

  function validate() {
    const e = {};
    if (!form.firstName.trim()) e.firstName = 'Required';
    if (!form.lastName.trim())  e.lastName  = 'Required';
    if (!form.email.trim() || !form.email.includes('@')) e.email = 'Valid email required';
    if (!form.role.trim()) e.role = 'Required';
    if (!form.password.trim()) e.password = 'Required';
    else if (!isPasswordStrong(form.password)) e.password = 'Password does not meet all requirements';
    if (!form.confirmPassword.trim()) e.confirmPassword = 'Required';
    if (form.password && form.confirmPassword && form.password !== form.confirmPassword) {
      e.confirmPassword = 'Passwords do not match';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const subId = searchParams.get('sub') || subscription?.subscriptionId;
    // Derive a username from the email local part (before @)
    const derivedUsername = form.email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
    const { confirmPassword: _cp, ...formWithoutConfirm } = form;
    submitRegistration(subId, {
      ...formWithoutConfirm,
      username: derivedUsername,
      employeeCode: form.employeeCode.trim().toUpperCase(),
    });
    setSubmitted(true);
  }

  /* ── Success state ── */
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6"
        style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)' }}>
        <div className="card max-w-md w-full p-10 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-success-50 flex items-center justify-center">
            <CheckCircle size={32} className="text-success-500" />
          </div>
          <h2 className="text-xl font-bold text-ink-900">Registration Submitted!</h2>
          <p className="text-sm text-ink-500 leading-relaxed">
            Your information has been sent to the HR team for review. You'll be notified once your account is approved.
          </p>
          <button className="btn-secondary btn-sm mt-2" onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-start justify-center p-6 pt-10"
      style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)' }}>
      <div className="w-full max-w-xl space-y-6">

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-600 mb-4">
            <UserCheck size={22} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-ink-900">Employee Registration</h1>
          <p className="text-sm text-ink-400 mt-1">Fill in your details — HR will review and confirm your enrollment.</p>
        </div>

        <div className="card p-6 space-y-4">

          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First Name <span className="text-danger-500">*</span></label>
              <input type="text" value={form.firstName} onChange={e => f('firstName')(e.target.value)}
                placeholder="Maria"
                className={`input w-full ${errors.firstName ? 'border-danger-500' : ''}`} />
              {errors.firstName && <p className="text-xs text-danger-600 mt-1">{errors.firstName}</p>}
            </div>
            <div>
              <label className="label">Last Name <span className="text-danger-500">*</span></label>
              <input type="text" value={form.lastName} onChange={e => f('lastName')(e.target.value)}
                placeholder="Santos"
                className={`input w-full ${errors.lastName ? 'border-danger-500' : ''}`} />
              {errors.lastName && <p className="text-xs text-danger-600 mt-1">{errors.lastName}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Middle Name <span className="text-ink-400 font-normal">(optional)</span></label>
              <input type="text" value={form.middleName} onChange={e => f('middleName')(e.target.value)}
                placeholder="Cristina" className="input w-full" />
            </div>
            <div>
              <label className="label">Suffix <span className="text-ink-400 font-normal">(optional)</span></label>
              <input type="text" value={form.suffix} onChange={e => f('suffix')(e.target.value)}
                placeholder="Jr., Sr., III…" className="input w-full" />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="label">Work Email <span className="text-danger-500">*</span></label>
            <input type="email" value={form.email} onChange={e => f('email')(e.target.value)}
              placeholder="m.santos@company.com"
              className={`input w-full ${errors.email ? 'border-danger-500' : ''}`} />
            {errors.email && <p className="text-xs text-danger-600 mt-1">{errors.email}</p>}
          </div>

          {/* Phone + Start Date */}
          <div className="grid grid-cols-2 gap-3">
            <PhoneField value={form.phone} onChange={f('phone')} />
            <div>
              <label className="label">Preferred Start Date</label>
              <input type="date" value={form.joinDate} onChange={e => f('joinDate')(e.target.value)}
                className="input w-full" />
            </div>
          </div>

          {/* Department + Role */}
          <div className="grid grid-cols-2 gap-3">
            {DEPARTMENTS.length > 0 ? (
              <div>
                <label className="label">Department</label>
                <input type="text" value={form.department} onChange={e => f('department')(e.target.value)}
                  list="reg-dept-list" placeholder="Select or type…" className="input w-full" />
                <datalist id="reg-dept-list">
                  {DEPARTMENTS.map(d => <option key={d} value={d} />)}
                </datalist>
              </div>
            ) : (
              <div>
                <label className="label">Department <span className="text-ink-400 font-normal">(optional)</span></label>
                <input type="text" value={form.department} onChange={e => f('department')(e.target.value)}
                  placeholder="e.g. Engineering" className="input w-full" />
              </div>
            )}

            <div>
              <label className="label">Job Title / Role <span className="text-danger-500">*</span></label>
              <input type="text" value={form.role} onChange={e => f('role')(e.target.value)}
                list="reg-role-list" placeholder="e.g. Engineer"
                className={`input w-full ${errors.role ? 'border-danger-500' : ''}`} />
              <datalist id="reg-role-list">
                {ROLES_SUGGESTIONS.map(r => <option key={r} value={r} />)}
              </datalist>
              {errors.role && <p className="text-xs text-danger-600 mt-1">{errors.role}</p>}
            </div>
          </div>

          {/* Shift (optional) */}
          {SHIFTS.length > 0 && (
            <div>
              <label className="label">Preferred Shift <span className="text-ink-400 font-normal">(optional)</span></label>
              <select value={form.shiftId} onChange={e => f('shiftId')(e.target.value)} className="input w-full">
                <option value="">No preference</option>
                {SHIFTS.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.start} – {s.end})</option>
                ))}
              </select>
            </div>
          )}

          {/* Employee ID (optional) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Employee ID <span className="text-ink-400 font-normal">(optional)</span></label>
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-surface-100">
                {[['manual', <PenLine size={10} />, 'Enter'], ['auto', <Wand2 size={10} />, 'Auto']].map(([mode, icon, label]) => (
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
                  style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#6366f1', letterSpacing: '0.05em' }}>
                  <span className="flex-1">{form.employeeCode || <span className="text-ink-300">Click refresh to generate</span>}</span>
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
                  placeholder="e.g. HR-001, TECH-SANTOS" maxLength={20}
                  className="input font-mono uppercase w-full" />
                <p className="text-xs text-ink-400 mt-1">Leave blank — HR will assign one if not provided.</p>
              </div>
            )}
          </div>

          {/* ── Account Password ── */}
          <div className="pt-2 border-t border-surface-200">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-md bg-indigo-50 flex items-center justify-center shrink-0">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">Mobile App Login</p>
                <p className="text-[10px] text-slate-400">You'll use your work email and this password to clock in</p>
              </div>
            </div>

            {/* Read-only login email hint */}
            <div className="mb-3">
              <label className="label">Login Email</label>
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-sm"
                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,12 2,6"/></svg>
                <span className={form.email.includes('@') ? 'text-ink-800' : 'text-ink-300 italic'}>
                  {form.email.includes('@') ? form.email : 'Fill in your Work Email above first'}
                </span>
              </div>
              <p className="text-[10px] text-ink-400 mt-1">Your work email is your login — no separate username needed.</p>
            </div>

            {/* Password with strength checker */}
            <PasswordStrengthField
              value={form.password}
              onChange={v => f('password')(v)}
              error={errors.password}
              label="Password"
              placeholder="Create a strong password"
              className="mb-3"
            />

            {/* Confirm Password */}
            <div>
              <label className="label">Confirm Password <span className="text-danger-500">*</span></label>
              <div className="relative">
                <input
                  type={showConfirmPw ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={e => f('confirmPassword')(e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  className={`input w-full pr-9 ${errors.confirmPassword ? 'border-danger-500' : ''}`}
                />
                <button type="button" onClick={() => setShowConfirmPw(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  {showConfirmPw
                    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
              {errors.confirmPassword
                ? <p className="text-xs text-danger-600 mt-1">{errors.confirmPassword}</p>
                : form.confirmPassword && form.password === form.confirmPassword && (
                  <p className="text-[10px] text-emerald-500 mt-1 flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Passwords match
                  </p>
                )
              }
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="label">Additional Notes <span className="text-ink-400 font-normal">(optional)</span></label>
            <textarea value={form.notes} onChange={e => f('notes')(e.target.value)}
              placeholder="Any additional information for HR…"
              rows={3}
              className="input w-full resize-none" />
          </div>

          <button className="btn-primary w-full" onClick={handleSubmit}>
            Submit Registration
          </button>
          <p className="text-xs text-center text-ink-400">
            Your request will be reviewed by HR before you are officially enrolled.
          </p>
        </div>
      </div>
    </div>
  );
}