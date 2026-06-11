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

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function todayISO() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function nowISO() {
  return new Date().toISOString();
}