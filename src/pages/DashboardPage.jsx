import { useMemo, useState } from 'react';
import { format, subDays, differenceInCalendarDays, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { Users, Clock, UserX, CalendarCheck, TrendingUp, CheckCircle, UserCheck, Timer, ArrowRight, CalendarDays, LogIn, LogOut, Briefcase, Sun, AlertCircle, Building2, ChevronDown, Search } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie  } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { fmt } from '../utils/dateTime';
import { StatCard, StatusBadge, Avatar, SectionHeader, ProgressBar } from '../components/ui';
import MiniCalendar from '../components/Calendar';
import { useNavigate } from 'react-router-dom';

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6'];

export default function DashboardPage() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const { subscription, currentPlan, seatsUsed } = useSubscription();

  const isEmployee = user?.role === 'employee';

  if (isEmployee) {
    return <EmployeeDashboard user={user} subscription={subscription} navigate={navigate} />;
  }

  return <AdminDashboard user={user} can={can} subscription={subscription} currentPlan={currentPlan} seatsUsed={seatsUsed} navigate={navigate} />;
}

/* ─────────────────────────────────────────────
   Employee Dashboard
───────────────────────────────────────────── */
function EmployeeDashboard({ user, subscription, navigate }) {
  const employees        = subscription?.enrolledEmployees || [];
  const attendanceRecords = subscription?.attendanceRecords || [];
  const leaveRequests    = subscription?.leaveRequests || [];

  // Find this employee's profile from enrolledEmployees
  const empProfile = useMemo(() =>
    employees.find(e => String(e.id) === String(user?.employeeId) ||
                        String(e.accountEmployeeId) === String(user?.employeeId) ||
                        e.email === user?.email),
  [employees, user]);

  const myId = empProfile ? String(empProfile.id) : null;

  // My attendance records
  const myRecords = useMemo(() =>
    attendanceRecords.filter(r => String(r.employeeId) === myId),
  [attendanceRecords, myId]);

  // My leave requests
  const myLeave = useMemo(() =>
    leaveRequests.filter(r => String(r.employeeId) === myId),
  [leaveRequests, myId]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayRecord = myRecords.find(r => r.date === today);

  // This month's records
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const monthEnd   = format(endOfMonth(new Date()), 'yyyy-MM-dd');
  const monthRecords = myRecords.filter(r => r.date >= monthStart && r.date <= monthEnd);

  const presentDays = monthRecords.filter(r => r.status === 'present').length;
  const lateDays    = monthRecords.filter(r => r.status === 'late').length;
  const absentDays  = monthRecords.filter(r => r.status === 'absent').length;

  // Pending leave
  const pendingLeave   = myLeave.filter(r => r.status === 'pending').length;
  const approvedLeave  = myLeave.filter(r => r.status === 'approved').length;

  // Last 14 days trend
  const trendData = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const date = format(subDays(new Date(), 13 - i), 'yyyy-MM-dd');
      const rec  = myRecords.find(r => r.date === date);
      const label = format(subDays(new Date(), 13 - i), 'dd');
      return {
        day: label,
        status: rec?.status || 'no-record',
        present: rec?.status === 'present' ? 1 : 0,
        late:    rec?.status === 'late'    ? 1 : 0,
        absent:  rec?.status === 'absent'  ? 1 : 0,
      };
    });
  }, [myRecords]);

  // Leave balance
  const leaveBalances = empProfile?.leaveBalances || {};
  const leaveTypes    = subscription?.settings?.leaveTypes || [];

  const todayClockIn  = todayRecord?.clockIn  || todayRecord?.sessions?.[0]?.clockIn;
  const todayClockOut = todayRecord?.clockOut || todayRecord?.sessions?.[todayRecord?.sessions?.length - 1]?.clockOut;

  // Recent leave requests (last 5)
  const recentLeave = [...myLeave].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4);

  return (
    <div className="space-y-5">
      <SectionHeader
        title={`Good ${getGreeting()}, ${user?.name?.split(' ')[0] || 'there'}`}
        description={`${subscription?.company?.name || 'Your company'} · ${fmt.date(new Date())}`}
      />

      {/* Today's clock-in card */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-ink-700">Today's Attendance</p>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            !todayRecord         ? 'bg-surface-100 text-ink-400'
            : todayRecord.status === 'present' ? 'bg-emerald-100 text-emerald-700'
            : todayRecord.status === 'late'    ? 'bg-amber-100 text-amber-700'
            : todayRecord.status === 'absent'  ? 'bg-red-100 text-red-700'
            : 'bg-surface-100 text-ink-400'
          }`}>
            {!todayRecord ? 'Not recorded' : todayRecord.status.charAt(0).toUpperCase() + todayRecord.status.slice(1)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#dcfce7' }}>
              <LogIn size={15} style={{ color: '#16a34a' }} />
            </div>
            <div>
              <p className="text-[10px] text-ink-400 font-medium">Clock In</p>
              <p className="text-sm font-bold text-ink-800">{todayClockIn || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#fee2e2' }}>
              <LogOut size={15} style={{ color: '#dc2626' }} />
            </div>
            <div>
              <p className="text-[10px] text-ink-400 font-medium">Clock Out</p>
              <p className="text-sm font-bold text-ink-800">{todayClockOut || '—'}</p>
            </div>
          </div>
        </div>
        {empProfile?.shiftId && (() => {
          const shift = (subscription?.shifts || []).find(s => String(s.id) === String(empProfile.shiftId));
          return shift ? (
            <p className="text-[10px] text-ink-400 mt-2 flex items-center gap-1">
              <Briefcase size={10} /> Shift: {shift.name} · {shift.start} – {shift.end}
            </p>
          ) : null;
        })()}
      </div>

      {/* This month stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Present This Month"  value={presentDays} icon={CheckCircle} color="success" onClick={() => navigate('/app/attendance?status=present')} />
        <StatCard label="Late This Month"     value={lateDays}    icon={Timer}       color="warning" onClick={() => navigate('/app/attendance?status=late')} />
        <StatCard label="Absent This Month"   value={absentDays}  icon={UserX}       color="danger"  onClick={() => navigate('/app/attendance?status=absent')} />
        <StatCard label="Pending Leave"       value={pendingLeave} icon={CalendarCheck} color="info" onClick={() => navigate('/app/leave?status=pending')} />
      </div>

      {/* Attendance trend + Leave balance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 14-day trend */}
        <div className="card p-4 col-span-2">
          <p className="text-xs font-semibold text-ink-700 mb-3">My Attendance — Last 14 Days</p>
          {myRecords.length === 0 ? (
            <div className="h-36 flex items-center justify-center text-xs text-ink-300">
              No attendance records yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={trendData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barSize={10} barGap={1}>
                <XAxis dataKey="day" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  formatter={(v, name) => [v === 1 ? 'Yes' : 'No', name]}
                />
                <Bar dataKey="present" name="Present" fill="#10b981" radius={[3,3,0,0]} />
                <Bar dataKey="late"    name="Late"    fill="#f59e0b" radius={[3,3,0,0]} />
                <Bar dataKey="absent"  name="Absent"  fill="#ef4444" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="flex items-center gap-4 mt-1">
            {[['#10b981','Present'],['#f59e0b','Late'],['#ef4444','Absent']].map(([c,l]) => (
              <span key={l} className="flex items-center gap-1 text-[10px] text-ink-500">
                <span className="w-2 h-2 rounded-full" style={{ background: c }} />{l}
              </span>
            ))}
          </div>
        </div>

        {/* Leave balance */}
        <div className="card p-4">
          <p className="text-xs font-semibold text-ink-700 mb-3">Leave Balance</p>
          {leaveTypes.length === 0 ? (
            <div className="h-36 flex items-center justify-center text-xs text-ink-300 text-center">
              No leave types configured.
            </div>
          ) : (
            <div className="space-y-3">
              {leaveTypes.map(lt => {
                const used      = leaveBalances[lt.name]?.used      ?? 0;
                const allocated = leaveBalances[lt.name]?.allocated ?? lt.defaultDays ?? 0;
                const remaining = Math.max(0, allocated - used);
                const pct       = allocated > 0 ? Math.round((used / allocated) * 100) : 0;
                return (
                  <div key={lt.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium text-ink-700">{lt.name}</span>
                      <span className="text-[11px] text-ink-500">{remaining}<span className="text-ink-300">/{allocated}</span> left</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${pct}%`,
                        background: pct >= 90 ? '#ef4444' : pct >= 60 ? '#f59e0b' : '#10b981',
                      }} />
                    </div>
                  </div>
                );
              })}
              <button onClick={() => navigate('/app/leave')}
                className="w-full mt-2 text-[11px] text-brand-600 hover:underline flex items-center justify-center gap-1 pt-1">
                View all leave <ArrowRight size={10} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Recent leave requests */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-ink-700">Recent Leave Requests</p>
          <button onClick={() => navigate('/app/leave')} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
            View all <ArrowRight size={11} />
          </button>
        </div>
        {recentLeave.length === 0 ? (
          <p className="text-xs text-ink-300 py-4 text-center">No leave requests yet.</p>
        ) : (
          <div className="space-y-2">
            {recentLeave.map(req => {
              const days = req.endDate
                ? differenceInCalendarDays(new Date(req.endDate), new Date(req.startDate)) + 1
                : 1;
              return (
                <div key={req.id} className="flex items-center gap-3 py-1.5 border-b border-surface-100 last:border-0">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: req.status === 'approved' ? '#f0fdf4' : req.status === 'rejected' ? '#fef2f2' : '#fffbeb' }}>
                    <Sun size={13} style={{ color: req.status === 'approved' ? '#16a34a' : req.status === 'rejected' ? '#dc2626' : '#d97706' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-ink-800 truncate">{req.leaveType ?? req.type ?? 'Leave'}</p>
                    <p className="text-[10px] text-ink-400">
                      {fmt.date(req.startDate)}{req.endDate && req.endDate !== req.startDate ? ` – ${fmt.date(req.endDate)}` : ''} · {days} day{days !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                    req.status === 'approved' ? 'bg-emerald-100 text-emerald-700'
                    : req.status === 'rejected' ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
                  }`}>
                    {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <MiniCalendar leaveRequests={myLeave} employees={employees} />
        {/* My profile summary */}
        {empProfile && (
          <div className="card p-4 lg:col-span-2 h-fit">
            <p className="text-xs font-semibold text-ink-700 mb-3">My Profile</p>
            <div className="flex items-center gap-4">
              <Avatar name={`${empProfile.firstName} ${empProfile.lastName}`} color={empProfile.avatarColor} size="lg" src={empProfile.profilePhotoUrl} />
              <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-6 gap-y-1">
                {[
                  ['Role',       empProfile.role],
                  ['Department', empProfile.department],
                  ['Employee ID', empProfile.employeeCode],
                  ['Start Date', empProfile.joinDate ? fmt.date(empProfile.joinDate) : '—'],
                ].map(([label, val]) => (
                  <div key={label}>
                    <p className="text-[10px] text-ink-400">{label}</p>
                    <p className="text-xs font-semibold text-ink-800 truncate">{val || '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Admin / HR Dashboard (unchanged)
───────────────────────────────────────────── */
function AdminDashboard({ user, can, subscription, currentPlan, seatsUsed, navigate }) {
  const employees        = subscription?.enrolledEmployees || [];
  const attendanceRecords = subscription?.attendanceRecords || [];
  const leaveRequests    = subscription?.leaveRequests || [];

  const today        = format(new Date(), 'yyyy-MM-dd');
  const todayRecs    = attendanceRecords.filter(r => r.date === today);
  const presentToday = todayRecs.filter(r => r.status === 'present' || r.status === 'late').length;
  const lateToday    = todayRecs.filter(r => r.status === 'late').length;
  const absentToday  = employees.filter(e => e.status === 'active' && !todayRecs.find(r => String(r.employeeId) === String(e.id))).length;
  const pendingLeave = leaveRequests.filter(r => r.status === 'pending').length;

  const weekTrend = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date    = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd');
      const dayRecs = attendanceRecords.filter(r => r.date === date);
      return {
        day:     format(subDays(new Date(), 6 - i), 'EEE'),
        present: dayRecs.filter(r => r.status === 'present').length,
        late:    dayRecs.filter(r => r.status === 'late').length,
        absent:  dayRecs.filter(r => r.status === 'absent').length,
      };
    });
  }, [attendanceRecords]);

  const pieData = [
    { name: 'Present', value: presentToday },
    { name: 'Late',    value: lateToday    },
    { name: 'Absent',  value: absentToday  },
    { name: 'Leave',   value: pendingLeave },
  ].filter(d => d.value > 0);

  const activeEmployees = employees.filter(e => e.status === 'active');

  return (
    <div className="space-y-5">
      <SectionHeader
        title={`Good ${getGreeting()}, ${user?.name?.split(' ')[0] || 'there'}`}
        description={`${subscription?.company?.name || 'Your company'} · ${fmt.date(new Date())}`}
      />

      {employees.length === 0 ? (
        <div className="card p-10 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mb-4">
            <Users size={28} className="text-brand-500" />
          </div>
          <h3 className="text-sm font-bold text-ink-900 mb-1">Welcome to ERJ!</h3>
          <p className="text-xs text-ink-400 mb-5 max-w-xs">
            Your workspace is ready. Start by enrolling your employees to begin tracking attendance.
          </p>
          <button className="btn-primary btn-sm" onClick={() => navigate('/app/employees')}>
            <Users size={13} /> Enroll Employees
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total Employees" value={activeEmployees.length} icon={Users}        color="brand"   onClick={() => navigate('/app/employees')} />
            <StatCard label="Present Today"   value={presentToday}          icon={UserCheck}     color="success" onClick={() => navigate('/app/attendance?status=present')} />
            <StatCard label="Late Today"      value={lateToday}             icon={Timer}         color="warning" onClick={() => navigate('/app/attendance?status=late')} />
            <StatCard label="Pending Leave"   value={pendingLeave}          icon={CalendarCheck} color="info"    onClick={() => navigate('/app/leave?status=pending')} />
          </div>

          <DashboardOverview
            employees={activeEmployees}
            attendanceRecords={attendanceRecords}
            todayRecs={todayRecs}
            leaveRequests={leaveRequests}
            departments={subscription?.departments || []}
            navigate={navigate}
          />
        </>
      )}

      <div className="card p-4">
        {currentPlan && (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-ink-700">Plan Usage · {currentPlan.name}</p>
              <button onClick={() => navigate('/app/subscription')} className="text-xs text-brand-600 hover:underline">Manage</button>
            </div>
            <ProgressBar
              value={currentPlan.maxSeats === Infinity ? 5 : Math.round((seatsUsed / currentPlan.maxSeats) * 100)}
              label={currentPlan.maxSeats === Infinity ? `${seatsUsed} employees (unlimited)` : `${seatsUsed} / ${currentPlan.maxSeats} seats used`}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Dashboard Overview — Attendance chart + Departments + Logged-in list
───────────────────────────────────────────── */
const DEPT_COLORS = ['#4f6ef7', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

function DashboardOverview({ employees, attendanceRecords, todayRecs, leaveRequests, departments, navigate }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [viewMode, setViewMode]       = useState('month'); // 'month' | 'year'
  const [selectedDept, setSelectedDept] = useState('All Departments');
  const [tab, setTab] = useState('loggedIn'); // loggedIn | onTime | late
  const [search, setSearch] = useState('');

  const monthDate  = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthOffset);
    return d;
  }, [monthOffset]);

  // Daily on-time vs late counts for the current month (weekday buckets, like the reference chart)
  const monthTrend = useMemo(() => {
    const start = startOfMonth(monthDate);
    const end   = endOfMonth(monthDate);
    const days  = eachDayOfInterval({ start, end }).filter(d => d <= new Date() || monthOffset > 0);
    return days.map(d => {
      const dateStr = format(d, 'yyyy-MM-dd');
      const recs    = attendanceRecords.filter(r => r.date === dateStr);
      return {
        day:    format(d, 'd-EEE'),
        label:  format(d, 'EEE'),
        onTime: recs.filter(r => r.status === 'present').length,
        late:   recs.filter(r => r.status === 'late').length,
      };
    }).slice(-10); // keep the chart readable
  }, [attendanceRecords, monthDate, monthOffset]);

  // On-time vs late per month, for the whole year (Jan → Dec)
  const yearTrend = useMemo(() => {
    const year = monthDate.getFullYear();
    return Array.from({ length: 12 }, (_, i) => {
      const recs = attendanceRecords.filter(r => r.date?.startsWith(`${year}-${String(i + 1).padStart(2, '0')}`));
      return {
        label:  format(new Date(year, i, 1), 'MMM'),
        onTime: recs.filter(r => r.status === 'present').length,
        late:   recs.filter(r => r.status === 'late').length,
      };
    });
  }, [attendanceRecords, monthDate]);

  const chartData = viewMode === 'year' ? yearTrend : monthTrend;

  // On-time vs late split — always the *real* current month and current year,
  // regardless of the ‹ › navigation above (which only moves the bar chart).
  // Computed from full, untruncated date ranges — monthTrend/yearTrend above
  // aren't reused here because monthTrend is .slice(-10)'d for chart display,
  // which would otherwise undercount the month to its last 10 days.
  const toPieData = (rows, colors) => {
    const totals = rows.reduce((acc, d) => ({ onTime: acc.onTime + d.onTime, late: acc.late + d.late }), { onTime: 0, late: 0 });
    return [
      { name: 'On-time', value: totals.onTime, color: colors.onTime },
      { name: 'Late',     value: totals.late,   color: colors.late },
    ].filter(d => d.value > 0);
  };

  const currentMonthTrend = useMemo(() => {
    const now   = new Date();
    const start = startOfMonth(now);
    const end   = endOfMonth(now);
    const days  = eachDayOfInterval({ start, end }).filter(d => d <= now);
    return days.map(d => {
      const dateStr = format(d, 'yyyy-MM-dd');
      const recs    = attendanceRecords.filter(r => r.date === dateStr);
      return { onTime: recs.filter(r => r.status === 'present').length, late: recs.filter(r => r.status === 'late').length };
    });
  }, [attendanceRecords]);

  const currentYearTrend = useMemo(() => {
    const year = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, i) => {
      const recs = attendanceRecords.filter(r => r.date?.startsWith(`${year}-${String(i + 1).padStart(2, '0')}`));
      return { onTime: recs.filter(r => r.status === 'present').length, late: recs.filter(r => r.status === 'late').length };
    });
  }, [attendanceRecords]);

  // Monthly = blue tones, Yearly = purple tones, so the combined donut is easy to tell apart
  const monthPieData = useMemo(() => toPieData(currentMonthTrend, { onTime: '#4f6ef7', late: '#c7d2fe' }), [currentMonthTrend]);
  const yearPieData  = useMemo(() => toPieData(currentYearTrend,  { onTime: '#7c3aed', late: '#e9d5ff' }), [currentYearTrend]);

  // Per-department breakdown (based on today's attendance)
  const deptStats = useMemo(() => {
    return (departments || []).map(dept => {
      const deptEmployees = employees.filter(e => e.department === dept);
      const deptIds       = new Set(deptEmployees.map(e => String(e.id)));
      const deptTodayRecs = todayRecs.filter(r => deptIds.has(String(r.employeeId)));
      const onTime = deptTodayRecs.filter(r => r.status === 'present').length;
      const late   = deptTodayRecs.filter(r => r.status === 'late').length;
      const leave  = (leaveRequests || []).filter(r => r.status === 'approved' && deptIds.has(String(r.employeeId))
        && r.startDate <= format(new Date(), 'yyyy-MM-dd') && (r.endDate || r.startDate) >= format(new Date(), 'yyyy-MM-dd')).length;
      return { name: dept, total: deptEmployees.length, onTime, late, leave };
    });
  }, [departments, employees, todayRecs, leaveRequests]);

  // Employees "logged in" today (have a record), filtered by dept + tab + search
  const loggedInList = useMemo(() => {
    return employees
      .filter(e => selectedDept === 'All Departments' || e.department === selectedDept)
      .map(e => ({ emp: e, rec: todayRecs.find(r => String(r.employeeId) === String(e.id)) }))
      .filter(({ rec }) => !!rec)
      .filter(({ rec }) => tab === 'loggedIn' || (tab === 'onTime' && rec.status === 'present') || (tab === 'late' && rec.status === 'late'))
      .filter(({ emp }) => !search.trim() || `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => (b.rec?.clockIn || '').localeCompare(a.rec?.clockIn || ''));
  }, [employees, todayRecs, selectedDept, tab, search]);

  const loggedInTotal = employees.filter(e => todayRecs.find(r => String(r.employeeId) === String(e.id))).length;
  const onTimeTotal   = employees.filter(e => todayRecs.find(r => String(r.employeeId) === String(e.id) && r.status === 'present')).length;
  const lateTotal     = employees.filter(e => todayRecs.find(r => String(r.employeeId) === String(e.id) && r.status === 'late')).length;

  // Leave requests today, for the "Today's Overview" panel filling out the employee list column
  const onLeaveToday = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return (leaveRequests || []).filter(r => r.status === 'approved' && r.startDate <= todayStr && (r.endDate || r.startDate) >= todayStr);
  }, [leaveRequests]);
  const absentToday = Math.max(0, employees.length - loggedInTotal - onLeaveToday.length);

  // Most recent leave requests, for filling out the employee-list column
  const recentLeaveRequests = useMemo(() => {
    return [...(leaveRequests || [])]
      .sort((a, b) => new Date(b.createdAt || b.startDate) - new Date(a.createdAt || a.startDate))
      .slice(0, 4)
      .map(r => ({ ...r, emp: employees.find(e => String(e.id) === String(r.employeeId)) }));
  }, [leaveRequests, employees]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      {/* Attendance Status chart */}
      <div className="card p-4 lg:col-span-5">
        <div className="flex items-center justify-between mb-3 gap-2">
          <p className="text-xs font-semibold text-ink-700">
            Attendance Status · {viewMode === 'year' ? format(monthDate, 'yyyy') : format(monthDate, 'MMM yyyy')}
          </p>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-surface-200 p-0.5">
              <button
                onClick={() => setViewMode('month')}
                className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors ${viewMode === 'month' ? 'bg-brand-600 text-white' : 'text-ink-400 hover:text-ink-600'}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setViewMode('year')}
                className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors ${viewMode === 'year' ? 'bg-brand-600 text-white' : 'text-ink-400 hover:text-ink-600'}`}
              >
                Yearly
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setMonthOffset(o => o + 1)} className="btn-ghost p-1 rounded-md text-[11px]">‹</button>
              <button onClick={() => setMonthOffset(o => Math.max(0, o - 1))} className="btn-ghost p-1 rounded-md text-[11px]">›</button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 mb-2">
          <span className="flex items-center gap-1.5 text-[10px] text-ink-500"><span className="w-2 h-2 rounded-full bg-brand-500" />On-time</span>
          <span className="flex items-center gap-1.5 text-[10px] text-ink-500"><span className="w-2 h-2 rounded-full bg-amber-300" />Late</span>
        </div>
        {attendanceRecords.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-xs text-ink-300 text-center px-4">
            No attendance data yet. Records will appear here once employees clock in.
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barGap={4}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} cursor={{ fill: 'rgba(79,110,247,0.05)' }} />
                <Bar dataKey="onTime" name="On-time" fill="#4f6ef7" radius={[4, 4, 0, 0]} maxBarSize={16} />
                <Bar dataKey="late"   name="Late"    fill="#fde68a" radius={[4, 4, 0, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>

            {/* On-time vs late split — Monthly (inner ring) and Yearly (outer ring) combined */}
            <div className="mt-2 pt-3 border-t border-surface-100">
              {monthPieData.length === 0 && yearPieData.length === 0 ? (
                <p className="text-xs text-ink-300 py-3 w-full text-center">No split records yet.</p>
              ) : (
                <div className="flex items-center gap-4">
                  <PieChart width={90} height={90}>
                    {monthPieData.length > 0 && (
                      <Pie data={monthPieData} dataKey="value" nameKey="name" innerRadius={18} outerRadius={32} paddingAngle={2} stroke="none">
                        {monthPieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                    )}
                    {yearPieData.length > 0 && (
                      <Pie data={yearPieData} dataKey="value" nameKey="name" innerRadius={36} outerRadius={44} paddingAngle={2} stroke="none">
                        {yearPieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                    )}
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  </PieChart>
                  <div className="flex-1 space-y-3">
                    {[
                      { label: `Monthly Split · ${format(new Date(), 'MMM yyyy')}`, data: monthPieData },
                      { label: `Yearly Split · ${format(new Date(), 'yyyy')}`,      data: yearPieData  },
                    ].map(({ label, data }) => (
                      <div key={label}>
                        <p className="text-[10px] font-semibold text-ink-400 uppercase tracking-wide mb-1">{label}</p>
                        {data.length === 0 ? (
                          <p className="text-[11px] text-ink-300">No {label.toLowerCase()} records yet.</p>
                        ) : (
                          <div className="space-y-1">
                            {data.map(d => {
                              const total = data.reduce((s, x) => s + x.value, 0);
                              const pct   = total > 0 ? Math.round((d.value / total) * 100) : 0;
                              return (
                                <div key={d.name} className="flex items-center gap-2 text-xs">
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                                  <span className="text-ink-600 flex-1">{d.name}</span>
                                  <span className="font-semibold text-ink-800">{d.value}</span>
                                  <span className="text-ink-300 w-8 text-right">{pct}%</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* All Departments + Calendar */}
      <div className="lg:col-span-3 space-y-4">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-ink-700">All Departments</p>
            <button onClick={() => navigate('/app/departments')} className="text-[11px] text-brand-600 hover:underline">Manage</button>
          </div>
          {deptStats.length === 0 ? (
            <div className="py-10 flex flex-col items-center text-center">
              <Building2 size={20} className="text-ink-300 mb-2" />
              <p className="text-xs text-ink-300">No departments yet.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {deptStats.map((d, i) => (
                <button
                  key={d.name}
                  onClick={() => setSelectedDept(d.name)}
                  className={`w-full text-left rounded-xl border p-3 transition-colors ${
                    selectedDept === d.name ? 'border-brand-300 bg-brand-50/50' : 'border-surface-200 hover:bg-surface-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-700 truncate">
                      <Building2 size={12} style={{ color: DEPT_COLORS[i % DEPT_COLORS.length] }} />
                      {d.name}
                    </span>
                    <span className="text-base font-bold text-ink-900">{d.total}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-ink-400">
                    <span>On-time <b className="text-ink-700">{String(d.onTime).padStart(2, '0')}</b></span>
                    <span>Late <b className="text-ink-700">{String(d.late).padStart(2, '0')}</b></span>
                    <span>Leave <b className="text-ink-700">{String(d.leave).padStart(2, '0')}</b></span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <MiniCalendar leaveRequests={leaveRequests} employees={employees} />
      </div>

      {/* Select Department — logged in / on time / late employee list, plus recent leave requests */}
      <div className="lg:col-span-4 space-y-4">
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="relative">
            <select
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
              className="text-xs font-semibold text-ink-700 bg-transparent pr-5 outline-none appearance-none cursor-pointer"
            >
              <option>All Departments</option>
              {departments.map(d => <option key={d}>{d}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-0 top-1 text-ink-400 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-1 mb-3 border-b border-surface-100">
          {[
            ['loggedIn', 'Logged in', loggedInTotal],
            ['onTime',   'On Time',   onTimeTotal],
            ['late',     'Late',      lateTotal],
          ].map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-2.5 py-2 text-[11px] font-semibold border-b-2 -mb-px transition-colors ${
                tab === key ? 'border-brand-500 text-brand-600' : 'border-transparent text-ink-400 hover:text-ink-600'
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        <div className="relative mb-3">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employees"
            className="w-full text-xs pl-7 pr-2 py-1.5 rounded-lg border border-surface-200 outline-none focus:border-brand-300"
          />
        </div>

        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
          {loggedInList.length === 0 ? (
            <p className="text-xs text-ink-300 text-center py-8">No employees found.</p>
          ) : (
            loggedInList.map(({ emp, rec }) => (
              <div key={emp.id} className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <Avatar name={`${emp.firstName} ${emp.lastName}`} color={emp.avatarColor} size="md" src={emp.profilePhotoUrl} />
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white"
                    style={{ background: rec.status === 'late' ? '#f59e0b' : '#10b981' }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-ink-800 truncate">{emp.firstName} {emp.lastName}</p>
                    <span className={`text-[9px] font-semibold ${rec.status === 'late' ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {rec.status === 'late' ? '● Late' : '● On time'}
                    </span>
                  </div>
                  <p className="text-[10px] text-ink-400 truncate">{emp.role} {emp.department ? `· ${emp.department}` : ''}</p>
                  <p className="text-[10px] text-ink-300">
                    Login - {rec.clockIn || rec.sessions?.[0]?.clockIn || '—'}
                    {(rec.clockOut || rec.sessions?.[rec.sessions?.length - 1]?.clockOut) && (
                      <> · Logout - {rec.clockOut || rec.sessions[rec.sessions.length - 1].clockOut}</>
                    )}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
        <button onClick={() => navigate('/app/employees')} className="w-full mt-3 text-[11px] text-brand-600 hover:underline flex items-center justify-center gap-1 pt-2 border-t border-surface-100">
          View all employees <ArrowRight size={10} />
        </button>
      </div>

      {/* Recent leave requests — fills the remaining space under the employee list */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-ink-700">Recent Leave Requests</p>
          <button onClick={() => navigate('/app/leave')} className="text-[11px] text-brand-600 hover:underline">View all</button>
        </div>
        {recentLeaveRequests.length === 0 ? (
          <div className="py-8 flex flex-col items-center text-center">
            <CalendarDays size={20} className="text-ink-300 mb-2" />
            <p className="text-xs text-ink-300">No leave requests yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentLeaveRequests.map(r => (
              <div key={r.id} className="flex items-center gap-3">
                <Avatar
                  name={r.emp ? `${r.emp.firstName} ${r.emp.lastName}` : 'Employee'}
                  color={r.emp?.avatarColor}
                  size="sm"
                  src={r.emp?.profilePhotoUrl}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-ink-800 truncate">
                      {r.emp ? `${r.emp.firstName} ${r.emp.lastName}` : 'Unknown Employee'}
                    </p>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-[10px] text-ink-400 truncate">
                    {r.leaveType ?? r.type ?? 'Leave'} · {r.startDate}
                    {r.endDate && r.endDate !== r.startDate ? ` – ${r.endDate}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}