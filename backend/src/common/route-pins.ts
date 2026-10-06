import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema.js';

export interface PinCheckStop {
  stopId: string;
  stopType: string;
  locationAddress: string;
  lon: number | null;
  lat: number | null;
}

/** A pin counts only when it is finite, in range, and not the (0,0) placeholder. */
export function isValidPin(lon: unknown, lat: unknown): boolean {
  if (typeof lon !== 'number' || typeof lat !== 'number') return false;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return false;
  if (lon === 0 && lat === 0) return false;
  return true;
}

/**
 * Stops of a route whose map pins are missing or invalid, with extracted
 * coordinates. Used by the "sure route" gates: approval requires a pinned
 * pickup (dispatch navigation) plus pinned stores; dispatch departure
 * requires all pinned stores complete.
 */
export async function findUnpinnedStops(
  db: PostgresJsDatabase<typeof schema>,
  routeId: string,
): Promise<PinCheckStop[]> {
  const rows = (await db.execute(sql`
    select stop_id as "stopId", stop_type as "stopType",
      location_address as "locationAddress",
      ST_X(location_coordinates)::float8 as lon,
      ST_Y(location_coordinates)::float8 as lat
    from stops where route_id = ${routeId}`)) as unknown as PinCheckStop[];
  return (Array.isArray(rows) ? rows : []).filter((r) => !isValidPin(r.lon, r.lat));
}
