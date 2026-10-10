import { BadRequestException } from '@nestjs/common';

/**
 * Shared input guards: every value a user (or their computer: bad GPS,
 * autofill, truncated JSON) can send is checked here BEFORE it reaches
 * PostGIS/Drizzle, so bad input always becomes a clear 400 — never a 500.
 */

export const USER_ROLES = ['Owner', 'Secretary', 'Client', 'Driver'] as const;
export const USER_STATUSES = ['Active', 'Inactive'] as const;
export const TRUCK_TYPES = ['Refrigerated', 'Dry'] as const;
export const TRUCK_STATUSES = ['Available', 'In Use', 'Maintenance'] as const;
export const ORDER_PRIORITIES = ['Normal', 'Urgent', 'Rush'] as const;

// Philippines bounds (same rule as client signup: lat 4–21, lng 116–127).
const LAT_MIN = 4;
const LAT_MAX = 21;
const LON_MIN = 116;
const LON_MAX = 127;

export function assertIn(value: unknown, allowed: readonly string[], label: string): string {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new BadRequestException(`${label} is invalid. Pick one of: ${allowed.join(', ')}.`);
  }
  return value;
}

export function assertNonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${label} is empty. Fill it in first.`);
  }
  return value.trim();
}

export function assertPositiveInt(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new BadRequestException(`${label} must be a whole number above 0.`);
  }
  return n;
}

/** Map pin must be finite numbers inside the Philippines (catches bad GPS/autofill). */
export function assertCoords(lat: unknown, lon: unknown, label: string): { lat: number; lon: number } {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) {
    throw new BadRequestException(`${label} has no valid map pin. Drop the pin on the map again.`);
  }
  if (la < LAT_MIN || la > LAT_MAX || lo < LON_MIN || lo > LON_MAX) {
    // Common cause: lat/lng swapped (e.g. Maanahao is lat ~12.06, lng ~123.90 —
    // sent as lat 123.90, lng 12.06 it lands outside PH). Name the fix.
    const swappedFits = lo >= LAT_MIN && lo <= LAT_MAX && la >= LON_MIN && la <= LON_MAX;
    if (swappedFits) {
      throw new BadRequestException(
        `${label} is outside the Philippines (lat ${LAT_MIN}–${LAT_MAX}, lng ${LON_MIN}–${LON_MAX}). It looks like the latitude and longitude are swapped (got lat ${la}, lng ${lo}). Move the pin to the right place — for Maanahao, Masbate use lat ~12.06, lng ~123.90.`,
      );
    }
    throw new BadRequestException(`${label} is outside the Philippines (lat ${LAT_MIN}–${LAT_MAX}, lng ${LON_MIN}–${LON_MAX}). Move the pin to the right place.`);
  }
  return { lat: la, lon: lo };
}

export function assertEmail(value: unknown, label: string): string {
  const v = assertNonEmpty(value, label);
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v)) {
    throw new BadRequestException(`${label} is not a valid email address.`);
  }
  return v;
}

/** Text fields: shared max lengths (Security Playbook: every text field capped). */
export const TEXT_LIMITS = {
  address: 300,
  instructions: 2000,
  reason: 500,
  notes: 1000,
  message: 500,
  reference: 60,
  name: 120,
} as const;

export function assertText(value: unknown, label: string, max: number): string {
  const v = assertNonEmpty(value, label);
  if (v.length > max) {
    throw new BadRequestException(`${label} is too long (${v.length}/${max}). Shorten it first.`);
  }
  return v;
}

/**
 * P0 #3 (partial): receipt/waybill URLs must be https Supabase Storage paths
 * in the `receipts` bucket — not arbitrary URLs. Full fix (signed upload URLs
 * + store path, sign on read) needs a storage endpoint; this gate already
 * rejects `http://evil/...`, data: URIs, and non-receipt hosts.
 */
export function assertPhotoUrl(value: unknown, label: string): string {
  const v = assertNonEmpty(value, label);
  if (v.length > 2000) {
    throw new BadRequestException(`${label} is too long. Upload the photo again.`);
  }
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new BadRequestException(`${label} is not a valid photo link. Upload the photo again.`);
  }
  if (u.protocol !== 'https:') {
    throw new BadRequestException(`${label} must be a secure (https) photo link. Upload the photo again.`);
  }
  const supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
  const okHost =
    u.pathname.includes('/storage/v1/object') ||
    (supabaseUrl && v.startsWith(supabaseUrl));
  if (!okHost) {
    throw new BadRequestException(`${label} must be a receipt-bucket photo. Upload the photo again.`);
  }
  if (!u.pathname.includes('receipts') && !u.search.includes('receipts') && !v.includes('receipts')) {
    throw new BadRequestException(`${label} must come from the receipts bucket. Upload the photo again.`);
  }
  return v;
}
