'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { Card, Empty, ListSkeleton, NoAccess } from '@/components/saas';
import { SearchField } from '@/components/SearchField';
import { api, apiStatus } from '@/lib/supabase';
import { errorMessage, type Order } from '@/lib/types';

/** Secretary tracking index: pick any order, then open its live track view. */
export default function SecretaryTrackListPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [q, setQ] = useState('');
  const [denied, setDenied] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api<Order[]>('/orders')
      .then((o) => { setOrders(o); setDenied(false); setLoadError(''); })
      .catch((e: unknown) => {
        if (apiStatus(e) === 403) setDenied(true);
        else setLoadError(errorMessage(e, 'Could not load orders. Check your connection and try again.'));
      })
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
  }, []);

  const visible = orders.filter((o) => !q.trim() || o.orderReference.toLowerCase().includes(q.toLowerCase()));
  const clearFilter = () => setQ('');

  return (
    <Shell role="Secretary" title="Track Orders">
      <Card title={`All shipments (${visible.length})`} action={<SearchField value={q} onChange={setQ} placeholder="Search by order reference (e.g. JFC-2026-00123)…" label="Search orders" withIcon={false} inputClassName="w-48 rounded-lg border border-slate-200 bg-white pl-3 pr-8 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900" />}>
        {denied ? (
          <NoAccess backHref="/secretary" backLabel="Back to dashboard" />
        ) : loadError ? (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {loadError}{' '}
            <button onClick={load} className="font-medium underline hover:no-underline">Retry</button>
          </div>
        ) : loading ? (
          <ListSkeleton rows={3} />
        ) : visible.length === 0 ? (
          orders.length === 0 ? (
            <Empty message="No orders to track yet." cta={<Link href="/secretary/new" className="btn-primary text-sm">Create order</Link>} />
          ) : (
            <Empty
              message={`No orders match "${q.trim()}".`}
              description="Try a different search."
              cta={<button onClick={clearFilter} className="btn-ghost text-sm">Clear filter</button>}
            />
          )
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((o) => (
              <li key={o.orderId} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">#{o.orderReference}</p>
                  <p className="text-xs text-slate-500">{o.status} · {o.scheduledDate} {o.scheduledTime}</p>
                </div>
                <Link href={`/secretary/track/${o.orderId}`} className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white dark:bg-white dark:text-slate-900">
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
