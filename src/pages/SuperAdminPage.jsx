import { useEffect, useState, useMemo } from 'react';
import {
  Building2, Users, KeyRound, Trash2, Search, RefreshCw,
  CreditCard, ShieldCheck, Pencil, X, Lock, Sliders,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { PLANS } from '../context/SubscriptionContext';
import { can, SUPERADMIN_PERMISSIONS } from '../utils/abac';
import {
  getAllSubscriptionsSummary, adminUpdateSubscription, adminDeleteSubscription,
  getAllAccounts, adminResetPassword, adminUpdateAccountRole, adminDeleteAccount,
  adminSetSubSuperadminPermissions, getPlatformStats,
} from '../utils/db';
import { StatCard, Modal, SearchInput, InputField, SelectField, Spinner, StatusBadge, EmptyState } from '../components/ui';

const TABS = [
  { id: 'subscriptions', label: 'Subscriptions', icon: Building2 },
  { id: 'accounts',      label: 'Accounts',      icon: Users },
];

const ROLE_OPTIONS = [
  { value: 'employee', label: 'Employee' },
  { value: 'manager',  label: 'Manager' },
  { value: 'hr',       label: 'HR' },
  { value: 'admin',    label: 'Admin' },
  { value: 'sub_superadmin', label: 'Sub-superadmin' },
  { value: 'superadmin',     label: 'Superadmin' },
];

const STATUS_OPTIONS = [
  { value: 'trialing',  label: 'Trialing' },
  { value: 'active',    label: 'Active' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function SuperAdminPage() {
  const toast = useToast();
  const { user } = useAuth();
  const isTrueSuperadmin = user?.role === 'superadmin';

  // What the CURRENTLY LOGGED IN superadmin/sub-superadmin is allowed to do.
  const perms = {
    manageSubscriptions: can(user, 'manage_subscriptions'),
    deleteSubscriptions: can(user, 'delete_subscriptions'),
    manageAccounts:      can(user, 'manage_accounts'),
    resetPasswords:      can(user, 'reset_passwords'),
    deleteAccounts:      can(user, 'delete_accounts'),
  };

  // Sub-superadmins can never grant/see the 'superadmin' or 'sub_superadmin'
  // roles in the role dropdown — only a true superadmin can create/manage them.
  const assignableRoleOptions = isTrueSuperadmin
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter(o => !['superadmin', 'sub_superadmin'].includes(o.value));

  const [tab, setTab] = useState('subscriptions');

  const [stats, setStats] = useState(null);
  const [subs, setSubs]   = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');

  const [editingSub, setEditingSub]     = useState(null); // subscription being edited
  const [editingAccount, setEditingAccount] = useState(null); // account being edited / reset
  const [editingPermissions, setEditingPermissions] = useState(null); // sub_superadmin permissions editor

  async function loadAll() {
    setLoading(true);
    try {
      const [s, a, st] = await Promise.all([
        getAllSubscriptionsSummary(),
        getAllAccounts(),
        getPlatformStats(),
      ]);
      setSubs(s);
      setAccounts(a);
      setStats(st);
    } catch (err) {
      toast(err.message || 'Failed to load platform data.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []); // eslint-disable-line

  const filteredSubs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subs;
    return subs.filter(s =>
      (s.company?.name || '').toLowerCase().includes(q) ||
      s.subscriptionId.toLowerCase().includes(q)
    );
  }, [subs, search]);

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(a =>
      (a.name || '').toLowerCase().includes(q) ||
      (a.email || '').toLowerCase().includes(q) ||
      (a.role || '').toLowerCase().includes(q)
    );
  }, [accounts, search]);

  async function handleSaveSubscription(planId, status) {
    if (!perms.manageSubscriptions) { toast('You do not have permission to edit subscriptions.', 'error'); return; }
    try {
      await adminUpdateSubscription(editingSub.subscriptionId, { planId, status });
      toast('Subscription updated.', 'success');
      setEditingSub(null);
      loadAll();
    } catch (err) {
      toast(err.message || 'Failed to update subscription.', 'error');
    }
  }

  async function handleDeleteSubscription(sub) {
    if (!perms.deleteSubscriptions) { toast('You do not have permission to delete subscriptions.', 'error'); return; }
    if (!window.confirm(`Permanently delete "${sub.company?.name || sub.subscriptionId}" and all of its accounts? This cannot be undone.`)) return;
    try {
      await adminDeleteSubscription(sub.subscriptionId);
      toast('Subscription deleted.', 'success');
      loadAll();
    } catch (err) {
      toast(err.message || 'Failed to delete subscription.', 'error');
    }
  }

  async function handleResetPassword(account, newPassword) {
    if (!perms.resetPasswords) { toast('You do not have permission to reset passwords.', 'error'); return; }
    try {
      await adminResetPassword(account.id, newPassword);
      toast(`Password updated for ${account.email}.`, 'success');
      setEditingAccount(null);
    } catch (err) {
      toast(err.message || 'Failed to reset password.', 'error');
    }
  }

  async function handleChangeRole(account, role) {
    if (!perms.manageAccounts) { toast('You do not have permission to change account roles.', 'error'); return; }
    if (!isTrueSuperadmin && ['superadmin', 'sub_superadmin'].includes(role)) {
      toast('Only a superadmin can grant superadmin-level access.', 'error');
      return;
    }
    try {
      await adminUpdateAccountRole(account.id, role);
      toast(`Role updated to ${role.replace('_', '-')}.`, 'success');
      await loadAll();
      // Promoting to sub_superadmin starts with zero permissions —
      // immediately prompt the (true) superadmin to grant some.
      if (role === 'sub_superadmin' && isTrueSuperadmin) {
        setEditingPermissions({ ...account, role, permissions: [] });
      }
    } catch (err) {
      toast(err.message || 'Failed to change role.', 'error');
    }
  }

  async function handleSavePermissions(account, permissions) {
    try {
      await adminSetSubSuperadminPermissions(account.id, permissions);
      toast(`Permissions updated for ${account.email}.`, 'success');
      setEditingPermissions(null);
      loadAll();
    } catch (err) {
      toast(err.message || 'Failed to update permissions.', 'error');
    }
  }

  async function handleDeleteAccount(account) {
    if (!perms.deleteAccounts) { toast('You do not have permission to delete accounts.', 'error'); return; }
    if (!window.confirm(`Remove account "${account.email}"? This deletes their profile row only.`)) return;
    try {
      await adminDeleteAccount(account.id);
      toast('Account removed.', 'success');
      loadAll();
    } catch (err) {
      toast(err.message || 'Failed to remove account.', 'error');
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Platform Overview</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Full control over every client subscription and account.
          </p>
        </div>
        <button
          onClick={loadAll}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg"
          style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Companies"  value={stats.totalCompanies}   icon={Building2}    color="brand" />
          <StatCard label="Active"     value={stats.activeCompanies}  icon={ShieldCheck}  color="success" />
          <StatCard label="Trialing"   value={stats.trialingCompanies}icon={CreditCard}   color="info" />
          <StatCard label="Total Employees" value={stats.totalEmployees} icon={Users}     color="neutral" />
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors"
              style={{
                background: tab === t.id ? 'rgba(99,102,241,0.25)' : 'transparent',
                color: tab === t.id ? '#c7d2fe' : 'rgba(255,255,255,0.45)',
              }}
            >
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder={tab === 'subscriptions' ? 'Search companies…' : 'Search accounts…'} className="w-72" />
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16"><Spinner size={22} /></div>
        ) : tab === 'subscriptions' ? (
          filteredSubs.length === 0 ? (
            <EmptyState icon={Building2} title="No subscriptions found" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'rgba(255,255,255,0.35)' }} className="text-xs uppercase tracking-wide">
                  <th className="text-left font-semibold px-5 py-3">Company</th>
                  <th className="text-left font-semibold px-5 py-3">Plan</th>
                  <th className="text-left font-semibold px-5 py-3">Status</th>
                  <th className="text-left font-semibold px-5 py-3">Employees</th>
                  <th className="text-right font-semibold px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubs.map(s => (
                  <tr key={s.subscriptionId} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <td className="px-5 py-3 text-white font-medium">
                      {s.company?.name || s.subscriptionId}
                      <div className="text-[11px] font-normal" style={{ color: 'rgba(255,255,255,0.35)' }}>{s.subscriptionId}</div>
                    </td>
                    <td className="px-5 py-3" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      {PLANS.find(p => p.id === s.planId)?.name || s.planId}
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-5 py-3" style={{ color: 'rgba(255,255,255,0.7)' }}>{s.employeeCount}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => perms.manageSubscriptions ? setEditingSub(s) : toast('You do not have permission to edit subscriptions.', 'error')}
                        disabled={!perms.manageSubscriptions}
                        className="p-1.5 rounded-lg mr-1 disabled:opacity-30"
                        style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteSubscription(s)}
                        disabled={!perms.deleteSubscriptions}
                        className="p-1.5 rounded-lg disabled:opacity-30"
                        style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          filteredAccounts.length === 0 ? (
            <EmptyState icon={Users} title="No accounts found" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'rgba(255,255,255,0.35)' }} className="text-xs uppercase tracking-wide">
                  <th className="text-left font-semibold px-5 py-3">Name</th>
                  <th className="text-left font-semibold px-5 py-3">Email</th>
                  <th className="text-left font-semibold px-5 py-3">Role</th>
                  <th className="text-left font-semibold px-5 py-3">Subscription</th>
                  <th className="text-right font-semibold px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map(a => (
                  <tr key={a.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <td className="px-5 py-3 text-white font-medium">{a.name || '—'}</td>
                    <td className="px-5 py-3" style={{ color: 'rgba(255,255,255,0.7)' }}>{a.email}</td>
                    <td className="px-5 py-3">
                      {/* A superadmin/sub_superadmin's own role can never be changed from this table. */}
                      {['superadmin', 'sub_superadmin'].includes(a.role) && a.id === user?.id ? (
                        <span className="text-xs font-semibold px-2 py-1 rounded-lg inline-flex items-center gap-1"
                          style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                          <Lock size={10} /> {a.role === 'superadmin' ? 'Superadmin (you)' : 'Sub-superadmin (you)'}
                        </span>
                      ) : (
                        <select
                          value={a.role}
                          disabled={!perms.manageAccounts || (a.role === 'superadmin' && !isTrueSuperadmin)}
                          onChange={e => handleChangeRole(a, e.target.value)}
                          className="text-xs font-semibold rounded-lg px-2 py-1 disabled:opacity-30"
                          style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: 'none' }}
                        >
                          {/* Always include the account's current role even if it'd
                              otherwise be filtered out, so the <select> shows correctly. */}
                          {(assignableRoleOptions.some(o => o.value === a.role)
                            ? assignableRoleOptions
                            : [{ value: a.role, label: a.role }, ...assignableRoleOptions]
                          ).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{a.subscriptionId || '—'}</td>
                    <td className="px-5 py-3 text-right">
                      {a.role === 'sub_superadmin' && isTrueSuperadmin && (
                        <button
                          onClick={() => setEditingPermissions(a)}
                          className="p-1.5 rounded-lg mr-1"
                          style={{ background: 'rgba(168,85,247,0.15)', color: '#c4b5fd' }}
                          title="Edit permissions"
                        >
                          <Sliders size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => perms.resetPasswords ? setEditingAccount(a) : toast('You do not have permission to reset passwords.', 'error')}
                        disabled={!perms.resetPasswords}
                        className="p-1.5 rounded-lg mr-1 disabled:opacity-30"
                        style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}
                        title="Reset password"
                      >
                        <KeyRound size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(a)}
                        disabled={!perms.deleteAccounts || a.id === user?.id}
                        className="p-1.5 rounded-lg disabled:opacity-30"
                        style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
                        title="Remove account"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {editingSub && (
        <EditSubscriptionModal
          sub={editingSub}
          onClose={() => setEditingSub(null)}
          onSave={handleSaveSubscription}
        />
      )}

      {editingAccount && (
        <ResetPasswordModal
          account={editingAccount}
          onClose={() => setEditingAccount(null)}
          onSave={(pw) => handleResetPassword(editingAccount, pw)}
        />
      )}

      {editingPermissions && (
        <PermissionsModal
          account={editingPermissions}
          onClose={() => setEditingPermissions(null)}
          onSave={(permissions) => handleSavePermissions(editingPermissions, permissions)}
        />
      )}
    </div>
  );
}

function EditSubscriptionModal({ sub, onClose, onSave }) {
  const [planId, setPlanId] = useState(sub.planId);
  const [status, setStatus] = useState(sub.status);
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Manage subscription — ${sub.company?.name || sub.subscriptionId}`}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost px-4 py-2 rounded-lg text-sm">Cancel</button>
          <button
            disabled={saving}
            onClick={async () => { setSaving(true); await onSave(planId, status); setSaving(false); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#4f46e5' }}
          >
            {saving ? <Spinner size={14} /> : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectField
          label="Plan"
          value={planId}
          onChange={setPlanId}
          options={PLANS.map(p => ({ value: p.id, label: p.name }))}
        />
        <SelectField
          label="Status"
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
        />
      </div>
    </Modal>
  );
}

function PermissionsModal({ account, onClose, onSave }) {
  const [selected, setSelected] = useState(new Set(account.permissions ?? []));
  const [saving, setSaving] = useState(false);

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Permissions — ${account.name || account.email}`}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost px-4 py-2 rounded-lg text-sm">Cancel</button>
          <button
            disabled={saving}
            onClick={async () => { setSaving(true); await onSave([...selected]); setSaving(false); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#4f46e5' }}
          >
            {saving ? <Spinner size={14} /> : 'Save permissions'}
          </button>
        </>
      }
    >
      <p className="text-xs text-ink-400 mb-4">
        This sub-superadmin can only do what's checked below. Nothing here grants the
        ability to create more superadmins or sub-superadmins — only a true superadmin can do that.
      </p>
      <div className="space-y-2">
        {SUPERADMIN_PERMISSIONS.map(p => (
          <label key={p.id} className="flex items-center gap-2.5 text-sm text-ink-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selected.has(p.id)}
              onChange={() => toggle(p.id)}
              className="w-4 h-4 rounded accent-brand-600"
            />
            {p.label}
          </label>
        ))}
      </div>
    </Modal>
  );
}
function ResetPasswordModal({ account, onClose, onSave }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reset password — ${account.email}`}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost px-4 py-2 rounded-lg text-sm">Cancel</button>
          <button
            disabled={saving || password.length < 6}
            onClick={async () => { setSaving(true); await onSave(password); setSaving(false); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#4f46e5' }}
          >
            {saving ? <Spinner size={14} /> : 'Set new password'}
          </button>
        </>
      }
    >
      <InputField
        label="New password"
        type="text"
        value={password}
        onChange={setPassword}
        placeholder="At least 6 characters"
      />
    </Modal>
  );
}
