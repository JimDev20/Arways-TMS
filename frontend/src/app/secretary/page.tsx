'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell, Stat } from '@/components/Shell';
import { api } from '@/lib/supabase';
import { useRealtime } from '@/lib/realtime';
import { Icons } from '@/lib/createLucideIcon';
import { errorMessage, type Order, type RouteFull } from '@/lib/types';
import { PriorityBadge } from '@/components/PriorityBadge';

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function SecretaryDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [routes, setRoutes] = useState<RouteFull[]>([]);
  const load = useCallback(() => {
    api<Order[]>('/orders').then(setOrders).catch(() => {});
    api<RouteFull[]>('/routes').then(setRoutes).catch(() => {});
  }, []);
  useEffect(() => {
    api<Order[]>('/orders').then(setOrders).catch(() => {});
    api<RouteFull[]>('/routes').then(setRoutes).catch(() => {});
  }, []);
  useRealtime('orders', load);
  useRealtime('stops', load);

  const today = todayStr();
  const isToday = (iso?: string) => (iso ?? '').slice(0, 10) === today;
  const pending = orders.filter((o) => o.status === 'Pending');
  const routeByOrder = new Map(routes.map((r) => [r.route.orderId, r]));
  const approvedToday = routes.filter((r) => r.route.status === 'In Progress' || r.orderStatus === 'Approved');
  const failedStops = routes.flatMap((r) =>
    (r.stops ?? []).filter((s) => s.status === 'Failed').map((s) => ({ ...s, routeNumber: r.route.routeNumber })),
  );

  return (
    <Shell role="Secretary" title="Dashboard">
      {failedStops.length > 0 && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm font-semibold text-red-700">Needs attention: {failedStops.length} failed stop{failedStops.length === 1 ? '' : 's'}</p>
          <ul className="mt-1 space-y-0.5 text-sm text-red-600">
            {failedStops.slice(0, 3).map((s) => <li key={s.stopId}>{s.routeNumber} · {s.locationAddress}</li>)}
          </ul>
          <Link href="/secretary/monitoring?filter=attention" className="mt-2 inline-block text-sm font-medium text-red-700 hover:underline">Open monitoring →</Link>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pending Approval" value={pending.length} tone="amber" />
        <Stat label="Approved Today" value={orders.filter((o) => o.status === 'Approved' && isToday(o.createdAt)).length} tone="blue" />
        <Stat label="In Transit" value={orders.filter((o) => o.status === 'In Transit').length} tone="blue" />
        <Stat label="Delivered Today" value={orders.filter((o) => o.status === 'Completed' && isToday(o.updatedAt ?? o.createdAt)).length} tone="green" />
      </div>

      {/* Pending Approvals */}
      <div className="mt-6 rounded-xl bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icons.CheckCircle className="h-5 w-5 text-slate-400" />
              <h2 className="text-lg font-semibold text-slate-900">Pending Approvals</h2>
            </div>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              {pending.length} pending
            </span>
          </div>
        </div>
        <div className="p-6">
          {pending.length > 0 ? (
            <div className="space-y-4">
              {pending.map((o) => (
                <ApprovalCard key={o.orderId} order={o} route={routeByOrder.get(o.orderId) ?? null} onDone={load} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <p className="mt-2 text-sm">No pending approvals</p>
            </div>
          )}
        </div>
      </div>

      {/* Today's Approved Routes */}
      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Today&apos;s Approved Routes</h2>
          <Link href="/secretary/monitoring" className="text-sm font-medium text-[#0e7a70] hover:underline">Monitor all</Link>
        </div>
        {approvedToday.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No approved routes yet today.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {approvedToday.slice(0, 8).map((r) => (
              <li key={r.route.routeId} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium text-slate-900">{r.route.routeNumber} · {r.driverName} ({r.stops.length} stops)</span>
                <span className="text-slate-500">{r.route.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}

export function ApprovalCard({ order, route, onDone }: { order: Order; route: RouteFull | null; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  async function approve() {
    setIsApproving(true); setMsg(null);
    try {
      await api(`/orders/${order.orderId}/approve`, { method: 'PATCH' });
      setMsg({ type: 'success', text: `Order ${order.orderReference} approved. The driver was notified.` });
      onDone();
    } catch (e: unknown) {
      setMsg({ type: 'error', text: errorMessage(e, 'Could not approve. Try again.') });
    } finally {
      setIsApproving(false);
    }
  }

  async function reject() {
    if (!reason.trim()) {
      setMsg({ type: 'error', text: 'A rejection reason is required. Type why this order is rejected, then press Reject again.' });
      return;
    }
    setIsRejecting(true); setMsg(null);
    try {
      await api(`/orders/${order.orderId}/reject`, { method: 'PATCH', body: JSON.stringify({ reason: reason.trim() }) });
      setMsg({ type: 'success', text: `Order ${order.orderReference} rejected. The client was notified.` });
      onDone();
      setReason('');
    } catch (e: unknown) {
      setMsg({ type: 'error', text: errorMessage(e, 'Could not reject. Try again.') });
    } finally {
      setIsRejecting(false);
    }
  }

  const pickup = route?.stops.find((s) => s.stopType === 'Pickup');
  const dropoff = route?.stops.find((s) => s.stopType === 'Dropoff');

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">#{order.orderReference}</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              order.status === 'Pending' ? 'bg-amber-50 text-amber-700' :
              order.status === 'Approved' ? 'bg-green-50 text-green-700' :
              'bg-red-50 text-red-700'
            }`}>
              {order.status}
            </span>
            <PriorityBadge priority={order.priority} />
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Scheduled: {order.scheduledDate} at {order.scheduledTime}
          </p>
          {route ? (
            <div className="mt-2 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
              <p>Location: {pickup?.locationAddress ?? '-'}{dropoff ? ` → ${dropoff.locationAddress}` : ''}</p>
              <p>Truck: {route.truckPlate} · Driver: {route.driverName}</p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-400">Route details load after approval.</p>
          )}
        </div>
        <Link href={`/secretary/approvals/${order.orderId}`}
          className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          View Details
        </Link>
      </div>
      {msg && (
        <div className={`mt-3 rounded-lg px-4 py-2.5 text-sm flex items-center gap-2 ${msg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}
          role={msg.type === 'error' ? 'alert' : 'status'}>
          {msg.type === 'error' ? <Icons.AlertCircle className="h-4 w-4 shrink-0" /> : <Icons.CheckCircle className="h-4 w-4 shrink-0" />}
          {msg.text}
        </div>
      )}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
        <button
          onClick={approve}
          disabled={isApproving}
          className="flex-1 rounded-lg bg-[#0e7a70] py-2.5 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b625a] disabled:opacity-60"
        >
          {isApproving ? 'Approving...' : 'Approve'}
        </button>
        <div className="flex-1">
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
            placeholder="Rejection reason (required to reject)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isRejecting}
            aria-label={`Rejection reason for ${order.orderReference}`}
          />
        </div>
        <button
          onClick={reject}
          disabled={isRejecting}
          className="flex-1 rounded-lg border border-red-200 bg-white py-2.5 px-4 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          {isRejecting ? 'Rejecting...' : 'Reject'}
        </button>
      </div>
    </div>
  );
}
