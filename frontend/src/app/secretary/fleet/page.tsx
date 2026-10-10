'use client';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { DriverBadge } from '@/components/DriverBadge';
import { api } from '@/lib/supabase';
import { Icons } from '@/lib/createLucideIcon';
import { errorMessage, type MaintenanceLog, type TruckWithDriver } from '@/lib/types';

/**
 * Secretary Fleet (Improvement Roadmap #10).
 * Secretary can edit trucks on the server but had no Fleet link — this page
 * gives dispatchers the fleet view: list + filters + vehicle detail +
 * maintenance log + record service. Truck add/assignment stays on Owner Fleet.
 */
export default function SecretaryFleetPage() {
  const [trucks, setTrucks] = useState<TruckWithDriver[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All');
  const [err, setErr] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [maint, setMaint] = useState<MaintenanceLog[]>([]);
  const [mDate, setMDate] = useState(new Date().toISOString().slice(0, 10));
  const [mNote, setMNote] = useState('');
  const [mDue, setMDue] = useState('');
  const [mMsg, setMMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [mBusy, setMBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api<TruckWithDriver[]>('/trucks')
      .then((t) => { if (live) setTrucks(t); })
      .catch((e) => { if (live) setErr(errorMessage(e, 'Could not load fleet.')); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let live = true;
    api<MaintenanceLog[]>(`/trucks/${selectedId}/maintenance`)
      .then((list) => { if (live) setMaint(list); })
      .catch(() => {});
    return () => { live = false; };
  }, [selectedId]);

  const filtered = trucks.filter((t) => {
    if (status !== 'All' && t.status !== status) return false;
    if (q && !t.plateNumber.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
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
      setMMsg({ type: 'error', text: errorMessage(e, 'Could not record service.') });
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
      {err && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{err}</div>}
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search plate number…"
          aria-label="Search fleet"
          className="min-w-52 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          {['All', 'Available', 'In Use', 'Maintenance'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="self-center text-xs text-slate-500">{filtered.length} of {trucks.length}</span>
      </div>
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
            {filtered.map((t) => (
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
        {filtered.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No trucks match. Try a different search or filter.</p>}
      </div>
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
