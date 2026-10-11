'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/supabase';
import { ListSkeleton } from '@/components/saas';
import { useRealtime } from '@/lib/realtime';
import { Icons } from '@/lib/createLucideIcon';
import { SearchField } from '@/components/SearchField';
import type { Order } from '@/lib/types';

export default function OwnerApprovalsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    api<Order[]>('/orders?status=Pending').then(setOrders).catch(() => {});
  }, []);
  useEffect(() => {
    api<Order[]>('/orders?status=Pending').then(setOrders).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useRealtime('orders', load);

  const [q, setQ] = useState('');
  const filtered = orders.filter((o) =>
    !q.trim() ||
    `${o.orderReference} ${o.scheduledDate}`.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <Shell role="Owner" title="Order Approvals">
      <SearchField
        value={q}
        onChange={setQ}
        placeholder="Search by reference or date (YYYY-MM-DD)…"
        label="Search approval queue"
        className="mb-4"
        inputClassName="block w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-9 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
      />
      {loading ? (
        <ListSkeleton rows={3} />
      ) : filtered.length > 0 ? (
        <div className="rounded-xl bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icons.CheckCircle className="h-5 w-5 text-slate-400" />
                <h2 className="text-lg font-semibold text-slate-900">Approval Queue</h2>
              </div>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700" role="status">
                {filtered.length} of {orders.length} pending
              </span>
            </div>
          </div>
          <ul className="divide-y divide-slate-100">
            {filtered.map((o) => (
              <li key={o.orderId} className="flex items-center justify-between gap-3 px-6 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">#{o.orderReference}</p>
                  <p className="text-xs text-slate-500">{o.scheduledDate} at {o.scheduledTime}</p>
                </div>
                <Link
                  href={`/owner/approvals/${o.orderId}`}
                  className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white dark:bg-white dark:text-slate-900"
                >
                  Review →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 py-16 text-center">
          <h3 className="mt-4 text-lg font-semibold text-slate-900">No pending approvals</h3>
          <p className="mt-2 text-sm text-slate-500">{orders.length === 0 ? 'All caught up!' : 'No approvals match. Try a different search.'}</p>
          {orders.length > 0 && (
            <button onClick={() => setQ('')} className="btn-ghost mt-3 text-sm">Clear filter</button>
          )}
        </div>
      )}
    </Shell>
  );
}
