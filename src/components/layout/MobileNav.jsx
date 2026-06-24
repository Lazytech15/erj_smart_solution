import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Clock, Users, CalendarDays, BarChart3,
  Settings, FileText, Building2, Package, Lock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSubscription, PLANS } from '../../context/SubscriptionContext';

const NAV = [
  { to: '/app/dashboard',    icon: LayoutDashboard, label: 'Dashboard',    roles: ['admin','hr','manager','employee'] },
  { to: '/app/attendance',   icon: Clock,           label: 'Attendance',   roles: ['admin','hr','manager','employee'] },
  { to: '/app/employees',    icon: Users,           label: 'Employees',    roles: ['admin','hr','manager'] },
  { to: '/app/leave',        icon: CalendarDays,    label: 'Leave',        roles: ['admin','hr','manager','employee'] },
  { to: '/app/reports',      icon: BarChart3,       label: 'Reports',      roles: ['admin','hr','manager'],  planFeature: 'reports' },
  { to: '/app/shifts',       icon: FileText,        label: 'Shifts',       roles: ['admin','hr'],            planFeature: 'shifts' },
  { to: '/app/departments',  icon: Building2,       label: 'Departments',  roles: ['admin','hr'],            planFeature: 'departments' },
  { to: '/app/subscription', icon: Package,         label: 'Subscription', roles: ['admin'] },
  { to: '/app/settings',     icon: Settings,        label: 'Settings',     roles: ['admin'] },
];

export default function MobileNav({ open, onClose }) {
  const { user } = useAuth();
  const { subscription, trialDaysLeft } = useSubscription();

  const visible = NAV.filter(n => n.roles.includes(user?.role || 'employee'));
  const planLimits = subscription?.planId
    ? (PLANS.find(p => p.id === subscription.planId)?.limits ?? {})
    : {};

  const initials = (user?.name || '?')
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  const colors = ['#4f46e5','#6366f1','#7c3aed','#0891b2','#0d9488'];
  const avatarBg = colors[(user?.name || '').charCodeAt(0) % colors.length];

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel — 2px inset from all three sides */}
      <div
        className="fixed z-50 flex flex-col"
        style={{
          top: 2,
          left: 2,
          right: 2,
          background: 'linear-gradient(145deg, #0f172a 0%, #1e1b4b 60%, #1e1b4b 100%)',
          borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
          maxHeight: 'calc(92dvh - 2px)',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {/* Glow blob */}
        <div style={{
          position: 'absolute', top: -60, left: -60, width: 200, height: 200,
          borderRadius: '50%', background: 'radial-gradient(circle, #6366f1, transparent)',
          opacity: 0.08, pointerEvents: 'none',
        }} />

        {/* ── Header row — display only, no dropdown ── */}
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 relative z-10 min-w-0">
          {/* Avatar */}
          <div style={{
            width: 36, height: 36, borderRadius: '50%', background: avatarBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
            border: '2px solid rgba(99,102,241,0.35)',
            boxShadow: '0 0 0 3px rgba(99,102,241,0.1)',
          }}>
            {initials}
          </div>

          {/* Name + email */}
          <div className="min-w-0 flex-1">
            <p style={{ color: '#fff', fontWeight: 700, fontSize: 13, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name || 'User'}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.email || user?.role || ''}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, margin: '0 16px 4px', background: 'rgba(255,255,255,0.07)' }} />

        {/* Trial banner */}
        {subscription?.status === 'trialing' && trialDaysLeft > 0 && (
          <div className="mx-3 mb-2 px-3.5 py-2.5 rounded-xl relative z-10"
            style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.28)' }}>
            <p style={{ color: '#a5b4fc', fontSize: 11, fontWeight: 700, margin: 0 }}>
              {trialDaysLeft} days left in trial
            </p>
            <p style={{ color: 'rgba(165,180,252,0.55)', fontSize: 10, marginTop: 2 }}>
              Upgrade anytime
            </p>
          </div>
        )}

        {/* Nav items */}
        <nav className="px-3 pb-4 flex flex-col gap-0.5 relative z-10">
          {visible.map(({ to, icon: Icon, label, planFeature }) => {
            const isLocked = planFeature ? planLimits[planFeature] === false : false;
            return (
              <NavLink
                key={to}
                to={to}
                onClick={onClose}
                style={{ textDecoration: 'none', position: 'relative' }}
              >
                {({ isActive }) => (
                  <div
                    className="flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all"
                    style={{
                      background: isActive ? 'rgba(99,102,241,0.22)' : 'transparent',
                      color: isActive ? '#a5b4fc' : 'rgba(255,255,255,0.55)',
                      fontWeight: isActive ? 600 : 500,
                      fontSize: 14,
                    }}
                  >
                    {isActive && (
                      <div style={{
                        position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                        width: 3, height: 20, borderRadius: '0 3px 3px 0',
                        background: '#6366f1', boxShadow: '0 0 8px #6366f1',
                      }} />
                    )}
                    <Icon size={17} style={{ flexShrink: 0 }} />
                    <span className="flex-1">{label}</span>
                    {isLocked && <Lock size={11} style={{ opacity: 0.35 }} />}
                  </div>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </>
  );
}
