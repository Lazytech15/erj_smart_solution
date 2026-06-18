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

/** Total worked minutes for an attendance record. Sums every clocked session
 *  (so lunch-break gaps on split shifts aren't counted as worked time).
 *  Falls back to the legacy single clockIn/clockOut pair when no session
 *  breakdown is present, so old records keep working unchanged. */
export function computeWorkedMinutes(record) {
  if (record?.sessions?.length) {
    return record.sessions.reduce((acc, s) => acc + hhmmDiffMinutes(s.clockIn, s.clockOut), 0);
  }
  return hhmmDiffMinutes(record?.clockIn, record?.clockOut);
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

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function todayISO() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function nowISO() {
  return new Date().toISOString();
}