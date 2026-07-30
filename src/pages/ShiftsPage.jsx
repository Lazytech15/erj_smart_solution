import { useState, useEffect, useRef } from 'react';
import { Clock, Plus, Trash2, Pencil, Users, QrCode, Wifi, MapPin, X, Download, Layers, Coffee } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';
import { SectionHeader, Modal, InputField, EmptyState } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useFormDraft } from '../hooks/useFormDraft';
import { useDraftRestoreOnMount } from '../hooks/useDraftRestoreOnMount';
import DraftRestoredBanner from '../components/DraftRestoredBanner';
import { shiftDraftPrefix, shiftDraftKey, isShiftFormMeaningful } from '../utils/draftKeys';
import PlanGate from '../components/PlanGate';
import { hhmmDiffMinutes } from '../utils/dateTime';

const SHIFT_COLORS = ['#f59e0b','#4f6ef7','#10b981','#8b5cf6','#ef4444','#ec4899','#06b6d4'];

const EMPTY_FORM = {
  name: '', start: '08:00', end: '17:00',
  clockInMode: 'remote', qrValidity: 'daily',
  clockType: 'standard', // 'standard' = 1 clock in/out · 'split' = multiple sessions per day
  sessions: [],
  breaks: [], // breaks within the shift, e.g. { label: 'Lunch', durationMinutes: 60, paid: false } —
              // the employee starts these themselves from the extension whenever suits them; the
              // duration here is only the allotted length, not a fixed time-of-day window. Unpaid
              // breaks are deducted from worked hours; going over the allotted length is deducted
              // too, whether the break is paid or unpaid.
  departments: [], // department names this shift auto-assigns to
};

// Quick-fill template for the most common break setup: a short morning
// break, an hour for lunch, and a short afternoon break. Unpaid by default.
const BREAK_TEMPLATE = [
  { label: 'Morning Break',   durationMinutes: 15, paid: false },
  { label: 'Lunch',           durationMinutes: 60, paid: false },
  { label: 'Afternoon Break', durationMinutes: 15, paid: false },
];

// Quick-fill templates for the most common split-shift setups, matching
// typical Philippine company schedules (lunch-break split, or a third
// evening block on top of that).
const SESSION_TEMPLATES = {
  2: [
    { label: 'Morning',   start: '08:00', end: '12:00' },
    { label: 'Afternoon', start: '13:00', end: '17:00' },
  ],
  3: [
    { label: 'Morning',   start: '06:00', end: '10:00' },
    { label: 'Afternoon', start: '11:00', end: '15:00' },
    { label: 'Evening',   start: '16:00', end: '20:00' },
  ],
};

/** Turn the form's raw sessions into a saved shift payload: assigns stable
 *  ids and keeps top-level start/end in sync with the first/last session so
 *  every other part of the app (QR payload, shift chips, status calc) that
 *  reads shift.start/shift.end keeps working without any changes. */
// A save can fail for reasons entirely outside the app's control — most
// commonly the device having no internet connection at all, in which case
// "please refresh and try again" is misleading (refreshing won't help until
// connectivity is actually back). navigator.onLine is a blunt but real
// signal for that case; use it to say the accurate thing instead of always
// blaming a generic save failure.
function saveErrorMessage(fallback) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return "You're offline — reconnect to the internet and try again.";
  }
  return fallback;
}

function buildShiftPayload(form) {
  const breaks = (form.breaks || [])
    .filter(b => Number(b.durationMinutes) > 0)
    .map((b, i) => ({ id: b.id ?? `b${i + 1}`, label: b.label?.trim() || `Break ${i + 1}`, durationMinutes: Number(b.durationMinutes), paid: !!b.paid }));

  if ((form.clockType || 'standard') === 'split' && form.sessions?.length) {
    const sessions = form.sessions.map((s, i) => ({
      id: s.id ?? `s${i + 1}`,
      label: s.label?.trim() || `Session ${i + 1}`,
      start: s.start,
      end: s.end,
    }));
    return {
      ...form,
      clockType: 'split',
      sessions,
      breaks,
      start: sessions[0].start,
      end: sessions[sessions.length - 1].end,
    };
  }
  return { ...form, clockType: 'standard', sessions: [], breaks };
}

