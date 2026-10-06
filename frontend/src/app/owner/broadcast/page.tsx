'use client';
import { useState } from 'react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/supabase';
import { Icons } from '@/lib/createLucideIcon';
import { errorMessage } from '@/lib/types';

const AUDIENCES = [
  { value: 'all', label: 'Everyone (all active members)' },
  { value: 'drivers', label: 'Drivers only' },
  { value: 'clients', label: 'Clients only' },
  { value: 'secretaries', label: 'Secretaries only' },
] as const;

/** Owner composes announcements delivered as notifications + toasts. */
export default function OwnerBroadcastPage() {
  const [audience, setAudience] = useState<string>('drivers');
  const [message, setMessage] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text) { setMsg({ type: 'error', text: 'Message is empty. Type the announcement first.' }); return; }
    if (text.length > 500) { setMsg({ type: 'error', text: `Message is ${text.length}/500 characters. Shorten it to 500 or fewer.` }); return; }
    if (!confirming) { setConfirming(true); setMsg(null); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await api<{ ok: boolean; sent: number }>('/broadcasts', {
        method: 'POST',
        body: JSON.stringify({ audience, message: text }),
      });
      setMsg({ type: 'success', text: `Announcement sent to ${res.sent} member${res.sent === 1 ? '' : 's'}. It appears as a toast and in their notifications.` });
      setMessage('');
      setConfirming(false);
    } catch (err: unknown) {
      setMsg({ type: 'error', text: errorMessage(err, 'Could not send the announcement. Try again.') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell role="Owner" title="Broadcast Announcement">
      <div className="grid max-w-2xl gap-6">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Compose</h2>
          <p className="mb-4 text-sm text-slate-500">Announcements arrive as toast popups and notification-center entries. Sending takes two clicks.</p>
          {msg && (
            <div className={`mb-4 rounded-lg px-4 py-2.5 text-sm flex items-center gap-2 ${msg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}
              role={msg.type === 'error' ? 'alert' : 'status'}>
              {msg.type === 'error' ? <Icons.AlertCircle className="h-4 w-4 shrink-0" /> : <Icons.CheckCircle className="h-4 w-4 shrink-0" />}
              {msg.text}
            </div>
          )}
          <form onSubmit={send} className="grid gap-4">
            <div className="grid gap-2">
              <label className="block text-sm font-medium text-slate-700" htmlFor="bc-audience">Audience *</label>
              <select id="bc-audience" value={audience} onChange={(e) => { setAudience(e.target.value); setConfirming(false); }}
                className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#f5a623] focus:outline-none focus:ring-1 focus:ring-[#f5a623]">
                {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div className="grid gap-2">
              <label className="block text-sm font-medium text-slate-700" htmlFor="bc-message">Message * (max 500)</label>
              <textarea id="bc-message" value={message} onChange={(e) => { setMessage(e.target.value); setConfirming(false); }} rows={3}
                aria-describedby="bc-message-hint"
                placeholder="Warehouse closed Friday. Plan pickups for Thursday."
                className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#f5a623] focus:outline-none focus:ring-1 focus:ring-[#f5a623]" />
              <p id="bc-message-hint" className={`text-xs ${message.trim().length > 500 ? 'text-red-600' : 'text-slate-400'}`}>
                {message.trim().length}/500 characters. Keep it to one fact and one action.
              </p>
            </div>
            <button type="submit" disabled={busy}
              className={`rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${confirming ? 'bg-red-600 hover:bg-red-700' : 'bg-[#f5a623] hover:bg-[#e69b1e]'}`}>
              {busy ? 'Sending…' : confirming ? 'Click again to confirm send' : 'Send Announcement'}
            </button>
          </form>
        </div>
      </div>
    </Shell>
  );
}
