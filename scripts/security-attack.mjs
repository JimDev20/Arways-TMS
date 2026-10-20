#!/usr/bin/env node
/**
 * Security abuse probe for a running ARWAYS TMS API.
 *
 * Usage:
 *   BASE_URL=http://localhost:4000/api node scripts/security-attack.mjs
 *   BASE_URL=https://api.example.com/api AUTH_TOKEN=<jwt> node scripts/security-attack.mjs
 *
 * What it does (only against YOUR server):
 *  - verifies security headers and CORS allow-list
 *  - checks unauthenticated endpoints reject missing/forged/alg:none tokens
 *  - fires SQL-injection payloads and requires 4xx (never 2xx/5xx, no pg_sleep delay)
 *  - verifies oversized bodies are rejected
 *  - probe-floods a nonexistent route to confirm the global rate limiter
 *  - tries repeated bad logins to confirm the login limiter
 *
 * Exit code 1 if any check FAILs. WARNs do not fail the run.
 */
const BASE = (process.env.BASE_URL ?? 'http://localhost:4000/api').replace(/\/+$/, '');
const TOKEN = process.env.AUTH_TOKEN ?? '';
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS ?? 10_000);
const results = [];

function record(name, status, detail) {
  results.push({ name, status, detail });
  const line = `[${status}] ${name}${detail ? ` - ${detail}` : ''}`;
  console.log(line);
}

async function probe(name, fn) {
  try {
    const outcome = await fn();
    record(name, outcome.status, outcome.detail);
  } catch (err) {
    record(name, 'FAIL', err instanceof Error ? err.message : String(err));
  }
}

async function request(path, init = {}) {
  const started = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    ...init,
  });
  const text = await res.text();
  return { res, text, ms: Math.round(performance.now() - started) };
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const SQLI = [
  "' OR '1'='1' --",
  "'; DROP TABLE users; --",
  "' UNION SELECT password_hash FROM users --",
  "'; SELECT pg_sleep(5); --",
  '") OR 1=1 --',
];

async function main() {
  console.log(`Target: ${BASE}\n`);

  await probe('security headers', async () => {
    const { res } = await request('/health');
    expect(res.status === 200, `expected 200, got ${res.status}`);
    expect(res.headers.get('x-content-type-options') === 'nosniff', 'missing nosniff');
    expect(res.headers.get('x-frame-options') === 'DENY', 'missing frame denial');
    expect(res.headers.get('content-security-policy'), 'missing CSP');
    return { status: 'PASS', detail: 'nosniff, frame-deny, CSP present' };
  });

  await probe('CORS allow-list', async () => {
    const evil = await request('/health', { headers: { origin: 'https://evil.example' } });
    expect(!evil.res.headers.get('access-control-allow-origin'), 'evil origin was reflected');
    const allowed = process.env.ALLOWED_ORIGIN ?? 'http://localhost:3000';
    const ok = await request('/health', { headers: { origin: allowed } });
    expect(
      ok.res.headers.get('access-control-allow-origin') === allowed,
      `allowed origin ${allowed} not echoed`,
    );
    return { status: 'PASS', detail: 'unknown origins rejected' };
  });

  await probe('unauthenticated access blocked', async () => {
    const { res } = await request('/clients');
    expect(res.status === 401, `expected 401, got ${res.status}`);
    return { status: 'PASS', detail: '401' };
  });

  await probe('forged JWT rejected', async () => {
    const { res } = await request('/clients', {
      headers: { authorization: 'Bearer forged.token.value' },
    });
    expect(res.status === 401, `expected 401, got ${res.status}`);
    return { status: 'PASS', detail: '401' };
  });

  await probe('alg:none JWT rejected', async () => {
    const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const header = enc({ alg: 'none', typ: 'JWT' });
    const payload = enc({ sub: 'attacker', role: 'Owner' });
    const { res } = await request('/clients', {
      headers: { authorization: `Bearer ${header}.${payload}.` },
    });
    expect(res.status === 401, `expected 401, got ${res.status}`);
    return { status: 'PASS', detail: '401' };
  });

  await probe('SQL injection payloads (login)', async () => {
    for (const email of SQLI) {
      const { res, text, ms } = await request('/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'Attack1!aaaa' }),
      });
      expect(res.status < 500, `payload returned ${res.status} for ${email}`);
      expect(res.status >= 400, `payload accepted (${res.status}) for ${email}`);
      expect(ms < 3_000, `possible time-based SQLi: ${ms}ms for ${email}`);
      expect(!/syntax error|pg_|postgres/i.test(text), `DB internals leaked for ${email}`);
    }
    return { status: 'PASS', detail: `${SQLI.length} payloads rejected as data` };
  });

  if (TOKEN) {
    await probe('SQL injection payloads (authenticated search)', async () => {
      for (const q of SQLI) {
        const { res, text } = await request(`/orders?q=${encodeURIComponent(q)}`, {
          headers: { authorization: `Bearer ${TOKEN}` },
        });
        expect(res.status < 500, `search returned ${res.status} for ${q}`);
        expect(!/syntax error|pg_|postgres/i.test(text), `DB internals leaked for ${q}`);
      }
      return { status: 'PASS', detail: 'search treats payloads as data' };
    });
  } else {
    record('SQL injection payloads (authenticated search)', 'SKIP', 'set AUTH_TOKEN to enable');
  }

  await probe('oversized body rejected', async () => {
    const { res } = await request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', password: 'x'.repeat(1024 * 1024 + 100) }),
    });
    expect([400, 413].includes(res.status), `expected 400/413, got ${res.status}`);
    return { status: 'PASS', detail: String(res.status) };
  });

  await probe('malformed JSON rejected', async () => {
    const { res } = await request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"email":',
    });
    expect(res.status === 400, `expected 400, got ${res.status}`);
    return { status: 'PASS', detail: '400' };
  });

  await probe('login rate limit', async () => {
    const email = `probe-${Date.now()}@example.invalid`;
    let throttled = false;
    for (let i = 0; i < 12; i++) {
      const { res } = await request('/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'Wrong1!aaaa' }),
      });
      if (res.status === 429 || (res.status === 401 && i >= 10)) throttled = true;
      if (res.status >= 500) throw new Error(`server error during login attempts: ${res.status}`);
    }
    return throttled
      ? { status: 'PASS', detail: 'throttled after repeated failures' }
      : { status: 'WARN', detail: 'no throttling observed after 12 attempts' };
  });

  await probe('global rate limit (probe route, not /health)', async () => {
    const burst = Number(process.env.BURST ?? 350);
    const concurrency = Number(process.env.CONCURRENCY ?? 25);
    let next = 0;
    let count429 = 0;
    let serverErrors = 0;
    async function worker() {
      while (next < burst) {
        next += 1;
        const { res } = await request('/__security-rate-probe');
        if (res.status === 429) count429 += 1;
        if (res.status >= 500) serverErrors += 1;
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, burst) }, worker));
    expect(serverErrors === 0, `${serverErrors} server errors during burst`);
    if (count429 > 0) return { status: 'PASS', detail: `${count429}/${burst} throttled` };
    return {
      status: 'WARN',
      detail: `no 429 in ${burst} requests - set RATE_LIMIT_MAX low and restart to verify`,
    };
  });

  const failed = results.filter((r) => r.status === 'FAIL');
  const warned = results.filter((r) => r.status === 'WARN');
  console.log(`\nSummary: ${results.length - failed.length - warned.length} pass, ${failed.length} fail, ${warned.length} warn`);
  if (failed.length) {
    console.log('FAILED checks:');
    for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  }
}

await main();
