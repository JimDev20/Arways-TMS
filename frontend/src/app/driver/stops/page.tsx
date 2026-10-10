'use client';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/supabase';
import { navigateHref } from '@/lib/map';
import { coordsOf } from '@/lib/map';
import { Icons } from '@/lib/createLucideIcon';
import { errorMessage, type DriverRoute } from '@/lib/types';

/**
 * Driver Stops tab (Feature Placement: driver bottom tab bar).
 * Focused stop list across assigned routes: navigate + status at a glance.
 * Full actions stay on Today's Route until the tab split completes.
 */
export default function DriverStopsPage() {
  const [routes, setRoutes] = useState<DriverRoute[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    api<DriverRoute[]>('/routes/mine')
      .then((r) => { setRoutes(r); setErr(''); })
      .catch((e: unknown) => setErr(errorMessage(e, 'Could not load stops.')));
  }, []);

  const stops = routes.flatMap((r) =>
    (r.stops ?? []).map((s) => ({ ...s, routeNumber: r.route.routeNumber })),
  );

  return (
    <Shell role="Driver" title="Stops">
      {err && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{err}</div>}
      {stops.length === 0
        ? <p className="rounded-xl bg-white py-10 text-center text-sm text-slate-400 shadow-sm">No stops assigned yet. New stores appear here when dispatch assigns them.</p>
        : (
          <ul className="grid gap-3">
            {stops.map((s) => (
              <li key={s.stopId} className="flex items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">#{s.stopSequence} {s.locationAddress}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{s.routeNumber} · {s.stopType} · {s.status}</p>
                </div>
                <a
                  href={navigateHref(s.locationAddress, s.locationCoordinates)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Icons.MapPin className="h-3.5 w-3.5" />Navigate
                </a>
              </li>
            ))}
          </ul>
        )}
      <p className="mt-4 text-xs text-slate-400">Tip: open Today&apos;s Route to update arrival, delivery and receipts. Coordinates: {stops.filter((s) => coordsOf(s.locationCoordinates)).length}/{stops.length} pinned.</p>
    </Shell>
  );
}
