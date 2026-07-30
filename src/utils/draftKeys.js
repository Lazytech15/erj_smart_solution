/**
 * Draft-key builders for the various "edit" modals (Employee, Attendance,
 * Leave, Shift), plus the "meaningful" checks that decide whether a draft
 * is worth saving/restoring.
 *
 * Unlike the "Add" forms (see employeeDraft.js), an edit form's draft key
 * must encode WHICH record is being edited, and "meaningful" means
 * "actually different from the record as it exists" rather than "any
 * field non-empty" — an edit modal always opens pre-filled, so a
 * not-yet-touched edit form is never worth restoring.
 *
 * Every key starts with a `draft:edit-<thing>:<userId>:` prefix so
 * findDraftsByPrefix() can discover "was I editing something?" on page
 * load before knowing which record that was.
 */

function uid(userId) {
  return userId || 'anon';
}

// ── Employee ──────────────────────────────────────────────────────────
export function editEmployeeDraftPrefix(userId) {
  return `draft:edit-employee:${uid(userId)}:`;
}
export function editEmployeeDraftKey(userId, employeeId) {
  return `${editEmployeeDraftPrefix(userId)}${employeeId}`;
}
export function isEditEmployeeFormMeaningful(draft, original) {
  const f = draft?.form;
  if (!f || !original) return false;
  return ['firstName', 'lastName', 'middleName', 'suffix', 'email', 'phone', 'department', 'role', 'shiftId']
    .some(k => String(f[k] ?? '').trim() !== String(original[k] ?? '').trim());
}

// ── Attendance record (shared by Add + Edit) ─────────────────────────
export function attendanceDraftPrefix(userId) {
  return `draft:edit-attendance:${uid(userId)}:`;
}
export function attendanceDraftKey(userId, recordId) {
  // recordId is 'add' for the Add Record form, or the record's own id when editing.
  return `${attendanceDraftPrefix(userId)}${recordId ?? 'add'}`;
}
export function isAttendanceFormMeaningful(draft, original) {
  const f = draft?.form;
  if (!f) return false;
  if (!original) {
    // Add form: meaningful once anything has been picked/typed.
    return Boolean(f.employeeId || f.notes?.trim() || (f.sessions || []).some(s => s.clockIn || s.clockOut));
  }
  if (f.employeeId !== original.employeeId) return true;
  if ((f.notes || '') !== (original.notes || '')) return true;
  if (f.status !== original.status) return true;
  const a = f.sessions || [], b = original.sessions || [];
  if (a.length !== b.length) return true;
  return a.some((s, i) => s.clockIn !== b[i]?.clockIn || s.clockOut !== b[i]?.clockOut);
}

// ── Leave request (shared by Add + Edit) ─────────────────────────────
export function leaveDraftPrefix(userId) {
  return `draft:edit-leave:${uid(userId)}:`;
}
export function leaveDraftKey(userId, recordId) {
  return `${leaveDraftPrefix(userId)}${recordId ?? 'add'}`;
}
export function isLeaveFormMeaningful(draft, original) {
  const f = draft?.form;
  if (!f) return false;
  if (!original) {
    return Boolean(f.employeeId || (f.dates || []).length > 1 || f.reason?.trim());
  }
  if (String(f.employeeId) !== String(original.employeeId)) return true;
  if ((f.leaveType || '') !== (original.leaveType ?? original.type ?? '')) return true;
  if ((f.reason || '') !== (original.reason || '')) return true;
  const a = [...(f.dates || [])].sort(), b = [...(original.dates || [])].sort();
  return a.length !== b.length || a.some((d, i) => d !== b[i]);
}

// ── Shift (shared by Add + Edit) ──────────────────────────────────────
export function shiftDraftPrefix(userId) {
  return `draft:edit-shift:${uid(userId)}:`;
}
export function shiftDraftKey(userId, shiftId) {
  return `${shiftDraftPrefix(userId)}${shiftId ?? 'add'}`;
}
export function isShiftFormMeaningful(draft, original) {
  const f = draft?.form;
  if (!f) return false;
  if (!original) {
    // Add mode: `start`/`end` always carry a non-blank default (see
    // ShiftsPage's EMPTY_FORM), so a truthy check on them can never tell
    // "still the default" apart from "user actually set a time" — every
    // untouched form would look meaningful. `name` is the only field with
    // a genuinely blank default, so it's the signal; departments/breaks
    // are also blank by default and count as real engagement too.
    return Boolean(
      f.name?.trim() || (f.departments || []).length > 0 || (f.breaks || []).length > 0
    );
  }
  return ['name', 'start', 'end', 'clockType', 'color']
    .some(k => String(f[k] ?? '').trim() !== String(original[k] ?? '').trim());
}

// ── Department (Add only, no per-record edit modal today) ────────────
export function departmentDraftKey(userId) {
  return `draft:add-department:${uid(userId)}`;
}
export function isDepartmentFormMeaningful(draft) {
  return Boolean(draft?.form?.name?.trim());
}
