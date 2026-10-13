'use client';
import { useEffect, useId, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Shell } from '@/components/Shell';
import { DriverBadge } from '@/components/DriverBadge';
import { api } from '@/lib/supabase';
import { Icons } from '@/lib/createLucideIcon';
import { errorMessage, gmapsUrl, type ClientRow, type Order, type OrderPriority, type RouteRow, type SessionUser, type TruckWithDriver } from '@/lib/types';
import { coordsOf, phPinError } from '@/lib/map';

const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false });

// Module-evaluated once: render-phase reference (no impure calls during render).
const BOOT_SUFFIX = Date.now().toString().slice(-6);

// Four fixed linear steps (Carbon progress indicator [U5]: three or more
// fixed steps; labels of one or two words; not interactive — Back/Continue
// move between steps).
const STEPS = ['When', 'Where', 'Truck', 'Review'] as const;

function Stepper({ current, invalid }: { current: number; invalid: number[] }) {
  return (
    <ol aria-label="Order progress" className="mb-6 flex items-center gap-1 sm:gap-2">
      {STEPS.map((label, i) => {
        const isInvalid = invalid.includes(i);
        const state = isInvalid ? 'invalid' : i < current ? 'complete' : i === current ? 'current' : 'incomplete';
        return (
          <li key={label} aria-current={i === current ? 'step' : undefined} className="flex flex-1 items-center gap-1 last:flex-none sm:gap-2">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              state === 'complete' ? 'bg-green-600 text-white' :
              state === 'current' ? 'bg-[#0e7a70] text-white' :
              state === 'invalid' ? 'border-2 border-red-600 bg-white text-red-600' :
              'bg-slate-100 text-slate-500'
            }`}>
              {state === 'complete' ? <Icons.Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={`text-xs font-medium ${state === 'current' ? 'text-slate-900' : state === 'invalid' ? 'text-red-600' : 'text-slate-500'}`}>{label}</span>
            {i < STEPS.length - 1 && <span aria-hidden className="h-px min-w-2 flex-1 bg-slate-200" />}
          </li>
        );
      })}
    </ol>
  );
}

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
  const [priority, setPriority] = useState<OrderPriority>('Normal');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState(0);
  const [invalidSteps, setInvalidSteps] = useState<number[]>([]);
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

  function fail(text: string, goToStep?: number) {
    setMsg({ type: 'error', text });
    setIsSubmitting(false);
    // Mark the step that holds the error invalid and jump to it, so the
    // problem is fixed in context instead of from the summary alone.
    setInvalidSteps(goToStep === undefined ? [] : [goToStep]);
    if (goToStep !== undefined) setStep(goToStep);
    // The form is long: bring the message to the user instead of making
    // them hunt for it, and move focus there for screen readers.
    requestAnimationFrame(() => {
      msgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      msgRef.current?.focus({ preventScroll: true });
    });
  }

  function validateWhen(): string | null {
    if (!ref.trim()) return 'Order reference is empty. Type a reference (e.g. JFC-123456).';
    if (!date) return 'Scheduled date is empty. Pick a date for the delivery.';
    if (!time) return 'Scheduled time is empty. Pick a time for the delivery.';
    return null;
  }

  function validateWhere(): string | null {
    if (!profile) return 'Client profile not found for this account. Ask an Owner to link your login to a client company first.';
    if (!dispatchPin) return 'Dispatch area has no map coordinates. Ask an Owner to pin the dispatch area on the client company first.';
    // Drop-offs are optional: client may dispatch pickup-only and assign stores later.
    // Philippines-only: every pin must pass the same lat 4–21 / lng 116–127
    // rule the backend enforces, so a foreign/swapped pin fails here fast.
    for (let i = 0; i < drops.length; i++) {
      if (!drops[i].addr.trim() && !drops[i].pin) continue;
      if (!drops[i].addr.trim()) return `Drop-off #${i + 1} address is empty. Type where the goods go or remove it.`;
      if (!drops[i].pin) return `Drop-off #${i + 1} is not pinned. Tap its map to drop the delivery pin or remove it.`;
      const phErr = phPinError(`Drop-off #${i + 1}`, drops[i].pin!.lat, drops[i].pin!.lon);
      if (phErr) return phErr;
    }
    return null;
  }

  function validateTruck(): string | null {
    if (trucks.length > 0 && !truckId) return 'No truck selected. Choose one of the available trucks below.';
    if (trucks.length === 0) return 'There are no available trucks right now. Try again later or ask dispatch for help.';
    const chosen = trucks.find((t) => t.truckId === truckId);
    if (chosen && chosen.driverAvailability && chosen.driverAvailability !== 'Available') {
      const who = chosen.assignedDriverName ? `Driver ${chosen.assignedDriverName}` : 'Its driver';
      const why = chosen.driverAvailability === 'On Trip' ? 'is already on a trip' : chosen.driverAvailability === 'Standby' ? 'is on standby (truck in maintenance)' : 'is not available';
      return `${who} ${why}. Pick a truck whose driver is Available.`;
    }
    return null;
  }

  function goNext() {
    const check = step === 0 ? validateWhen() : step === 1 ? validateWhere() : validateTruck();
    if (check) {
      fail(check, step);
      return;
    }
    setInvalidSteps([]);
    setMsg(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setMsg(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setMsg(null);
    try {
      const w = validateWhen();
      if (w) return fail(w, 0);
      const wh = validateWhere();
      if (wh) return fail(wh, 1);
      const t = validateTruck();
      if (t) return fail(t, 2);
      const stored: unknown = JSON.parse(localStorage.getItem('arways_user') ?? '{}');
      const user = typeof stored === 'object' && stored !== null ? (stored as Partial<SessionUser>) : {};
      if (!user.userId) return fail('Your login session is missing. Log out and log in again, then retry.');
      const created = await api<{ order: Order; route: RouteRow; driverId: string }>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          orderReference: ref.trim(), clientId: user.userId ?? null, truckId,
          scheduledDate: date, scheduledTime: time, specialInstructions: notes.trim() || undefined, priority,
          pickup: { address: profile!.dispatchAreaAddress, ...dispatchPin },
          dropoffs: drops.filter((d) => d.addr.trim() && d.pin).map((d) => ({ address: d.addr.trim(), ...d.pin! })),
        }),
      });
      const storeNote = drops.filter((d) => d.addr.trim() && d.pin).length === 0 ? ' (pickup-only; assign stores later from Track).' : '';
      setInvalidSteps([]);
      setMsg({ type: 'success', text: `Order ${created.order.orderReference ?? ref.trim()} submitted for secretary approval${storeNote} The truck\u2019s driver was auto-assigned.` });
      requestAnimationFrame(() => {
        msgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        msgRef.current?.focus({ preventScroll: true });
      });
    } catch (err: unknown) {
      setMsg({ type: 'error', text: errorMessage(err, 'Could not submit the order. Check the reference, truck, date, and map pins, then try again.') });
    } finally {
      setIsSubmitting(false);
    }
  }

  const chosenTruck = trucks.find((t) => t.truckId === truckId) ?? null;
  const validDrops = drops.filter((d) => d.addr.trim() && d.pin);

  return (
    <Shell role="Client" title="Create New Order">
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <Icons.Plus className="h-6 w-6 text-slate-400" />
          <h2 className="text-xl font-semibold text-slate-900">New Order Details</h2>
        </div>

        <Stepper current={step} invalid={invalidSteps} />

        {/* Message */}
        {msg && (
          <div ref={msgRef} tabIndex={-1} className={`mb-6 rounded-lg p-4 focus:outline-none ${msg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`} role={msg.type === 'error' ? 'alert' : 'status'}>
            <div className="flex items-center gap-2">
              {msg.type === 'error' ? <Icons.AlertCircle className="h-5 w-5 shrink-0" /> : <Icons.CheckCircle className="h-5 w-5 shrink-0" />}
              <span>{msg.text}</span>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-6">
          {step === 0 && (
            <>
              {/* When: reference + schedule + priority */}
              <div className="grid gap-4 rounded-lg border border-slate-200 p-5 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <label htmlFor="order-ref" className="block text-sm font-medium text-slate-700">Order Reference *</label>
                  <input
                    id="order-ref"
                    className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
                    value={ref}
                    onChange={(e) => setRef(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="order-date" className="block text-sm font-medium text-slate-700">Scheduled Date *</label>
                  <input
                    id="order-date"
                    type="date"
                    className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="order-time" className="block text-sm font-medium text-slate-700">Scheduled Time *</label>
                  <input
                    id="order-time"
                    type="time"
                    className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="order-priority" className="block text-sm font-medium text-slate-700">Priority</label>
                  <select
                    id="order-priority"
                    className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as OrderPriority)}
                  >
                    <option value="Normal">Normal</option>
                    <option value="Urgent">Urgent</option>
                    <option value="Rush">Rush</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              {/* Where: pickup (dispatch area) + drop-offs */}
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
                      className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:underline">
                      Remove
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`dropoff-addr-${d.id}`} className="block text-sm font-medium text-slate-700">Drop-off Address</label>
                    <input
                      id={`dropoff-addr-${d.id}`}
                      className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
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
            </>
          )}

          {step === 2 && (
            <>
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
                        className="h-4 w-4 text-[#0e7a70] focus:ring-[#0e7a70]"
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
                    <div className="py-4 text-center">
                      <p className="text-sm text-slate-400">No available trucks right now.</p>
                      <a href="tel:+639171234567" className="btn-ghost mt-2 inline-flex items-center gap-2 text-sm">Call dispatch</a>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              {/* Review: summary + notes + submit */}
              <div className="space-y-2 rounded-lg border border-slate-200 p-5">
                <p className="block text-sm font-medium text-slate-700">Review your order</p>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-slate-500">Reference</dt><dd className="font-medium text-slate-900">{ref.trim() || '-'}</dd></div>
                  <div><dt className="text-slate-500">Schedule</dt><dd className="font-medium text-slate-900">{date} at {time} · {priority}</dd></div>
                  <div><dt className="text-slate-500">Pickup</dt><dd className="font-medium text-slate-900">{profile?.dispatchAreaAddress ?? '-'}</dd></div>
                  <div><dt className="text-slate-500">Drop-offs</dt><dd className="font-medium text-slate-900">{validDrops.length === 0 ? 'Pickup only' : validDrops.map((d) => d.addr.trim()).join(' → ')}</dd></div>
                  <div><dt className="text-slate-500">Truck</dt><dd className="font-medium text-slate-900">{chosenTruck ? `${chosenTruck.plateNumber} (driver auto-assigned)` : '-'}</dd></div>
                </dl>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label htmlFor="order-notes" className="block text-sm font-medium text-slate-700">Special Instructions (optional)</label>
                <textarea
                  id="order-notes"
                  className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-[#0e7a70] py-3 text-sm font-semibold text-white shadow-md shadow-[#0e7a70]/20 transition-all hover:bg-[#0b625a] focus:outline-none focus:ring-2 focus:ring-[#0e7a70] focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Submitting...' : 'Submit for Approval'}
              </button>
            </>
          )}

          {/* Step navigation */}
          {step < 3 && (
            <div className="flex gap-3">
              {step > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={goNext}
                className="flex-1 rounded-lg bg-[#0e7a70] py-2.5 text-sm font-semibold text-white hover:bg-[#0b625a]"
              >
                Continue
              </button>
            </div>
          )}
          {step === 3 && (
            <button
              type="button"
              onClick={goBack}
              className="w-full rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back
            </button>
          )}
        </form>
      </div>
    </Shell>
  );
}
