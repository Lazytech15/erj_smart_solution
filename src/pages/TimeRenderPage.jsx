import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Play, Square, Coffee, Utensils, RefreshCw, Briefcase, CheckCircle2, AlertCircle, AlertTriangle, Loader2, Clock3 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useToast } from '../context/ToastContext';
import { Modal, SectionHeader } from '../components/ui';
import { getShiftSessions, todayISO, fmt } from '../utils/dateTime';

// ─────────────────────────────────────────────────────────────────────────
// Time Render — the in-app fallback for employees who can't use the Shift
// Clock browser extension. Mirrors the extension's behavior exactly (see
// the extension's background.js/api.js) so the two produce identical
// attendance records: same rounded-to-the-minute timestamps, same
// segment/session shape, same paid-break credit math — an admin looking at
// Attendance can't tell which one an employee used.
//
// The extension keeps its timer alive in a background service worker and
// is the source of truth for "connected" state; here there's no background
// process, so the in-progress segment is persisted to localStorage
// (per employee, per day) and reconciled against today's server record on
// mount — the same reconciliation background.js#hydrateFromServer does on
// (re)connect. Whichever one wrote more recently naturally wins on the
// next sync, same as the extension vs. web app already coexist for a
// single employee's attendance_records row.
// ─────────────────────────────────────────────────────────────────────────

const LOCAL_KEY_PREFIX = 'erj_time_render_';

const EMPTY_TIMER = {
  status: 'idle',        // 'idle' | 'working' | 'on_break' | 'stopped'
  segments: [],           // finalized segments for today
  currentSegment: null,   // { type, breakId?, label?, start, startExact }
  usedBreakIds: [],
  date: null,
};

/** Every segment boundary is stamped from this, rounded to the nearest
 *  whole minute — identical rounding to the extension's background.js
 *  #nowHHMM, so a record built from either source lines up cleanly. */
function nowHHMM() {
  const d = new Date();
  if (d.getSeconds() >= 30) d.setMinutes(d.getMinutes() + 1);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
}

function hhmmToMinutes(hhmm) {
  const [h, m, s = 0] = (hhmm || '0:0').split(':').map(Number);
  return h * 60 + m + s / 60;
}

function hhmmToDateToday(hhmm) {
  const [h, m, s = 0] = (hhmm || '0:0').split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, s, 0);
  return d;
}

function breakAllottedMinutes(brk) {
  if (!brk) return null;
  if (brk.durationMinutes != null) return brk.durationMinutes > 0 ? brk.durationMinutes : null;
  if (!brk.start || !brk.end) return null;
  const mins = hhmmToMinutes(brk.end) - hhmmToMinutes(brk.start);
  return mins > 0 ? mins : null;
}

/** 'present' | 'late' — mirrors AttendancePage.jsx#calcStatus / the
 *  extension's api.js#calcStatus. */
function calcStatus(clockInTime, shiftStart, lateThresholdMin = 15) {
  if (!clockInTime || !shiftStart) return '';
  const ch = hhmmToMinutes(clockInTime);
  const sh = hhmmToMinutes(shiftStart);
  return ch <= sh + lateThresholdMin ? 'present' : 'late';
}

/** Rebuilds { status, segments, currentSegment, usedBreakIds } from a
 *  server-side attendance record's `segments` timeline — same shape as
 *  background.js#stateFromRecord, so reconnecting here (page reload, or
 *  the employee used the extension earlier today) picks up exactly where
 *  either source left off. */
function stateFromRecord(record) {
  const segments = record?.segments || [];
  if (!segments.length) return { status: 'idle', segments: [], currentSegment: null, usedBreakIds: [] };
  const usedBreakIds = segments.filter(s => s.type === 'break' && s.breakId).map(s => s.breakId);
  const last = segments[segments.length - 1];
  if (last.end) {
    return { status: 'stopped', segments, currentSegment: null, usedBreakIds: [...new Set(usedBreakIds)] };
  }
  const { end, ...currentSegment } = last;
  return {
    status: last.type === 'break' ? 'on_break' : 'working',
    segments: segments.slice(0, -1),
    currentSegment,
    usedBreakIds: [...new Set(usedBreakIds)],
  };
}

function loadLocal(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.date && parsed.date !== todayISO()) return null; // stale day, ignore
    return parsed;
  } catch {
    return null;
  }
}

function saveLocal(key, timer) {
  try { localStorage.setItem(key, JSON.stringify(timer)); } catch { /* best-effort only */ }
}

