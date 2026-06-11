import { useState, useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { Users, Clock, UserX, CalendarCheck, TrendingUp, CheckCircle, UserCheck, Timer, ArrowRight } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { fmt } from '../utils/dateTime';
import { StatCard, StatusBadge, Avatar, SectionHeader, ProgressBar } from '../components/ui';
import { useNavigate } from 'react-router-dom';

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6'];

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { subscription, currentPlan, seatsUsed } = useSubscription();

  const employees = subscription?.enrolledEmployees || [];
  const attendanceRecords = subscription?.attendanceRecords || [];
  const leaveRequests = subscription?.leaveRequests || [];

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayRecs = attendanceRecords.filter(r => r.date === today);
  const presentToday = todayRecs.filter(r => r.status === 'present' || r.status === 'late').length;
  const lateToday = todayRecs.filter(r => r.status === 'late').length;
  const absentToday = employees.filter(e => e.status === 'active' && !todayRecs.find(r => r.employeeId === e.id)).length;
  const pendingLeave = leaveRequests.filter(r => r.status === 'pending').length;

  const weekTrend = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd');
      const dayRecs = attendanceRecords.filter(r => r.date === date);
      return {
        day: format(subDays(new Date(), 6 - i), 'EEE'),
        present: dayRecs.filter(r => r.status === 'present').length,
        late: dayRecs.filter(r => r.status === 'late').length,
        absent: dayRecs.filter(r => r.status === 'absent').length,
      };
    });
  }, [attendanceRecords]);

  const pieData = [
    { name: 'Present', value: presentToday },
    { name: 'Late', value: lateToday },
    { name: 'Absent', value: absentToday },
    { name: 'Leave', value: pendingLeave },
  ].filter(d => d.value > 0);

  const activeEmployees = employees.filter(e => e.status === 'active');

  return (
    <div className="space-y-5">
      <SectionHeader
        title={`Good ${getGreeting()}, ${user?.name?.split(' ')[0] || 'there'}`}
        description={`${subscription?.company?.name || 'Your company'} · ${fmt.date(new Date())}`}
      />

      {/* Empty state for new subscriptions */}
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
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total Employees" value={activeEmployees.length} icon={Users} color="brand" />
            <StatCard label="Present Today" value={presentToday} icon={UserCheck} color="success" />
            <StatCard label="Late Today" value={lateToday} icon={Timer} color="warning" />
            <StatCard label="Pending Leave" value={pendingLeave} icon={CalendarCheck} color="info" />
          </div>

          {/* Charts */}
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
                    <Area type="monotone" dataKey="late" stroke="#f59e0b" fill="#fef3c7" strokeWidth={2} name="Late" />
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
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="space-y-1 mt-2">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-ink-600 flex-1">{d.name}</span>
                    <span className="font-semibold text-ink-800">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent employees */}
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
                  <Avatar name={`${emp.firstName} ${emp.lastName}`} color={emp.avatarColor} size="sm" />
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

      {/* Plan usage */}
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
