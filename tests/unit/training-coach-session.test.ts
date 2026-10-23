/**
 * The coach runs the session: starting and logging a workout FOR a client, and what finishing it does
 * to the booking. Real database (skipped when DATABASE_URL is not reachable, like training-authz).
 *
 * The session is mocked (`requireUser`); zod, Prisma and the ownership rules are real. Everything the
 * suite creates carries a unique phone prefix and is removed afterwards.
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

const prisma = new PrismaClient();
const PREFIX = `+98991${Date.now().toString().slice(-6)}`;

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

type Actions = typeof import('@/server/training');
let actions: Actions;

const ctx = {} as {
  coach: Who;
  a: Who;
  b: Who;
  inactive: Who;
  exerciseId: string;
  dayId: string;
  customExerciseId: string | null;
};
const as = (u: Who) => {
  session.user = u;
};

const HOUR = 3_600_000;
/**
 * A booking for `clientId` that started `hoursAgo` hours ago (negative = in the future). The start is
 * relative to now because "has it started" is part of what is tested; the millisecond makes it unique
 * (booking_active_slot allows one live booking per start instant).
 */
async function booking(clientId: string, hoursAgo: number, status: 'CONFIRMED' | 'PENDING' = 'CONFIRMED') {
  const startsAt = new Date(Date.now() - hoursAgo * HOUR);
  return prisma.booking.create({
    data: { clientId, startsAt, endsAt: new Date(startsAt.getTime() + HOUR), status },
    select: { id: true },
  });
}

