import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Clock,
  Users,
  CalendarDays,
  BarChart3,
  Settings,
  FileText,
  Building2,
  LogOut,
  Package,
  Lock,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSubscription, PLANS } from "../../context/SubscriptionContext";

const NAV = [
  {
    to: "/app/dashboard",
    icon: LayoutDashboard,
    label: "Dashboard",
    roles: ["admin", "hr", "manager", "employee"],
  },
  {
    to: "/app/attendance",
    icon: Clock,
    label: "Attendance",
    roles: ["admin", "hr", "manager", "employee"],
  },
  {
    to: "/app/employees",
    icon: Users,
    label: "Employees",
    roles: ["admin", "hr", "manager"],
  },
  {
    to: "/app/leave",
    icon: CalendarDays,
    label: "Leave",
    roles: ["admin", "hr", "manager", "employee"],
  },
  {
    to: "/app/reports",
    icon: BarChart3,
    label: "Reports",
    roles: ["admin", "hr", "manager"],
    planFeature: "reports",
  },
  {
    to: "/app/shifts",
    icon: FileText,
    label: "Shifts",
    roles: ["admin", "hr"],
    planFeature: "shifts",
  },
  {
    to: "/app/departments",
    icon: Building2,
    label: "Departments",
    roles: ["admin", "hr"],
    planFeature: "departments",
  },
  {
    to: "/app/subscription",
    icon: Package,
    label: "Subscription",
    roles: ["admin"],
  },
  { to: "/app/settings", icon: Settings, label: "Settings", roles: ["admin"] },
];

function UserAvatar({ name, size = 64 }) {
  const initials = (name || "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const colors = ["#4B5694", "#7288AE", "#5b6ef5", "#10b981", "#f59e0b"];
  const hue = (name || "").charCodeAt(0) % colors.length;
  const bg = colors[hue];

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.34,
        fontWeight: 700,
        color: "#fff",
        border: "3px solid rgba(255,255,255,0.12)",
        flexShrink: 0,
        transition:
          "width 220ms cubic-bezier(.4,0,.2,1), height 220ms cubic-bezier(.4,0,.2,1), font-size 220ms",
      }}
    >
      {initials}
    </div>
  );
}

function Tooltip({ label }) {
  return (
    <span
      style={{
        position: "absolute",
        left: "110%",
        top: "50%",
        transform: "translateY(-50%)",
        background: "#1a1f35",
        color: "#e2e4f0",
        fontSize: 12,
        fontWeight: 600,
        padding: "5px 10px",
        borderRadius: 8,
        whiteSpace: "nowrap",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        pointerEvents: "none",
        zIndex: 100,
      }}
    >
      {label}
    </span>
  );
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { subscription, trialDaysLeft } = useSubscription();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const visible = NAV.filter((n) => n.roles.includes(user?.role || "employee"));
  const collapsed = !expanded;
  const planLimits = subscription?.planId
    ? (PLANS.find(p => p.id === subscription.planId)?.limits ?? {})
    : {};

  const S = {
    aside: {
      width: collapsed ? 72 : 240,
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      background: "#111844",
      transition: "width 220ms cubic-bezier(.4,0,.2,1)",
      flexShrink: 0,
      overflow: "hidden",
      position: "relative",
    },
    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px 0 16px",
      minHeight: 80,
    },
    logoRow: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      overflow: "hidden",
    },
    logoWrap: {
      width: 40,
      height: 40,
      borderRadius: 10,
      background: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
    },
    logoText: {
      color: "#fff",
      fontWeight: 800,
      fontSize: 13,
      letterSpacing: "0.5px",
      whiteSpace: "nowrap",
      textAlign: "center",
      opacity: collapsed ? 0 : 1,
      maxHeight: collapsed ? 0 : 20,
      transition: "opacity 180ms, max-height 220ms cubic-bezier(.4,0,.2,1)",
      overflow: "hidden",
    },
    profile: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: collapsed ? "16px 0" : "20px 16px 16px",
      gap: 10,
      transition: "padding 220ms",
    },
    userName: {
      color: "#fff",
      fontWeight: 700,
      fontSize: 15,
      textAlign: "center",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      maxWidth: 180,
      opacity: collapsed ? 0 : 1,
      maxHeight: collapsed ? 0 : 24,
      transition: "opacity 150ms, max-height 150ms",
    },
    userEmail: {
      color: "rgba(255,255,255,0.35)",
      fontSize: 11,
      textAlign: "center",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      maxWidth: 180,
      opacity: collapsed ? 0 : 1,
      maxHeight: collapsed ? 0 : 20,
      transition: "opacity 150ms, max-height 150ms",
    },
    nav: {
      flex: 1,
      overflowY: "auto",
      overflowX: "hidden",
      padding: "12px 8px",
      display: "flex",
      flexDirection: "column",
      gap: 2,
    },
    trialBanner: {
      margin: "0 8px 8px",
      padding: "10px 12px",
      borderRadius: 12,
      background: "rgba(75,86,148,0.25)",
      border: "1px solid rgba(75,86,148,0.4)",
      overflow: "hidden",
      opacity: collapsed ? 0 : 1,
      maxHeight: collapsed ? 0 : 60,
      transition: "opacity 150ms, max-height 220ms",
    },
  };

  return (
    <aside
      style={S.aside}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* ── Profile section ── */}
      <div style={S.profile}>
        <UserAvatar name={user?.name || "?"} size={collapsed ? 36 : 64} />
        <div style={S.userName}>{user?.name || "User"}</div>
        <div style={S.userEmail}>{user?.email || user?.role || ""}</div>
      </div>

      {/* ── Trial banner ── */}
      {subscription?.status === "trialing" && trialDaysLeft > 0 && (
        <div style={S.trialBanner}>
          <p
            style={{
              color: "#a5adff",
              fontSize: 11,
              fontWeight: 700,
              margin: 0,
            }}
          >
            {trialDaysLeft} days left in trial
          </p>
          <p
            style={{
              color: "rgba(165,173,255,0.6)",
              fontSize: 10,
              margin: "2px 0 0",
            }}
          >
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
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            style={{ textDecoration: "none", position: "relative", display: "flex" }}
          >
            {({ isActive }) => (
              <NavItem
                icon={Icon}
                label={label}
                isActive={isActive}
                collapsed={collapsed}
                isLocked={isLocked}
              />
            )}
          </NavLink>
          );
        })}
      </nav>

