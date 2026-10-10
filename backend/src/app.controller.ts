import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { AppService } from './app.service.js';
import { DB } from './db/db.module.js';
import * as schema from './db/schema.js';

@Controller()
export class AppController {
  constructor(
    @Inject(AppService) private readonly appService: AppService,
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Public health for uptime monitors (no login) and the login page's
   * server-reachability check. Pings the database with SELECT 1; reports
   * degraded (HTTP 200 + ok:false, never a 500) when the DB is unreachable
   * so monitors and the frontend can tell "API up, DB down" apart from
   * "API down". This is the only /api/health route (the authenticated
   * duplicate in MiscController was removed: Fastify throws
   * FST_ERR_DUPLICATED_ROUTE on duplicate routes at boot).
   */
  @Get('health')
  async health() {
    const time = new Date().toISOString();
    try {
      await this.db.execute(sql`select 1`);
      return { ok: true, service: 'arways-tms-backend', time, db: 'up' };
    } catch {
      return { ok: false, service: 'arways-tms-backend', time, db: 'down' };
    }
  }
}
