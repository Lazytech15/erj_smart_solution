import { format, parseISO, differenceInMinutes, isToday, isYesterday, formatDistanceToNow } from 'date-fns';

export const fmt = {
  date: (d) => format(typeof d === 'string' ? parseISO(d) : d, 'MMM d, yyyy'),
  dateShort: (d) => format(typeof d === 'string' ? parseISO(d) : d, 'MMM d'),
  time: (d) => format(typeof d === 'string' ? parseISO(d) : d, 'h:mm a'),
  time24: (d) => format(typeof d === 'string' ? parseISO(d) : d, 'HH:mm'),
  datetime: (d) => format(typeof d === 'string' ? parseISO(d) : d, 'MMM d, yyyy h:mm a'),
  month: (d) => format(typeof d === 'string' ? parseISO(d) : d, 'MMMM yyyy'),
  iso: (d) => format(typeof d === 'string' ? parseISO(d) : d, "yyyy-MM-dd'T'HH:mm:ss"),
  isoDate: (d) => format(typeof d === 'string' ? parseISO(d) : d, 'yyyy-MM-dd'),
  dayOfWeek: (d) => format(typeof d === 'string' ? parseISO(d) : d, 'EEEE'),
  relative: (d) => {
    const date = typeof d === 'string' ? parseISO(d) : d;
    if (isToday(date)) return `Today, ${format(date, 'h:mm a')}`;
    if (isYesterday(date)) return `Yesterday, ${format(date, 'h:mm a')}`;
    return formatDistanceToNow(date, { addSuffix: true });
  },
};

