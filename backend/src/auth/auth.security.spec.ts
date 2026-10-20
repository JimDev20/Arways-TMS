import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService, checkRateLimit, resetLoginRateLimit } from './auth.service.js';

const PASSWORD = 'Correct1!xyz';
let hash: string;

beforeEach(async () => {
  resetLoginRateLimit();
  hash = await bcrypt.hash(PASSWORD, 4);
});

interface DbConfig {
  idRows?: any[];
  whereQueue?: any[][];
  insertedUser?: any;
}

function makeDb(cfg: DbConfig = {}) {
  const queue = [...(cfg.whereQueue ?? [])];
  return {
    select: () => ({
      from: () => ({
        limit: async () => cfg.idRows ?? [],
        where: () => ({ limit: async () => queue.shift() ?? [] }),
      }),
    }),
    insert: () => ({
      values: () => {
        const result: any = Promise.resolve(undefined);
        result.returning = async () => [cfg.insertedUser];
        result.onConflictDoNothing = async () => undefined;
        return result;
      },
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  } as any;
}

function makeConfig() {
  return { get: () => 'unit-test-secret-not-real-32-characters' } as any;
}

function makeJwt() {
  return { signAsync: vi.fn().mockResolvedValue('signed.jwt.token') } as any;
}

const activeUser = () => ({
  userId: 'user-1',
  email: 'owner@example.com',
  passwordHash: hash,
  status: 'Active',
  role: 'Owner',
  fullName: 'Owner One',
});

describe('login rate limit', () => {
  it('allows 10 attempts and blocks the 11th per key', () => {
    for (let i = 0; i < 10; i++) expect(() => checkRateLimit('1.2.3.4:a@b.com')).not.toThrow();
    expect(() => checkRateLimit('1.2.3.4:a@b.com')).toThrow(UnauthorizedException);
    // A different key is unaffected.
    expect(() => checkRateLimit('1.2.3.4:other@b.com')).not.toThrow();
  });
});

describe('AuthService.login', () => {
  it('never reveals whether the email or the password was wrong', async () => {
    const unknown = new AuthService(makeDb({ whereQueue: [[]] }), makeJwt(), makeConfig());
    await expect(
      unknown.login('nobody@example.com', PASSWORD, '1.1.1.1'),
    ).rejects.toThrow('Invalid credentials');

    const wrong = new AuthService(
      makeDb({ whereQueue: [[activeUser()]] }),
      makeJwt(),
      makeConfig(),
    );
    await expect(wrong.login('owner@example.com', 'Wrong1!xyz', '1.1.1.1')).rejects.toThrow(
      'Invalid credentials',
    );
  });

  it('rejects inactive accounts with the same generic message', async () => {
    const svc = new AuthService(
      makeDb({ whereQueue: [[{ ...activeUser(), status: 'Inactive' }]] }),
      makeJwt(),
      makeConfig(),
    );
    await expect(svc.login('owner@example.com', PASSWORD, '1.1.1.1')).rejects.toThrow(
      'Invalid credentials',
    );
  });

  it('returns a token and safe user fields (never the password hash)', async () => {
    const jwt = makeJwt();
    const svc = new AuthService(makeDb({ whereQueue: [[activeUser()]] }), jwt, makeConfig());
    const result = await svc.login('owner@example.com', PASSWORD, '1.1.1.1');
    expect(result.access_token).toBe('signed.jwt.token');
    expect(result.user).toEqual({
      userId: 'user-1',
      email: 'owner@example.com',
      fullName: 'Owner One',
      role: 'Owner',
    });
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    const payload = jwt.signAsync.mock.calls[0][0];
    expect(payload).toEqual({ sub: 'user-1', email: 'owner@example.com', role: 'Owner' });
  });

  it('blocks after 10 failed attempts, even with the right password', async () => {
    const svc = new AuthService(makeDb({ whereQueue: [] }), makeJwt(), makeConfig());
    for (let i = 0; i < 10; i++) {
      await expect(svc.login('owner@example.com', 'Wrong1!xyz', '9.9.9.9')).rejects.toThrow(
        'Invalid credentials',
      );
    }
    await expect(svc.login('owner@example.com', PASSWORD, '9.9.9.9')).rejects.toThrow(
      'Too many attempts. Try again later.',
    );
  });
});

describe('AuthService.register', () => {
  const dto = {
    email: 'new@example.com',
    password: PASSWORD,
    fullName: 'New Member',
    role: 'Driver',
  };

  it('blocks non-Owners once the users table is not empty', async () => {
    const svc = new AuthService(makeDb({ idRows: [{ id: 'someone' }] }), makeJwt(), makeConfig());
    await expect(svc.register(dto, 'Secretary')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces the password policy before touching the database', async () => {
    const svc = new AuthService(makeDb(), makeJwt(), makeConfig());
    await expect(
      svc.register({ ...dto, password: 'short' }, 'Owner'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate emails', async () => {
    const svc = new AuthService(
      makeDb({ whereQueue: [[{ userId: 'existing' }]] }),
      makeJwt(),
      makeConfig(),
    );
    await expect(svc.register(dto, 'Owner')).rejects.toThrow('Email already in use');
  });

  it('creates a user and returns only safe fields', async () => {
    const inserted = {
      userId: 'new-1',
      email: dto.email,
      fullName: dto.fullName,
      role: 'Driver',
      phone: null,
      licenseNo: null,
      passwordHash: '$2b$hash',
    };
    const svc = new AuthService(
      makeDb({ idRows: [], whereQueue: [[]], insertedUser: inserted }),
      makeJwt(),
      makeConfig(),
    );
    const result = await svc.register(dto, 'Owner');
    expect(result).toEqual({
      userId: 'new-1',
      email: dto.email,
      fullName: dto.fullName,
      role: 'Driver',
      phone: null,
      licenseNo: null,
    });
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });

  it('allows the first-user bootstrap only when the table is empty', async () => {
    const inserted = {
      userId: 'first',
      email: dto.email,
      fullName: dto.fullName,
      role: 'Owner',
      phone: null,
      licenseNo: null,
    };
    const svc = new AuthService(
      makeDb({ idRows: [], whereQueue: [[]], insertedUser: inserted }),
      makeJwt(),
      makeConfig(),
    );
    await expect(svc.register({ ...dto, role: 'Owner' })).resolves.toMatchObject({
      userId: 'first',
      role: 'Owner',
    });
  });
});
