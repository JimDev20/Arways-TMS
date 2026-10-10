/** Shared map helpers with zero browser deps (safe to import in SSR/prerender). */
import { gmapsUrl } from '@/lib/types';

export interface MapPin {
  lat: number;
  lon: number;
  label: string;
}

/** Google Maps link for exact coords, or address search fallback. */
export function navigateHref(address: string, coords: unknown): string {
  const c = coordsOf(coords);
  if (c) return gmapsUrl(c.lat, c.lon);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Extracts [lat, lon] from PostGIS shapes: {lon, lat} (API), {x: lon, y: lat}, or {lat, lon} forms. */
export function coordsOf(c: unknown): { lat: number; lon: number } | null {
  if (!c || typeof c !== 'object') return null;
  const o = c as Record<string, unknown>;
  if (typeof o.x === 'number' && typeof o.y === 'number') return { lat: o.y, lon: o.x };
  if (typeof o.lon === 'number' && typeof o.lat === 'number') return { lat: o.lat, lon: o.lon };
  if (typeof o.lat === 'number' && (typeof o.lon === 'number' || typeof o.lng === 'number')) {
    return { lat: o.lat, lon: (o.lon ?? o.lng) as number };
  }
  if (Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') {
    return { lon: c[0], lat: c[1] };
  }
  return null;
}

// ---- Philippines-only pins: single source of truth, mirrors backend ----
// Backend validates lat 4–21 / lng 116–127, so every pin created here must
// pass the same check or the submit will be rejected.
export const PH_LAT_MIN = 4;
export const PH_LAT_MAX = 21;
export const PH_LON_MIN = 116;
export const PH_LON_MAX = 127;

export function inPH(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= PH_LAT_MIN &&
    lat <= PH_LAT_MAX &&
    lon >= PH_LON_MIN &&
    lon <= PH_LON_MAX
  );
}

/** True when swapping lat/lng would land inside PH (common paste/typing error). */
export function looksSwappedPH(lat: number, lon: number): boolean {
  return inPH(lon, lat) && !inPH(lat, lon);
}

/** Pre-submit guard message for a drop-off/store pin, or null when valid. */
export function phPinError(label: string, lat: number, lon: number): string | null {
  if (inPH(lat, lon)) return null;
  if (looksSwappedPH(lat, lon)) {
    return `${label} is outside the Philippines (got lat ${lat}, lng ${lon}). It looks like latitude and longitude are swapped — try lat ${lon}, lng ${lat} instead. For Maanahao, Masbate use lat 12.05509, lng 123.90058.`;
  }
  return `${label} is outside the Philippines (lat 4–21, lng 116–127). Move the pin inside the Philippines.`;
}
