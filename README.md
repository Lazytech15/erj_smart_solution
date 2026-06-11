# AttendMS — Enterprise Attendance Management System

A modern, Clockify-inspired attendance management system built with React 18, Vite, and Tailwind CSS.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and configure
cp .env.example .env

# 3. Run dev server
npm run dev
```

Open http://localhost:5173 — use the demo accounts on the login page.

## Demo Accounts

| Role     | Email                      | Password |
|----------|----------------------------|----------|
| Admin    | admin@acmecorp.com         | admin123 |
| HR       | hr@acmecorp.com            | hr123    |
| Manager  | manager@acmecorp.com       | mgr123   |
| Employee | employee@acmecorp.com      | emp123   |

## Project Structure

```
attendance_manager/
├── index.html                  # Vite entry point
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.example
└── src/
    ├── main.jsx                # React DOM mount
    ├── App.jsx                 # Router + providers
    ├── styles/
    │   └── globals.css         # Tailwind + design tokens + component classes
    ├── api/
    │   └── api.js              # Axios instance with encrypt/decrypt interceptors
    ├── context/
    │   ├── AuthContext.jsx     # Auth state, login/logout, RBAC `can()` helper
    │   └── ToastContext.jsx    # Global toast notifications
    ├── components/
    │   ├── layout/
    │   │   ├── AppLayout.jsx   # Sidebar + Header shell
    │   │   ├── Sidebar.jsx     # Collapsible nav, role-filtered links
    │   │   └── Header.jsx      # Top bar with notifications
    │   └── ui/
    │       └── index.jsx       # Shared UI components (see below)
    ├── pages/
    │   ├── LoginPage.jsx
    │   ├── DashboardPage.jsx
    │   ├── AttendancePage.jsx
    │   ├── EmployeesPage.jsx
    │   ├── LeavePage.jsx
    │   ├── ReportsPage.jsx
    │   ├── ShiftsPage.jsx
    │   ├── DepartmentsPage.jsx
    │   └── SettingsPage.jsx
    ├── data/
    │   └── mockData.js         # Employees, records, leave requests, announcements
    └── utils/
        ├── dateTime.js         # fmt helpers, minutesToHHMM, getStatus
        └── crypto.js           # AES-GCM encrypt/decrypt (Web Crypto API)
```

## Shared UI Components (`src/components/ui/index.jsx`)

| Component      | Description                                   |
|----------------|-----------------------------------------------|
| `StatusBadge`  | Coloured pill for attendance/leave statuses   |
| `Avatar`       | Initials avatar with configurable color/size  |
| `Spinner`      | Animated loading icon                         |
| `Modal`        | Accessible overlay modal with header/footer   |
| `SearchInput`  | Icon-prefixed search field                    |
| `EmptyState`   | Centred empty placeholder with optional CTA   |
| `StatCard`     | KPI metric card with icon, trend indicator    |
| `ProgressBar`  | Thin horizontal progress bar                  |
| `SelectField`  | Labelled `<select>` wrapper                   |
| `InputField`   | Labelled `<input>` with error support         |
| `SectionHeader`| Page title + description + action slot        |

## Role-Based Access Control

Permissions are checked via the `can(permission)` helper from `useAuth()`.

| Permission       | admin | hr  | manager | employee |
|------------------|-------|-----|---------|----------|
| `view_all`       | ✓     | ✓   |         |          |
| `edit_all`       | ✓     | ✓   |         |          |
| `view_team`      | ✓     | ✓   | ✓       |          |
| `view_reports`   | ✓     | ✓   | ✓       |          |
| `approve_leave`  | ✓     | ✓   | ✓       |          |
| `manage_shifts`  | ✓     | ✓   |         |          |
| `clock_in_out`   | ✓     | ✓   | ✓       | ✓        |
| `request_leave`  | ✓     | ✓   | ✓       | ✓        |
| `system_settings`| ✓     |     |         |          |

## API Encryption

All outgoing requests can be encrypted using AES-256-GCM (Web Crypto API):

1. Set `VITE_ENCRYPT_PAYLOADS=true` in `.env`
2. The Axios request interceptor in `src/api/api.js` serializes → encrypts → sends
3. The response interceptor auto-decrypts if `response.data.encrypted === true`

## Building for Production

```bash
npm run build
# Output in /dist — serve with any static host or Nginx
```
