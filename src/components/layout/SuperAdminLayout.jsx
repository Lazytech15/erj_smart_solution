import { Outlet, useNavigate } from 'react-router-dom';
import { ShieldAlert, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/**
 * Layout shell for the /superadmin area.
 * Intentionally does NOT use the regular Sidebar/AppLayout — the superadmin
 * is not scoped to a single company subscription, so none of the
 * subscription-aware nav/plan-gating logic applies here.
 */
export default function SuperAdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0b0f1a' }}>
      <header
        className="flex items-center justify-between px-6 py-3 shrink-0"
        style={{ background: 'linear-gradient(145deg, #0f172a 0%, #1e1b4b 100%)', borderBottom: '1px solid rgba(99,102,241,0.18)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(239,68,68,0.15)' }}
          >
            <ShieldAlert size={16} style={{ color: '#f87171' }} />
          </div>
          <div>
            <p className="text-white text-sm font-bold leading-none">Superadmin Console</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              ERJ Smart Solutions — platform owner only
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {user?.name || user?.email}
          </span>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
          >
            <LogOut size={13} /> Log Out
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