// ── Tiny pure-JS QR renderer (no external lib needed) ────────────────────────
// Uses the free qrcode-generator approach via a <canvas>
function QRCanvas({ value, size = 200 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;

    // Dynamically import qrcode library from CDN via script tag
    const scriptId = 'qrcode-lib';
    function render() {
      if (!window.QRCode) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      window.QRCode.toCanvas(canvas, value, {
        width: size,
        margin: 2,
        color: { dark: '#1e293b', light: '#ffffff' },
      }, () => {});
    }

    if (window.QRCode) {
      render();
    } else if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      script.onload = () => {
        // qrcodejs doesn't expose toCanvas — use canvas fallback via qrcode npm-style
        // Instead load the correct library
      };
      document.head.appendChild(script);
    }
  }, [value, size]);

  // Use the qrcode npm package approach via data URL trick with fetch
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    if (!value) return;
    // Build QR via qrserver API (no key needed, free)
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&format=png&margin=10`;
    setDataUrl(url);
  }, [value, size]);

  if (!dataUrl) return <div style={{ width: size, height: size }} className="bg-surface-100 rounded-lg animate-pulse" />;

  return (
    <img
      src={dataUrl}
      alt="QR Code"
      width={size}
      height={size}
      className="rounded-lg"
      onError={e => { e.target.style.display = 'none'; }}
    />
  );
}

// ── QR Modal ─────────────────────────────────────────────────────────────────
function QRModal({ shift, open, onClose }) {
  if (!shift) return null;

  // QR payload — matches the mobile app's parseQRPayload() shape exactly.
  // Re-computed each render so a "daily" QR always reflects today's date and
  // a midnight expiry, with zero manual regeneration needed. A "permanent"
  // QR omits date/expiry entirely so it can be printed once and never swapped.
  const { subscription } = useSubscription();
  const isPermanent = shift.qrValidity === 'permanent';

  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  const expiresAtStr = (() => {
    const d = new Date(); d.setHours(23, 59, 59, 0); return d.toISOString();
  })();

  const qrValue = JSON.stringify({
    type:           'attendance_qr',
    subscriptionId: subscription?.subscriptionId,
    shiftId:        String(shift.id),
    shiftName:      shift.name,
    start:          shift.start,
    end:            shift.end,
    issuedAt:       new Date().toISOString(),
    permanent:      isPermanent,
    ...(isPermanent ? {} : { date: todayStr, expiresAt: expiresAtStr }),
  });

  function handleDownload() {
    const size = 400;
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(qrValue)}&format=png&margin=10`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${shift.name.replace(/\s+/g, '-').toLowerCase()}.png`;
    a.click();
  }

  return (
    <Modal open={open} onClose={onClose} title={`QR Code — ${shift.name}`} width="max-w-sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={handleDownload}>
            <Download size={13} /> Download
          </button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4 py-2">
        {/* Shift info strip */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg w-full"
          style={{ background: shift.color + '18', border: `1px solid ${shift.color}33` }}>
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: shift.color }} />
          <span className="text-xs font-semibold" style={{ color: shift.color }}>
            {shift.name} · {shift.start} – {shift.end}
          </span>
        </div>

        {/* QR Code */}
        <div className="p-3 bg-white rounded-xl shadow-sm border border-surface-200">
          <QRCanvas value={qrValue} size={220} />
        </div>

        {/* Validity badge */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${
          isPermanent ? 'bg-success-50 text-success-600' : 'bg-brand-50 text-brand-600'
        }`}>
          <Clock size={11} />
          {isPermanent ? 'Permanent — never expires' : 'Refreshes daily — expires today at midnight'}
        </div>

        <p className="text-[11px] text-ink-400 text-center leading-relaxed px-2">
          {isPermanent
            ? 'Print this once and post it at the office entrance. It will keep working every day — no need to swap it out.'
            : 'Display this QR code at the office entrance. It automatically refreshes each day, so re-open or re-print it daily — employees scan it on the mobile app to clock in onsite.'}
        </p>
      </div>
    </Modal>
  );
}

