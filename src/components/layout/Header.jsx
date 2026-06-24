import { Bell, HelpCircle, ChevronDown, X, CheckCheck, Clock, Menu, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { fmt } from '../../utils/dateTime';

export default function Header({ title, onMenuClick }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const {
    announcements,
    loadingNotifs,
    unreadCount,
    pendingCount,
    pendingEmployees,
    markRead,
    markAllRead,
    removeAnnouncement,
  } = useNotifications();

  const [showNotifs, setShowNotifs] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const totalBadge = unreadCount + pendingCount;

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  function handlePendingClick() {
    setShowNotifs(false);
    navigate('/app/employees', { state: { scrollToPending: true, ts: Date.now() } });
  }

  function handleAnnouncementClick(a) {
    if (!a.isRead) markRead(a.id);
    setShowNotifs(false);
  }

  function handleDismiss(e, id) {
    e.stopPropagation();
    removeAnnouncement(id);
  }

  const hasContent = pendingEmployees.length > 0 || announcements.length > 0;

  return (
    <header className="h-14 flex items-center justify-between px-4 md:px-6 bg-white border-b border-slate-100 shrink-0 gap-3">
      {/* Left */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 transition-colors shrink-0 -ml-1"
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>

        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest hidden sm:block">ERJ</span>
        <span className="text-slate-300 text-sm hidden sm:block">/</span>
        <h1 className="text-sm font-semibold text-slate-800 truncate">{title}</h1>
        <span className="hidden md:flex items-center gap-1.5 ml-1">
          <span className="w-1 h-1 rounded-full bg-slate-300" />
          <span className="text-xs text-slate-400">{fmt.date(new Date())}</span>
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1">
        {/* Bell */}
        <div className="relative">
          <button
            onClick={() => { setShowNotifs(v => !v); setShowProfile(false); }}
            className="relative w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Bell size={15} />
            {totalBadge > 0 && (
              <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-[3px] bg-indigo-500 rounded-full ring-2 ring-white flex items-center justify-center text-[9px] font-bold text-white leading-none">
                {totalBadge > 99 ? '99+' : totalBadge}
              </span>
            )}
          </button>

          {showNotifs && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifs(false)} />
              <div className="absolute right-0 top-11 w-[calc(100vw-2rem)] max-w-[340px] bg-white rounded-xl shadow-lg shadow-slate-200/60 border border-slate-100 z-50 overflow-hidden">

                {/* Panel header */}
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-slate-700">Notifications</p>
                    {pendingCount > 0 && (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-semibold rounded-full">
                        {pendingCount} pending
                      </span>
                    )}
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-semibold rounded-full">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="flex items-center gap-1 text-[10px] text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
                    >
                      <CheckCheck size={11} /> All read
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto">
                  {pendingEmployees.length > 0 && (
                    <div>
                      <div className="px-4 pt-3 pb-1.5">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Registration Requests
                        </p>
                      </div>
                      {pendingEmployees.map(p => {
                        const name = [p.firstName, p.middleName, p.lastName, p.suffix]
                          .filter(Boolean).join(' ');
                        const initials2 = [p.firstName?.[0], p.lastName?.[0]]
                          .filter(Boolean).join('').toUpperCase();
                        return (
                          <div
                            key={p.id}
                            onClick={handlePendingClick}
                            className="group px-4 py-3 cursor-pointer hover:bg-amber-50/60 transition-colors flex items-start gap-3 border-b border-slate-50 last:border-b-0"
                          >
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5">
                              {initials2}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-semibold text-slate-800 truncate">{name}</p>
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                              </div>
                              <p className="text-[11px] text-slate-400 truncate">
                                {p.role}{p.department ? ` · ${p.department}` : ''}
                              </p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <Clock size={9} className="text-slate-300" />
                                <p className="text-[10px] text-slate-300">
                                  {new Date(p.submittedAt).toLocaleDateString('en-PH', {
                                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                  })}
                                </p>
                              </div>
                            </div>
                            <span className="text-[10px] text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded-full shrink-0 mt-1 group-hover:bg-amber-100 transition-colors">
                              Review →
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {announcements.length > 0 && (
                    <div>
                      {pendingEmployees.length > 0 && (
                        <div className="px-4 pt-3 pb-1.5">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Announcements
                          </p>
                        </div>
                      )}
                      {loadingNotifs ? (
                        <div className="px-4 py-4 text-center text-xs text-slate-400">Loading…</div>
                      ) : (
                        announcements.map(a => (
                          <div
                            key={a.id}
                            onClick={() => handleAnnouncementClick(a)}
                            className={`group px-4 py-3 cursor-pointer transition-colors flex items-start gap-2.5 border-b border-slate-50 last:border-b-0 ${
                              a.isRead ? 'hover:bg-slate-50' : 'bg-indigo-50/40 hover:bg-indigo-50/70'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                              a.type === 'warning' ? 'bg-amber-400'
                              : a.type === 'success' ? 'bg-emerald-400'
                              : 'bg-indigo-400'
                            } ${a.isRead ? 'opacity-30' : ''}`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-semibold truncate ${a.isRead ? 'text-slate-500' : 'text-slate-800'}`}>
                                {a.title}
                              </p>
                              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{a.body}</p>
                              <p className="text-[10px] text-slate-300 mt-1">{fmt.date(a.createdAt)}</p>
                            </div>
                            <button
                              onClick={e => handleDismiss(e, a.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 shrink-0 mt-0.5"
                              title="Dismiss"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {!loadingNotifs && !hasContent && (
                    <div className="px-4 py-8 text-center">
                      <Bell size={20} className="text-slate-200 mx-auto mb-2" />
                      <p className="text-xs text-slate-400">You're all caught up!</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <button className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors">
          <HelpCircle size={15} />
        </button>

        {/* Avatar + profile dropdown */}
        <div className="relative ml-2 pl-2 border-l border-slate-100">
          <button
            onClick={() => { setShowProfile(v => !v); setShowNotifs(false); }}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-50 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
              {initials}
            </div>
            <span className="hidden sm:block text-xs font-medium text-slate-700 max-w-[80px] truncate">{user?.name || 'User'}</span>
            <ChevronDown
              size={11}
              className="hidden sm:block text-slate-300 transition-transform duration-200"
              style={{ transform: showProfile ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>

          {showProfile && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowProfile(false)} />
              <div
                className="absolute right-0 top-10 z-50 w-48 bg-white rounded-xl border border-slate-100 overflow-hidden"
                style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)' }}
              >
                {/* User info */}
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-800 truncate">{user?.name || 'User'}</p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{user?.email || user?.role || ''}</p>
                </div>
                {/* Logout */}
                <button
                  onClick={() => { setShowProfile(false); logout(); navigate('/login'); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={14} />
                  Log Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
