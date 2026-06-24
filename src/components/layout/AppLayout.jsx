import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileNav from './MobileNav';

const PAGE_TITLES = {
  '/dashboard':    'Dashboard',
  '/attendance':   'Attendance',
  '/employees':    'Employees',
  '/leave':        'Leave',
  '/reports':      'Reports',
  '/shifts':       'Shift',
  '/departments':  'Departments',
  '/subscription': 'Subscription',
  '/settings':     'Settings',
};

export default function AppLayout() {
  const { pathname } = useLocation();
  const segment = pathname.replace('/app/', '').replace('/app', '');
  const title = PAGE_TITLES[`/${segment}`] || PAGE_TITLES[segment] || 'Home';

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-50">
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Mobile nav overlay */}
      <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header
          title={title}
          onMenuClick={() => setMobileNavOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
