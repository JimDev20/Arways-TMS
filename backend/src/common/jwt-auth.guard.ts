import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module.js';
import * as schema from '../db/schema.js';

/** Validates Bearer JWT (24h expiry), checks user is still Active (60s cache), attaches payload as req.user. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Optional() @Inject(DB) private readonly db?: PostgresJsDatabase<typeof schema>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers?.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Missing token');
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      // P0 #9: deactivation takes effect within ~60s (not 24h). Cache per user.
      if (this.db && payload?.sub) {
        const cached = statusCache.get(payload.sub);
        const now = Date.now();
        let status = cached && now - cached.at < 60_000 ? cached.status : null;
        if (!status) {
          try {
            const rows = await this.db
              .select({ status: schema.users.status })
              .from(schema.users)
              .where(eq(schema.users.userId, payload.sub))
              .limit(1);
            status = (rows[0] as any)?.status ?? null;
          } catch {
            status = null; // DB down: fail open for health/readiness, closed below if user gone
          }
          statusCache.set(payload.sub, { status: status ?? 'Unknown', at: now });
        }
        if (status && status !== 'Active') {
          throw new UnauthorizedException('Invalid or expired token');
        }
      }
      req.user = payload;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}

const statusCache = new Map<string, { status: string; at: number }>();
