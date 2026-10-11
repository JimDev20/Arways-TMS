import { Controller, Get, Patch, Param, Body, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { SQL, and, count, desc, eq, ilike, ne, or } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module.js';
import * as schema from '../db/schema.js';
import { JwtAuthGuard } from '../common/jwt-auth.guard.js';
import { RolesGuard } from '../common/roles.guard.js';
import { Roles } from '../common/roles.decorator.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import type { JwtPayload } from '../common/roles.js';
import { USER_ROLES, USER_STATUSES, assertIn, assertPassword } from '../common/validate.js';
import { encodeCursor, escapeLike, keysetBefore, parseCursor, parseLimit, type Page } from '../common/pagination.js';

function withoutSecrets(users: any[]) {
  return users.map((u: any) => {
    const { passwordHash: _dropped, ...safe } = u;
    return safe;
  });
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(@Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>) {}

  @Get()
  @Roles('Owner')
  async list(
    @Query('q') q?: string,
    @Query('role') role?: string,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursorRaw?: string,
  ): Promise<any[] | Page<any>> {
    const conds: (SQL<unknown> | undefined)[] = [];
    if (role && role !== 'All') conds.push(eq(schema.users.role, assertIn(role, USER_ROLES, 'Role')));
    const needle = (q ?? '').trim();
    if (needle) {
      const like = `%${escapeLike(needle)}%`;
      conds.push(or(ilike(schema.users.fullName, like), ilike(schema.users.email, like)));
    }
    if (limitRaw === undefined) {
      // Legacy shape: full array.
      const rows = await this.db.select().from(schema.users);
      return withoutSecrets(rows as any[]);
    }
    // Paginated shape for tables: keyset over (created_at DESC, user_id DESC).
    const limit = parseLimit(limitRaw);
    const where = and(...conds);
    const pageWhere = and(...conds, keysetBefore(schema.users.createdAt, schema.users.userId, parseCursor(cursorRaw)));
    const rows: any[] = await this.db
      .select()
      .from(schema.users)
      .where(pageWhere)
      .orderBy(desc(schema.users.createdAt), desc(schema.users.userId))
      .limit(limit + 1);
    const [{ n }] = await this.db.select({ n: count() }).from(schema.users).where(where);
    const items = withoutSecrets(rows.slice(0, limit) as any[]);
    const last: any = rows[Math.min(rows.length, limit) - 1];
    return {
      items,
      nextCursor: rows.length > limit && last && last.createdAt != null ? encodeCursor(last.createdAt, last.userId) : null,
      total: Number(n),
    };
  }

  @Patch(':id/status')
  @Roles('Owner')
  async setStatus(@Param('id') id: string, @Body() body: { status: string }, @CurrentUser() me: JwtPayload) {
    const status = assertIn(body?.status, USER_STATUSES, 'Status');
    const rows: any[] = await this.db.select().from(schema.users).where(eq(schema.users.userId, id)).limit(1);
    if (!rows[0]) throw new BadRequestException('User not found. Refresh the user list.');
    if (status === 'Inactive' && id === me.sub) {
      throw new BadRequestException('You cannot deactivate your own account while logged in as Owner.');
    }
    if (status === 'Inactive' && rows[0].role === 'Owner') {
      const others: any[] = await this.db
        .select()
        .from(schema.users)
        .where(and(eq(schema.users.role, 'Owner'), eq(schema.users.status, 'Active'), ne(schema.users.userId, id)))
        .limit(1);
      if (others.length === 0) {
        throw new BadRequestException('This is the last active Owner. Promote another Owner first.');
      }
    }
    await this.db.update(schema.users).set({ status }).where(eq(schema.users.userId, id));
    return { ok: true };
  }

  /** Owner resets a user's password (forgot-password path until email reset lands). */
  @Patch(':id/password')
  @Roles('Owner')
  async resetPassword(@Param('id') id: string, @Body() body: { password: string }) {
    assertPassword(body?.password, 'New password');
    const rows: any[] = await this.db.select().from(schema.users).where(eq(schema.users.userId, id)).limit(1);
    if (!rows[0]) throw new BadRequestException('User not found. Refresh the user list.');
    const passwordHash = await bcrypt.hash(body.password, 12);
    await this.db.update(schema.users).set({ passwordHash }).where(eq(schema.users.userId, id));
    return { ok: true };
  }
}
