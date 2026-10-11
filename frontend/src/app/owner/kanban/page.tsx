'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { KanbanBoard } from '@/components/saas';
import { api } from '@/lib/supabase';
import { useRealtime } from '@/lib/realtime';
import { SearchField } from '@/components/SearchField';
import type { Order, RouteFull } from '@/lib/types';

/** Owner order kanban board (all orders). */
export default function OwnerKanbanPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [routes, setRoutes] = useState<RouteFull[]>([]);
  const [q, setQ] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);
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

  return (
    <Shell role="Owner" title="Order Status Board">
      <SearchField
        value={q}
        onChange={setQ}
        placeholder="Search by reference or date (YYYY-MM-DD)…"
        label="Search status board cards"
        className="mb-4"
        inputClassName="block w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-9 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
      />
      <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-[#0e7a70]" />
        Show cancelled
      </label>
      <KanbanBoard
        orders={orders}
        routes={routes}
        query={q}
        showCancelled={showCancelled}
        onMove={(o) => router.push(o.status === 'Pending' ? `/owner/approvals/${o.orderId}` : '/owner/routes')}
      />
      <p className="mt-4 text-xs text-slate-400">Click a card to open it: pending orders go to approval detail, the rest to monitoring.</p>
    </Shell>
  );
}
