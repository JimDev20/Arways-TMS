'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Shell, Stat } from '@/components/Shell';
import { coordsOf, type MapPin } from '@/lib/map';
import { ActivityFeed, Card, DeliveryTrend, SystemHealth, TopDrivers, buildActivity } from '@/components/saas';
import { api } from '@/lib/supabase';
import { useRealtime } from '@/lib/realtime';
import { Icons } from '@/lib/createLucideIcon';
import type { Order, RouteFull, StorageSummary, UserRow } from '@/lib/types';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

const MapView = dynamic(() => import('@/components/MapView').then((m) => m.MapView), { ssr: false });

/** Wireframe 2.1: Owner dashboard (SaaS style). */
export default function OwnerDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [routes, setRoutes] = useState<RouteFull[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [storage, setStorage] = useState<StorageSummary | null>(null);
  // Roadmap #15 / UX #15: map filter actually filters (was a no-op button).
  const [mapFilter, setMapFilter] = useState<'all' | 'active'>('all');
  const load = useCallback(() => {
    api<Order[]>('/orders').then(setOrders).catch(() => {});
    api<RouteFull[]>('/routes').then(setRoutes).catch(() => {});
    api<UserRow[]>('/users').then(setUsers).catch(() => {});
    api<StorageSummary>('/reports/storage').then(setStorage).catch(() => {});
  }, []);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [o, r, u] = await Promise.all([
          api<Order[]>('/orders'),
          api<RouteFull[]>('/routes'),
          api<UserRow[]>('/users'),
        ]);
        if (live) {
          setOrders(o);
          setRoutes(r);
          setUsers(u);
        }
      } catch {
        /* dashboard stays empty: realtime will fill in */
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  useRealtime('orders', load);
  useRealtime('stops', load);

  const today = new Date().toISOString().slice(0, 10);
  const c = {
    today: orders.filter((o) => (o.createdAt ?? '').slice(0, 10) === today).length,
    pending: orders.filter((o) => o.status === 'Pending').length,
    transit: orders.filter((o) => o.status === 'In Transit' || o.status === 'Approved').length,
    delivered: orders.filter((o) => o.status === 'Completed').length,
  };
  // Revenue is an estimate until billing (F4) exists: rate lives in Settings.
  // Roadmap #12: never present it as real revenue.
  const revenue = c.delivered * 850;

  const pins: MapPin[] = [];
  for (const r of routes) {
    if (mapFilter === 'active' && !['Pending', 'In Progress'].includes(r.route.status)) continue;
    for (const s of r.stops ?? []) {
      const c = coordsOf(s.locationCoordinates);
      if (c) pins.push({ ...c, label: `${r.route.routeNumber} · ${s.stopType} · ${s.locationAddress}` });
    }
  }
  const active = routes.filter((r) => ['Pending', 'In Progress'].includes(r.route.status)).slice(0, 5);
  const recent = [...orders].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))).slice(0, 5);
  const pending = orders.filter((o) => o.status === 'Pending').slice(0, 5);
  const activity = buildActivity(orders, routes);
  // Placement doc: Needs attention first — failed stops dispatchers must see.
  const failedStops = routes.flatMap((r) =>
    (r.stops ?? []).filter((s) => s.status === 'Failed').map((s) => ({ ...s, routeNumber: r.route.routeNumber })),
  );

  return (
    <Shell role="Owner" title="Owner Dashboard">
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>

      {failedStops.length > 0 && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm font-semibold text-red-700">Needs attention: {failedStops.length} failed stop{failedStops.length === 1 ? '' : 's'}</p>
          <ul className="mt-1 space-y-0.5 text-sm text-red-600">
            {failedStops.slice(0, 3).map((s) => <li key={s.stopId}>{s.routeNumber} · {s.locationAddress}</li>)}
          </ul>
          <Link href="/owner/routes" className="mt-2 inline-block text-sm font-medium text-red-700 hover:underline">Review routes →</Link>
        </div>
      )}
      {/* Stat cards: wireframe 2.1: Today · Pending · In Transit · Delivered · Revenue (estimate) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Today's Orders" value={c.today} tone="blue" />
        <Stat label="Pending" value={c.pending} tone="amber" />
        <Stat label="In Transit" value={c.transit} tone="blue" />
        <Stat label="Delivered" value={c.delivered} tone="green" />
        <Stat label="Revenue (estimate)" value={`₱${revenue.toLocaleString()}`} tone="green" />
      </div>

      {/* Delivery map + real-time activity */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title={`Delivery map${pins.length > 0 ? ` (${pins.length} stops)` : ''}`} action={<Link href="/owner/routes" className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400">View routes</Link>}>
          {pins.length > 0 ? (
            <MapView pins={pins} />
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">No stops with coordinates yet. Pins appear once orders have map locations.</p>
          )}
          <div className="mt-3 flex gap-2 text-xs">
            <button
              onClick={() => setMapFilter((f) => (f === 'all' ? 'active' : 'all'))}
              aria-pressed={mapFilter === 'active'}
              className="btn-ghost px-3 py-1 text-xs"
            >
              {mapFilter === 'all' ? 'Show active only' : 'Show all'}
            </button>
            <button onClick={load} className="btn-ghost px-3 py-1 text-xs">Refresh</button>
          </div>
        </Card>
        <Card title="Real-time activity" action={<Link href="/owner/audit" className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400">Audit logs</Link>}>
          <ActivityFeed items={activity} />
        </Card>
      </div>

      {/* Trend + top drivers */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Delivery trend (7 days)">
          <DeliveryTrend orders={orders} />
        </Card>
        <Card title="Top drivers" action={<Link href="/owner/reports" className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400">View all drivers</Link>}>
          <TopDrivers routes={routes} users={users} />
        </Card>
      </div>

      {/* Pending approval + system health */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Pending secretary approval" action={<Link href="/owner/approvals" className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400">View all pending</Link>}>
          {pending.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Nothing waiting for approval.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {pending.map((o) => (
                <li key={o.orderId} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-medium text-slate-900 dark:text-slate-100">#{o.orderReference} · {o.scheduledDate}</span>
                  <Link href={`/owner/approvals/${o.orderId}`} className="font-medium text-blue-700 hover:underline dark:text-blue-400">Review</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="System health">
          <SystemHealth />
        </Card>
      </div>

      {/* Photo storage vs free quota */}
      <div className="mt-6">
        <Card
          title="Photo Storage"
          action={<Link href="/owner/proof" className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400">View proof</Link>}
        >
          {!storage ? (
            <p className="py-4 text-center text-sm text-slate-400">Loading storage usage…</p>
          ) : (
            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {formatBytes(storage.bytes)} <span className="font-normal text-slate-500">of {formatBytes(storage.quotaBytes)} free</span>
                </span>
                <span className="text-slate-500">{storage.files} photos{storage.oldest ? ` · oldest ${storage.oldest.slice(0, 10)}` : ''}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded bg-slate-100 dark:bg-slate-800" role="progressbar"
                aria-valuenow={Math.round((storage.bytes / storage.quotaBytes) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Photo storage used">
                <span
                  className={`block h-full rounded ${storage.bytes / storage.quotaBytes > 0.8 ? 'bg-red-500' : 'bg-[#0e7a70]'}`}
                  style={{ width: `${Math.min(100, (storage.bytes / storage.quotaBytes) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-400">Receipt and waybill photos are kept for 2 years (see Reports › Storage).</p>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Active Routes */}
        <div className="card p-6 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Active Routes</h2>
            <Link href="/owner/routes" className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400">View all</Link>
          </div>
          {active.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No active routes right now.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {active.map((r) => (
                <li key={r.route.routeId} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-medium text-slate-900 dark:text-slate-100">{r.route.routeNumber} · {r.driverName}</span>
                  <span className="text-slate-500">{r.route.status} · {r.stops.length} stops</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent Updates */}
        <div className="card p-6 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recent Updates</h2>
            <Link href="/owner/orders" className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400">View all</Link>
          </div>
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {recent.map((o) => (
                <li key={o.orderId} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-medium text-slate-900 dark:text-slate-100">{o.orderReference}</span>
                  <span className="text-slate-500">{o.status} · {(o.createdAt ?? '').slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recent Orders */}
      <div className="card mt-6 dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Icons.Package className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recent Orders</h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-6 py-3 font-semibold">Reference</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold">Scheduled</th>
                <th className="px-6 py-3 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {orders.slice(0, 20).map((o) => (
                <tr key={o.orderId} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-100">{o.orderReference}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                      o.status === 'Pending' ? 'bg-amber-50 text-amber-700' :
                      o.status === 'Approved' ? 'bg-blue-50 text-blue-700' :
                      o.status === 'In Transit' ? 'bg-blue-50 text-blue-700' :
                      o.status === 'Completed' ? 'bg-green-50 text-green-700' :
                      'bg-red-50 text-red-700'
                    }`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-slate-600 dark:text-slate-300">{o.scheduledDate}</td>
                  <td className="px-6 py-3 text-slate-600 dark:text-slate-300">{o.createdAt?.slice(0, 10)}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <p>No orders yet</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
