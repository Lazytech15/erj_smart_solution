import { useState, useMemo } from 'react';
import { format, subDays, parseISO } from 'date-fns';
import { Clock, Download, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';
import { fmt } from '../utils/dateTime';
import { StatusBadge, Avatar, SearchInput, SelectField, SectionHeader, EmptyState, Modal, InputField } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

const STATUSES = ['present', 'late', 'absent', 'half-day'];

export default function AttendancePage() {
  const toast = useToast();
  const { can } = useAuth();
  const { subscription, addAttendanceRecord, updateAttendanceRecord } = useSubscription();

  const employees = subscription?.enrolledEmployees || [];
  const attendanceRecords = subscription?.attendanceRecords || [];
  const departments = subscription?.departments || [];

  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [addModal, setAddModal] = useState(false);
  const [editRecord, setEditRecord] = useState(null);

  const records = useMemo(() => {
    let recs = attendanceRecords
      .filter(r => r.date === date)
      .map(r => ({ ...r, employee: employees.find(e => e.id === r.employeeId) }))
      .filter(r => r.employee);

    if (search) recs = recs.filter(r =>
      `${r.employee.firstName} ${r.employee.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      r.employee.employeeCode?.toLowerCase().includes(search.toLowerCase())
    );
    if (dept !== 'all') recs = recs.filter(r => r.employee.department === dept);
    if (statusFilter !== 'all') recs = recs.filter(r => r.status === statusFilter);
    return recs.sort((a, b) => `${a.employee.firstName} ${a.employee.lastName}`.localeCompare(`${b.employee.firstName} ${b.employee.lastName}`));
  }, [attendanceRecords, employees, date, search, dept, statusFilter]);

  function prevDay() { setDate(d => format(subDays(parseISO(d), 1), 'yyyy-MM-dd')); }
  function nextDay() {
    const next = format(subDays(parseISO(date), -1), 'yyyy-MM-dd');
    if (next <= format(new Date(), 'yyyy-MM-dd')) setDate(next);
  }

  function handleAddRecord(form) {
    addAttendanceRecord({ ...form, date });
    toast('Attendance record added', 'success');
    setAddModal(false);
  }

  function handleEditRecord(form) {
    updateAttendanceRecord(editRecord.id, form);
    toast('Record updated', 'success');
    setEditRecord(null);
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Attendance Management"
        description={`${records.length} records for ${fmt.date(date)}`}
        actions={
          can('edit_all') && (
            <button className="btn-primary btn-sm" onClick={() => setAddModal(true)}>
              <Plus size={13} /> Add Record
            </button>
          )
        }
      />

      <div className="flex flex-wrap gap-2 items-center">
        {/* Date navigator */}
        <div className="flex items-center gap-1 border border-surface-300 rounded-lg overflow-hidden">
          <button onClick={prevDay} className="p-2 hover:bg-surface-100 transition-colors"><ChevronLeft size={14} /></button>
          <input
            type="date"
            value={date}
            max={format(new Date(), 'yyyy-MM-dd')}
            onChange={e => setDate(e.target.value)}
            className="text-xs text-ink-700 px-2 bg-transparent border-none outline-none"
          />
          <button onClick={nextDay} className="p-2 hover:bg-surface-100 transition-colors"><ChevronRight size={14} /></button>
        </div>

        <SearchInput value={search} onChange={setSearch} placeholder="Search employees…" className="w-52" />
        <SelectField value={dept} onChange={setDept} className="w-44"
          options={[{ value: 'all', label: 'All Departments' }, ...departments.map(d => ({ value: d, label: d }))]}
        />
        <SelectField value={statusFilter} onChange={setStatusFilter} className="w-32"
          options={[{ value: 'all', label: 'All Status' }, ...STATUSES.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))]}
        />
      </div>

      {employees.length === 0 ? (
        <EmptyState title="No employees enrolled" description="Enroll employees first to track their attendance." />
      ) : records.length === 0 ? (
        <EmptyState title="No attendance records" description={`No records for ${fmt.date(date)}. Add records manually or wait for employees to clock in.`} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th>Status</th>
                {can('edit_all') && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {records.map(rec => (
                <tr key={rec.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={`${rec.employee.firstName} ${rec.employee.lastName}`} color={rec.employee.avatarColor} size="sm" />
                      <div>
                        <p className="font-semibold text-xs text-ink-800">{rec.employee.firstName} {rec.employee.lastName}</p>
                        <p className="text-[11px] text-ink-400">{rec.employee.employeeCode}</p>
                      </div>
                    </div>
                  </td>
                  <td><span className="text-xs text-ink-600">{rec.employee.department}</span></td>
                  <td><span className="text-xs text-ink-600">{rec.clockIn || '—'}</span></td>
                  <td><span className="text-xs text-ink-600">{rec.clockOut || '—'}</span></td>
                  <td><StatusBadge status={rec.status} /></td>
                  {can('edit_all') && (
                    <td>
                      <button onClick={() => setEditRecord(rec)} className="btn-ghost btn-sm p-1.5 rounded-md text-xs">Edit</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Record Modal */}
      <AttendanceModal
        open={addModal}
        onClose={() => setAddModal(false)}
        onSave={handleAddRecord}
        employees={employees}
        title="Add Attendance Record"
        initial={{ employeeId: '', clockIn: '', clockOut: '', status: 'present', notes: '' }}
      />

      {/* Edit Record Modal */}
      {editRecord && (
        <AttendanceModal
          open={!!editRecord}
          onClose={() => setEditRecord(null)}
          onSave={handleEditRecord}
          employees={employees}
          title="Edit Attendance Record"
          initial={{ employeeId: editRecord.employeeId, clockIn: editRecord.clockIn || '', clockOut: editRecord.clockOut || '', status: editRecord.status, notes: editRecord.notes || '' }}
        />
      )}
    </div>
  );
}

function AttendanceModal({ open, onClose, onSave, employees, title, initial }) {
  const [form, setForm] = useState(initial);
  const f = k => v => setForm(p => ({ ...p, [k]: v }));
  const empOptions = [{ value: '', label: 'Select employee…' }, ...employees.map(e => ({ value: e.id, label: `${e.firstName} ${e.lastName}` }))];

  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { if (form.employeeId && form.status) { onSave(form); } }}>Save</button>
        </>
      }
    >
      <div className="space-y-3">
        <SelectField label="Employee" value={form.employeeId} onChange={f('employeeId')} options={empOptions} />
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Clock In" type="time" value={form.clockIn} onChange={f('clockIn')} />
          <InputField label="Clock Out" type="time" value={form.clockOut} onChange={f('clockOut')} />
        </div>
        <SelectField label="Status" value={form.status} onChange={f('status')}
          options={[{ value: 'present', label: 'Present' }, { value: 'late', label: 'Late' }, { value: 'absent', label: 'Absent' }, { value: 'half-day', label: 'Half Day' }]}
        />
        <InputField label="Notes" value={form.notes} onChange={f('notes')} placeholder="Optional notes…" />
      </div>
    </Modal>
  );
}
