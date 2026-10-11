'use client';
import { useEffect, useState } from 'react';

/**
 * Debounces a fast-changing value (search text) so server-side filters do
 * not fire on every keystroke. Returns the latest settled value.
 */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
