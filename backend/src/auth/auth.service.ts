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

  private async writeAuthLog(email: string, success: boolean, ip?: string) {
    // P1: auth_logs was never written. Best-effort (never blocks login).
    try {
      await this.db.insert((schema as any).authLogs ?? (schema as any).auth_logs).values({
        email,
        success,
        ipAddress: ip ?? null,
      });
    } catch {
      /* table may not exist on old DBs; ignore */
    }
  }

  async login(email: string, password: string, ip?: string) {
    checkRateLimit(`${ip ?? 'na'}:${email}`);
    try {
      const user = await this.validateUser(email, password);
      const payload = { sub: user.userId, email: user.email, role: user.role as Role };
      const token = await this.jwt.signAsync(payload, {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: '24h',
      });
      await this.writeAuthLog(email, true, ip);
      return {
        access_token: token,
        user: { userId: user.userId, email: user.email, fullName: user.fullName, role: user.role },
      };
    } catch (err) {
      await this.writeAuthLog(email, false, ip);
      throw err;
    }
  }

  /** Owner-only registration (also allow first-user bootstrap when table empty). */
  async register(
    dto: { email: string; password: string; fullName: string; role: string; phone?: string; licenseNo?: string; clientId?: string },
    requesterRole?: Role,
  ) {
    const all = await this.db.select({ id: schema.users.userId }).from(schema.users).limit(1);
    if (all.length > 0 && requesterRole !== 'Owner') {
      throw new ForbiddenException('Only Owner can create users');
    }
    // Feature Placement: passwords 10–64 chars (allow paste), deny-list common ones.
    // Keeps min-8 logins working; new passwords must meet the stronger rule.
    const pw = dto.password ?? '';
    if (pw.length < 10 || pw.length > 64) {
      throw new ForbiddenException('Password must be 10–64 characters. Use a longer passphrase.');
    }
    const lowered = pw.toLowerCase();
    const denied = ['password', 'password123', '1234567890', 'qwerty12345', 'arways12345', 'letmein1234'];
    if (denied.some((d) => lowered.includes(d))) {
      throw new ForbiddenException('That password is too common. Pick a less predictable passphrase.');
    }
    const existing = await this.db.select().from(schema.users).where(eq(schema.users.email, dto.email)).limit(1);
    if (existing.length > 0) throw new ForbiddenException('Email already in use');
    const phone = dto.phone?.trim() || null;
    if (phone && !/^[+\d][\d\s\-()]{6,19}$/.test(phone)) {
      throw new ForbiddenException('Phone must be 7–20 characters: digits, spaces, +, -.');
    }
    const licenseNo = dto.licenseNo?.trim() || null;
    if (licenseNo && dto.role !== 'Driver') {
      throw new ForbiddenException('License number is for Driver accounts only.');
    }
    // Optional: link a new Client login to its company right away, so the
    // account can create and track orders without a second setup step.
    let linkClientId: string | null = null;
    if (dto.clientId) {
      if (dto.role !== 'Client') throw new ForbiddenException('Client company can only be linked to a Client account.');
      const found: any[] = await this.db.select().from(schema.clients).where(eq(schema.clients.clientId, dto.clientId)).limit(1);
      if (!found[0]) throw new ForbiddenException('Client company not found. Pick it from the list.');
      linkClientId = found[0].clientId;
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const inserted = await this.db
      .insert(schema.users)
      .values({ email: dto.email, passwordHash, fullName: dto.fullName, role: dto.role, phone, licenseNo, status: 'Active' })
      .returning();
    const u = inserted[0];
    if (linkClientId) {
      await this.db.insert(schema.clientUsers).values({ clientId: linkClientId, userId: u.userId }).onConflictDoNothing();
    }
    return { userId: u.userId, email: u.email, fullName: u.fullName, role: u.role, phone: u.phone, licenseNo: u.licenseNo };
  }
}
