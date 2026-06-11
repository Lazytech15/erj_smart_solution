import { format, subDays, subHours, setHours, setMinutes, parseISO } from 'date-fns';

function makeDate(base, h, m) {
  const d = setMinutes(setHours(new Date(base), h), m);
  return d.toISOString();
}

export const DEPARTMENTS = [
  { id: 1, name: 'Engineering', headCount: 42 },
  { id: 2, name: 'Human Resources', headCount: 18 },
  { id: 3, name: 'Finance', headCount: 24 },
  { id: 4, name: 'Operations', headCount: 56 },
  { id: 5, name: 'Marketing', headCount: 21 },
  { id: 6, name: 'Sales', headCount: 38 },
  { id: 7, name: 'Customer Support', headCount: 30 },
  { id: 8, name: 'Legal & Compliance', headCount: 9 },
];

export const SHIFTS = [
  { id: 1, name: 'Morning Shift',   start: '06:00', end: '14:00', color: '#f59e0b' },
  { id: 2, name: 'Day Shift',       start: '08:00', end: '17:00', color: '#4f6ef7' },
  { id: 3, name: 'Afternoon Shift', start: '14:00', end: '22:00', color: '#10b981' },
  { id: 4, name: 'Night Shift',     start: '22:00', end: '06:00', color: '#8b5cf6' },
  { id: 5, name: 'Flexible',        start: '09:00', end: '18:00', color: '#ef4444' },
];

const AVATARS_COLORS = ['#4f6ef7','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'];

function makeEmployee(id, first, last, dept, role, shift, status = 'active') {
  return {
    id,
    firstName: first,
    lastName: last,
    fullName: `${first} ${last}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@acmecorp.com`,
    phone: `+63 9${Math.floor(100000000 + Math.random() * 900000000)}`,
    employeeCode: `EMP-${String(id).padStart(4, '0')}`,
    department: DEPARTMENTS.find(d => d.id === dept),
    role,
    shift: SHIFTS.find(s => s.id === shift),
    status,
    joinDate: format(subDays(new Date(), Math.floor(Math.random() * 1000 + 30)), 'yyyy-MM-dd'),
    avatarColor: AVATARS_COLORS[(id - 1) % AVATARS_COLORS.length],
    manager: id > 4 ? `EMP-000${(id % 4) + 1}` : null,
  };
}

export const EMPLOYEES = [
  makeEmployee(1,  'Maria',    'Santos',     2, 'HR Manager',         2),
  makeEmployee(2,  'Jose',     'Reyes',      1, 'Engineering Lead',    2),
  makeEmployee(3,  'Ana',      'Cruz',       3, 'Finance Director',    2),
  makeEmployee(4,  'Carlos',   'Garcia',     4, 'Operations Head',     2),
  makeEmployee(5,  'Lena',     'Mendoza',    1, 'Senior Developer',    2),
  makeEmployee(6,  'Marco',    'Villanueva', 1, 'Frontend Engineer',   5),
  makeEmployee(7,  'Sofia',    'Ramos',      5, 'Marketing Lead',      2),
  makeEmployee(8,  'Diego',    'Torres',     6, 'Sales Executive',     2),
  makeEmployee(9,  'Isabel',   'Navarro',    7, 'Support Specialist',  3),
  makeEmployee(10, 'Luis',     'Morales',    7, 'Support Specialist',  4),
  makeEmployee(11, 'Camila',   'Jimenez',    3, 'Accountant',          2),
  makeEmployee(12, 'Andres',   'Herrera',    4, 'Logistics Officer',   1),
  makeEmployee(13, 'Valentina','Romero',     5, 'Brand Designer',      5),
  makeEmployee(14, 'Sebastian','Diaz',       6, 'Sales Rep',           2),
  makeEmployee(15, 'Natalia',  'Martinez',  8, 'Legal Counsel',       2),
  makeEmployee(16, 'Felipe',   'Lopez',      1, 'Backend Engineer',    2),
  makeEmployee(17, 'Lucia',    'Gonzalez',   2, 'HR Specialist',       2),
  makeEmployee(18, 'Rafael',   'Perez',      4, 'Warehouse Lead',      1),
  makeEmployee(19, 'Alejandra','Vargas',     7, 'Support Team Lead',   3),
  makeEmployee(20, 'Miguel',   'Castillo',   1, 'DevOps Engineer',     2),
];

const STATUSES = ['present','present','present','present','present','late','late','absent','leave'];

