/* oxlint-disable typescript/no-floating-promises, unicorn/no-thenable -- node:test registers tests by returning promises; the fake DB builder is intentionally thenable */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { DB, SUPABASE } from '../src/db/db.module.js';
import * as schema from '../src/db/schema.js';

process.env.JWT_SECRET = 'e2e-security-spec-secret-at-least-32-chars';
process.env.NODE_ENV = 'test';

const PASSWORD = 'Correct1!xyz';

/** Mutable fake DB state: each request reads the current state. */
const state = {
  userFound: true,
  userStatus: 'Active' as string,
  loginUser: null as any,
};

function rowsFor(table: any, fields: any): any[] {
  if (table === schema.users) {
    const projected = fields && typeof fields === 'object' && 'status' in fields;
    if (projected) return state.userFound ? [{ status: state.userStatus }] : [];
    return state.loginUser ? [state.loginUser] : [];
  }
  if (table === schema.orders && fields && typeof fields === 'object' && 'n' in fields) {
    return [{ n: 0 }];
  }
  return [];
}

function chain(table: any, fields: any): any {
  const q: any = {
    from: (t: any) => chain(t, fields),
    where: () => chain(table, fields),
    orderBy: () => chain(table, fields),
    limit: () => chain(table, fields),
    offset: () => chain(table, fields),
    innerJoin: () => chain(table, fields),
    leftJoin: () => chain(table, fields),
    groupBy: () => chain(table, fields),
    returning: async () => rowsFor(table, fields),
    onConflictDoNothing: async () => undefined,
    then: (resolve: any, reject?: any) => Promise.resolve(rowsFor(table, fields)).then(resolve, reject),
  };
  return q;
}

function fakeInserts(): any {
  const result: any = Promise.resolve(undefined);
  result.returning = async () => [
    { userId: 'e2e-inserted', email: 'e2e-new@example.com', fullName: 'New Driver', role: 'Driver', phone: null, licenseNo: null },
  ];
  result.onConflictDoNothing = async () => undefined;
  return { values: () => result };
}

const db = {
  select: (fields?: any) => chain(null, fields),
  insert: () => fakeInserts(),
  update: () => ({ set: () => ({ where: async () => undefined }) }),
  delete: () => ({ where: async () => undefined }),
  execute: async () => [],
};

const supabase = new Proxy(
  {},
  {
    get: (_target, prop) => {
      // Never expose a `then` method: Nest awaits provider values and would
      // treat the proxy as a thenable that never resolves.
      if (prop === 'then') return undefined;
      return () => ({ insert: async () => ({ error: null }) });
    },
  },
);

async function createApp(rateMax?: number): Promise<NestFastifyApplication> {
  const previous = process.env.RATE_LIMIT_MAX;
  if (rateMax !== undefined) process.env.RATE_LIMIT_MAX = String(rateMax);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DB)
    .useValue(db)
    .overrideProvider(SUPABASE)
    .useValue(supabase)
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ bodyLimit: 1024 * 1024 }),
  );
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  if (previous === undefined) delete process.env.RATE_LIMIT_MAX;
  else process.env.RATE_LIMIT_MAX = previous;
  return app;
}

function inject(app: NestFastifyApplication, opts: Record<string, any>) {
  return app.getHttpAdapter().getInstance().inject(opts);
}

function json(opts: Record<string, any>) {
  return {
    ...opts,
    headers: { 'content-type': 'application/json', ...opts.headers },
    payload: JSON.stringify(opts.payload ?? {}),
  };
}

