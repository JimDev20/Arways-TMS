'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NAV, type NotificationItem, type Order, type Role, type RouteFull, type SessionUser, type TruckWithDriver, type UserRow } from '@/lib/types';
import { api } from '@/lib/supabase';
import { useRealtime } from '@/lib/realtime';
import { centerHrefFor, notificationHref } from '@/lib/notifications';
import { Icons } from '@/lib/createLucideIcon';
import { useTheme } from '@/lib/theme';
import { useStoredString } from '@/lib/storage';
import { GlobalSearch } from '@/components/saas';

/**
 * Shell Component
 * 
 * Clean, minimal layout container providing consistent navigation and branding
 * across all portal pages. Features:
 * - Sticky header with brand and user profile
 * - Responsive sidebar navigation
 * - Role-based access control
 * - Mobile-friendly design
 */
function parseSession(raw: string): SessionUser | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const u = parsed as Record<string, unknown>;
    if (typeof u.userId !== 'string' || typeof u.email !== 'string' || typeof u.fullName !== 'string') return null;
    if (u.role !== 'Owner' && u.role !== 'Secretary' && u.role !== 'Client' && u.role !== 'Driver') return null;
    return { userId: u.userId, email: u.email, fullName: u.fullName, role: u.role };
  } catch {
    return null;
  }
}

export function useSession(): SessionUser | null | undefined {
  const raw = useStoredString('arways_user');
  if (raw === undefined) return undefined;
  return raw ? parseSession(raw) : null;
}

const NAV_ICON: Record<string, (props: { className?: string }) => React.ReactElement> = {
  Dashboard: Icons.Dashboard,
  Orders: Icons.Orders,
  'My Orders': Icons.Orders,
  Fleet: Icons.Fleet,
  Users: Icons.Users,
  Clients: Icons.Client,
  Routes: Icons.Route,
  Proof: Icons.Proof,
  Reports: Icons.Reports,
  'Audit Logs': Icons.Audit,
  Notifications: Icons.Bell,
  Settings: Icons.Settings,
  Help: Icons.Help,
  Approvals: Icons.Approval,
  Broadcast: Icons.Broadcast,
  Monitoring: Icons.Monitor,
  Calendar: Icons.CalendarDays,
  'Status Board': Icons.Kanban,
  'New Order': Icons.Plus,
  Track: Icons.MapPin,
  "Today's Route": Icons.Route,
  Stops: Icons.Route,
  Profile: Icons.User,
};

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      suppressHydrationWarning
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0e7a70] dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {theme === 'dark' ? <Icons.Sun className="h-5 w-5" /> : <Icons.Moon className="h-5 w-5" />}
    </button>
  );
}

function HeaderSearch({ role }: { role: Role }) {
  const [docs, setDocs] = useState<{ orders?: Order[]; routes?: RouteFull[]; trucks?: TruckWithDriver[]; users?: UserRow[] }>({});
  useEffect(() => {
    let live = true;
    (async () => {
      const next: { orders?: Order[]; routes?: RouteFull[]; trucks?: TruckWithDriver[]; users?: UserRow[] } = {};
      try {
        next.orders = await api<Order[]>('/orders');
      } catch {
        /* scoped roles may fail: ignore */
      }
      if (role === 'Owner' || role === 'Secretary') {
        try {
          next.routes = await api<RouteFull[]>('/routes');
        } catch {
          /* ignore */
        }
      }
      if (role === 'Owner') {
        try {
          next.trucks = await api<TruckWithDriver[]>('/trucks');
        } catch {
          /* ignore */
        }
        try {
          next.users = await api<UserRow[]>('/users');
        } catch {
          /* ignore */
        }
      }
      if (live) setDocs(next);
    })();
    return () => {
      live = false;
    };
  }, [role]);
  const base = role === 'Owner' ? '/owner' : role === 'Secretary' ? '/secretary' : role === 'Client' ? '/client' : '/driver';
  return <GlobalSearch docs={docs} base={base} />;
}