export function minutesToHHMM(minutes) {
  if (!minutes && minutes !== 0) return '—';
  const total = Math.round(Math.abs(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const sign = minutes < 0 ? '-' : '';
  return `${sign}${h}h ${m.toString().padStart(2, '0')}m`;
}

export function getWorkDuration(clockIn, clockOut) {
  if (!clockIn || !clockOut) return null;
  const inDate = typeof clockIn === 'string' ? parseISO(clockIn) : clockIn;
  const outDate = typeof clockOut === 'string' ? parseISO(clockOut) : clockOut;
  return differenceInMinutes(outDate, inDate);
}

export function getStatus(record) {
  if (!record) return 'absent';
  if (record.status) return record.status;
  if (!record.clockIn) return 'absent';
  const shiftStart = parseISO(`${record.date}T${record.shiftStart || '08:00:00'}`);
  const clockIn = parseISO(record.clockIn);
  const lateMinutes = differenceInMinutes(clockIn, shiftStart);
  if (lateMinutes > 15) return 'late';
  return 'present';
}

// ── Multi-session clock helpers ──────────────────────────────────────────────
// Supports shifts with more than one clock-in/clock-out pair per day (e.g. a
// split shift: morning in/out, afternoon in/out, or even an added evening
// in/out). A "session" is one { label, start, end } block on a shift, and one
// { sessionId, label, clockIn, clockOut } punch on an attendance record.

/** Minutes between two "HH:mm" or "HH:mm:ss" strings, accurate to the
 *  second (returns a fractional minute count, e.g. 1.5 for 90 seconds).
 *  Treats a smaller end-time as crossing midnight. Strings without a
 *  seconds component are treated as :00, so this still works with older
 *  minute-only data. */
export function hhmmDiffMinutes(clockIn, clockOut) {
  if (!clockIn || !clockOut) return 0;
  const toMin = (t) => {
    const [h, m, s = 0] = t.split(':').map(Number);
    return h * 60 + m + s / 60;
  };
  let diff = toMin(clockOut) - toMin(clockIn);
  if (diff < 0) diff += 24 * 60;
  return diff;
}


/** A break's allotted length in minutes — the modern shape stores this
 *  directly (`durationMinutes`, set in Shift Management, since breaks are
 *  now employee-triggered from the extension rather than tied to a fixed
 *  time-of-day window). Falls back to diffing legacy `start`/`end` fields
 *  for shifts saved before this change. */
function breakAllottedMinutes(brk) {
  if (brk?.durationMinutes != null) return Number(brk.durationMinutes) || 0;
  if (brk?.start && brk?.end) return hhmmDiffMinutes(brk.start, brk.end);
  return 0;
}

/** Total unpaid break minutes configured on a shift (e.g. a 15-min morning
 *  break, an hour for lunch, a 15-min afternoon break) — the full allotted
 *  amount, regardless of whether a given record actually took all of them.
 *  Used for the shift's expected/scheduled duration. Breaks marked
 *  `paid: true` don't count here — they're not deducted from scheduled
 *  time. Breaks without a `paid` field are treated as unpaid, so existing
 *  shifts keep behaving exactly as before. */
export function getShiftBreakMinutes(shift) {
  if (!shift?.breaks?.length) return 0;
  return shift.breaks.reduce((acc, b) => b.paid ? acc : acc + breakAllottedMinutes(b), 0);
}

/** Net worked-hours effect of the breaks actually taken in a record, using
 *  the extension's real segment timeline (`record.segments`, each one
 *  `{ type: 'work'|'break', breakId, start, end }`). This is the source of
 *  truth when present — no guessing based on a fixed schedule window, since
 *  breaks are started by the employee whenever they like.
 *
 *  Base worked minutes (computed from clock punches elsewhere) already
 *  excludes every break's real gap in full, overrun included, because the
 *  extension writes one punch session per work stretch (see
 *  extension/api.js#syncSegments) with a gap for every break in between.
 *  So all this needs to do is credit *back* the on-time portion of any
 *  break marked Paid — capped at its shift-assigned allotment, so time
 *  taken beyond that allotment is never credited, whether the break is
 *  paid or unpaid. Returns a number to ADD to the base worked minutes
 *  (i.e. paid-break credit), not a deduction. */
export function computeSegmentBreakCredit(record, shift) {
  if (!record?.segments?.length || !shift?.breaks?.length) return 0;
  const breakDefs = new Map(shift.breaks.map(b => [b.id, b]));
  return record.segments
    .filter(s => s.type === 'break' && s.start && s.end)
    .reduce((acc, s) => {
      const def = breakDefs.get(s.breakId);
      if (!def?.paid) return acc; // unpaid: already excluded above, nothing to add back
      const allotted = breakAllottedMinutes(def);
      const actual = hhmmDiffMinutes(s.start, s.end);
      return acc + Math.max(0, Math.min(actual, allotted));
    }, 0);
}

/** Legacy path: minutes of a shift's configured breaks that overlap the
 *  employee's clocked time for a record, used only for records that don't
 *  carry a real segment timeline (e.g. manually entered via the Attendance
 *  page's Add/Edit Record form, which just has a single clock-in/out pair
 *  and no way to know exactly when a break happened). Approximates by
 *  assuming the full allotted length of every unpaid break was taken
 *  within the punched window. Breaks marked `paid: true` are skipped —
 *  paid time isn't deducted from worked hours. */
export function computeBreakDeductionMinutes(record, shift) {
  if (!shift?.breaks?.length) return 0;
  const punches = getSessionPunches(record).filter(p => p.clockIn && p.clockOut);
  if (!punches.length) return 0;
  const toMin = t => { const [h, m, s = 0] = t.split(':').map(Number); return h * 60 + m + s / 60; };
  const totalPunchedMinutes = punches.reduce((acc, p) => acc + Math.max(0, toMin(p.clockOut) - toMin(p.clockIn)), 0);
  let total = 0;
  for (const brk of shift.breaks) {
    if (brk.paid) continue; // paid breaks aren't deducted from worked time
    total += breakAllottedMinutes(brk);
  }
  return Math.min(total, totalPunchedMinutes);
}

/** Minutes between two "HH:mm" strings, treating a smaller end as invalid (0)
 *  rather than wrapping — used for grace-period comparisons where crossing
 *  midnight isn't a realistic case. */
function hhmmToMinutes(t) {
  if (!t) return null;
  const [h, m, s = 0] = t.split(':').map(Number);
  return h * 60 + m + s / 60;
}

/** If a punch's clock-in is *after* its scheduled start but still within the
 *  Late Threshold grace period (e.g. clocking in 14 min into a 15-min grace
 *  window), it's treated as on-time for hours purposes and snapped to the
 *  scheduled start — matching the same grace period Settings → Attendance
 *  Rules uses to decide "Present" vs "Late". Early or genuinely-late
 *  clock-ins are left as-is. */
function effectiveClockIn(clockIn, scheduledStart, lateThresholdMin) {
  const ci = hhmmToMinutes(clockIn);
  const ss = hhmmToMinutes(scheduledStart);
  if (ci == null || ss == null || !lateThresholdMin) return clockIn;
  if (ci > ss && ci - ss <= lateThresholdMin) return scheduledStart;
  return clockIn;
}

/** Total worked minutes for an attendance record. Sums every clocked session
 *  (so lunch-break gaps on split shifts aren't counted as worked time), then
 *  subtracts any of the shift's unpaid breaks the employee was actually
 *  clocked through — pass the employee's shift as the 2nd arg to enable
 *  break deduction (e.g. a standard single clock-in/out shift with a 1-hour
 *  lunch + two 15-min breaks). Pass lateThresholdMin (Settings → Attendance
 *  Rules → Late Threshold) as the 3rd arg so a clock-in within the grace
 *  period is credited as a full on-time session rather than docking the
 *  employee for a few minutes they're not actually considered late for.
 *  Falls back to the legacy single clockIn/clockOut pair when no session
 *  breakdown is present, so old records keep working unchanged. Never
 *  returns a negative number. */
export function computeWorkedMinutes(record, shift, lateThresholdMin = 0) {
  const shiftSessions = shift ? getShiftSessions(shift) : null;
  let minutes;
  if (record?.sessions?.length) {
    minutes = record.sessions.reduce((acc, s, i) => {
      const scheduled = shiftSessions?.find(ss => ss.id === s.sessionId) || shiftSessions?.[i];
      const ci = effectiveClockIn(s.clockIn, scheduled?.start, lateThresholdMin);
      return acc + hhmmDiffMinutes(ci, s.clockOut);
    }, 0);
  } else {
    const ci = effectiveClockIn(record?.clockIn, shift?.start, lateThresholdMin);
    minutes = hhmmDiffMinutes(ci, record?.clockOut);
  }
  if (shift) {
    if (record?.segments?.length) {
      // Extension-synced record: every break gap (including any overrun
      // past its allotted minutes) is already excluded from `minutes`
      // above because each work stretch is its own punch session. Only
      // paid breaks need crediting back, capped at their allotment.
      minutes += computeSegmentBreakCredit(record, shift);
    } else {
      minutes -= computeBreakDeductionMinutes(record, shift);
    }
  }
  return Math.max(0, minutes);
}

/** Normalized list of { label, clockIn, clockOut } punches for display,
 *  whether the record uses the new multi-session shape or the legacy pair. */
export function getSessionPunches(record) {
  if (record?.sessions?.length) return record.sessions;
  if (record?.clockIn || record?.clockOut) return [{ label: '', clockIn: record?.clockIn || '', clockOut: record?.clockOut || '' }];
  return [];
}

/** The session blocks an employee is expected to clock against for a shift.
 *  'split' shifts use their configured sessions array; everything else
 *  (including no shift at all) is treated as one plain session. */
export function getShiftSessions(shift) {
  if (!shift) return [{ id: 'full', label: '', start: '', end: '' }];
  if (shift.clockType === 'split' && shift.sessions?.length) return shift.sessions;
  return [{ id: 'full', label: '', start: shift.start, end: shift.end }];
}

/** Total scheduled minutes for a shift (sum of all its session durations,
 *  minus its configured breaks) — the "full day" target used for overtime.
 *  Returns 0 when there's no shift, so callers can safely subtract it. */
export function getShiftExpectedMinutes(shift) {
  if (!shift) return 0;
  const raw = getShiftSessions(shift).reduce((acc, s) => acc + hhmmDiffMinutes(s.start, s.end), 0);
  return Math.max(0, raw - getShiftBreakMinutes(shift));
}

/** Minutes worked beyond the shift's scheduled (break-excluded) duration for
 *  a given record. Returns 0 (never negative) when there's no shift or the
 *  employee worked at/under their scheduled hours. */
export function computeOvertimeMinutes(record, shift, lateThresholdMin = 0) {
  if (!shift) return 0;
  const worked = computeWorkedMinutes(record, shift, lateThresholdMin);
  const expected = getShiftExpectedMinutes(shift);
  return Math.max(0, worked - expected);
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function todayISO() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function nowISO() {
  return new Date().toISOString();
}