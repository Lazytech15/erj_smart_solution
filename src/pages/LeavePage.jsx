import { useState, useMemo } from 'react';
import { format, differenceInCalendarDays } from 'date-fns';
import { Plus, CalendarDays, Pencil, X, Check, Ban, Download, Settings2, Trash2, Wallet, AlertTriangle } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';
import { fmt } from '../utils/dateTime';
import { StatusBadge, Avatar, SearchInput, SelectField, SectionHeader, EmptyState, Modal, InputField } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

function exportLeaveCSV(list) {
  const headers = ['Employee Code', 'First Name', 'Last Name', 'Department', 'Leave Type', 'Start Date', 'End Date', 'Reason', 'Status', 'Submitted'];
  const rows = list.map(r => [
    r.employee.employeeCode || '',
    r.employee.firstName,
    r.employee.lastName,
    r.employee.department || '',
    r.leaveType,
    r.startDate,
    r.endDate,
    r.reason || '',
    r.status,
    r.createdAt ? format(new Date(r.createdAt), 'yyyy-MM-dd') : '',
  ]);
  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `leave_requests_${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function dayCount(startDate, endDate) {
  if (!startDate) return 0;
  const n = differenceInCalendarDays(new Date(endDate || startDate), new Date(startDate)) + 1;
  return n > 0 ? n : 0;
}

export default function LeavePage() {
  const toast = useToast();
  const { can } = useAuth();
  const {
    subscription, addLeaveRequest, updateLeaveRequest,
    addLeaveType, updateLeaveType, removeLeaveType, setEmployeeLeaveBalance,
  } = useSubscription();

  const employees    = subscription?.enrolledEmployees || [];
  const leaveRequests = subscription?.leaveRequests || [];
  const leaveTypes   = subscription?.settings?.leaveTypes || [];

  const [tab, setTab] = useState('requests');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [addModal, setAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [typesModal, setTypesModal] = useState(false);
  const [balanceTarget, setBalanceTarget] = useState(null);

  const isAdmin = can('edit_all');
  const showActions = can('approve_leave') || can('edit_all');

  const enriched = useMemo(() => {
    return leaveRequests.map(r => {
      // Normalise field names — mobile/ESP32 records use `type` and `submittedAt`
      const normalised = {
        ...r,
        leaveType:  r.leaveType  ?? r.type        ?? '',
        createdAt:  r.createdAt  ?? r.submittedAt ?? null,
        employeeId: r.employeeId != null ? String(r.employeeId) : r.employeeId,
      };
      // Match on employee.id (admin-side) OR employee.accountEmployeeId (mobile-side).
      // These can differ by a few ms when Date.now() was called twice during enrollment.
      const leaveEmpId = String(r.employeeId);
      const employee = employees.find(e =>
        String(e.id) === leaveEmpId ||
        (e.accountEmployeeId != null && String(e.accountEmployeeId) === leaveEmpId)
      );
      return { ...normalised, employee };
    });
  }, [leaveRequests, employees]);

  // Requests with matched employees (for table display)
  const filtered = useMemo(() => {
    let list = enriched.filter(r => r.employee);
    if (search) list = list.filter(r =>
      `${r.employee.firstName} ${r.employee.lastName}`.toLowerCase().includes(search.toLowerCase())
    );
    if (statusFilter !== 'all') list = list.filter(r => r.status === statusFilter);
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [enriched, search, statusFilter]);

  // Pending count includes ALL pending regardless of employee match
  const pendingCount = enriched.filter(r => r.status === 'pending').length;
  function balanceFor(employee, typeName) {
    return employee?.leaveBalances?.[typeName] ?? 0;
  }

  function handleApprove(req) {
    const days = dayCount(req.startDate, req.endDate);
    const typeName = req.leaveType ?? req.type;
    const balance = balanceFor(req.employee, typeName);
    updateLeaveRequest(req.id, { status: 'approved', resolvedAt: new Date().toISOString() });
    // Actually deduct the days from the employee's leave balance
    setEmployeeLeaveBalance(req.employee.id, typeName, balance - days);
    if (days > balance) {
      toast(`Leave approved — note: this overdraws ${req.employee.firstName}'s balance (was ${balance} day${balance !== 1 ? 's' : ''})`, 'warning');
    } else {
      toast(`Leave approved — ${days} day${days !== 1 ? 's' : ''} deducted from balance`, 'success');
    }
  }

  function handleReject(id) {
    updateLeaveRequest(id, { status: 'rejected', resolvedAt: new Date().toISOString() });
    toast('Leave rejected', 'warning');
  }

  function handleCancelConfirm() {
    const wasApproved = cancelTarget.status === 'approved';
    updateLeaveRequest(cancelTarget.id, { status: 'cancelled', resolvedAt: new Date().toISOString() });
    // Restore the balance if the leave was already approved
    if (wasApproved) {
      const days = dayCount(cancelTarget.startDate, cancelTarget.endDate);
      const typeName = cancelTarget.leaveType ?? cancelTarget.type;
      const currentBalance = balanceFor(cancelTarget.employee, typeName);
      setEmployeeLeaveBalance(cancelTarget.employee.id, typeName, currentBalance + days);
    }
    toast(wasApproved ? 'Leave cancelled — balance restored' : 'Leave request cancelled', 'warning');
    setCancelTarget(null);
  }

  function handleAdd(form) {
    addLeaveRequest(form);
    toast('Leave request submitted', 'success');
    setAddModal(false);
  }

  function handleEdit(form) {
    updateLeaveRequest(editTarget.id, form);
    toast('Leave request updated', 'success');
    setEditTarget(null);
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Leave Tracker"
        description={`${pendingCount} pending request${pendingCount !== 1 ? 's' : ''}`}
        actions={
          <div className="flex gap-2">
            {tab === 'requests' && filtered.length > 0 && (
              <button
                className="btn-secondary btn-sm"
                onClick={() => { exportLeaveCSV(filtered); toast('Leave data exported to CSV', 'success'); }}
              >
                <Download size={13} /> Export CSV
              </button>
            )}
            {isAdmin && (
              <button className="btn-secondary btn-sm" onClick={() => setTypesModal(true)}>
                <Settings2 size={13} /> Manage Leave Types
              </button>
            )}
            <button className="btn-primary btn-sm" onClick={() => setAddModal(true)}>
              <Plus size={13} /> New Request
            </button>
          </div>
        }
      />


      {/* Tabs */}
      <div className="flex gap-1.5 border-b border-surface-200">
        {[
          { id: 'requests', label: 'Requests' },
          { id: 'balances', label: 'Leave Balances' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-brand-600 text-brand-600' : 'border-transparent text-ink-400 hover:text-ink-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'requests' ? (
        <>
          <div className="flex gap-2 items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="Search employees…" className="w-52" />
            <SelectField value={statusFilter} onChange={setStatusFilter} className="w-36"
              options={[
                { value: 'all', label: 'All' },
                { value: 'pending', label: 'Pending' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
            />
          </div>

          {employees.length === 0 ? (
            <EmptyState title="No employees enrolled" description="Enroll employees first to manage their leave requests." />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No leave requests"
              description="Leave requests will appear here once submitted."
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Days</th>
                    <th>Reason</th>
                    <th>Status</th>
                    {showActions && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(req => {
                    const typeName = req.leaveType ?? req.type;
                    const days = dayCount(req.startDate, req.endDate);
                    const balance = balanceFor(req.employee, typeName);
                    const wouldOverdraw = req.status === 'pending' && days > balance;
                    return (
                      <tr key={req.id}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={`${req.employee.firstName} ${req.employee.lastName}`} color={req.employee.avatarColor} size="sm" src={req.employee.profilePhotoUrl} />
                            <div>
                              <p className="font-semibold text-xs text-ink-800">{req.employee.firstName} {req.employee.lastName}</p>
                              <p className="text-[11px] text-ink-400">{req.employee.department}</p>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="text-xs text-ink-600">{typeName}</span>
                          {wouldOverdraw && (
                            <span title={`Only ${balance} day${balance !== 1 ? 's' : ''} left`} className="inline-flex ml-1.5 text-warning-500 align-middle">
                              <AlertTriangle size={11} />
                            </span>
                          )}
                        </td>
                        <td><span className="text-xs text-ink-600">{fmt.date(req.startDate)}</span></td>
                        <td><span className="text-xs text-ink-600">{fmt.date(req.endDate)}</span></td>
                        <td><span className="text-xs text-ink-600">{days}</span></td>
                        <td><span className="text-xs text-ink-500 line-clamp-1">{req.reason || '—'}</span></td>
                        <td><StatusBadge status={req.status} /></td>
                        {showActions && (
                          <td>
                            <div className="flex gap-1 items-center">
                              {can('edit_all') && req.status !== 'cancelled' && (
                                <button
                                  onClick={() => setEditTarget(req)}
                                  className="btn-ghost btn-sm p-1.5 rounded-md"
                                  title="Edit leave request"
                                >
                                  <Pencil size={13} />
                                </button>
                              )}

                              {can('approve_leave') && req.status === 'pending' && (
                                <>
                                  <button
                                    onClick={() => handleApprove(req)}
                                    className="btn-sm text-xs bg-success-50 text-success-700 hover:bg-success-100 rounded-lg px-2 py-1 flex items-center gap-1"
                                  >
                                    <Check size={11} /> Approve
                                  </button>
                                  <button
                                    onClick={() => handleReject(req.id)}
                                    className="btn-sm text-xs bg-danger-50 text-danger-600 hover:bg-danger-100 rounded-lg px-2 py-1 flex items-center gap-1"
                                  >
                                    <X size={11} /> Reject
                                  </button>
                                </>
                              )}

                              {can('edit_all') && (req.status === 'pending' || req.status === 'approved') && (
                                <button
                                  onClick={() => setCancelTarget(req)}
                                  className="btn-sm text-xs bg-surface-100 text-ink-500 hover:bg-surface-200 rounded-lg px-2 py-1 flex items-center gap-1"
                                  title="Cancel leave"
                                >
                                  <Ban size={11} /> Cancel
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <BalancesTab
          employees={employees}
          leaveTypes={leaveTypes}
          isAdmin={isAdmin}
          onEdit={(employee, typeName) => setBalanceTarget({ employee, typeName })}
        />
      )}

      {/* New Leave Request Modal */}
      <LeaveModal
        open={addModal}
        onClose={() => setAddModal(false)}
        onSave={handleAdd}
        employees={employees}
        leaveTypes={leaveTypes}
        title="New Leave Request"
      />

      {/* Edit Leave Request Modal */}
      {editTarget && (
        <LeaveModal
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
          employees={employees}
          leaveTypes={leaveTypes}
          title="Edit Leave Request"
          initial={editTarget}
        />
      )}

      {/* Cancel Confirmation Modal */}
      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancel Leave Request"
        width="max-w-sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCancelTarget(null)}>Keep It</button>
            <button className="btn-danger" onClick={handleCancelConfirm}>Yes, Cancel</button>
          </>
        }
      >
        {cancelTarget && (
          <p className="text-sm text-ink-600">
            Are you sure you want to cancel the <strong>{cancelTarget.leaveType ?? cancelTarget.type}</strong> request for{' '}
            <strong>{cancelTarget.employee?.firstName} {cancelTarget.employee?.lastName}</strong>?
            {cancelTarget.status === 'approved' && ' Their leave balance will be restored.'}
            {' '}This action cannot be undone.
          </p>
        )}
      </Modal>

      {/* Manage Leave Types Modal */}
      {isAdmin && (
        <LeaveTypesModal
          open={typesModal}
          onClose={() => setTypesModal(false)}
          leaveTypes={leaveTypes}
          onAdd={addLeaveType}
          onUpdate={updateLeaveType}
          onRemove={removeLeaveType}
          toast={toast}
        />
      )}

      {/* Edit single employee balance */}
      {balanceTarget && (
        <Modal
          open={!!balanceTarget}
          onClose={() => setBalanceTarget(null)}
          title="Edit Leave Balance"
          width="max-w-sm"
          footer={
            <>
              <button className="btn-secondary" onClick={() => setBalanceTarget(null)}>Cancel</button>
              <button
                className="btn-primary"
                onClick={() => {
                  setEmployeeLeaveBalance(balanceTarget.employee.id, balanceTarget.typeName, balanceTarget.value);
                  toast('Balance updated', 'success');
                  setBalanceTarget(null);
                }}
              >
                Save
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-ink-600">
              {balanceTarget.employee.firstName} {balanceTarget.employee.lastName} — <strong>{balanceTarget.typeName}</strong>
            </p>
            <InputField
              label="Remaining Days"
              type="number"
              value={balanceTarget.value ?? balanceFor(balanceTarget.employee, balanceTarget.typeName)}
              onChange={v => setBalanceTarget(p => ({ ...p, value: v }))}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

function BalancesTab({ employees, leaveTypes, isAdmin, onEdit }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return employees;
    return employees.filter(e =>
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(search.toLowerCase())
    );
  }, [employees, search]);

  if (leaveTypes.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="No leave types configured"
        description="Add a leave type first (e.g. Sick Leave, Vacation Leave) to start tracking employee balances."
      />
    );
  }

  if (employees.length === 0) {
    return <EmptyState title="No employees enrolled" description="Enroll employees first to track their leave balances." />;
  }

  return (
    <div className="space-y-3">
      <SearchInput value={search} onChange={setSearch} placeholder="Search employees…" className="w-52" />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              {leaveTypes.map(t => <th key={t.name}>{t.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map(emp => (
              <tr key={emp.id}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={`${emp.firstName} ${emp.lastName}`} color={emp.avatarColor} size="sm" src={emp.profilePhotoUrl} />
                    <div>
                      <p className="font-semibold text-xs text-ink-800">{emp.firstName} {emp.lastName}</p>
                      <p className="text-[11px] text-ink-400">{emp.department}</p>
                    </div>
                  </div>
                </td>
                {leaveTypes.map(t => {
                  const bal = emp.leaveBalances?.[t.name] ?? 0;
                  return (
                    <td key={t.name}>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-semibold ${bal < 0 ? 'text-danger-600' : 'text-ink-700'}`}>
                          {bal}
                        </span>
                        <span className="text-[10px] text-ink-300">/ {t.defaultBalance}</span>
                        {isAdmin && (
                          <button
                            onClick={() => onEdit(emp, t.name)}
                            className="p-1 rounded-md text-ink-300 hover:text-brand-500 hover:bg-brand-50 transition-colors ml-auto"
                            title={`Edit ${t.name} balance`}
                          >
                            <Pencil size={11} />
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeaveModal({ open, onClose, onSave, employees, leaveTypes, title, initial }) {
  const defaultType = leaveTypes[0]?.name ?? '';
  const [form, setForm] = useState(
    initial
      ? {
          employeeId: initial.employeeId,
          leaveType: initial.leaveType ?? initial.type ?? defaultType,
          startDate: initial.startDate,
          endDate: initial.endDate,
          reason: initial.reason || '',
        }
      : {
          employeeId: '',
          leaveType: defaultType,
          startDate: format(new Date(), 'yyyy-MM-dd'),
          endDate: format(new Date(), 'yyyy-MM-dd'),
          reason: '',
        }
  );
  const f = k => v => setForm(p => ({ ...p, [k]: v }));

  const selectedEmployee = employees.find(e => String(e.id) === String(form.employeeId));
  const balance = selectedEmployee?.leaveBalances?.[form.leaveType] ?? 0;
  const days = dayCount(form.startDate, form.endDate);
  const wouldOverdraw = selectedEmployee && days > balance;

  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { if (form.employeeId) onSave(form); }}>
            {initial ? 'Save Changes' : 'Submit'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <SelectField label="Employee" value={form.employeeId} onChange={f('employeeId')}
          options={[{ value: '', label: 'Select employee…' }, ...employees.map(e => ({ value: e.id, label: `${e.firstName} ${e.lastName}` }))]}
        />
        <SelectField label="Leave Type" value={form.leaveType} onChange={f('leaveType')}
          options={leaveTypes.length > 0
            ? leaveTypes.map(l => ({ value: l.name, label: l.name }))
            : [{ value: '', label: 'No leave types configured' }]}
        />
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Start Date" type="date" value={form.startDate} onChange={f('startDate')} />
          <InputField label="End Date" type="date" value={form.endDate} onChange={f('endDate')} />
        </div>
        <InputField label="Reason" value={form.reason} onChange={f('reason')} placeholder="Brief description…" />

        {selectedEmployee && (
          <div className={`text-xs rounded-lg px-3 py-2 flex items-center gap-1.5 ${
            wouldOverdraw ? 'bg-warning-50 text-warning-700' : 'bg-surface-50 text-ink-500'
          }`}>
            {wouldOverdraw && <AlertTriangle size={12} className="shrink-0" />}
            {days} day{days !== 1 ? 's' : ''} requested · {balance} day{balance !== 1 ? 's' : ''} of {form.leaveType} remaining
            {wouldOverdraw && ' — this will overdraw the balance'}
          </div>
        )}
      </div>
    </Modal>
  );
}

function LeaveTypesModal({ open, onClose, leaveTypes, onAdd, onUpdate, onRemove, toast }) {
  const [newName, setNewName] = useState('');
  const [newDefault, setNewDefault] = useState('5');
  const [editingName, setEditingName] = useState(null);
  const [editValue, setEditValue] = useState('');

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    try {
      onAdd(name, newDefault);
      toast(`"${name}" added`, 'success');
      setNewName('');
      setNewDefault('5');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function startEdit(type) {
    setEditingName(type.name);
    setEditValue(String(type.defaultBalance));
  }

  function saveEdit() {
    onUpdate(editingName, { defaultBalance: Number(editValue) || 0 });
    toast('Leave type updated', 'success');
    setEditingName(null);
  }

  function handleRemove(type) {
    onRemove(type.name);
    toast(`"${type.name}" removed`, 'warning');
  }

  return (
    <Modal open={open} onClose={onClose} title="Manage Leave Types" width="max-w-lg"
      footer={<button className="btn-secondary ml-auto" onClick={onClose}>Done</button>}
    >
      <div className="space-y-4">
        <p className="text-xs text-ink-400">
          Default balance is the number of days new employees start with each year.
          Removing a type clears it from every employee's balance.
        </p>

        {leaveTypes.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-4">No leave types yet — add one below.</p>
        ) : (
          <div className="space-y-1.5">
            {leaveTypes.map(type => (
              <div key={type.name} className="flex items-center gap-2 p-2.5 rounded-lg bg-surface-50 border border-surface-200">
                <span className="flex-1 text-sm font-medium text-ink-700">{type.name}</span>
                {editingName === type.name ? (
                  <>
                    <input
                      type="number"
                      className="input w-20 py-1 text-xs"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      autoFocus
                    />
                    <span className="text-xs text-ink-400">days</span>
                    <button className="btn-ghost btn-sm p-1.5 rounded-md text-success-600" onClick={saveEdit} title="Save">
                      <Check size={13} />
                    </button>
                    <button className="btn-ghost btn-sm p-1.5 rounded-md" onClick={() => setEditingName(null)} title="Cancel">
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-ink-400 w-16 text-right">{type.defaultBalance} days</span>
                    <button className="btn-ghost btn-sm p-1.5 rounded-md text-ink-300 hover:text-brand-500" onClick={() => startEdit(type)} title="Edit default">
                      <Pencil size={12} />
                    </button>
                    <button className="btn-ghost btn-sm p-1.5 rounded-md text-ink-300 hover:text-danger-500" onClick={() => handleRemove(type)} title="Remove type">
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 pt-3 border-t border-surface-200">
          <InputField label="New Leave Type" value={newName} onChange={setNewName} placeholder="e.g. Bereavement Leave" className="flex-1" />
          <InputField label="Default Days" type="number" value={newDefault} onChange={setNewDefault} className="w-24" />
          <button className="btn-primary btn-sm" onClick={handleAdd} disabled={!newName.trim()}>
            <Plus size={13} /> Add
          </button>
        </div>
      </div>
    </Modal>
  );
}