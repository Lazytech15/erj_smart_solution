import { useEffect, useMemo, useState } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Modal, Avatar, StatusBadge } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// PH public holidays.
//
// Primary source: the free Nager.Date API (https://date.nager.at), fetched
// live per year and cached in memory for the session. It requires no API key
// and genuinely supports CORS — the earlier failures weren't a CORS problem,
// they were the app's own Content-Security-Policy blocking the connect
// entirely (see index.html's connect-src, which now allowlists
// https://date.nager.at).
//
// Fallback: if the live fetch ever fails (offline, API downtime, CSP
// reverted, etc.), we fall back to a small bundled dataset for 2025/2026
// (the officially proclaimed lists) plus fixed-date holidays for any other
// year, so the calendar never goes fully blank.
// ─────────────────────────────────────────────────────────────────────────────

const OFFICIAL_HOLIDAYS = {
  2025: [
    ['2025-01-01', "New Year's Day"],
    ['2025-01-29', 'Chinese New Year'],
    ['2025-02-25', 'EDSA People Power Revolution Anniversary'],
    ['2025-04-09', 'Araw ng Kagitingan'],
    ['2025-04-17', 'Maundy Thursday'],
    ['2025-04-18', 'Good Friday'],
    ['2025-04-19', 'Black Saturday'],
    ['2025-05-01', 'Labor Day'],
    ['2025-06-12', 'Independence Day'],
    ['2025-07-27', 'Iglesia ni Cristo Founding Anniversary'],
    ['2025-08-21', 'Ninoy Aquino Day'],
    ['2025-08-25', 'National Heroes Day'],
    ['2025-10-31', "All Saints' Day Eve"],
    ['2025-11-01', "All Saints' Day"],
    ['2025-11-30', 'Bonifacio Day'],
    ['2025-12-08', 'Feast of the Immaculate Conception of Mary'],
    ['2025-12-24', 'Christmas Eve'],
    ['2025-12-25', 'Christmas Day'],
    ['2025-12-30', 'Rizal Day'],
    ['2025-12-31', 'Last Day of the Year'],
  ],
  2026: [
    ['2026-01-01', 'Bagong Taon'],
    ['2026-02-17', 'Chinese New Year'],
    ['2026-04-02', 'Maundy Thursday'],
    ['2026-04-03', 'Good Friday'],
    ['2026-04-04', 'Black Saturday'],
    ['2026-04-09', 'Araw ng Kagitingan'],
    ['2026-05-01', 'Araw ng Paggawa'],
    ['2026-06-12', 'Araw ng Kalayaan'],
    ['2026-08-21', 'Araw ng Kamatayan ni Senador Benigno "Ninoy" Aquino Jr.'],
    ['2026-08-31', 'Araw ng mga Bayani'],
    ['2026-10-31', "All Saints' Day Eve"],
    ['2026-11-01', 'Araw ng mga Santo'],
    ['2026-11-30', 'Araw ni Gat Andres Bonifacio'],
    ['2026-12-08', 'Kapistahan ng Immaculada Concepcion'],
    ['2026-12-24', 'Christmas Eve'],
    ['2026-12-25', 'Araw ng Pasko'],
    ['2026-12-30', 'Araw ng Kamatayan ni Dr. Jose Rizal'],
    ['2026-12-31', 'Huling Araw ng Taon'],
  ],
};

const FIXED_HOLIDAYS = [
  ['01-01', "New Year's Day"],
  ['04-09', 'Araw ng Kagitingan'],
  ['05-01', 'Labor Day'],
  ['06-12', 'Independence Day'],
  ['08-21', 'Ninoy Aquino Day'],
  ['11-01', "All Saints' Day"],
  ['11-30', 'Bonifacio Day'],
  ['12-08', 'Feast of the Immaculate Conception of Mary'],
  ['12-24', 'Christmas Eve'],
  ['12-25', 'Christmas Day'],
  ['12-30', 'Rizal Day'],
  ['12-31', 'Last Day of the Year'],
];

function getFallbackHolidays(year) {
  const map = new Map();
  if (OFFICIAL_HOLIDAYS[year]) {
    OFFICIAL_HOLIDAYS[year].forEach(([date, name]) => map.set(date, { date, localName: name }));
    return map;
  }
  FIXED_HOLIDAYS.forEach(([md, name]) => {
    const date = `${year}-${md}`;
    map.set(date, { date, localName: name });
  });
  return map;
}

// Expands a legacy start/end range into individual day strings — used as a
// fallback for leave requests that don't have an explicit `dates` array.
function rangeToDates(start, end) {
  if (!start) return [];
  const s = new Date(start), e = new Date(end || start);
  if (isNaN(s) || isNaN(e) || e < s) return [format(s, 'yyyy-MM-dd')];
  return eachDayOfInterval({ start: s, end: e }).map(d => format(d, 'yyyy-MM-dd'));
}

