'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { Card, Empty } from '@/components/saas';
import { api } from '@/lib/supabase';
import type { Order } from '@/lib/types';

/** Wireframe 4.4 index: pick an order, then open its live track view. */
export default function ClientTrackListPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    api<Order[]>('/orders').then(setOrders).catch(() => {});
  }, []);

  const visible = orders.filter((o) => !q.trim() || o.orderReference.toLowerCase().includes(q.toLowerCase()));

  return (
    <Shell role="Client" title="Track Orders">
      <Card title={`My shipments (${visible.length})`} action={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reference…" aria-label="Search orders" className="w-48 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900" />}>
        {visible.length === 0 ? (
          <Empty message="No orders to track yet." cta={<Link href="/client/new" className="btn-primary text-sm">Create order</Link>} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((o) => (
              <li key={o.orderId} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">#{o.orderReference}</p>
                  <p className="text-xs text-slate-500">{o.status} · {o.scheduledDate} {o.scheduledTime}</p>
                </div>
                <Link href={`/client/track/${o.orderId}`} className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white dark:bg-white dark:text-slate-900">
                  Track →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Shell>
  );
}
