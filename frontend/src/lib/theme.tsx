'use client';
import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

const THEME_KEY = 'arways_theme';
let current: Theme = 'light';
let initialized = false;
const listeners = new Set<() => void>();

function readInitial(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function ensureInitialized(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  current = readInitial();
  document.documentElement.classList.toggle('dark', current === 'dark');
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): Theme {
  ensureInitialized();
  return current;
}

function getServerSnapshot(): Theme {
  return 'light';
}

function applyTheme(t: Theme): void {
  current = t;
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* private mode: skip */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', t === 'dark');
  }
  for (const notify of listeners) notify();
}

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void; set: (t: Theme) => void }>({
  theme: 'light',
  toggle: () => {},
  set: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const value = useMemo(
    () => ({ theme, toggle: () => applyTheme(theme === 'dark' ? 'light' : 'dark'), set: applyTheme }),
    [theme],
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): { theme: Theme; toggle: () => void; set: (t: Theme) => void } {
  return useContext(ThemeCtx);
}