export function Shell({ role, title, children }: { role: Role; title: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useSession();

  useEffect(() => {
    if (user === null) router.replace('/login');
    else if (user && user.role !== role) {
      const fallback: Record<Role, string> = { Owner: '/owner', Secretary: '/secretary', Client: '/client', Driver: '/driver' };
      router.replace(fallback[user.role]);
    }
  }, [user, role, router]);

  if (user === undefined) return <main className="p-8 text-sm text-slate-500">Loading…</main>;
  if (!user) return null;

  const initials = user.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  function logout() {
    localStorage.removeItem('arways_token');
    localStorage.removeItem('arways_user');
    router.replace('/login');
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      {/* Full-width header: one unbroken line edge to edge */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <BrandMark role={role} />

          {/* Search, notifications, theme, profile */}
          <div className="flex items-center gap-1 sm:gap-2">
            <HeaderSearch role={role} />
            <NotificationBell />
            <ThemeToggle />
            <div className="hidden items-center gap-2 sm:flex">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
                {initials}
              </div>
              <span className="max-w-40 truncate text-sm font-medium text-slate-700 dark:text-slate-200">{user.fullName}</span>
            </div>
            <button
              onClick={logout}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0e7a70] focus:ring-offset-2 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Below the header line: nav rail + content */}
      <div className="flex min-w-0 flex-1">
        {/* Left rail: transparent shell, nav framed in a bordered box */}
        <aside className="sticky top-20 hidden h-[calc(100vh-5rem)] w-64 shrink-0 flex-col overflow-y-auto p-4 lg:flex">
          <nav aria-label="Portal navigation">
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
              {NAV[role].map((group) => (
                <div key={group.section || 'main'}>
                  {group.section && (
                    <p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {group.section}
                    </p>
                  )}
                  <ul className="space-y-1">
                    {group.links.map((n) => {
                      const active = pathname === n.href;
                      const Icon = NAV_ICON[n.label] ?? Icons.Dashboard;
                      return (
                        <li key={n.href}>
                          <Link
                            href={n.href}
                            aria-current={active ? 'page' : undefined}
                            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                              active
                                ? 'bg-[#0e7a70]/10 text-[#0e7a70]'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                            }`}
                          >
                            <Icon className={`h-5 w-5 ${active ? '' : 'opacity-60'}`} />
                            <span>{n.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </nav>
        </aside>

        {/* Right column: content + footer */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {/* Mobile Navigation */}
          <nav aria-label="Portal navigation (mobile)" className="lg:hidden">
            <div className="flex overflow-x-auto gap-2 pb-2">
              {NAV[role].flatMap((g) => g.links).map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                    pathname === n.href
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'
                  }`}
                >
                  {n.label}
                </Link>
              ))}
            </div>
          </nav>

          {/* Main Content */}
          <main className="min-w-0 flex-1">
            <h1 className="mb-6 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
            {children}

            {/* Mobile Navigation (Bottom) */}
            <nav aria-label="Portal navigation (mobile bottom)" className="mt-8 flex flex-wrap gap-2 lg:hidden">
              {NAV[role].flatMap((g) => g.links).map((n) => (
                <Link key={n.href} href={n.href} className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  pathname === n.href
                    ? 'bg-[#0e7a70] text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'
                }`}>
                  {n.label}
                </Link>
              ))}
            </nav>
          </main>
        </div>

          {/* Footer */}
          <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <p>© 2026 Arways Trucking · Status-based tracking, no GPS</p>
          </footer>
        </div>
      </div>
      <NotificationToasts role={role} />
    </div>
  );
}

const TOAST_LIFETIME_MS = 8000;
const MAX_TOASTS = 4;

/**
 * Stacked toast popups for newly arrived notifications.
 * Clicking a toast opens the notification's own section (deep link) and
 * marks ONLY that notification as read. Dismissing (X or timeout) leaves it
 * unread.
 */
function NotificationToasts({ role }: { role: Role }) {
  const router = useRouter();
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  const knownRef = useRef<Set<string> | null>(null);

  const pushFresh = useCallback((list: NotificationItem[]) => {
    const known = knownRef.current;
    if (known === null) {
      knownRef.current = new Set(list.map((n) => n.notificationId));
      return;
    }
    const fresh = list.filter((n) => !n.isRead && !known.has(n.notificationId));
    if (fresh.length === 0) return;
    for (const n of fresh) known.add(n.notificationId);
    setToasts((prev) => [...fresh, ...prev].slice(0, MAX_TOASTS));
    for (const n of fresh) {
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.notificationId !== n.notificationId));
      }, TOAST_LIFETIME_MS);
    }
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const list = await api<NotificationItem[]>('/notifications');
        if (live) pushFresh(list);
      } catch {
        /* offline — realtime will fill in */
      }
    })();
    return () => {
      live = false;
    };
  }, [pushFresh]);

  const refresh = useCallback(() => {
    api<NotificationItem[]>('/notifications').then(pushFresh).catch(() => {});
  }, [pushFresh]);
  useRealtime('notifications', refresh);

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.notificationId !== id));
  }

  function openToast(n: NotificationItem) {
    dismissToast(n.notificationId);
    // Navigate first, synchronously in the click handler, so a slow or
    // failing mark-read request can never block or swallow the navigation.
    router.push(notificationHref(n, role));
    // Then mark ONLY this notification as read in the background. The
    // destination page reloads live state on arrival anyway.
    api(`/notifications/${n.notificationId}/read`, { method: 'PATCH' }).catch(() => {
      /* destination reloads live state anyway */
    });
  }

  if (toasts.length === 0) return null;

  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((n) => (
        <div
          key={n.notificationId}
          className="pointer-events-auto flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <button
            onClick={() => openToast(n)}
            aria-label={`Open notification: ${n.message}`}
            className="min-w-0 flex-1 text-left focus:outline-none focus:ring-2 focus:ring-[#0e7a70]"
          >
            <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{n.message}</span>
            <span className="mt-0.5 block text-xs text-slate-400">
              {String(n.createdAt ?? '').slice(0, 16).replace('T', ' ')} · Tap to view
            </span>
          </button>
          <button
            onClick={() => dismissToast(n.notificationId)}
            aria-label="Dismiss notification"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0e7a70] dark:hover:bg-slate-800"
          >
            <Icons.X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function BrandMark({ role }: { role: Role }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0e7a70] text-white shadow-sm">
        <Icons.Logo className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">ARWAYS TMS</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{role} Portal</p>
      </div>
    </div>
  );
}

/**
 * Stat Card Component
 * 
 * Clean, minimal statistics display for dashboard pages.
 * Uses the brand color (#0e7a70) for visual hierarchy.
 */
export function Stat({ label, value, tone = 'slate' }: { label: string; value: string | number; tone?: 'slate' | 'amber' | 'blue' | 'green' }) {
  const colors = {
    slate: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' },
    amber: { bg: 'bg-[#0e7a70]/10', text: 'text-[#0e7a70]', border: 'border-[#0e7a70]/20' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100' },
    green: { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-100' },
  }[tone];

  return (
    <div className={`rounded-xl border ${colors.border} bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-900`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="stat-value text-4xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      </div>
      <div className={`mt-4 h-1 w-full rounded-full ${colors.bg}`}>
        <div className={`h-full rounded-full ${colors.text} w-1/3 opacity-50`} />
      </div>
    </div>
  );
}

/** Header notification bell with unread count + mark-read dropdown. */
export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
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

  const unread = items.filter((n) => !n.isRead);
  /** Bell has no role prop: read the stored session (same source as useSession). */
  function storedRole(): Role {
    try {
      const raw = localStorage.getItem('arways_user');
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      const role = typeof parsed === 'object' && parsed !== null ? (parsed as { role?: unknown }).role : undefined;
      return role === 'Secretary' || role === 'Client' || role === 'Driver' ? role : 'Owner';
    } catch {
      return 'Owner';
    }
  }
  function centerHref() {
    return centerHrefFor(storedRole());
  }

  function openNotification(id: string) {
    const item = items.find((x) => x.notificationId === id);
    setOpen(false);
    // Navigate first so a slow mark-read can never block it. Clicking
    // opens the notification's own section (deep link), read or unread.
    router.push(item ? notificationHref(item, storedRole()) : centerHrefFor(storedRole()));
    // Then mark ONLY the clicked notification as read in the background.
    api(`/notifications/${id}/read`, { method: 'PATCH' })
      .then(() => {
        setItems((prev) => prev.map((n) => (n.notificationId === id ? { ...n, isRead: true } : n)));
      })
      .catch(() => {
        /* destination reloads live state anyway */
      });
  }

  async function markAll() {
    for (const n of unread) {
      try { await api(`/notifications/${n.notificationId}/read`, { method: 'PATCH' }); } catch { /* keep going */ }
    }
    load();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread.length > 0 ? `${unread.length} unread notifications` : 'Notifications'}
        aria-expanded={open}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0e7a70] dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <Icons.Bell className="h-5 w-5" />
        {unread.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notifications</p>
            {unread.length > 0 && (
              <button onClick={markAll} className="text-xs font-medium text-[#0e7a70] hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-auto">
            {items.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-400">No notifications yet.</li>
            )}
            {items.slice(0, 20).map((n) => (
              <li key={n.notificationId}>
                <button
                  onClick={() => openNotification(n.notificationId)}
                  className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${n.isRead ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 font-medium dark:text-slate-100'}`}
                >
                  <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
                  {n.message}
                  <span className="mt-0.5 block text-xs font-normal text-slate-400">
                    {String(n.createdAt ?? '').slice(0, 16).replace('T', ' ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link href={centerHref()} className="block border-t border-slate-100 px-4 py-2.5 text-center text-xs font-semibold text-blue-700 hover:bg-slate-50 dark:border-slate-800 dark:text-blue-400 dark:hover:bg-slate-800">
            Open notification center
          </Link>
        </div>
      )}
    </div>
  );
}
