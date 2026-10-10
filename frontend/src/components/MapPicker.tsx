'use client';
import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icons } from '@/lib/createLucideIcon';
import { parseLocationInput, searchPlaces, type PlaceResult } from '@/lib/geocode';
import { gmapsUrl } from '@/lib/types';
import { inPH, looksSwappedPH } from '@/lib/map';

const pin = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41],
});

function ClickCatcher({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

/** Flies the map only when a searched result is picked: never fights manual panning. */
function FlyTo({ target }: { target: { lat: number; lon: number; key: number } | null }) {
  const map = useMap();
  const lastKey = useRef(0);
  useEffect(() => {
    if (target && target.key !== lastKey.current) {
      lastKey.current = target.key;
      map.flyTo([target.lat, target.lon], 16, { duration: 1.2 });
    }
  }, [map, target]);
  return null;
}

export default function MapPicker({
  label, lat, lon, onChange, mapKey,
}: { label: string; lat: number | null; lon: number | null; onChange: (lat: number, lon: number) => void; mapKey?: string }) {
  const [mlat, setMlat] = useState('');
  const [mlon, setMlon] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState('');
  const [open, setOpen] = useState(false);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lon: number; key: number } | null>(null);
  const [pickedFrom, setPickedFrom] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Manual lat/lon inputs stay independent (no sync effect): the picked pin
  // is shown below via `lat`/`lon`, manual fields are only for typed entry.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function pick(lat_: number, lon_: number, from?: string) {
    onChange(lat_, lon_);
    setFlyTarget({ lat: lat_, lon: lon_, key: Date.now() });
    setOpen(false);
    setResults([]);
    if (from !== undefined) setPickedFrom(from);
    if (!inPH(lat_, lon_)) {
      if (looksSwappedPH(lat_, lon_)) {
        setSearchMsg(`That pin (${lat_.toFixed(5)}, ${lon_.toFixed(5)}) is outside the Philippines — it looks like latitude and longitude are swapped. Swap them (lat ~${lon_.toFixed(5)}, lng ~${lat_.toFixed(5)}) or re-pick the correct spot in the Philippines.`);
      } else {
        setSearchMsg(`That pin (${lat_.toFixed(5)}, ${lon_.toFixed(5)}) is outside the Philippines (lat 4–21, lng 116–127). Move the pin to the right place inside the Philippines.`);
      }
    } else {
      setSearchMsg('');
    }
  }

  function runSearch(text: string) {
    const parsed = parseLocationInput(text);
    if (parsed.kind === 'coords') {
      setSearchMsg('');
      pick(parsed.lat, parsed.lon, text);
      return;
    }
    if (parsed.kind === 'unsupported') {
      setResults([]);
      setOpen(false);
      setSearchMsg(parsed.reason);
      return;
    }
    // Text query → backend (Philippines-only providers, merged + ranked).
    if (timer.current) clearTimeout(timer.current);
    if (parsed.query.length < 3) {
      setResults([]);
      setOpen(false);
      setSearchMsg(parsed.query ? '' : 'Type at least 3 characters to search.');
      return;
    }
    setSearching(true);
    setSearchMsg('');
    timer.current = setTimeout(async () => {
      try {
        const hits = await searchPlaces(parsed.query);
        // Defense in depth: backend is PH-only, but drop any straggler
        // foreign pin here too so it can never be picked.
        const phHits = hits.filter((h) => inPH(h.lat, h.lon));
        setResults(phHits);
        setOpen(true);
        setSearchMsg(phHits.length === 0 ? `No places found in the Philippines for "${parsed.query}". Try street + barangay + city (e.g. Quirino Highway, Quezon City). For Maanahao use "Maanahao, Palanas, Masbate". You can also click the map to pin manually.` : '');
      } catch (e: unknown) {
        setResults([]);
        setOpen(false);
        setSearchMsg(e instanceof Error ? e.message : 'Search failed. Check your connection and try again.');
      } finally {
        setSearching(false);
      }
    }, 600);
  }

  return (
    <div className="rounded border bg-white p-3">
      <div className="mb-2 text-sm font-semibold">{label}: search an address or store, paste a Google Maps link, or click map to pin</div>
      <div className="relative mb-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
              <Icons.Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              className="block w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-[#0e7a70] focus:outline-none focus:ring-1 focus:ring-[#0e7a70]"
              placeholder="Search store / address, or paste Google Maps link…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); runSearch(e.target.value); }}
              onFocus={() => { if (results.length > 0) setOpen(true); }}
              aria-label={`${label} search`}
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={() => runSearch(search)}
            disabled={searching}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {searching ? '…' : 'Search'}
          </button>
        </div>
        {open && results.length > 0 && (
          <ul className="absolute z-[1000] mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg" role="listbox" aria-label="Search results">
            {results.map((r, i) => (
              <li key={`${r.lat}-${r.lon}-${i}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => pick(r.lat, r.lon, r.label)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                >
                  <Icons.MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span className="flex-1 text-slate-800">{r.label}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{r.source === 'link' ? 'link' : r.source}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {searchMsg && (
        <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" role="alert">
          {searchMsg}
        </div>
      )}
      <div className="h-64 overflow-hidden rounded">
        {/* key remounts Leaflet cleanly when rows are added/removed (fixes "Map container is being reused"). */}
        <MapContainer key={mapKey ?? label} center={[14.676, 121.0437]} zoom={12} style={{ height: '100%', width: '100%' }} preferCanvas>
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors · Philippines-only search (Photon + Nominatim)" />
          <ClickCatcher onPick={(a, o) => pick(a, o, 'map click')} />
          <FlyTo target={flyTarget} />
          {lat != null && lon != null && <Marker position={[lat, lon]} icon={pin} />}
        </MapContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-500">{lat != null && lon != null ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : 'No pin yet'}</span>
        {lat != null && lon != null && inPH(lat, lon) && (
          <span className="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
            Philippines ✓
          </span>
        )}
        {lat != null && lon != null && !inPH(lat, lon) && (
          <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700" role="alert">
            Outside Philippines (lat 4–21, lng 116–127) — move the pin inside the Philippines.
          </span>
        )}
        {lat != null && lon != null && inPH(lat, lon) && (
          <a
            href={gmapsUrl(lat, lon)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-slate-600 hover:underline"
          >
            Verify in Google Maps
          </a>
        )}
        {lat != null && pickedFrom && search && !search.includes(pickedFrom.slice(0, 12)) && pickedFrom !== 'map click' && !pickedFrom.startsWith('Pinned') && (
          <span className="text-xs text-amber-700">Address changed after pin — re-check the pin matches.</span>
        )}
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer font-medium text-slate-600 hover:underline">Enter coordinates</summary>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <label>Lat <input className="w-28 rounded border px-1" value={mlat} onChange={(e) => setMlat(e.target.value)} inputMode="decimal" /></label>
            <label>Lon <input className="w-28 rounded border px-1" value={mlon} onChange={(e) => setMlon(e.target.value)} inputMode="decimal" /></label>
            <button
              type="button"
              className="rounded border px-2 py-1"
              onClick={() => { const a = Number(mlat), o = Number(mlon); if (Number.isFinite(a) && Number.isFinite(o)) pick(a, o, `${mlat}, ${mlon}`); else setSearchMsg('Those coordinates are not numbers. Type numeric latitude and longitude, then press Set.'); }}
            >Set</button>
          </span>
        </details>
      </div>
      <p className="mt-1 text-xs text-slate-400">Philippines only (lat 4–21, lng 116–127). Search first for exact stores, then verify the pin on the map — click the map only for fine-tuning.</p>
    </div>
  );
}
