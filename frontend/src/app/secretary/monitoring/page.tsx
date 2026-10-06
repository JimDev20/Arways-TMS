'use client';
import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/supabase';
import { useRealtime } from '@/lib/realtime';
import { Icons } from '@/lib/createLucideIcon';
import { errorMessage, type RouteFull, type StopRow } from '@/lib/types';

const STATUS_FILTERS = ['All', 'Pending', 'In Progress', 'Completed'];

function stopTime(s: StopRow): string {
  const t = s.deliveredAt ?? s.departedAt ?? s.arrivedAt;
  return t ? t.slice(11, 16) : '';
}

export default function MonitoringPage() {
  const [routes, setRoutes] = useState<RouteFull[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All');
  const [driver, setDriver] = useState('All');
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    api<RouteFull[]>('/routes').then((r) => {
      setRoutes(r);
      setErr('');
    }).catch((e: unknown) => {
      setErr(errorMessage(e, 'Could not load routes.'));
    });
  }, []);
  useEffect(() => {
    api<RouteFull[]>('/routes').then((r) => {
      setRoutes(r);
      setErr('');
    }).catch((e: unknown) => {
      setErr(errorMessage(e, 'Could not load routes.'));
    });
  }, []);
  useRealtime('orders', load);
  useRealtime('stops', load);

  const drivers = [...new Set(routes.map((r) => r.driverName))].sort();
  const filtered = routes.filter((r) => {
    if (status !== 'All' && r.route.status !== status) return false;
    if (driver !== 'All' && r.driverName !== driver) return false;
    if (q && !`${r.route.routeNumber} ${r.orderReference} ${r.driverName} ${r.truckPlate}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <Shell role="Secretary" title="Delivery Monitoring (live)">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Icons.Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            className="block w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm focus:border-[#f5a623] focus:outline-none focus:ring-1 focus:ring-[#f5a623]"
            placeholder="Search route, order, driver, truck…"
            value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search routes"
          />
        </div>
        <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          {STATUS_FILTERS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={driver} onChange={(e) => setDriver(e.target.value)} aria-label="Filter by driver">
          <option>All</option>
          {drivers.map((d) => <option key={d}>{d}</option>)}
        </select>
        <span className="text-xs text-slate-500">{filtered.length} of {routes.length}</span>
      </div>
      {err && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{err}</div>}

      <div className="grid gap-4">
        {filtered.map((r) => {
          const done = r.stops.filter((s) => ['Delivered', 'Failed'].includes(s.status)).length;
          const total = r.stops.length;
          const pct = total ? Math.round((done / total) * 100) : 0;
          return (
            <div key={r.route.routeId} className="rounded-xl bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  {r.route.routeNumber} · {r.driverName} · {r.truckPlate}
                </h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  r.route.status === 'Completed' ? 'bg-green-50 text-green-700' :
                  r.route.status === 'In Progress' ? 'bg-blue-50 text-blue-700' :
                  'bg-slate-100 text-slate-600'
                }`}>{r.route.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Order {r.orderReference} ({r.orderStatus})</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Dispatch arrived: {r.route.dispatchedArrivedAt ? String(r.route.dispatchedArrivedAt).slice(11, 16) : '-'}</span>
                <span>· Left: {r.route.dispatchedLeftAt ? String(r.route.dispatchedLeftAt).slice(11, 16) : '-'}</span>
                {r.route.dispatchLeftPhotoUrl && (
                  <a href={r.route.dispatchLeftPhotoUrl} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-slate-50">
                    <Icons.Proof className="h-3.5 w-3.5" />View waybill photo
                  </a>
                )}
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${r.route.routeNumber} progress`}>
                <span className="block h-full rounded bg-[#f5a623]" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-500">Progress: {done}/{total} done</p>
              <ol className="mt-3 space-y-0">
                {r.stops.map((s, i: number) => (
                  <li key={s.stopId} className="flex gap-3">
                    <span className="flex flex-col items-center">
                      <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${
                        s.status === 'Delivered' ? 'bg-green-500' :
                        s.status === 'Failed' ? 'bg-red-500' :
                        ['Arrived', 'Departed'].includes(s.status) ? 'bg-blue-500' : 'bg-slate-300'
                      }`} />
                      {i < r.stops.length - 1 && <span className="w-px flex-1 bg-slate-200" />}
                    </span>
                    <span className="pb-3 text-sm">
                      <span className="font-medium text-slate-900">#{s.stopSequence} {s.stopType}</span>
                      <span className="text-slate-500"> · {s.locationAddress} · {s.status}{stopTime(s) ? ` at ${stopTime(s)}` : ''}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
        {filtered.length === 0 && !err && (
          <p className="rounded-xl bg-white py-10 text-center text-sm text-slate-400 shadow-sm">No routes match. Try a different search or filter.</p>
        )}
      </div>
    </Shell>
  );
}
