'use client';
import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/supabase';
import { useRealtime } from '@/lib/realtime';
import { Icons } from '@/lib/createLucideIcon';
import { ApprovalCard } from '@/app/secretary/page';
import type { Order } from '@/lib/types';

export default function ApprovalsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [q, setQ] = useState('');
  const load = useCallback(() => {
    api<Order[]>('/orders?status=Pending').then(setOrders).catch(() => {});
  }, []);
  useEffect(() => {
    api<Order[]>('/orders?status=Pending').then(setOrders).catch(() => {});
  }, []);
  useRealtime('orders', load);

  const filtered = orders.filter((o) =>
    !q.trim() ||
    `${o.orderReference} ${o.scheduledDate}`.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <Shell role="Secretary" title="Order Approvals">
      <div className="relative mb-4">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Icons.Search className="h-4 w-4 text-slate-400" />
        </div>
        <input
          className="block w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
          placeholder="Search reference or date…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search approval queue"
        />
      </div>
      {filtered.length > 0 ? (
        <div className="rounded-xl bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icons.CheckCircle className="h-5 w-5 text-slate-400" />
                <h2 className="text-lg font-semibold text-slate-900">Approval Queue</h2>
              </div>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                {filtered.length} of {orders.length} pending
              </span>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {filtered.map((o) => (
                <ApprovalCard key={o.orderId} order={o} route={null} onDone={load} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 py-16 text-center">
          <h3 className="mt-4 text-lg font-semibold text-slate-900">No pending approvals</h3>
          <p className="mt-2 text-sm text-slate-500">{orders.length === 0 ? 'All caught up!' : 'No approvals match. Try a different search.'}</p>
        </div>
      )}
    </Shell>
  );
}
