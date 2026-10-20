import { describe, expect, it } from 'vitest';
import { FixedWindowLimiter } from './rate-limit.js';

describe('FixedWindowLimiter', () => {
  it('allows up to max, blocks the next hit, then recovers after the window', () => {
    let now = 0;
    const limiter = new FixedWindowLimiter(3, 1_000, 100, () => now);
    expect(limiter.hit('k').allowed).toBe(true);
    expect(limiter.hit('k').allowed).toBe(true);
    expect(limiter.hit('k').allowed).toBe(true);
    const blocked = limiter.hit('k');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBe(1);
    now = 1_000;
    expect(limiter.hit('k').allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    const limiter = new FixedWindowLimiter(1, 1_000, 100, () => 0);
    expect(limiter.hit('a').allowed).toBe(true);
    expect(limiter.hit('a').allowed).toBe(false);
    expect(limiter.hit('b').allowed).toBe(true);
  });

  it('caps tracked keys so rotating keys cannot exhaust memory', () => {
    const limiter = new FixedWindowLimiter(5, 60_000, 10, () => 0);
    for (let i = 0; i < 500; i++) limiter.hit(`attacker-key-${i}`);
    expect(limiter.size).toBeLessThanOrEqual(10);
  });

  it('sweeps expired buckets instead of leaking them', () => {
    let now = 0;
    const limiter = new FixedWindowLimiter(5, 1_000, 100, () => now);
    limiter.hit('a');
    limiter.hit('b');
    expect(limiter.size).toBe(2);
    now = 61_000;
    limiter.hit('c');
    expect(limiter.size).toBe(1);
  });

  it('rejects invalid configuration', () => {
    expect(() => new FixedWindowLimiter(0, 1_000)).toThrow();
    expect(() => new FixedWindowLimiter(1, 0)).toThrow();
  });
});
