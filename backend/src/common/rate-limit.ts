/**
 * Fixed-window rate limiter with bounded memory.
 *
 * Why not a plain Map: keyed abuse counters (login by ip+email, feedback by
 * user, global by ip) are attacker-controlled key spaces. An unbounded Map is
 * itself a memory-exhaustion vector. This limiter sweeps expired buckets and
 * hard-caps the number of tracked keys (oldest insertion dropped first).
 *
 * Single-instance only: for multi-instance deployments move the counters to
 * Redis/Postgres (Security Playbook: proxy trust + hosting DDoS protection).
 */
export interface HitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class FixedWindowLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly maxKeys = 20_000,
    private readonly now: () => number = Date.now,
  ) {
    if (max <= 0) throw new Error('FixedWindowLimiter max must be > 0');
    if (windowMs <= 0) throw new Error('FixedWindowLimiter windowMs must be > 0');
  }

  /** Counts one hit for the key and says whether it is still allowed. */
  hit(key: string): HitResult {
    const t = this.now();
    this.sweep(t);
    let bucket = this.buckets.get(key);
    if (!bucket || t >= bucket.resetAt) {
      bucket = { count: 0, resetAt: t + this.windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    // Hard cap after insertion: Map iteration is insertion order, so this
    // drops the oldest keys first. Attackers rotating keys cannot grow
    // memory without bound.
    if (this.buckets.size > this.maxKeys) {
      for (const k of this.buckets.keys()) {
        if (this.buckets.size <= this.maxKeys) break;
        this.buckets.delete(k);
      }
    }
    return {
      allowed: bucket.count <= this.max,
      remaining: Math.max(0, this.max - bucket.count),
      resetAt: bucket.resetAt,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - t) / 1000)),
    };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  resetAll(): void {
    this.buckets.clear();
  }

  get size(): number {
    return this.buckets.size;
  }

  private sweep(t: number): void {
    const due = t - this.lastSweep >= 60_000;
    if (!due && this.buckets.size <= this.maxKeys) return;
    this.lastSweep = t;
    for (const [key, bucket] of this.buckets) {
      if (t >= bucket.resetAt) this.buckets.delete(key);
    }
  }
}
