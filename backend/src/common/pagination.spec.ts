import { describe, expect, it } from 'vitest';
import { SQL } from 'drizzle-orm';
import {
  encodeCursor,
  escapeLike,
  keysetBefore,
  parseCursor,
  parseLimit,
} from './pagination.js';
import * as schema from '../db/schema.js';

describe('pagination helpers', () => {
  it('parseLimit clamps to 1..100 with default 20', () => {
    expect(parseLimit(undefined)).toBe(20);
    expect(parseLimit('5')).toBe(5);
    expect(parseLimit('0')).toBe(20);
    expect(parseLimit('-3')).toBe(20);
    expect(parseLimit('1000')).toBe(100);
    expect(parseLimit('abc')).toBe(20);
  });

  it('parseCursor round-trips encodeCursor and rejects garbage', () => {
    const c = encodeCursor(new Date('2026-01-02T03:04:05.000Z'), '11111111-2222-4333-8444-555555555555');
    expect(parseCursor(c)).toEqual({ at: '2026-01-02T03:04:05.000Z', id: '11111111-2222-4333-8444-555555555555' });
    expect(parseCursor(undefined)).toBeNull();
    expect(parseCursor('')).toBeNull();
    expect(parseCursor('no-separator')).toBeNull();
    expect(parseCursor('not-a-date|some-id')).toBeNull();
    expect(parseCursor('|some-id')).toBeNull();
  });

  it('escapeLike neutralises LIKE wildcards', () => {
    expect(escapeLike('100%_x\\y')).toBe('100\\%\\_x\\\\y');
    expect(escapeLike('ABC 123')).toBe('ABC 123');
  });

  it('keysetBefore is undefined without a cursor and SQL with one', () => {
    expect(keysetBefore(schema.orders.createdAt, schema.orders.orderId, null)).toBeUndefined();
    const cond = keysetBefore(
      schema.orders.createdAt,
      schema.orders.orderId,
      { at: '2026-01-02T03:04:05.000Z', id: '11111111-2222-4333-8444-555555555555' },
    );
    expect(cond).toBeInstanceOf(SQL);
  });
});
