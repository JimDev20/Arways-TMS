import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import type { JwtPayload } from './roles.js';

function contextFor(req: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function config() {
  return { get: () => 'test-secret-not-a-real-value-32chars' } as any;
}

function dbWithStatus(status: string) {
  return {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ status }] }) }) }),
  } as any;
}

describe('RolesGuard (deny by default)', () => {
  it('allows when an endpoint declares no roles', () => {
    const reflector = { getAllAndOverride: () => undefined } as any;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(contextFor({ user: { role: 'Driver' } }))).toBe(true);
  });

  it('allows only exact roles (no hierarchy)', () => {
    const reflector = { getAllAndOverride: () => ['Owner'] } as any;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(contextFor({ user: { role: 'Owner' } }))).toBe(true);
    expect(() => guard.canActivate(contextFor({ user: { role: 'Secretary' } }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor({ user: { role: 'Client' } }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor({ user: { role: 'Driver' } }))).toThrow(ForbiddenException);
  });

  it('rejects requests with no authenticated user', () => {
    const reflector = { getAllAndOverride: () => ['Owner', 'Secretary'] } as any;
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(contextFor({}))).toThrow(ForbiddenException);
  });
});

describe('JwtAuthGuard (authentication)', () => {
  it('rejects a missing Authorization header', async () => {
    const jwt = { verifyAsync: vi.fn() } as any;
    const guard = new JwtAuthGuard(jwt, config());
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toThrow('Missing token');
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects non-Bearer schemes and blank tokens', async () => {
    const jwt = { verifyAsync: vi.fn() } as any;
    const guard = new JwtAuthGuard(jwt, config());
    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Basic abc' } })),
    ).rejects.toThrow('Missing token');
    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Bearer ' } })),
    ).rejects.toThrow('Missing token');
  });

  it('rejects forged or malformed tokens', async () => {
    const jwt = { verifyAsync: vi.fn().mockRejectedValue(new Error('invalid signature')) } as any;
    const guard = new JwtAuthGuard(jwt, config());
    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Bearer forged.token.value' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches the payload for a valid token on an active account', async () => {
    const payload: JwtPayload = { sub: 'active-user-1', email: 'a@b.com', role: 'Owner' };
    const jwt = { verifyAsync: vi.fn().mockResolvedValue(payload) } as any;
    const guard = new JwtAuthGuard(jwt, config(), dbWithStatus('Active'));
    const req: any = { headers: { authorization: 'Bearer good.token.value' } };
    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(req.user).toEqual(payload);
  });

  it('rejects deactivated accounts even with a valid token', async () => {
    const payload: JwtPayload = { sub: 'inactive-user-2', email: 'a@b.com', role: 'Driver' };
    const jwt = { verifyAsync: vi.fn().mockResolvedValue(payload) } as any;
    const guard = new JwtAuthGuard(jwt, config(), dbWithStatus('Inactive'));
    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Bearer good.token.value' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects tokens for users deleted from the database', async () => {
    const payload: JwtPayload = { sub: 'deleted-user-3', email: 'a@b.com', role: 'Driver' };
    const jwt = { verifyAsync: vi.fn().mockResolvedValue(payload) } as any;
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    } as any;
    const guard = new JwtAuthGuard(jwt, config(), db);
    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Bearer good.token.value' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
