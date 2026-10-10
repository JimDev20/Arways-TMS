import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCors from '@fastify/cors';
import { AppModule } from './app.module.js';
import { PostgresErrorFilter } from './common/postgres-error.filter.js';
import { DB } from './db/db.module.js';

async function bootstrap() {
  // P0 #11: fail fast on weak/missing JWT_SECRET (never boot with demo secret in prod).
  const jwtSecret = process.env.JWT_SECRET ?? '';
  const isProd = process.env.NODE_ENV === 'production';
  if (!jwtSecret || jwtSecret.length < 32) {
    const msg =
      '[startup] JWT_SECRET must be set to a long random string (>=32 chars). Refusing to boot.';
    if (isProd) throw new Error(msg);
    console.error(`${msg} (allowing in dev only)`);
  }
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true, bodyLimit: 1024 * 1024 }),
  );
  // P1 hardening: exact frontend origin only (never origin:true with credentials).
  // Set FRONTEND_URL in prod (e.g. https://app.arways.ph); dev falls back to localhost.
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  await app.register(fastifyCors, {
    origin: [frontendUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
  });
  // Minimal security headers (helmet-equivalent for Fastify; no new dep).
  // Fastify-native onRequest hook: the (req, res, next) Express signature
  // does NOT work here (middie passes the raw Node response, which has
  // setHeader, not header) — a wrong signature 500s every request.
  const fastify = app.getHttpAdapter().getInstance() as unknown as {
    addHook(name: string, fn: (...args: any[]) => void): void;
  };
  fastify.addHook('onRequest', (_req: any, reply: any, done: () => void) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    done();
  });
  // Tolerate empty JSON bodies (treat as {}): some clients declare
  // Content-Type: application/json while sending no payload (e.g. PATCH
  // approve/dispatch calls). Without this Fastify rejects them outright
  // with "Body cannot be empty...". Endpoints that require fields still
  // fail cleanly via ValidationPipe or their own required-field checks.
  // The adapter marks custom parsers as registered so Nest's own init
  // does not override them afterwards.
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
  // Boot-time schema check: fail fast with a plain message when the live
  // database is missing a migration (e.g. 0002_dispatch_photo.sql), instead
  // of serving 500s on every route/stop read. Never blocks boot.
  try {
    const db = app.get(DB) as { execute: (q: unknown) => Promise<unknown> };
    const { sql } = await import('drizzle-orm');
    const rows = (await db.execute(
      sql`select column_name from information_schema.columns where table_name = 'routes' and column_name = 'dispatch_left_photo_url'`,
    )) as unknown[];
    if (!Array.isArray(rows) || rows.length === 0) {
      console.error(
        '[startup] routes.dispatch_left_photo_url is missing. Run supabase/migrations/0002_dispatch_photo.sql in the Supabase SQL editor, then retry.',
      );
    }
  } catch (err) {
    console.error('[startup] schema check skipped:', err instanceof Error ? err.message : err);
  }
  const port = Number(process.env.PORT ?? process.env.PORT_BACKEND ?? 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`Arways TMS API listening on http://localhost:${port}/api`);
}
await bootstrap();