// ── Shift Form ────────────────────────────────────────────────────────────────
function ShiftFormFields({ form, setForm, departments = [], employees = [], allShifts = [], excludeShiftId }) {
  const f = k => v => setForm(p => ({ ...p, [k]: v }));
  const clockType = form.clockType || 'standard';
  const sessions  = form.sessions || [];
  const selectedDepts = form.departments || [];

  function setClockType(type) {
    setForm(p => {
      if (type === 'split' && (!p.sessions || p.sessions.length < 2)) {
        return { ...p, clockType: type, sessions: SESSION_TEMPLATES[2].map(s => ({ ...s })) };
      }
      return { ...p, clockType: type };
    });
  }

  function applyTemplate(count) {
    setForm(p => ({ ...p, sessions: SESSION_TEMPLATES[count].map(s => ({ ...s })) }));
  }

  function updateSession(idx, key, value) {
    setForm(p => {
      const next = [...(p.sessions || [])];
      next[idx] = { ...next[idx], [key]: value };
      return { ...p, sessions: next };
    });
  }

  function addSession() {
    setForm(p => {
      const list = p.sessions || [];
      const last = list[list.length - 1];
      return { ...p, sessions: [...list, { label: `Session ${list.length + 1}`, start: last?.end || '13:00', end: '17:00' }] };
    });
  }

  function removeSession(idx) {
    setForm(p => ({ ...p, sessions: (p.sessions || []).filter((_, i) => i !== idx) }));
  }

  const breaks = form.breaks || [];

  function updateBreak(idx, key, value) {
    setForm(p => {
      const next = [...(p.breaks || [])];
      next[idx] = { ...next[idx], [key]: value };
      return { ...p, breaks: next };
    });
  }

  function addBreak() {
    setForm(p => {
      const list = p.breaks || [];
      return { ...p, breaks: [...list, { label: `Break ${list.length + 1}`, durationMinutes: 15, paid: false }] };
    });
  }

  function removeBreak(idx) {
    setForm(p => ({ ...p, breaks: (p.breaks || []).filter((_, i) => i !== idx) }));
  }

  function applyBreakTemplate() {
    setForm(p => ({ ...p, breaks: BREAK_TEMPLATE.map(b => ({ ...b })) }));
  }

  const totalBreakMinutes = breaks.reduce((acc, b) => {
    if (b.paid) return acc;
    return acc + (Number(b.durationMinutes) || 0);
  }, 0);

  function toggleDept(dept) {
    setForm(p => {
      const list = p.departments || [];
      return { ...p, departments: list.includes(dept) ? list.filter(d => d !== dept) : [...list, dept] };
    });
  }

  const affectedCount = selectedDepts.length
    ? employees.filter(e => selectedDepts.includes(e.department)).length
    : 0;

  // Departments that are currently auto-assigned to a *different* shift —
  // selecting them here will move them over, so the admin should know.
  const conflicts = selectedDepts
    .map(dept => ({ dept, owner: allShifts.find(s => s.id !== excludeShiftId && s.departments?.includes(dept)) }))
    .filter(c => c.owner);

  return (
    <div className="space-y-4">
      <InputField label="Shift Name" value={form.name} onChange={f('name')} placeholder="e.g. Morning Shift" />

      {/* Department auto-assign */}
      <div>
        <p className="text-xs font-medium text-ink-600 mb-1">
          Auto-assign to Departments <span className="text-ink-300 font-normal">(optional)</span>
        </p>
        <p className="text-[10px] text-ink-400 mb-2 leading-relaxed">
          Every employee in the departments you pick is switched to this shift automatically — no need to edit each employee one by one.
        </p>
        {departments.length === 0 ? (
          <p className="text-[11px] text-ink-300">No departments set up yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {departments.map(dept => {
              const active = selectedDepts.includes(dept);
              return (
                <button
                  key={dept}
                  type="button"
                  onClick={() => toggleDept(dept)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                    active ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-surface-200 text-ink-500 hover:border-surface-300'
                  }`}
                >
                  {dept}
                </button>
              );
            })}
          </div>
        )}
        {selectedDepts.length > 0 && (
          <div className="mt-2 space-y-1">
            <p className="text-[10px] text-ink-400 leading-relaxed">
              {affectedCount} employee{affectedCount !== 1 ? 's' : ''} will be switched to this shift right now, and new hires in {selectedDepts.length > 1 ? 'these departments' : 'this department'} will default to it too.
            </p>
            {conflicts.map(({ dept, owner }) => (
              <p key={dept} className="text-[10px] text-amber-600 leading-relaxed">
                “{dept}” is currently auto-assigned to “{owner.name}” — saving will move it here instead.
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Clock Type */}
      <div>
        <p className="text-xs font-medium text-ink-600 mb-2">Clock Type</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'standard', icon: Clock,  label: 'Standard',    desc: '1 clock in + 1 clock out' },
            { value: 'split',    icon: Layers, label: 'Split Shift', desc: 'Multiple in/out per day' },
          ].map(opt => {
            const Icon = opt.icon;
            const active = clockType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setClockType(opt.value)}
                className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                  active
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-surface-200 bg-white hover:border-surface-300'
                }`}
              >
                <Icon size={15} className={active ? 'text-brand-500 mt-0.5' : 'text-ink-300 mt-0.5'} />
                <div>
                  <p className={`text-xs font-semibold ${active ? 'text-brand-600' : 'text-ink-700'}`}>{opt.label}</p>
                  <p className="text-[10px] text-ink-400 mt-0.5">{opt.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {clockType === 'standard' ? (
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Start Time" type="time" value={form.start} onChange={f('start')} />
          <InputField label="End Time"   type="time" value={form.end}   onChange={f('end')} />
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-ink-600">
              Sessions <span className="text-ink-300 font-normal">({sessions.length * 2} punches/day)</span>
            </p>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => applyTemplate(2)} className="text-[10px] font-medium text-brand-500 hover:underline">2 sessions</button>
              <span className="text-ink-200">·</span>
              <button type="button" onClick={() => applyTemplate(3)} className="text-[10px] font-medium text-brand-500 hover:underline">3 sessions</button>
            </div>
          </div>

          <div className="space-y-2">
            {sessions.map((s, idx) => (
              <div key={idx} className="flex items-center gap-1.5 p-2 rounded-lg border border-surface-200 bg-surface-50">
                <input
                  type="text"
                  value={s.label}
                  onChange={e => updateSession(idx, 'label', e.target.value)}
                  placeholder={`Session ${idx + 1}`}
                  className="input !py-1.5 !text-xs flex-1 min-w-0"
                />
                <input type="time" value={s.start} onChange={e => updateSession(idx, 'start', e.target.value)} className="input !py-1.5 !text-xs w-[104px] shrink-0" />
                <span className="text-ink-300 text-xs shrink-0">–</span>
                <input type="time" value={s.end} onChange={e => updateSession(idx, 'end', e.target.value)} className="input !py-1.5 !text-xs w-[104px] shrink-0" />
                {sessions.length > 1 && (
                  <button type="button" onClick={() => removeSession(idx)} className="p-1 rounded-md text-ink-300 hover:text-danger-500 hover:bg-danger-50 transition-colors shrink-0">
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button type="button" onClick={addSession} className="flex items-center gap-1.5 text-[11px] font-medium text-brand-500 hover:text-brand-600 mt-2">
            <Plus size={12} /> Add session
          </button>

          <p className="text-[10px] text-ink-400 mt-2 leading-relaxed">
            Employees clock in and out once per session — e.g. clock out for lunch, then clock back in for the afternoon. Each session is tracked and totalled separately on the Attendance page.
          </p>
        </div>
      )}

      {/* Breaks — employee-triggered, timer-based breaks inside the shift
           (taken from the Shift Clock extension). Each one gets a label
           (shown as its own button in the extension, e.g. "Morning Break")
           and an allotted length in minutes rather than a fixed time-of-day
           window, since the employee starts it whenever suits them. Going
           over the allotted length is deducted from worked hours whether
           the break is paid or unpaid — being Paid only means the on-time
           portion still counts as worked time. */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-ink-600">
            Breaks{' '}
            <span className="text-ink-300 font-normal">
              {totalBreakMinutes > 0 ? `(${totalBreakMinutes} min unpaid, auto-deducted)` : '(optional)'}
            </span>
          </p>
          {breaks.length === 0 && (
            <button type="button" onClick={applyBreakTemplate} className="text-[10px] font-medium text-brand-500 hover:underline">
              Use typical template
            </button>
          )}
        </div>

        <div className="space-y-2">
          {breaks.map((b, idx) => (
            <div key={idx} className="flex items-center gap-1.5 p-2 rounded-lg border border-surface-200 bg-surface-50">
              <input
                type="text"
                value={b.label}
                onChange={e => updateBreak(idx, 'label', e.target.value)}
                placeholder={`Break ${idx + 1}`}
                className="input !py-1.5 !text-xs flex-1 min-w-0"
              />
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="number" min="1" step="1"
                  value={b.durationMinutes ?? ''}
                  onChange={e => updateBreak(idx, 'durationMinutes', e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="15"
                  className="input !py-1.5 !text-xs w-[64px] text-center"
                />
                <span className="text-ink-300 text-[11px]">min</span>
              </div>
              <button
                type="button"
                onClick={() => updateBreak(idx, 'paid', !b.paid)}
                title={b.paid ? 'Paid — on-time portion still counts as worked time' : 'Unpaid — deducted from worked hours'}
                className={`shrink-0 px-2 py-1 rounded-md text-[10px] font-medium border transition-colors ${
                  b.paid
                    ? 'bg-brand-50 text-brand-600 border-brand-200'
                    : 'bg-surface-100 text-ink-400 border-surface-200'
                }`}
              >
                {b.paid ? 'Paid' : 'Unpaid'}
              </button>
              <button type="button" onClick={() => removeBreak(idx)} className="p-1 rounded-md text-ink-300 hover:text-danger-500 hover:bg-danger-50 transition-colors shrink-0">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>

        <button type="button" onClick={addBreak} className="flex items-center gap-1.5 text-[11px] font-medium text-brand-500 hover:text-brand-600 mt-2">
          <Plus size={12} /> Add break
        </button>

        <p className="text-[10px] text-ink-400 mt-2 leading-relaxed">
          Each break shows up as its own button in the Shift Clock extension, labeled with the name you give it here (e.g. "Morning Break"). The employee taps it whenever they take that break, and the extension counts down the minutes you set. Mark a break <span className="font-medium text-ink-500">Unpaid</span> to have the time it's taken subtracted from worked hours automatically; mark it <span className="font-medium text-ink-500">Paid</span> to keep the on-time portion counted as worked time. Either way, any time taken beyond the allotted minutes is always deducted.
        </p>
      </div>

      {/* Clock-in Mode */}
      <div>
        <p className="text-xs font-medium text-ink-600 mb-2">Clock-in Mode</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'remote',  icon: MapPin,  label: 'Remote',  desc: 'GPS location capture' },
            { value: 'onsite',  icon: QrCode,  label: 'Onsite',  desc: 'QR code scan at office' },
          ].map(opt => {
            const Icon = opt.icon;
            const active = form.clockInMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(p => ({ ...p, clockInMode: opt.value }))}
                className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                  active
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-surface-200 bg-white hover:border-surface-300'
                }`}
              >
                <Icon size={15} className={active ? 'text-brand-500 mt-0.5' : 'text-ink-300 mt-0.5'} />
                <div>
                  <p className={`text-xs font-semibold ${active ? 'text-brand-600' : 'text-ink-700'}`}>{opt.label}</p>
                  <p className="text-[10px] text-ink-400 mt-0.5">{opt.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* QR Validity — only matters for onsite shifts */}
      {form.clockInMode === 'onsite' && (
        <div>
          <p className="text-xs font-medium text-ink-600 mb-2">QR Code Validity</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'daily',     icon: Clock,  label: 'Daily',     desc: 'Auto-refreshes, expires at midnight' },
              { value: 'permanent', icon: QrCode, label: 'Permanent', desc: 'Print once, never expires' },
            ].map(opt => {
              const Icon = opt.icon;
              const active = (form.qrValidity || 'daily') === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, qrValidity: opt.value }))}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                    active
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-surface-200 bg-white hover:border-surface-300'
                  }`}
                >
                  <Icon size={15} className={active ? 'text-brand-500 mt-0.5' : 'text-ink-300 mt-0.5'} />
                  <div>
                    <p className={`text-xs font-semibold ${active ? 'text-brand-600' : 'text-ink-700'}`}>{opt.label}</p>
                    <p className="text-[10px] text-ink-400 mt-0.5">{opt.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
          {form.qrValidity === 'permanent' && (
            <p className="text-[10px] text-amber-600 mt-2 leading-relaxed">
              A permanent QR keeps working indefinitely once printed. Anyone who gets a copy of it could clock in, so only use this for a low-risk, supervised entrance.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Content ──────────────────────────────────────────────────────────────
function ShiftsContent() {
  const toast = useToast();
  const { user } = useAuth();
  const { subscription, addShift, removeShift, updateShift, updateEmployee } = useSubscription();
  const shifts      = subscription?.shifts || [];
  const employees   = subscription?.enrolledEmployees || [];
  const departments = subscription?.departments || [];

  const [addModal,   setAddModal]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [qrTarget,   setQrTarget]   = useState(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [draftRestored, setDraftRestored] = useState(false);

  // On mount, look for whichever shift form (Add, or a specific Edit) was
  // in progress when the page last reloaded. Both modals stay mounted
  // regardless of `open`, but `editTarget` (needed to render the right
  // one pre-filled) is only set by clicking Edit — so this scan has to
  // happen before we know which shift, if any, that was.
  useDraftRestoreOnMount({
    prefix: shiftDraftPrefix(user?.id),
    ready: !!subscription,
    findById: (id) => shifts.find(s => String(s.id) === id),
    onRestoreAdd: (data) => {
      if (!isShiftFormMeaningful(data, null)) return false;
      setForm(data.form);
      setAddModal(true);
      setDraftRestored(true);
      toast('Restored the shift details you were entering before the page reloaded.', 'info');
      return true;
    },
    onRestoreEdit: (target, data) => {
      if (!isShiftFormMeaningful(data, target)) return false;
      setForm(data.form);
      setEditTarget(target);
      setDraftRestored(true);
      toast('Restored the changes you were making before the page reloaded.', 'info');
      return true;
    },
  });

  // Debounced-persist the shared form under whichever draft slot matches
  // the current mode (the single "add" slot, or this specific shift's).
  const draftKey = shiftDraftKey(user?.id, editTarget?.id);
  const { clear: clearFormDraft } = useFormDraft(
    draftKey,
    { form },
    { isMeaningful: (draft) => isShiftFormMeaningful(draft, editTarget || null) }
  );
  // Neither handleAdd nor handleEdit disabled their button while the
  // underlying save was in flight, so a slow save (e.g. right after the tab
  // was backgrounded, waiting on withDbTimeout/DB_CALL_TIMEOUT_MS) gave zero
  // visual feedback — a person clicking "Save Changes" a few times during
  // that wait fired that many duplicate updateShift() calls, all racing each
  // other. This flag disables the button and shows a spinner/label the
  // instant the first click lands, so it's obvious the click registered and
  // further clicks are ignored until the request actually settles.
  const [isSaving, setIsSaving] = useState(false);

  function empCount(shiftId) {
    return employees.filter(e => e.shiftId && String(e.shiftId) === String(shiftId)).length;
  }

  function openAdd() { setForm(EMPTY_FORM); setAddModal(true); setDraftRestored(false); }

  function openEdit(shift) {
    setForm({
      name: shift.name,
      start: shift.start,
      end: shift.end,
      clockInMode: shift.clockInMode || 'remote',
      qrValidity: shift.qrValidity || 'daily',
      clockType: shift.clockType || 'standard',
      sessions: shift.sessions?.length ? shift.sessions.map(s => ({ ...s })) : [],
      breaks: shift.breaks?.length ? shift.breaks.map(b => ({ ...b })) : [],
      departments: shift.departments ? [...shift.departments] : [],
    });
    setEditTarget(shift);
    setDraftRestored(false);
  }

  async function handleAdd() {
    if (!form.name.trim() || isSaving) return;
    const payload = buildShiftPayload(form);
    // addShift sets id = Date.now() internally; capture the same timestamp
    const newShiftId = Date.now();
    setIsSaving(true);
    try {
      await addShift({ ...payload, id: newShiftId, color: SHIFT_COLORS[shifts.length % SHIFT_COLORS.length] });
    } catch (err) {
      console.error('[ShiftsPage] addShift failed:', err);
      toast(saveErrorMessage('Could not save the new shift — please refresh the page and try again.'), 'error');
      return; // keep the modal open with the form intact so nothing is lost
    } finally {
      setIsSaving(false);
    }
    // Bulk-reassign employees in the selected departments to this new shift.
    // Use a tiny delay so the shift is committed to state before employee updates run.
    if (form.departments?.length) {
      const depts = form.departments;
      setTimeout(() => {
        employees
          .filter(e => depts.includes(e.department))
          .forEach(e => updateEmployee(e.id, { shiftId: newShiftId }));
      }, 0);
    }
    toast(`Shift "${form.name}" added`, 'success');
    clearFormDraft();
    setForm(EMPTY_FORM);
    setAddModal(false);
    setDraftRestored(false);
  }

  async function handleEdit() {
    if (!form.name.trim() || isSaving) return;
    const payload = buildShiftPayload(form);
    setIsSaving(true);
    try {
      await updateShift(editTarget.id, {
        name: form.name,
        start: payload.start,
        end: payload.end,
        clockInMode: form.clockInMode,
        qrValidity: form.qrValidity,
        clockType: payload.clockType,
        sessions: payload.sessions,
        breaks: payload.breaks,
        departments: form.departments || [],
      });
    } catch (err) {
      console.error('[ShiftsPage] updateShift failed:', err);
      toast(saveErrorMessage('Could not save your changes — please refresh the page and try again.'), 'error');
      return; // leave the modal open, form untouched, nothing falsely marked "saved"
    } finally {
      setIsSaving(false);
    }
    // Bulk-reassign employees in the selected departments to this shift
    if (form.departments?.length) {
      employees
        .filter(e => form.departments.includes(e.department))
        .forEach(e => updateEmployee(e.id, { shiftId: editTarget.id }));
    }
    toast(`Shift "${form.name}" updated`, 'success');
    clearFormDraft();
    setEditTarget(null);
    setDraftRestored(false);
  }

  async function handleRemove(shift) {
    const count = empCount(shift.id);
    if (count > 0) {
      toast(`Cannot remove — ${count} employee${count !== 1 ? 's' : ''} assigned to this shift`, 'error');
      return;
    }
    try {
      await removeShift(shift.id);
    } catch (err) {
      toast('Could not remove the shift — please refresh the page and try again.', 'error');
      return;
    }
    toast('Shift removed', 'warning');
  }

  const modalFooter = (onPrimary, label) => (
    <>
      <button className="btn-secondary" onClick={() => { clearFormDraft(); setAddModal(false); setEditTarget(null); setDraftRestored(false); }} disabled={isSaving}>Cancel</button>
      <button className="btn-primary" onClick={onPrimary} disabled={isSaving}>{isSaving ? 'Saving…' : label}</button>
    </>
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
        <EmptyState icon={Clock} title="No shifts yet" description="Define work shifts for your employees." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {shifts.map(shift => {
            const count = empCount(shift.id);
            const mode  = shift.clockInMode || 'remote';
            const ModeIcon = mode === 'onsite' ? QrCode : MapPin;
            return (
              <div key={shift.id} className="card p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: shift.color + '22' }}>
                    <Clock size={18} style={{ color: shift.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink-800 truncate">{shift.name}</p>
                    <p className="text-xs text-ink-400">{shift.start} – {shift.end}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <div className="flex items-center gap-1">
                        <Users size={11} className="text-ink-300" />
                        <span className="text-[11px] text-ink-400">{count} employee{count !== 1 ? 's' : ''}</span>
                      </div>
                      <span className="text-ink-200">·</span>
                      <div className="flex items-center gap-1">
                        <ModeIcon size={11} className={mode === 'onsite' ? 'text-brand-400' : 'text-success-400'} />
                        <span className={`text-[11px] font-medium ${mode === 'onsite' ? 'text-brand-500' : 'text-success-500'}`}>
                          {mode === 'onsite' ? 'Onsite' : 'Remote'}
                        </span>
                      </div>
                      {shift.clockType === 'split' && shift.sessions?.length > 0 && (
                        <>
                          <span className="text-ink-200">·</span>
                          <div className="flex items-center gap-1">
                            <Layers size={11} className="text-violet-400" />
                            <span className="text-[11px] font-medium text-violet-500">
                              {shift.sessions.length * 2} punches/day
                            </span>
                          </div>
                        </>
                      )}
                      {shift.breaks?.length > 0 && (
                        <>
                          <span className="text-ink-200">·</span>
                          <div className="flex items-center gap-1">
                            <Coffee size={11} className="text-amber-400" />
                            <span className="text-[11px] font-medium text-amber-500">
                              {shift.breaks.reduce((acc, b) => acc + (Number(b.durationMinutes) || (b.start && b.end ? hhmmDiffMinutes(b.start, b.end) : 0)), 0)} min break
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                    {shift.clockType === 'split' && shift.sessions?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {shift.sessions.map((s, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-100 text-ink-500">
                            {s.label}: {s.start}–{s.end}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(shift)} className="p-1.5 rounded-lg text-ink-300 hover:text-brand-500 hover:bg-brand-50 transition-colors" title="Edit shift">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleRemove(shift)} className="p-1.5 rounded-lg text-ink-300 hover:text-danger-500 hover:bg-danger-50 transition-colors" title="Remove shift">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* QR button — only for onsite shifts */}
                {mode === 'onsite' && (
                  <button
                    onClick={() => setQrTarget(shift)}
                    className="flex items-center justify-center gap-2 w-full py-1.5 rounded-lg border border-dashed border-brand-300 text-brand-500 hover:bg-brand-50 transition-colors text-xs font-medium"
                  >
                    <QrCode size={13} /> View QR Code
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add modal */}
      <Modal open={addModal} onClose={() => { clearFormDraft(); setAddModal(false); setDraftRestored(false); }} title="Add Shift" width="max-w-sm"
        footer={modalFooter(handleAdd, 'Add Shift')}
      >
        {draftRestored && !editTarget && (
          <DraftRestoredBanner
            className="mb-3"
            onDiscard={() => { clearFormDraft(); setForm(EMPTY_FORM); setDraftRestored(false); }}
          />
        )}
        <ShiftFormFields
          form={form} setForm={setForm}
          departments={departments}
          employees={employees}
          allShifts={shifts}
        />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editTarget} onClose={() => { clearFormDraft(); setEditTarget(null); setDraftRestored(false); }} title="Edit Shift" width="max-w-sm"
        footer={modalFooter(handleEdit, 'Save Changes')}
      >
        {draftRestored && editTarget && (
          <DraftRestoredBanner
            className="mb-3"
            message="Restored unsaved changes from before the page reloaded."
            onDiscard={() => { clearFormDraft(); openEdit(editTarget); }}
          />
        )}
        <ShiftFormFields
          form={form} setForm={setForm}
          departments={departments}
          employees={employees}
          allShifts={shifts}
          excludeShiftId={editTarget?.id}
        />
      </Modal>

      {/* QR Code modal */}
      <QRModal shift={qrTarget} open={!!qrTarget} onClose={() => setQrTarget(null)} />
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