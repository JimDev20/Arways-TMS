'use client';
import { useSyncExternalStore } from 'react';

/**
 * SSR-safe localStorage read via useSyncExternalStore.
 *
 * Why not useState + useEffect? The effect version trips
 * react-hooks/set-state-in-effect, and a render-phase read would
 * hydration-mismatch on prerendered pages. The external store gives a
 * stable server snapshot ('') and a cached client snapshot, and updates
 * on cross-tab `storage` events.
 */

interface CacheEntry {
  raw: string | null;
  value: string | null;
}

const cache = new Map<string, CacheEntry>();
const listeners = new Set<() => void>();

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  listeners.add(onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    listeners.delete(onChange);
  };
}

function getSnapshot(key: string): string | null {
  const raw = readRaw(key);
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value;
  const entry: CacheEntry = { raw, value: raw };
  cache.set(key, entry);
  return entry.value;
}

function getServerSnapshot(): string | null | undefined {
  // Prerender/SSR has no localStorage: callers treat undefined as "loading"
  // so server and client first render agree (no hydration mismatch).
  return undefined;
}

/**
 * Raw string value for a localStorage key.
 * Returns undefined during SSR / before hydration ("loading"),
 * null when the key is missing, otherwise the stored string.
 */
export function useStoredString(key: string): string | null | undefined {
  return useSyncExternalStore(subscribe, () => getSnapshot(key), getServerSnapshot);
}

/** Write a raw string value and notify subscribers in this tab. */
export function writeStoredString(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode: skip */
  }
  cache.delete(key);
  for (const notify of listeners) notify();
}