// Builds a dateStr -> [ { employeeName, status, leaveType, reason, ... } ] index
// so each calendar cell can be marked and hovered/clicked for details.
function buildLeaveIndex(leaveRequests, employees) {
  const map = new Map();
  for (const r of (leaveRequests || [])) {
    if (r.status !== 'pending' && r.status !== 'approved') continue; // skip rejected/cancelled
    const dates = Array.isArray(r.dates) && r.dates.length > 0 ? r.dates : rangeToDates(r.startDate, r.endDate);
    const empId = String(r.employeeId);
    const employee = (employees || []).find(e =>
      String(e.id) === empId || (e.accountEmployeeId != null && String(e.accountEmployeeId) === empId)
    );
    const entry = {
      id: r.id,
      status: r.status,
      leaveType: r.leaveType ?? r.type ?? 'Leave',
      reason: r.reason || '',
      employee,
      employeeName: employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown Employee',
    };
    for (const d of dates) {
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(entry);
    }
  }
  return map;
}

// In-memory cache so we don't refetch the same year twice per session.
const holidayCache = new Map();

async function fetchPHHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);

  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/PH`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const map = new Map(data.map(h => [h.date, h])); // date -> { localName, name, types, ... }
    const result = { map, source: 'live' };
    holidayCache.set(year, result);
    return result;
  } catch (err) {
    console.warn('Live PH holiday fetch failed, using bundled fallback data:', err);
    const result = { map: getFallbackHolidays(year), source: 'fallback' };
    holidayCache.set(year, result);
    return result;
  }
}

// ─── Mini month calendar with PH public holidays + leave status marks ────────
export default function MiniCalendar({ onSelectDate, leaveRequests = [], employees = [] }) {
  const [cursor, setCursor]     = useState(new Date());
  const [holidays, setHolidays] = useState(new Map());
  const [source, setSource]     = useState('live');
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [detailDate, setDetailDate] = useState(null);

  const year = cursor.getFullYear();

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchPHHolidays(year).then(({ map, source }) => {
      if (!active) return;
      setHolidays(map);
      setSource(source);
      setLoading(false);
    });
    return () => { active = false; };
  }, [year]);

  const leaveIndex = useMemo(() => buildLeaveIndex(leaveRequests, employees), [leaveRequests, employees]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end   = endOfWeek(endOfMonth(cursor));
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const today = new Date();

  // Upcoming holidays from today onward
  const upcoming = useMemo(() => {
    const all = [...holidays.values()];
    const todayStr = format(today, 'yyyy-MM-dd');
    return all.filter(h => h.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  }, [holidays]);

  function handleSelect(day) {
    setSelected(day);
    onSelectDate?.(day, holidays.get(format(day, 'yyyy-MM-dd')));
    setDetailDate(day);
  }

  const detailDateStr    = detailDate ? format(detailDate, 'yyyy-MM-dd') : null;
  const detailHoliday    = detailDateStr ? holidays.get(detailDateStr) : null;
  const detailLeaves     = detailDateStr ? (leaveIndex.get(detailDateStr) || []) : [];

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-ink-700 flex items-center gap-1.5">
          <CalendarDays size={13} className="text-brand-500" /> {format(cursor, 'MMMM yyyy')}
        </p>
        <div className="flex items-center gap-1">
          <button onClick={() => setCursor(c => subMonths(c, 1))} className="btn-ghost p-1 rounded-md">
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => setCursor(new Date())} className="text-[10px] font-semibold text-brand-600 hover:underline px-1">
            Today
          </button>
          <button onClick={() => setCursor(c => addMonths(c, 1))} className="btn-ghost p-1 rounded-md">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="text-[10px] font-semibold text-ink-300">{d}</span>
        ))}
        {days.map(day => {
          const dateStr    = format(day, 'yyyy-MM-dd');
          const holiday    = holidays.get(dateStr);
          const dayLeaves  = leaveIndex.get(dateStr) || [];
          const hasPending = dayLeaves.some(l => l.status === 'pending');
          const hasApproved = dayLeaves.some(l => l.status === 'approved');
          const inMonth    = isSameMonth(day, cursor);
          const isToday    = isSameDay(day, today);
          const isSelected = selected && isSameDay(day, selected);
          const isWeekend  = [0, 6].includes(day.getDay());
          const hasDetails = !!holiday || dayLeaves.length > 0;

          return (
            <div key={dateStr} className="relative group">
              <button
                onClick={() => handleSelect(day)}
                className={`relative w-full aspect-square flex flex-col items-center justify-center text-[11px] rounded-lg transition-colors mx-auto
                  ${!inMonth ? 'text-ink-200' : holiday ? 'text-danger-600 font-semibold' : isWeekend ? 'text-ink-400' : 'text-ink-700'}
                  ${isToday ? 'bg-brand-600 text-white font-bold' : isSelected ? 'bg-brand-50 ring-1 ring-brand-300' : 'hover:bg-surface-100'}
                `}
                style={{ maxWidth: 30 }}
              >
                {format(day, 'd')}
                {(holiday || hasPending || hasApproved) && (
                  <span className="flex items-center gap-0.5 mt-0.5">
                    {holiday    && <span className="w-1 h-1 rounded-full bg-danger-500" />}
                    {hasPending && <span className="w-1 h-1 rounded-full bg-amber-500" />}
                    {hasApproved && <span className="w-1 h-1 rounded-full bg-blue-500" />}
                  </span>
                )}
              </button>

              {/* Hover tooltip — who's on leave / holiday name for this day */}
              {hasDetails && (
                <div className="hidden group-hover:block absolute z-20 left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-48 rounded-lg bg-ink-900 text-white text-[10px] leading-snug p-2 shadow-lg pointer-events-none">
                  {holiday && (
                    <p className="font-semibold text-danger-300 mb-1">{holiday.localName}</p>
                  )}
                  {dayLeaves.slice(0, 3).map((l, i) => (
                    <p key={`${l.id}-${i}`} className="truncate">
                      <span className={l.status === 'approved' ? 'text-blue-300' : 'text-amber-300'}>●</span>{' '}
                      {l.employeeName}{l.reason ? ` — ${l.reason}` : ` — ${l.leaveType}`}
                    </p>
                  ))}
                  {dayLeaves.length > 3 && (
                    <p className="text-ink-400">+{dayLeaves.length - 3} more</p>
                  )}
                  <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-ink-900" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-3 pt-3 border-t border-surface-100">
        <span className="flex items-center gap-1 text-[10px] text-ink-400"><span className="w-1.5 h-1.5 rounded-full bg-danger-500" /> Holiday</span>
        <span className="flex items-center gap-1 text-[10px] text-ink-400"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Pending leave</span>
        <span className="flex items-center gap-1 text-[10px] text-ink-400"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Approved leave</span>
      </div>

      <div className="mt-3 pt-3 border-t border-surface-100">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-semibold text-ink-400 uppercase tracking-wide">Upcoming PH Holidays</p>
          {!loading && source === 'fallback' && (
            <span className="text-[9px] text-amber-600 font-medium" title="Live holiday data couldn't be reached — showing bundled data instead.">
              Offline data
            </span>
          )}
        </div>
        {loading ? (
          <p className="text-[11px] text-ink-300">Loading holidays…</p>
        ) : upcoming.length === 0 ? (
          <p className="text-[11px] text-ink-300">No more holidays left in {year}.</p>
        ) : (
          <div className="space-y-1.5">
            {upcoming.map(h => (
              <div key={h.date} className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-ink-700 truncate">{h.localName}</span>
                <span className="text-[10px] text-ink-400 shrink-0">{format(new Date(h.date), 'MMM d')}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Day details modal — opens on clicking any day */}
      <Modal
        open={!!detailDate}
        onClose={() => setDetailDate(null)}
        title={detailDate ? format(detailDate, 'MMMM d, yyyy') : ''}
        width="max-w-sm"
        footer={<button className="btn-secondary ml-auto" onClick={() => setDetailDate(null)}>Close</button>}
      >
        <div className="space-y-3">
          {!detailHoliday && detailLeaves.length === 0 ? (
            <p className="text-xs text-ink-300 text-center py-6">No holiday or leave scheduled for this day.</p>
          ) : (
            <>
              {detailHoliday && (
                <div className="flex items-center gap-2 rounded-lg bg-danger-50 text-danger-700 px-3 py-2 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-danger-500 shrink-0" /> {detailHoliday.localName} · Public Holiday
                </div>
              )}
              {detailLeaves.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-ink-400 uppercase tracking-wide">On Leave</p>
                  {detailLeaves.map((l, i) => (
                    <div key={`${l.id}-${i}`} className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-50 border border-surface-200">
                      <Avatar name={l.employeeName} color={l.employee?.avatarColor} size="sm" src={l.employee?.profilePhotoUrl} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold text-ink-800 truncate">{l.employeeName}</p>
                          <StatusBadge status={l.status} />
                        </div>
                        <p className="text-[10px] text-ink-400 truncate">
                          {l.leaveType}{l.reason ? ` · ${l.reason}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}