async function tokenFor(app: NestFastifyApplication, sub: string, role: string, opts?: any) {
  return app.get(JwtService).signAsync(
    { sub, email: `${sub}@example.com`, role },
    { secret: process.env.JWT_SECRET, ...opts },
  );
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

let app: NestFastifyApplication;

before(async () => {
  app = await createApp();
});

after(async () => {
  if (app) await app.close();
  process.env.NODE_ENV = 'test';
});

describe('security headers', () => {
  it('sets hardening headers on public responses', async () => {
    const res = await inject(app, { method: 'GET', url: '/api/health' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.equal(res.headers['referrer-policy'], 'no-referrer');
    assert.ok(String(res.headers['content-security-policy']).includes("default-src 'none'"));
    assert.equal(res.headers['x-ratelimit-limit'], '300');
  });

  it('sets hardening headers on rejected requests too', async () => {
    const res = await inject(app, { method: 'GET', url: '/api/clients' });
    assert.equal(res.statusCode, 401);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });
});

describe('CORS', () => {
  it('does not send an allow-origin header to unknown origins', async () => {
    const res = await inject(app, {
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });

  it('allows the configured frontend origin', async () => {
    const origin = 'http://localhost:3000';
    const res = await inject(app, { method: 'GET', url: '/api/health', headers: { origin } });
    assert.equal(res.headers['access-control-allow-origin'], origin);
  });
});

describe('authentication', () => {
  it('rejects requests without a token', async () => {
    const res = await inject(app, { method: 'GET', url: '/api/clients' });
    assert.equal(res.statusCode, 401);
  });

  const tokenCases: [string, string][] = [
    ['garbage', 'not-a-jwt'],
    [
      'alg:none forgery',
      `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(
        JSON.stringify({ sub: 'forged', role: 'Owner' }),
      ).toString('base64url')}.`,
    ],
    ['Basic scheme', 'Basic YWRtaW46YWRtaW4='],
  ];
  for (const [label, value] of tokenCases) {
    it(`rejects ${label}`, async () => {
      const res = await inject(app, {
        method: 'GET',
        url: '/api/clients',
        headers: { authorization: `Bearer ${value}` },
      });
      assert.equal(res.statusCode, 401);
    });
  }

  it('rejects expired tokens', async () => {
    const expired = await tokenFor(app, 'e2e-expired', 'Owner', { expiresIn: '-1s' });
    const res = await inject(app, {
      method: 'GET',
      url: '/api/clients',
      headers: auth(expired),
    });
    assert.equal(res.statusCode, 401);
  });

  it('rejects a valid token once the account is deactivated', async () => {
    state.userFound = true;
    state.userStatus = 'Inactive';
    const token = await tokenFor(app, 'e2e-inactive', 'Owner');
    const res = await inject(app, { method: 'GET', url: '/api/clients', headers: auth(token) });
    assert.equal(res.statusCode, 401);
    state.userStatus = 'Active';
  });

  it('rejects a valid token once the account is deleted', async () => {
    state.userFound = false;
    const token = await tokenFor(app, 'e2e-deleted', 'Owner');
    const res = await inject(app, { method: 'GET', url: '/api/clients', headers: auth(token) });
    assert.equal(res.statusCode, 401);
    state.userFound = true;
  });

  it('round-trips a real login and never leaks the password hash', async () => {
    state.userFound = true;
    state.userStatus = 'Active';
    state.loginUser = {
      userId: 'e2e-login-user',
      email: 'e2e-login@example.com',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      status: 'Active',
      role: 'Owner',
      fullName: 'E2E Owner',
    };
    const res = await inject(
      app,
      json({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'e2e-login@example.com', password: PASSWORD },
      }),
    );
    assert.ok([200, 201].includes(res.statusCode));
    const body = res.json();
    assert.equal(typeof body.access_token, 'string');
    assert.ok(!JSON.stringify(body).includes('passwordHash'));
    const me = await inject(app, {
      method: 'GET',
      url: '/api/auth/me',
      headers: auth(body.access_token),
    });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().sub, 'e2e-login-user');
    state.loginUser = null;
  });
});

describe('authorization matrix', () => {
  const cases: [string, string, number][] = [
    ['Owner', 'e2e-owner', 200],
    ['Secretary', 'e2e-secretary', 200],
    ['Driver', 'e2e-driver', 403],
    ['Client', 'e2e-client', 403],
  ];
  for (const [role, sub, expected] of cases) {
    it(`${role} GET /api/clients -> ${expected}`, async () => {
      state.userFound = true;
      state.userStatus = 'Active';
      const token = await tokenFor(app, sub, role);
      const res = await inject(app, { method: 'GET', url: '/api/clients', headers: auth(token) });
      assert.equal(res.statusCode, expected);
    });
  }

  it('denies Driver from reading orders (role not allowed)', async () => {
    state.userFound = true;
    state.userStatus = 'Active';
    const token = await tokenFor(app, 'e2e-orders-driver', 'Driver');
    const res = await inject(app, { method: 'GET', url: '/api/orders', headers: auth(token) });
    assert.equal(res.statusCode, 403);
  });
});

describe('injection and mass assignment', () => {
  it('rejects a SQL injection payload in the login email with 400 (not 500)', async () => {
    const res = await inject(
      app,
      json({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: "' OR '1'='1' --", password: 'whatever' },
      }),
    );
    assert.equal(res.statusCode, 400);
  });

  it('treats a SQLi search string as data, not SQL', async () => {
    state.userFound = true;
    state.userStatus = 'Active';
    state.loginUser = null;
    const token = await tokenFor(app, 'e2e-sqli-owner', 'Owner');
    const res = await inject(app, {
      method: 'GET',
      url: `/api/orders?q=${encodeURIComponent("' OR 1=1; DROP TABLE orders; --")}`,
      headers: auth(token),
    });
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.json()));
  });

  it('strips undeclared fields (passwordHash, role escalation) from register bodies', async () => {
    state.userFound = true;
    state.userStatus = 'Active';
    state.loginUser = null;
    const token = await tokenFor(app, 'e2e-register-owner', 'Owner');
    const res = await inject(
      app,
      json({
        method: 'POST',
        url: '/api/auth/register',
        headers: auth(token),
        payload: {
          email: 'e2e-new@example.com',
          password: PASSWORD,
          fullName: 'New Driver',
          role: 'Driver',
          status: 'Active',
          passwordHash: '$2b$hijacked',
          userId: 'attacker-id',
        },
      }),
    );
    assert.ok([200, 201].includes(res.statusCode));
    assert.ok(!res.body.includes('$2b$hijacked'));
    assert.ok(!res.body.includes('attacker-id'));
  });
});

