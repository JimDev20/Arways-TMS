'use client';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const pin = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41],
});

/** Highlighted pin for the selected stop (same artwork, larger — 25×41 already meets the 24 px minimum [U14]). */
const pinSelected = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [33, 55], iconAnchor: [16, 55],
});

import type { MapPin } from '@/lib/map';
export type { MapPin };

function Recenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], Math.max(map.getZoom(), 12));
  }, [map, lat, lon]);
  return null;
}

/**
 * Read-only map showing pins (delivery overview). Not for picking: see MapPicker.
 * Two-way selection with the adjacent stop list [U13]: `selectedIndex`
 * highlights one pin; activating a pin (click or keyboard Enter on the
 * marker) calls `onSelectPin`. Markers stay keyboard-focusable and Tab/Esc
 * behave per Leaflet defaults (no focus trap); every pin action is also on
 * its stop card. setView (no animation) keeps motion minimal.
 */
export function MapView({
  pins,
  height = 'h-72',
  selectedIndex = null,
  onSelectPin,
}: {
  pins: MapPin[];
  height?: string;
  selectedIndex?: number | null;
  onSelectPin?: (index: number) => void;
}) {
  const center: [number, number] =
    pins.length > 0 ? [pins[0].lat, pins[0].lon] : [14.676, 121.0437];
  return (
    <div className={`${height} min-h-56 overflow-hidden rounded bg-slate-100`}>
      <MapContainer key={`${center[0].toFixed(3)}-${center[1].toFixed(3)}-${pins.length}`} center={center} zoom={12} style={{ height: '100%', width: '100%', minHeight: '14rem' }} preferCanvas attributionControl>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors" />
        <Recenter lat={center[0]} lon={center[1]} />
        {pins.map((p, i) => (
          <Marker
            key={`${p.lat}-${p.lon}-${i}`}
            position={[p.lat, p.lon]}
            icon={selectedIndex === i ? pinSelected : pin}
            eventHandlers={onSelectPin ? { click: () => onSelectPin(i) } : undefined}
          >
            <Popup>{p.label}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

export { coordsOf } from '@/lib/map';
