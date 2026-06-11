import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Plus, CalendarDays } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';
import { fmt } from '../utils/dateTime';
import { StatusBadge, Avatar, SearchInput, SelectField, SectionHeader, EmptyState, Modal, InputField } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

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

  const enriched = useMemo(() => {
    return leaveRequests
      .map(r => ({ ...r, employee: employees.find(e => e.id === r.employeeId) }))
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

  function handleAdd(form) {
    addLeaveRequest(form);
    toast('Leave request submitted', 'success');
    setAddModal(false);
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Leave Tracker"
        description={`${leaveRequests.filter(r => r.status === 'pending').length} pending request${leaveRequests.filter(r => r.status === 'pending').length !== 1 ? 's' : ''}`}
        actions={
          <button className="btn-primary btn-sm" onClick={() => setAddModal(true)}>
            <Plus size={13} /> New Request
          </button>
        }
      />

      <div className="flex gap-2 items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search employees…" className="w-52" />
        <SelectField value={statusFilter} onChange={setStatusFilter} className="w-32"
          options={[{ value: 'all', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }]}
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
                {can('approve_leave') && <th>Actions</th>}
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
                  {can('approve_leave') && req.status === 'pending' && (
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => handleApprove(req.id)} className="btn-sm text-xs bg-success-50 text-success-700 hover:bg-success-100 rounded-lg px-2 py-1">Approve</button>
                        <button onClick={() => handleReject(req.id)} className="btn-sm text-xs bg-danger-50 text-danger-600 hover:bg-danger-100 rounded-lg px-2 py-1">Reject</button>
                      </div>
                    </td>
                  )}
                  {can('approve_leave') && req.status !== 'pending' && <td />}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Leave Request Modal */}
      <LeaveModal open={addModal} onClose={() => setAddModal(false)} onSave={handleAdd} employees={employees} />
    </div>
  );
}

function LeaveModal({ open, onClose, onSave, employees }) {
  const [form, setForm] = useState({
    employeeId: '', leaveType: 'Sick Leave',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    reason: '',
  });
  const f = k => v => setForm(p => ({ ...p, [k]: v }));

  return (
    <Modal open={open} onClose={onClose} title="New Leave Request" width="max-w-md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { if (form.employeeId) onSave(form); }}>Submit</button>
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
