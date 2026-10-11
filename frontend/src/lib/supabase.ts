import { createBrowserClient } from '@supabase/ssr';
import { friendlyErrorMessage, messageFromBody } from '@/lib/errors';

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

/** Error thrown by api(): carries the HTTP status so pages can split states (e.g. 403 → access error, not empty). */
export interface ApiError extends Error {
  status?: number;
}

function withStatus(message: string, status?: number): ApiError {
  const err = new Error(message) as ApiError;
  if (status !== undefined) err.status = status;
  return err;
}

export function apiStatus(err: unknown): number | undefined {
  return (err as ApiError | null)?.status;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // Only declare a JSON content-type when a body is actually sent. Fastify
  // rejects bodiless requests that claim to be JSON ("Body cannot be empty
  // when content-type is set to 'application/json'"), which broke bodiless
  // PATCH calls like approve, dispatch arrived/left, and stop arrived.
  const sendsBody = init?.body !== undefined && init?.body !== null;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(sendsBody ? { 'Content-Type': 'application/json' } : {}),
        ...authHeaders(),
        ...(init?.headers ?? {}),
      },
    });
  } catch (err: unknown) {
    // Backend down / unreachable: map the raw TypeError to the same
    // server-unreachable text the login page shows.
    throw withStatus(friendlyErrorMessage(err));
  }
  if (res.status === 401) {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      localStorage.removeItem('arways_token');
      localStorage.removeItem('arways_user');
      window.location.href = new URL('/login', window.location.origin).toString();
    }
    throw withStatus('Session expired. Log in again.', 401);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw withStatus(messageFromBody(body, res.status), res.status);
  }
  return res.json() as Promise<T>;
}
