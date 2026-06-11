import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, UserPlus, Check, ArrowRight, Clock, Upload,
  Trash2, ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react';
import { useSubscription, PLANS } from '../../context/SubscriptionContext';
import { useToast } from '../../context/ToastContext';
import { InputField, SelectField, Avatar, Spinner } from '../../components/ui';

const DEPARTMENTS_DEFAULT = ['Engineering','Human Resources','Finance','Operations','Marketing','Sales','Customer Support'];
const ROLES_DEFAULT = ['Manager','Team Lead','Senior Engineer','Engineer','Analyst','Specialist','Associate','Coordinator'];

function EmployeeForm({ onAdd, seatsAvailable, currentPlan }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    role: '', department: 'Engineering', joinDate: new Date().toISOString().split('T')[0],
  });
  const [errors, setErrors] = useState({});
  const f = k => v => setForm(p => ({ ...p, [k]: v }));

  function validate() {
    const e = {};
    if (!form.firstName.trim()) e.firstName = 'Required';
    if (!form.lastName.trim()) e.lastName = 'Required';
    if (!form.email.includes('@')) e.email = 'Valid email required';
    if (!form.role.trim()) e.role = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleAdd() {
    if (!validate()) return;
    if (seatsAvailable === 0) return;
    onAdd(form);
    setForm({ firstName: '', lastName: '', email: '', phone: '', role: '', department: 'Engineering', joinDate: new Date().toISOString().split('T')[0] });
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
      <InputField label="Work Email" type="email" value={form.email} onChange={f('email')} placeholder="m.santos@company.com" error={errors.email} />
      <div className="grid grid-cols-2 gap-3">
        <InputField label="Phone" value={form.phone} onChange={f('phone')} placeholder="+63 9xx xxx xxxx" />
        <InputField label="Start Date" type="date" value={form.joinDate} onChange={f('joinDate')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Department" value={form.department} onChange={f('department')}
          options={DEPARTMENTS_DEFAULT.map(d => ({ value: d, label: d }))} />
        <div>
          <label className="label">Job Title / Role</label>
          <input
            type="text"
            value={form.role}
            onChange={e => f('role')(e.target.value)}
            placeholder="e.g. Frontend Engineer"
            list="roles-list"
            className={`input ${errors.role ? 'border-danger-500' : ''}`}
          />
          <datalist id="roles-list">
            {ROLES_DEFAULT.map(r => <option key={r} value={r} />)}
          </datalist>
          {errors.role && <p className="text-sm text-danger-600 mt-1">{errors.role}</p>}
        </div>
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

export default function OnboardingPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { subscription, currentPlan, seatsUsed, seatsAvailable, enrollEmployee, removeEmployee } = useSubscription();
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(null);

  if (!subscription) {
    navigate('/pricing');
    return null;
  }

  const enrolled = subscription.enrolledEmployees || [];

  function handleAdd(employee) {
    try {
      enrollEmployee(employee);
      toast(`${employee.firstName} ${employee.lastName} enrolled`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function handleRemove(id, name) {
    removeEmployee(id);
    toast(`${name} removed`, 'warning');
  }

  async function handleFinish() {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    toast(`Workspace ready! ${enrolled.length > 0 ? enrolled.length + ' employees enrolled. ' : ''}Taking you to your dashboard.`, 'success');
    navigate('/app/dashboard');
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
            <div
              className="bg-brand-600 h-1.5 rounded-full transition-all"
              style={{ width: currentPlan?.maxSeats === Infinity ? '10%' : `${(seatsUsed / currentPlan?.maxSeats) * 100}%` }}
            />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8 grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Left — form */}
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

          <EmployeeForm onAdd={handleAdd} seatsAvailable={seatsAvailable} currentPlan={currentPlan} />

          <div className="card p-4">
            <p className="text-sm font-semibold text-ink-600 mb-2 flex items-center gap-1.5"><Upload size={12} /> Bulk import</p>
            <p className="text-sm text-ink-400 mb-3">Upload a CSV with columns: firstName, lastName, email, phone, role, department, joinDate</p>
            <button
              onClick={() => toast('CSV import — connect to your backend parser', 'info')}
              className="btn-secondary w-full justify-center text-xs"
            >
              <Upload size={13} /> Upload CSV file
            </button>
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
              <button
                onClick={handleFinish}
                disabled={saving}
                className="btn-primary btn-sm"
              >
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
              {enrolled.map((emp, idx) => (
                <div key={emp.id}>
                  <div
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-50 cursor-pointer"
                    onClick={() => setExpanded(expanded === emp.id ? null : emp.id)}
                  >
                    <Avatar name={`${emp.firstName} ${emp.lastName}`} color={emp.avatarColor} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink-800">{emp.firstName} {emp.lastName}</p>
                      <p className="text-sm text-ink-400 truncate">{emp.role} · {emp.department}</p>
                    </div>
                    <span className="text-[10px] font-mono text-ink-300 shrink-0">{emp.employeeCode}</span>
                    <button
                      onClick={e => { e.stopPropagation(); handleRemove(emp.id, `${emp.firstName} ${emp.lastName}`); }}
                      className="p-1.5 rounded-lg text-ink-300 hover:text-danger-500 hover:bg-danger-50 transition-colors ml-1"
                    >
                      <Trash2 size={12} />
                    </button>
                    {expanded === emp.id ? <ChevronUp size={13} className="text-ink-300" /> : <ChevronDown size={13} className="text-ink-300" />}
                  </div>

                  {expanded === emp.id && (
                    <div className="px-5 pb-4 bg-surface-50 grid grid-cols-2 gap-2 text-sm">
                      {[
                        { l: 'Email', v: emp.email },
                        { l: 'Phone', v: emp.phone || '—' },
                        { l: 'Start Date', v: emp.joinDate },
                        { l: 'Department', v: emp.department },
                      ].map(({ l, v }) => (
                        <div key={l}>
                          <p className="text-ink-400 font-medium">{l}</p>
                          <p className="text-ink-700 font-semibold">{v}</p>
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
              <button
                onClick={handleFinish}
                disabled={saving}
                className="btn-primary btn-sm"
              >
                {saving ? <Spinner size={13} /> : <>Go to dashboard <ArrowRight size={13} /></>}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}