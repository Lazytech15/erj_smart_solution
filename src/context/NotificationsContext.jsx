/**
 * NotificationsContext
 *
 * - Loads announcements from Supabase on mount
 * - Subscribes to Realtime for announcements AND pending_registrations
 * - Pending registrations are injected into SubscriptionContext via
 *   setPendingEmployeesExternal so EmployeesPage always has fresh data
 * - Exposes pendingEmployees directly so Header can list them as notifications
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../utils/supabase';
import {
  getAnnouncements,
  markAnnouncementRead,
  markAllAnnouncementsRead,
  insertAnnouncement,
  deleteAnnouncement,
} from '../utils/db';
import { useAuth } from './AuthContext';
import { useSubscription } from './SubscriptionContext';

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const { subscription, pendingEmployees, setPendingEmployeesExternal } = useSubscription();

  const subscriptionId = subscription?.subscriptionId ?? null;

  const [announcements, setAnnouncements] = useState([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const channelRef = useRef(null);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!subscriptionId) { setAnnouncements([]); return; }
    let cancelled = false;
    setLoadingNotifs(true);
    getAnnouncements(subscriptionId).then(data => {
      if (!cancelled) { setAnnouncements(data); setLoadingNotifs(false); }
    });
    return () => { cancelled = true; };
  }, [subscriptionId]);

  // ── Supabase Realtime channel ──────────────────────────────────────────────
  useEffect(() => {
    if (!subscriptionId) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`realtime:${subscriptionId}`)

      // ── Announcements ──
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'announcements', filter: `subscription_id=eq.${subscriptionId}` },
        ({ new: row }) => {
          setAnnouncements(prev => [{
            id:             row.id,
            subscriptionId: row.subscription_id,
            title:          row.title,
            body:           row.body,
            type:           row.type,
            isRead:         row.is_read,
            createdAt:      row.created_at,
          }, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'announcements', filter: `subscription_id=eq.${subscriptionId}` },
        ({ new: row }) => {
          setAnnouncements(prev => prev.map(a => a.id === row.id
            ? { ...a, isRead: row.is_read, title: row.title, body: row.body, type: row.type }
            : a
          ));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'announcements' },
        ({ old: row }) => {
          setAnnouncements(prev => prev.filter(a => a.id !== row.id));
        }
      )

      // ── Pending registrations — keep SubscriptionContext in sync ──
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pending_registrations', filter: `subscription_id=eq.${subscriptionId}` },
        ({ new: row }) => {
          const entry = {
            id:             row.id,
            subscriptionId: row.subscription_id,
            firstName:      row.first_name,
            middleName:     row.middle_name   ?? '',
            lastName:       row.last_name,
            suffix:         row.suffix        ?? '',
            email:          row.email,
            phone:          row.phone         ?? '',
            role:           row.role,
            department:     row.department    ?? '',
            joinDate:       row.join_date     ?? '',
            shiftId:        row.shift_id      ?? '',
            employeeCode:   row.employee_code ?? '',
            notes:          row.notes         ?? '',
            submittedAt:    row.submitted_at,
            username:       row.username       ?? '',
            password:       row.password       ?? '',
          };
          if (setPendingEmployeesExternal) {
            setPendingEmployeesExternal(prev =>
              prev.some(p => p.id === entry.id) ? prev : [...prev, entry]
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pending_registrations', filter: `subscription_id=eq.${subscriptionId}` },
        ({ new: row }) => {
          if (setPendingEmployeesExternal) {
            setPendingEmployeesExternal(prev => prev.map(p => p.id === row.id ? {
              ...p,
              firstName:    row.first_name,
              middleName:   row.middle_name   ?? '',
              lastName:     row.last_name,
              suffix:       row.suffix        ?? '',
              email:        row.email,
              phone:        row.phone         ?? '',
              role:         row.role,
              department:   row.department    ?? '',
              joinDate:     row.join_date     ?? '',
              shiftId:      row.shift_id      ?? '',
              employeeCode: row.employee_code ?? '',
              notes:        row.notes         ?? '',
            } : p));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'pending_registrations' },
        ({ old: row }) => {
          if (setPendingEmployeesExternal) {
            setPendingEmployeesExternal(prev => prev.filter(p => p.id !== row.id));
          }
        }
      )

      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
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
