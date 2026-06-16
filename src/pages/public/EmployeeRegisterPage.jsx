import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Wand2, PenLine, RefreshCw, UserCheck, Eye, EyeOff } from 'lucide-react';
import { useSubscription } from '../../context/SubscriptionContext';

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
  const [showPw, setShowPw] = useState(false);
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
    username: '',
    password: '',
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
    if (!form.email.includes('@')) e.email  = 'Valid email required';
    if (!form.role.trim()) e.role = 'Required';
    if (!form.username.trim()) e.username = 'Required';
    if (form.username.trim().length < 4) e.username = 'Min 4 characters';
    if (!/^[a-z0-9._-]+$/i.test(form.username.trim())) e.username = 'Letters, numbers, . _ - only';
    if (!form.password.trim()) e.password = 'Required';
    if (form.password.trim().length < 6) e.password = 'Min 6 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    submitRegistration(subscription?.subscriptionId, {
      ...form,
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

          {/* ── Mobile App Credentials ── */}
          <div className="pt-2 border-t border-surface-200">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-md bg-indigo-50 flex items-center justify-center shrink-0">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">Mobile App Login</p>
                <p className="text-[10px] text-slate-400">You'll use these to clock in on the mobile app</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Username <span className="text-danger-500">*</span></label>
                <input
                  type="text"
                  value={form.username}
                  onChange={e => f('username')(e.target.value.toLowerCase().replace(/\s/g, ''))}
                  placeholder="e.g. m.santos"
                  autoComplete="off"
                  className={`input w-full font-mono ${errors.username ? 'border-danger-500' : ''}`}
                />
                {errors.username
                  ? <p className="text-xs text-danger-600 mt-1">{errors.username}</p>
                  : <p className="text-[10px] text-ink-400 mt-1">Lowercase, no spaces</p>
                }
              </div>
              <div>
                <label className="label">Password <span className="text-danger-500">*</span></label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => f('password')(e.target.value)}
                    placeholder="Min 6 characters"
                    autoComplete="new-password"
                    className={`input w-full pr-9 ${errors.password ? 'border-danger-500' : ''}`}
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                    {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                {errors.password
                  ? <p className="text-xs text-danger-600 mt-1">{errors.password}</p>
                  : form.password && (
                    <div className="flex gap-1 mt-1.5">
                      {[1,2,3,4].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all ${
                          form.password.length >= i * 3
                            ? i <= 1 ? 'bg-red-400' : i <= 2 ? 'bg-amber-400' : i <= 3 ? 'bg-blue-400' : 'bg-emerald-400'
                            : 'bg-slate-200'
                        }`} />
                      ))}
                    </div>
                  )
                }
              </div>
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
