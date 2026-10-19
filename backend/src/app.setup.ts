import { ValidationPipe } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCors from '@fastify/cors';
import { PostgresErrorFilter } from './common/postgres-error.filter.js';
import { FixedWindowLimiter } from './common/rate-limit.js';

/**
 * Parses TRUST_PROXY so the API sees the real client IP behind a host/CDN.
 * `true`, a hop count (e.g. `1`), or a Fastify/Node trust-proxy string
 * (e.g. `loopback`, CIDR list). Default: false (direct connections only).
 */
export function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (!value) return false;
  const v = value.trim();
  if (v === 'true') return true;
  if (v === 'false' || v === '') return false;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

/**
 * Single place where the production HTTP surface is configured: CORS,
 * security headers, global rate limit, body parsing, validation and the
 * `/api` prefix. `main.ts` and the security e2e tests both call this, so
 * tests exercise the same middleware as production.
 */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const origins = [...new Set([frontendUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'])];
  await app.register(fastifyCors, { origin: origins, credentials: true });

  const isProd = process.env.NODE_ENV === 'production';
  const rateMax = envInt('RATE_LIMIT_MAX', 300);
  const rateWindowMs = envInt('RATE_LIMIT_WINDOW_MS', 60_000) || 60_000;
  // Per-IP fixed window: cheap first line of defence against request floods.
  // Login and other abuse limits stay stricter (see auth.service / misc).
  const limiter = rateMax > 0 ? new FixedWindowLimiter(rateMax, rateWindowMs) : null;
  const fastify = app.getHttpAdapter().getInstance() as unknown as {
    addHook(name: string, fn: (...args: any[]) => void): void;
  };
  fastify.addHook('onRequest', (req: any, reply: any, done: () => void) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
    reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    if (isProd) {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (!limiter) {
      done();
      return;
    }
    const hit = limiter.hit(String(req.ip ?? 'unknown'));
    reply.header('X-RateLimit-Limit', rateMax);
    reply.header('X-RateLimit-Remaining', hit.remaining);
    if (!hit.allowed) {
      reply.header('Retry-After', hit.retryAfterSec);
      reply.code(429).send({
        statusCode: 429,
        message: 'Too many requests. Slow down, then try again shortly.',
      });
      return;
    }
    done();
  });

  // Tolerate empty JSON bodies (treat as {}): some clients declare
  // Content-Type: application/json while sending no payload (e.g. PATCH
  // approve/dispatch calls). Endpoints that require fields still fail
  // cleanly via ValidationPipe or their own required-field checks.
  app.useBodyParser('application/json', {}, (req, body, done) => {
    const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body ?? '');
    if (!text) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch (err) {
      done(err as Error);
    }
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Actionable messages for raw Postgres driver errors (e.g. a missing
  // migration column) instead of a bare "Internal server error".
  app.useGlobalFilters(new PostgresErrorFilter());
  app.setGlobalPrefix('api');
}
