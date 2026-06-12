import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Plus, CalendarDays, Pencil, X, Check, Ban, Download } from 'lucide-react';
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

const LEAVE_TYPES = ['Sick Leave', 'Vacation Leave', 'Emergency Leave', 'Maternity Leave', 'Paternity Leave', 'Others'];

export default function LeavePage() {
  const toast = useToast();
  const { user, can } = useAuth();
  const { subscription, addLeaveRequest, updateLeaveRequest } = useSubscription();

  const employees = subscription?.enrolledEmployees || [];
  const leaveRequests = subscription?.leaveRequests || [];

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [addModal, setAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);

  const enriched = useMemo(() => {
    return leaveRequests
      .map(r => ({ ...r, employee: employees.find(e => String(e.id) === String(r.employeeId)) }))
      .filter(r => r.employee);
  }, [leaveRequests, employees]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (search) list = list.filter(r =>
      `${r.employee.firstName} ${r.employee.lastName}`.toLowerCase().includes(search.toLowerCase())
    );
    if (statusFilter !== 'all') list = list.filter(r => r.status === statusFilter);
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [enriched, search, statusFilter]);

  function handleApprove(id) {
    updateLeaveRequest(id, { status: 'approved', resolvedAt: new Date().toISOString() });
    toast('Leave approved', 'success');
  }

  function handleReject(id) {
    updateLeaveRequest(id, { status: 'rejected', resolvedAt: new Date().toISOString() });
    toast('Leave rejected', 'warning');
  }

  function handleCancelConfirm() {
    updateLeaveRequest(cancelTarget.id, { status: 'cancelled', resolvedAt: new Date().toISOString() });
    toast('Leave request cancelled', 'warning');
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

  const showActions = can('approve_leave') || can('edit_all');

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Leave Tracker"
        description={`${leaveRequests.filter(r => r.status === 'pending').length} pending request${leaveRequests.filter(r => r.status === 'pending').length !== 1 ? 's' : ''}`}
        actions={
          <div className="flex gap-2">
            {filtered.length > 0 && (
              <button
                className="btn-secondary btn-sm"
                onClick={() => { exportLeaveCSV(filtered); toast('Leave data exported to CSV', 'success'); }}
              >
                <Download size={13} /> Export CSV
              </button>
            )}
            <button className="btn-primary btn-sm" onClick={() => setAddModal(true)}>
              <Plus size={13} /> New Request
            </button>
          </div>
        }
      />

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
                <th>Reason</th>
                <th>Status</th>
                {showActions && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(req => (
                <tr key={req.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={`${req.employee.firstName} ${req.employee.lastName}`} color={req.employee.avatarColor} size="sm" />
                      <div>
                        <p className="font-semibold text-xs text-ink-800">{req.employee.firstName} {req.employee.lastName}</p>
                        <p className="text-[11px] text-ink-400">{req.employee.department}</p>
                      </div>
                    </div>
                  </td>
                  <td><span className="text-xs text-ink-600">{req.leaveType}</span></td>
                  <td><span className="text-xs text-ink-600">{fmt.date(req.startDate)}</span></td>
                  <td><span className="text-xs text-ink-600">{fmt.date(req.endDate)}</span></td>
                  <td><span className="text-xs text-ink-500 line-clamp-1">{req.reason || '—'}</span></td>
                  <td><StatusBadge status={req.status} /></td>
                  {showActions && (
                    <td>
                      <div className="flex gap-1 items-center">
                        {/* Edit — always available for admin */}
                        {can('edit_all') && req.status !== 'cancelled' && (
                          <button
                            onClick={() => setEditTarget(req)}
                            className="btn-ghost btn-sm p-1.5 rounded-md"
                            title="Edit leave request"
                          >
                            <Pencil size={13} />
                          </button>
                        )}

                        {/* Approve / Reject — only for pending */}
                        {can('approve_leave') && req.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(req.id)}
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

                        {/* Cancel — for pending or approved */}
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Leave Request Modal */}
      <LeaveModal
        open={addModal}
        onClose={() => setAddModal(false)}
        onSave={handleAdd}
        employees={employees}
        title="New Leave Request"
      />

      {/* Edit Leave Request Modal */}
      {editTarget && (
        <LeaveModal
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
          employees={employees}
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
            Are you sure you want to cancel the <strong>{cancelTarget.leaveType}</strong> request for{' '}
            <strong>{cancelTarget.employee?.firstName} {cancelTarget.employee?.lastName}</strong>?
            This action cannot be undone.
          </p>
        )}
      </Modal>
    </div>
  );
}

function LeaveModal({ open, onClose, onSave, employees, title, initial }) {
  const [form, setForm] = useState(
    initial
      ? {
          employeeId: initial.employeeId,
          leaveType: initial.leaveType,
          startDate: initial.startDate,
          endDate: initial.endDate,
          reason: initial.reason || '',
        }
      : {
          employeeId: '',
          leaveType: 'Sick Leave',
          startDate: format(new Date(), 'yyyy-MM-dd'),
          endDate: format(new Date(), 'yyyy-MM-dd'),
          reason: '',
        }
  );
  const f = k => v => setForm(p => ({ ...p, [k]: v }));

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
          options={LEAVE_TYPES.map(l => ({ value: l, label: l }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Start Date" type="date" value={form.startDate} onChange={f('startDate')} />
          <InputField label="End Date" type="date" value={form.endDate} onChange={f('endDate')} />
        </div>
        <InputField label="Reason" value={form.reason} onChange={f('reason')} placeholder="Brief description…" />
      </div>
    </Modal>
  );
}
