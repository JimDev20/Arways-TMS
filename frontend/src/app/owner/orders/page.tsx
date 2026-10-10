'use client';
import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { CancelOrderSection } from '@/components/CancelOrder';
import { api } from '@/lib/supabase';
import { Icons } from '@/lib/createLucideIcon';
import { errorMessage, type Order, type OrderDetail } from '@/lib/types';
import { PriorityBadge } from '@/components/PriorityBadge';

const STATUSES = ['All', 'Pending', 'Approved', 'In Transit', 'Completed', 'Rejected', 'Cancelled'];

export default function OwnerOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All');
  const [detail, setDetail] = useState<OrderDetail | { error: string } | null>(null);
  const [detailId, setDetailId] = useState('');
  const loadOrders = useCallback(() => {
    api<Order[]>('/orders').then(setOrders).catch(() => {});
  }, []);
  useEffect(() => {
    let live = true;
    api<Order[]>('/orders')
      .then((list) => {
        if (live) setOrders(list);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const filtered = orders.filter((o) => {
    if (status !== 'All' && o.status !== status) return false;
    if (q && !o.orderReference.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  async function openDetail(id: string) {
    if (detailId === id) { setDetailId(''); setDetail(null); return; }
    setDetailId(id); setDetail(null);
    try {
      setDetail(await api<OrderDetail>(`/orders/${id}`));
    } catch (e: unknown) {
      setDetail({ error: errorMessage(e, 'Could not load details.') });
    }
  }

  async function reloadDetail(id: string) {
    setDetail(null);
    try {
      setDetail(await api<OrderDetail>(`/orders/${id}`));
    } catch (e: unknown) {
      setDetail({ error: errorMessage(e, 'Could not load details.') });
    }
  }

  function refreshAfterAction(orderId: string) {
    loadOrders();
    reloadDetail(orderId);
  }

  return (
    <Shell role="Owner" title="Orders">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Icons.Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            className="block w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
            placeholder="Search reference…"
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
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">Reference</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold">Priority</th>
                <th className="px-6 py-3 font-semibold">Date</th>
                <th className="px-6 py-3 font-semibold">Time</th>
                <th className="px-6 py-3 font-semibold"><span className="sr-only">Details</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((o) => (
                <Fragment key={o.orderId}>
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-slate-900">{o.orderReference}</td>
                    <td className="px-6 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      o.status === 'Pending' ? 'bg-amber-50 text-amber-700' :
                      o.status === 'Approved' || o.status === 'In Transit' ? 'bg-blue-50 text-blue-700' :
                      o.status === 'Completed' ? 'bg-green-50 text-green-700' :
                      o.status === 'Cancelled' ? 'bg-slate-100 text-slate-600' :
                      'bg-red-50 text-red-700'
                    }`}>{o.status}</span>
                    </td>
                    <td className="px-6 py-3">
                      <PriorityBadge priority={o.priority} />
                    </td>
                    <td className="px-6 py-3 text-slate-600">{o.scheduledDate}</td>
                    <td className="px-6 py-3 text-slate-600">{o.scheduledTime}</td>
                    <td className="px-6 py-3 text-right">
                      <button onClick={() => openDetail(o.orderId)} className="font-medium text-[#0e7a70] hover:underline">
                        {detailId === o.orderId ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  </tr>
                  {detailId === o.orderId && (
                    <tr>
                      <td colSpan={6} className="bg-slate-50 px-6 py-4 text-sm">
                        {!detail ? (
                          <p className="text-slate-500">Loading…</p>
                        ) : 'error' in detail ? (
                          <p className="text-red-700" role="alert">{detail.error}</p>
                        ) : (
                          <div>
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div><p className="text-xs font-semibold uppercase text-slate-500">Route</p><p className="font-medium">{detail.route?.routeNumber ?? '-'} ({detail.route?.status ?? '-'})</p></div>
                              <div><p className="text-xs font-semibold uppercase text-slate-500">Instructions</p><p>{o.specialInstructions ?? '-'}</p></div>
                              <div>
                                <p className="text-xs font-semibold uppercase text-slate-500">Stops ({detail.stops?.length ?? 0})</p>
                                <ul className="mt-1 space-y-1">
                                  {(detail.stops ?? []).map((s) => (
                                    <li key={s.stopId} className="text-slate-700">#{s.stopSequence} {s.stopType} · {s.locationAddress} ({s.status})</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
                              <Link href={`/owner/approvals/${o.orderId}`} className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400">
                                Open approval detail →
                              </Link>
                            </div>
                            {o.status === 'Pending' && (
                              <OwnerApprovalActions order={o} onDone={() => refreshAfterAction(o.orderId)} />
                            )}
                            {['Approved', 'In Transit'].includes(o.status) && (
                              <CancelOrderSection
                                orderId={o.orderId}
                                orderReference={o.orderReference}
                                onDone={() => refreshAfterAction(o.orderId)}
                              />
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400">No orders match. Try a different search or filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}

/** Inline approve / reject / modify for Pending orders (Owner acts directly). */
function OwnerApprovalActions({ order, onDone }: { order: Order; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [date, setDate] = useState(order.scheduledDate);
  const [time, setTime] = useState(order.scheduledTime);
  const [notes, setNotes] = useState(order.specialInstructions ?? '');

  async function approve() {
    setBusy(true); setMsg(null);
    try {
      await api(`/orders/${order.orderId}/approve`, { method: 'PATCH' });
      setMsg({ type: 'success', text: `Order ${order.orderReference} approved. The driver was notified.` });
      onDone();
    } catch (e: unknown) {
      setMsg({ type: 'error', text: errorMessage(e, 'Could not approve. Try again.') });
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!reason.trim()) {
      setMsg({ type: 'error', text: 'A rejection reason is required. Type why this order is rejected, then press Reject again.' });
      return;
    }
    setBusy(true); setMsg(null);
    try {
      await api(`/orders/${order.orderId}/reject`, { method: 'PATCH', body: JSON.stringify({ reason: reason.trim() }) });
      setMsg({ type: 'success', text: `Order ${order.orderReference} rejected. The client was notified.` });
      onDone();
      setReason('');
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
    setBusy(true); setMsg(null);
    try {
      await api(`/orders/${order.orderId}`, { method: 'PATCH', body: JSON.stringify({ scheduledDate: date, scheduledTime: time, specialInstructions: notes }) });
      setMsg({ type: 'success', text: 'Order updated. The new schedule applies immediately.' });
      setEditOpen(false);
      onDone();
    } catch (e: unknown) {
      setMsg({ type: 'error', text: errorMessage(e, 'Could not update. Try again.') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-slate-900">Owner Action</p>
      {msg && (
        <div className={`mb-3 rounded-lg px-4 py-2.5 text-sm flex items-center gap-2 ${msg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}
          role={msg.type === 'error' ? 'alert' : 'status'}>
          {msg.type === 'error' ? <Icons.AlertCircle className="h-4 w-4 shrink-0" /> : <Icons.CheckCircle className="h-4 w-4 shrink-0" />}
          {msg.text}
        </div>
      )}
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
        <form onSubmit={saveModify} className="mt-3 grid gap-3 rounded-lg border border-slate-200 p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium text-slate-700">Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
            </label>
            <label className="text-sm font-medium text-slate-700">Time
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
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
      <div className="mt-3">
        <label className="text-sm font-medium text-slate-700" htmlFor={`owner-reject-${order.orderId}`}>Rejection reason (required to reject)</label>
        <input id={`owner-reject-${order.orderId}`} value={reason} onChange={(e) => setReason(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none"
          placeholder="Type why this order is rejected…" />
        <button onClick={reject} disabled={busy}
          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">
          <Icons.X className="h-4 w-4" />{busy ? 'Working…' : 'Reject Order'}
        </button>
      </div>
    </div>
  );
}
