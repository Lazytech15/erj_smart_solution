import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Play, Square, Coffee, Utensils, RefreshCw, Briefcase, CheckCircle2, AlertCircle, AlertTriangle, Loader2, Clock3, CalendarDays } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useToast } from '../context/ToastContext';
import { Modal, SectionHeader } from '../components/ui';
import { getShiftSessions, todayISO, fmt } from '../utils/dateTime';

// ─────────────────────────────────────────────────────────────────────────
// Timer Logic & Helpers (Unchanged)
// ─────────────────────────────────────────────────────────────────────────

const LOCAL_KEY_PREFIX = 'erj_time_render_';

const EMPTY_TIMER = {
  status: 'idle',
  segments: [],
  currentSegment: null,
  usedBreakIds: [],
  date: null,
};

function nowHHMM() {
  const d = new Date();
  if (d.getSeconds() >= 30) d.setMinutes(d.getMinutes() + 1);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
}

function hhmmToMinutes(hhmm) {
  const [h, m, s = 0] = (hhmm || '0:0').split(':').map(Number);
  return h * 60 + m + s / 60;
}

function hhmmToDateToday(hhmm) {
  const [h, m, s = 0] = (hhmm || '0:0').split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, s, 0);
  return d;
}

function breakAllottedMinutes(brk) {
  if (!brk) return null;
  if (brk.durationMinutes != null) return brk.durationMinutes > 0 ? brk.durationMinutes : null;
  if (!brk.start || !brk.end) return null;
  const mins = hhmmToMinutes(brk.end) - hhmmToMinutes(brk.start);
  return mins > 0 ? mins : null;
}

function calcStatus(clockInTime, shiftStart, lateThresholdMin = 15) {
  if (!clockInTime || !shiftStart) return '';
  const ch = hhmmToMinutes(clockInTime);
  const sh = hhmmToMinutes(shiftStart);
  return ch <= sh + lateThresholdMin ? 'present' : 'late';
}

function stateFromRecord(record) {
  const segments = record?.segments || [];
  if (!segments.length) return { status: 'idle', segments: [], currentSegment: null, usedBreakIds: [] };
  const usedBreakIds = segments.filter(s => s.type === 'break' && s.breakId).map(s => s.breakId);
  const last = segments[segments.length - 1];
  if (last.end) {
    return { status: 'stopped', segments, currentSegment: null, usedBreakIds: [...new Set(usedBreakIds)] };
  }
  const { end, ...currentSegment } = last;
  return {
    status: last.type === 'break' ? 'on_break' : 'working',
    segments: segments.slice(0, -1),
    currentSegment,
    usedBreakIds: [...new Set(usedBreakIds)],
  };
}

