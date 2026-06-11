import { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useSubscription } from '../context/SubscriptionContext';
import { SectionHeader } from '../components/ui';
import PlanGate from '../components/PlanGate';

const COLORS = ['#10b981','#f59e0b','#ef4444','#4f6ef7'];

function ReportsContent() {
  const { subscription } = useSubscription();
  const employees = subscription?.enrolledEmployees || [];
  const attendanceRecords = subscription?.attendanceRecords || [];
  const leaveRequests = subscription?.leaveRequests || [];

  const weekData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd');
      const recs = attendanceRecords.filter(r => r.date === date);
      return {
        day: format(subDays(new Date(), 6 - i), 'EEE'),
        present: recs.filter(r => r.status === 'present').length,
        late: recs.filter(r => r.status === 'late').length,
        absent: recs.filter(r => r.status === 'absent').length,
      };
    });
  }, [attendanceRecords]);

  const deptData = useMemo(() => {
    const counts = {};
    employees.forEach(e => { counts[e.department] = (counts[e.department] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [employees]);

  const leaveStats = useMemo(() => {
    const counts = { pending: 0, approved: 0, rejected: 0 };
    leaveRequests.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return [
      { name: 'Pending', value: counts.pending },
      { name: 'Approved', value: counts.approved },
      { name: 'Rejected', value: counts.rejected },
    ].filter(d => d.value > 0);
  }, [leaveRequests]);

  if (employees.length === 0) {
    return (
      <div className="space-y-4">
        <SectionHeader title="Reports" description="Analytics and insights" />
        <div className="card p-12 flex flex-col items-center text-center">
          <p className="text-sm font-semibold text-ink-800 mb-1">No data yet</p>
          <p className="text-xs text-ink-400">Enroll employees and record attendance to see reports here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader title="Reports & Analytics" description="Analytics and insights for your team" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Attendance trend */}
        <div className="card p-4">
          <p className="text-xs font-semibold text-ink-700 mb-3">Attendance — Last 7 Days</p>
          {attendanceRecords.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-xs text-ink-300">No attendance data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={weekData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Bar dataKey="present" fill="#10b981" name="Present" radius={[4,4,0,0]} />
                <Bar dataKey="late"    fill="#f59e0b" name="Late"    radius={[4,4,0,0]} />
                <Bar dataKey="absent"  fill="#ef4444" name="Absent"  radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Dept breakdown */}
        <div className="card p-4">
          <p className="text-xs font-semibold text-ink-700 mb-3">Employees by Department</p>
          {deptData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-xs text-ink-300">No department data</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={deptData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {deptData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Leave stats */}
        <div className="card p-4">
          <p className="text-xs font-semibold text-ink-700 mb-3">Leave Requests</p>
          {leaveStats.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-xs text-ink-300">No leave requests yet</div>
          ) : (
            <div className="space-y-3">
              {leaveStats.map((s, i) => (
                <div key={s.name} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i] }} />
                  <span className="text-xs text-ink-600 flex-1">{s.name}</span>
                  <span className="text-xs font-semibold text-ink-800">{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary stats */}
        <div className="card p-4">
          <p className="text-xs font-semibold text-ink-700 mb-3">Summary</p>
          <div className="space-y-3">
            {[
              { l: 'Total Employees', v: employees.length },
              { l: 'Active Employees', v: employees.filter(e => e.status === 'active').length },
              { l: 'Total Attendance Records', v: attendanceRecords.length },
              { l: 'Total Leave Requests', v: leaveRequests.length },
              { l: 'Departments', v: [...new Set(employees.map(e => e.department))].length },
            ].map(({ l, v }) => (
              <div key={l} className="flex items-center justify-between">
                <span className="text-xs text-ink-500">{l}</span>
                <span className="text-xs font-semibold text-ink-800">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <PlanGate feature="reports">
      <ReportsContent />
    </PlanGate>
  );
}
