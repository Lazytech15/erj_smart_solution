import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const PAGE_TITLES = {
  '/dashboard':   'Dashboard',
  '/attendance':  'Attendance',
  '/employees':   'Employees',
  '/leave':       'Leave',
  '/reports':     'Reports',
  '/shifts':      'Shift',
  '/departments': 'Departments',
  '/subscription':'Subscription',
  '/settings':    'Settings',
};

export default function AppLayout() {
  const { pathname } = useLocation();
  const segment = pathname.replace('/app/', '').replace('/app', '');
  const title = PAGE_TITLES[`/${segment}`] || PAGE_TITLES[segment] || 'Home';

  return (
    <div className="flex h-screen overflow-hidden bg-surface-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header title={title} />
        <main className="flex-1 overflow-y-auto p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}