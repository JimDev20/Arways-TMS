'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/Shell';
import { Card, Empty } from '@/components/saas';
import { api } from '@/lib/supabase';
import { useRealtime } from '@/lib/realtime';
import { Icons } from '@/lib/createLucideIcon';
import type { NotificationItem, Order, RouteFull } from '@/lib/types';

interface LogRow {
  id: string;
  time: string;
  user: string;
  action: string;
  details: string;
  oldValue?: string;
  newValue?: string;
}

/**
 * Wireframe 2.5: Audit logs (Owner only).
 * No dedicated backend table exists, so the log is derived from the
 * system of record: orders (create/approve/reject/status), stops
 * (arrive/depart/deliver/fail) and notifications (login/alerts).
 */
export default function OwnerAuditPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [routes, setRoutes] = useState<RouteFull[]>([]);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [q, setQ] = useState('');
  const [action, setAction] = useState('All');
  const [selected, setSelected] = useState<LogRow | null>(null);

  const load = useCallback(() => {
    api<Order[]>('/orders').then(setOrders).catch(() => {});
    api<RouteFull[]>('/routes').then(setRoutes).catch(() => {});
    api<NotificationItem[]>('/notifications').then(setNotifs).catch(() => {});
  }, []);
  useEffect(() => {
    api<Order[]>('/orders').then(setOrders).catch(() => {});
    api<RouteFull[]>('/routes').then(setRoutes).catch(() => {});
    api<NotificationItem[]>('/notifications').then(setNotifs).catch(() => {});
  }, []);
  useRealtime('orders', load);
  useRealtime('stops', load);

  const rows: LogRow[] = useMemo(() => {
    const out: LogRow[] = [];
    for (const o of orders) {
      out.push({
        id: `create-${o.orderId}`,
        time: String(o.createdAt ?? '').slice(0, 16).replace('T', ' '),
        user: 'Client',
        action: 'CREATE',
        details: `Order ${o.orderReference} created`,
        newValue: o.status,
      });
      if (o.status === 'Approved' || o.status === 'In Transit' || o.status === 'Completed') {
        out.push({
          id: `approve-${o.orderId}`,
          time: String(o.updatedAt ?? o.createdAt ?? '').slice(0, 16).replace('T', ' '),
          user: 'Secretary',
          action: 'APPROVE',
          details: `Order ${o.orderReference} approved`,
          oldValue: 'Pending',
          newValue: o.status,
        });
      }
      if (o.status === 'Rejected') {
        out.push({
          id: `reject-${o.orderId}`,
          time: String(o.updatedAt ?? o.createdAt ?? '').slice(0, 16).replace('T', ' '),
          user: 'Secretary',
          action: 'REJECT',
          details: `Order ${o.orderReference}: ${o.rejectionReason ?? 'rejected'}`,
          oldValue: 'Pending',
          newValue: 'Rejected',
        });
      }
      if (o.status === 'Cancelled') {
        out.push({
          id: `cancel-${o.orderId}`,
          time: String(o.updatedAt ?? o.createdAt ?? '').slice(0, 16).replace('T', ' '),
          user: 'Owner',
          action: 'CANCEL',
          details: `Order ${o.orderReference}: ${o.rejectionReason ?? 'cancelled'}`,
          newValue: 'Cancelled',
        });
      }
    }
    for (const r of routes) {
      for (const s of r.stops ?? []) {
        if (s.status === 'Delivered' || s.status === 'Arrived' || s.status === 'Departed' || s.status === 'Failed') {
          out.push({
            id: `stop-${s.stopId}`,
            time: String(s.deliveredAt ?? s.arrivedAt ?? '').slice(0, 16).replace('T', ' ') || '-',
            user: r.driverName ?? 'Driver',
            action: 'UPDATE',
            details: `${s.stopType} ${s.locationAddress} → ${s.status}`,
            newValue: s.status,
          });
        }
      }
    }
    for (const n of notifs.slice(0, 30)) {
      out.push({
        id: `notif-${n.notificationId}`,
        time: String(n.createdAt ?? '').slice(0, 16).replace('T', ' '),
        user: 'System',
        action: 'NOTIFY',
        details: String(n.message ?? ''),
      });
    }
    return out.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 200);
  }, [orders, routes, notifs]);

  const filtered = rows.filter((r) => {
    if (action !== 'All' && r.action !== action) return false;
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return `${r.user} ${r.action} ${r.details}`.toLowerCase().includes(needle);
  });

  function exportCsv() {
    const csv = ['timestamp,user,action,details', ...filtered.map((r) => [r.time, r.user, r.action, `"${r.details.replace(/"/g, '""')}"`].join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-logs.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Shell role="Owner" title="Audit Logs">
      <Card
        title={`Audit trail (${filtered.length})`}
        action={<button onClick={exportCsv} className="btn-ghost inline-flex items-center gap-2 text-sm font-medium"><Icons.Download className="h-4 w-4" />Export logs</button>}
      >
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search logs…"
            aria-label="Search audit logs"
            className="field sm:max-w-xs"
          />
          <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
            {['All', 'CREATE', 'APPROVE', 'REJECT', 'CANCEL', 'UPDATE', 'NOTIFY'].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        {filtered.length === 0 ? (
          <Empty message="No audit entries match your filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-semibold">Timestamp</th>
                  <th className="px-4 py-2 font-semibold">User</th>
                  <th className="px-4 py-2 font-semibold">Action</th>
                  <th className="px-4 py-2 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.slice(0, 50).map((r) => (
                  <tr key={r.id} onClick={() => setSelected(r)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <td className="whitespace-nowrap px-4 py-2 text-slate-500">{r.time}</td>
                    <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">{r.user}</td>
                    <td className="px-4 py-2"><span className="status-pill status-Pending">{r.action}</span></td>
                    <td className="max-w-md truncate px-4 py-2 text-slate-600 dark:text-slate-300">{r.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <div className="mt-6">
          <Card title="Log details">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <dt className="text-slate-500">Timestamp</dt><dd className="font-medium text-slate-900 dark:text-slate-100">{selected.time}</dd>
              <dt className="text-slate-500">User</dt><dd className="font-medium text-slate-900 dark:text-slate-100">{selected.user}</dd>
              <dt className="text-slate-500">Action</dt><dd className="font-medium text-slate-900 dark:text-slate-100">{selected.action}</dd>
              <dt className="text-slate-500">Details</dt><dd className="font-medium text-slate-900 dark:text-slate-100">{selected.details}</dd>
              {selected.oldValue && (<><dt className="text-slate-500">Old value</dt><dd>{selected.oldValue}</dd></>)}
              {selected.newValue && (<><dt className="text-slate-500">New value</dt><dd>{selected.newValue}</dd></>)}
            </dl>
            <button onClick={() => setSelected(null)} className="btn-ghost mt-4 text-sm">Close details</button>
          </Card>
        </div>
      )}
    </Shell>
  );
}
