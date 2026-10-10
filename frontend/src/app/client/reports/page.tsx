'use client';
import { useEffect, useMemo, useState } from 'react';
import { Shell, Stat } from '@/components/Shell';
import { Card, DeliveryTrend } from '@/components/saas';
import { api } from '@/lib/supabase';
import { useRealtime } from '@/lib/realtime';
import { Icons } from '@/lib/createLucideIcon';
import type { Order } from '@/lib/types';

/** Wireframe 4.6: Client "My Reports" (own orders only; no backend role needed). */
export default function ClientReportsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    api<Order[]>('/orders').then(setOrders).catch(() => {});
  }, []);
  useRealtime('orders', () => {
    api<Order[]>('/orders').then(setOrders).catch(() => {});
  });

  const scoped = useMemo(() => {
    return orders.filter((o) => {
      const day = String(o.createdAt ?? '').slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [orders, from, to]);

  const total = scoped.length;
  const delivered = scoped.filter((o) => o.status === 'Completed').length;
  // Roadmap #11: this page has no stop data, so "Failed" only ever counted
  // Rejected orders — label it honestly and keep the by-status list truthful.
  const rejected = scoped.filter((o) => o.status === 'Rejected').length;
  // Honest label: without stop time-window data this page can only show the
  // share delivered, not true on-time-vs-window performance (see Owner reports).
  const deliveryRate = total ? Math.round((delivered / total) * 100) : 0;

  function exportCsv() {
    import('xlsx').then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(scoped.map((o) => ({ reference: o.orderReference, status: o.status, scheduled: o.scheduledDate, created: o.createdAt.slice(0, 10) })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'My Orders');
      XLSX.writeFile(wb, 'my-delivery-report.xlsx');
    });
  }

  return (
    <Shell role="Client" title="My Reports">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="text-sm">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
        <label className="text-sm">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
        <button onClick={exportCsv} className="btn-ghost inline-flex items-center gap-2 text-sm"><Icons.Download className="h-4 w-4" />Export Excel</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total orders" value={total} tone="blue" />
        <Stat label="Delivered" value={`${delivered} (${deliveryRate}%)`} tone="green" />
        <Stat label="Rejected orders" value={rejected} tone="amber" />
        <Stat label="Delivery rate" value={`${deliveryRate}%`} tone="green" />
      </div>
      <p className="mt-2 text-xs text-slate-400">Rejected counts orders the secretary declined. Failed delivery stops appear on the Track page per stop.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Delivery trend">
          <DeliveryTrend orders={scoped} />
        </Card>
        <Card title="Deliveries by status">
          <ul className="space-y-2 text-sm">
            {(['Completed', 'In Transit', 'Approved', 'Pending', 'Rejected'] as const).map((s) => {
              const n = scoped.filter((o) => o.status === s).length;
              const pct = total ? Math.round((n / total) * 100) : 0;
              return (
                <li key={s}>
                  <div className="mb-1 flex justify-between"><span>{s}</span><span className="text-slate-500">{n}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </Shell>
  );
}
