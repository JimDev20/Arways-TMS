'use client';
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Shell, Stat, useSession } from '@/components/Shell';
import { coordsOf, type MapPin } from '@/lib/map';
import { api } from '@/lib/supabase';
import { useRealtime } from '@/lib/realtime';
import Link from 'next/link';
import { Icons } from '@/lib/createLucideIcon';
import type { Order, OrderDetail } from '@/lib/types';

const MapView = dynamic(() => import('@/components/MapView').then((m) => m.MapView), { ssr: false });

export default function ClientDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [pins, setPins] = useState<MapPin[]>([]);
  const session = useSession();
  const load = useCallback(() => {
    api<Order[]>('/orders').then(async (list) => {
      setOrders(list);
      // Collect stop pins across own orders for the delivery map.
      const all: MapPin[] = [];
      await Promise.all(list.slice(0, 20).map(async (o) => {
        try {
          const d = await api<OrderDetail>(`/orders/${o.orderId}`);
          for (const s of d.stops ?? []) {
            const c = coordsOf(s.locationCoordinates);
            if (c) all.push({ ...c, label: `${o.orderReference} · ${s.stopType} · ${s.locationAddress}` });
          }
        } catch { /* one bad order must not break the map */ }
      }));
      setPins(all);
    }).catch(() => {});
  }, []);
  useEffect(load, [load]);
  useRealtime('orders', load);
  useRealtime('stops', load);

  const pending = orders.filter((o) => o.status === 'Pending').length;
  const transit = orders.filter((o) => o.status === 'In Transit').length;
  const delivered = orders.filter((o) => o.status === 'Completed').length;
  const firstName = session?.fullName?.split(' ')[0] ?? '';

  return (
    <Shell role="Client" title="My Deliveries">
      {session && (
        <p className="mb-4 text-lg font-semibold text-slate-900">
          Welcome{firstName ? `, ${firstName}` : ''}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total Orders" value={orders.length} tone="blue" />
        <Stat label="Pending" value={pending} tone="amber" />
        <Stat label="In Transit" value={transit} tone="blue" />
        <Stat label="Delivered" value={delivered} tone="green" />
      </div>

      <Link href="/client/new"
        className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-[#0e7a70] py-4 text-base font-semibold text-white shadow-md shadow-[#0e7a70]/20 transition-all hover:bg-[#0b625a]">
        <Icons.Plus className="h-5 w-5" />
        Create New Order
      </Link>

      {/* Recent Orders */}
      <div className="mt-6 rounded-xl bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icons.Package className="h-5 w-5 text-slate-400" />
              <h2 className="text-lg font-semibold text-slate-900">My Orders</h2>
            </div>
            <Link
              href="/client/new"
              className="inline-flex items-center gap-2 rounded-lg bg-[#0e7a70] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b625a]"
            >
              <Icons.Plus className="h-4 w-4" />
              New Order
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">Reference</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold">Date</th>
                <th className="px-6 py-3 font-semibold">Track</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => (
                <tr key={o.orderId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-slate-900">{o.orderReference}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                      o.status === 'Pending' ? 'bg-amber-50 text-amber-700' :
                      o.status === 'Approved' ? 'bg-blue-50 text-blue-700' :
                      o.status === 'In Transit' ? 'bg-blue-50 text-blue-700' :
                      o.status === 'Completed' ? 'bg-green-50 text-green-700' :
                      'bg-red-50 text-red-700'
                    }`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-slate-600">{o.scheduledDate}</td>
                  <td className="px-6 py-3">
                    <Link
                      href={`/client/track/${o.orderId}`}
                      className="inline-flex items-center gap-1 text-[#0e7a70] font-medium hover:underline"
                    >
                      Track <Icons.ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <p>No orders yet. Create your first one above.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delivery map (own orders only) */}
      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Delivery Map (Your Orders Only)</h2>
        {pins.length > 0 ? (
          <MapView pins={pins} />
        ) : (
          <p className="py-8 text-center text-sm text-slate-400">No mapped stops yet. Pins appear once your orders have map locations.</p>
        )}
      </div>
    </Shell>
  );
}
