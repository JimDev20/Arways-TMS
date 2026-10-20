#!/usr/bin/env node
/**
 * Load / availability probe for a running ARWAYS TMS API.
 *
 * Usage:
 *   BASE_URL=http://localhost:4000/api node scripts/load-test.mjs
 *   BASE_URL=https://api.example.com/api TARGET_PATH=/health CONCURRENCY=50 DURATION_SECONDS=30 node scripts/load-test.mjs
 *   BASE_URL=... TARGET_PATH=/orders AUTH_TOKEN=<jwt> node scripts/load-test.mjs
 *
 * Note: TARGET_PATH (not PATH) because PATH is always set by the OS.
 * Reports throughput, latency percentiles and status distribution. 429s are
 * reported separately (they mean the rate limiter is working); network errors
 * and 5xx responses make the run exit 1.
 */
const BASE = (process.env.BASE_URL ?? 'http://localhost:4000/api').replace(/\/+$/, '');
const TARGET_PATH = process.env.TARGET_PATH ?? '/health';
const METHOD = (process.env.METHOD ?? 'GET').toUpperCase();
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY ?? 20));
const DURATION_SECONDS = Math.max(1, Number(process.env.DURATION_SECONDS ?? 15));
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS ?? 10_000);
const TOKEN = process.env.AUTH_TOKEN ?? '';
const P95_BUDGET_MS = Number(process.env.P95_BUDGET_MS ?? 1_500);

const latencies = [];
const statuses = new Map();
let networkErrors = 0;
let bodies = 0;

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

async function hit() {
  const started = performance.now();
  try {
    const res = await fetch(`${BASE}${TARGET_PATH}`, {
      method: METHOD,
      headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : undefined,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const body = await res.text();
    bodies += body.length;
    latencies.push(performance.now() - started);
    statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
  } catch {
    networkErrors += 1;
    latencies.push(performance.now() - started);
  }
}

async function worker(deadline) {
  while (Date.now() < deadline) {
    await hit();
  }
}

async function main() {
  console.log(
    `Target: ${METHOD} ${BASE}${TARGET_PATH} | concurrency ${CONCURRENCY} | duration ${DURATION_SECONDS}s\n`,
  );
  const deadline = Date.now() + DURATION_SECONDS * 1000;
  const started = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(deadline)));
  const elapsed = (Date.now() - started) / 1000;
  const total = latencies.length;
  const sorted = [...latencies].sort((a, b) => a - b);
  const throttled = statuses.get(429) ?? 0;
  const serverErrors = [...statuses.entries()]
    .filter(([code]) => code >= 500)
    .reduce((sum, [, count]) => sum + count, 0);
  const otherErrors = [...statuses.entries()]
    .filter(([code]) => code >= 400 && code < 500 && code !== 429)
    .reduce((sum, [, count]) => sum + count, 0);

  console.log(`Requests:      ${total} in ${elapsed.toFixed(1)}s (~${(total / elapsed).toFixed(1)} req/s)`);
  console.log(`Latency p50:   ${percentile(sorted, 50).toFixed(0)} ms`);
  console.log(`Latency p95:   ${percentile(sorted, 95).toFixed(0)} ms`);
  console.log(`Latency p99:   ${percentile(sorted, 99).toFixed(0)} ms`);
  console.log(`Latency max:   ${(sorted[sorted.length - 1] ?? 0).toFixed(0)} ms`);
  console.log(`Network errors:${networkErrors}`);
  console.log(`Response bytes:${bodies}`);
  console.log('Status codes:');
  for (const [code, count] of [...statuses.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${code}: ${count}`);
  }
  console.log(`\nThrottled (429): ${throttled} (rate limiter working; not counted as failure)`);
  console.log(`Other 4xx:       ${otherErrors}`);
  console.log(`5xx:             ${serverErrors}`);

  const failed = networkErrors + serverErrors > 0 || percentile(sorted, 95) > P95_BUDGET_MS;
  if (failed) {
    console.log(
      `\nResult: FAIL (5xx/network errors or p95 above ${P95_BUDGET_MS} ms budget)`,
    );
    process.exitCode = 1;
  } else {
    console.log('\nResult: PASS');
  }
}

await main();
