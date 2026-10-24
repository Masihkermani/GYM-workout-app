/**
 * The production bootstrap (prisma/coach-bootstrap.ts, `npm run create-coach`): argument parsing and
 * the password rules are pure; creating / promoting the coach runs against a real database and is
 * skipped when DATABASE_URL is not reachable. Created users carry a unique phone prefix and are removed
 * afterwards; the settings row is put back as it was.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CoachBootstrapError,
  coachPasswordProblem,
  createOrPromoteCoach,
  MIN_COACH_PASSWORD_LENGTH,
  parseCreateCoachArgs,
} from '../../prisma/coach-bootstrap';
import { verifyPassword } from '@/lib/password';

describe('parseCreateCoachArgs', () => {
  it('reads --flag value and --flag=value', () => {
    expect(
      parseCreateCoachArgs(['--phone', '09121234567', '--name', 'Sara Ahmadi', '--name-fa', 'سارا احمدی']),
    ).toEqual({
      phone: '09121234567',
      name: 'Sara Ahmadi',
      nameFa: 'سارا احمدی',
      resetPassword: false,
      help: false,
    });
    const eq = parseCreateCoachArgs(['--phone=09121234567', '--name=Sara', '--reset-password']);
    expect(eq).toMatchObject({ phone: '09121234567', name: 'Sara', resetPassword: true });
    expect(eq.nameFa).toBeUndefined();
  });

  it('--help needs nothing else', () => {
    expect(parseCreateCoachArgs(['--help']).help).toBe(true);
  });

  it('refuses a missing phone or name, a flag without a value and unknown flags', () => {
    expect(() => parseCreateCoachArgs(['--name', 'Sara'])).toThrow('--phone is required');
    expect(() => parseCreateCoachArgs(['--phone', '09121234567'])).toThrow('--name is required');
    expect(() => parseCreateCoachArgs(['--phone', '--name', 'Sara'])).toThrow('--phone needs a value');
    expect(() => parseCreateCoachArgs(['--phone'])).toThrow('--phone needs a value');
    expect(() => parseCreateCoachArgs(['--phone', '0912', '--name', 'Sara', '--password', 'x'])).toThrow(
      'unknown argument',
    );
    expect(() => parseCreateCoachArgs([])).toThrow(CoachBootstrapError);
  });
});

describe('coachPasswordProblem', () => {
  it(`needs at least ${MIN_COACH_PASSWORD_LENGTH} characters`, () => {
    expect(coachPasswordProblem('abcdefghi')).toMatch(/too short/);
    expect(coachPasswordProblem('abcdefghij')).toBeNull();
    expect(coachPasswordProblem('')).toMatch(/too short/);
  });

  it('counts characters, not UTF-16 units', () => {
    expect(coachPasswordProblem('😀'.repeat(9))).toMatch(/too short/);
    expect(coachPasswordProblem('😀a'.repeat(5))).toBeNull();
  });

  it('refuses the passwords published in the README', () => {
    expect(coachPasswordProblem('coach-pass-1234')).toMatch(/README/);
    expect(coachPasswordProblem('client-pass-1234')).toMatch(/README/);
  });

  it('refuses one repeated character and the phone number itself', () => {
    expect(coachPasswordProblem('aaaaaaaaaaaa')).toMatch(/repeated/);
    expect(coachPasswordProblem('09121234567', '+989121234567')).toMatch(/phone number/);
    expect(coachPasswordProblem('۰۹۱۲۱۲۳۴۵۶۷', '+989121234567')).toMatch(/phone number/);
    expect(coachPasswordProblem('+989121234567', '+989121234567')).toMatch(/phone number/);
    expect(coachPasswordProblem('x09121234567', '+989121234567')).toBeNull();
  });

  it('refuses an over-long password (the login form stops at 200)', () => {
    expect(coachPasswordProblem('a1'.repeat(101))).toMatch(/too long/);
    expect(coachPasswordProblem('a1'.repeat(100))).toBeNull();
  });
});

const prisma = new PrismaClient();
const PREFIX = `+98993${Date.now().toString().slice(-6)}`;
const phone = (n: number) => `${PREFIX}${n}`;
const national = (e164: string) => `0${e164.slice(3)}`;

let dbUp = false;
try {
  if (process.env.DATABASE_URL) {
    await prisma.$connect();
    await prisma.user.count();
    dbUp = true;
  }
} catch {
  dbUp = false;
}

describe.skipIf(!dbUp)('createOrPromoteCoach (database)', () => {
  let settingsBefore: Awaited<ReturnType<typeof prisma.coachSettings.findUnique>>;

  beforeAll(async () => {
    settingsBefore = await prisma.coachSettings.findUnique({ where: { id: 1 } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { phone: { startsWith: PREFIX } } }); // cascades sessions
    if (settingsBefore) {
      await prisma.coachSettings.update({
        where: { id: 1 },
        data: { coachName: settingsBefore.coachName, coachNameFa: settingsBefore.coachNameFa },
      });
    } else {
      await prisma.coachSettings.deleteMany({ where: { id: 1 } });
    }
    await prisma.$disconnect();
  });

  const row = (n: number) => prisma.user.findUniqueOrThrow({ where: { phone: phone(n) } });

  it('creates the coach with a generated password that logs in, and says so once', async () => {
    const r = await createOrPromoteCoach(prisma, {
      phone: national(phone(1)),
      name: '  Sara   Ahmadi ',
      nameFa: 'سارا احمدی',
    });
    expect(r.action).toBe('created');
    expect(r.phone).toBe(phone(1));
    expect(r.passwordChanged).toBe(true);
    expect(r.generatedPassword).toBeDefined();
    expect(coachPasswordProblem(r.generatedPassword!, r.phone)).toBeNull();

    const user = await row(1);
    expect(user).toMatchObject({ role: 'COACH', active: true, name: 'Sara Ahmadi', locale: 'fa' });
    expect(user.passwordHash).not.toContain(r.generatedPassword!);
    expect(await verifyPassword(user.passwordHash, r.generatedPassword!)).toBe(true);

    const settings = await prisma.coachSettings.findUniqueOrThrow({ where: { id: 1 } });
    expect(settings.coachName).toBe('Sara Ahmadi');
    expect(settings.coachNameFa).toBe('سارا احمدی');
  });

  it('uses the supplied password and does not echo it back', async () => {
    const r = await createOrPromoteCoach(prisma, {
      phone: phone(2),
      name: 'Supplied Pass',
      password: 'a-long-enough-pass',
    });
    expect(r.generatedPassword).toBeUndefined();
    expect(r.passwordChanged).toBe(true);
    expect(await verifyPassword((await row(2)).passwordHash, 'a-long-enough-pass')).toBe(true);
  });

  it('refuses a weak password and writes nothing', async () => {
    for (const password of ['short', 'coach-pass-1234', 'aaaaaaaaaaaa']) {
      await expect(
        createOrPromoteCoach(prisma, { phone: phone(3), name: 'Weak Pass', password }),
      ).rejects.toBeInstanceOf(CoachBootstrapError);
    }
    expect(await prisma.user.count({ where: { phone: phone(3) } })).toBe(0);
  });

  it('refuses an invalid phone or name before touching the database', async () => {
    await expect(createOrPromoteCoach(prisma, { phone: '12345', name: 'Nobody' })).rejects.toThrow('not a valid phone');
    await expect(createOrPromoteCoach(prisma, { phone: phone(3), name: 'x' })).rejects.toThrow('--name');
    await expect(createOrPromoteCoach(prisma, { phone: phone(3), name: 'Fine', nameFa: 'x' })).rejects.toThrow(
      '--name-fa',
    );
    expect(await prisma.user.count({ where: { phone: phone(3) } })).toBe(0);
  });

  it('is idempotent on the phone: a second run keeps the account and its password', async () => {
    const first = await createOrPromoteCoach(prisma, { phone: phone(4), name: 'Idem Potent' });
    const before = await row(4);
    await prisma.session.create({
      data: { tokenHash: `t-${PREFIX}-4`, userId: before.id, expiresAt: new Date(Date.now() + 3_600_000) },
    });

    const again = await createOrPromoteCoach(prisma, { phone: national(phone(4)), name: 'Idem Potent' });
    expect(again.action).toBe('updated');
    expect(again.userId).toBe(first.userId);
    expect(again.passwordChanged).toBe(false);
    expect(again.generatedPassword).toBeUndefined();
    const after = await row(4);
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(await prisma.user.count({ where: { phone: phone(4) } })).toBe(1);
    expect(await prisma.session.count({ where: { userId: before.id } })).toBe(1); // still signed in
  });

  it('--reset-password and COACH_PASSWORD rotate the password and end the sessions', async () => {
    const created = await createOrPromoteCoach(prisma, { phone: phone(5), name: 'Rotate Me' });
    const user = await row(5);
    await prisma.session.create({
      data: { tokenHash: `t-${PREFIX}-5`, userId: user.id, expiresAt: new Date(Date.now() + 3_600_000) },
    });

    const reset = await createOrPromoteCoach(prisma, { phone: phone(5), name: 'Rotate Me', resetPassword: true });
    expect(reset.passwordChanged).toBe(true);
    expect(reset.generatedPassword).toBeDefined();
    expect(reset.generatedPassword).not.toBe(created.generatedPassword);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    const afterReset = await row(5);
    expect(await verifyPassword(afterReset.passwordHash, created.generatedPassword!)).toBe(false);
    expect(await verifyPassword(afterReset.passwordHash, reset.generatedPassword!)).toBe(true);

    const supplied = await createOrPromoteCoach(prisma, {
      phone: phone(5),
      name: 'Rotate Me',
      password: 'another-long-pass',
    });
    expect(supplied.generatedPassword).toBeUndefined();
    expect(await verifyPassword((await row(5)).passwordHash, 'another-long-pass')).toBe(true);
  });

  it('promotes a client (and reactivates them) with a new password and no old sessions', async () => {
    const client = await prisma.user.create({
      data: { phone: phone(6), name: 'Was Client', passwordHash: 'x', role: 'CLIENT', active: false },
    });
    await prisma.session.create({
      data: { tokenHash: `t-${PREFIX}-6`, userId: client.id, expiresAt: new Date(Date.now() + 3_600_000) },
    });

    const r = await createOrPromoteCoach(prisma, { phone: phone(6), name: 'Now Coach' });
    expect(r.action).toBe('promoted');
    expect(r.userId).toBe(client.id);
    expect(r.generatedPassword).toBeDefined();
    const after = await row(6);
    expect(after).toMatchObject({ role: 'COACH', active: true, name: 'Now Coach' });
    expect(await verifyPassword(after.passwordHash, r.generatedPassword!)).toBe(true);
    expect(await prisma.session.count({ where: { userId: client.id } })).toBe(0);
  });

  it('lists the other active coaches so the operator notices an old or demo account', async () => {
    const a = await createOrPromoteCoach(prisma, { phone: phone(7), name: 'First Coach' });
    const b = await createOrPromoteCoach(prisma, { phone: phone(8), name: 'Second Coach' });
    expect(a.otherCoaches.map((c) => c.phone)).not.toContain(phone(7));
    expect(b.otherCoaches.map((c) => c.phone)).toContain(phone(7));
    expect(b.otherCoaches.map((c) => c.phone)).not.toContain(phone(8));
  });
});
