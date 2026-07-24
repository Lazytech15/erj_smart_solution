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
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
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

/** Minutes between two "HH:mm" strings. Treats a smaller end-time as crossing midnight. */
export function hhmmDiffMinutes(clockIn, clockOut) {
  if (!clockIn || !clockOut) return 0;
  const [ih, im] = clockIn.split(':').map(Number);
  const [oh, om] = clockOut.split(':').map(Number);
  let diff = (oh * 60 + om) - (ih * 60 + im);
  if (diff < 0) diff += 24 * 60;
  return diff;
}

/** Total unpaid break minutes configured on a shift (e.g. a 15-min morning
 *  break, an hour for lunch, a 15-min afternoon break) — the full scheduled
 *  amount, regardless of whether a given record actually clocked through
 *  all of them. Used for the shift's expected/scheduled duration. Breaks
 *  marked `paid: true` don't count here — they're not deducted from
 *  scheduled time. Breaks without a `paid` field are treated as unpaid,
 *  so existing shifts keep behaving exactly as before. */
export function getShiftBreakMinutes(shift) {
  if (!shift?.breaks?.length) return 0;
  return shift.breaks.reduce((acc, b) => b.paid ? acc : acc + hhmmDiffMinutes(b.start, b.end), 0);
}

/** Minutes of a shift's configured breaks that actually overlap the
 *  employee's clocked time for a record — i.e. only deduct a break (or the
 *  portion of it) the employee was actually clocked through. An employee
 *  who clocked out early, mid-break, only loses the overlapping minutes.
 *  Breaks marked `paid: true` are skipped entirely — paid time isn't
 *  deducted from worked hours. */
export function computeBreakDeductionMinutes(record, shift) {
  if (!shift?.breaks?.length) return 0;
  const punches = getSessionPunches(record).filter(p => p.clockIn && p.clockOut);
  if (!punches.length) return 0;
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  let total = 0;
  for (const brk of shift.breaks) {
    if (brk.paid) continue; // paid breaks aren't deducted from worked time
    if (!brk.start || !brk.end) continue;
    const bs = toMin(brk.start), be = toMin(brk.end);
    if (be <= bs) continue; // skip invalid/overnight breaks
    for (const p of punches) {
      const ps = toMin(p.clockIn), pe = toMin(p.clockOut);
      total += Math.max(0, Math.min(be, pe) - Math.max(bs, ps));
    }
  }
  return total;
}

/** Minutes between two "HH:mm" strings, treating a smaller end as invalid (0)
 *  rather than wrapping — used for grace-period comparisons where crossing
 *  midnight isn't a realistic case. */
function hhmmToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
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
  if (shift) minutes -= computeBreakDeductionMinutes(record, shift);
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