describe('request size limits', () => {
  it('rejects bodies over 1 MB with 413', async () => {
    const res = await inject(
      app,
      json({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'a@b.com', password: 'x'.repeat(1024 * 1024 + 100) },
      }),
    );
    assert.equal(res.statusCode, 413);
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await inject(app, {
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    });
    assert.equal(res.statusCode, 400);
  });
});

describe('bootstrap hardening', () => {
  it('blocks /api/auth/bootstrap in production', async () => {
    process.env.NODE_ENV = 'production';
    try {
      const res = await inject(
        app,
        json({
          method: 'POST',
          url: '/api/auth/bootstrap',
          payload: {
            email: 'attacker@example.com',
            password: PASSWORD,
            fullName: 'Attacker',
            role: 'Owner',
          },
        }),
      );
      assert.equal(res.statusCode, 403);
    } finally {
      process.env.NODE_ENV = 'test';
    }
  });
});

describe('global rate limit', () => {
  let limited: NestFastifyApplication;

  before(async () => {
    limited = await createApp(2);
  });

  after(async () => {
    if (limited) await limited.close();
  });

  it('returns 429 after the per-IP window is exhausted', async () => {
    const first = await inject(limited, { method: 'GET', url: '/api/health' });
    const second = await inject(limited, { method: 'GET', url: '/api/health' });
    const third = await inject(limited, { method: 'GET', url: '/api/health' });
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal(third.statusCode, 429);
    assert.notEqual(third.headers['retry-after'], undefined);
    assert.equal(third.headers['x-ratelimit-limit'], '2');
  });
});
