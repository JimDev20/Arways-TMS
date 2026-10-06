'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { KanbanBoard } from '@/components/saas';
import { api } from '@/lib/supabase';
import { useRealtime } from '@/lib/realtime';
import { Icons } from '@/lib/createLucideIcon';
import type { Order, RouteFull } from '@/lib/types';

/** Owner order kanban board (all orders). */
export default function OwnerKanbanPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [routes, setRoutes] = useState<RouteFull[]>([]);
  const [q, setQ] = useState('');
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
      <div className="relative mb-4">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Icons.Search className="h-4 w-4 text-slate-400" />
        </div>
        <input
          className="block w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm focus:border-[#f5a623] focus:outline-none focus:ring-1 focus:ring-[#f5a623]"
          placeholder="Search reference or date…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search status board cards"
        />
      </div>
      <KanbanBoard
        orders={orders}
        routes={routes}
        query={q}
        onMove={(o) => router.push(o.status === 'Pending' ? `/owner/approvals/${o.orderId}` : '/owner/routes')}
      />
      <p className="mt-4 text-xs text-slate-400">Click a card to open it: pending orders go to approval detail, the rest to monitoring.</p>
    </Shell>
  );
}