function loadLocal(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.date && parsed.date !== todayISO()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveLocal(key, timer) {
  try { localStorage.setItem(key, JSON.stringify(timer)); } catch { }
}

function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function minutesToHM(mins) {
  const total = Math.round(mins);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function segmentMinutes(seg, fallbackNow) {
  if (!seg.start) return 0;
  const start = hhmmToDateToday(seg.start);
  const end = seg.end ? hhmmToDateToday(seg.end) : fallbackNow;
  return Math.max(0, (end - start) / 60000);
}

function computeLiveWorkedMinutes(timer, shift) {
  const now = new Date();
  const all = timer.currentSegment ? [...timer.segments, timer.currentSegment] : timer.segments;
  const worked = all.filter(s => s.type === 'work').reduce((acc, s) => acc + segmentMinutes(s, now), 0);
  if (!shift?.breaks?.length) return worked;
  const defs = new Map(shift.breaks.map(b => [b.id, b]));
  const breakCredit = all.filter(s => s.type === 'break').reduce((acc, s) => {
    const def = defs.get(s.breakId);
    if (!def?.paid) return acc;
    const allotted = breakAllottedMinutes(def);
    const actual = segmentMinutes(s, now);
    const credited = allotted != null ? Math.min(actual, allotted) : actual;
    return acc + Math.max(0, credited);
  }, 0);
  return worked + breakCredit;
}

/** Which configured session (e.g. "Morning OT", "Morning Regular") a work
 *  segment belongs to. Prefers the sessionId the punch was explicitly
 *  started under; falls back to matching the segment's start time against
 *  each session's window for older segments that never set sessionId. */
function sessionForSegment(seg, shiftSessions) {
  if (!seg) return null;
  if (seg.sessionId) {
    const known = shiftSessions.find(ss => ss.id === seg.sessionId);
    if (known) return known;
  }
  if (shiftSessions.length <= 1) return shiftSessions[0] || null;
  const mins = hhmmToMinutes(seg.start);
  const match = shiftSessions.find(ss => mins >= hhmmToMinutes(ss.start) && mins < hhmmToMinutes(ss.end));
  if (match) return match;
  return shiftSessions.reduce((closest, ss) => {
    const dist = Math.min(Math.abs(mins - hhmmToMinutes(ss.start)), Math.abs(mins - hhmmToMinutes(ss.end)));
    const closestDist = Math.min(Math.abs(mins - hhmmToMinutes(closest.start)), Math.abs(mins - hhmmToMinutes(closest.end)));
    return dist < closestDist ? ss : closest;
  }, shiftSessions[0]);
}

/** Which configured session actually covers a given clock time — used to
 *  auto-correct a punch instead of trusting a stale manual pick (e.g.
 *  tapping "Morning OT" at 11:16am, well after that window closed). */
function sessionForTime(nowMinutes, shiftSessions) {
  if (!shiftSessions?.length) return null;
  const match = shiftSessions.find(ss => nowMinutes >= hhmmToMinutes(ss.start) && nowMinutes < hhmmToMinutes(ss.end));
  if (match) return match;
  if (nowMinutes < hhmmToMinutes(shiftSessions[0].start)) return shiftSessions[0];
  if (nowMinutes >= hhmmToMinutes(shiftSessions[shiftSessions.length - 1].end)) return shiftSessions[shiftSessions.length - 1];
  // In a gap between two sessions (e.g. the scheduled break between Morning
  // OT and Morning Regular) — treat the employee as belonging to whichever
  // session is coming up next, since they haven't started it yet.
  return shiftSessions.find(ss => hhmmToMinutes(ss.start) > nowMinutes) || shiftSessions[shiftSessions.length - 1];
}

function deriveBreakSlots(shift) {
  const breaks = (shift?.breaks || []).map((b, i) => ({
    ...b,
    displayLabel: b.label?.trim() || `Break ${i + 1}`,
    durationMinutes: breakAllottedMinutes(b),
  }));
  const lunch = breaks.filter(b => /lunch/i.test(b.label || ''));
  const rest = breaks.filter(b => !/lunch/i.test(b.label || ''));
  return { breaks: rest, lunch };
}

// ─────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────

export default function TimeRenderPage() {
  const { user } = useAuth();
  const { subscription, loading: subscriptionLoading, addAttendanceRecord, updateAttendanceRecord } = useSubscription();
  const { toast } = useToast();

  const employees = subscription?.enrolledEmployees || [];
  const attendanceRecords = subscription?.attendanceRecords || [];
  const lateThreshold = Number(subscription?.settings?.lateThreshold ?? 15);

  const empProfile = useMemo(() => employees.find(e =>
    String(e.id) === String(user?.employeeId) ||
    String(e.accountEmployeeId) === String(user?.employeeId) ||
    (user?.email && e.email === user.email),
  ), [employees, user]);

  const shift = useMemo(() => {
    if (!empProfile?.shiftId) return null;
    return (subscription?.shifts || []).find(s => String(s.id) === String(empProfile.shiftId)) || null;
  }, [empProfile, subscription]);

  // Computed once per shift (not just at render-bottom) so both the punch
  // handlers below and the JSX further down can use it.
  const shiftSessions = useMemo(() => getShiftSessions(shift), [shift]);
  const isSplitShift = shiftSessions.length > 1;

  const employeeIdStr = user?.employeeId != null ? String(user.employeeId) : null;
  const localKey = employeeIdStr ? `${LOCAL_KEY_PREFIX}${employeeIdStr}` : null;

  const [timer, setTimer] = useState(EMPTY_TIMER);
  const [saving, setSaving] = useState(false);
  const [, forceTick] = useState(0);
  const [confirm, setConfirm] = useState(null);
  const hydratedRef = useRef(false);
  // Signature of the segments this tab itself last wrote (or adopted), so
  // the reconciliation effect below can tell "the poll just echoed back my
  // own write" apart from "the extension (or another tab) changed things
  // on the server" — only the latter should overwrite local state.
  const knownSegmentsSigRef = useRef(null);

  const todayRecord = useMemo(() => {
    if (!employeeIdStr) return null;
    return attendanceRecords.find(r => String(r.employeeId) === employeeIdStr && r.date === todayISO()) || null;
  }, [attendanceRecords, employeeIdStr]);

  useEffect(() => {
    if (!localKey || hydratedRef.current) return;
    // Wait for a real server answer before deciding whether to trust a
    // cached local timer — todayRecord being null looks identical whether
    // the server genuinely has no record for today, or attendanceRecords
    // just hasn't finished its first load yet. Deciding too early risks
    // treating "not loaded yet" as "confirmed empty".
    if (subscriptionLoading) return;
    hydratedRef.current = true;
    const local = loadLocal(localKey);
    const localHasData = !!(local && (local.segments?.length || local.currentSegment));
    // A local cache with real punches while the server confirms there's
    // no record for today at all usually means today's data was
    // cleared/reset server-side after the browser cached it (e.g. an
    // admin clearing attendance data to debug) — trusting that stale
    // local blindly used to silently resurrect it: the next punch action
    // would merge onto the stale segments via persistAndSync and re-sync
    // the very record that had just been cleared, making it look like a
    // record "popped up" out of nowhere. Give a short grace window to a
    // *very* recent local punch first though (its own first sync may
    // simply not have landed yet) rather than distrusting it outright.
    const STALE_GRACE_MS = 2 * 60 * 1000;
    const firstLocalEvent = local?.segments?.[0] || local?.currentSegment;
    const localIsStale = localHasData && (!firstLocalEvent?.startExact || Date.now() - firstLocalEvent.startExact > STALE_GRACE_MS);
    if (local && (todayRecord || !localHasData || !localIsStale)) {
      setTimer(local);
      knownSegmentsSigRef.current = JSON.stringify(local.currentSegment ? [...local.segments, local.currentSegment] : local.segments);
      return;
    }
    if (todayRecord) {
      setTimer({ ...stateFromRecord(todayRecord), date: todayISO() });
    } else {
      const fresh = { ...EMPTY_TIMER, date: todayISO() };
      setTimer(fresh);
      // Overwrite the stale cache too, not just in-memory state — otherwise
      // the very next page load hits this exact same branch again.
      saveLocal(localKey, fresh);
    }
    knownSegmentsSigRef.current = JSON.stringify(todayRecord?.segments || []);
  }, [localKey, todayRecord, subscriptionLoading]);

  // Previously this page only ever read the server record once, at mount —
  // after that it trusted its own local state forever. That meant clocking
  // in/out or taking a break from the Shift Clock extension (or another
  // tab/device) never showed up here: the extension's writes reached
  // Supabase fine, SubscriptionContext's poll picked up the new
  // attendanceRecords fine, but this page just ignored the change. This
  // effect compares each poll's segments against what this tab itself last
  // wrote/adopted (see knownSegmentsSigRef); a mismatch means the record
  // changed out from under us — from the extension or elsewhere — so we
  // adopt it, same as a fresh mount would.
  useEffect(() => {
    if (!hydratedRef.current) return; // let the mount effect above own the first hydrate
    const incomingSig = JSON.stringify(todayRecord?.segments || []);
    if (incomingSig === knownSegmentsSigRef.current) return;
    knownSegmentsSigRef.current = incomingSig;
    const next = todayRecord
      ? { ...stateFromRecord(todayRecord), date: todayISO() }
      : { ...EMPTY_TIMER, date: todayISO() };
    setTimer(next);
    if (localKey) saveLocal(localKey, next);
  }, [todayRecord, localKey]);

  useEffect(() => {
    if (timer.status !== 'working' && timer.status !== 'on_break') return;
    const id = setInterval(() => forceTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [timer.status]);

  const persistAndSync = useCallback(async (next) => {
    setTimer(next);
    if (localKey) saveLocal(localKey, next);
    const allSegments = next.currentSegment ? [...next.segments, next.currentSegment] : next.segments;
    // Record this as "ours" before the write lands, so the reconciliation
    // effect doesn't mistake the poll echoing this same write back for an
    // external change (from the extension or another tab) and re-apply it.
    knownSegmentsSigRef.current = JSON.stringify(allSegments);
    if (!employeeIdStr) return;

    // Keep `startExact` in what gets synced instead of stripping it: it's a
    // portable epoch ms value (not a browser-session-local clock), and it's
    // what lets the Shift Clock extension (or another tab) anchor its live
    // tick to the exact same instant this segment actually started, rather
    // than falling back to the rounded-to-the-minute `start` string and
    // drifting up to ~30s off from this tab's own display.
    const cleanSegments = allSegments;
    const workSegments = cleanSegments.filter(s => s.type === 'work' && s.start);
    const clockIn = workSegments[0]?.start || '';
    const clockOut = workSegments[workSegments.length - 1]?.end || '';

    // Each work punch now carries the sessionId it was explicitly started
    // under (see handleStart/handleResumeWork below) instead of this page
    // guessing which session a stretch belongs to purely from its clock-in
    // time. That time-based guess is why a genuinely split shift's Time
    // Log used to show ambiguous/mismatched session labels — a stretch
    // starting a few minutes early or late for its window could get
    // silently tagged with the wrong session. The time-based match is kept
    // only as a fallback for segments synced from an older client version
    // that never set sessionId at all.
    const sessions = workSegments.map(s => {
      const ss = sessionForSegment(s, shiftSessions) || { id: 'full', label: '' };
      return { sessionId: ss.id, label: ss.label || '', clockIn: s.start, clockOut: s.end || '' };
    });

    const payload = {
      employeeId: employeeIdStr,
      date: todayISO(),
      status: calcStatus(clockIn, shift?.start, lateThreshold),
      notes: '',
      segments: cleanSegments,
      sessions,
      clockIn,
      clockOut,
    };

    setSaving(true);
    try {
      const existing = attendanceRecords.find(r => String(r.employeeId) === employeeIdStr && r.date === todayISO());
      if (existing) {
        await updateAttendanceRecord(existing.id, payload);
      } else {
        await addAttendanceRecord(payload);
      }
    } catch (err) {
      toast(err?.message || "Couldn't sync — will retry on the next action.", 'error');
    } finally {
      setSaving(false);
    }
  }, [localKey, employeeIdStr, shift, shiftSessions, lateThreshold, attendanceRecords, addAttendanceRecord, updateAttendanceRecord, toast]);

  const handleStart = useCallback((sessionId) => {
    if (timer.status === 'working') return;
    // Whatever session was tapped is what gets recorded — no silent
    // reassignment here. Preventing a stale pick (a session whose window
    // has already elapsed) is handled up front by disabling that button
    // in the picker, not by swapping the id after the fact; doing both
    // was the source of a "tapped Regular, started OT" mismatch.
    persistAndSync({
      ...timer,
      status: 'working',
      date: timer.date || todayISO(),
      currentSegment: { type: 'work', start: nowHHMM(), startExact: Date.now(), sessionId },
    });
  }, [timer, persistAndSync]);

  const handleTakeBreak = useCallback((brk) => {
    if (timer.status !== 'working') return;
    const segments = timer.currentSegment ? [...timer.segments, { ...timer.currentSegment, end: nowHHMM() }] : timer.segments;
    persistAndSync({
      ...timer,
      status: 'on_break',
      segments,
      // Carry the interrupted work stretch's sessionId along on the break
      // segment itself too, purely so handleResumeWork below can find it
      // again without having to search back through `segments`.
      currentSegment: { type: 'break', breakId: brk.id, label: brk.displayLabel, start: nowHHMM(), startExact: Date.now(), resumeSessionId: timer.currentSegment?.sessionId },
      usedBreakIds: [...new Set([...timer.usedBreakIds, brk.id])],
    });
  }, [timer, persistAndSync]);

  const handleResumeWork = useCallback(() => {
    if (timer.status !== 'on_break') return;
    const allotted = breakAllottedMinutes(shift?.breaks?.find(b => b.id === timer.currentSegment?.breakId));
    const elapsed = timer.currentSegment ? hhmmToMinutes(nowHHMM()) - hhmmToMinutes(timer.currentSegment.start) : 0;
    const over = allotted != null && elapsed > allotted;
    const segments = timer.currentSegment ? [...timer.segments, { ...timer.currentSegment, end: nowHHMM(), over }] : timer.segments;
    // Resuming from a break normally continues the same session it
    // interrupted (e.g. a coffee break in the middle of Morning Regular
    // just picks Morning Regular back up) — no need to re-pick a session
    // just because a break happened in the middle of it.
    //
    // But a break can also span a session boundary — e.g. lunch runs from
    // 12:00 (end of Morning Regular) to 13:00 (start of Afternoon
    // Regular). Blindly resuming into resumeSessionId there tagged the
    // new punch "Morning Regular" again, producing a second, ~0-minute
    // "Morning Regular (2)" row that then had to be manually closed with
    // "End Session → Start Next Session" — two rows in the Time Log for
    // what was really just one lunch break. Auto-correct the same way the
    // pre-clock-in picker already does (see sessionForTime): if the
    // session that actually covers right now differs from the one that
    // was interrupted, resume directly into that session instead.
    const resumeSessionId = timer.currentSegment?.resumeSessionId;
    let sessionId = resumeSessionId;
    if (shiftSessions.length > 1) {
      const covering = sessionForTime(hhmmToMinutes(nowHHMM()), shiftSessions);
      if (covering && covering.id !== resumeSessionId) sessionId = covering.id;
    }
    persistAndSync({
      ...timer,
      status: 'working',
      segments,
      currentSegment: { type: 'work', start: nowHHMM(), startExact: Date.now(), sessionId },
    });
  }, [timer, shift, shiftSessions, persistAndSync]);

  // Ends the current labeled session's punch (e.g. Morning OT) and starts
  // the next one (e.g. Morning Regular) in the same continuous stretch of
  // work — no break in between, just a clock-out/clock-in pair for the
  // session boundary itself, matching a shift's configured punches/day.
  const handleSwitchSession = useCallback(() => {
    if (timer.status !== 'working' || !timer.currentSegment) return;
    const currentIndex = shiftSessions.findIndex(ss => ss.id === timer.currentSegment.sessionId);
    const next = currentIndex >= 0 && currentIndex < shiftSessions.length - 1 ? shiftSessions[currentIndex + 1] : null;
    if (!next) return;
    const segments = [...timer.segments, { ...timer.currentSegment, end: nowHHMM() }];
    persistAndSync({
      ...timer,
      status: 'working',
      segments,
      currentSegment: { type: 'work', start: nowHHMM(), startExact: Date.now(), sessionId: next.id },
    });
  }, [timer, shiftSessions, persistAndSync]);

  const handleStop = useCallback(() => {
    if (timer.status === 'idle' || timer.status === 'stopped') return;
    const segments = timer.currentSegment ? [...timer.segments, { ...timer.currentSegment, end: nowHHMM() }] : timer.segments;
    persistAndSync({ ...timer, status: 'stopped', segments, currentSegment: null });
  }, [timer, persistAndSync]);

  if (!empProfile) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-8 text-center text-sm text-ink-500">
        We couldn't find your employee profile. Contact your admin if this looks wrong.
      </div>
    );
  }

  const { breaks, lunch } = deriveBreakSlots(shift);
  const canTakeBreak = timer.status === 'working';
  const workedMinutes = computeLiveWorkedMinutes(timer, shift);

  const activeBreakDef = timer.currentSegment?.type === 'break'
    ? shift?.breaks?.find(b => b.id === timer.currentSegment.breakId)
    : null;
  const allotted = breakAllottedMinutes(activeBreakDef);
  // Prefer startExact (now synced to the server too, see persistAndSync)
  // so this stays in lockstep with the Shift Clock extension's own live
  // tick even when the current segment was hydrated from a synced record
  // instead of started in this tab. Only genuinely old segments synced
  // before this field existed fall back to the rounded `start`.
  const elapsedMs = timer.currentSegment ? Date.now() - (timer.currentSegment.startExact ?? hhmmToDateToday(timer.currentSegment.start).getTime()) : 0;
  const isOverBreak = timer.status === 'on_break' && allotted != null && elapsedMs > allotted * 60000;

  // Redesigned ring styling
  let ringDisplay, ringNote, ringClasses, RingIcon, ringSub;
  if (timer.status === 'idle' || timer.status === 'stopped') {
    ringDisplay = '00:00:00';
    ringNote = timer.status === 'stopped' ? 'Stopped for today' : 'Not started';
    ringClasses = 'bg-surface-50 text-ink-400 border-8 border-surface-100 hover:border-surface-200 hover:text-brand-600 transition-colors duration-300';
    RingIcon = Play;
    ringSub = 'Tap to start';
  } else if (timer.status === 'on_break') {
    ringDisplay = isOverBreak
      ? `+${formatElapsed(elapsedMs - allotted * 60000)}`
      : (allotted != null ? formatElapsed(Math.max(0, allotted * 60000 - elapsedMs)) : formatElapsed(elapsedMs));
    ringNote = timer.currentSegment?.label || 'On break';
    ringSub = isOverBreak ? 'over the allotted time' : (allotted != null ? 'time left' : 'elapsed');
    ringClasses = isOverBreak
      ? 'bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-[0_0_40px_rgba(244,63,94,0.3)] border-8 border-red-50 animate-pulse'
      : 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-[0_0_40px_rgba(251,146,60,0.3)] border-8 border-orange-50';
    RingIcon = isOverBreak ? AlertTriangle : Coffee;
  } else {
    ringDisplay = formatElapsed(elapsedMs);
    ringNote = 'Working';
    ringSub = 'elapsed';
    ringClasses = 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-[0_0_40px_rgba(52,211,153,0.3)] border-8 border-emerald-50';
    RingIcon = Loader2;
  }

  const canStart = timer.status === 'idle' || timer.status === 'stopped';

  // Which session actually covers right now — used to recommend a session
  // on the pre-clock-in picker and to auto-correct stale picks in handleStart.
  const nowMinutesForPicker = hhmmToMinutes(nowHHMM());
  const recommendedSession = isSplitShift ? sessionForTime(nowMinutesForPicker, shiftSessions) : null;

  // For a split shift, surface which configured session (e.g. "Morning OT")
  // the current work stretch belongs to, instead of a generic "Working" —
  // this is what was missing from the active-shift view. Also work out
  // whether there's a next session to roll into, for the "switch session"
  // action below.
  const activeWorkSession = timer.status === 'working' && isSplitShift
    ? sessionForSegment(timer.currentSegment, shiftSessions)
    : null;
  if (activeWorkSession?.label) {
    ringNote = activeWorkSession.label;
    ringSub = 'Working \u2014 elapsed';
  }
  const activeSessionIndex = activeWorkSession ? shiftSessions.findIndex(ss => ss.id === activeWorkSession.id) : -1;
  const nextSession = activeSessionIndex >= 0 && activeSessionIndex < shiftSessions.length - 1
    ? shiftSessions[activeSessionIndex + 1]
    : null;

  // A break named after a specific session (e.g. the "Morning Break" /
  // "Afternoon Break" quick-fill template) is only meaningful while that
  // session is the one actually being worked. Without this, an employee
  // clocked into Afternoon Regular could still tap "Morning Break" —
  // ending the Afternoon Regular stretch to run a break literally named
  // for a session that's already over, which is what produced the
  // confusing Time Log in the report ("the afternoon is being logout and
  // the morning break run"). A break whose label doesn't name any
  // configured session (e.g. a generic "Coffee Break") stays available
  // regardless of which session is active.
  //
  // Matching is by shared word, not "break label contains the whole
  // session label" — a session named "Morning Regular" and a break named
  // "Morning Break" share the word "morning" but neither string contains
  // the other, so a plain substring check (the first version of this fix)
  // let "Morning Break" straight through while working Afternoon Regular
  // undetected. Comparing tokenized words catches that.
  function labelTokens(s) {
    return new Set((s || '').toLowerCase().match(/[a-z0-9]+/g) || []);
  }
  function isBreakAllowedNow(brk) {
    if (!activeWorkSession || shiftSessions.length <= 1) return true;
    const breakTokens = labelTokens(brk.displayLabel || brk.label);
    const activeTokens = labelTokens(activeWorkSession.label);
    const mentionsOtherSession = shiftSessions.some(ss => {
      if (ss.id === activeWorkSession.id) return false;
      const ssTokens = labelTokens(ss.label);
      const sharesOther = [...ssTokens].some(t => breakTokens.has(t));
      const sharesActive = [...activeTokens].some(t => breakTokens.has(t));
      return sharesOther && !sharesActive;
    });
    return !mentionsOtherSession;
  }
  const visibleBreaks = breaks.filter(isBreakAllowedNow);
  const visibleLunch = lunch.filter(isBreakAllowedNow);

  const sweepDeg = (timer.status === 'working' || timer.status === 'on_break')
    ? ((Date.now() / 1000) % 60) / 60 * 360
    : 0;
  const RADIUS = 88;
  const CIRC = 2 * Math.PI * RADIUS;

  return (
    <div className="space-y-6 max-w-2xl mx-auto px-4 sm:px-0">
      <SectionHeader
        title="Time Render"
        description="Clock in and out from here if you're not using the Shift Clock browser extension."
      />

      <div className="bg-white rounded-3xl shadow-sm border border-surface-200 overflow-hidden">
        {/* Modernized Shift Context Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 bg-surface-50/50 border-b border-surface-100 gap-3">
          {shift ? (
            <div className="flex items-center gap-3 text-sm font-semibold text-ink-700">
              <span className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center">
                <Briefcase size={16} />
              </span>
              <div>
                <p className="leading-none">{shift.name}</p>
                <p className="text-xs text-ink-400 font-medium mt-1">{shift.start} &mdash; {shift.end}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm font-medium text-ink-500">
              <AlertCircle size={16} /> No shift assigned yet
            </div>
          )}
          <div className="flex items-center gap-2 text-xs font-medium text-ink-400 bg-white px-3 py-1.5 rounded-full border border-surface-200 shadow-sm w-fit">
            <CalendarDays size={14} />
            {fmt.date(new Date())}
          </div>
        </div>

        <div className="flex flex-col items-center gap-8 px-6 py-12">
          {/* Enhanced Interactive Ring */}
          <div className="relative w-[220px] h-[220px] flex items-center justify-center">
            {!canStart && (
              <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none drop-shadow-sm">
                <circle cx="100" cy="100" r={RADIUS} fill="none" strokeWidth="4" className="stroke-surface-100" />
                <circle
                  cx="100" cy="100" r={RADIUS} fill="none" strokeWidth="4" strokeLinecap="round"
                  className={isOverBreak ? 'stroke-red-500' : timer.status === 'on_break' ? 'stroke-amber-400' : 'stroke-emerald-400'}
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC - (sweepDeg / 360) * CIRC}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
            )}

            <button
              type="button"
              disabled={!canStart || isSplitShift}
              onClick={() => canStart && !isSplitShift && setConfirm({ message: timer.status === 'stopped' ? 'Start a new shift now?' : 'Start your shift now?', onYes: () => handleStart(shiftSessions[0]?.id) })}
              className={`relative w-48 h-48 rounded-full flex flex-col items-center justify-center transition-all duration-300 ${ringClasses} ${canStart && !isSplitShift ? 'cursor-pointer hover:scale-[1.03] active:scale-[0.97]' : 'cursor-default'}`}
            >
              {canStart ? (
                <>
                  <RingIcon size={32} className="mb-2" />
                  <span className="text-base font-bold">{ringNote}</span>
                  <span className="text-xs opacity-70 mt-1 font-medium">{isSplitShift ? 'Pick a session below' : ringSub}</span>
                </>
              ) : (
                <>
                  {timer.status === 'working' ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-white/90 mb-3 animate-ping" />
                  ) : (
                    <RingIcon size={20} className="mb-2 opacity-90" />
                  )}
                  <span className="text-3xl font-extrabold tabular-nums tracking-tight drop-shadow-sm">{ringDisplay}</span>
                  <span className="text-sm font-bold mt-1.5 opacity-90">{ringNote}</span>
                  <span className="text-[11px] font-medium opacity-75 mt-0.5">{ringSub}</span>
                </>
              )}
            </button>
          </div>

          {/* Named session buttons for a genuinely split shift — the
              employee explicitly says which session they're clocking into
              ("Morning In" / "Afternoon In"), so the punch is tagged
              correctly from the moment it's created instead of this page
              inferring it later from the clock-in time. */}
          {canStart && isSplitShift && (
            <div className="w-full max-w-md grid grid-cols-1 sm:grid-cols-2 gap-3">
              {shiftSessions.map(ss => {
                const isRecommended = recommendedSession?.id === ss.id;
                // A session is genuinely missed (not just "already started
                // today") once its own window has closed AND a later
                // session has taken over as the current one — e.g. Morning
                // OT (06:00–08:00) once it's 11:16 and Morning Regular is
                // now in effect. Disable it instead of letting it be tapped
                // and silently relabeled.
                const isPast = !isRecommended && nowMinutesForPicker >= hhmmToMinutes(ss.end);
                // Once a confirm dialog is open for a session pick, lock
                // every session button (including this one) until it's
                // resolved — stops a stray second tap during the confirm
                // step from landing on a different session.
                const isLocked = !!confirm;
                return (
                  <button
                    key={ss.id}
                    type="button"
                    disabled={isPast || isLocked}
                    onClick={() => !isPast && !isLocked && setConfirm({
                      message: `Start ${ss.label || 'this session'} now?`,
                      onYes: () => handleStart(ss.id),
                    })}
                    className={`relative flex flex-col items-center gap-1 px-4 py-3.5 rounded-xl border-2 font-semibold shadow-sm transition-colors ${isPast
                      ? 'border-surface-100 bg-surface-50 text-ink-300 cursor-not-allowed shadow-none'
                      : isLocked
                        ? 'border-surface-200 bg-white text-ink-300 cursor-not-allowed opacity-60'
                        : isRecommended
                        ? 'border-brand-400 bg-brand-50 text-brand-700 ring-2 ring-brand-200'
                        : 'border-surface-200 bg-white text-ink-500 hover:border-brand-300 hover:bg-brand-50/50'}`}
                  >
                    {isRecommended && !isPast && (
                      <span className="absolute -top-2 right-2 text-[9px] font-bold uppercase tracking-wide bg-brand-600 text-white px-1.5 py-0.5 rounded-full">Now</span>
                    )}
                    {isPast && (
                      <span className="absolute -top-2 right-2 text-[9px] font-bold uppercase tracking-wide bg-ink-200 text-ink-500 px-1.5 py-0.5 rounded-full">Missed</span>
                    )}
                    <span className="flex items-center gap-2"><Play size={14} /> {ss.label || 'Session'} In</span>
                    <span className="text-[11px] font-medium text-ink-400">{ss.start} – {ss.end}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Cleaned up Active-shift Controls */}
          {!canStart && (
            <div className="flex flex-col items-center gap-6 w-full max-w-md">
              {timer.status === 'on_break' && (
                <button
                  className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3.5 rounded-xl shadow-sm transition-colors"
                  onClick={() => setConfirm({ message: 'Are you back to work now?', onYes: handleResumeWork })}
                >
                  <RefreshCw size={18} /> Back to Work
                </button>
              )}

              {/* Ends the current session's punch (e.g. Morning OT) and
                  immediately starts the next configured session (e.g.
                  Morning Regular) without a break in between — this is
                  the "time out the first session" action for split shifts. */}
              {timer.status === 'working' && nextSession && (
                <button
                  className="w-full flex items-center justify-center gap-2 bg-white border-2 border-brand-200 hover:border-brand-400 hover:bg-brand-50 text-brand-700 font-semibold px-6 py-3.5 rounded-xl shadow-sm transition-colors"
                  onClick={() => setConfirm({
                    message: `End ${activeWorkSession?.label || 'this session'} and start ${nextSession.label || 'the next session'} now?`,
                    onYes: handleSwitchSession,
                  })}
                >
                  <RefreshCw size={18} /> End {activeWorkSession?.label || 'Session'} &rarr; Start {nextSession.label || 'Next Session'}
                </button>
              )}

              {canTakeBreak && (visibleBreaks.length > 0 || visibleLunch.length > 0) && (
                <div className="w-full space-y-5 rounded-2xl bg-surface-50 border border-surface-200 p-5">
                  {visibleBreaks.length > 0 && (
                    <BreakGroup label="Breaks" icon={Coffee} slots={visibleBreaks} timer={timer} onPick={brk => setConfirm({
                      message: `Start ${brk.displayLabel}${brk.durationMinutes ? ` (${brk.durationMinutes} min)` : ''}?`,
                      onYes: () => handleTakeBreak(brk),
                    })} />
                  )}
                  {visibleBreaks.length > 0 && visibleLunch.length > 0 && <hr className="border-surface-200" />}
                  {visibleLunch.length > 0 && (
                    <BreakGroup label="Lunch" icon={Utensils} slots={visibleLunch} timer={timer} onPick={brk => setConfirm({
                      message: `Start ${brk.displayLabel}${brk.durationMinutes ? ` (${brk.durationMinutes} min)` : ''}?`,
                      onYes: () => handleTakeBreak(brk),
                    })} />
                  )}
                </div>
              )}

              {canTakeBreak && visibleBreaks.length === 0 && visibleLunch.length === 0 && (
                <div className="px-4 py-3 bg-surface-50 border border-surface-200 rounded-xl text-center">
                  <p className="text-xs text-ink-400 font-medium">
                    {breaks.length === 0 && lunch.length === 0
                      ? 'No breaks configured on your shift.'
                      : `No breaks available for ${activeWorkSession?.label || 'this session'} right now.`}
                  </p>
                </div>
              )}

              <button
                className="text-sm font-bold text-red-500 hover:text-red-600 hover:bg-red-50 flex items-center justify-center gap-2 px-6 py-2.5 rounded-full transition-colors w-full sm:w-auto mt-2"
                onClick={() => setConfirm({ message: 'Stop working for today?', onYes: handleStop })}
              >
                <Square size={14} className="fill-current" /> Stop for the Day
              </button>
            </div>
          )}
        </div>

        {/* Footer Stats - Emphasized metrics */}
        <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-surface-100 bg-surface-50/50 gap-4">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-white shadow-sm border border-surface-200 flex items-center justify-center text-brand-600">
              <Clock3 size={18} />
            </span>
            <div className="text-left">
              <p className="text-[11px] text-ink-400 font-semibold uppercase tracking-wider">Worked today</p>
              <p className="text-lg font-extrabold text-ink-800 leading-none mt-0.5">{minutesToHM(workedMinutes)}</p>
            </div>
          </div>
          <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full ${saving ? 'bg-surface-200 text-ink-500' : 'bg-emerald-50 text-emerald-600'}`}>
            {saving ? <><RefreshCw size={14} className="animate-spin" /> Syncing…</> : <><CheckCircle2 size={14} /> Synced</>}
          </div>
        </div>
      </div>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Confirm Action"
        width="max-w-sm"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <button className="px-4 py-2 text-sm font-semibold text-ink-500 hover:bg-surface-100 rounded-lg transition-colors" onClick={() => setConfirm(null)}>Cancel</button>
            <button
              className="px-5 py-2 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm transition-colors"
              onClick={() => { confirm?.onYes?.(); setConfirm(null); }}
            >
              Yes, proceed
            </button>
          </div>
        }
      >
        <p className="text-[15px] text-ink-600 pb-2">{confirm?.message}</p>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Modernized Break Group UI
// ─────────────────────────────────────────────────────────────────────────

function BreakGroup({ label, icon: Icon, slots, timer, onPick }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
      <div className="flex items-center gap-2 sm:w-24 shrink-0 pt-1">
        <Icon size={14} className="text-ink-400" />
        <p className="text-[11px] font-bold text-ink-400 uppercase tracking-wider">{label}</p>
      </div>
      <div className="flex flex-wrap gap-2.5 flex-1">
        {slots.map(brk => {
          const isCurrent = timer.currentSegment?.type === 'break' && timer.currentSegment.breakId === brk.id;
          const alreadyUsed = timer.usedBreakIds?.includes(brk.id) && !isCurrent;
          return (
            <button
              key={brk.id}
              disabled={alreadyUsed || isCurrent}
              onClick={() => onPick(brk)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border flex items-center gap-2 transition-all shadow-sm ${
                isCurrent
                  ? 'border-amber-400 bg-amber-50 text-amber-800 cursor-default ring-2 ring-amber-400/20'
                  : alreadyUsed
                  ? 'border-surface-200 bg-surface-100 text-ink-400 line-through cursor-not-allowed opacity-60'
                  : 'border-brand-200 bg-white text-brand-700 hover:border-brand-300 hover:bg-brand-50 hover:shadow-md'
              }`}
            >
              {brk.displayLabel}
              {brk.durationMinutes ? (
                <span className={`text-xs px-1.5 py-0.5 rounded-md ${isCurrent ? 'bg-amber-100 text-amber-700' : alreadyUsed ? 'bg-surface-200 text-ink-500' : 'bg-brand-100 text-brand-600'}`}>
                  {brk.durationMinutes}m
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}