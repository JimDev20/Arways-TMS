'use client';
import { useEffect, useId, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Shell } from '@/components/Shell';
import { DriverBadge } from '@/components/DriverBadge';
import { api } from '@/lib/supabase';
import { Icons } from '@/lib/createLucideIcon';
import { errorMessage, gmapsUrl, type ClientRow, type Order, type RouteRow, type SessionUser, type TruckWithDriver } from '@/lib/types';
import { coordsOf } from '@/lib/map';

const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false });

// Module-evaluated once: render-phase reference (no impure calls during render).
const BOOT_SUFFIX = Date.now().toString().slice(-6);

export default function NewOrderPage() {
  const [trucks, setTrucks] = useState<TruckWithDriver[]>([]);
  const uid = useId().replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
  const [ref, setRef] = useState(`JFC-${BOOT_SUFFIX}${uid}`);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('08:00');
  const [profile, setProfile] = useState<ClientRow | null>(null);
  const newDropId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const [drops, setDrops] = useState<{ id: string; addr: string; pin: { lat: number; lon: number } | null }[]>([
    { id: 'drop-0', addr: 'SM City QC', pin: null },
  ]);
  const [truckId, setTruckId] = useState('');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const msgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [t, c] = await Promise.all([
          api<TruckWithDriver[]>('/trucks/available'),
          api<ClientRow>('/clients/mine'),
        ]);
        if (!live) return;
        setTrucks(t);
        if (t[0]) setTruckId(t[0].truckId);
        setProfile(c);
      } catch {
        /* lists stay empty: user can retry */
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // Dispatch area and pickup area are the same place: the pickup always
  // comes from the client company profile, never from a separate pin.
  const dispatchPin = profile ? coordsOf(profile.dispatchAreaCoordinates) : null;

  function fail(text: string) {
    setMsg({ type: 'error', text });
    setIsSubmitting(false);
    // The form is long: bring the message to the user instead of making
    // them hunt for it, and move focus there for screen readers.
    requestAnimationFrame(() => {
      msgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      msgRef.current?.focus({ preventScroll: true });
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setMsg(null);
    try {
      if (!ref.trim()) return fail('Order reference is empty. Type a reference (e.g. JFC-123456).');
      if (!date) return fail('Scheduled date is empty. Pick a date for the delivery.');
      if (!time) return fail('Scheduled time is empty. Pick a time for the delivery.');
      if (!profile) return fail('Client profile not found for this account. Ask an Owner to link your login to a client company first.');
      if (!dispatchPin) return fail('Dispatch area has no map coordinates. Ask an Owner to pin the dispatch area on the client company first.');
      // Drop-offs are optional: client may dispatch pickup-only and assign stores later.
      for (let i = 0; i < drops.length; i++) {
        if (!drops[i].addr.trim() && !drops[i].pin) continue;
        if (!drops[i].addr.trim()) return fail(`Drop-off #${i + 1} address is empty. Type where the goods go or remove it.`);
        if (!drops[i].pin) return fail(`Drop-off #${i + 1} is not pinned. Tap its map to drop the delivery pin or remove it.`);
      }
      if (trucks.length > 0 && !truckId) return fail('No truck selected. Choose one of the available trucks below.');
      if (trucks.length === 0) return fail('There are no available trucks right now. Try again later or ask dispatch for help.');
      const chosen = trucks.find((t) => t.truckId === truckId);
      if (chosen && chosen.driverAvailability && chosen.driverAvailability !== 'Available') {
        const who = chosen.assignedDriverName ? `Driver ${chosen.assignedDriverName}` : 'Its driver';
        const why = chosen.driverAvailability === 'On Trip' ? 'is already on a trip' : chosen.driverAvailability === 'Standby' ? 'is on standby (truck in maintenance)' : 'is not available';
        return fail(`${who} ${why}. Pick a truck whose driver is Available.`);
      }
      const stored: unknown = JSON.parse(localStorage.getItem('arways_user') ?? '{}');
      const user = typeof stored === 'object' && stored !== null ? (stored as Partial<SessionUser>) : {};
      if (!user.userId) return fail('Your login session is missing. Log out and log in again, then retry.');
      const created = await api<{ order: Order; route: RouteRow; driverId: string }>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          orderReference: ref.trim(), clientId: user.userId ?? null, truckId,
          scheduledDate: date, scheduledTime: time, specialInstructions: notes.trim() || undefined,
          pickup: { address: profile.dispatchAreaAddress, ...dispatchPin },
          dropoffs: drops.filter((d) => d.addr.trim() && d.pin).map((d) => ({ address: d.addr.trim(), ...d.pin! })),
        }),
      });
      const storeNote = drops.filter((d) => d.addr.trim() && d.pin).length === 0 ? ' (pickup-only; assign stores later from Track).' : '';
      setMsg({ type: 'success', text: `Order ${created.order.orderReference ?? ref.trim()} submitted for secretary approval${storeNote} The truck\u2019s driver was auto-assigned.` });
      requestAnimationFrame(() => {
        msgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        msgRef.current?.focus({ preventScroll: true });
      });
    } catch (err: unknown) {
      setMsg({ type: 'error', text: errorMessage(err, 'Could not submit the order. Try again.') });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Shell role="Client" title="Create New Order">
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <Icons.Plus className="h-6 w-6 text-slate-400" />
          <h2 className="text-xl font-semibold text-slate-900">New Order Details</h2>
        </div>

        <form onSubmit={submit} className="space-y-6">
          {/* Basic Info */}
          <div className="grid gap-4 rounded-lg border border-slate-200 p-5 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">Order Reference *</label>
              <input
                className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#f5a623] focus:outline-none focus:ring-1 focus:ring-[#f5a623]"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">Scheduled Date *</label>
              <input
                type="date"
                className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#f5a623] focus:outline-none focus:ring-1 focus:ring-[#f5a623]"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">Scheduled Time *</label>
              <input
                type="time"
                className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#f5a623] focus:outline-none focus:ring-1 focus:ring-[#f5a623]"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Pickup = dispatch area (same place, no separate pin) */}
          <div className="space-y-2 rounded-lg border border-slate-200 p-5">
            <p className="block text-sm font-medium text-slate-700">Pickup (Dispatch Area) *</p>
            {!profile ? (
              <p className="text-sm text-slate-500">Loading your dispatch area… If this stays empty, ask an Owner to link your login to a client company.</p>
            ) : (
              <div>
                <p className="text-sm font-medium text-slate-900">{profile.dispatchAreaAddress}</p>
                {(profile.entranceInstructions || profile.dispatcherContact) && (
                  <p className="mt-1 text-xs text-slate-500">
                    {[profile.entranceInstructions, profile.dispatcherContact].filter(Boolean).join(' · ')}
                  </p>
                )}
                <div className="mt-3">
                  {dispatchPin ? (
                    <a
                      href={gmapsUrl(dispatchPin.lat, dispatchPin.lon)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Icons.MapPin className="h-3.5 w-3.5" />
                      Navigate in Google Maps
                    </a>
                  ) : (
                    <p className="text-xs text-amber-700">Dispatch area has no map coordinates yet. Ask an Owner to pin it on the client company.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {drops.map((d, i) => (
            <div key={d.id} className="space-y-4 rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Drop-off #{i + 1} (optional)</p>
                <button type="button" onClick={() => setDrops(drops.filter((x) => x.id !== d.id))}
                  className="text-xs font-medium text-red-600 hover:underline">
                  Remove
                </button>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">Drop-off Address</label>
                <input
                  className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#f5a623] focus:outline-none focus:ring-1 focus:ring-[#f5a623]"
                  value={d.addr}
                  onChange={(e) => setDrops(drops.map((x) => (x.id === d.id ? { ...x, addr: e.target.value } : x)))}
                />
              </div>
              <MapPicker label={`Drop-off #${i + 1} Location`} lat={d.pin?.lat ?? null} lon={d.pin?.lon ?? null} mapKey={d.id}
                onChange={(lat, lon) => setDrops(drops.map((x) => (x.id === d.id ? { ...x, pin: { lat, lon } } : x)))} />
            </div>
          ))}
          <button type="button" onClick={() => setDrops([...drops, { id: newDropId(), addr: '', pin: null }])}
            className="w-full rounded-lg border border-dashed border-slate-300 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            + Add Another Drop-off
          </button>
          <p className="text-xs text-slate-500">Drop-offs are optional. Leave empty for pickup-only dispatch. Assign stores later from the Track page.</p>

          {/* Truck Selection */}
          <div className="space-y-3 rounded-lg border border-slate-200 p-5">
            <label className="block text-sm font-medium text-slate-700">Select Truck (Driver auto-assigned) *</label>
            <div className="space-y-2">
              {trucks.map((t) => (
                <label key={t.truckId} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50">
                  <input
                    type="radio"
                    name="truck"
                    checked={truckId === t.truckId}
                    onChange={() => setTruckId(t.truckId)}
                    className="h-4 w-4 text-[#f5a623] focus:ring-[#f5a623]"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">{t.plateNumber}</div>
                    <div className="text-xs text-slate-500">{t.truckSize ?? '6W'} · {t.truckType} · {t.capacityKg}kg capacity</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                      <span>Driver: {t.assignedDriverName ?? 'Unassigned'}</span>
                      <DriverBadge availability={t.driverAvailability} />
                    </div>
                  </div>
                  <Icons.Truck className="h-5 w-5 text-slate-400" />
                </label>
              ))}
              {!trucks.length && (
                <p className="text-center text-sm text-slate-400">No available trucks</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">Special Instructions (optional)</label>
            <textarea
              className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#f5a623] focus:outline-none focus:ring-1 focus:ring-[#f5a623]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Message */}
          {msg && (
            <div ref={msgRef} tabIndex={-1} className={`rounded-lg p-4 focus:outline-none ${msg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`} role={msg.type === 'error' ? 'alert' : 'status'}>
              <div className="flex items-center gap-2">
                {msg.type === 'error' ? <Icons.AlertCircle className="h-5 w-5 shrink-0" /> : <Icons.CheckCircle className="h-5 w-5 shrink-0" />}
                <span>{msg.text}</span>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-[#f5a623] py-3 text-sm font-semibold text-white shadow-md shadow-[#f5a623]/20 transition-all hover:bg-[#e69b1e] focus:outline-none focus:ring-2 focus:ring-[#f5a623] focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Submitting...' : 'Submit for Approval'}
          </button>
        </form>
      </div>
    </Shell>
  );
}
