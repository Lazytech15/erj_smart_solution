import { useState } from 'react';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';
import { SectionHeader, Modal, InputField, EmptyState } from '../components/ui';
import { useToast } from '../context/ToastContext';
import PlanGate from '../components/PlanGate';

const SHIFT_COLORS = ['#f59e0b','#4f6ef7','#10b981','#8b5cf6','#ef4444','#ec4899','#06b6d4'];

function ShiftsContent() {
  const toast = useToast();
  const { subscription, addShift, removeShift } = useSubscription();
  const shifts = subscription?.shifts || [];

  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState({ name: '', start: '08:00', end: '17:00' });
  const f = k => v => setForm(p => ({ ...p, [k]: v }));

  function handleAdd() {
    if (!form.name.trim()) return;
    addShift({ ...form, color: SHIFT_COLORS[shifts.length % SHIFT_COLORS.length] });
    toast(`Shift "${form.name}" added`, 'success');
    setForm({ name: '', start: '08:00', end: '17:00' });
    setAddModal(false);
  }

  function handleRemove(id) {
    removeShift(id);
    toast('Shift removed', 'warning');
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Shifts Management"
        description={`${shifts.length} shift${shifts.length !== 1 ? 's' : ''} configured`}
        actions={
          <button className="btn-primary btn-sm" onClick={() => setAddModal(true)}>
            <Plus size={13} /> Add Shift
          </button>
        }
      />

      {shifts.length === 0 ? (
        <EmptyState icon={<Clock size={24} />} title="No shifts yet" description="Define work shifts for your employees." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {shifts.map(shift => (
            <div key={shift.id} className="card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: shift.color + '22' }}>
                <Clock size={18} style={{ color: shift.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink-800 truncate">{shift.name}</p>
                <p className="text-xs text-ink-400">{shift.start} – {shift.end}</p>
              </div>
              <button onClick={() => handleRemove(shift.id)} className="p-1.5 rounded-lg text-ink-300 hover:text-danger-500 hover:bg-danger-50 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Shift" width="max-w-sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAddModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleAdd}>Add</button>
          </>
        }
      >
        <div className="space-y-3">
          <InputField label="Shift Name" value={form.name} onChange={f('name')} placeholder="e.g. Morning Shift" />
          <div className="grid grid-cols-2 gap-3">
            <InputField label="Start Time" type="time" value={form.start} onChange={f('start')} />
            <InputField label="End Time" type="time" value={form.end} onChange={f('end')} />
          </div>
        </div>
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
