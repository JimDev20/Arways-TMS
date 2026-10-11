'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/supabase';
import { Icons } from '@/lib/createLucideIcon';
import type { Order } from '@/lib/types';
import { PriorityBadge } from '@/components/PriorityBadge';
import { StatusPill } from '@/components/StatusPill';

const STATUSES = ['All', 'Pending', 'Approved', 'In Transit', 'Completed', 'Rejected', 'Cancelled'];

export default function ClientOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All');
  useEffect(() => {
    api<Order[]>('/orders').then(setOrders).catch(() => {});
  }, []);

  const filtered = orders.filter((o) => {
    if (status !== 'All' && o.status !== status) return false;
    if (q && !o.orderReference.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <Shell role="Client" title="My Orders">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Icons.Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            className="block w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
            placeholder="Search my orders by reference (e.g. JFC-2026-00123)…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search orders"
          />
        </div>
        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
        >
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="text-xs text-slate-500">{filtered.length} of {orders.length}</span>
      </div>
      <div className="rounded-xl bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <Icons.Package className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-900">Order History</h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">Reference</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold">Priority</th>
                <th className="px-6 py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((o) => (
                <tr key={o.orderId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-slate-900">
                    <Link href={`/client/track/${o.orderId}`} className="text-[#0e7a70] hover:underline" title="Open tracking timeline">
                      {o.orderReference}
                    </Link>
                  </td>
                  <td className="px-6 py-3">
                    <StatusPill status={o.status} />
                    {o.rejectionReason && (
                      <span className="mt-1 block max-w-56 truncate text-xs text-red-600" title={o.rejectionReason}>
                        {o.rejectionReason}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <PriorityBadge priority={o.priority} />
                  </td>
                  <td className="px-6 py-3 text-slate-600">{o.scheduledDate}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <p>{orders.length === 0 ? 'No orders found' : 'No orders match. Try a different search or filter.'}</p>
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
