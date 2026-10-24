/**
 * The real loginAction / registerAction / changePasswordAction under a concurrent burst, with the
 * framework and the database mocked: what is measured is how many password checks actually run.
 * (Security review F2, F3, F4.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  headers: {} as Record<string, string>,
  verifyCalls: 0,
  users: new Map<string, { id: string; passwordHash: string; role: 'COACH' | 'CLIENT'; active: boolean }>(),
  created: 0,
  sessions: [] as string[],
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers(env.headers),
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/lib/session', () => ({
  createSession: async (id: string) => {
    env.sessions.push(id);
  },
  destroySession: async () => undefined,
  hashSessionToken: (t: string) => t,
}));
vi.mock('@/lib/settings', () => ({ getCoachSettings: async () => ({ allowSignup: true }) }));
vi.mock('@/lib/password', () => ({
  // a stand-in for argon2: counts every check that is actually evaluated, and takes a moment like the real one
  verifyPassword: async (hash: string, password: string) => {
    env.verifyCalls += 1;
    await new Promise((r) => setTimeout(r, 2));
    return hash === `hash:${password}`;
  },
  verifyAgainstDummy: async () => {
    env.verifyCalls += 1;
    await new Promise((r) => setTimeout(r, 2));
    return false;
  },
  hashPassword: async (password: string) => `hash:${password}`,
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { phone?: string; id?: string } }) => {
        await new Promise((r) => setTimeout(r, 1));
        const key = where.phone ?? where.id ?? '';
        return env.users.get(key) ?? null;
      },
      create: async () => {
        env.created += 1;
        return { id: `new-${env.created}` };
      },
      update: async () => ({}),
    },
    session: { deleteMany: async () => ({ count: 0 }) },
    $transaction: async () => [],
  },
}));
vi.mock('@/lib/auth', () => ({
  requireUser: async () => ({ id: 'u-coach', phone: '+989120000000', name: 'Coach', role: 'COACH', locale: 'fa' }),
  requireCoach: async () => ({ id: 'u-coach', phone: '+989120000000', name: 'Coach', role: 'COACH', locale: 'fa' }),
}));

const COACH_PHONE = '+989120000000';
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const isRedirect = (e: unknown) => e instanceof Error && e.message.startsWith('NEXT_REDIRECT');

async function load() {
  delete (globalThis as { __daftarAuthThrottle?: unknown }).__daftarAuthThrottle;
  vi.resetModules();
  const [{ loginAction, registerAction }, { changePasswordAction }] = await Promise.all([
    import('@/server/auth'),
    import('@/server/coach'),
  ]);
  return { loginAction, registerAction, changePasswordAction };
}

async function login(a: Awaited<ReturnType<typeof load>>, phone: string, password: string) {
  try {
    return await a.loginAction({}, form({ phone, password, locale: 'en' }));
  } catch (e) {
    if (isRedirect(e)) return { redirected: true as const };
    throw e;
  }
}

beforeEach(() => {
  env.verifyCalls = 0;
  env.created = 0;
  env.sessions = [];
  env.headers = {};
  delete process.env.TRUST_PROXY;
  env.users = new Map([[COACH_PHONE, { id: 'u-coach', passwordHash: 'hash:the-real-coach-password', role: 'COACH', active: true }]]);
});

describe('loginAction under a concurrent burst (F2)', () => {
  it('evaluates at most 5 of 200 parallel wrong guesses for one phone', async () => {
    const a = await load();
    const results = await Promise.all(Array.from({ length: 200 }, (_, i) => login(a, '09120000000', `guess-${i}`)));
    expect(env.verifyCalls).toBe(5);
    const limited = results.filter((r) => 'errors' in r && r.errors?.form === 'rateLimited');
    expect(limited.length).toBeGreaterThanOrEqual(195);
    // and the account is still locked afterwards, even for the right password
    const after = await login(a, '09120000000', 'the-real-coach-password');
    expect(after).toMatchObject({ errors: { form: 'rateLimited' } });
    expect(env.sessions).toHaveLength(0);
  });

  it('answers a registered and an unregistered number identically', async () => {
    const a = await load();
    const run = async (phone: string) => {
      const out = [];
      for (let i = 0; i < 7; i++) out.push(await login(a, phone, `nope-${i}`));
      return out.map((r) => ('errors' in r ? [r.errors?.form, r.retryAfterMinutes] : r));
    };
    expect(await run('09120000000')).toEqual(await run('09129876543'));
  });

  it('a correct password still signs in and clears the failures', async () => {
    const a = await load();
    for (let i = 0; i < 3; i++) await login(a, '09120000000', `wrong-${i}`);
    expect(await login(a, '09120000000', 'the-real-coach-password')).toEqual({ redirected: true });
    expect(env.sessions).toEqual(['u-coach']);
    for (let i = 0; i < 4; i++) {
      expect(await login(a, '09120000000', `wrong-${i}`)).toMatchObject({ errors: { form: 'invalidCredentials' } });
    }
  });
});

describe('who gets locked out (F3)', () => {
  it('behind a trusted proxy, an attacker locks only their own address+phone, not the coach', async () => {
    process.env.TRUST_PROXY = '1';
    const a = await load();
    env.headers = { 'x-forwarded-for': '198.51.100.66' };
    await Promise.all(Array.from({ length: 40 }, (_, i) => login(a, '09120000000', `attack-${i}`)));
    expect(env.verifyCalls).toBe(5);
    expect(await login(a, '09120000000', 'the-real-coach-password')).toMatchObject({ errors: { form: 'rateLimited' } });

    // the coach, from another network
    env.headers = { 'x-forwarded-for': '203.0.113.9' };
    expect(await login(a, '09120000000', 'the-real-coach-password')).toEqual({ redirected: true });
  });

  it('ignores X-Forwarded-For without TRUST_PROXY: rotating the header buys no extra guesses', async () => {
    const a = await load();
    await Promise.all(
      Array.from({ length: 60 }, (_, i) => {
        env.headers = { 'x-forwarded-for': `198.51.100.${i}` };
        return login(a, '09120000000', `attack-${i}`);
      }),
    );
    expect(env.verifyCalls).toBe(5);
  });
});

describe('no IP-level free-for-all (F4)', () => {
  it('one address spraying many numbers gets at most 30 evaluations', async () => {
    process.env.TRUST_PROXY = '1';
    const a = await load();
    env.headers = { 'x-forwarded-for': '198.51.100.66' };
    await Promise.all(Array.from({ length: 150 }, (_, i) => login(a, `0912${String(1000000 + i)}`, 'Password12345')));
    expect(env.verifyCalls).toBe(30);
  });

  it('many addresses against one number are capped at 50 an hour', async () => {
    process.env.TRUST_PROXY = '1';
    const a = await load();
    await Promise.all(
      Array.from({ length: 120 }, (_, i) => {
        env.headers = { 'x-forwarded-for': `198.51.100.${i}` };
        return login(a, '09120000000', `attack-${i}`);
      }),
    );
    expect(env.verifyCalls).toBe(50);
  });

  it('sign-ups are limited to 10 per address per hour', async () => {
    process.env.TRUST_PROXY = '1';
    const a = await load();
    env.headers = { 'x-forwarded-for': '198.51.100.66' };
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        a.registerAction({}, form({ name: 'Test Person', phone: `0913${String(2000000 + i)}`, password: 'a-fine-passphrase-1', locale: 'en' })).catch((e) => {
          if (isRedirect(e)) return { redirected: true as const };
          throw e;
        }),
      ),
    );
    expect(results.filter((r) => 'redirected' in r)).toHaveLength(10);
    expect(results.filter((r) => 'errors' in r && r.errors?.form === 'rateLimited')).toHaveLength(20);
    expect(env.created).toBe(10);
  });
});

describe('registration password policy', () => {
  it('refuses short, common and own-phone passwords with stable codes', async () => {
    const a = await load();
    const code = async (password: string) => {
      const r = await a.registerAction({}, form({ name: 'Test Person', phone: '09131234567', password, locale: 'en' })).catch((e) => {
        if (isRedirect(e)) return { redirected: true } as const;
        throw e;
      });
      return 'errors' in r ? r.errors?.password : 'ok';
    };
    expect(await code('short')).toBe('passwordShort');
    expect(await code('123456789')).toBe('passwordShort');
    expect(await code('1234567890')).toBe('passwordWeak');
    expect(await code('coach-pass-1234')).toBe('passwordWeak');
    expect(await code('09131234567')).toBe('passwordWeak');
    expect(await code('۰۹۱۳۱۲۳۴۵۶۷')).toBe('passwordWeak');
    expect(await code('a-fine-passphrase-1')).toBe('ok');
  });
});

describe('changePasswordAction under a concurrent burst (F2)', () => {
  it('evaluates at most 5 of 100 parallel wrong current passwords', async () => {
    const a = await load();
    env.users.set('u-coach', { id: 'u-coach', passwordHash: 'hash:the-real-coach-password', role: 'COACH', active: true });
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        a.changePasswordAction(
          {},
          form({ current: `guess-${i}`, next: 'brand-new-passphrase-9', confirm: 'brand-new-passphrase-9', locale: 'en' }),
        ),
      ),
    );
    expect(env.verifyCalls).toBe(5);
    expect(results.filter((r) => r.errors?.form === 'rateLimited').length).toBeGreaterThanOrEqual(95);
  });

  it('refuses a new password that is the own phone number without spending a guess', async () => {
    const a = await load();
    const r = await a.changePasswordAction({}, form({ current: 'whatever-it-is', next: '09120000000', confirm: '09120000000', locale: 'en' }));
    // 11 characters, so it is the policy (not the length) that refuses it
    expect(r.errors?.next).toBe('passwordWeak');
    expect(env.verifyCalls).toBe(0);
  });
});
