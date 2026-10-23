/**
 * The coach edits a client's name and phone (src/server/coach.ts, updateClientAction) against a real
 * database; skipped when DATABASE_URL is not reachable. The session is mocked, zod / Prisma / the
 * unique phone index are real. Created users carry a unique phone prefix and are removed afterwards.
 */
import { PrismaClient, type Role } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type Who = { id: string; role: 'COACH' | 'CLIENT'; name: string; phone: string; locale: string };
const session = vi.hoisted(() => ({ user: null as null | Who }));

vi.mock('@/lib/auth', () => ({
  requireUser: async () => {
    if (!session.user) throw new Error('no session');
    return session.user;
  },
  requireCoach: async () => {
    if (!session.user || session.user.role !== 'COACH') throw new Error('not coach');
    return session.user;
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

const prisma = new PrismaClient();
const PREFIX = `+98992${Date.now().toString().slice(-6)}`;

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

type Coach = typeof import('@/server/coach');
let coachActions: Coach;
const ctx = {} as { coach: Who; a: Who; b: Who };
const as = (u: Who) => {
  session.user = u;
};

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}
const national = (e164: string) => `0${e164.slice(3)}`; // +98991… -> 0991…

describe.skipIf(!dbUp)('updateClientAction (database)', () => {
  beforeAll(async () => {
    coachActions = await import('@/server/coach');
    const mk = (n: string, role: Role) =>
      prisma.user.create({ data: { phone: `${PREFIX}${n}`, name: `Edit ${n}`, passwordHash: 'x', role } });
    const [coach, a, b] = await Promise.all([mk('0', 'COACH'), mk('1', 'CLIENT'), mk('2', 'CLIENT')]);
    const who = (u: typeof coach): Who => ({ id: u.id, role: u.role, name: u.name, phone: u.phone, locale: 'fa' });
    ctx.coach = who(coach);
    ctx.a = who(a);
    ctx.b = who(b);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { phone: { startsWith: PREFIX } } });
    await prisma.$disconnect();
  });

  it('saves a new name and a phone typed in Persian digits, stored as E.164', async () => {
    as(ctx.coach);
    const typed = `${national(`${PREFIX}7`)}`.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
    const r = await coachActions.updateClientAction({}, form({ id: ctx.a.id, name: '  علی   رضایی ', phone: typed, locale: 'fa' }));
    expect(r.ok).toBe(true);
    expect(r.errors).toBeUndefined();
    const row = await prisma.user.findUniqueOrThrow({ where: { id: ctx.a.id } });
    expect(row.name).toBe('علی رضایی');
    expect(row.phone).toBe(`${PREFIX}7`);
  });

  it("refuses a number that belongs to another account, on the phone field, and changes nothing", async () => {
    as(ctx.coach);
    const before = await prisma.user.findUniqueOrThrow({ where: { id: ctx.a.id } });
    const clash = await coachActions.updateClientAction({}, form({ id: ctx.a.id, name: 'Changed', phone: national(ctx.b.phone) }));
    expect(clash.ok).toBeUndefined();
    expect(clash.errors).toEqual({ phone: 'phoneTaken' });
    expect(clash.values?.name).toBe('Changed'); // what was typed comes back, so the form keeps it
    // the coach's own number is just as taken
    const coachClash = await coachActions.updateClientAction({}, form({ id: ctx.a.id, name: 'Changed', phone: ctx.coach.phone }));
    expect(coachClash.errors).toEqual({ phone: 'phoneTaken' });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: ctx.a.id } });
    expect(after.name).toBe(before.name);
    expect(after.phone).toBe(before.phone);
  });

  it("keeping one's own number is not a clash", async () => {
    as(ctx.coach);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: ctx.b.id } });
    const r = await coachActions.updateClientAction({}, form({ id: ctx.b.id, name: 'Same number', phone: national(row.phone) }));
    expect(r.ok).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ctx.b.id } })).phone).toBe(row.phone);
  });

  it('reports an invalid phone and a short name on their own fields', async () => {
    as(ctx.coach);
    const r = await coachActions.updateClientAction({}, form({ id: ctx.b.id, name: 'x', phone: '12345' }));
    expect(r.errors).toEqual({ name: 'nameShort', phone: 'phoneInvalid' });
  });

  it('edits CLIENT rows only, and only for the coach', async () => {
    as(ctx.coach);
    const onCoach = await coachActions.updateClientAction({}, form({ id: ctx.coach.id, name: 'Hijack', phone: national(ctx.coach.phone) }));
    expect(onCoach.errors).toEqual({ form: 'notFound' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ctx.coach.id } })).name).not.toBe('Hijack');
    const unknown = await coachActions.updateClientAction({}, form({ id: 'nope', name: 'Nobody', phone: '09120009999' }));
    expect(unknown.errors).toEqual({ form: 'notFound' });

    as(ctx.a);
    await expect(
      coachActions.updateClientAction({}, form({ id: ctx.b.id, name: 'Sneaky', phone: '09120009999' })),
    ).rejects.toThrow('not coach');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ctx.b.id } })).name).not.toBe('Sneaky');
  });
});
