'use client';
import { use, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Shell } from '@/components/Shell';
import { coordsOf, type MapPin } from '@/lib/map';
import { api } from '@/lib/supabase';
import { useRealtime } from '@/lib/realtime';
import { Icons } from '@/lib/createLucideIcon';
import { errorMessage, type OrderDetail } from '@/lib/types';

const MapView = dynamic(() => import('@/components/MapView').then((m) => m.MapView), { ssr: false });
const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false });

/** Secretary per-order tracking: same live timeline as client track, plus waybill photo (secretary may view waybills; client may not). */
export default function SecretaryTrackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [err, setErr] = useState('');
  const [stores, setStores] = useState<{ id: string; addr: string; pin: { lat: number; lon: number } | null }[]>([]);
  const newStoreId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const [savingStores, setSavingStores] = useState(false);
  const [storeMsg, setStoreMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const load = useCallback(() => {
    api<OrderDetail>(`/orders/${id}`).then((d) => {
      setDetail(d);
      setErr('');
    }).catch((e: unknown) => {
      setErr(errorMessage(e, 'Could not load the order.'));
    });
  }, [id]);
  useEffect(() => {
    api<OrderDetail>(`/orders/${id}`).then((d) => {
      setDetail(d);
      setErr('');
    }).catch((e: unknown) => {
      setErr(errorMessage(e, 'Could not load the order.'));
    });
  }, [id]);
  useRealtime('stops', load);

  const order = detail?.order;
  const route = detail?.route as (OrderDetail['route'] & { dispatchLeftPhotoUrl?: string | null }) | null;
  const stops = detail?.stops ?? [];
  const dropoffStops = stops.filter((s) => s.stopType === 'Dropoff');
  const waybillUrl = route?.dispatchLeftPhotoUrl ?? null;
  async function addStores() {
    setStoreMsg(null);
    const valid = stores.filter((s) => s.addr.trim() && s.pin);
    if (valid.length === 0) {
      setStoreMsg({ type: 'error', text: 'Add at least one store: type the address and tap the map to pin it.' });
      return;
    }
    if (!route) {
      setStoreMsg({ type: 'error', text: 'No route yet for this order.' });
      return;
    }
    setSavingStores(true);
    try {
      await api(`/routes/${(route as { routeId: string }).routeId}/stops`, {
        method: 'POST',
        body: JSON.stringify({ stores: valid.map((s) => ({ address: s.addr.trim(), lon: s.pin!.lon, lat: s.pin!.lat })) }),
      });
      setStores([]);
      setStoreMsg({ type: 'success', text: `Assigned ${valid.length} store${valid.length === 1 ? '' : 's'}. The driver was notified.` });
      load();
    } catch (e: unknown) {
      setStoreMsg({ type: 'error', text: errorMessage(e, 'Could not assign stores. Try again.') });
    } finally {
      setSavingStores(false);
    }
  }
  const status = order?.status ?? '';
  const delivered = stops.filter((s) => s.status === 'Delivered').length;
  const steps = [
    { label: 'Order Submitted', done: true, at: order?.createdAt },
    { label: 'Secretary Approved', done: ['Approved', 'In Transit', 'Completed'].includes(status), at: null },
    { label: 'Arrived at Dispatch', done: !!route?.dispatchedArrivedAt || ['In Transit', 'Completed'].includes(status), at: route?.dispatchedArrivedAt },
    { label: 'Left Dispatch', done: !!route?.dispatchedLeftAt || ['In Transit', 'Completed'].includes(status), at: route?.dispatchedLeftAt },
    { label: `Delivered (${delivered}/${stops.filter((s) => s.stopType === 'Dropoff').length})`, done: order?.status === 'Completed', at: null },
  ];
  const pins: MapPin[] = stops
    .map((s) => {
      const c = coordsOf(s.locationCoordinates);
      return c ? { ...c, label: `#${s.stopSequence} ${s.stopType} · ${s.locationAddress} (${s.status})` } : null;
    })
    .filter((p): p is MapPin => p !== null);

  return (
    <Shell role="Secretary" title="Track Order">
      {err && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{err}</div>}
      {!detail && !err ? <p className="text-sm text-slate-500">Loading…</p> : detail?.order && (
        <div className="grid gap-6">
          {detail.order.status === 'Cancelled' && (
            <div className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700" role="status">
              This order was cancelled{detail.order.rejectionReason ? `: ${detail.order.rejectionReason}` : '.'}
            </div>
          )}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{detail.order.orderReference}</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{detail.order.status}</span>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Pickup</dt><dd className="font-medium">{stops.find((s) => s.stopType === 'Pickup')?.locationAddress ?? '-'}</dd></div>
              <div><dt className="text-slate-500">Schedule</dt><dd className="font-medium">{detail.order.scheduledDate} at {detail.order.scheduledTime}</dd></div>
              <div><dt className="text-slate-500">Truck</dt><dd className="font-medium">{detail.truck ? `${detail.truck.plateNumber} (${detail.truck.truckType})` : '-'}</dd></div>
              <div><dt className="text-slate-500">Driver</dt><dd className="font-medium">{detail.driver?.fullName ?? '-'}</dd></div>
            </dl>
            {waybillUrl && (
              <a href={waybillUrl} target="_blank" rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-slate-50">
                <Icons.Proof className="h-4 w-4" />View waybill photo
              </a>
            )}
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Status Timeline</h2>
            <ol>
              {steps.map((s, i) => (
                <li key={s.label} className="flex gap-3">
                  <span className="flex flex-col items-center">
                    <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${s.done ? 'bg-green-500' : 'bg-slate-300'}`} />
                    {i < steps.length - 1 && <span className="w-px flex-1 bg-slate-200" />}
                  </span>
                  <span className="pb-3 text-sm">
                    <span className={`font-medium ${s.done ? 'text-slate-900' : 'text-slate-400'}`}>{s.label}</span>
                    {s.at && <span className="text-slate-500"> · {String(s.at).slice(0, 16).replace('T', ' ')}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {pins.length > 0 && (
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-slate-900">Map View</h2>
              <MapView pins={pins} />
            </div>
          )}

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-base font-semibold text-slate-900">Drop-off Stores</h2>
            <p className="mb-3 text-xs text-slate-500">
              {dropoffStops.length === 0
                ? 'No stores assigned yet. The driver sees pickup only. Add stores below. The driver is notified automatically.'
                : `${dropoffStops.length} store${dropoffStops.length === 1 ? '' : 's'} assigned. You can add more below.`}
            </p>
            {stores.map((s, i) => (
              <div key={s.id} className="mb-3 space-y-2 rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">New store #{i + 1}</p>
                  <button type="button" onClick={() => setStores(stores.filter((x) => x.id !== s.id))}
                    className="text-xs font-medium text-red-600 hover:underline">Remove</button>
                </div>
                <input
                  className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#f5a623] focus:outline-none"
                  placeholder="Puregold - Cubao, 789 Aurora Blvd, QC"
                  value={s.addr}
                  onChange={(e) => setStores(stores.map((x) => (x.id === s.id ? { ...x, addr: e.target.value } : x)))}
                />
                <MapPicker label={`Store #${i + 1} pin`} lat={s.pin?.lat ?? null} lon={s.pin?.lon ?? null} mapKey={s.id}
                  onChange={(lat, lon) => setStores(stores.map((x) => (x.id === s.id ? { ...x, pin: { lat, lon } } : x)))} />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setStores([...stores, { id: newStoreId(), addr: '', pin: null }])}
                className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                + Add store
              </button>
              {stores.length > 0 && (
                <button type="button" onClick={addStores} disabled={savingStores}
                  className="rounded-lg bg-[#f5a623] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e69b1e] disabled:opacity-60">
                  {savingStores ? 'Assigning…' : `Assign ${stores.filter((s) => s.addr.trim() && s.pin).length || ''} store(s) + notify driver`}
                </button>
              )}
            </div>
            {storeMsg && (
              <p className={`mt-2 text-sm ${storeMsg.type === 'error' ? 'text-red-600' : 'text-green-700'}`} role={storeMsg.type === 'error' ? 'alert' : 'status'}>{storeMsg.text}</p>
            )}
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Stops & Proof</h2>
            <ul className="divide-y divide-slate-100">
              {stops.map((s) => (
                <li key={s.stopId} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-900">#{s.stopSequence} {s.stopType} · {s.locationAddress}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{s.status}</span>
                  </div>
                  {s.driverNotes && <p className="mt-1 text-sm text-slate-600">Driver note: “{s.driverNotes}”</p>}
                  {s.receiptPhotoUrl && (
                    <a href={s.receiptPhotoUrl} target="_blank" rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
                      <Icons.Search className="h-4 w-4" />View Proof of Delivery
                    </a>
                  )}
                </li>
              ))}
            </ul>
            <Link href="/secretary/reports"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              All reports<Icons.ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </Shell>
  );
}
