import { createBrowserClient } from '@supabase/ssr';
import { messageFromBody } from '@/lib/errors';

export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export function authHeaders(): HeadersInit {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('arways_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // Only declare a JSON content-type when a body is actually sent. Fastify
  // rejects bodiless requests that claim to be JSON ("Body cannot be empty
  // when content-type is set to 'application/json'"), which broke bodiless
  // PATCH calls like approve, dispatch arrived/left, and stop arrived.
  const sendsBody = init?.body !== undefined && init?.body !== null;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(sendsBody ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      localStorage.removeItem('arways_token');
      localStorage.removeItem('arways_user');
      window.location.href = new URL('/login', window.location.origin).toString();
    }
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(messageFromBody(body, res.status));
  }
  return res.json() as Promise<T>;
}
