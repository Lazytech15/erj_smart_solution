import { useState, useMemo } from 'react';
import { UserPlus, Pencil, Trash2, Eye, ToggleLeft, ToggleRight, RefreshCw, Wand2, PenLine } from 'lucide-react';
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

  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('all');
  const [status, setStatus] = useState('all');
  const [view, setView] = useState('table');
  const [addModal, setAddModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editModal, setEditModal] = useState(false);

  const employees = useMemo(() => {
    let list = EMPLOYEES.map(e => ({
      ...e,
      fullName: `${e.firstName} ${e.lastName}`,
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
    removeEmployee(emp.id);
    toast(`${emp.firstName} ${emp.lastName} removed`, 'warning');
    setSelected(null);
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
                    <th>Employee</th>
                    <th>Code</th>
                    <th>Department</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th>Status</th>
                    {can('edit_all') && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 ? (
                    <tr><td colSpan={7}><EmptyState title="No employees found" description="Try adjusting your filters." /></td></tr>
                  ) : employees.map(emp => (
                    <tr key={emp.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={`${emp.firstName} ${emp.lastName}`} color={emp.avatarColor} size="sm" />
                          <div>
                            <p className="font-semibold text-xs text-ink-800">{emp.firstName} {emp.lastName}</p>
                            <p className="text-[11px] text-ink-400">{emp.email}</p>
                          </div>
                        </div>
                      </td>
                      <td><span className="font-mono text-xs text-ink-600">{emp.employeeCode}</span></td>
                      <td><span className="text-xs text-ink-600">{emp.department}</span></td>
                      <td><span className="text-xs text-ink-600">{emp.role}</span></td>
                      <td><span className="text-xs text-ink-500">{fmt.date(emp.joinDate)}</span></td>
                      <td><StatusBadge status={emp.status} /></td>
                      {can('edit_all') && (
                        <td>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setSelected(emp)} className="btn-ghost btn-sm p-1.5 rounded-md" title="View"><Eye size={13} /></button>
                            <button
                              onClick={() => { setEditTarget(emp); setEditModal(true); }}
                              className="btn-ghost btn-sm p-1.5 rounded-md"
                              title="Edit employee"
                            ><Pencil size={13} /></button>
                            <button
                              onClick={() => handleToggleStatus(emp)}
                              className={`btn-ghost btn-sm p-1.5 rounded-md ${emp.status === 'active' ? 'text-success-600 hover:bg-success-50' : 'text-ink-400 hover:bg-surface-100'}`}
                              title={emp.status === 'active' ? 'Mark as inactive' : 'Mark as active'}
                            >
                              {emp.status === 'active' ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                            </button>
                            <button onClick={() => handleRemove(emp)} className="btn-ghost btn-sm p-1.5 rounded-md text-danger-500 hover:bg-danger-50" title="Remove"><Trash2 size={13} /></button>
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
                <div key={emp.id} className="card-hover p-4 cursor-pointer" onClick={() => setSelected(emp)}>
                  <div className="flex flex-col items-center text-center gap-2">
                    <Avatar name={`${emp.firstName} ${emp.lastName}`} color={emp.avatarColor} size="lg" />
                    <div>
                      <p className="text-xs font-semibold text-ink-800">{emp.firstName} {emp.lastName}</p>
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
              <button className="btn-danger btn-sm" onClick={() => handleRemove(selected)}>Remove</button>
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
                <h3 className="text-base font-bold text-ink-900">{selected.firstName} {selected.lastName}</h3>
                <p className="text-sm text-ink-500">{selected.role}</p>
                <StatusBadge status={selected.status} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { l: 'Employee Code', v: selected.employeeCode },
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
    </div>
  );
}

const ROLES_SUGGESTIONS = ['Manager','Team Lead','Senior Engineer','Engineer','Analyst','Specialist','Associate','Coordinator'];

function generateEmployeeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const tail = String(Date.now()).slice(-3);
  return `ERJ-${rand}${tail}`;
}

function AddEmployeeModal({ open, onClose, onSave, departments, shifts, seatsAvailable, currentPlan }) {
  const uid = 'add';
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    role: '', department: departments[0] || '',
    joinDate: new Date().toISOString().split('T')[0],
    employeeCode: generateEmployeeCode(),
    shiftId: '',
  });
  const [idMode, setIdMode] = useState('auto');
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
    setForm({ firstName: '', lastName: '', email: '', phone: '', role: '', department: departments[0] || '', joinDate: new Date().toISOString().split('T')[0], employeeCode: generateEmployeeCode(), shiftId: '' });
    setIdMode('auto');
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
        <InputField label="Work Email" type="email" value={form.email} onChange={f('email')} placeholder="m.santos@company.com" error={errors.email} />
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Phone" value={form.phone} onChange={f('phone')} placeholder="+63 9xx xxx xxxx" />
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
              {[['auto', <Wand2 size={10} />, 'Auto-generate'], ['manual', <PenLine size={10} />, 'Enter manually']].map(([mode, icon, label]) => (
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
    lastName: employee.lastName,
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
        <InputField label="Work Email" type="email" value={form.email} onChange={f('email')} placeholder="m.santos@company.com" error={errors.email} />
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Phone" value={form.phone} onChange={f('phone')} placeholder="+63 9xx xxx xxxx" />
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

