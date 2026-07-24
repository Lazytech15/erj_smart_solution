import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Clock, Users, CalendarDays, BarChart3,
  Settings, FileText, Building2, Package, Lock,
  UserCircle, LifeBuoy,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSubscription, PLANS } from "../../context/SubscriptionContext";

/* Brand from login dark-navy theme */
const BRAND_BG     = 'linear-gradient(145deg, #0f172a 0%, #1e1b4b 60%, #1e1b4b 100%)';
const ACTIVE_BG    = 'rgba(99,102,241,0.22)';
const ACTIVE_COLOR = '#a5b4fc';
const ACTIVE_BAR   = '#6366f1';
const HOVER_BG     = 'rgba(255,255,255,0.05)';
const HOVER_COLOR  = 'rgba(255,255,255,0.8)';
const MUTED_COLOR  = 'rgba(255,255,255,0.38)';
const TRIAL_BG     = 'rgba(99,102,241,0.12)';
const TRIAL_BORDER = 'rgba(99,102,241,0.3)';

const NAV = [
  { to: "/app/dashboard",   icon: LayoutDashboard, label: "Dashboard",   roles: ["admin","hr","manager","employee"] },
  { to: "/app/attendance",  icon: Clock,           label: "Attendance",  roles: ["admin","hr","manager","employee"] },
  { to: "/app/employees",   icon: Users,           label: "Employees",   roles: ["admin","hr","manager"] },
  { to: "/app/leave",       icon: CalendarDays,    label: "Leave",       roles: ["admin","hr","manager","employee"] },
  { to: "/app/reports",     icon: BarChart3,       label: "Reports",     roles: ["admin","hr","manager"],  planFeature: "reports" },
  { to: "/app/shifts",      icon: FileText,        label: "Shifts",      roles: ["admin","hr"],            planFeature: "shifts" },
  { to: "/app/departments", icon: Building2,       label: "Departments", roles: ["admin","hr"],            planFeature: "departments" },
  { to: "/app/subscription",icon: Package,         label: "Subscription",roles: ["admin"] },
];

/* Footer group — account/utility links, kept separate from the main nav
   and shown below the divider where "Log Out" used to live. Log Out itself
   was removed from here since it's already reachable from the header's
   profile dropdown (top-right avatar menu). */
const FOOTER_NAV = [
  { to: "/app/profile",  icon: UserCircle, label: "Profile",      roles: ["admin","hr","manager","employee"] },
  { to: "/app/settings", icon: Settings,   label: "Settings",     roles: ["admin"] },
  { to: "/app/help",     icon: LifeBuoy,   label: "Help Center",  roles: ["admin","hr","manager","employee"] },
];

