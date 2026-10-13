'use client';
import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { DriverBadge } from '@/components/DriverBadge';
import { api } from '@/lib/supabase';
import { Icons } from '@/lib/createLucideIcon';
import { errorMessage, type MaintenanceLog, type Page, type TruckWithDriver } from '@/lib/types';
import { SearchField } from '@/components/SearchField';
import { Pager, TableSkeleton } from '@/components/saas';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

/**
 * Secretary Fleet (Improvement Roadmap #10).
 * Secretary can edit trucks on the server but had no Fleet link — this page
 * gives dispatchers the fleet view: list + filters + vehicle detail +
 * maintenance log + record service. Truck add/assignment stays on Owner Fleet.
 */
const PAGE_SIZE = 20;
export default function SecretaryFleetPage() {
  const [trucks, setTrucks] = useState<TruckWithDriver[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All');
  const debouncedQ = useDebouncedValue(q);
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listErr, setListErr] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [maint, setMaint] = useState<MaintenanceLog[]>([]);
  const [mDate, setMDate] = useState(new Date().toISOString().slice(0, 10));
  const [mNote, setMNote] = useState('');
  const [mDue, setMDue] = useState('');
  const [mMsg, setMMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [mBusy, setMBusy] = useState(false);

  // Server-side search, filter and cursor pagination (§3.7).
  const loadPage = useCallback((p: number, stack: (string | null)[], silent: boolean, qq: string, st: string) => {
    if (!silent) setLoading(true);
    setListErr('');
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    const cur = stack[p - 1];
    if (cur) params.set('cursor', cur);
    if (st !== 'All') params.set('status', st);
    if (qq.trim()) params.set('q', qq.trim());
    return api<Page<TruckWithDriver>>(`/trucks?${params.toString()}`)
      .then((r) => {
        setTrucks(r.items);
        setNextCursor(r.nextCursor);
        setTotal(r.total);
      })
      .catch((e: unknown) => {
        setListErr(errorMessage(e, 'Could not load fleet. Check your connection and try again.'));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const stack: (string | null)[] = [null];
    setPage(1);
    setCursors(stack);
    loadPage(1, stack, false, debouncedQ, status);
  }, [debouncedQ, status, loadPage]);

  const hasFilter = debouncedQ.trim() !== '' || status !== 'All';
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function nextPage() {
    if (!nextCursor) return;
    const stack = [...cursors, nextCursor];
    setCursors(stack);
    const p = page + 1;
    setPage(p);
    loadPage(p, stack, false, debouncedQ, status);
  }

  function prevPage() {
    if (page <= 1) return;
    const p = page - 1;
    setPage(p);
    loadPage(p, cursors, false, debouncedQ, status);
  }

  useEffect(() => {
    if (!selectedId) return;
    let live = true;
    api<MaintenanceLog[]>(`/trucks/${selectedId}/maintenance`)
      .then((list) => { if (live) setMaint(list); })
      .catch(() => {});
    return () => { live = false; };
  }, [selectedId]);

  const selected = trucks.find((t) => t.truckId === selectedId) ?? null;

  async function recordService(e: React.FormEvent) {
    e.preventDefault();
    setMMsg(null);
    if (!selected) return;
    if (!mDate) { setMMsg({ type: 'error', text: 'Service date is empty. Pick the date the work was done.' }); return; }
    if (!mNote.trim()) { setMMsg({ type: 'error', text: 'Note is empty. Describe what was serviced.' }); return; }
    if (mDue && mDue < mDate) { setMMsg({ type: 'error', text: 'Next due is before the service date.' }); return; }
    setMBusy(true);
    try {
      await api(`/trucks/${selected.truckId}/maintenance`, {
        method: 'POST',
        body: JSON.stringify({ performedAt: mDate, note: mNote.trim(), nextDue: mDue || null }),
      });
      setMMsg({ type: 'success', text: 'Service recorded.' });
      setMNote('');
      setMDue('');
      const list = await api<MaintenanceLog[]>(`/trucks/${selected.truckId}/maintenance`).catch(() => []);
      setMaint(list);
    } catch (e: unknown) {
      setMMsg({ type: 'error', text: errorMessage(e, 'Could not record service. Check your connection and try again.') });
    } finally {
      setMBusy(false);
    }
  }

  return (
    <Shell role="Secretary" title="Fleet">
      <p className="mb-4 flex items-center gap-2 text-sm text-slate-500">
        <Icons.Info className="h-4 w-4" />
        One truck = one driver only. Truck assignment changes go through Owner Fleet.
      </p>
      {listErr && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {listErr}{' '}
          <button onClick={() => loadPage(page, cursors, false, debouncedQ, status)} className="font-medium underline hover:no-underline">Retry</button>
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-3">
        <SearchField
          value={q}
          onChange={setQ}
          placeholder="Search by plate number (e.g. ABC 123)…"
          label="Search fleet"
          withIcon={false}
          className="min-w-52 flex-1"
          inputClassName="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-9 text-sm"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          {['All', 'Available', 'In Use', 'Maintenance'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="self-center text-xs text-slate-500" role="status">{total} trucks</span>
      </div>
      {loading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : (
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-slate-500">
              <th className="px-6 py-3 font-semibold">Plate Number</th>
              <th className="px-6 py-3 font-semibold">Type</th>
              <th className="px-6 py-3 font-semibold">Driver</th>
              <th className="px-6 py-3 font-semibold">Status</th>
              <th className="px-6 py-3"><span className="sr-only">Details</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {trucks.map((t) => (
              <tr key={t.truckId} className="hover:bg-slate-50">
                <td className="px-6 py-3 font-medium">{t.plateNumber}</td>
                <td className="px-6 py-3">{t.truckType}</td>
                <td className="px-6 py-3">{t.assignedDriverName ?? <span className="text-slate-400">Unassigned</span>} <DriverBadge availability={t.driverAvailability} /></td>
                <td className="px-6 py-3">{t.status}</td>
                <td className="px-6 py-3 text-right">
                  <button onClick={() => setSelectedId(selectedId === t.truckId ? '' : t.truckId)} className="font-medium text-[#0e7a70] hover:underline">
                    {selectedId === t.truckId ? 'Hide' : 'Details'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {trucks.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-400">{total === 0 && !hasFilter ? 'No trucks in the fleet yet.' : 'No trucks match. Try a different search or filter.'}</p>
            {hasFilter && (
              <button onClick={() => { setQ(''); setStatus('All'); }} className="btn-ghost mt-3 text-sm">Clear filter</button>
            )}
          </div>
        )}
      </div>
      )}
      {!loading && total > PAGE_SIZE && (
        <Pager
          page={page}
          totalPages={totalPages}
          total={total}
          noun="trucks"
          onPrev={prevPage}
          onNext={nextPage}
          hasNext={nextCursor !== null}
        />
      )}
      {selected && (
        <div className="card mt-6 p-6">
          <h2 className="text-lg font-semibold">Vehicle Details: {selected.plateNumber}</h2>
          <p className="mt-1 text-sm text-slate-600">{selected.truckType} · {selected.capacityKg} kg · Driver: {selected.assignedDriverName ?? 'Unassigned'}</p>
          <div className="mt-6 border-t pt-6">
            <h3 className="text-base font-semibold">Maintenance Log</h3>
            {maint.length === 0
              ? <p className="mt-2 text-sm text-slate-400">No service history yet.</p>
              : (
                <ul className="mt-2 divide-y text-sm">
                  {maint.map((m) => <li key={m.logId} className="py-2">{m.performedAt} · {m.note}{m.nextDue ? ` · next due ${m.nextDue}` : ''}</li>)}
                </ul>
              )}
            <form onSubmit={recordService} className="mt-4 grid max-w-lg gap-3">
              {mMsg && <div className={`rounded-lg px-4 py-2.5 text-sm ${mMsg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`} role={mMsg.type === 'error' ? 'alert' : 'status'}>{mMsg.text}</div>}
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">Service date *<input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} className="field mt-1" required /></label>
                <label className="text-sm">Next due<input type="date" value={mDue} onChange={(e) => setMDue(e.target.value)} className="field mt-1" /></label>
              </div>
              <label className="text-sm">What was serviced *<input value={mNote} onChange={(e) => setMNote(e.target.value)} placeholder="Oil change…" className="field mt-1" /></label>
              <button disabled={mBusy} className="rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{mBusy ? 'Recording…' : 'Record Service'}</button>
            </form>
          </div>
        </div>
      )}
    </Shell>
  );
}
