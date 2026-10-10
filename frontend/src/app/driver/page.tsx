'use client';
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Shell } from '@/components/Shell';
import { api, supabaseBrowser } from '@/lib/supabase';
import { useRealtime } from '@/lib/realtime';
import { errorMessage, gmapsUrl, type DriverRoute, type OrderDetail, type OrderDetailClient, type StopRow } from '@/lib/types';
import { coordsOf, type MapPin } from '@/lib/map';
import { Icons } from '@/lib/createLucideIcon';

const MapView = dynamic(() => import('@/components/MapView').then((m) => m.MapView), { ssr: false });

/** Google Maps link for exact coords, or address search fallback. */
function navigateHref(address: string, coords: unknown): string {
  const c = coordsOf(coords);
  if (c) return gmapsUrl(c.lat, c.lon);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '-';
  return String(iso).slice(11, 16);
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, '')}`;
}

export default function DriverHome() {
  const [routes, setRoutes] = useState<DriverRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string; at: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receipts, setReceipts] = useState<Record<string, string>>({});
  const [waybills, setWaybills] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [failFor, setFailFor] = useState('');
  const [failReason, setFailReason] = useState('');
  const [uploadingId, setUploadingId] = useState('');
  const [uploadingWaybillId, setUploadingWaybillId] = useState('');
  const [leavingId, setLeavingId] = useState('');
  const [clientInfo, setClientInfo] = useState<{ orderId: string; client: OrderDetailClient | null } | null>(null);
  const load = useCallback(() => {
    api<DriverRoute[]>('/routes/mine')
      .then(setRoutes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    api<DriverRoute[]>('/routes/mine')
      .then(setRoutes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useRealtime('stops', load);
  useRealtime('notifications', load);

  // Fallback pickup guide for backends without enriched /routes/mine.
  useEffect(() => {
    const enriched = routes[0]?.client;
    const orderId = routes[0]?.route.orderId;
    if (enriched || !orderId) return;
    let live = true;
    api<OrderDetail>(`/orders/${orderId}`)
      .then((d) => {
        if (live) setClientInfo({ orderId, client: d.client });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [routes]);

  const first = routes[0];
  const guide: OrderDetailClient | null =
    first?.client ?? (clientInfo && first?.route.orderId === clientInfo.orderId ? clientInfo.client : null);
  const firstPickup = first?.stops?.find((s) => s.stopType === 'Pickup') ?? null;
  const firstDropoffs = (first?.stops ?? []).filter((s) => s.stopType === 'Dropoff');
  const isWaiting = first ? firstDropoffs.length === 0 : false;
  const todayLabel = first?.scheduledDate ?? new Date().toISOString().slice(0, 10);

  const pins: MapPin[] = (first?.stops ?? [])
    .map((s) => {
      const c = coordsOf(s.locationCoordinates);
      return c ? { ...c, label: `#${s.stopSequence} ${s.stopType} · ${s.locationAddress} (${s.status})` } : null;
    })
    .filter((p): p is MapPin => p !== null);

  async function patch(path: string, body?: Record<string, unknown>, okText?: string) {
    setIsSubmitting(true);
    setMsg(null);
    try {
      await api(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
      if (okText) setMsg({ type: 'success', text: okText, at: Date.now() });
      load();
    } catch (e: unknown) {
      setMsg({ type: 'error', text: errorMessage(e, 'Could not update. Try again.'), at: Date.now() });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function uploadReceipt(stopId: string, file: File) {
    setIsSubmitting(true);
    setUploadingId(stopId);
    setMsg(null);
    try {
      if (!file.type.startsWith('image/')) {
        throw new Error(`"${file.name}" is not a photo. Choose a JPG, PNG, HEIC, or WebP image.`);
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error(`"${file.name}" is too big (${(file.size / 1024 / 1024).toFixed(1)} MB). Photos must be 5 MB or smaller. Retake at lower resolution.`);
      }
      const sb = supabaseBrowser();
      const path = `${stopId}/${Date.now()}-${file.name}`;
      const { error } = await sb.storage.from('receipts').upload(path, file);
      if (error) throw error;
      const { data } = await sb.storage.from('receipts').createSignedUrl(path, 60 * 60 * 24 * 365 * 2);
      const url = data?.signedUrl ?? path;
      setReceipts((r) => ({ ...r, [stopId]: url }));
      setMsg({ type: 'success', text: 'Receipt photo attached. Press “Mark Delivered” to finish the stop.', at: Date.now() });
    } catch (e: unknown) {
      setMsg({ type: 'error', text: errorMessage(e, 'Could not upload the photo. Try again.'), at: Date.now() });
    } finally {
      setIsSubmitting(false);
      setUploadingId('');
    }
  }

  async function uploadWaybill(routeId: string, file: File) {
    setUploadingWaybillId(routeId);
    setMsg(null);
    try {
      if (!file.type.startsWith('image/')) {
        throw new Error(`"${file.name}" is not a photo. Choose a JPG, PNG, HEIC, or WebP image.`);
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error(`"${file.name}" is too big (${(file.size / 1024 / 1024).toFixed(1)} MB). Photos must be 5 MB or smaller.`);
      }
      const sb = supabaseBrowser();
      const path = `dispatch/${routeId}/${Date.now()}-${file.name}`;
      const { error } = await sb.storage.from('receipts').upload(path, file);
      if (error) throw error;
      const { data } = await sb.storage.from('receipts').createSignedUrl(path, 60 * 60 * 24 * 365 * 2);
      const url = data?.signedUrl ?? path;
      if (!url) throw new Error('Upload succeeded but no photo URL was returned. Try again.');
      setWaybills((w) => ({ ...w, [routeId]: url }));
      setMsg({ type: 'success', text: 'Waybill photo attached. You can now tap “Left dispatch”.', at: Date.now() });
    } catch (e: unknown) {
      setMsg({ type: 'error', text: errorMessage(e, 'Could not upload the waybill photo. Try again.'), at: Date.now() });
    } finally {
      setUploadingWaybillId('');
    }
  }

  async function leftDispatch(routeId: string, existingPhotoUrl?: string | null) {
    const url = (waybills[routeId] ?? existingPhotoUrl ?? '').trim();
    if (!url) {
      setMsg({ type: 'error', text: 'Waybill photo required before leaving dispatch. Take a photo of the waybill/docs first.', at: Date.now() });
      return;
    }
    // Sure-route gate (mirrors the server): every store must already be
    // pinned. The driver cannot fix this; dispatch assigns the pins.
    const routeStops = routes.find((r) => r.route.routeId === routeId)?.stops ?? [];
    const unpinned = routeStops.filter((s) => s.stopType === 'Dropoff' && !coordsOf(s.locationCoordinates));
    if (unpinned.length > 0) {
      const names = unpinned.map((s) => s.locationAddress).join(', ');
      setMsg({ type: 'error', text: `Cannot leave dispatch: ${unpinned.length} store${unpinned.length === 1 ? '' : 's'} ha${unpinned.length === 1 ? 's' : 've'} no map pin${unpinned.length === 1 ? '' : 's'}: ${names}. Dispatch must assign all store locations first.`, at: Date.now() });
      return;
    }
    setLeavingId(routeId);
    try {
      await patch(`/routes/${routeId}/dispatch-left`, { waybillPhotoUrl: url }, 'Departure from dispatch recorded with waybill photo.');
    } finally {
      setLeavingId('');
    }
  }

  async function markDelivered(stop: StopRow) {
    const url = receipts[stop.stopId];
    if (!url) {
      setMsg({ type: 'error', text: `No receipt photo for “${stop.locationAddress}” yet. Attach the photo first, then mark delivered.`, at: Date.now() });
      return;
    }
    await patch(
      `/stops/${stop.stopId}/status`,
      { status: 'Delivered', receiptPhotoUrl: url, driverNotes: notes[stop.stopId]?.trim() || undefined },
      `Stop “${stop.locationAddress}” marked delivered.`,
    );
  }

  async function markFailed(stop: StopRow) {
    if (!failReason.trim()) {
      setMsg({ type: 'error', text: `A reason is required to fail “${stop.locationAddress}”. Type what went wrong first.`, at: Date.now() });
      return;
    }
    await patch(
      `/stops/${stop.stopId}/status`,
      { status: 'Failed', failedReason: failReason.trim(), driverNotes: notes[stop.stopId]?.trim() || undefined },
      `Stop “${stop.locationAddress}” marked failed. Dispatch was notified.`,
    );
    setFailFor(''); setFailReason('');
  }

  const allStops = routes.flatMap(({ route, stops }) => (stops ?? []).map((s) => ({ ...s, routeNumber: route.routeNumber })));
  const dropoffs = allStops.filter((s) => s.stopType === 'Dropoff');
  const nextStop = allStops.find((s) => s.status === 'Pending' || s.status === 'Arrived');
  const allDone = dropoffs.length > 0 && dropoffs.every((s) => ['Delivered', 'Failed'].includes(s.status));

  return (
    <Shell role="Driver" title="Today's Route">
      {/* Status Message — clear done/error feedback with time + dismiss */}
      {msg && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm shadow-sm ${msg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}
          role={msg.type === 'error' ? 'alert' : 'status'}>
          <div className="flex items-start gap-2">
            {msg.type === 'error' ? <Icons.AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /> : <Icons.CheckCircle className="mt-0.5 h-5 w-5 shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{msg.type === 'error' ? 'Action needed' : 'Done'}</p>
              <p className="mt-0.5 break-words">{msg.text}</p>
              <p className="mt-1 text-xs opacity-70">{new Date(msg.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
            </div>
            <button onClick={() => setMsg(null)} aria-label="Dismiss feedback"
              className="rounded-lg p-1 hover:bg-black/5">
              <Icons.X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Delivery complete banner */}
      {allDone && (
        <div className="mb-6 rounded-xl bg-green-50 p-6 text-center shadow-sm" role="status">
          <Icons.CheckCircle className="mx-auto h-10 w-10 text-green-600" />
          <h2 className="mt-2 text-lg font-bold text-slate-900">Delivery Complete</h2>
          <p className="mt-1 text-sm text-slate-600">All {dropoffs.length} drop-offs finished. Truck is available again.</p>
        </div>
      )}

      {loading ? (
        <div className="mb-6 animate-pulse rounded-xl bg-white p-6 shadow-sm" aria-label="Loading route">
          <div className="h-4 w-1/3 rounded bg-slate-200" />
          <div className="mt-3 h-3 w-2/3 rounded bg-slate-100" />
          <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
        </div>
      ) : null}

      {/* Final wireframe: route header (always) */}
      {first ? (
        <div className="mb-4 rounded-xl bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">TODAY&apos;S ROUTE</h2>
            <span className="text-xs text-slate-500">{todayLabel}{first.scheduledTime ? ` · ${String(first.scheduledTime).slice(0, 5)}` : ''}</span>
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div className="min-w-0"><dt className="text-slate-500">Client</dt><dd className="flex items-center gap-1.5 truncate font-medium text-slate-900"><Icons.Client className="h-4 w-4 shrink-0 text-blue-600" /><span className="truncate">{guide?.companyName ?? first.orderReference ?? '-'}</span></dd></div>
            <div><dt className="text-slate-500">Truck</dt><dd className="font-medium text-slate-900">{first.truck ? `${first.truck.plateNumber} (${first.truck.truckSize ?? '6W'} · ${first.truck.truckType})` : '-'}</dd></div>
            <div><dt className="text-slate-500">Route</dt><dd className="font-medium text-slate-900">{first.route.routeNumber} · {first.route.status}</dd></div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700"><Icons.MapPin className="h-3.5 w-3.5" />PICKUP READY</span>
            {isWaiting ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700"><Icons.Clock className="h-3.5 w-3.5" />Waiting for stores</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 font-medium text-green-700"><Icons.CheckCircle className="h-3.5 w-3.5" />{firstDropoffs.length} store{firstDropoffs.length === 1 ? '' : 's'}</span>
            )}
          </div>
        </div>
      ) : null}

      {/* Next stop prompt */}
      {!loading && !allDone && nextStop && (
        <div className="mb-4 rounded-xl border-l-4 border-l-[#0e7a70] bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Next stop</p>
          <p className="mt-1 truncate text-sm font-medium text-slate-900">
            #{nextStop.stopSequence} {nextStop.locationAddress} ({nextStop.status})
          </p>
        </div>
      )}

      {/* Consolidated pickup card (always visible): address + guide + contacts */}
      {first && firstPickup && (
        <div className="mb-4 rounded-xl bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-1 text-base font-semibold text-slate-900">Pickup: always available</h2>
          <p className="text-sm font-medium text-slate-900">{firstPickup.locationAddress}</p>
          {(() => { const c = coordsOf(firstPickup.locationCoordinates); return c ? <p className="mt-1 text-xs text-slate-500">Coordinates: {c.lat.toFixed(4)}, {c.lon.toFixed(4)}</p> : null; })()}
          {guide && (
            <dl className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Dispatch area</dt><dd className="font-medium">{guide.dispatchAreaAddress}</dd></div>
              <div><dt className="text-slate-500">Dispatcher</dt><dd className="font-medium">{guide.dispatcherContact ?? guide.phone ?? '-'}</dd></div>
            </dl>
          )}
          {guide?.entranceInstructions && (
            <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">Entrance: {guide.entranceInstructions}</p>
          )}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <a href={navigateHref(firstPickup.locationAddress, firstPickup.locationCoordinates)} target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700">
              <Icons.MapPin className="h-4 w-4" />Navigate to pickup
            </a>
            {guide && (
              <>
                <a href={telHref(guide.phone)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <Icons.Phone className="h-4 w-4" />Call client
                </a>
                {(guide.dispatcherContact ?? guide.phone) && (
                  <a href={telHref(guide.dispatcherContact ?? guide.phone ?? '')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <Icons.Phone className="h-4 w-4" />Call dispatcher
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Final wireframe: route map */}
      {first && (
        <div className="mb-4 rounded-xl bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Route Map</h2>
            <button onClick={load} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              <Icons.Refresh className="h-3.5 w-3.5" />Refresh
            </button>
          </div>
          {pins.length > 0 ? (
            <MapView pins={pins} height="h-64 sm:h-80" />
          ) : (
            <p className="text-sm text-slate-500">No pins yet.</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-blue-500" />Pickup (always)</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-red-500" />Drop-off</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-green-500" />Delivered</span>
            <span>Legend updates automatically.</span>
          </div>
          {isWaiting && (
            <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700"><Icons.Clock className="h-3.5 w-3.5 shrink-0" />Drop-off stores not yet assigned. The map updates automatically once stores are added.</p>
          )}
        </div>
      )}

      {/* Final wireframe: drop-off waiting vs list summary */}
      {first && (
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Drop-off Stores</h2>
          {isWaiting ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <p className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-900"><Icons.Clock className="h-4 w-4 text-amber-600" />Waiting for stores</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
                The client has not yet assigned the drop-off stores for this route. You will receive a notification once stores are added.
              </p>
              <div className="mx-auto mt-3 max-w-md rounded-lg bg-white p-3 text-left text-xs text-slate-700">
                <p className="font-semibold">While waiting:</p>
                <ul className="mt-1 space-y-1">
                  <li className="flex items-center gap-2"><Icons.Check className="h-3.5 w-3.5 shrink-0 text-green-600" />Proceed to pickup location</li>
                  <li className="flex items-center gap-2"><Icons.Check className="h-3.5 w-3.5 shrink-0 text-green-600" />Load the products</li>
                  <li className="flex items-center gap-2"><Icons.Check className="h-3.5 w-3.5 shrink-0 text-green-600" />Wait for store assignment notification</li>
                  <li className="flex items-center gap-2"><Icons.Check className="h-3.5 w-3.5 shrink-0 text-green-600" />Once assigned, deliver to each store</li>
                </ul>
              </div>
              <button onClick={load} disabled={isSubmitting}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                <Icons.Refresh className="h-4 w-4" />Refresh
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {firstDropoffs.map((s, i) => (
                <li key={s.stopId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-900">{i + 1}. {s.locationAddress}</span>
                  <a href={navigateHref(s.locationAddress, s.locationCoordinates)} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    <Icons.MapPin className="h-3.5 w-3.5" />Navigate
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Routes */}
      {routes.length > 0 ? (
        <div className="space-y-6">
          {routes.map(({ route, stops }) => {
            const done = (stops ?? []).filter((s) => ['Delivered', 'Failed'].includes(s.status)).length;
            const total = (stops ?? []).length;
            const pct = total ? Math.round((done / total) * 100) : 0;
            const waybillUrl = waybills[route.routeId] ?? (route as { dispatchLeftPhotoUrl?: string | null }).dispatchLeftPhotoUrl ?? null;
            const dropoffsForRoute = (stops ?? []).filter((s) => s.stopType === 'Dropoff');
            const waitingForRoute = dropoffsForRoute.length === 0;
            return (
            <div key={route.routeId} className="rounded-xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0e7a70]/10 text-[#0e7a70]">
                    <Icons.Map className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-slate-900">Route {route.routeNumber}</span>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        route.status === 'Pending' ? 'bg-amber-50 text-amber-700' :
                        route.status === 'In Progress' ? 'bg-blue-50 text-blue-700' :
                        route.status === 'Completed' ? 'bg-green-50 text-green-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {route.status}
                      </span>
                    </div>
                  </div>
                </div>
                <button onClick={load} disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                  <Icons.Refresh className="h-3.5 w-3.5" />Refresh
                </button>
              </div>

              {/* Dispatch docs: arrived one-tap, left gated on waybill photo */}
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dispatch</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {route.dispatchedArrivedAt ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 font-medium text-green-700">
                      <Icons.CheckCircle className="h-3.5 w-3.5" />Arrived {fmtTime(route.dispatchedArrivedAt)} · done
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-500">
                      <Icons.Clock className="h-3.5 w-3.5" />Not yet arrived
                    </span>
                  )}
                  {route.dispatchedLeftAt ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 font-medium text-green-700">
                      <Icons.CheckCircle className="h-3.5 w-3.5" />Left {fmtTime(route.dispatchedLeftAt)} · done
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-500">
                      <Icons.Clock className="h-3.5 w-3.5" />Not yet left
                    </span>
                  )}
                  {waybillUrl && !route.dispatchedLeftAt && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">
                      <Icons.CheckCircle className="h-3.5 w-3.5" />Waybill ready
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => patch(`/routes/${route.routeId}/dispatch-arrived`, undefined, 'Arrival at dispatch recorded.')}
                    disabled={isSubmitting}
                    className="rounded-lg bg-[#0e7a70] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b625a] disabled:opacity-60"
                  >
                    Arrived at dispatch
                  </button>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    {uploadingWaybillId === route.routeId ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-[#0e7a70]" aria-hidden />
                    ) : waybillUrl ? (
                      <Icons.CheckCircle className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Icons.Upload className="h-3.5 w-3.5" />
                    )}
                    <span>{uploadingWaybillId === route.routeId ? 'Uploading waybill…' : waybillUrl ? 'Waybill attached. Tap to retake.' : 'Take / upload waybill photo (required to leave)'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/heic,image/webp"
                      capture="environment"
                      className="hidden"
                      disabled={uploadingWaybillId === route.routeId || leavingId === route.routeId}
                      aria-label={`Waybill photo for route ${route.routeNumber}`}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadWaybill(route.routeId, f); e.target.value = ''; }}
                    />
                  </label>
                  <button
                    onClick={() => leftDispatch(route.routeId, (route as { dispatchLeftPhotoUrl?: string | null }).dispatchLeftPhotoUrl)}
                    disabled={uploadingWaybillId === route.routeId || leavingId === route.routeId || !waybillUrl}
                    title={!waybillUrl ? 'Attach the waybill photo first' : route.dispatchedLeftAt ? 'Already left dispatch. Tap again to update' : 'Record departure with waybill photo'}
                    aria-disabled={!waybillUrl}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${waybillUrl ? 'bg-[#0e7a70] text-white hover:bg-[#0b625a]' : 'border border-slate-200 bg-white text-slate-400'}`}
                  >
                    {leavingId === route.routeId ? 'Recording…' : route.dispatchedLeftAt ? 'Left dispatch (update)' : 'Left dispatch'}
                  </button>
                </div>
                {!waybillUrl && (
                  <p className="mt-2 text-xs text-amber-700">Attach waybill photo first — Left dispatch stays disabled until the photo is attached.</p>
                )}
                {waybillUrl && (
                    <a href={waybillUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-medium text-blue-700 hover:underline dark:text-blue-400">
                    View attached waybill photo
                  </a>
                )}
              </div>

              {/* Progress */}
              <div className="mb-4">
                <div className="h-2 overflow-hidden rounded bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Route ${route.routeNumber} progress`}>
                  <span className="block h-full rounded bg-[#0e7a70]" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-500">Progress: {done}/{total} done{waitingForRoute ? ' · waiting for stores' : ''}</p>
              </div>

              {/* Stops */}
              <div className="space-y-3">
                {(stops ?? []).map((s) => (
                  <div key={s.stopId} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0e7a70] text-xs font-bold text-white">
                            {s.stopSequence}
                          </span>
                          <span className="font-medium text-slate-900">{s.locationAddress}</span>
                        </div>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          s.status === 'Pending' ? 'bg-slate-100 text-slate-700' :
                          s.status === 'Arrived' ? 'bg-blue-50 text-blue-700' :
                          s.status === 'Departed' ? 'bg-slate-200 text-slate-700' :
                          s.status === 'Delivered' ? 'bg-green-50 text-green-700' :
                          s.status === 'Failed' ? 'bg-red-50 text-red-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {s.status} · {s.stopType}
                        </span>
                        <p className="mt-1 text-xs text-slate-500">
                          Arrived: {fmtTime(s.arrivedAt)}{s.stopType === 'Dropoff' ? ` · Delivered: ${fmtTime(s.deliveredAt)}` : ''}
                          {s.timeWindowStart ? ` · Window ${String(s.timeWindowStart).slice(0, 5)}–${String(s.timeWindowEnd ?? '').slice(0, 5)}` : ''}
                        </p>
                        {s.status === 'Delivered' && (
                          <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-green-50 px-2.5 py-1.5 text-xs font-medium text-green-700">
                            <Icons.CheckCircle className="h-3.5 w-3.5 shrink-0" />
                            Delivered{s.deliveredAt ? ` at ${fmtTime(s.deliveredAt)}` : ''}.
                            {(s.receiptPhotoUrl ?? receipts[s.stopId]) && (
                              <a href={s.receiptPhotoUrl ?? receipts[s.stopId]} target="_blank" rel="noreferrer" className="underline">View receipt</a>
                            )}
                          </p>
                        )}
                        {s.status === 'Failed' && (
                          <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700">
                            <Icons.XCircle className="h-3.5 w-3.5 shrink-0" />
                            Marked failed{s.failedReason ? `: ${s.failedReason}` : ''}.
                          </p>
                        )}
                        {s.status === 'Arrived' && s.arrivedAt && (
                          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400">
                            <Icons.CheckCircle className="h-3.5 w-3.5 shrink-0" />Arrived {fmtTime(s.arrivedAt)} · done
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href={navigateHref(s.locationAddress, s.locationCoordinates)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Icons.MapPin className="h-3.5 w-3.5" />
                        Navigate
                      </a>

                      {s.status === 'Pending' && (
                        <>
                          <button
                            onClick={() => patch(`/stops/${s.stopId}/status`, { status: 'Arrived' }, `Arrived at “${s.locationAddress}”.`)}
                            disabled={isSubmitting}
                            className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                          >
                            Arrived
                          </button>
                          <button
                            onClick={() => patch(`/stops/${s.stopId}/status`, { status: 'Departed' }, `Left “${s.locationAddress}”. Next stop is updated below.`)}
                            disabled={isSubmitting}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Departed
                          </button>
                        </>
                      )}

                      {['Arrived', 'Departed'].includes(s.status) && (
                        <button
                          onClick={() => patch(`/stops/${s.stopId}/status`, { status: 'Arrived' }, `Arrival at “${s.locationAddress}” recorded again.`)}
                          disabled={isSubmitting}
                          className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                        >
                          Arrived
                        </button>
                      )}
                    </div>

                    {/* Delivery + failure zone */}
                    {['Arrived', 'Departed', 'Pending'].includes(s.status) && s.stopType === 'Dropoff' && (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-xs font-semibold text-slate-700">Finish this stop</p>
                        <label className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                          {uploadingId === s.stopId ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-[#0e7a70]" aria-hidden />
                          ) : receipts[s.stopId] ? (
                            <Icons.CheckCircle className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <Icons.Upload className="h-3.5 w-3.5" />
                          )}
                            <span>{uploadingId === s.stopId ? 'Uploading photo…' : receipts[s.stopId] ? 'Receipt attached. Tap to retake.' : 'Take / upload receipt photo (required)'}</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/heic,image/webp"
                            capture="environment"
                            className="hidden"
                            disabled={isSubmitting}
                            aria-label={`Receipt photo for ${s.locationAddress}`}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadReceipt(s.stopId, f); e.target.value = ''; }}
                          />
                        </label>
                        <input
                          className="mt-2 block w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-[#0e7a70] focus:outline-none"
                          placeholder="Driver notes (optional, e.g. left with guard)"
                          value={notes[s.stopId] ?? ''}
                          onChange={(e) => setNotes((n) => ({ ...n, [s.stopId]: e.target.value }))}
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            onClick={() => markDelivered(s)}
                            disabled={isSubmitting || !receipts[s.stopId]}
                            title={!receipts[s.stopId] ? 'Attach the receipt photo first' : 'Mark this stop delivered'}
                            aria-disabled={!receipts[s.stopId]}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                          >
                            <Icons.Check className="h-3.5 w-3.5" />Mark Delivered
                          </button>
                          <button
                            onClick={() => { setFailFor(failFor === s.stopId ? '' : s.stopId); setFailReason(''); }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            <Icons.X className="h-3.5 w-3.5" />Mark Failed
                          </button>
                        </div>
                        {!receipts[s.stopId] && (
                          <p className="mt-1 text-xs text-amber-700">Attach receipt photo first — Delivered stays disabled until the photo is attached.</p>
                        )}
                        {failFor === s.stopId && (
                          <div className="mt-2 space-y-2">
                            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Failure reason">
                              {['Store closed', 'Wrong address', 'Refused', 'No one to receive', 'Other'].map((chip) => (
                                <button
                                  key={chip}
                                  type="button"
                                  onClick={() => setFailReason(chip === 'Other' ? '' : chip)}
                                  aria-pressed={failReason === chip}
                                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${failReason === chip ? 'border-red-600 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                                >
                                  {chip}
                                </button>
                              ))}
                            </div>
                            <div className="flex gap-2">
                            <input
                              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-[#0e7a70] focus:outline-none"
                              placeholder="Why did delivery fail? (required)"
                              value={failReason}
                              onChange={(e) => setFailReason(e.target.value)}
                              aria-label={`Failure reason for ${s.locationAddress}`}
                            />
                            <button
                              onClick={() => markFailed(s)}
                              disabled={isSubmitting}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                            >
                              Confirm
                            </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            );
          })}
        </div>
      ) : loading ? null : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 py-16 text-center">
          <h3 className="mt-4 text-lg font-semibold text-slate-900">No assigned route</h3>
          <p className="mt-2 text-sm text-slate-500">Check back later for updates</p>
          <button onClick={load} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Icons.Refresh className="h-4 w-4" />Refresh
          </button>
        </div>
      )}
    </Shell>
  );
}
