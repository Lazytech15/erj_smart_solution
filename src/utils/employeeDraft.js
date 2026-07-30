/**
 * Shared constants/helpers for the "Add Employee" form draft, so the page
 * that owns the form (EmployeesPage) and the app-level redirect that jumps
 * the user back to it after a reload (App.jsx) agree on the same key and
 * the same definition of "worth restoring".
 */

/** @param {string|undefined} userId */
export function employeeDraftKey(userId) {
  return `draft:add-employee:${userId || 'anon'}`;
}

/**
 * Onboarding's "Add an employee" form uses its own key (separate from the
 * Employees page's Add Employee modal) since both can theoretically hold
 * an in-progress draft for the same user at different points in their
 * lifecycle — onboarding happens once, before /app/employees exists for
 * them to navigate to. Same field shape, so isAddEmployeeFormMeaningful
 * is reused as-is.
 * @param {string|undefined} userId
 */
export function onboardingEmployeeDraftKey(userId) {
  return `draft:onboarding-employee:${userId || 'anon'}`;
}

/** @param {{form?: object}|null|undefined} draft */
export function isAddEmployeeFormMeaningful(draft) {
  const f = draft?.form;
  if (!f) return false;
  return Boolean(
    f.firstName?.trim() || f.lastName?.trim() || f.middleName?.trim() ||
    f.email?.trim() || f.phone?.trim() || f.role?.trim() || f.employeeCode?.trim()
  );
}

/**
 * The Employees page's CSV Import modal — draft is the whole parsed/edited
 * preview batch (rows + any parse-level warnings), not a single form, but
 * it's persisted the same way: so a reload while the admin is reviewing an
 * uploaded CSV (fixing a typo'd email, deleting a bad row, etc.) doesn't
 * throw the whole import away.
 * @param {string|undefined} userId
 */
export function csvImportDraftKey(userId) {
  return `draft:csv-import-employees:${userId || 'anon'}`;
}

/** @param {{rows?: Array<object>}|null|undefined} draft */
export function isCsvImportDraftMeaningful(draft) {
  return Boolean(draft?.rows && draft.rows.length > 0);
}
