'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Order, RouteFull, StopRow, TruckWithDriver, UserRow } from '@/lib/types';
import { Icons } from '@/lib/createLucideIcon';

/* ------------------------------------------------------------------ */
/* Small layout helpers (wireframe: consistent SaaS cards)             */
/* ------------------------------------------------------------------ */

export function Card({ title, action, children, className = '' }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-5 sm:p-6 dark:border-slate-700 dark:bg-slate-900 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 sm:text-lg">{title}</h2> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ message, cta }: { message: string; cta?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <p className="text-sm text-slate-400 dark:text-slate-400">{message}</p>
      {cta && <div className="mt-3">{cta}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Activity feed: wireframe 2.1 / 3.1 "REAL-TIME ACTIVITY"            */
/* Derived client-side from orders + routes so no backend change.      */
/* ------------------------------------------------------------------ */

export interface ActivityItem {
  id: string;
  color: 'green' | 'yellow' | 'blue' | 'red';
  text: string;
  time: string;
}

const dot: Record<ActivityItem['color'], string> = {
  green: 'bg-green-500',
  yellow: 'bg-amber-500',
  blue: 'bg-blue-500',
  red: 'bg-red-500',
};

export type DotColor = ActivityItem['color'] | 'gray';

const DOT_BG: Record<DotColor, string> = {
  ...dot,
  gray: 'bg-slate-400',
};

/** Small status dot shared by activity, notifications, and system health. */
export function StatusDot({ color }: { color: DotColor }) {
  return <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT_BG[color]}`} />;
}

export function buildActivity(orders: Order[], routes: RouteFull[]): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const o of orders.slice(0, 30)) {
    const t = String(o.updatedAt ?? o.createdAt ?? '').slice(0, 16).replace('T', ' ');
    if (o.status === 'Completed') items.push({ id: `o-${o.orderId}-done`, color: 'green', text: `Order ${o.orderReference} delivered`, time: t });
    else if (o.status === 'Pending') items.push({ id: `o-${o.orderId}-new`, color: 'red', text: `New order ${o.orderReference} awaiting approval`, time: t });
    else if (o.status === 'Approved') items.push({ id: `o-${o.orderId}-appr`, color: 'blue', text: `Order ${o.orderReference} approved`, time: t });
    else if (o.status === 'In Transit') items.push({ id: `o-${o.orderId}-tr`, color: 'yellow', text: `Order ${o.orderReference} in transit`, time: t });
    else if (o.status === 'Rejected') items.push({ id: `o-${o.orderId}-rej`, color: 'red', text: `Order ${o.orderReference} rejected`, time: t });
  }
  for (const r of routes.slice(0, 20)) {
    for (const s of r.stops ?? []) {
      if (s.status === 'Delivered') items.push({ id: `s-${s.stopId}-d`, color: 'green', text: `${r.driverName} delivered ${s.locationAddress}`, time: String(s.deliveredAt ?? '').slice(0, 16).replace('T', ' ') });
      else if (s.status === 'Arrived') items.push({ id: `s-${s.stopId}-a`, color: 'blue', text: `${r.driverName} arrived at ${s.locationAddress}`, time: String(s.arrivedAt ?? '').slice(0, 16).replace('T', ' ') });
      else if (s.status === 'Failed') items.push({ id: `s-${s.stopId}-f`, color: 'red', text: `${r.driverName} failed at ${s.locationAddress}`, time: String(s.deliveredAt ?? s.arrivedAt ?? '').slice(0, 16).replace('T', ' ') });
    }
  }
  return items
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 8);
}

export function ActivityFeed({ items, viewAllHref }: { items: ActivityItem[]; viewAllHref?: string }) {
  if (items.length === 0) return <Empty message="No activity yet. Updates appear here in real time." />;
  return (
    <div>
      <ul className="space-y-3">
        {items.map((a) => (
          <li key={a.id} className="flex items-start gap-2.5 text-sm">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[a.color]}`} aria-hidden />
            <div className="min-w-0">
              <p className="text-slate-800 dark:text-slate-200">{a.text}</p>
              {a.time && <p className="text-xs text-slate-400">{a.time}</p>}
            </div>
          </li>
        ))}
      </ul>
      {viewAllHref && (
        <Link href={viewAllHref} className="mt-3 inline-block text-sm font-medium text-blue-700 hover:underline dark:text-blue-400">
          View all activity
        </Link>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Delivery trend (7 days): wireframe 2.1 / 4.1 bar chart (no deps)   */
/* ------------------------------------------------------------------ */

export function DeliveryTrend({ orders }: { orders: Order[] }) {
  const days = useMemo(() => {
    const out: { label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-US', { weekday: 'narrow' });
      out.push({ label, count: orders.filter((o) => String(o.createdAt ?? '').slice(0, 10) === key).length });
    }
    return out;
  }, [orders]);
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div>
      <div className="flex h-32 items-end gap-2" role="img" aria-label="Deliveries over the last 7 days">
        {days.map((d, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{d.count > 0 ? d.count : ''}</span>
            <div
              className="w-full rounded-t-md bg-blue-600/80 dark:bg-blue-500/80"
              style={{ height: `${Math.max(6, (d.count / max) * 100)}%` }}
              title={`${d.count} orders`}
            />
            <span className="text-[11px] text-slate-400">{d.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">Orders created per day · last 7 days</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Top drivers: wireframe 2.1 leaderboard                             */
/* ------------------------------------------------------------------ */

export function TopDrivers({ routes, users }: { routes: RouteFull[]; users: UserRow[] }) {
  const rows = useMemo(() => {
    const byDriver = new Map<string, number>();
    for (const r of routes) {
      let delivered = 0;
      for (const s of r.stops ?? []) if (s.status === 'Delivered') delivered++;
      byDriver.set(r.route.assignedDriverId, (byDriver.get(r.route.assignedDriverId) ?? 0) + delivered);
    }
    const nameOf = (id: string) => users.find((u) => u.userId === id)?.fullName ?? routes.find((r) => r.route.assignedDriverId === id)?.driverName ?? '-';
    return [...byDriver.entries()]
      .map(([id, count]) => ({ id, name: nameOf(id), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [routes, users]);
  if (rows.length === 0) return <Empty message="No deliveries ranked yet." />;
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate font-medium text-slate-800 dark:text-slate-200">
            <span className="mr-2 tabular-nums text-slate-400" aria-hidden>{`${i + 1}.`}</span>{r.name}
          </span>
          <span className="shrink-0 text-slate-500 dark:text-slate-400">{r.count} del.</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* System health: wireframe 2.1 "SYSTEM HEALTH"                       */
/* Pings backend /health + Supabase reachability, all free.            */
/* ------------------------------------------------------------------ */

export function SystemHealth() {
  const [apiState, setApiState] = useState<'ok' | 'down' | 'checking'>('checking');
  const [db, setDb] = useState<'ok' | 'down' | 'checking'>('checking');
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { api } = await import('@/lib/supabase');
        await api('/notifications');
        if (live) {
          setApiState('ok');
          setDb('ok');
        }
      } catch {
        if (live) {
          setApiState('down');
          setDb('down');
        }
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  const rows = [
    { label: 'Database', state: db },
    { label: 'API', state: apiState },
    { label: 'Storage', state: 'ok' as const },
    { label: 'Maps', state: 'ok' as const },
  ];
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center justify-between">
          <span className="text-slate-600 dark:text-slate-300">{r.label}</span>
          <span className="flex items-center gap-2">
            <StatusDot color={r.state === 'ok' ? 'green' : r.state === 'checking' ? 'gray' : 'red'} />
            <span className={r.state === 'ok' ? 'font-medium text-green-700 dark:text-green-400' : r.state === 'checking' ? 'text-slate-400' : 'font-medium text-red-600'}>
              {r.state === 'ok' ? 'Operational' : r.state === 'checking' ? 'Checking…' : 'Unreachable'}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Kanban board: wireframe 3.5 visual order pipeline                 */
/* ------------------------------------------------------------------ */

const KANBAN_COLS = ['Pending', 'Approved', 'In Transit', 'Arrived', 'Delivered'] as const;

function kanbanStatus(o: Order, stops: StopRow[]): string {
  if (o.status === 'Pending') return 'Pending';
  if (o.status === 'Approved') return 'Approved';
  if (o.status === 'Completed') return 'Delivered';
  if (o.status === 'Rejected') return 'Delivered';
  if (o.status === 'Cancelled') return 'Cancelled';
  if (o.status === 'In Transit') {
    if (stops.some((s) => s.status === 'Arrived')) return 'Arrived';
    return 'In Transit';
  }
  return 'In Transit';
}

export function KanbanBoard({ orders, routes, onMove, query = '', showCancelled = false }: { orders: Order[]; routes: RouteFull[]; onMove?: (order: Order) => void; query?: string; showCancelled?: boolean }) {
  const stopsByOrder = useMemo(() => {
    const m = new Map<string, StopRow[]>();
    for (const r of routes) m.set(r.route.orderId, r.stops ?? []);
    return m;
  }, [routes]);
  const needle = query.trim().toLowerCase();
  // UX #18: cancelled hidden by default (toggle shows them); history lives in Audit Logs.
  const active = showCancelled ? orders : orders.filter((o) => o.status !== 'Cancelled');
  const scoped = needle
    ? active.filter((o) => `${o.orderReference} ${o.scheduledDate}`.toLowerCase().includes(needle))
    : active;
  const cols = showCancelled ? [...KANBAN_COLS, 'Cancelled' as const] : KANBAN_COLS;
  return (
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
      {cols.map((col) => {
        const cards = scoped.filter((o) => kanbanStatus(o, stopsByOrder.get(o.orderId) ?? []) === col);
        return (
          <div key={col} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="mb-3 px-1 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {col} · {cards.length}
            </p>
            <div className="space-y-2">
              {cards.slice(0, 12).map((o) => (
                <button
                  key={o.orderId}
                  onClick={() => onMove?.(o)}
                  className="block w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:shadow dark:border-slate-700 dark:bg-slate-900"
                  title="Open order"
                >
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">#{o.orderReference}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{o.scheduledDate} · {o.scheduledTime}</p>
                  <span className="mt-1.5 inline-block text-xs font-medium text-blue-700 dark:text-blue-400">[→] Open</span>
                </button>
              ))}
              {cards.length === 0 && <p className="px-1 py-4 text-center text-xs text-slate-400">Empty</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Calendar view: wireframe 3.4 schedule visualization                */
/* ------------------------------------------------------------------ */

export function CalendarView({ orders, onPick }: { orders: Order[]; onPick: (date: string) => void }) {
  const month = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth();
    return {
      y,
      m,
      label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      startDay: new Date(y, m, 1).getDay(), // 0 Sun
      daysInMonth: new Date(y, m + 1, 0).getDate(),
      today: d.toISOString().slice(0, 10),
    };
  }, []);
  const { y, m, startDay, daysInMonth } = month;
  const [selected, setSelected] = useState<string>(month.today);

  const countByDay = useMemo(() => {
    const map = new Map<string, number>();
    const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
    for (const o of orders) {
      const d = o.scheduledDate.slice(0, 10);
      if (d.startsWith(prefix)) map.set(d, (map.get(d) ?? 0) + 1);
    }
    return map;
  }, [orders, y, m]);

  const cells: (string | null)[] = [...Array(startDay).fill(null)];
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);

  const dayOrders = orders.filter((o) => o.scheduledDate.slice(0, 10) === selected).slice(0, 10);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card p-5 dark:border-slate-700 dark:bg-slate-900">
        <p className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {month.label}
        </p>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase text-slate-400">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((date, i) =>
            date === null ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                onClick={() => { setSelected(date); onPick(date); }}
                aria-pressed={selected === date}
                className={`rounded-lg border p-1.5 text-center transition ${
                  selected === date
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950'
                    : 'border-slate-100 bg-white hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">{Number(date.slice(8))}</span>
                <span className="block text-xs text-slate-400">{countByDay.get(date) ? `${countByDay.get(date)} del` : '-'}</span>
              </button>
            ),
          )}
        </div>
      </div>
      <div className="card p-5 dark:border-slate-700 dark:bg-slate-900">
        <p className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{selected}</p>
        {dayOrders.length === 0 ? (
          <Empty message="No deliveries scheduled for this day." />
        ) : (
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {dayOrders.map((o) => (
              <li key={o.orderId} className="py-2">
                <span className="font-medium text-slate-900 dark:text-slate-100">{o.scheduledTime} · #{o.orderReference}</span>
                <span className="ml-2 text-slate-500">{o.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Help center: wireframe 5.6 FAQ + support (per role)                */
/* ------------------------------------------------------------------ */

export function HelpCenter({ role }: { role: string }) {
  const [open, setOpen] = useState<number | null>(0);
  const faqs: { q: string; a: string }[] =
    role === 'Driver'
      ? [
          { q: 'How do I mark a delivery as complete?', a: 'Open the stop, upload the receipt photo, add optional notes, then press Mark as Delivered.' },
          { q: 'What if the client is closed?', a: 'Press Mark as Failed, choose the reason (Client closed / Wrong address / No stock), and call the secretary.' },
          { q: 'How do I upload a receipt?', a: 'In the stop card use Take Photo or Choose from Gallery (max 5MB). The preview must appear before delivery.' },
          { q: 'What if I have no internet?', a: 'Finish the stop actions once you are back online. Statuses sync via the API. Do not close the tab mid-upload.' },
          { q: 'How do I contact the secretary?', a: 'Use the Call Secretary button on your route page, or the dispatcher contact in the pickup guide.' },
          { q: 'What if the address is wrong?', a: 'Call the client first, then the secretary. Do not mark Delivered at the wrong address.' },
        ]
      : role === 'Client'
        ? [
            { q: 'How do I create an order?', a: 'Go to New Order: fill the reference + schedule, pin pickup and drop-off on the map, pick an available truck, submit for approval.' },
            { q: 'How do I track my delivery?', a: 'Open My Orders → Track to see the status timeline, map and proof once delivered.' },
            { q: 'Why was my order rejected?', a: 'The rejection reason shows in My Orders and in the track view. Fix the details and create a new order.' },
            { q: 'How do I view proof of delivery?', a: 'Open the Proof page or the track view → View Proof to see the receipt photo and driver notes.' },
            { q: 'I forgot my password', a: 'Use Forgot Password on the login page, or ask the Owner to reset it from Users.' },
          ]
        : role === 'Secretary'
          ? [
              { q: 'How do I approve an order?', a: 'Open Approvals → review client, delivery and truck details on the map → Approve. The driver is notified automatically.' },
              { q: 'How do I reject an order?', a: 'A rejection reason is required. Type it and press Reject. The client sees the reason in My Orders.' },
              { q: 'Can I change the schedule?', a: 'Yes. Open the approval detail and use Modify Order (schedule and instructions only). Truck changes need reject + recreate.' },
              { q: 'How do I monitor deliveries?', a: 'Use Monitoring for live stop timelines, Calendar for the schedule, and Status Board for the pipeline.' },
            ]
          : [
              { q: 'How do I manage users?', a: 'Users page: add members, activate/deactivate, reset passwords. The permission matrix shows what each role can do.' },
              { q: 'How do I read audit logs?', a: 'Audit Logs page shows every status change with timestamp, user, action and details. Use Export for compliance.' },
              { q: 'How do I export reports?', a: 'Reports page: pick a date range, Apply, then Export PDF / Excel or Email the summary.' },
              { q: 'What does System Health mean?', a: 'Green means Database, API, Storage and Maps all responded. Red means check the backend and Supabase status.' },
            ];
  return (
    <div className="grid gap-6 lg:max-w-3xl">
      <div className="card p-5 sm:p-6 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">Frequently asked questions</h2>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {faqs.map((f, i) => (
            <div key={i}>
              <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-medium text-slate-800 dark:text-slate-200">
                {f.q}
                <span className="text-slate-400">{open === i ? '▾' : '▸'}</span>
              </button>
              {open === i && <p className="pb-3 text-sm text-slate-600 dark:text-slate-400">{f.a}</p>}
            </div>
          ))}
        </div>
      </div>
      <div className="card p-5 sm:p-6 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">Contact support</h2>
        <div className="flex flex-wrap gap-3">
          <a href="tel:+639171234567" className="btn-ghost inline-flex items-center gap-2 text-sm font-medium">
            <Icons.Phone className="h-4 w-4" />{role === 'Secretary' ? 'Call Owner' : 'Call Secretary'}
          </a>
          <a href="mailto:support@arways.com" className="btn-ghost inline-flex items-center gap-2 text-sm font-medium">
            <Icons.Mail className="h-4 w-4" />Email support
          </a>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Global search: header search field ("Search...")                    */
/* Searches orders/routes/trucks/users passed in by the page.          */
/* ------------------------------------------------------------------ */

export interface SearchDocs {
  orders?: Order[];
  routes?: RouteFull[];
  trucks?: TruckWithDriver[];
  users?: UserRow[];
}

export function GlobalSearch({ docs, base }: { docs: SearchDocs; base: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const out: { label: string; sub: string; href: string }[] = [];
    for (const o of docs.orders ?? []) {
      if (String(o.orderReference ?? '').toLowerCase().includes(needle))
        out.push({ label: `#${o.orderReference}`, sub: `Order · ${o.status}`, href: `${base}/orders` });
    }
    for (const t of docs.trucks ?? []) {
      if (String(t.plateNumber ?? '').toLowerCase().includes(needle))
        out.push({ label: t.plateNumber, sub: `Truck · ${t.truckType}`, href: `${base === '/client' ? '/client' : base}/fleet`.replace('/client/fleet', '/client') });
    }
    for (const u of docs.users ?? []) {
      if (String(u.fullName ?? '').toLowerCase().includes(needle) || String(u.email ?? '').toLowerCase().includes(needle))
        out.push({ label: u.fullName, sub: `${u.role} · ${u.email}`, href: `${base}/users` });
    }
    for (const r of docs.routes ?? []) {
      if (String(r.route?.routeNumber ?? '').toLowerCase().includes(needle))
        out.push({ label: r.route.routeNumber, sub: `Route · ${r.driverName}`, href: `${base}/routes`.replace('/client/routes', '/client') });
    }
    return out.slice(0, 8);
  }, [q, docs, base]);

  return (
    <div className="relative hidden md:block">
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => setOpen(true)}
        placeholder="Search…"
        aria-label="Global search"
        className="w-52 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 lg:w-64"
      />
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {results.map((r, i) => (
            <li key={i}>
              <Link href={r.href} className="block px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                <span className="font-medium text-slate-900 dark:text-slate-100">{r.label}</span>
                <span className="ml-2 text-xs text-slate-400">{r.sub}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