function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function minutesToHM(mins) {
  const total = Math.round(mins);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function segmentMinutes(seg, fallbackNow) {
  if (!seg.start) return 0;
  const start = hhmmToDateToday(seg.start);
  const end = seg.end ? hhmmToDateToday(seg.end) : fallbackNow;
  return Math.max(0, (end - start) / 60000);
}

/** Live "worked today" total — work segments plus the on-time portion of
 *  any Paid break, capped at its allotment. Mirrors the extension popup's
 *  computeWorkedMinutes()/breakCreditMinutes() so the number on screen
 *  never disagrees with what Attendance will show once synced. */
function computeLiveWorkedMinutes(timer, shift) {
  const now = new Date();
  const all = timer.currentSegment ? [...timer.segments, timer.currentSegment] : timer.segments;
  const worked = all.filter(s => s.type === 'work').reduce((acc, s) => acc + segmentMinutes(s, now), 0);
  if (!shift?.breaks?.length) return worked;
  const defs = new Map(shift.breaks.map(b => [b.id, b]));
  const breakCredit = all.filter(s => s.type === 'break').reduce((acc, s) => {
    const def = defs.get(s.breakId);
    if (!def?.paid) return acc;
    const allotted = breakAllottedMinutes(def);
    const actual = segmentMinutes(s, now);
    const credited = allotted != null ? Math.min(actual, allotted) : actual;
    return acc + Math.max(0, credited);
  }, 0);
  return worked + breakCredit;
}

function deriveBreakSlots(shift) {
  const breaks = (shift?.breaks || []).map((b, i) => ({
    ...b,
    displayLabel: b.label?.trim() || `Break ${i + 1}`,
    durationMinutes: breakAllottedMinutes(b),
  }));
  const lunch = breaks.filter(b => /lunch/i.test(b.label || ''));
  const rest = breaks.filter(b => !/lunch/i.test(b.label || ''));
  return { breaks: rest, lunch };
}

export default function TimeRenderPage() {
  const { user } = useAuth();
  const { subscription, addAttendanceRecord, updateAttendanceRecord } = useSubscription();
  const { toast } = useToast();

  const employees = subscription?.enrolledEmployees || [];
  const attendanceRecords = subscription?.attendanceRecords || [];
  const lateThreshold = Number(subscription?.settings?.lateThreshold ?? 15);

  const empProfile = useMemo(() => employees.find(e =>
    String(e.id) === String(user?.employeeId) ||
    String(e.accountEmployeeId) === String(user?.employeeId) ||
    (user?.email && e.email === user.email),
  ), [employees, user]);

  const shift = useMemo(() => {
    if (!empProfile?.shiftId) return null;
    return (subscription?.shifts || []).find(s => String(s.id) === String(empProfile.shiftId)) || null;
  }, [empProfile, subscription]);

  const employeeIdStr = user?.employeeId != null ? String(user.employeeId) : null;
  const localKey = employeeIdStr ? `${LOCAL_KEY_PREFIX}${employeeIdStr}` : null;

  const [timer, setTimer] = useState(EMPTY_TIMER);
  const [saving, setSaving] = useState(false);
  const [, forceTick] = useState(0);
  const [confirm, setConfirm] = useState(null); // { message, onYes }
  const hydratedRef = useRef(false);

  const todayRecord = useMemo(() => {
    if (!employeeIdStr) return null;
    return attendanceRecords.find(r => String(r.employeeId) === employeeIdStr && r.date === todayISO()) || null;
  }, [attendanceRecords, employeeIdStr]);

  // Hydrate once: prefer whatever's already in localStorage for today (it
  // reflects the most recent action taken from THIS page); otherwise fall
  // back to today's server record — covers a first visit today, or the
  // employee having clocked in via the extension instead.
  useEffect(() => {
    if (!localKey || hydratedRef.current) return;
    hydratedRef.current = true;
    const local = loadLocal(localKey);
    if (local) {
      setTimer(local);
      return;
    }
    if (todayRecord) {
      setTimer({ ...stateFromRecord(todayRecord), date: todayISO() });
    } else {
      setTimer({ ...EMPTY_TIMER, date: todayISO() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localKey, todayRecord]);

  // Live tick for the elapsed/worked-today display, once a second.
  useEffect(() => {
    if (timer.status !== 'working' && timer.status !== 'on_break') return;
    const id = setInterval(() => forceTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [timer.status]);

  const persistAndSync = useCallback(async (next) => {
    setTimer(next);
    if (localKey) saveLocal(localKey, next);
    if (!employeeIdStr) return;

    const allSegments = next.currentSegment ? [...next.segments, next.currentSegment] : next.segments;
    // Strip the popup-only live anchor before it ever reaches the server —
    // mirrors the extension's api.js#stripLiveFields.
    const cleanSegments = allSegments.map(({ startExact, ...rest }) => rest);
    const workSegments = cleanSegments.filter(s => s.type === 'work' && s.start);
    const clockIn = workSegments[0]?.start || '';
    const clockOut = workSegments[workSegments.length - 1]?.end || '';

    const shiftSessions = getShiftSessions(shift);
    const sessionFor = (hhmm) => {
      if (shiftSessions.length <= 1) return shiftSessions[0] || { id: 'full', label: '' };
      const mins = hhmmToMinutes(hhmm);
      const match = shiftSessions.find(ss => mins >= hhmmToMinutes(ss.start) && mins < hhmmToMinutes(ss.end));
      if (match) return match;
      return shiftSessions.reduce((closest, ss) => {
        const dist = Math.min(Math.abs(mins - hhmmToMinutes(ss.start)), Math.abs(mins - hhmmToMinutes(ss.end)));
        const closestDist = Math.min(Math.abs(mins - hhmmToMinutes(closest.start)), Math.abs(mins - hhmmToMinutes(closest.end)));
        return dist < closestDist ? ss : closest;
      }, shiftSessions[0]);
    };
    const sessions = workSegments.map(s => {
      const ss = sessionFor(s.start);
      return { sessionId: ss.id, label: ss.label || '', clockIn: s.start, clockOut: s.end || '' };
    });

    const payload = {
      employeeId: employeeIdStr,
      date: todayISO(),
      status: calcStatus(clockIn, shift?.start, lateThreshold),
      notes: '',
      segments: cleanSegments,
      sessions,
      clockIn,
      clockOut,
    };

    setSaving(true);
    try {
      const existing = attendanceRecords.find(r => String(r.employeeId) === employeeIdStr && r.date === todayISO());
      if (existing) {
        await updateAttendanceRecord(existing.id, payload);
      } else {
        await addAttendanceRecord(payload);
      }
    } catch (err) {
      toast(err?.message || "Couldn't sync — will retry on the next action.", 'error');
    } finally {
      setSaving(false);
    }
  }, [localKey, employeeIdStr, shift, lateThreshold, attendanceRecords, addAttendanceRecord, updateAttendanceRecord, toast]);

  const handleStart = useCallback(() => {
    if (timer.status === 'working') return;
    persistAndSync({
      ...timer,
      status: 'working',
      date: timer.date || todayISO(),
      currentSegment: { type: 'work', start: nowHHMM(), startExact: Date.now() },
    });
  }, [timer, persistAndSync]);

  const handleTakeBreak = useCallback((brk) => {
    if (timer.status !== 'working') return;
    const segments = timer.currentSegment ? [...timer.segments, { ...timer.currentSegment, end: nowHHMM() }] : timer.segments;
    persistAndSync({
      ...timer,
      status: 'on_break',
      segments,
      currentSegment: { type: 'break', breakId: brk.id, label: brk.displayLabel, start: nowHHMM(), startExact: Date.now() },
      usedBreakIds: [...new Set([...timer.usedBreakIds, brk.id])],
    });
  }, [timer, persistAndSync]);

  const handleResumeWork = useCallback(() => {
    if (timer.status !== 'on_break') return;
    const allotted = breakAllottedMinutes(shift?.breaks?.find(b => b.id === timer.currentSegment?.breakId));
    const elapsed = timer.currentSegment ? hhmmToMinutes(nowHHMM()) - hhmmToMinutes(timer.currentSegment.start) : 0;
    const over = allotted != null && elapsed > allotted;
    const segments = timer.currentSegment ? [...timer.segments, { ...timer.currentSegment, end: nowHHMM(), over }] : timer.segments;
    persistAndSync({
      ...timer,
      status: 'working',
      segments,
      currentSegment: { type: 'work', start: nowHHMM(), startExact: Date.now() },
    });
  }, [timer, shift, persistAndSync]);

  const handleStop = useCallback(() => {
    if (timer.status === 'idle' || timer.status === 'stopped') return;
    const segments = timer.currentSegment ? [...timer.segments, { ...timer.currentSegment, end: nowHHMM() }] : timer.segments;
    persistAndSync({ ...timer, status: 'stopped', segments, currentSegment: null });
  }, [timer, persistAndSync]);

  if (!empProfile) {
    return (
      <div className="card p-6 text-center text-sm text-ink-400">
        We couldn't find your employee profile. Contact your admin if this looks wrong.
      </div>
    );
  }

  const { breaks, lunch } = deriveBreakSlots(shift);
  const canTakeBreak = timer.status === 'working';
  const workedMinutes = computeLiveWorkedMinutes(timer, shift);

  const activeBreakDef = timer.currentSegment?.type === 'break'
    ? shift?.breaks?.find(b => b.id === timer.currentSegment.breakId)
    : null;
  const allotted = breakAllottedMinutes(activeBreakDef);
  const elapsedMs = timer.currentSegment ? Date.now() - (timer.currentSegment.startExact ?? hhmmToDateToday(timer.currentSegment.start).getTime()) : 0;
  const isOverBreak = timer.status === 'on_break' && allotted != null && elapsedMs > allotted * 60000;

  // Ring visuals per state — mirrors the extension popup's ring-btn
  // state-idle/state-working/state-break/state-overbreak/state-stopped.
  let ringDisplay, ringNote, ringClasses, RingIcon, ringSub;
  if (timer.status === 'idle' || timer.status === 'stopped') {
    ringDisplay = '00:00:00';
    ringNote = timer.status === 'stopped' ? 'Stopped for today' : 'Not started';
    ringClasses = 'bg-surface-100 text-ink-300 ring-8 ring-surface-50';
    RingIcon = Play;
    ringSub = 'Tap to start';
  } else if (timer.status === 'on_break') {
    ringDisplay = isOverBreak
      ? `+${formatElapsed(elapsedMs - allotted * 60000)}`
      : (allotted != null ? formatElapsed(Math.max(0, allotted * 60000 - elapsedMs)) : formatElapsed(elapsedMs));
    ringNote = timer.currentSegment?.label || 'On break';
    ringSub = isOverBreak ? 'over the allotted time' : (allotted != null ? 'time left' : 'elapsed');
    ringClasses = isOverBreak
      ? 'bg-gradient-to-br from-red-400 to-red-500 text-white ring-8 ring-red-100 animate-pulse'
      : 'bg-gradient-to-br from-amber-300 to-amber-500 text-white ring-8 ring-amber-100';
    RingIcon = isOverBreak ? AlertTriangle : Coffee;
  } else {
    ringDisplay = formatElapsed(elapsedMs);
    ringNote = 'Working';
    ringSub = 'elapsed';
    ringClasses = 'bg-gradient-to-br from-emerald-400 to-emerald-500 text-white ring-8 ring-emerald-100';
    RingIcon = Loader2;
  }

  const canStart = timer.status === 'idle' || timer.status === 'stopped';

  return (
    <div className="space-y-5 max-w-2xl">
      <SectionHeader
        title="Time Render"
        description="Clock in and out from here if you're not using the Shift Clock browser extension."
      />

      <div className="card overflow-hidden">
        {/* Shift context strip */}
        <div className="flex items-center justify-between px-5 py-3 bg-surface-50 border-b border-surface-200">
          {shift ? (
            <div className="flex items-center gap-2 text-xs font-medium text-ink-600">
              <span className="w-6 h-6 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                <Briefcase size={13} />
              </span>
              {shift.name} <span className="text-ink-300">·</span> {shift.start} – {shift.end}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-medium text-ink-400">
              <AlertCircle size={13} /> No shift assigned yet
            </div>
          )}
          <span className="text-[11px] text-ink-300">{fmt.date(new Date())}</span>
        </div>

        <div className="flex flex-col items-center text-center gap-5 px-6 py-8">
          {/* Status ring */}
          <button
            type="button"
            disabled={!canStart}
            onClick={() => canStart && setConfirm({ message: timer.status === 'stopped' ? 'Start a new shift now?' : 'Start your shift now?', onYes: handleStart })}
            className={`relative w-44 h-44 rounded-full flex flex-col items-center justify-center transition-transform shadow-sm ${ringClasses} ${canStart ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]' : 'cursor-default'}`}
          >
            {canStart ? (
              <>
                <RingIcon size={30} className="mb-1.5" />
                <span className="text-sm font-semibold">{ringNote}</span>
                <span className="text-[11px] opacity-80 mt-0.5">{ringSub}</span>
              </>
            ) : (
              <>
                <RingIcon size={18} className={`mb-1.5 opacity-90 ${timer.status === 'working' ? 'animate-spin' : ''}`} />
                <span className="text-2xl font-bold tabular-nums tracking-tight">{ringDisplay}</span>
                <span className="text-xs font-semibold mt-1">{ringNote}</span>
                <span className="text-[10px] opacity-80">{ringSub}</span>
              </>
            )}
          </button>

          {/* Active-shift controls */}
          {!canStart && (
            <div className="flex flex-col items-center gap-4 w-full">
              {timer.status === 'on_break' && (
                <button
                  className="btn-primary flex items-center gap-2 px-6 py-2.5 rounded-full"
                  onClick={() => setConfirm({ message: 'Are you back to work now?', onYes: handleResumeWork })}
                >
                  <RefreshCw size={15} /> Back to Work
                </button>
              )}

              {canTakeBreak && (breaks.length > 0 || lunch.length > 0) && (
                <div className="w-full space-y-3">
                  {breaks.length > 0 && (
                    <BreakGroup label="Breaks" icon={Coffee} slots={breaks} timer={timer} onPick={brk => setConfirm({
                      message: `Start ${brk.displayLabel}${brk.durationMinutes ? ` (${brk.durationMinutes} min)` : ''}?`,
                      onYes: () => handleTakeBreak(brk),
                    })} />
                  )}
                  {lunch.length > 0 && (
                    <BreakGroup label="Lunch" icon={Utensils} slots={lunch} timer={timer} onPick={brk => setConfirm({
                      message: `Start ${brk.displayLabel}${brk.durationMinutes ? ` (${brk.durationMinutes} min)` : ''}?`,
                      onYes: () => handleTakeBreak(brk),
                    })} />
                  )}
                </div>
              )}

              {canTakeBreak && breaks.length === 0 && lunch.length === 0 && (
                <p className="text-[11px] text-ink-300">No breaks configured on your shift.</p>
              )}

              <button
                className="text-xs font-semibold text-red-500 hover:text-red-600 flex items-center gap-1.5 mt-1"
                onClick={() => setConfirm({ message: 'Stop working for today?', onYes: handleStop })}
              >
                <Square size={12} /> Stop for the Day
              </button>
            </div>
          )}
        </div>

        {/* Footer stats */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-surface-200 bg-surface-50">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-white border border-surface-200 flex items-center justify-center text-ink-400">
              <Clock3 size={13} />
            </span>
            <div className="text-left leading-tight">
              <p className="text-[10px] text-ink-400 font-medium">Worked today</p>
              <p className="text-sm font-bold text-ink-800">{minutesToHM(workedMinutes)}</p>
            </div>
          </div>
          <p className="text-[11px] text-ink-300 flex items-center gap-1.5">
            {saving ? <><RefreshCw size={11} className="animate-spin" /> Syncing…</> : <><CheckCircle2 size={11} className="text-emerald-400" /> Synced</>}
          </p>
        </div>
      </div>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Confirm"
        width="max-w-sm"
        footer={
          <>
            <button className="btn-secondary px-4 py-1.5 text-sm" onClick={() => setConfirm(null)}>Cancel</button>
            <button
              className="btn-primary px-4 py-1.5 text-sm"
              onClick={() => { confirm?.onYes?.(); setConfirm(null); }}
            >
              Yes
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-600">{confirm?.message}</p>
      </Modal>
    </div>
  );
}

/** One row of break chips — mirrors the extension popup's renderBreakChips:
 *  disabled + struck-through once used, highlighted while active, otherwise
 *  tappable any time work is in progress. */
function BreakGroup({ label, icon: Icon, slots, timer, onPick }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-ink-400 mb-1.5 text-left uppercase tracking-wide">{label}</p>
      <div className="flex flex-wrap gap-2">
        {slots.map(brk => {
          const isCurrent = timer.currentSegment?.type === 'break' && timer.currentSegment.breakId === brk.id;
          const alreadyUsed = timer.usedBreakIds?.includes(brk.id) && !isCurrent;
          return (
            <button
              key={brk.id}
              disabled={alreadyUsed || isCurrent}
              onClick={() => onPick(brk)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 transition ${
                isCurrent
                  ? 'border-amber-300 bg-amber-50 text-amber-700 cursor-default'
                  : alreadyUsed
                  ? 'border-surface-200 text-ink-300 line-through cursor-not-allowed'
                  : 'border-brand-200 text-brand-700 hover:bg-brand-50'
              }`}
            >
              <Icon size={12} /> {brk.displayLabel}
              {brk.durationMinutes ? <span className="opacity-60">· {brk.durationMinutes}m</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
