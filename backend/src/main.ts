import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { configureApp, parseTrustProxy } from './app.setup.js';
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
  const bodyLimit = Number(process.env.BODY_LIMIT_BYTES ?? 1024 * 1024) || 1024 * 1024;
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: true,
      bodyLimit,
      trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
      // Slow-loris / hung-connection protection at the HTTP layer.
      connectionTimeout: Number(process.env.CONNECTION_TIMEOUT_MS ?? 10_000) || 10_000,
      requestTimeout: Number(process.env.REQUEST_TIMEOUT_MS ?? 30_000) || 30_000,
      maxParamLength: 200,
    }),
  );
  await configureApp(app);
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
