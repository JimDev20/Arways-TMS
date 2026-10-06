import { Controller, Get, Patch, Param, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module.js';
import * as schema from '../db/schema.js';
import { JwtAuthGuard } from '../common/jwt-auth.guard.js';
import { RolesGuard } from '../common/roles.guard.js';
import { Roles } from '../common/roles.decorator.js';

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
  async setStatus(@Param('id') id: string, @Body() body: { status: string }) {
    await this.db.update(schema.users).set({ status: body.status }).where(eq(schema.users.userId, id));
    return { ok: true };
  }

  /** Owner resets a user's password (forgot-password path until email reset lands). */
  @Patch(':id/password')
  @Roles('Owner')
  async resetPassword(@Param('id') id: string, @Body() body: { password: string }) {
    if (!body?.password || body.password.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters long.');
    }
    const passwordHash = await bcrypt.hash(body.password, 12);
    await this.db.update(schema.users).set({ passwordHash }).where(eq(schema.users.userId, id));
    return { ok: true };
  }
}
