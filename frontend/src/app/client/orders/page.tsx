'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/supabase';
import { Icons } from '@/lib/createLucideIcon';
import { errorMessage, type Order, type Page } from '@/lib/types';
import { PriorityBadge } from '@/components/PriorityBadge';
import { StatusPill } from '@/components/StatusPill';
import { SearchField } from '@/components/SearchField';
import { Pager, TableSkeleton } from '@/components/saas';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

const STATUSES = ['All', 'Pending', 'Approved', 'In Transit', 'Completed', 'Rejected', 'Cancelled'];

const PAGE_SIZE = 20;

export default function ClientOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All');
  const debouncedQ = useDebouncedValue(q);
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listErr, setListErr] = useState('');

  // Server-side search, filter and cursor pagination (§3.7).
  const loadPage = useCallback((p: number, stack: (string | null)[], silent: boolean, qq: string, st: string) => {
    if (!silent) setLoading(true);
    setListErr('');
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    const cur = stack[p - 1];
    if (cur) params.set('cursor', cur);
    if (st !== 'All') params.set('status', st);
    if (qq.trim()) params.set('q', qq.trim());
    api<Page<Order>>(`/orders?${params.toString()}`)
      .then((r) => {
        setOrders(r.items);
        setNextCursor(r.nextCursor);
        setTotal(r.total);
      })
      .catch((e: unknown) => {
        setListErr(errorMessage(e, 'Could not load orders.'));
      })
      .finally(() => setLoading(false));
  }, []);

  // Any filter change restarts at page 1 with a fresh cursor stack.
  useEffect(() => {
    const stack: (string | null)[] = [null];
    setPage(1);
    setCursors(stack);
    loadPage(1, stack, false, debouncedQ, status);
  }, [debouncedQ, status, loadPage]);

  const hasFilter = debouncedQ.trim() !== '' || status !== 'All';
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function nextPage() {
    if (!nextCursor) return;
    const stack = [...cursors, nextCursor];
    setCursors(stack);
    const p = page + 1;
    setPage(p);
    loadPage(p, stack, false, debouncedQ, status);
  }

  function prevPage() {
    if (page <= 1) return;
    const p = page - 1;
    setPage(p);
    loadPage(p, cursors, false, debouncedQ, status);
  }

  return (
    <Shell role="Client" title="My Orders">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchField
          value={q}
          onChange={setQ}
          placeholder="Search my orders by reference (e.g. JFC-2026-00123)…"
          label="Search orders"
          className="flex-1 min-w-52"
          inputClassName="block w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-9 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
        />
        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
        >
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="text-xs text-slate-500" role="status">{total} orders</span>
      </div>
      {listErr && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {listErr}{' '}
          <button onClick={() => loadPage(page, cursors, false, debouncedQ, status)} className="font-medium underline hover:no-underline">Retry</button>
        </div>
      )}
      {loading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : (
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
              {orders.map((o) => (
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
              {orders.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <p>{total === 0 && !hasFilter ? 'No orders found' : 'No orders match. Try a different search or filter.'}</p>
                      {hasFilter && (
                        <button onClick={() => { setQ(''); setStatus('All'); }} className="btn-ghost mt-1 text-sm">Clear filter</button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
      {!loading && total > PAGE_SIZE && (
        <Pager
          page={page}
          totalPages={totalPages}
          total={total}
          noun="orders"
          onPrev={prevPage}
          onNext={nextPage}
          hasNext={nextCursor !== null}
        />
      )}
    </Shell>
  );
}
