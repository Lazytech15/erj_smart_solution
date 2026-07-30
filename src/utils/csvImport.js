/**
 * Shared "bulk import employees via CSV" helpers.
 *
 * Both OnboardingPage (first-run bulk enroll) and EmployeesPage (ongoing
 * bulk add) need the exact same template columns and parsing rules — if
 * these drifted apart, a template downloaded from one page could fail to
 * import cleanly on the other. Keeping it in one module means there's only
 * one place to fix if the column set ever changes.
 */

/** @returns {string} a fresh, human-friendly employee code, e.g. "ERJ-AB3C123" */
export function generateEmployeeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const tail = String(Date.now()).slice(-3);
  return `ERJ-${rand}${tail}`;
}

/** Triggers a browser download of the blank employee_import_template.csv file. */
export function downloadCSVTemplate() {
  const headers = ['firstName', 'middleName', 'lastName', 'suffix', 'email', 'phone', 'role', 'department', 'employeeCode'];
  const examples = [
    ['Maria', 'Cristina', 'Santos', '', 'm.santos@company.com', '+639123456789', 'Engineer', 'Engineering', 'ERJ-SAMPLE1'],
    ['Jose', '', 'Reyes', 'Jr.', 'j.reyes@company.com', '+639179876543', 'Team Lead', 'Operations', ''],
  ];
  const rows = [headers, ...examples].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'employee_import_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parses uploaded CSV text into employee objects, using generateEmployeeCode()
 * as a fallback for any row that left the employeeCode column blank.
 * @param {string} text
 * @returns {{ employees: Array<object>, errors: string[] }}
 */
export function parseCSV(text) {
  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return { employees: [], errors: ['CSV has no data rows.'] };

  // Strip BOM and normalize quotes
  const clean = s => s.replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim();

  const headers = lines[0].split(',').map(clean).map(h => h.toLowerCase());
  const required = ['firstname', 'lastname', 'email'];
  const missing = required.filter(r => !headers.includes(r));
  if (missing.length) return { employees: [], errors: [`Missing required columns: ${missing.join(', ')}. Download the template to see the correct format.`] };

  const employees = [];
  const errors = [];

  lines.slice(1).forEach((line, i) => {
    const row = line.split(',').map(clean);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] || ''; });

    const rowNum = i + 2;
    if (!obj.firstname) { errors.push(`Row ${rowNum}: First name is required`); return; }
    if (!obj.lastname) { errors.push(`Row ${rowNum}: Last name is required`); return; }
    if (!obj.email?.includes('@')) { errors.push(`Row ${rowNum}: Valid email required`); return; }

    employees.push({
      firstName: obj.firstname,
      middleName: obj.middlename || '',
      lastName: obj.lastname,
      suffix: obj.suffix || '',
      email: obj.email,
      phone: obj.phone || '',
      role: obj.role || '',
      department: obj.department || '',
      joinDate: obj.joindate || new Date().toISOString().split('T')[0],
      employeeCode: obj.employeecode?.toUpperCase() || generateEmployeeCode(),
    });
  });

  return { employees, errors };
}