{/* ── Logout button ── */}
<div
  style={{
    padding: "0 8px",
    marginBottom: 12,
    display: "flex",
    justifyContent: collapsed ? "center" : "stretch",
    transition: "justify-content 220ms cubic-bezier(.4,0,.2,1)",
  }}
>
  <button
    onClick={() => {
      logout();
      navigate("/login");
    }}
    title="Log Out"
    style={{
      width: collapsed ? 48 : "100%",
      height: 42,
      border: "none",
      borderRadius: 12,
      background: "rgba(239, 68, 68, 0.12)",
      color: "#f87171",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: collapsed ? 0 : 8,
      fontSize: 14,
      fontWeight: 600,
      transition:
        "width 220ms cubic-bezier(.4,0,.2,1), gap 220ms cubic-bezier(.4,0,.2,1), background 0.2s, color 0.2s",
      overflow: "hidden",
      flexShrink: 0,
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = "rgba(239,68,68,0.18)";
      e.currentTarget.style.color = "#fca5a5";
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = "rgba(239,68,68,0.12)";
      e.currentTarget.style.color = "#f87171";
    }}
  >
    <LogOut size={16} style={{ flexShrink: 0 }} />
    <span
      style={{
        whiteSpace: "nowrap",
        overflow: "hidden",
        maxWidth: collapsed ? 0 : 100,
        opacity: collapsed ? 0 : 1,
        transition:
          "max-width 220ms cubic-bezier(.4,0,.2,1), opacity 150ms",
      }}
    >
      Log Out
    </span>
  </button>
</div>
    </aside>
  );
}

function NavItem({ icon: Icon, label, isActive, collapsed, isLocked }) {
  const [hovered, setHovered] = useState(false);

  const style = {
    display: "flex",
    alignItems: "center",
    justifyContent: collapsed ? "center" : "flex-start",
    gap: collapsed ? 0 : 10,
    padding: collapsed ? "11px" : "11px 14px",
    width: "100%",
    borderRadius: 12,
    background: isActive
      ? "rgba(75,86,148,0.55)"
      : hovered
        ? "rgba(255,255,255,0.06)"
        : "transparent",
    color: isActive
      ? "#fff"
      : hovered
        ? "rgba(255,255,255,0.8)"
        : "rgba(255,255,255,0.45)",
    fontSize: 14,
    fontWeight: isActive ? 600 : 500,
    cursor: "pointer",
    transition:
      "background 0.2s, color 0.2s, padding 220ms cubic-bezier(.4,0,.2,1), gap 220ms cubic-bezier(.4,0,.2,1), justify-content 220ms cubic-bezier(.4,0,.2,1)",
    position: "relative",
    userSelect: "none",
    boxSizing: "border-box",
  };

  const barStyle = {
    position: "absolute",
    left: 0,
    top: "20%",
    bottom: "20%",
    width: 3,
    borderRadius: "0 3px 3px 0",
    background: isActive ? "#7288AE" : "transparent",
    transition: "background 0.15s",
  };

  return (
    <div
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={barStyle} />
      <Icon size={18} style={{ flexShrink: 0 }} />
      <span
        style={{
          whiteSpace: "nowrap",
          opacity: collapsed ? 0 : 1,
          maxWidth: collapsed ? 0 : 160,
          overflow: "hidden",
          transition: "opacity 150ms, max-width 220ms cubic-bezier(.4,0,.2,1)",
          flex: 1,
        }}
      >
        {label}
      </span>
      {isLocked && !collapsed && (
        <Lock
          size={11}
          style={{
            opacity: 0.45,
            flexShrink: 0,
            transition: "opacity 150ms",
          }}
        />
      )}
      {collapsed && hovered && <Tooltip label={label} />}
    </div>
  );
}