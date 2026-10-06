import { Inject, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import bcrypt from 'bcrypt';
import { DB } from '../db/db.module.js';
import * as schema from '../db/schema.js';
import type { Role } from '../common/roles.js';

// Simple in-memory login rate limit: 10 attempts / 10 min per IP+email.
const attempts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string): void {
  const now = Date.now();
  const cur = attempts.get(key);
  if (!cur || now > cur.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return;
  }
  cur.count += 1;
  if (cur.count > 10) throw new UnauthorizedException('Too many attempts. Try again later.');
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateUser(email: string, password: string) {
    const rows = await this.db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    const user = rows[0];
    if (!user || user.status !== 'Active') throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash as string);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return user;
  }

  async login(email: string, password: string, ip?: string) {
    checkRateLimit(`${ip ?? 'na'}:${email}`);
    const user = await this.validateUser(email, password);
    const payload = { sub: user.userId, email: user.email, role: user.role as Role };
    const token = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: '24h',
    });
    return {
      access_token: token,
      user: { userId: user.userId, email: user.email, fullName: user.fullName, role: user.role },
    };
  }

  /** Owner-only registration (also allow first-user bootstrap when table empty). */
  async register(dto: { email: string; password: string; fullName: string; role: string }, requesterRole?: Role) {
    const all = await this.db.select({ id: schema.users.userId }).from(schema.users).limit(1);
    if (all.length > 0 && requesterRole !== 'Owner') {
      throw new ForbiddenException('Only Owner can create users');
    }
    const existing = await this.db.select().from(schema.users).where(eq(schema.users.email, dto.email)).limit(1);
    if (existing.length > 0) throw new ForbiddenException('Email already in use');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const inserted = await this.db
      .insert(schema.users)
      .values({ email: dto.email, passwordHash, fullName: dto.fullName, role: dto.role, status: 'Active' })
      .returning();
    const u = inserted[0];
    return { userId: u.userId, email: u.email, fullName: u.fullName, role: u.role };
  }
}
