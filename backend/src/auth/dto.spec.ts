import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { LoginDto, RegisterDto } from './dto.js';

const pipe = new ValidationPipe({ whitelist: true, transform: true });
const bodyMeta = (metatype: any) => ({ type: 'body' as const, metatype });

const VALID = {
  email: 'user@example.com',
  password: 'Correct1!xyz',
  fullName: 'User One',
  role: 'Driver',
};

describe('RegisterDto (mass assignment and validation)', () => {
  it('strips properties the DTO does not declare', async () => {
    const out: any = await pipe.transform(
      {
        ...VALID,
        userId: 'attacker-chosen-id',
        passwordHash: '$2b$injected',
        isAdmin: true,
        status: 'Inactive',
      },
      bodyMeta(RegisterDto),
    );
    expect(out).toMatchObject(VALID);
    expect(out.userId).toBeUndefined();
    expect(out.passwordHash).toBeUndefined();
    expect(out.isAdmin).toBeUndefined();
    expect(out.status).toBeUndefined();
  });

  it('does not let a JSON __proto__ payload pollute Object.prototype', async () => {
    const payload = JSON.parse(
      '{"__proto__":{"isAdmin":true},"email":"user@example.com","password":"Correct1!xyz","fullName":"User One","role":"Driver"}',
    );
    const out: any = await pipe.transform(payload, bodyMeta(RegisterDto));
    expect(out.isAdmin).toBeUndefined();
    expect(({} as any).isAdmin).toBeUndefined();
  });

  it('rejects invalid roles, weak passwords and bad emails', async () => {
    await expect(pipe.transform({ ...VALID, role: 'SuperAdmin' }, bodyMeta(RegisterDto))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(pipe.transform({ ...VALID, password: 'short' }, bodyMeta(RegisterDto))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(pipe.transform({ ...VALID, email: 'not-an-email' }, bodyMeta(RegisterDto))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects SQL injection payloads in the email field', async () => {
    await expect(
      pipe.transform({ ...VALID, email: "' OR '1'='1' --" }, bodyMeta(RegisterDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('LoginDto', () => {
  it('accepts only an email-shaped value and a non-empty password', async () => {
    await expect(pipe.transform({ email: 'a@b.com', password: 'x' }, bodyMeta(LoginDto))).resolves.toMatchObject({
      email: 'a@b.com',
    });
    await expect(
      pipe.transform({ email: "' OR 1=1 --", password: 'x' }, bodyMeta(LoginDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ email: 'a@b.com', password: '' }, bodyMeta(LoginDto))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
