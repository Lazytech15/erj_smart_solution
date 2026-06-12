import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, UserPlus, Check, ArrowRight, Upload,
  Trash2, ChevronDown, ChevronUp, AlertCircle, RefreshCw, PenLine, Wand2, Download
} from 'lucide-react';
import { useSubscription } from '../../context/SubscriptionContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { InputField, Avatar, Spinner } from '../../components/ui';
import LoadingScreen from '../../components/LoadingScreen';
import TransitionLoadingScreen from '../../components/TransitionLoadingScreen';

const DEPARTMENTS_SUGGESTIONS = [
  'Engineering', 'Human Resources', 'Finance', 'Operations',
  'Marketing', 'Sales', 'Customer Support', 'Legal', 'IT', 'Procurement',
];
const ROLES_SUGGESTIONS = [
  'Manager', 'Team Lead', 'Senior Engineer', 'Engineer',
  'Analyst', 'Specialist', 'Associate', 'Coordinator',
];

/* ── Unique ID generator ── */
function generateEmployeeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const tail = String(Date.now()).slice(-3);
  return `ERJ-${rand}${tail}`;
}

/* ── CSV template download ── */
function downloadCSVTemplate() {
  const headers = ['firstName', 'middleName', 'lastName', 'suffix', 'email', 'phone', 'role', 'department', 'employeeCode'];
  const examples = [
    ['Maria', 'Cristina', 'Santos', '', 'm.santos@company.com', '+639123456789', 'Engineer', 'Engineering', 'ERJ-SAMPLE1'],
    ['Jose', '', 'Reyes', 'Jr.', 'j.reyes@company.com', '+639179876543', 'Team Lead', 'Operations', ''],
  ];
  const rows = [headers, ...examples].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'employee_import_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Parse uploaded CSV ── */
function parseCSV(text) {
  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return { employees: [], errors: ['CSV has no data rows.'] };

  // Strip BOM and normalize quotes
  const clean = s => s.replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim();

  const headers = lines[0].split(',').map(clean).map(h => h.toLowerCase());
  const required = ['firstname', 'lastname', 'email'];
  const missing = required.filter(r => !headers.includes(r));
  if (missing.length) return { employees: [], errors: [`Missing required columns: ${missing.join(', ')}. Download the template to see the correct format.`] };

  const employees = [];
  const errors = [];

  lines.slice(1).forEach((line, i) => {
    const row = line.split(',').map(clean);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] || ''; });

    const rowNum = i + 2;
    if (!obj.firstname) { errors.push(`Row ${rowNum}: First name is required`); return; }
    if (!obj.lastname) { errors.push(`Row ${rowNum}: Last name is required`); return; }
    if (!obj.email?.includes('@')) { errors.push(`Row ${rowNum}: Valid email required`); return; }

    employees.push({
      firstName: obj.firstname,
      middleName: obj.middlename || '',
      lastName: obj.lastname,
      suffix: obj.suffix || '',
      email: obj.email,
      phone: obj.phone || '',
      role: obj.role || '',
      department: obj.department || '',
      joinDate: obj.joindate || new Date().toISOString().split('T')[0],
      employeeCode: obj.employeecode?.toUpperCase() || generateEmployeeCode(),
    });
  });

  return { employees, errors };
}

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
  const activeDepts = departments.length > 0 ? departments : DEPARTMENTS_SUGGESTIONS;
  const [form, setForm] = useState({
    firstName: '', middleName: '', lastName: '', suffix: '', email: '', phone: '',
    role: '', department: '',
    joinDate: new Date().toISOString().split('T')[0],
    employeeCode: '',
  });
  const [idMode, setIdMode] = useState('manual');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (departments.length > 0 && !form.department) {
      setForm(p => ({ ...p, department: departments[0] }));
    }
  }, [departments]);

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
    setForm({
      firstName: '', middleName: '', lastName: '', suffix: '', email: '', phone: '',
      role: '', department: activeDepts[0] || '',
      joinDate: new Date().toISOString().split('T')[0],
      employeeCode: '',
    });
    setIdMode('manual');
    setErrors({});
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <UserPlus size={15} className="text-brand-600" />
        <p className="text-sm font-semibold text-ink-900">Add an employee</p>
      </div>

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
  const toast = useToast();
  const { commitLogin } = useAuth();
  const {
    subscription, loading, currentPlan, seatsUsed, seatsAvailable,
    enrollEmployee, removeEmployee,
  } = useSubscription();
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [csvErrors, setCsvErrors] = useState([]);
  const [csvImporting, setCsvImporting] = useState(false);

  useEffect(() => {
    if (!loading && !subscription) navigate('/pricing');
  }, [subscription, loading, navigate]);

  if (loading) return <LoadingScreen label="Setting up your workspace…" />;
  if (!subscription) return null;

  const enrolled = subscription.enrolledEmployees || [];
  const departments = subscription.departments || [];
  const existingCodes = enrolled.map(e => e.employeeCode);

  function handleAdd(employee) {
    try {
      enrollEmployee(employee);
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
    reader.onload = (ev) => {
      const { employees, errors } = parseCSV(ev.target.result);
      setCsvImporting(false);

      if (errors.length) {
        setCsvErrors(errors);
        if (employees.length === 0) return;
      }

      let added = 0;
      let skipped = 0;
      employees.forEach(emp => {
        // Deduplicate by email or code
        const duplicate = enrolled.find(e => e.email === emp.email || (emp.employeeCode && e.employeeCode === emp.employeeCode));
        if (duplicate) { skipped++; return; }
        if (seatsAvailable - added <= 0) { skipped++; return; }
        try { enrollEmployee(emp); added++; } catch { skipped++; }
      });

      toast(`${added} employee${added !== 1 ? 's' : ''} imported${skipped > 0 ? ` · ${skipped} skipped` : ''}`, added > 0 ? 'success' : 'warning');
    };
    reader.readAsText(file);
    e.target.value = ''; // reset so same file can be re-uploaded
  }

  async function handleFinish() {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    setSaving(false);
    toast(`Workspace ready! ${enrolled.length > 0 ? enrolled.length + ' employees enrolled. ' : ''}Taking you to your dashboard.`, 'success');
    setTransitioning(true);
  }

  if (transitioning) {
    return (
      <TransitionLoadingScreen
        label="Setting up your dashboard…"
        onComplete={() => { commitLogin(); navigate('/app/dashboard'); }}
      />
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