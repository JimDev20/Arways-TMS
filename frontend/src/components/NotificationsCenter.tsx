'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Card, Empty, StatusDot, type DotColor } from '@/components/saas';
import { api } from '@/lib/supabase';
import { useRealtime } from '@/lib/realtime';
import { notificationHref } from '@/lib/notifications';
import type { NotificationItem, Role } from '@/lib/types';

const KIND: { match: RegExp; color: DotColor; label: string }[] = [
  { match: /order/i, color: 'red', label: 'New order' },
  { match: /arriv/i, color: 'yellow', label: 'Delivery update' },
  { match: /deliver|complet/i, color: 'green', label: 'Delivered' },
  { match: /delay|behind|fail/i, color: 'red', label: 'Alert' },
  { match: /approv/i, color: 'blue', label: 'Approval' },
];

const FALLBACK_KIND: { color: DotColor; label: string } = { color: 'gray', label: 'Notice' };

function kindOf(message: string): { color: DotColor; label: string } {
  for (const k of KIND) if (k.match.test(message)) return k;
  return FALLBACK_KIND;
}

/** Wireframe 2.7: full-page notification center (all roles). */
/** Every row is clickable and opens the notification's own section. */
export function NotificationsCenter({ role }: { role: Role }) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [q, setQ] = useState('');
  const load = useCallback(() => {
    api<NotificationItem[]>('/notifications').then(setItems).catch(() => {});
  }, []);
  useEffect(() => {
    let live = true;
    api<NotificationItem[]>('/notifications')
      .then((list) => {
        if (live) setItems(list);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useRealtime('notifications', load);

  const visible = useMemo(() => {
    const scoped = filter === 'unread' ? items.filter((n) => !n.isRead) : items;
    const needle = q.trim().toLowerCase();
    if (!needle) return scoped;
    return scoped.filter((n) => String(n.message ?? '').toLowerCase().includes(needle));
  }, [items, filter, q]);
  const unread = items.filter((n) => !n.isRead);

  async function openNotification(n: NotificationItem) {
    // Navigate first so marking read can never block it, then mark read.
    router.push(notificationHref(n, role));
    try {
      await api(`/notifications/${n.notificationId}/read`, { method: 'PATCH' });
      setItems((prev) => prev.map((x) => (x.notificationId === n.notificationId ? { ...x, isRead: true } : x)));
    } catch {
      /* destination reloads live state anyway */
    }
  }

  async function markAll() {
    for (const n of unread) {
      try {
        await api(`/notifications/${n.notificationId}/read`, { method: 'PATCH' });
      } catch {
        /* keep going */
      }
    }
    load();
  }

  return (
    <Shell role={role} title="Notifications">
      <Card
        title={`Notifications${unread.length > 0 ? ` (${unread.length} unread)` : ''}`}
        action={
          <div className="flex flex-wrap gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search messages…"
              aria-label="Search notifications"
              className="w-44 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
            />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'all' | 'unread')}
              aria-label="Filter notifications"
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="all">All</option>
              <option value="unread">Unread only</option>
            </select>
            {unread.length > 0 && (
              <button onClick={markAll} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-slate-900">
                Mark all read
              </button>
            )}
          </div>
        }
      >
        {visible.length === 0 ? (
          <Empty message={q.trim() ? 'No notifications match. Try a different search.' : filter === 'unread' ? 'All caught up: no unread notifications.' : 'No notifications yet.'} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((n) => {
              const k = kindOf(String(n.message ?? ''));
              return (
                <li key={n.notificationId}>
                  <button
                    onClick={() => openNotification(n)}
                    aria-label={`Open: ${n.message}`}
                    className={`flex w-full items-start gap-3 px-2 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 ${n.isRead ? '' : 'bg-blue-50/40 dark:bg-blue-950/30'}`}
                  >
                    <span className="mt-1.5"><StatusDot color={k.color} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">{k.label}</span>
                      <span className={`block text-sm ${n.isRead ? 'text-slate-500 dark:text-slate-400' : 'font-medium text-slate-900 dark:text-slate-100'}`}>
                        {n.message}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-400">{String(n.createdAt ?? '').slice(0, 16).replace('T', ' ')} · Tap to open</span>
                    </span>
                    {!n.isRead && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </Shell>
  );
}