describe.skipIf(!dbUp)('the coach runs the session (database)', () => {
  beforeAll(async () => {
    actions = await import('@/server/training');
    const mk = (n: string, role: Role, active = true) =>
      prisma.user.create({ data: { phone: `${PREFIX}${n}`, name: `S ${n}`, passwordHash: 'x', role, active } });
    const [coach, a, b, inactive] = await Promise.all([mk('0', 'COACH'), mk('1', 'CLIENT'), mk('2', 'CLIENT'), mk('3', 'CLIENT', false)]);
    const who = (u: typeof coach): Who => ({ id: u.id, role: u.role, name: u.name, phone: u.phone, locale: 'fa' });
    ctx.coach = who(coach);
    ctx.a = who(a);
    ctx.b = who(b);
    ctx.inactive = who(inactive);

    const existing = await prisma.exercise.findFirst({ where: { archived: false }, select: { id: true } });
    ctx.customExerciseId = null;
    if (existing) ctx.exerciseId = existing.id;
    else {
      const custom = await prisma.exercise.create({
        data: { nameEn: 'Session lift', bodyPart: 'chest', equipment: 'barbell', target: 'pectorals', isCustom: true },
      });
      ctx.exerciseId = custom.id;
      ctx.customExerciseId = custom.id;
    }
    const program = await prisma.program.create({
      data: {
        clientId: a.id,
        authorId: coach.id,
        title: 'Session program',
        days: { create: [{ order: 1, title: 'Day one', items: { create: [{ exerciseId: ctx.exerciseId, order: 1, targetSets: 3, targetRepsMin: 8 }] } }] },
      },
      include: { days: true },
    });
    ctx.dayId = program.days[0].id;
  });

  afterAll(async () => {
    const ids = (await prisma.user.findMany({ where: { phone: { startsWith: PREFIX } }, select: { id: true } })).map((u) => u.id);
    await prisma.program.deleteMany({ where: { OR: [{ clientId: { in: ids } }, { authorId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } }); // cascades bookings and workouts
    if (ctx.customExerciseId) await prisma.exercise.delete({ where: { id: ctx.customExerciseId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  describe('starting a workout for a client', () => {
    it('lets the coach start one for any active client, and logs it under that client', async () => {
      as(ctx.coach);
      const r = await actions.startWorkoutAction({ dayId: ctx.dayId, clientId: ctx.a.id });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const row = await prisma.workoutLog.findUniqueOrThrow({ where: { id: r.id } });
      expect(row.clientId).toBe(ctx.a.id);
      expect(row.programDayId).toBe(ctx.dayId);

      // and log a set into it: the set lands in the client's workout
      const logged = await actions.logSetAction({ workoutId: r.id, exerciseId: ctx.exerciseId, reps: '۸', weightKg: '۴۰' });
      expect(logged.ok).toBe(true);
      expect((await actions.deleteWorkoutAction({ workoutId: r.id })).ok).toBe(true);
    });

    it('needs the client named, and refuses an unknown, a coach or a deactivated account', async () => {
      as(ctx.coach);
      expect(await actions.startWorkoutAction({})).toEqual({ ok: false, error: 'invalid' });
      expect(await actions.startWorkoutAction({ clientId: 'nope' })).toEqual({ ok: false, error: 'notFound' });
      expect(await actions.startWorkoutAction({ clientId: ctx.coach.id })).toEqual({ ok: false, error: 'notFound' });
      expect(await actions.startWorkoutAction({ clientId: ctx.inactive.id })).toEqual({ ok: false, error: 'notFound' });
    });

    it('forces a client to themselves: a clientId in the input is ignored', async () => {
      as(ctx.b);
      const r = await actions.startWorkoutAction({ clientId: ctx.a.id });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const row = await prisma.workoutLog.findUniqueOrThrow({ where: { id: r.id } });
      expect(row.clientId).toBe(ctx.b.id);
      // ...and B still cannot touch A's workout
      as(ctx.coach);
      const mine = await actions.startWorkoutAction({ clientId: ctx.a.id });
      if (!mine.ok) throw new Error('start failed');
      as(ctx.b);
      expect(await actions.logSetAction({ workoutId: mine.id, exerciseId: ctx.exerciseId, reps: 5, weightKg: 20 })).toEqual({
        ok: false,
        error: 'forbidden',
      });
      expect(await actions.finishWorkoutAction({ workoutId: mine.id })).toEqual({ ok: false, error: 'forbidden' });
      await prisma.workoutLog.deleteMany({ where: { id: { in: [r.id, mine.id] } } });
    });

    it("will not start a day of another client's program or a booking of another client", async () => {
      as(ctx.coach);
      expect(await actions.startWorkoutAction({ dayId: ctx.dayId, clientId: ctx.b.id })).toEqual({ ok: false, error: 'forbidden' });
      const bk = await booking(ctx.a.id, 2);
      expect(await actions.startWorkoutAction({ bookingId: bk.id, clientId: ctx.b.id })).toEqual({ ok: false, error: 'forbidden' });
    });
  });

  describe('finishing a session closes its booking', () => {
    const run = async (hoursAgo: number, finisher: Who, mutate?: (bookingId: string) => Promise<unknown>) => {
      const bk = await booking(ctx.a.id, hoursAgo);
      as(ctx.coach);
      const started = await actions.startWorkoutAction({ bookingId: bk.id, clientId: ctx.a.id });
      if (!started.ok) throw new Error(`start failed: ${started.error}`);
      as(ctx.coach);
      await actions.logSetAction({ workoutId: started.id, exerciseId: ctx.exerciseId, reps: 8, weightKg: 30 });
      if (mutate) await mutate(bk.id);
      as(finisher);
      const done = await actions.finishWorkoutAction({ workoutId: started.id });
      expect(done.ok).toBe(true);
      const row = await prisma.booking.findUniqueOrThrow({ where: { id: bk.id }, select: { status: true } });
      return row.status;
    };

    it('marks a CONFIRMED booking that has started COMPLETED when the coach finishes the workout', async () => {
      expect(await run(1, ctx.coach)).toBe('COMPLETED');
    });

    it('leaves a booking that has not started alone (same rule as "mark completed")', async () => {
      expect(await run(-3, ctx.coach)).toBe('CONFIRMED');
    });

    it("does not treat a client's own finish as proof the session happened", async () => {
      expect(await run(1, ctx.a)).toBe('CONFIRMED');
    });

    it('never undoes a correction: a booking turned into a no-show stays one', async () => {
      const status = await run(1, ctx.coach, (id) => prisma.booking.update({ where: { id }, data: { status: 'NO_SHOW' } }));
      expect(status).toBe('NO_SHOW');
    });

    it('is idempotent: finishing again changes nothing', async () => {
      const bk = await booking(ctx.a.id, 1);
      as(ctx.coach);
      const s = await actions.startWorkoutAction({ bookingId: bk.id, clientId: ctx.a.id });
      if (!s.ok) throw new Error('start failed');
      await actions.finishWorkoutAction({ workoutId: s.id });
      const first = await prisma.workoutLog.findUniqueOrThrow({ where: { id: s.id }, select: { finishedAt: true } });
      await actions.finishWorkoutAction({ workoutId: s.id });
      const second = await prisma.workoutLog.findUniqueOrThrow({ where: { id: s.id }, select: { finishedAt: true } });
      expect(second.finishedAt?.getTime()).toBe(first.finishedAt?.getTime());
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: bk.id } })).status).toBe('COMPLETED');
    });

    it('starting the same booking again resumes its workout instead of making a second one', async () => {
      const bk = await booking(ctx.a.id, 1);
      as(ctx.coach);
      const first = await actions.startWorkoutAction({ bookingId: bk.id, clientId: ctx.a.id });
      const again = await actions.startWorkoutAction({ bookingId: bk.id, clientId: ctx.a.id });
      expect(first.ok && again.ok && first.id === again.id && again.resumed).toBe(true);
    });
  });

  describe('sessionOptionsAction (the "Start session" sheet)', () => {
    it('is for the coach only', async () => {
      as(ctx.a);
      expect(await actions.sessionOptionsAction({ clientId: ctx.a.id })).toEqual({ ok: false, error: 'forbidden' });
    });

    it("lists the client's program days with the next one preselected", async () => {
      as(ctx.coach);
      const r = await actions.sessionOptionsAction({ clientId: ctx.a.id });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.options.clientName).toBe(ctx.a.name);
      expect(r.options.days.map((d) => d.id)).toContain(ctx.dayId);
      expect(r.options.days.find((d) => d.id === ctx.dayId)).toMatchObject({ title: 'Day one', programTitle: 'Session program', exerciseCount: 1 });
      expect(r.options.nextDayId).toBe(ctx.dayId);
    });

    it('reports a workout already linked to the booking, and refuses a booking of someone else', async () => {
      as(ctx.coach);
      const bk = await booking(ctx.a.id, 1);
      const none = await actions.sessionOptionsAction({ clientId: ctx.a.id, bookingId: bk.id });
      expect(none.ok && none.options.linked).toBe(null);
      const s = await actions.startWorkoutAction({ bookingId: bk.id, clientId: ctx.a.id });
      if (!s.ok) throw new Error('start failed');
      const linked = await actions.sessionOptionsAction({ clientId: ctx.a.id, bookingId: bk.id });
      expect(linked.ok && linked.options.linked).toEqual({ id: s.id, finished: false });
      expect(await actions.sessionOptionsAction({ clientId: ctx.b.id, bookingId: bk.id })).toEqual({ ok: false, error: 'notFound' });
    });

    it('does not serve a deactivated client', async () => {
      as(ctx.coach);
      expect(await actions.sessionOptionsAction({ clientId: ctx.inactive.id })).toEqual({ ok: false, error: 'notFound' });
    });
  });
});
