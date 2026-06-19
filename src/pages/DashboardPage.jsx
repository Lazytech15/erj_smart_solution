import { useMemo } from 'react';
import { format, subDays, differenceInCalendarDays, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { Users, Clock, UserX, CalendarCheck, TrendingUp, CheckCircle, UserCheck, Timer, ArrowRight, CalendarDays, LogIn, LogOut, Briefcase, Sun, AlertCircle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { fmt } from '../utils/dateTime';
import { StatCard, StatusBadge, Avatar, SectionHeader, ProgressBar } from '../components/ui';
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
        <StatCard label="Present This Month"  value={presentDays} icon={CheckCircle} color="success" />
        <StatCard label="Late This Month"     value={lateDays}    icon={Timer}       color="warning" />
        <StatCard label="Absent This Month"   value={absentDays}  icon={UserX}       color="danger"  />
        <StatCard label="Pending Leave"       value={pendingLeave} icon={CalendarCheck} color="info" />
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

      {/* My profile summary */}
      {empProfile && (
        <div className="card p-4">
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
            <StatCard label="Total Employees" value={activeEmployees.length} icon={Users}        color="brand"   />
            <StatCard label="Present Today"   value={presentToday}          icon={UserCheck}     color="success" />
            <StatCard label="Late Today"      value={lateToday}             icon={Timer}         color="warning" />
            <StatCard label="Pending Leave"   value={pendingLeave}          icon={CalendarCheck} color="info"    />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card p-4 col-span-2">
              <p className="text-xs font-semibold text-ink-700 mb-3">Attendance — Last 7 Days</p>
              {attendanceRecords.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-xs text-ink-300">
                  No attendance data yet. Records will appear here once employees clock in.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={weekTrend} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Area type="monotone" dataKey="present" stroke="#10b981" fill="#d1fae5" strokeWidth={2} name="Present" />
                    <Area type="monotone" dataKey="late"    stroke="#f59e0b" fill="#fef3c7" strokeWidth={2} name="Late"    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card p-4">
              <p className="text-xs font-semibold text-ink-700 mb-3">Today's Summary</p>
              {pieData.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-xs text-ink-300 text-center">
                  No attendance recorded for today yet.
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={pieData} margin={{ top:4, right:4, left:-24, bottom:0 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                      <Bar dataKey="value" radius={[4,4,0,0]}>
                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="space-y-1 mt-2">
                    {pieData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-ink-600 flex-1">{d.name}</span>
                        <span className="font-semibold text-ink-800">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-ink-700">Recent Employees</p>
              <button onClick={() => navigate('/app/employees')} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                View all <ArrowRight size={11} />
              </button>
            </div>
            <div className="space-y-2">
              {employees.slice(-5).reverse().map(emp => (
                <div key={emp.id} className="flex items-center gap-3 py-1.5">
                  <Avatar name={`${emp.firstName} ${emp.lastName}`} color={emp.avatarColor} size="sm" src={emp.profilePhotoUrl} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-ink-800 truncate">{emp.firstName} {emp.lastName}</p>
                    <p className="text-[11px] text-ink-400 truncate">{emp.role} · {emp.department}</p>
                  </div>
                  <StatusBadge status={emp.status} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {currentPlan && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-ink-700">Plan Usage · {currentPlan.name}</p>
            <button onClick={() => navigate('/app/subscription')} className="text-xs text-brand-600 hover:underline">Manage</button>
          </div>
          <ProgressBar
            value={currentPlan.maxSeats === Infinity ? 5 : Math.round((seatsUsed / currentPlan.maxSeats) * 100)}
            label={currentPlan.maxSeats === Infinity ? `${seatsUsed} employees (unlimited)` : `${seatsUsed} / ${currentPlan.maxSeats} seats used`}
          />
        </div>
      )}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}