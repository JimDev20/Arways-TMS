'use client';
import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Shell } from '@/components/Shell';
import { CancelOrderSection } from '@/components/CancelOrder';
import { coordsOf, navigateHref, type MapPin } from '@/lib/map';
import { api } from '@/lib/supabase';
import { Icons } from '@/lib/createLucideIcon';
import { errorMessage, type OrderDetail, type OrderPriority } from '@/lib/types';
import { PriorityBadge } from '@/components/PriorityBadge';

const MapView = dynamic(() => import('@/components/MapView').then((m) => m.MapView), { ssr: false });

export default function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [reason, setReason] = useState('');
  const [reasonKind, setReasonKind] = useState<string>('Wrong dock');
  const REJECT_REASONS = ['Wrong dock', 'Truck unavailable', 'Incomplete pins', 'Other'] as const;
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [priority, setPriority] = useState<OrderPriority>('Normal');
  const [notes, setNotes] = useState('');

  const load = useCallback(() => {
    api<OrderDetail>(`/orders/${id}`)
      .then((d) => {
        setDetail(d);
        setErr('');
        setDate(d.order?.scheduledDate ?? '');
        setTime(d.order?.scheduledTime ?? '');
        setPriority((d.order as { priority?: OrderPriority } | undefined)?.priority ?? 'Normal');
        setNotes(d.order?.specialInstructions ?? '');
      })
      .catch((e: unknown) => setErr(errorMessage(e, 'Could not load the order.')));
  }, [id]);
  useEffect(() => {
    api<OrderDetail>(`/orders/${id}`)
      .then((d) => {
        setDetail(d);
        setErr('');
        setDate(d.order?.scheduledDate ?? '');
        setTime(d.order?.scheduledTime ?? '');
        setPriority((d.order as { priority?: OrderPriority } | undefined)?.priority ?? 'Normal');
        setNotes(d.order?.specialInstructions ?? '');
      })
      .catch((e: unknown) => setErr(errorMessage(e, 'Could not load the order.')));
  }, [id]);

  async function approve() {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/orders/${id}/approve`, { method: 'PATCH' });
      setMsg({ type: 'success', text: 'Order approved. The driver was notified.' });
      load();
    } catch (e: unknown) {
      setMsg({ type: 'error', text: errorMessage(e, 'Could not approve. Try again.') });
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    const finalReason = reasonKind === 'Other' ? reason.trim() : reasonKind;
    if (!finalReason) { setMsg({ type: 'error', text: 'A rejection reason is required. Pick a reason or type why this order is rejected first.' }); return; }
    setBusy(true);
    setMsg(null);
    try {
      await api(`/orders/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ reason: finalReason }) });
      setMsg({ type: 'success', text: 'Order rejected. The client was notified.' });
      load();
    } catch (e: unknown) {
      setMsg({ type: 'error', text: errorMessage(e, 'Could not reject. Try again.') });
    } finally {
      setBusy(false);
    }
  }

  async function saveModify(e: React.FormEvent) {
    e.preventDefault();
    if (!date) { setMsg({ type: 'error', text: 'Scheduled date is empty. Pick a date first.' }); return; }
    if (!time) { setMsg({ type: 'error', text: 'Scheduled time is empty. Pick a time first.' }); return; }
    setBusy(true);
    setMsg(null);
    try {
      await api(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ scheduledDate: date, scheduledTime: time, specialInstructions: notes, priority }) });
      setMsg({ type: 'success', text: 'Order updated. The new schedule applies immediately.' });
      setEditOpen(false);
      load();
    } catch (e: unknown) {
      setMsg({ type: 'error', text: errorMessage(e, 'Could not update. Try again.') });
    } finally {
      setBusy(false);
    }
  }

  const pins: MapPin[] = (detail?.stops ?? [])
    .map((s) => {
      const c = coordsOf(s.locationCoordinates);
      return c ? { ...c, label: `#${s.stopSequence} ${s.stopType} · ${s.locationAddress}` } : null;
    })
    .filter((p): p is MapPin => p !== null);

  // Pin completeness at a glance: approval completes a sure route, so
  // every location must already be pinned.
  const unpinned = (detail?.stops ?? []).filter((s) => !coordsOf(s.locationCoordinates));

  // Dispatch area and pickup area are the same place: navigate to it
  // using the pickup stop's coordinates.
  const pickupStop = (detail?.stops ?? []).find((s) => s.stopType === 'Pickup') ?? null;

  return (
    <Shell role="Secretary" title={`Order Approval${detail?.order ? `: ${detail.order.orderReference}` : ''}`}>
      {!detail && !err && <p className="rounded-xl bg-white py-10 text-center text-sm text-slate-500 shadow-sm">Loading…</p>}
      {err && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{err}</div>}
      {msg && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm flex items-center gap-2 ${msg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}
          role={msg.type === 'error' ? 'alert' : 'status'}>
          {msg.type === 'error' ? <Icons.AlertCircle className="h-5 w-5 shrink-0" /> : <Icons.CheckCircle className="h-5 w-5 shrink-0" />}
          {msg.text}
        </div>
      )}
      {detail?.order && (
        <div className="grid gap-6">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Client Information</h2>
            {detail.client ? (
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-slate-500">Company</dt><dd className="font-medium">{detail.client.companyName}</dd></div>
                <div><dt className="text-slate-500">Contact</dt><dd className="font-medium">{detail.client.contactPerson} · {detail.client.phone}</dd></div>
                <div><dt className="text-slate-500">Email</dt><dd className="font-medium">{detail.client.email}</dd></div>
                <div><dt className="text-slate-500">Dispatch area</dt><dd className="font-medium">{detail.client.dispatchAreaAddress}</dd></div>
              </dl>
            ) : (
              <p className="text-sm text-slate-400">No linked client company record.</p>
            )}
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Delivery Details</h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Reference</dt><dd className="font-medium">{detail.order.orderReference}</dd></div>
              <div><dt className="text-slate-500">Status</dt><dd className="font-medium">{detail.order.status}</dd></div>
              <div><dt className="text-slate-500">Priority</dt><dd className="font-medium"><PriorityBadge priority={(detail.order as { priority?: OrderPriority }).priority} /></dd></div>
              <div><dt className="text-slate-500">Schedule</dt><dd className="font-medium">{detail.order.scheduledDate} at {detail.order.scheduledTime}</dd></div>
              <div><dt className="text-slate-500">Instructions</dt><dd className="font-medium">{detail.order.specialInstructions ?? '-'}</dd></div>
              <div>
                <dt className="text-slate-500">Pickup navigation</dt>
                <dd className="font-medium">
                  {pickupStop ? (
                    <a
                      href={navigateHref(pickupStop.locationAddress, pickupStop.locationCoordinates)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Icons.MapPin className="h-3.5 w-3.5" />
                      Navigate to dispatch area
                    </a>
                  ) : '-'}
                </dd>
              </div>
            </dl>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {(detail.stops ?? []).map((s) => (
                <li key={s.stopId} className="py-1.5 text-slate-700">#{s.stopSequence} {s.stopType} · {s.locationAddress} ({s.status})</li>
              ))}
            </ul>
            {unpinned.length === 0 ? (
              <p className="mt-2 text-xs font-medium text-green-700">All locations pinned.</p>
            ) : (
              <p className="mt-2 text-xs font-medium text-amber-700" role="alert">
                Missing pins: {unpinned.map((s) => s.locationAddress).join(', ')}. Pin all locations before approving.
              </p>
            )}
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Truck & Driver</h2>
            {detail.truck ? (
              <dl className="grid gap-2 text-sm sm:grid-cols-3">
                <div><dt className="text-slate-500">Truck</dt><dd className="font-medium">{detail.truck.plateNumber} ({detail.truck.truckSize ?? '6W'} · {detail.truck.truckType})</dd></div>
                <div><dt className="text-slate-500">Driver</dt><dd className="font-medium">{detail.driver?.fullName ?? '-'}</dd></div>
                <div><dt className="text-slate-500">Truck status</dt><dd className="font-medium">{detail.truck.status}</dd></div>
              </dl>
            ) : (
              <p className="text-sm text-slate-400">No truck linked.</p>
            )}
          </div>

          {pins.length > 0 && (
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-slate-900">Map View</h2>
              <MapView pins={pins} />
            </div>
          )}

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Secretary Action</h2>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button onClick={approve} disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#0e7a70] py-2.5 text-sm font-semibold text-white hover:bg-[#0b625a] disabled:opacity-60">
                <Icons.Check className="h-4 w-4" />{busy ? 'Working…' : 'Approve Order'}
              </button>
              <button onClick={() => setEditOpen((v) => !v)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Modify Order
              </button>
            </div>
            {editOpen && (
              <form onSubmit={saveModify} className="mt-4 grid gap-3 rounded-lg border border-slate-200 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm font-medium text-slate-700">Date
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
                  </label>
                  <label className="text-sm font-medium text-slate-700">Time
                    <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
                  </label>
                  <label className="col-span-2 text-sm font-medium text-slate-700">Priority
                    <select value={priority} onChange={(e) => setPriority(e.target.value as OrderPriority)}
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" aria-label="Order priority">
                      <option value="Normal">Normal</option>
                      <option value="Urgent">Urgent</option>
                      <option value="Rush">Rush</option>
                    </select>
                  </label>
                </div>
                <label className="text-sm font-medium text-slate-700">Special instructions
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                    className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <button type="submit" disabled={busy}
                  className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
                  {busy ? 'Saving…' : 'Save Changes'}
                </button>
                <p className="text-xs text-slate-400">Only Pending orders can be modified.</p>
              </form>
            )}
            <div className="mt-4">
              <label className="text-sm font-medium text-slate-700" htmlFor="reject-reason-kind">Rejection reason (required to reject)</label>
              <select
                id="reject-reason-kind"
                value={reasonKind}
                onChange={(e) => setReasonKind(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {REJECT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              {reasonKind === 'Other' && (
                <input id="reject-reason" value={reason} onChange={(e) => setReason(e.target.value)}
                  className="mt-2 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none"
                  placeholder="Type why this order is rejected…" />
              )}
              <button onClick={reject} disabled={busy}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">
                <Icons.X className="h-4 w-4" />{busy ? 'Working…' : 'Reject Order'}
              </button>
            </div>
            <button onClick={() => router.push('/secretary/approvals')}
              className="mt-4 text-sm font-medium text-slate-500 hover:text-slate-800">← Back to queue</button>
          </div>
          {detail.order && ['Approved', 'In Transit'].includes(detail.order.status) && (
            <CancelOrderSection
              orderId={detail.order.orderId}
              orderReference={detail.order.orderReference}
              onDone={load}
            />
          )}
        </div>
      )}
    </Shell>
  );
}
