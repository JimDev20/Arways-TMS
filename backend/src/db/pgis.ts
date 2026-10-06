import { customType } from 'drizzle-orm/pg-core';

/** Minimal PostGIS Point custom type: stores "SRID=4326;POINT(lon lat)". */
export interface LonLat { lon: number; lat: number }

/**
 * Parse PostGIS EWKB hex (what postgres returns, e.g.
 * "0101000020E6100000...") into { lon, lat }. Without this, selects leak
 * raw hex strings to API responses and every map pin silently disappears.
 */
export function parseEwkbPoint(hex: string): LonLat {
  const buf = Buffer.from(hex, 'hex');
  if (buf.length < 21) throw new Error('Invalid EWKB point: too short.');
  const le = buf[0] === 1;
  const readU32 = (off: number) => (le ? buf.readUInt32LE(off) : buf.readUInt32BE(off));
  const readF64 = (off: number) => (le ? buf.readDoubleLE(off) : buf.readDoubleBE(off));
  const type = readU32(1);
  if ((type & 0xff) !== 1) throw new Error('Invalid EWKB point: not a POINT geometry.');
  let offset = 5;
  if (type & 0x20000000) offset += 4; // SRID present
  const lon = readF64(offset);
  const lat = readF64(offset + 8);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw new Error('Invalid EWKB point: bad coordinates.');
  return { lon, lat };
}

export const geometry = (name: string) =>
  customType<{ data: LonLat; driverData: string }>({
    dataType: () => `geometry(Point, 4326)`,
    fromDriver: (value: string): LonLat => parseEwkbPoint(value),
    toDriver: (value: LonLat): string => `SRID=4326;POINT(${value.lon} ${value.lat})`,
  }) (name);
