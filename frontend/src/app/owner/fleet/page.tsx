'use client';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { DriverBadge } from '@/components/DriverBadge';
import { api } from '@/lib/supabase';
import { Icons } from '@/lib/createLucideIcon';
import { errorMessage, TRUCK_SIZES, type MaintenanceLog, type Truck, type TruckSize, type TruckWithDriver, type UserRow } from '@/lib/types';
import { FieldHint } from '@/components/FieldHint';

function todayStr() { return new Date().toISOString().slice(0, 10); }

function dueBadge(nextDue: string | null): { text: string; urgent: boolean } | null {
  if (!nextDue) return null;
  const days = Math.round((new Date(nextDue).getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: `Overdue since ${nextDue}`, urgent: true };
  if (days <= 14) return { text: `Due ${nextDue} (in ${days} days)`, urgent: true };
  return { text: `Next due ${nextDue}`, urgent: false };
}

const TRUCK_STATUSES = ['All', 'Available', 'In Use', 'Maintenance'];
const TRUCK_TYPES = ['All', 'Refrigerated', 'Dry'];
const TRUCK_SIZE_FILTERS = ['All', ...TRUCK_SIZES];

export default function FleetPage() {
  const [trucks, setTrucks] = useState<TruckWithDriver[]>([]);
  const [drivers, setDrivers] = useState<UserRow[]>([]);
  const [form, setForm] = useState({ plateNumber: '', truckType: 'Refrigerated', truckSize: '6W' as TruckSize, capacityKg: 2000, assignedDriverId: '' });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All');
  const [type, setType] = useState('All');
  const [size, setSize] = useState('All');
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [edit, setEdit] = useState({ plateNumber: '', truckType: 'Refrigerated', truckSize: '6W' as TruckSize, capacityKg: 2000, status: 'Available', assignedDriverId: '' });
  const [mDate, setMDate] = useState(todayStr());
  const [mNote, setMNote] = useState('');
  const [mDue, setMDue] = useState('');
  const [mMsg, setMMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [mBusy, setMBusy] = useState(false);

  const [maintCache, setMaintCache] = useState<{ truckId: string; entries: MaintenanceLog[] } | null>(null);
  useEffect(() => {
    if (!selectedId) return;
    let live = true;
    api<MaintenanceLog[]>(`/trucks/${selectedId}/maintenance`)
      .then((list) => { if (live) setMaintCache({ truckId: selectedId, entries: list }); })
      .catch(() => {});
    return () => { live = false; };
  }, [selectedId]);
  const maint = maintCache && maintCache.truckId === selectedId ? maintCache.entries : [];

  async function addMaintenance(e: React.FormEvent) {
    e.preventDefault();
    setMMsg(null);
    if (!selected) return;
    if (!mDate) { setMMsg({ type: 'error', text: 'Service date is empty. Pick the date the work was done.' }); return; }
    if (!mNote.trim()) { setMMsg({ type: 'error', text: 'Note is empty. Describe what was serviced.' }); return; }
    if (mDue && mDue < mDate) { setMMsg({ type: 'error', text: 'Next due is before the service date. Pick a due date after the work was done.' }); return; }
    setMBusy(true);
    try {
      await api(`/trucks/${selected.truckId}/maintenance`, {
        method: 'POST',
        body: JSON.stringify({ performedAt: mDate, note: mNote.trim(), nextDue: mDue || undefined }),
      });
      setMNote(''); setMDue('');
      setMaintCache({
        truckId: selected.truckId,
        entries: await api<MaintenanceLog[]>(`/trucks/${selected.truckId}/maintenance`),
      });
      setMMsg({ type: 'success', text: 'Service entry recorded.' });
    } catch (err: unknown) {
      setMMsg({ type: 'error', text: errorMessage(err, 'Could not record the service entry. Try again.') });
    } finally {
      setMBusy(false);
    }
  }

  async function reload() {
    setTrucks(await api<TruckWithDriver[]>('/trucks'));
    const users = await api<UserRow[]>('/users');
    setDrivers(users.filter((u) => u.role === 'Driver'));
  }
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [t, users] = await Promise.all([api<TruckWithDriver[]>('/trucks'), api<UserRow[]>('/users')]);
        if (live) {
          setTrucks(t);
          setDrivers(users.filter((u) => u.role === 'Driver'));
        }
      } catch {
        /* list stays empty: user can retry */
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const filtered = trucks.filter((t) => {
    if (status !== 'All' && t.status !== status) return false;
    if (type !== 'All' && t.truckType !== type) return false;
    if (size !== 'All' && (t.truckSize ?? '6W') !== size) return false;
    if (q && !t.plateNumber.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const selected = trucks.find((t) => t.truckId === selectedId) ?? null;

  function startEdit() {
    if (!selected) return;
    setEdit({
      plateNumber: selected.plateNumber,
      truckType: selected.truckType,
      truckSize: selected.truckSize ?? '6W',
      capacityKg: selected.capacityKg,
      status: selected.status,
      assignedDriverId: selected.assignedDriverId ?? '',
    });
    setErr(''); setOkMsg('');
  }

  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setOkMsg('');
    if (!form.plateNumber.trim()) { setErr('Enter the truck\u2019s plate number (e.g. ABC 123).'); return; }
    if (!Number(form.capacityKg) || Number(form.capacityKg) <= 0) { setErr('Capacity must be more than 0 kg.'); return; }
    setBusy(true);
    try {
      const created = await api<Truck>('/trucks', { method: 'POST', body: JSON.stringify({ plateNumber: form.plateNumber.trim(), truckType: form.truckType, truckSize: form.truckSize, capacityKg: Number(form.capacityKg), assignedDriverId: form.assignedDriverId.trim() || null }) });
      await reload();
      setOkMsg(`Truck ${created.plateNumber ?? form.plateNumber.trim()} was added to the fleet.`);
      setForm({ plateNumber: '', truckType: 'Refrigerated', truckSize: '6W', capacityKg: 2000, assignedDriverId: '' });
    } catch (e: unknown) { setErr(errorMessage(e, 'Could not add the truck. Try again.')); }
    finally { setBusy(false); }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setOkMsg('');
    if (!selected) return;
    if (!edit.plateNumber.trim()) { setErr('Plate number cannot be empty.'); return; }
    if (!Number(edit.capacityKg) || Number(edit.capacityKg) <= 0) { setErr('Capacity must be more than 0 kg.'); return; }
    setBusy(true);
    try {
      await api(`/trucks/${selected.truckId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          plateNumber: edit.plateNumber.trim(), truckType: edit.truckType,
          truckSize: edit.truckSize, capacityKg: Number(edit.capacityKg), status: edit.status,
          assignedDriverId: edit.assignedDriverId || null,
        }),
      });
      await reload();
      setOkMsg(`Truck ${edit.plateNumber.trim()} was updated.`);
    } catch (e: unknown) { setErr(errorMessage(e, 'Could not update the truck. Try again.')); }
    finally { setBusy(false); }
  }

  return (
    <Shell role="Owner" title="Fleet Management">
      <div className="mb-4 text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <Icons.Info className="h-4 w-4" />
          <span>One truck = one driver only (enforced by API). Driver availability mirrors the truck: Available / On Trip / Standby (maintenance).</span>
        </div>
      </div>

      {/* Search + filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Icons.Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            className="block w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
            placeholder="Search plate number…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search trucks by plate"
          />
        </div>
        <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
          {TRUCK_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          {TRUCK_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={size} onChange={(e) => setSize(e.target.value)} aria-label="Filter by size">
          {TRUCK_SIZE_FILTERS.map((s) => <option key={s} value={s}>{s === 'All' ? s : `${s} wheeler`}</option>)}
        </select>
        <span className="text-xs text-slate-500">{filtered.length} of {trucks.length}</span>
      </div>

      {/* Trucks Table */}
      <div className="rounded-xl bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <Icons.Truck className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-900">Truck Fleet</h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">Plate Number</th>
                <th className="px-6 py-3 font-semibold">Type</th>
                <th className="px-6 py-3 font-semibold">Size</th>
                <th className="px-6 py-3 font-semibold">Capacity</th>
                <th className="px-6 py-3 font-semibold">Driver</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold"><span className="sr-only">Details</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((t) => (
                <tr key={t.truckId} className={`hover:bg-slate-50 transition-colors ${selectedId === t.truckId ? 'bg-amber-50/50' : ''}`}>
                  <td className="px-6 py-3 font-medium text-slate-900">{t.plateNumber}</td>
                  <td className="px-6 py-3 text-slate-600">{t.truckType}</td>
                  <td className="px-6 py-3 text-slate-600">{t.truckSize ?? '6W'}</td>
                  <td className="px-6 py-3 text-slate-600">{t.capacityKg} kg</td>
                  <td className="px-6 py-3">
                    {t.assignedDriverName ? (
                      <span className="flex flex-col gap-1">
                        <span className="font-medium text-slate-900">{t.assignedDriverName}</span>
                        <DriverBadge availability={t.driverAvailability} />
                      </span>
                    ) : (
                      <span className="text-slate-400">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      t.status === 'Available' ? 'bg-green-50 text-green-700' :
                      t.status === 'In Use' ? 'bg-blue-50 text-blue-700' :
                      t.status === 'Maintenance' ? 'bg-amber-50 text-amber-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => { setSelectedId(selectedId === t.truckId ? '' : t.truckId); setErr(''); setOkMsg(''); }}
                      className="font-medium text-[#0e7a70] hover:underline"
                    >
                      {selectedId === t.truckId ? 'Hide' : 'Details'}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <p>No trucks match. Try a different search or filter.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vehicle details + edit */}
      {selected && (
        <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Vehicle Details: {selected.plateNumber}</h2>
            <button onClick={startEdit} className="text-sm font-medium text-slate-600 hover:text-slate-900">Reset edits</button>
          </div>
          {err && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2" role="alert">
              <Icons.AlertCircle className="h-5 w-5 shrink-0" />{err}
            </div>
          )}
          {okMsg && (
            <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2" role="status">
              <Icons.CheckCircle className="h-5 w-5 shrink-0" />{okMsg}
            </div>
          )}
          <form onSubmit={saveEdit} className="grid gap-4 max-w-lg">
            <div className="grid gap-2">
              <label className="block text-sm font-medium text-slate-700" htmlFor="edit-plate">Plate Number *</label>
              <input id="edit-plate" aria-describedby="edit-plate-hint" className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
                value={edit.plateNumber} onChange={(e) => setEdit({ ...edit, plateNumber: e.target.value })} required />
              <FieldHint id="edit-plate-hint" tone="hint">Type it exactly as printed on the plate, e.g. ABC 123.</FieldHint>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <label className="block text-sm font-medium text-slate-700" htmlFor="edit-type">Type</label>
                <select id="edit-type" className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={edit.truckType} onChange={(e) => setEdit({ ...edit, truckType: e.target.value })}>
                  <option>Refrigerated</option><option>Dry</option>
                </select>
              </div>
              <div className="grid gap-2">
                <label className="block text-sm font-medium text-slate-700" htmlFor="edit-size">Size</label>
                <select id="edit-size" className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={edit.truckSize} onChange={(e) => setEdit({ ...edit, truckSize: e.target.value as TruckSize })}>
                  {TRUCK_SIZES.map((s) => <option key={s} value={s}>{s} wheeler</option>)}
                </select>
              </div>
              <div className="grid gap-2">
                <label className="block text-sm font-medium text-slate-700" htmlFor="edit-cap">Capacity (kg) *</label>
                <input id="edit-cap" type="number" min={1} aria-describedby="edit-cap-hint" className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={edit.capacityKg} onChange={(e) => setEdit({ ...edit, capacityKg: Number(e.target.value) })} required />
                <FieldHint id="edit-cap-hint" tone={Number(edit.capacityKg) > 0 ? 'hint' : 'error'}>
                  {Number(edit.capacityKg) > 0 ? 'Maximum load in kilograms. Must be more than 0.' : 'Capacity must be more than 0 kg. Type a positive number.'}
                </FieldHint>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="block text-sm font-medium text-slate-700" htmlFor="edit-status">Status</label>
                <select id="edit-status" className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                  <option>Available</option><option>In Use</option><option>Maintenance</option>
                </select>
                <p className="text-xs text-slate-400">Maintenance puts the driver on Standby too.</p>
              </div>
              <div className="grid gap-2">
                <label className="block text-sm font-medium text-slate-700" htmlFor="edit-driver">Assigned Driver</label>
                <select id="edit-driver" className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={edit.assignedDriverId} onChange={(e) => setEdit({ ...edit, assignedDriverId: e.target.value })}>
                  <option value="">Unassigned</option>
                  {drivers.map((d) => <option key={d.userId} value={d.userId}>{d.fullName} ({d.email})</option>)}
                </select>
              </div>
            </div>
            <button type="submit" disabled={busy}
              className="w-full rounded-lg bg-[#0e7a70] py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b625a] disabled:opacity-60 disabled:cursor-not-allowed">
              {busy ? 'Saving…' : 'Save Changes'}
            </button>
          </form>

          {/* Maintenance log */}
          <div className="mt-6 border-t border-slate-100 pt-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900">Maintenance Log</h3>
              {(() => {
                const latest = maint.find((m) => m.nextDue);
                const badge = latest ? dueBadge(latest.nextDue) : null;
                return badge ? (
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.urgent ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                    {badge.text}
                  </span>
                ) : null;
              })()}
            </div>
            {mMsg && (
              <div className={`mb-3 rounded-lg px-4 py-2.5 text-sm flex items-center gap-2 ${mMsg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}
                role={mMsg.type === 'error' ? 'alert' : 'status'}>
                {mMsg.type === 'error' ? <Icons.AlertCircle className="h-4 w-4 shrink-0" /> : <Icons.CheckCircle className="h-4 w-4 shrink-0" />}
                {mMsg.text}
              </div>
            )}
            {maint.length === 0 ? (
              <p className="py-2 text-sm text-slate-400">No service history yet. Record the first entry below.</p>
            ) : (
              <ul className="mb-4 divide-y divide-slate-100 text-sm">
                {maint.map((m) => (
                  <li key={m.logId} className="py-2">
                    <span className="font-medium text-slate-900">{m.performedAt}</span>
                    <span className="text-slate-600"> · {m.note}</span>
                    {m.nextDue && <span className="text-slate-500"> · next due {m.nextDue}</span>}
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={addMaintenance} className="grid gap-3 max-w-lg">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <label className="block text-sm font-medium text-slate-700" htmlFor="maint-date">Service date *</label>
                  <input id="maint-date" type="date" value={mDate} onChange={(e) => setMDate(e.target.value)}
                    className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
                </div>
                <div className="grid gap-2">
                  <label className="block text-sm font-medium text-slate-700" htmlFor="maint-due">Next due (optional)</label>
                  <input id="maint-due" type="date" value={mDue} onChange={(e) => setMDue(e.target.value)}
                    className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid gap-2">
                <label className="block text-sm font-medium text-slate-700" htmlFor="maint-note">What was serviced *</label>
                <input id="maint-note" value={mNote} onChange={(e) => setMNote(e.target.value)}
                  placeholder="Oil change, brake pads, tires"
                  className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
              </div>
              <button type="submit" disabled={mBusy}
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
                {mBusy ? 'Recording…' : 'Record Service'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Truck Form */}
      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Icons.Plus className="h-5 w-5 text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900">Add New Vehicle</h2>
        </div>
        {!selected && err && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2" role="alert">
            <Icons.AlertCircle className="h-5 w-5 shrink-0" />{err}
          </div>
        )}
        {!selected && okMsg && (
          <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2" role="status">
            <Icons.CheckCircle className="h-5 w-5 shrink-0" />{okMsg}
          </div>
        )}
        <form onSubmit={create} className="grid gap-4 max-w-lg">
          <div className="grid gap-2">
            <label className="block text-sm font-medium text-slate-700">Plate Number *</label>
            <input
              aria-describedby="add-plate-hint"
              className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
              placeholder="ABC 123"
              value={form.plateNumber}
              onChange={(e) => setForm({ ...form, plateNumber: e.target.value })}
              required
            />
            <FieldHint id="add-plate-hint" tone="hint">Type it exactly as printed on the plate, e.g. ABC 123.</FieldHint>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label className="block text-sm font-medium text-slate-700">Truck Type</label>
              <select
                className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
                value={form.truckType}
                onChange={(e) => setForm({ ...form, truckType: e.target.value })}
              >
                <option>Refrigerated</option>
                <option>Dry</option>
              </select>
            </div>
            <div className="grid gap-2">
              <label className="block text-sm font-medium text-slate-700">Truck Size</label>
              <select
                aria-describedby="add-size-hint"
                className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
                value={form.truckSize}
                onChange={(e) => setForm({ ...form, truckSize: e.target.value as TruckSize })}
              >
                {TRUCK_SIZES.map((s) => <option key={s} value={s}>{s} wheeler</option>)}
              </select>
              <FieldHint id="add-size-hint" tone="hint">Wheel class: 4W city truck, 6W standard, 10W heavy.</FieldHint>
            </div>
          </div>
          <div className="grid gap-2">
            <label className="block text-sm font-medium text-slate-700">Capacity (kg) *</label>
            <input
              type="number"
              min={1}
              aria-describedby="add-cap-hint"
              className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
              value={form.capacityKg}
              onChange={(e) => setForm({ ...form, capacityKg: Number(e.target.value) })}
              required
            />
            <FieldHint id="add-cap-hint" tone={Number(form.capacityKg) > 0 ? 'hint' : 'error'}>
              {Number(form.capacityKg) > 0 ? 'Maximum load in kilograms. Must be more than 0.' : 'Capacity must be more than 0 kg. Type a positive number.'}
            </FieldHint>
          </div>
          <div className="grid gap-2">
            <label className="block text-sm font-medium text-slate-700">Assigned Driver (optional)</label>
            <select
              className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
              value={form.assignedDriverId}
              onChange={(e) => setForm({ ...form, assignedDriverId: e.target.value })}
            >
              <option value="">Unassigned</option>
              {drivers.map((d) => <option key={d.userId} value={d.userId}>{d.fullName} ({d.email})</option>)}
            </select>
            <p className="text-xs text-slate-400">One truck = one driver. A driver already linked to another truck will be rejected by the server.</p>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-[#0e7a70] py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b625a] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? 'Adding…' : 'Add Vehicle'}
          </button>
        </form>
      </div>
    </Shell>
  );
}
