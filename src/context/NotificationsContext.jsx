/**
 * NotificationsContext
 *
 * - Loads announcements from Supabase on mount
 * - Subscribes to Realtime for announcements AND pending_registrations
 * - Pending registrations are injected into SubscriptionContext via
 *   setPendingEmployeesExternal so EmployeesPage always has fresh data
 * - Exposes pendingEmployees directly so Header can list them as notifications
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  getAnnouncements,
  markAnnouncementRead,
  markAllAnnouncementsRead,
  insertAnnouncement,
  deleteAnnouncement,
  getPendingRegistrations,
} from '../utils/db';
import { forceResetStuckAuthState } from '../utils/supabase';
import { cacheForceClearInFlight } from '../utils/cache';
import { useAuth } from './AuthContext';
import { useSubscription } from './SubscriptionContext';

const NotificationsContext = createContext(null);

// Same threshold/reasoning as SubscriptionContext's attendance poll.
const STUCK_STATE_THRESHOLD = 3;

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const { subscription, pendingEmployees, setPendingEmployeesExternal } = useSubscription();

  const subscriptionId = subscription?.subscriptionId ?? null;

  const [announcements, setAnnouncements] = useState([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!subscriptionId) { setAnnouncements([]); return; }
    let cancelled = false;
    setLoadingNotifs(true);
    getAnnouncements(subscriptionId).then(data => {
      if (!cancelled) { setAnnouncements(data); setLoadingNotifs(false); }
    }).catch(err => {
      // Previously unhandled — a failed/timed-out fetch here (see cache.js)
      // was an uncaught promise rejection in the console, and left
      // loadingNotifs stuck true forever with no announcements ever shown.
      console.warn('[NotificationsContext] getAnnouncements failed:', err?.message || err);
      if (!cancelled) { setLoadingNotifs(false); }
    });
    return () => { cancelled = true; };
  }, [subscriptionId]);

  // ── Poll announcements + pending registrations (replaces Supabase Realtime) ──
  // This used to be a `supabase.channel(...).on('postgres_changes', ...)`
  // websocket subscription with 6 separate listeners. That kept a permanent
  // open connection to the Supabase host per signed-in tab and was the
  // dominant cost in the project's Query Performance dashboard (a
  // `wal->>...` WAL-decoding query responsible for the large majority of
  // total DB time). It was also implicated in the login hang: browsers cap
  // concurrent connections per host (6 for HTTP/1.1), so a live websocket
  // plus the attendance poll could exhaust that pool — after which every
  // *other* fetch to the same host (including signInWithPassword) simply
  // queued forever with no visible network activity and no error, only
  // recoverable with a full page reload.
  //
  // A plain visibility-aware poll (same pattern as the attendance poll
  // below) needs a normal short-lived HTTP request instead of a permanent
  // socket, degrades gracefully on failure, and can't starve other requests
  // of a connection slot.
  useEffect(() => {
    if (!subscriptionId) return;

    let cancelled = false;
    let consecutiveFailures = 0;

    async function tick() {
      if (document.visibilityState !== 'visible') return; // don't poll while backgrounded
      try {
        const [notifs, pending] = await Promise.all([
          getAnnouncements(subscriptionId),
          getPendingRegistrations(subscriptionId),
        ]);
        if (cancelled) return;
        consecutiveFailures = 0;
        setAnnouncements(prev => (JSON.stringify(prev) === JSON.stringify(notifs) ? prev : notifs));
        if (setPendingEmployeesExternal) {
          setPendingEmployeesExternal(prev =>
            JSON.stringify(prev) === JSON.stringify(pending) ? prev : pending
          );
        }
      } catch (err) {
        consecutiveFailures++;
        console.warn('[NotificationsContext] notifications poll failed:', err?.message || err);
        // See SubscriptionContext's attendance poll for the full reasoning:
        // repeated timeouts against a healthy backend point to a wedged
        // internal lock/in-flight promise, not real network conditions.
        if (consecutiveFailures === STUCK_STATE_THRESHOLD) {
          forceResetStuckAuthState();
          cacheForceClearInFlight();
        }
      }
    }

    const BASE_INTERVAL_MS = 20000;
    const MAX_INTERVAL_MS = 120000; // back off to at most once every 2 min
    let timeoutId = setTimeout(runAndReschedule, BASE_INTERVAL_MS);

    async function runAndReschedule() {
      await tick();
      if (cancelled) return;
      const delay = Math.min(BASE_INTERVAL_MS * 2 ** consecutiveFailures, MAX_INTERVAL_MS);
      timeoutId = setTimeout(runAndReschedule, delay);
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [subscriptionId]); // eslint-disable-line

  // ── Actions ────────────────────────────────────────────────────────────────
  const markRead = useCallback(async (id) => {
    await markAnnouncementRead(id);
    setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, isRead: true } : a));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!subscriptionId) return;
    await markAllAnnouncementsRead(subscriptionId);
    setAnnouncements(prev => prev.map(a => ({ ...a, isRead: true })));
  }, [subscriptionId]);

  const addAnnouncement = useCallback(async ({ title, body, type }) => {
    if (!subscriptionId) return;
    await insertAnnouncement(subscriptionId, { title, body, type });
  }, [subscriptionId]);

  const removeAnnouncement = useCallback(async (id) => {
    await deleteAnnouncement(id);
  }, []);

  const unreadCount   = announcements.filter(a => !a.isRead).length;
  const pendingCount  = (pendingEmployees || []).length;

  return (
    <NotificationsContext.Provider value={{
      announcements,
      loadingNotifs,
      unreadCount,
      pendingCount,
      pendingEmployees: pendingEmployees || [],
      markRead,
      markAllRead,
      addAnnouncement,
      removeAnnouncement,
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export const useNotifications = () => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be within NotificationsProvider');
  return ctx;
};