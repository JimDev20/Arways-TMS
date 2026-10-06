'use client';
import { useState } from 'react';
import { api } from '@/lib/supabase';
import { Icons } from '@/lib/createLucideIcon';
import { errorMessage } from '@/lib/types';

/**
 * Shared cancel-order section (Owner + Secretary detail views).
 * Cancelling closes the order and its route, frees the truck, notifies
 * driver + client, and removes the route from the driver portal.
 * Two clicks + required reason: destructive actions need friction.
 */
export function CancelOrderSection({
  orderId,
  orderReference,
  onDone,
}: {
  orderId: string;
  orderReference: string;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function cancel() {
    if (!reason.trim()) {
      setMsg({ type: 'error', text: 'A cancellation reason is required. Type why this order is cancelled first.' });
      return;
    }
    if (!confirming) {
      setConfirming(true);
      setMsg(null);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api(`/orders/${orderId}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason: reason.trim() }) });
      setMsg({ type: 'success', text: `Order ${orderReference} cancelled. The driver and client were notified.` });
      setReason('');
      setConfirming(false);
      onDone();
    } catch (e: unknown) {
      setMsg({ type: 'error', text: errorMessage(e, 'Could not cancel. Try again.') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-1 text-sm font-semibold text-slate-900">Cancel Order</p>
      <p className="mb-3 text-xs text-slate-500">Closes the order and its route, frees the truck, and removes it from the driver portal.</p>
      {msg && (
        <div className={`mb-3 rounded-lg px-4 py-2.5 text-sm flex items-center gap-2 ${msg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}
          role={msg.type === 'error' ? 'alert' : 'status'}>
          {msg.type === 'error' ? <Icons.AlertCircle className="h-4 w-4 shrink-0" /> : <Icons.CheckCircle className="h-4 w-4 shrink-0" />}
          {msg.text}
        </div>
      )}
      <label className="text-sm font-medium text-slate-700" htmlFor={`cancel-reason-${orderId}`}>Cancellation reason (required)</label>
      <input
        id={`cancel-reason-${orderId}`}
        value={reason}
        onChange={(e) => { setReason(e.target.value); setConfirming(false); }}
        className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#f5a623] focus:outline-none"
        placeholder="Type why this order is cancelled…"
      />
      <button
        onClick={cancel}
        disabled={busy}
        className={`mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 ${
          confirming ? 'bg-red-600 text-white hover:bg-red-700' : 'border border-red-200 text-red-600 hover:bg-red-50'
        }`}
      >
        <Icons.X className="h-4 w-4" />{busy ? 'Working…' : confirming ? 'Click again to confirm cancel' : 'Cancel Order'}
      </button>
    </div>
  );
}
