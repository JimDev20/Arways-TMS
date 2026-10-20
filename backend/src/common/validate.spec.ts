import { BadRequestException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertCoords,
  assertEmail,
  assertIn,
  assertNonEmpty,
  assertPassword,
  assertPhotoUrl,
  assertPositiveInt,
  assertText,
  passwordMissing,
  USER_ROLES,
} from './validate.js';

const SQLI_PAYLOADS = [
  "' OR '1'='1' --",
  "'; DROP TABLE users; --",
  "' UNION SELECT password_hash FROM users --",
  "1'; select pg_sleep(5); --",
  '") OR 1=1 --',
];

describe('input validation', () => {
  it('accepts only known enum values', () => {
    expect(assertIn('Owner', USER_ROLES, 'Role')).toBe('Owner');
    expect(() => assertIn('SuperAdmin', USER_ROLES, 'Role')).toThrow(BadRequestException);
    expect(() => assertIn("Owner' OR 1=1--", USER_ROLES, 'Role')).toThrow(BadRequestException);
  });

  it('treats SQL injection payloads as plain text, never as SQL', () => {
    for (const payload of SQLI_PAYLOADS) {
      expect(assertText(payload, 'Note', 1_000)).toBe(payload);
      expect(assertNonEmpty(payload, 'Note')).toBe(payload);
    }
  });

  it('rejects empty, oversized and non-numeric values', () => {
    expect(() => assertNonEmpty('   ', 'Name')).toThrow(BadRequestException);
    expect(() => assertText('x', 'Name', 0)).toThrow(BadRequestException);
    expect(() => assertText('x'.repeat(101), 'Name', 100)).toThrow(BadRequestException);
    expect(assertPositiveInt('5', 'Capacity')).toBe(5);
    expect(() => assertPositiveInt('0', 'Capacity')).toThrow(BadRequestException);
    expect(() => assertPositiveInt('-4', 'Capacity')).toThrow(BadRequestException);
    expect(() => assertPositiveInt('1.5', 'Capacity')).toThrow(BadRequestException);
  });

  it('keeps map pins inside the Philippines and catches swapped lat/lng', () => {
    expect(assertCoords(12.05509, 123.90058, 'Pin')).toEqual({ lat: 12.05509, lon: 123.90058 });
    expect(() => assertCoords(51.5, -0.12, 'Pin')).toThrow(/outside the Philippines/);
    expect(() => assertCoords(123.90058, 12.05509, 'Pin')).toThrow(/swapped/);
    expect(() => assertCoords('nope', 123, 'Pin')).toThrow(/no valid map pin/);
  });

  it('validates emails', () => {
    expect(assertEmail('user@example.com', 'Email')).toBe('user@example.com');
    expect(() => assertEmail('not-an-email', 'Email')).toThrow(BadRequestException);
    expect(() => assertEmail("a@b.com'; DROP TABLE users; --", 'Email')).toThrow(BadRequestException);
  });

  it('enforces the password policy and deny-list', () => {
    expect(passwordMissing('short')).toContain('10–64 characters');
    expect(passwordMissing('Allgood1!xyz')).toEqual([]);
    expect(assertPassword('Allgood1!xyz')).toBe('Allgood1!xyz');
    expect(() => assertPassword('alllowercase1!')).toThrow(/uppercase/);
    expect(() => assertPassword('NoSpecial1234')).toThrow(/special character/);
    expect(() => assertPassword('Password123!x')).toThrow(/too common/);
    expect(() => assertPassword('')).toThrow(BadRequestException);
  });

  describe('photo URLs', () => {
    const previous = process.env.SUPABASE_URL;
    beforeAll(() => {
      process.env.SUPABASE_URL = 'https://example.supabase.co';
    });
    afterAll(() => {
      process.env.SUPABASE_URL = previous;
    });

    it('accepts only https receipt-bucket storage URLs', () => {
      const ok = 'https://example.supabase.co/storage/v1/object/public/receipts/a.jpg';
      expect(assertPhotoUrl(ok, 'Photo')).toBe(ok);
      expect(() => assertPhotoUrl(ok.replace('https:', 'http:'), 'Photo')).toThrow(/secure/);
      expect(() => assertPhotoUrl('data:image/png;base64,AAAA', 'Photo')).toThrow(/secure/);
      expect(() => assertPhotoUrl('https://evil.example/a.jpg', 'Photo')).toThrow(/receipt-bucket/);
      expect(() =>
        assertPhotoUrl('https://example.supabase.co/storage/v1/object/public/avatars/a.jpg', 'Photo'),
      ).toThrow(/receipts bucket/);
    });
  });
});
