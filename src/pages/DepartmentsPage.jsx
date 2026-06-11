import { useState } from 'react';
import { Building2, Plus, Trash2 } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';
import { SectionHeader, Modal, InputField, EmptyState } from '../components/ui';
import { useToast } from '../context/ToastContext';
import PlanGate from '../components/PlanGate';

function DepartmentsContent() {
  const toast = useToast();
  const { subscription, addDepartment, removeDepartment } = useSubscription();
  const departments = subscription?.departments || [];
  const employees = subscription?.enrolledEmployees || [];

  const [addModal, setAddModal] = useState(false);
  const [newName, setNewName] = useState('');

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    if (departments.includes(name)) { toast('Department already exists', 'warning'); return; }
    addDepartment(name);
    toast(`Department "${name}" added`, 'success');
    setNewName('');
    setAddModal(false);
  }

  function handleRemove(name) {
    const count = employees.filter(e => e.department === name).length;
    if (count > 0) { toast(`Cannot remove: ${count} employee(s) are in this department`, 'error'); return; }
    removeDepartment(name);
    toast(`Department "${name}" removed`, 'warning');
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Departments Management"
        description={`${departments.length} department${departments.length !== 1 ? 's' : ''}`}
        actions={
          <button className="btn-primary btn-sm" onClick={() => setAddModal(true)}>
            <Plus size={13} /> Add Department
          </button>
        }
      />

      {departments.length === 0 ? (
        <EmptyState icon={<Building2 size={24} />} title="No departments yet" description="Add departments to organise your employees." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {departments.map(dept => {
            const count = employees.filter(e => e.department === dept).length;
            return (
              <div key={dept} className="card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                  <Building2 size={18} className="text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink-800 truncate">{dept}</p>
                  <p className="text-xs text-ink-400">{count} employee{count !== 1 ? 's' : ''}</p>
                </div>
                <button onClick={() => handleRemove(dept)} className="p-1.5 rounded-lg text-ink-300 hover:text-danger-500 hover:bg-danger-50 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Department" width="max-w-sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAddModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleAdd}>Add</button>
          </>
        }
      >
        <InputField label="Department Name" value={newName} onChange={setNewName} placeholder="e.g. Engineering" autoFocus />
      </Modal>
    </div>
  );
}

export default function DepartmentsPage() {
  return (
    <PlanGate feature="departments">
      <DepartmentsContent />
    </PlanGate>
  );
}
