'use client';
import { api } from '@/lib/supabase';

export interface PlaceResult {
  lat: number;
  lon: number;
  label: string;
  source: 'photon' | 'nominatim' | 'link';
}

export type ParsedLocation =
  | { kind: 'coords'; lat: number; lon: number; label: string }
  | { kind: 'query'; query: string }
  | { kind: 'unsupported'; reason: string };

const COORD_RE = /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/;
const BANG_RE = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;

/**
 * Parses a Google Maps link (exact coordinates, zero API cost) or falls
 * back to treating the input as a searchable place name / address.
 */
export function parseLocationInput(input: string): ParsedLocation {
  const text = input.trim();
  if (!text) return { kind: 'unsupported', reason: 'Type an address, store name, or paste a Google Maps link first.' };
  let url: URL | null = null;
  try {
    url = new URL(text);
  } catch {
    // Not a URL: plain search text (also covers bare "lat, lon").
    const bare = text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (bare) {
      const lat = Number(bare[1]), lon = Number(bare[2]);
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        return { kind: 'coords', lat, lon, label: `${lat}, ${lon}` };
      }
      return { kind: 'unsupported', reason: `"${text}" is not a valid coordinate pair. Latitude must be -90…90, longitude -180…180.` };
    }
    return { kind: 'query', query: text };
  }

  const host = url.hostname.toLowerCase();
  const isGoogle = host.includes('google.') || host === 'goo.gl' || host === 'maps.app.goo.gl';
  if (!isGoogle) return { kind: 'query', query: text };

  if (host === 'maps.app.goo.gl' || (host === 'goo.gl' && url.pathname.startsWith('/maps'))) {
    return {
      kind: 'unsupported',
      reason: 'Short Google Maps links cannot be read directly. Open the link in Google Maps, then copy the full URL (with @lat,lon in it) or the coordinates and paste that instead.',
    };
  }

  const href = url.href;
  const at = href.match(COORD_RE);
  if (at) {
    return { kind: 'coords', lat: Number(at[1]), lon: Number(at[2]), label: `Pinned from link (${at[1]}, ${at[2]})` };
  }
  const bang = href.match(BANG_RE);
  if (bang) {
    return { kind: 'coords', lat: Number(bang[1]), lon: Number(bang[2]), label: `Pinned from link (${bang[1]}, ${bang[2]})` };
  }
  const q = url.searchParams.get('q') ?? url.searchParams.get('query');
  if (q) {
    const bareQ = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (bareQ) {
      return { kind: 'coords', lat: Number(bareQ[1]), lon: Number(bareQ[2]), label: `Pinned from link (${bareQ[1]}, ${bareQ[2]})` };
    }
    return { kind: 'query', query: q.trim() };
  }
  return {
    kind: 'unsupported',
    reason: 'That Google Maps link has no coordinates in it. Open it in Google Maps, center the exact spot, then copy the URL with @lat,lon and paste it here.',
  };
}

/** Searches places through the backend (free providers, PH-biased). */
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const body = await api<{ results: PlaceResult[] }>(`/geocode/search?q=${encodeURIComponent(query)}`);
  return body.results ?? [];
}
