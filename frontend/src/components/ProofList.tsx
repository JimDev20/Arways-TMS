'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/supabase';
import { Icons } from '@/lib/createLucideIcon';
import { SearchField } from '@/components/SearchField';
import { ListSkeleton } from '@/components/saas';
import { errorMessage, type ProofItem } from '@/lib/types';

/** Shared proof-of-delivery list. Role only affects the surrounding Shell. */
export function ProofList() {
  const [items, setItems] = useState<ProofItem[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => {
    setLoading(true);
    setErr('');
    api<ProofItem[]>('/proof').then(setItems).catch((e: unknown) => {
      setErr(errorMessage(e, 'Could not load proof records. Check your connection and try again.'));
    }).finally(() => setLoading(false));
  }, [retryKey]);

  const filtered = items.filter((p) =>
    !q.trim() ||
    `${p.orderReference} ${p.routeNumber} ${p.driverName} ${p.stop.locationAddress}`.toLowerCase().includes(q.trim().toLowerCase()),
  );

  if (err) return (
    <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
      {err}{' '}
      <button onClick={() => setRetryKey((k) => k + 1)} className="font-medium underline hover:no-underline">Retry</button>
    </div>
  );
  if (loading) {
    return <ListSkeleton rows={4} />;
  }
  if (items.length === 0) {
    return <p className="rounded-xl bg-white py-10 text-center text-sm text-slate-400 shadow-sm">No deliveries completed yet. Proof photos appear here after drivers mark stops delivered.</p>;
  }
  return (
    <div>
      <SearchField
        value={q}
        onChange={setQ}
        placeholder="Search reference, route, driver, address…"
        label="Search proof records"
        className="mb-4"
        inputClassName="block w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-9 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
      />
      {items.length > 0 && (
        <p role="status" className="mb-3 text-xs text-slate-500">{filtered.length} of {items.length} records</p>
      )}
      {filtered.length === 0 && (
        <div className="rounded-xl bg-white py-10 text-center shadow-sm">
          <p className="text-sm text-slate-400">No proof records match. Try a different search.</p>
          <button onClick={() => setQ('')} className="btn-ghost mt-3 text-sm">Clear filter</button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((p) => (
        <div key={p.stop.stopId} className="rounded-xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">{p.orderReference} · Stop #{p.stop.stopSequence}</h2>
            <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">Delivered</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{p.stop.locationAddress}</p>
          <p className="mt-1 text-xs text-slate-500">
            {p.routeNumber} · Driver {p.driverName}
            {p.stop.deliveredAt ? ` · ${String(p.stop.deliveredAt).slice(0, 16).replace('T', ' ')}` : ''}
          </p>
          {p.stop.driverNotes && (
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">“{p.stop.driverNotes}”</p>
          )}
          <div className="mt-3 flex gap-2">
            {p.stop.receiptPhotoUrl ? (
              <>
                <a href={p.stop.receiptPhotoUrl} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <Icons.Search className="h-4 w-4" />View Full Size
                </a>
                <a href={p.stop.receiptPhotoUrl} download
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <Icons.Download className="h-4 w-4" />Download
                </a>
              </>
            ) : (
              <p className="text-xs text-slate-400">No receipt photo attached.</p>
            )}
          </div>
        </div>
        ))}
      </div>
    </div>
  );
}
