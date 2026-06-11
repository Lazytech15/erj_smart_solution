import { Bell, HelpCircle, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fmt } from '../../utils/dateTime';
import { ANNOUNCEMENTS } from '../../data/mockData';

export default function Header({ title }) {
  const { user } = useAuth();
  const [showNotifs, setShowNotifs] = useState(false);
  const unread = ANNOUNCEMENTS.length;

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <header className="h-14 flex items-center justify-between px-6 bg-white border-b border-slate-100 shrink-0 gap-4">
      {/* Left: breadcrumb-style title */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">ERJ</span>
        <span className="text-slate-300 text-sm">/</span>
        <h1 className="text-sm font-semibold text-slate-800 truncate">{title}</h1>
        <span className="hidden sm:flex items-center gap-1.5 ml-1">
          <span className="w-1 h-1 rounded-full bg-slate-300" />
          <span className="text-xs text-slate-400">{fmt.date(new Date())}</span>
        </span>
      </div>

      {/* Right: actions + avatar */}
      <div className="flex items-center gap-1">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="relative w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Bell size={15} />
            {unread > 0 && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-indigo-500 rounded-full ring-2 ring-white" />
            )}
          </button>

          {showNotifs && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifs(false)} />
              <div className="absolute right-0 top-11 w-80 bg-white rounded-xl shadow-lg shadow-slate-200/60 border border-slate-100 z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700">Notifications</p>
                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-semibold rounded-full">{unread} new</span>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                  {ANNOUNCEMENTS.map(a => (
                    <div key={a.id} className="px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors">
                      <div className="flex items-start gap-2.5">
                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                          a.type === 'warning' ? 'bg-amber-400' : a.type === 'success' ? 'bg-emerald-400' : 'bg-indigo-400'
                        }`} />
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{a.title}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{a.body}</p>
                          <p className="text-[10px] text-slate-300 mt-1">{fmt.date(a.date)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2.5 border-t border-slate-50">
                  <button className="text-xs text-indigo-600 font-medium hover:underline w-full text-center">
                    View all notifications
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <button className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors">
          <HelpCircle size={15} />
        </button>

        {/* Avatar */}
        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-100">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
            {initials}
          </div>
          <span className="hidden sm:block text-xs font-medium text-slate-700 max-w-[80px] truncate">{user?.name || 'User'}</span>
          <ChevronDown size={11} className="hidden sm:block text-slate-300" />
        </div>
      </div>
    </header>
  );
}