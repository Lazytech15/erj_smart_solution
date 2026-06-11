import { useState } from 'react';
import { Clock, Plus, Trash2, Pencil, Users } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';
import { SectionHeader, Modal, InputField, EmptyState } from '../components/ui';
import { useToast } from '../context/ToastContext';
import PlanGate from '../components/PlanGate';

const SHIFT_COLORS = ['#f59e0b','#4f6ef7','#10b981','#8b5cf6','#ef4444','#ec4899','#06b6d4'];

const EMPTY_FORM = { name: '', start: '08:00', end: '17:00' };

function ShiftsContent() {
  const toast = useToast();
  const { subscription, addShift, removeShift, updateShift } = useSubscription();
  const shifts    = subscription?.shifts || [];
  const employees = subscription?.enrolledEmployees || [];

  const [addModal,  setAddModal]  = useState(false);
  const [editTarget, setEditTarget] = useState(null); // shift object being edited
  const [form,      setForm]      = useState(EMPTY_FORM);
  const f = k => v => setForm(p => ({ ...p, [k]: v }));

  // count employees per shift id
  function empCount(shiftId) {
    return employees.filter(e => e.shiftId && String(e.shiftId) === String(shiftId)).length;
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setAddModal(true);
  }

  function openEdit(shift) {
    setForm({ name: shift.name, start: shift.start, end: shift.end });
    setEditTarget(shift);
  }

  function handleAdd() {
    if (!form.name.trim()) return;
    addShift({ ...form, color: SHIFT_COLORS[shifts.length % SHIFT_COLORS.length] });
    toast(`Shift "${form.name}" added`, 'success');
    setForm(EMPTY_FORM);
    setAddModal(false);
  }

  function handleEdit() {
    if (!form.name.trim()) return;
    updateShift(editTarget.id, { name: form.name, start: form.start, end: form.end });
    toast(`Shift "${form.name}" updated`, 'success');
    setEditTarget(null);
  }

  function handleRemove(shift) {
    const count = empCount(shift.id);
    if (count > 0) {
      toast(`Cannot remove — ${count} employee${count !== 1 ? 's' : ''} assigned to this shift`, 'error');
      return;
    }
    removeShift(shift.id);
    toast('Shift removed', 'warning');
  }

  const modalFooter = (onPrimary, label) => (
    <>
      <button className="btn-secondary" onClick={() => { setAddModal(false); setEditTarget(null); }}>Cancel</button>
      <button className="btn-primary" onClick={onPrimary}>{label}</button>
    </>
  );

  const shiftForm = (
    <div className="space-y-3">
      <InputField label="Shift Name" value={form.name} onChange={f('name')} placeholder="e.g. Morning Shift" />
      <div className="grid grid-cols-2 gap-3">
        <InputField label="Start Time" type="time" value={form.start} onChange={f('start')} />
        <InputField label="End Time"   type="time" value={form.end}   onChange={f('end')} />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Shifts Management"
        description={`${shifts.length} shift${shifts.length !== 1 ? 's' : ''} configured`}
        actions={
          <button className="btn-primary btn-sm" onClick={openAdd}>
            <Plus size={13} /> Add Shift
          </button>
        }
      />

      {shifts.length === 0 ? (
        <EmptyState icon={<Clock size={24} />} title="No shifts yet" description="Define work shifts for your employees." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {shifts.map(shift => {
            const count = empCount(shift.id);
            return (
              <div key={shift.id} className="card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: shift.color + '22' }}>
                  <Clock size={18} style={{ color: shift.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink-800 truncate">{shift.name}</p>
                  <p className="text-xs text-ink-400">{shift.start} – {shift.end}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Users size={11} className="text-ink-300" />
                    <span className="text-[11px] text-ink-400">{count} employee{count !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(shift)}
                    className="p-1.5 rounded-lg text-ink-300 hover:text-brand-500 hover:bg-brand-50 transition-colors"
                    title="Edit shift"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleRemove(shift)}
                    className="p-1.5 rounded-lg text-ink-300 hover:text-danger-500 hover:bg-danger-50 transition-colors"
                    title="Remove shift"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Shift" width="max-w-sm"
        footer={modalFooter(handleAdd, 'Add Shift')}
      >
        {shiftForm}
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Shift" width="max-w-sm"
        footer={modalFooter(handleEdit, 'Save Changes')}
      >
        {shiftForm}
      </Modal>
    </div>
  );
}

export default function ShiftsPage() {
  return (
    <PlanGate feature="shifts">
      <ShiftsContent />
    </PlanGate>
  );
}
