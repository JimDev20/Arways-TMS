import { Controller, Get, Patch, Param, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module.js';
import * as schema from '../db/schema.js';
import { JwtAuthGuard } from '../common/jwt-auth.guard.js';
import { RolesGuard } from '../common/roles.guard.js';
import { Roles } from '../common/roles.decorator.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import type { JwtPayload } from '../common/roles.js';
import { USER_STATUSES, assertIn } from '../common/validate.js';

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
  async list() {
    const rows = await this.db.select().from(schema.users);
    return withoutSecrets(rows as any[]);
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
    if (!body?.password || body.password.length < 10 || body.password.length > 64) {
      throw new BadRequestException('New password must be 10–64 characters long.');
    }
    const rows: any[] = await this.db.select().from(schema.users).where(eq(schema.users.userId, id)).limit(1);
    if (!rows[0]) throw new BadRequestException('User not found. Refresh the user list.');
    const passwordHash = await bcrypt.hash(body.password, 12);
    await this.db.update(schema.users).set({ passwordHash }).where(eq(schema.users.userId, id));
    return { ok: true };
  }
}
