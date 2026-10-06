'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { CalendarView } from '@/components/saas';
import { api } from '@/lib/supabase';
import { useRealtime } from '@/lib/realtime';
import type { Order } from '@/lib/types';

/** Wireframe 3.4: Secretary delivery calendar. */
export default function SecretaryCalendarPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const load = useCallback(() => {
    api<Order[]>('/orders').then(setOrders).catch(() => {});
  }, []);
  useEffect(() => {
    api<Order[]>('/orders').then(setOrders).catch(() => {});
  }, []);
  useRealtime('orders', load);

  return (
    <Shell role="Secretary" title="Delivery Calendar">
      <CalendarView orders={orders} onPick={() => {}} />
      <p className="mt-4 text-xs text-slate-400">Tip: click a day to see its schedule. Approvals live on the Approvals page.</p>
      <button onClick={() => router.push('/secretary/approvals')} className="btn-ghost mt-3 text-sm">Go to approvals</button>
    </Shell>
  );
}
