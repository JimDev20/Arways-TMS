import { SQL, SQLWrapper, sql } from 'drizzle-orm';

/**
 * Cursor pagination (ARWAYS-UI-IMPROVEMENTS §3.7/UI-11): `?limit=` +
 * `?cursor=` on list endpoints. Keyset over (created_at DESC, id DESC), so
 * inserts never shift pages. Opt-in: without `limit` the endpoint keeps its
 * legacy full-array shape, so existing callers (boards, dashboards, search)
 * keep working unchanged.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Parse ?limit= (1..100, default 20). */
export function parseLimit(raw?: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

export interface PageCursor {
  at: string;
  id: string;
}

/**
 * Decode an opaque cursor built by encodeCursor ("ISO-timestamp|uuid").
 * Null when absent or malformed (first page) — never throws.
 */
export function parseCursor(raw?: string): PageCursor | null {
  if (!raw) return null;
  const sep = raw.lastIndexOf('|');
  if (sep <= 0) return null;
  const at = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (!at || !id) return null;
  if (Number.isNaN(Date.parse(at))) return null;
  return { at: new Date(at).toISOString(), id };
}

/** Encode the next-page cursor from the last row's timestamp + id. */
export function encodeCursor(at: unknown, id: string): string {
  const iso = at instanceof Date ? at.toISOString() : String(at);
  return `${iso}|${id}`;
}

/**
 * Keyset condition for (created_at DESC, id DESC) ordering.
 * Returns undefined when there is no cursor (first page); drizzle's
 * and()/where() skips undefined, so callers can spread unconditionally.
 */
export function keysetBefore(
  createdAtCol: SQLWrapper,
  idCol: SQLWrapper,
  cursor: PageCursor | null,
): SQL<unknown> | undefined {
  if (!cursor) return undefined;
  return sql`(${createdAtCol}::timestamptz, ${idCol}::uuid) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`;
}

/** Escape LIKE wildcards in user search text. */
export function escapeLike(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}