function makeRecord(employeeId, date, statusOverride) {
  const emp = EMPLOYEES.find(e => e.id === employeeId);
  const shift = emp?.shift;
  const [sh, sm] = (shift?.start || '08:00').split(':').map(Number);
  const [eh, em] = (shift?.end   || '17:00').split(':').map(Number);
  const status = statusOverride || STATUSES[Math.floor(Math.random() * STATUSES.length)];

  if (status === 'absent' || status === 'leave') {
    return { id: `${employeeId}-${date}`, employeeId, date, status, clockIn: null, clockOut: null, breakMinutes: 0, totalMinutes: 0, overtime: 0 };
  }

  const lateMin = status === 'late' ? Math.floor(Math.random() * 45 + 16) : Math.floor(Math.random() * 10);
  const earlyOut = Math.floor(Math.random() * 15);
  const d = new Date(`${date}T00:00:00`);
  const clockIn  = makeDate(d, sh, sm + lateMin);
  const clockOut = makeDate(d, eh, em - earlyOut);
  const totalMinutes = (eh * 60 + em - earlyOut) - (sh * 60 + sm + lateMin);
  const breakMinutes = 60;
  const workMinutes = totalMinutes - breakMinutes;
  const expectedMinutes = (eh - sh) * 60 + (em - sm);
  const overtime = Math.max(0, workMinutes - expectedMinutes + 60);

  return { id: `${employeeId}-${date}`, employeeId, date, status, clockIn, clockOut, breakMinutes, totalMinutes: workMinutes, overtime };
}

export function generateRecords(days = 30) {
  const records = [];
  for (let d = 0; d < days; d++) {
    const date = format(subDays(new Date(), d), 'yyyy-MM-dd');
    const dow = new Date(date).getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    EMPLOYEES.forEach(emp => {
      records.push(makeRecord(emp.id, date));
    });
  }
  return records;
}

export const ALL_RECORDS = generateRecords(60);

// Today's summary
export function getTodaySummary() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayRecs = ALL_RECORDS.filter(r => r.date === today);
  const present = todayRecs.filter(r => r.status === 'present').length;
  const late    = todayRecs.filter(r => r.status === 'late').length;
  const absent  = todayRecs.filter(r => r.status === 'absent').length;
  const leave   = todayRecs.filter(r => r.status === 'leave').length;
  const total   = EMPLOYEES.length;
  return { present, late, absent, leave, total, attendanceRate: Math.round(((present + late) / total) * 100) };
}

export const LEAVE_TYPES = ['Vacation', 'Sick', 'Emergency', 'Bereavement', 'Maternity/Paternity', 'Unpaid'];

export const LEAVE_REQUESTS = [
  { id: 1, employeeId: 5, type: 'Vacation',   from: format(subDays(new Date(),  2), 'yyyy-MM-dd'), to: format(subDays(new Date(),  1), 'yyyy-MM-dd'), status: 'approved', reason: 'Family vacation' },
  { id: 2, employeeId: 9, type: 'Sick',        from: format(new Date(), 'yyyy-MM-dd'),               to: format(new Date(), 'yyyy-MM-dd'),               status: 'pending',  reason: 'Fever and flu symptoms' },
  { id: 3, employeeId: 13,type: 'Emergency',   from: format(subDays(new Date(),  1), 'yyyy-MM-dd'), to: format(subDays(new Date(),  1), 'yyyy-MM-dd'), status: 'approved', reason: 'Family emergency' },
  { id: 4, employeeId: 7, type: 'Vacation',   from: format(subDays(new Date(), -5), 'yyyy-MM-dd'), to: format(subDays(new Date(), -2), 'yyyy-MM-dd'), status: 'pending',  reason: 'Annual leave' },
  { id: 5, employeeId: 11,type: 'Sick',        from: format(subDays(new Date(),  3), 'yyyy-MM-dd'), to: format(subDays(new Date(),  3), 'yyyy-MM-dd'), status: 'rejected', reason: 'Not feeling well' },
];

export const ANNOUNCEMENTS = [
  { id: 1, title: 'Biometrics Maintenance — June 12', body: 'NFC readers on Floor 3 will be offline from 8–10 AM for firmware updates. Use the mobile app to clock in.', type: 'info',    date: format(subDays(new Date(), 1), 'yyyy-MM-dd') },
  { id: 2, title: 'New Overtime Policy Effective July 1', body: 'Pre-approval now required for overtime exceeding 2 hours per day. Updated forms available in the portal.', type: 'warning', date: format(subDays(new Date(), 3), 'yyyy-MM-dd') },
  { id: 3, title: 'Holiday: Rizal Day — December 30', body: 'A reminder that December 30 is a declared regular holiday. Skeleton crew schedules have been sent to department heads.', type: 'success', date: format(subDays(new Date(), 7), 'yyyy-MM-dd') },
];