function CompanyBadge({ name, size = 64, src }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const colors = ["#4f46e5","#6366f1","#7c3aed","#0891b2","#0d9488"];
  const bg = colors[(name || "").charCodeAt(0) % colors.length];
  const baseStyle = {
    width: size, height: size, borderRadius: Math.round(size * 0.26),
    flexShrink: 0,
    border: "2px solid rgba(99,102,241,0.35)",
    boxShadow: "0 0 0 4px rgba(99,102,241,0.1)",
    transition: "width 220ms cubic-bezier(.4,0,.2,1), height 220ms cubic-bezier(.4,0,.2,1), font-size 220ms",
  };
  if (src) {
    return (
      <div style={{ ...baseStyle, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <img src={src} alt={name || "Company logo"} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
    );
  }
  return (
    <div style={{
      ...baseStyle, background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.34, fontWeight: 700, color: "#fff",
    }}>
      {initial}
    </div>
  );
}

function Tooltip({ label }) {
  return (
    <span style={{
      position: "absolute", left: "110%", top: "50%", transform: "translateY(-50%)",
      background: "#1e1b4b", color: "#e0e7ff",
      fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 8,
      whiteSpace: "nowrap", boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
      border: "1px solid rgba(99,102,241,0.25)",
      pointerEvents: "none", zIndex: 100,
    }}>
      {label}
    </span>
  );
}

export default function Sidebar() {
  const { user } = useAuth();
  const { subscription, trialDaysLeft } = useSubscription();
  const [expanded, setExpanded] = useState(false);

  const visible = NAV.filter(n => n.roles.includes(user?.role || "employee"));
  const visibleFooter = FOOTER_NAV.filter(n => n.roles.includes(user?.role || "employee"));
  const collapsed = !expanded;
  const planLimits = subscription?.planId
    ? (PLANS.find(p => p.id === subscription.planId)?.limits ?? {})
    : {};

  const S = {
    aside: {
      width: collapsed ? 72 : 240,
      display: "flex", flexDirection: "column", height: "100vh",
      background: BRAND_BG,
      transition: "width 220ms cubic-bezier(.4,0,.2,1)",
      flexShrink: 0, overflow: "hidden", position: "relative",
    },
    /* subtle top glow */
    glow: {
      position: "absolute", top: -80, left: -80, width: 240, height: 240,
      borderRadius: "50%", background: "radial-gradient(circle, #6366f1, transparent)",
      opacity: 0.07, pointerEvents: "none",
    },
    profile: {
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: collapsed ? "20px 0 16px" : "24px 16px 16px",
      gap: 10, transition: "padding 220ms", position: "relative", zIndex: 1,
    },
    userName: {
      color: "#fff", fontWeight: 700, fontSize: 15, textAlign: "center",
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      maxWidth: 180,
      opacity: collapsed ? 0 : 1, maxHeight: collapsed ? 0 : 24,
      transition: "opacity 150ms, max-height 150ms",
    },
    userRole: {
      fontSize: 11, textAlign: "center", whiteSpace: "nowrap",
      overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180,
      color: MUTED_COLOR,
      opacity: collapsed ? 0 : 1, maxHeight: collapsed ? 0 : 20,
      transition: "opacity 150ms, max-height 150ms",
    },
    divider: {
      height: 1, margin: "0 16px 8px",
      background: "rgba(255,255,255,0.06)",
    },
    nav: {
      flex: 1, overflowY: "auto", overflowX: "hidden",
      padding: "4px 8px", display: "flex", flexDirection: "column", gap: 2,
      position: "relative", zIndex: 1,
    },
    trialBanner: {
      margin: "0 8px 8px", padding: "10px 12px", borderRadius: 12,
      background: TRIAL_BG, border: `1px solid ${TRIAL_BORDER}`,
      overflow: "hidden", opacity: collapsed ? 0 : 1,
      maxHeight: collapsed ? 0 : 60,
      transition: "opacity 150ms, max-height 220ms",
      position: "relative", zIndex: 1,
    },
  };

  return (
    <aside
      style={S.aside}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Top glow blob */}
      <div style={S.glow} />

      {/* ── Company ── */}
      <div style={S.profile}>
        <CompanyBadge
          name={subscription?.company?.name}
          src={subscription?.settings?.companyLogoUrl}
          size={collapsed ? 36 : 56}
        />
        <div style={S.userName}>{subscription?.company?.name || "ERJ Smart Solutions"}</div>
      </div>

      <div style={S.divider} />

      {/* ── Trial banner ── */}
      {subscription?.status === "trialing" && trialDaysLeft > 0 && (
        <div style={S.trialBanner}>
          <p style={{ color: "#a5b4fc", fontSize: 11, fontWeight: 700, margin: 0 }}>
            {trialDaysLeft} days left in trial
          </p>
          <p style={{ color: "rgba(165,180,252,0.55)", fontSize: 10, margin: "2px 0 0" }}>
            Upgrade anytime
          </p>
        </div>
      )}

      {/* ── Nav items ── */}
      <nav style={S.nav}>
        {visible.map(({ to, icon: Icon, label, planFeature }) => {
          const isLocked = planFeature ? planLimits[planFeature] === false : false;
          return (
            <NavLink
              key={to} to={to} title={collapsed ? label : undefined}
              style={{ textDecoration: "none", position: "relative", display: "flex" }}
            >
              {({ isActive }) => (
                <NavItem
                  icon={Icon} label={label} isActive={isActive}
                  collapsed={collapsed} isLocked={isLocked}
                />
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* ── Footer nav (Profile / Settings / Help Center) ── */}
      <div style={{ padding: "4px 8px 10px", zIndex: 1, position: "relative" }}>
        <div style={{ ...S.divider, margin: "0 8px 6px" }} />
        {visibleFooter.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to} to={to} title={collapsed ? label : undefined}
            style={{ textDecoration: "none", position: "relative", display: "flex" }}
          >
            {({ isActive }) => (
              <NavItem icon={Icon} label={label} isActive={isActive} collapsed={collapsed} isLocked={false} />
            )}
          </NavLink>
        ))}
      </div>
    </aside>
  );
}

function NavItem({ icon: Icon, label, isActive, collapsed, isLocked }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "flex-start",
        gap: collapsed ? 0 : 10,
        padding: collapsed ? "11px" : "11px 14px",
        width: "100%", borderRadius: 12,
        background: isActive ? ACTIVE_BG : hovered ? HOVER_BG : "transparent",
        color: isActive ? ACTIVE_COLOR : hovered ? HOVER_COLOR : MUTED_COLOR,
        fontSize: 14, fontWeight: isActive ? 600 : 500,
        cursor: "pointer",
        transition: "background 0.2s, color 0.2s, padding 220ms cubic-bezier(.4,0,.2,1), gap 220ms",
        position: "relative", userSelect: "none", boxSizing: "border-box",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Active indicator bar */}
      <div style={{
        position: "absolute", left: 0, top: "18%", bottom: "18%", width: 3,
        borderRadius: "0 3px 3px 0",
        background: isActive ? ACTIVE_BAR : "transparent",
        transition: "background 0.15s",
        boxShadow: isActive ? `0 0 8px ${ACTIVE_BAR}` : "none",
      }} />

      <Icon size={18} style={{ flexShrink: 0 }} />

      <span style={{
        whiteSpace: "nowrap", opacity: collapsed ? 0 : 1,
        maxWidth: collapsed ? 0 : 160, overflow: "hidden",
        transition: "opacity 150ms, max-width 220ms cubic-bezier(.4,0,.2,1)", flex: 1,
      }}>
        {label}
      </span>

      {isLocked && !collapsed && (
        <Lock size={11} style={{ opacity: 0.35, flexShrink: 0 }} />
      )}
      {collapsed && hovered && <Tooltip label={label} />}
    </div>
  );
}
