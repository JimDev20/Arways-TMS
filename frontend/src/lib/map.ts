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
