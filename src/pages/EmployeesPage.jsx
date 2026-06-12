import { useState, useMemo } from 'react';
import { UserPlus, Pencil, Trash2, Eye, ToggleLeft, ToggleRight, RefreshCw, Wand2, PenLine, BarChart2, Clock, CheckCircle, XCircle, AlertTriangle, TrendingUp } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';
import { fmt } from '../utils/dateTime';
import { Avatar, StatusBadge, SearchInput, SelectField, SectionHeader, EmptyState, Modal, InputField } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

export default function EmployeesPage() {
  const toast = useToast();
  const { can } = useAuth();
  const { subscription, enrollEmployee, removeEmployee, updateEmployee, seatsAvailable, currentPlan } = useSubscription();

  const EMPLOYEES = subscription?.enrolledEmployees || [];
  const DEPARTMENTS = subscription?.departments || [];
  const SHIFTS = subscription?.shifts || [];
  const ATTENDANCE = subscription?.attendanceRecords || [];

  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('all');
  const [status, setStatus] = useState('all');
  const [view, setView] = useState('table');
  const [addModal, setAddModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editModal, setEditModal] = useState(false);
  const [analyticsTarget, setAnalyticsTarget] = useState(null);
  const [removeConfirmTarget, setRemoveConfirmTarget] = useState(null);

  const employees = useMemo(() => {
    let list = EMPLOYEES.map(e => ({
      ...e,
      fullName: [e.firstName, e.middleName, e.lastName, e.suffix].filter(Boolean).join(' '),
    }));
    if (search) list = list.filter(e =>
      e.fullName.toLowerCase().includes(search.toLowerCase()) ||
      e.employeeCode?.toLowerCase().includes(search.toLowerCase()) ||
      e.email.toLowerCase().includes(search.toLowerCase())
    );
    if (dept !== 'all') list = list.filter(e => e.department === dept);
    if (status !== 'all') list = list.filter(e => e.status === status);
    return list;
  }, [EMPLOYEES, search, dept, status]);

  function handleAdd(form) {
    try {
      enrollEmployee(form);
      toast('Employee added successfully', 'success');
      setAddModal(false);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function handleRemove(emp) {
    setSelected(null); // close profile modal if open
    setRemoveConfirmTarget(emp);
  }

  function confirmRemove(emp) {
    removeEmployee(emp.id);
    toast(`${[emp.firstName, emp.middleName, emp.lastName, emp.suffix].filter(Boolean).join(' ')} permanently removed`, 'warning');
    setRemoveConfirmTarget(null);
  }

  function confirmDeactivate(emp) {
    updateEmployee(emp.id, { status: 'inactive' });
    toast(`${[emp.firstName, emp.middleName, emp.lastName, emp.suffix].filter(Boolean).join(' ')} marked as inactive`, 'success');
    setRemoveConfirmTarget(null);
  }

  function handleEdit(form) {
    updateEmployee(editTarget.id, form);
    toast('Employee updated', 'success');
    setEditModal(false);
    setEditTarget(null);
  }

  function handleToggleStatus(emp) {
    const newStatus = emp.status === 'active' ? 'inactive' : 'active';
    updateEmployee(emp.id, { status: newStatus });
    toast(`Employee marked as ${newStatus}`, 'success');
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Enrolled Employees"
        description={`${EMPLOYEES.length} enrolled employee${EMPLOYEES.length !== 1 ? 's' : ''}`}
        actions={
          can('edit_all') && (
            <button className="btn-primary btn-sm" onClick={() => setAddModal(true)}>
              <UserPlus size={13} /> Add Employee
            </button>
          )
        }
      />

      {EMPLOYEES.length === 0 ? (
        <div className="card p-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mb-3">
            <UserPlus size={24} className="text-brand-500" />
          </div>
          <p className="text-sm font-semibold text-ink-900 mb-1">No employees yet</p>
          <p className="text-xs text-ink-400 mb-4">Add your first employee to get started.</p>
          {can('edit_all') && (
            <button className="btn-primary btn-sm" onClick={() => setAddModal(true)}>
              <UserPlus size={13} /> Add Employee
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="Search by name, code, email…" className="w-64" />
            <SelectField value={dept} onChange={setDept} className="w-48"
              options={[{ value: 'all', label: 'All Departments' }, ...DEPARTMENTS.map(d => ({ value: d, label: d }))]}
            />
            <SelectField value={status} onChange={setStatus} className="w-32"
              options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
            />
            <div className="ml-auto flex items-center border border-surface-300 rounded-lg overflow-hidden">
              {['table','grid'].map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === v ? 'bg-brand-600 text-white' : 'text-ink-500 hover:bg-surface-100'}`}>
                  {v === 'table' ? '☰ Table' : '⊞ Grid'}
                </button>
              ))}
            </div>
          </div>

          {view === 'table' ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="text-center">Employee</th>
                    <th className="text-center">Code</th>
                    <th className="text-center">Department</th>
                    <th className="text-center">Role</th>
                    <th className="text-center">Joined</th>
                    <th className="text-center">Status</th>
                    {can('edit_all') && <th className="text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 ? (
                    <tr><td colSpan={7}><EmptyState title="No employees found" description="Try adjusting your filters." /></td></tr>
                  ) : employees.map(emp => (
                    <tr key={emp.id} className="cursor-pointer hover:bg-surface-50 transition-colors" onClick={() => setAnalyticsTarget(emp)}>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-2.5">
                          <Avatar name={`${emp.firstName} ${emp.lastName}`} color={emp.avatarColor} size="sm" />
                          <div className="text-left">
                            <p className="font-semibold text-xs text-ink-800">{[emp.firstName, emp.middleName, emp.lastName, emp.suffix].filter(Boolean).join(' ')}</p>
                            <p className="text-[11px] text-ink-400">{emp.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-center"><span className="font-mono text-xs text-ink-600">{emp.employeeCode}</span></td>
                      <td className="text-center"><span className="text-xs text-ink-600">{emp.department}</span></td>
                      <td className="text-center"><span className="text-xs text-ink-600">{emp.role}</span></td>
                      <td className="text-center"><span className="text-xs text-ink-500">{fmt.date(emp.joinDate)}</span></td>
                      <td className="text-center"><StatusBadge status={emp.status} /></td>
                      {can('edit_all') && (
                        <td className="text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={() => setSelected(emp)} className="btn-ghost btn-sm p-2 rounded-md" title="View profile"><Eye size={16} /></button>
                            <button onClick={() => setAnalyticsTarget(emp)} className="btn-ghost btn-sm p-2 rounded-md text-brand-500" title="View analytics"><BarChart2 size={16} /></button>
                            <button
                              onClick={() => { setEditTarget(emp); setEditModal(true); }}
                              className="btn-ghost btn-sm p-2 rounded-md"
                              title="Edit employee"
                            ><Pencil size={16} /></button>
                            <button
                              onClick={() => handleToggleStatus(emp)}
                              className={`btn-ghost btn-sm p-2 rounded-md ${emp.status === 'active' ? 'text-success-600 hover:bg-success-50' : 'text-ink-400 hover:bg-surface-100'}`}
                              title={emp.status === 'active' ? 'Mark as inactive' : 'Mark as active'}
                            >
                              {emp.status === 'active' ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                            </button>
                            <button onClick={() => handleRemove(emp)} className="btn-ghost btn-sm p-2 rounded-md text-danger-500 hover:bg-danger-50" title="Remove"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {employees.map(emp => (
                <div key={emp.id} className="card-hover p-4 cursor-pointer" onClick={() => setAnalyticsTarget(emp)}>
                  <div className="flex flex-col items-center text-center gap-2">
                    <Avatar name={`${emp.firstName} ${emp.lastName}`} color={emp.avatarColor} size="lg" />
                    <div>
                      <p className="text-xs font-semibold text-ink-800">{[emp.firstName, emp.middleName, emp.lastName, emp.suffix].filter(Boolean).join(' ')}</p>
                      <p className="text-[11px] text-ink-400">{emp.role}</p>
                    </div>
                    <StatusBadge status={emp.status} />
                    <p className="text-[10px] text-ink-300">{emp.department}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Employee Detail Modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Employee Profile" width="max-w-xl"
        footer={
          <div className="flex gap-2 w-full justify-between">
            {can('edit_all') && selected && (
              <button className="btn-danger btn-sm" onClick={() => handleRemove(selected)}>Remove Employee</button>
            )}
            <button className="btn-secondary ml-auto" onClick={() => setSelected(null)}>Close</button>
          </div>
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar name={`${selected.firstName} ${selected.lastName}`} color={selected.avatarColor} size="xl" />
              <div>
                <h3 className="text-base font-bold text-ink-900">{[selected.firstName, selected.middleName, selected.lastName, selected.suffix].filter(Boolean).join(' ')}</h3>
                <p className="text-sm text-ink-500">{selected.role}</p>
                <StatusBadge status={selected.status} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { l: 'Employee Code', v: selected.employeeCode },
                { l: 'First Name',    v: selected.firstName },
                { l: 'Middle Name',   v: selected.middleName || '—' },
                { l: 'Last Name',     v: selected.lastName },
                { l: 'Suffix',        v: selected.suffix || '—' },
                { l: 'Email',         v: selected.email },
                { l: 'Phone',         v: selected.phone || '—' },
                { l: 'Department',    v: selected.department },
                { l: 'Date Joined',   v: fmt.date(selected.joinDate) },
                { l: 'Assigned Shift', v: (() => {
                    const s = SHIFTS.find(sh => String(sh.id) === String(selected.shiftId));
                    return s ? `${s.name} (${s.start} – ${s.end})` : '—';
                  })()
                },
              ].map(({ l, v }) => (
                <div key={l} className="p-3 rounded-lg bg-surface-50">
                  <p className="label mb-0">{l}</p>
                  <p className="text-sm font-medium text-ink-800 mt-0.5">{v}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Employee Modal */}
      {editTarget && (
        <EditEmployeeModal
          open={editModal}
          onClose={() => { setEditModal(false); setEditTarget(null); }}
          onSave={handleEdit}
          departments={DEPARTMENTS}
          shifts={SHIFTS}
          employee={editTarget}
        />
      )}

      {/* Add Employee Modal */}
      <AddEmployeeModal
        open={addModal}
        onClose={() => setAddModal(false)}
        onSave={handleAdd}
        departments={DEPARTMENTS}
        shifts={SHIFTS}
        seatsAvailable={seatsAvailable}
        currentPlan={currentPlan}
      />

      {/* Analytics Modal */}
      {analyticsTarget && (
        <EmployeeAnalyticsModal
          open={!!analyticsTarget}
          onClose={() => setAnalyticsTarget(null)}
          employee={analyticsTarget}
          attendance={ATTENDANCE}
          shifts={SHIFTS}
        />
      )}

      {/* Remove Confirmation Modal */}
      {removeConfirmTarget && (
        <RemoveConfirmModal
          employee={removeConfirmTarget}
          onClose={() => setRemoveConfirmTarget(null)}
          onRemove={() => confirmRemove(removeConfirmTarget)}
          onDeactivate={() => confirmDeactivate(removeConfirmTarget)}
        />
      )}
    </div>
  );
}

const ROLES_SUGGESTIONS = ['Manager','Team Lead','Senior Engineer','Engineer','Analyst','Specialist','Associate','Coordinator'];

/* ── Phone helpers ── */
function toLocalPhone(full) {
  // Strip +63 prefix if present, return up to 10 digits
  if (!full) return '';
  const digits = full.replace(/^\+63/, '').replace(/\D/g, '');
  return digits.slice(0, 10);
}
function toFullPhone(local) {
  const digits = local.replace(/\D/g, '').slice(0, 10);
  return digits ? `+63${digits}` : '';
}

/* ── Reusable phone input with +63 prefix ── */
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

function generateEmployeeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const tail = String(Date.now()).slice(-3);
  return `ERJ-${rand}${tail}`;
}

function AddEmployeeModal({ open, onClose, onSave, departments, shifts, seatsAvailable, currentPlan }) {
  const uid = 'add';
  const [form, setForm] = useState({
    firstName: '', middleName: '', lastName: '', suffix: '', email: '', phone: '',
    role: '', department: departments[0] || '',
    joinDate: new Date().toISOString().split('T')[0],
    employeeCode: '',
    shiftId: '',
  });
  const [idMode, setIdMode] = useState('manual');
  const [errors, setErrors] = useState({});
  const f = (k) => (v) => setForm(prev => ({ ...prev, [k]: v }));

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
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    onSave({ ...form, employeeCode: form.employeeCode.trim().toUpperCase() });
    setForm({ firstName: '', middleName: '', lastName: '', suffix: '', email: '', phone: '', role: '', department: departments[0] || '', joinDate: new Date().toISOString().split('T')[0], employeeCode: '', shiftId: '' });
    setIdMode('manual');
    setErrors({});
  }

  return (
    <Modal open={open} onClose={onClose} title="Add New Employee" width="max-w-xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={seatsAvailable === 0}>Add Employee</button>
        </>
      }
    >
      <div className="space-y-3">
        {seatsAvailable === 0 && (
          <div className="p-3 rounded-lg bg-warning-50 border border-warning-200 text-xs text-warning-700">
            Seat limit reached for {currentPlan?.name}. Upgrade your plan to add more employees.
          </div>
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
              list={`${uid}-dept-list`} placeholder="Select or type…" className="input w-full" />
            <datalist id={`${uid}-dept-list`}>
              {departments.map(d => <option key={d} value={d} />)}
            </datalist>
          </div>
          <div>
            <label className="label">Job Title / Role</label>
            <input type="text" value={form.role} onChange={e => f('role')(e.target.value)}
              list={`${uid}-role-list`} placeholder="e.g. Frontend Engineer"
              className={`input w-full ${errors.role ? 'border-danger-500' : ''}`} />
            <datalist id={`${uid}-role-list`}>
              {ROLES_SUGGESTIONS.map(r => <option key={r} value={r} />)}
            </datalist>
            {errors.role && <p className="text-xs text-danger-600 mt-1">{errors.role}</p>}
          </div>
        </div>

        {/* Assigned Shift */}
        <div>
          <label className="label">Assigned Shift</label>
          <select value={form.shiftId} onChange={e => f('shiftId')(e.target.value)} className="input w-full">
            <option value="">No shift assigned</option>
            {shifts.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.start} – {s.end})</option>
            ))}
          </select>
        </div>

        {/* Employee ID */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="label mb-0">Employee ID</label>
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-surface-100">
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
                className={`input font-mono uppercase w-full ${errors.employeeCode ? 'border-danger-500' : ''}`} />
              <p className="text-xs text-ink-400 mt-1">Letters & numbers only · max 20 chars · stored in uppercase</p>
            </div>
          )}
          {errors.employeeCode && <p className="text-xs text-danger-600 mt-1">{errors.employeeCode}</p>}
        </div>
      </div>
    </Modal>
  );
}

function EditEmployeeModal({ open, onClose, onSave, departments, shifts, employee }) {
  const uid = `edit-${employee.id}`;
  const [form, setForm] = useState({
    firstName: employee.firstName,
    middleName: employee.middleName || '',
    lastName: employee.lastName,
    suffix: employee.suffix || '',
    email: employee.email,
    phone: employee.phone || '',
    role: employee.role,
    department: employee.department,
    joinDate: employee.joinDate,
    shiftId: employee.shiftId || '',
  });
  const [errors, setErrors] = useState({});
  const f = (k) => (v) => setForm(prev => ({ ...prev, [k]: v }));

  function validate() {
    const e = {};
    if (!form.firstName.trim()) e.firstName = 'Required';
    if (!form.lastName.trim()) e.lastName = 'Required';
    if (!form.email.includes('@')) e.email = 'Valid email required';
    if (!form.role.trim()) e.role = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    onSave(form);
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Employee" width="max-w-xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>Save Changes</button>
        </>
      }
    >
      <div className="space-y-3">
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
              list={`${uid}-dept-list`} placeholder="Select or type…" className="input w-full" />
            <datalist id={`${uid}-dept-list`}>
              {departments.map(d => <option key={d} value={d} />)}
            </datalist>
          </div>
          <div>
            <label className="label">Job Title / Role</label>
            <input type="text" value={form.role} onChange={e => f('role')(e.target.value)}
              list={`${uid}-role-list`} placeholder="e.g. Frontend Engineer"
              className={`input w-full ${errors.role ? 'border-danger-500' : ''}`} />
            <datalist id={`${uid}-role-list`}>
              {ROLES_SUGGESTIONS.map(r => <option key={r} value={r} />)}
            </datalist>
            {errors.role && <p className="text-xs text-danger-600 mt-1">{errors.role}</p>}
          </div>
        </div>

        {/* Assigned Shift */}
        <div>
          <label className="label">Assigned Shift</label>
          <select value={form.shiftId} onChange={e => f('shiftId')(e.target.value)} className="input w-full">
            <option value="">No shift assigned</option>
            {shifts.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.start} – {s.end})</option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}


/* ─────────────────────────────────────────────
   Employee Analytics Modal
   Shows attendance bar chart + summary stats
───────────────────────────────────────────── */
/* ─────────────────────────────────────────────
   Remove Confirmation Modal
   Gives users the choice to permanently delete
   or simply mark the employee as inactive.
───────────────────────────────────────────── */
function RemoveConfirmModal({ employee, onClose, onRemove, onDeactivate }) {
  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Remove Employee"
      width="max-w-md"
      footer={
        <div className="flex gap-2 w-full justify-end">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Employee info */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-50 border border-surface-200">
          <Avatar name={`${employee.firstName} ${employee.lastName}`} color={employee.avatarColor} size="md" />
          <div>
            <p className="font-semibold text-sm text-ink-900">{[employee.firstName, employee.middleName, employee.lastName, employee.suffix].filter(Boolean).join(' ')}</p>
            <p className="text-xs text-ink-400">{employee.role} · {employee.department}</p>
          </div>
        </div>

        <p className="text-sm text-ink-600">What would you like to do with this employee?</p>

        {/* Option A — Mark as Inactive */}
        <button
          onClick={onDeactivate}
          className="w-full text-left p-4 rounded-xl border-2 border-surface-200 hover:border-brand-400 hover:bg-brand-50 transition-all group"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-surface-100 group-hover:bg-brand-100 flex items-center justify-center shrink-0 transition-colors">
              <ToggleLeft size={18} className="text-ink-400 group-hover:text-brand-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-800 group-hover:text-brand-700">Mark as Inactive</p>
              <p className="text-xs text-ink-400 mt-0.5 leading-relaxed">
                The employee will no longer appear as active, but <span className="font-medium text-ink-600">all attendance history, records, and data will be preserved.</span> You can reactivate them at any time.
              </p>
            </div>
          </div>
        </button>

        {/* Option B — Permanently Remove */}
        <button
          onClick={onRemove}
          className="w-full text-left p-4 rounded-xl border-2 border-surface-200 hover:border-danger-400 hover:bg-danger-50 transition-all group"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-surface-100 group-hover:bg-danger-100 flex items-center justify-center shrink-0 transition-colors">
              <Trash2 size={16} className="text-ink-400 group-hover:text-danger-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-800 group-hover:text-danger-700">Permanently Remove</p>
              <p className="text-xs text-ink-400 mt-0.5 leading-relaxed">
                The employee and <span className="font-medium text-danger-600">all their attendance history, records, and data will be permanently deleted.</span> This action cannot be undone.
              </p>
            </div>
          </div>
        </button>
      </div>
    </Modal>
  );
}

function EmployeeAnalyticsModal({ open, onClose, employee, attendance, shifts }) {
  const empRecords = useMemo(() =>
    attendance.filter(r => String(r.employeeId) === String(employee.id))
  , [attendance, employee.id]);

  // ── Summary counts ──────────────────────────────────────────────
  const summary = useMemo(() => {
    const counts = { present: 0, late: 0, absent: 0, 'half-day': 0, leave: 0 };
    empRecords.forEach(r => {
      const s = r.status?.toLowerCase();
      if (s && counts[s] !== undefined) counts[s]++;
    });
    const totalMinutes = empRecords.reduce((acc, r) => {
      if (!r.clockIn || !r.clockOut) return acc;
      const [ih, im] = r.clockIn.split(':').map(Number);
      const [oh, om] = r.clockOut.split(':').map(Number);
      let diff = (oh * 60 + om) - (ih * 60 + im);
      if (diff < 0) diff += 24 * 60; // overnight
      return acc + diff;
    }, 0);
    const avgHours = empRecords.filter(r => r.clockIn && r.clockOut).length
      ? (totalMinutes / empRecords.filter(r => r.clockIn && r.clockOut).length / 60).toFixed(1)
      : '—';
    return { ...counts, total: empRecords.length, avgHours };
  }, [empRecords]);

  // ── Last 30 days bar chart data (7 visible bars = last 7 days) ──
  const last14 = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
      const rec = empRecords.find(r => r.date === dateStr);
      const status = rec?.status?.toLowerCase() || 'no-record';
      const hours = (() => {
        if (!rec?.clockIn || !rec?.clockOut) return 0;
        const [ih, im] = rec.clockIn.split(':').map(Number);
        const [oh, om] = rec.clockOut.split(':').map(Number);
        let diff = (oh * 60 + om) - (ih * 60 + im);
        if (diff < 0) diff += 24 * 60;
        return +(diff / 60).toFixed(1);
      })();
      days.push({ dateStr, label, status, hours, rec });
    }
    return days;
  }, [empRecords]);

  // ── Monthly attendance rate (last 6 months) ─────────────────────
  const monthly = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = d.getMonth();
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const recs = empRecords.filter(r => {
        const rd = new Date(r.date);
        return rd.getFullYear() === year && rd.getMonth() === month;
      });
      const present = recs.filter(r => ['present', 'late'].includes(r.status?.toLowerCase())).length;
      months.push({ label, present, total: recs.length });
    }
    return months;
  }, [empRecords]);

  const statusColor = {
    present: '#10b981',
    late: '#f59e0b',
    absent: '#ef4444',
    'half-day': '#6366f1',
    leave: '#06b6d4',
    'no-record': '#e2e8f0',
  };

  const statusLabel = {
    present: 'Present',
    late: 'Late',
    absent: 'Absent',
    'half-day': 'Half Day',
    leave: 'On Leave',
    'no-record': 'No Record',
  };

  const maxHours = Math.max(...last14.map(d => d.hours), 8);

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Analytics — ${[employee.firstName, employee.middleName, employee.lastName, employee.suffix].filter(Boolean).join(' ')}`}
      width="max-w-3xl"
      footer={<button className="btn-secondary ml-auto" onClick={onClose}>Close</button>}
    >
      <div className="space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-50 border border-surface-200">
          <Avatar name={`${employee.firstName} ${employee.lastName}`} color={employee.avatarColor} size="xl" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-ink-900 text-sm">{[employee.firstName, employee.middleName, employee.lastName, employee.suffix].filter(Boolean).join(' ')}</p>
            <p className="text-xs text-ink-400">{employee.role} · {employee.department}</p>
            <p className="text-[11px] text-ink-300 font-mono mt-0.5">{employee.employeeCode}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-brand-600">{summary.total}</p>
            <p className="text-xs text-ink-400">Total records</p>
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-5 gap-2">
          {[
            { label: 'Present',  value: summary.present,      color: '#10b981', bg: '#f0fdf4', icon: <CheckCircle size={14} /> },
            { label: 'Late',     value: summary.late,         color: '#f59e0b', bg: '#fffbeb', icon: <Clock size={14} /> },
            { label: 'Absent',   value: summary.absent,       color: '#ef4444', bg: '#fef2f2', icon: <XCircle size={14} /> },
            { label: 'Half Day', value: summary['half-day'],  color: '#6366f1', bg: '#eef2ff', icon: <AlertTriangle size={14} /> },
            { label: 'Avg Hrs',  value: summary.avgHours,     color: '#2563eb', bg: '#eff6ff', icon: <TrendingUp size={14} /> },
          ].map(({ label, value, color, bg, icon }) => (
            <div key={label} className="rounded-xl p-3 text-center flex flex-col items-center gap-1"
              style={{ background: bg }}>
              <span style={{ color }}>{icon}</span>
              <p className="text-lg font-bold" style={{ color }}>{value}</p>
              <p className="text-[10px] font-medium text-ink-400">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Last 14 Days — Hours Worked Bar Chart ── */}
        <div>
          <p className="text-xs font-semibold text-ink-600 mb-3 uppercase tracking-wide">Hours Worked — Last 14 Days</p>
          <div className="flex items-end gap-1.5 h-28">
            {last14.map((day, i) => {
              const heightPct = day.hours > 0 ? (day.hours / maxHours) * 100 : 0;
              const color = statusColor[day.status] || '#e2e8f0';
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-ink-900 text-white text-[10px] rounded-md px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {day.dateStr}<br />
                    <span style={{ color: statusColor[day.status] }}>{statusLabel[day.status]}</span>
                    {day.hours > 0 && <> · {day.hours}h</>}
                  </div>
                  <div className="w-full rounded-t-sm transition-all" style={{
                    height: `${Math.max(heightPct, day.status !== 'no-record' ? 8 : 2)}%`,
                    background: color,
                    opacity: day.status === 'no-record' ? 0.3 : 1,
                    minHeight: day.status !== 'no-record' ? 4 : 2,
                  }} />
                  <span className="text-[8px] text-ink-300 leading-none">
                    {new Date(day.dateStr).toLocaleDateString('en-US', { day: 'numeric' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Monthly Attendance Bar Chart ── */}
        <div>
          <p className="text-xs font-semibold text-ink-600 mb-3 uppercase tracking-wide">Monthly Attendance — Last 6 Months</p>
          {monthly.every(m => m.total === 0) ? (
            <div className="flex items-center justify-center h-20 rounded-xl bg-surface-50 border border-surface-200">
              <p className="text-xs text-ink-400">No monthly data available yet.</p>
            </div>
          ) : (
            <div className="flex items-end gap-3 h-24">
              {monthly.map((m, i) => {
                const maxPresent = Math.max(...monthly.map(x => x.present), 1);
                const heightPct = (m.present / maxPresent) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-ink-900 text-white text-[10px] rounded-md px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      {m.label}: {m.present} present / {m.total} total
                    </div>
                    <div className="w-full rounded-t-md" style={{
                      height: `${Math.max(heightPct, m.present > 0 ? 10 : 2)}%`,
                      background: 'linear-gradient(180deg, #6366f1, #4f46e5)',
                      minHeight: m.present > 0 ? 4 : 2,
                      opacity: m.total === 0 ? 0.2 : 1,
                    }} />
                    <span className="text-[9px] text-ink-400 leading-none">{m.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Status legend ── */}
        <div className="flex flex-wrap gap-3 pt-1 border-t border-surface-100">
          {Object.entries(statusLabel).filter(([k]) => k !== 'no-record').map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: statusColor[key] }} />
              <span className="text-[11px] text-ink-500">{label}</span>
            </div>
          ))}
        </div>

      </div>
    </Modal>
  );
}