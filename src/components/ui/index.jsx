import { X, Loader2, Search, AlertCircle } from 'lucide-react';

// ─── Status Badge ───────────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const map = {
    present:  'badge-present',
    late:     'badge-late',
    absent:   'badge-absent',
    leave:    'badge-leave',
    overtime: 'badge-overtime',
    halfday:  'badge-halfday',
    pending:  'badge bg-warning-50 text-warning-700',
    approved: 'badge bg-success-50 text-success-700',
    rejected: 'badge bg-danger-50 text-danger-700',
    active:   'badge bg-success-50 text-success-700',
    inactive: 'badge bg-surface-100 text-ink-500',
  };
  const dots = {
    present: 'bg-success-500', late: 'bg-warning-500', absent: 'bg-danger-500',
    leave: 'bg-info-500', overtime: 'bg-brand-500', halfday: 'bg-ink-300',
    pending: 'bg-warning-500', approved: 'bg-success-500', rejected: 'bg-danger-500',
    active: 'bg-success-500', inactive: 'bg-ink-300',
  };
  return (
    <span className={map[status] || 'badge bg-surface-100 text-ink-500'}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status] || 'bg-ink-300'}`} />
      {status?.charAt(0).toUpperCase() + status?.slice(1)}
    </span>
  );
}

// ─── Avatar ──────────────────────────────────────────────────────────────────
export function Avatar({ name = '', color = '#4f6ef7', size = 'md', src }) {
  const sizes = { sm: 'avatar-sm', md: 'avatar-md', lg: 'avatar-lg', xl: 'w-16 h-16 text-xl avatar' };
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  if (src) return <img src={src} alt={name} className={`${sizes[size]} rounded-full object-cover`} />;
  return (
    <span className={sizes[size]} style={{ backgroundColor: color }}>
      {initials}
    </span>
  );
}

// ─── Spinner ─────────────────────────────────────────────────────────────────
export function Spinner({ size = 16, className = '' }) {
  return <Loader2 size={size} className={`animate-spin text-brand-600 ${className}`} />;
}

// ─── Modal ───────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 'max-w-lg', footer }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${width} animate-modal`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-surface-200 bg-surface-50 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

// ─── Search Input ─────────────────────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="input pl-8 pr-3"
      />
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon = AlertCircle, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center mb-3">
        <Icon size={22} className="text-ink-300" />
      </div>
      <p className="text-sm font-semibold text-ink-700 mb-1">{title}</p>
      {description && <p className="text-xs text-ink-300 max-w-xs mb-4">{description}</p>}
      {action}
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, icon: Icon, color = 'brand', trend }) {
  const colors = {
    brand:   { bg: 'bg-brand-50',   text: 'text-brand-600'   },
    success: { bg: 'bg-success-50', text: 'text-success-600' },
    warning: { bg: 'bg-warning-50', text: 'text-warning-600' },
    danger:  { bg: 'bg-danger-50',  text: 'text-danger-600'  },
    info:    { bg: 'bg-info-50',     text: 'text-info-600'    },
    neutral: { bg: 'bg-surface-100',text: 'text-ink-500'     },
  };
  const c = colors[color] || colors.brand;
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${c.bg}`}>
          {Icon && <Icon size={17} className={c.text} />}
        </div>
        {trend !== undefined && (
          <span className={`text-xs font-medium ${trend >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="mt-2">
        <p className="text-2xl font-bold text-ink-900 tracking-tight leading-none">{value}</p>
        <p className="text-xs font-medium text-ink-500 mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-ink-300 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Progress Bar ────────────────────────────────────────────────────────────
export function ProgressBar({ value, max = 100, color = 'bg-brand-500', className = '' }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className={`w-full bg-surface-200 rounded-full h-1.5 ${className}`}>
      <div className={`${color} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Select Field ────────────────────────────────────────────────────────────
export function SelectField({ label, value, onChange, options, className = '' }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      <select className="select" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Input Field ─────────────────────────────────────────────────────────────
export function InputField({ label, type = 'text', value, onChange, placeholder, error, className = '', ...props }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input ${error ? 'border-danger-500 focus:ring-danger-500/30' : ''}`}
        {...props}
      />
      {error && <p className="text-xs text-danger-600 mt-1">{error}</p>}
    </div>
  );
}

// ─── Section Header ──────────────────────────────────────────────────────────
export function SectionHeader({ title, description, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="page-title">{title}</h2>
        {description && <p className="text-sm text-ink-400 mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}