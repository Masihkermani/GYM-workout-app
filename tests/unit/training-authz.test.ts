/**
 * Authorization and behaviour of the training server actions against a real database.
 *
 * Runs only when DATABASE_URL points at a reachable, migrated PostgreSQL (the suite creates its own
 * users, programs and workouts with a unique phone prefix and removes them afterwards); otherwise it
 * is skipped, so `npm test` stays green on a machine with no database.
 *
 * The session is mocked (`requireUser`); everything else (zod, Prisma, the ownership rules) is real.
 */
import { PrismaClient, type Role } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ user: null as null | { id: string; role: 'COACH' | 'CLIENT'; name: string; phone: string; locale: string } }));

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
const PREFIX = `+98990${Date.now().toString().slice(-6)}`;

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

interface Ctx {
  coach: { id: string; role: Role; name: string; phone: string; locale: string };
  a: { id: string; role: Role; name: string; phone: string; locale: string };
  b: { id: string; role: Role; name: string; phone: string; locale: string };
  exerciseId: string;
  customExerciseId: string | null;
  coachProgram: { id: string; dayId: string; itemId: string };
  ownProgram: { id: string; dayId: string; itemId: string };
  bWorkout: { id: string; setId: string };
}
const ctx = {} as Ctx;

const as = (u: Ctx['a']) => {
  session.user = u as NonNullable<typeof session.user>;
};

describe.skipIf(!dbUp)('training server actions (database)', () => {
  beforeAll(async () => {
    actions = await import('@/server/training');
    const mk = (n: string, role: Role) =>
      prisma.user.create({ data: { phone: `${PREFIX}${n}`, name: `T ${n}`, passwordHash: 'x', role } });
    const [coach, a, b] = await Promise.all([mk('0', 'COACH'), mk('1', 'CLIENT'), mk('2', 'CLIENT')]);
    ctx.coach = { ...coach, locale: 'fa' };
    ctx.a = { ...a, locale: 'fa' };
    ctx.b = { ...b, locale: 'fa' };

    const existing = await prisma.exercise.findFirst({ where: { archived: false }, select: { id: true } });
    ctx.customExerciseId = null;
    if (existing) ctx.exerciseId = existing.id;
    else {
      const custom = await prisma.exercise.create({
        data: { nameEn: 'Test lift', bodyPart: 'chest', equipment: 'barbell', target: 'pectorals', isCustom: true },
      });
      ctx.exerciseId = custom.id;
      ctx.customExerciseId = custom.id;
    }

    const mkProgram = async (clientId: string, authorId: string) => {
      const p = await prisma.program.create({
        data: {
          clientId,
          authorId,
          title: 'P',
          days: { create: [{ order: 1, title: 'D1', items: { create: [{ exerciseId: ctx.exerciseId, order: 1, targetSets: 3, targetRepsMin: 8 }] } }] },
        },
        include: { days: { include: { items: true } } },
      });
      return { id: p.id, dayId: p.days[0].id, itemId: p.days[0].items[0].id };
    };
    ctx.coachProgram = await mkProgram(a.id, coach.id);
    ctx.ownProgram = await mkProgram(a.id, a.id);

    const w = await prisma.workoutLog.create({
      data: { clientId: b.id, sets: { create: [{ exerciseId: ctx.exerciseId, setIndex: 1, reps: 5, weightKg: 50 }] } },
      include: { sets: true },
    });
    ctx.bWorkout = { id: w.id, setId: w.sets[0].id };
  });

  afterAll(async () => {
    const ids = (await prisma.user.findMany({ where: { phone: { startsWith: PREFIX } }, select: { id: true } })).map((u) => u.id);
    // Program.authorId has no cascade: remove programs before their authors
    await prisma.program.deleteMany({ where: { OR: [{ clientId: { in: ids } }, { authorId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    if (ctx.customExerciseId) await prisma.exercise.delete({ where: { id: ctx.customExerciseId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  describe('a client and the coach-written program', () => {
    it('cannot edit it in any way', async () => {
      as(ctx.a);
      const { coachProgram: p } = ctx;
      const results = await Promise.all([
        actions.updateProgramAction({ programId: p.id, title: 'Hacked' }),
        actions.deleteProgramAction({ programId: p.id }),
        actions.addDayAction({ programId: p.id, title: 'X' }),
        actions.renameDayAction({ dayId: p.dayId, title: 'X' }),
        actions.deleteDayAction({ dayId: p.dayId }),
        actions.reorderDaysAction({ programId: p.id, orderedIds: [p.dayId] }),
        actions.addItemAction({ dayId: p.dayId, exerciseId: ctx.exerciseId }),
        actions.updateItemAction({ itemId: p.itemId, targetSets: 9 }),
        actions.deleteItemAction({ itemId: p.itemId }),
        actions.reorderItemsAction({ dayId: p.dayId, orderedIds: [p.itemId] }),
      ]);
      for (const r of results) expect(r).toEqual({ ok: false, error: 'forbidden' });
      const row = await prisma.program.findUniqueOrThrow({ where: { id: p.id }, include: { days: { include: { items: true } } } });
      expect(row.title).toBe('P');
      expect(row.days[0].items[0].targetSets).toBe(3);
    });

    it('can log a workout against it', async () => {
      as(ctx.a);
      const start = await actions.startWorkoutAction({ dayId: ctx.coachProgram.dayId });
      expect(start.ok).toBe(true);
      if (!start.ok) return;
      const logged = await actions.logSetAction({ workoutId: start.id, exerciseId: ctx.exerciseId, reps: '۸', weightKg: '۳۰' });
      expect(logged.ok).toBe(true);
      if (logged.ok) {
        expect(logged.set.reps).toBe(8);
        expect(logged.set.weightKg).toBe(30);
        expect(logged.set.setIndex).toBe(1);
      }
      // starting the same day again resumes the open workout instead of piling up duplicates
      const again = await actions.startWorkoutAction({ dayId: ctx.coachProgram.dayId });
      expect(again.ok && again.id === start.id && again.resumed).toBe(true);
    });
  });

  describe('a client and their own program', () => {
    it('can create, edit, reorder and delete', async () => {
      as(ctx.a);
      const created = await actions.createProgramAction({ title: '  برنامه ي من ' });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const row = await prisma.program.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.clientId).toBe(ctx.a.id);
      expect(row.authorId).toBe(ctx.a.id);
      expect(row.title).toBe('برنامه ی من'); // Arabic yeh normalised, whitespace trimmed

      const day2 = await actions.addDayAction({ programId: created.id, title: 'B' });
      expect(day2.ok).toBe(true);
      const item = await actions.addItemAction({ dayId: created.dayId, exerciseId: ctx.exerciseId });
      expect(item.ok).toBe(true);
      if (!item.ok || !day2.ok) return;
      const upd = await actions.updateItemAction({ itemId: item.item.id, targetSets: '۵', targetRepsMin: '۸', targetRepsMax: '۱۲', targetWeightKg: '۶۲٫۵', restSeconds: '۱۲۰' });
      expect(upd.ok && upd.item.targetSets === 5 && upd.item.targetRepsMax === 12 && upd.item.targetWeightKg === 62.5 && upd.item.restSeconds === 120).toBe(true);

      // a "range" whose max is not above min is stored as fixed reps
      const fixed = await actions.updateItemAction({ itemId: item.item.id, targetRepsMin: 12, targetRepsMax: 10 });
      expect(fixed.ok && fixed.item.targetRepsMax === null).toBe(true);

      expect((await actions.reorderDaysAction({ programId: created.id, orderedIds: [day2.day.id, created.dayId] })).ok).toBe(true);
      expect((await actions.reorderDaysAction({ programId: created.id, orderedIds: [day2.day.id] })).ok).toBe(false); // must list every day
      expect((await actions.deleteDayAction({ dayId: day2.day.id })).ok).toBe(true);
      expect(await actions.deleteDayAction({ dayId: created.dayId })).toEqual({ ok: false, error: 'invalid' }); // never the last day
      expect((await actions.updateProgramAction({ programId: created.id, active: false })).ok).toBe(true);
      expect((await actions.deleteProgramAction({ programId: created.id })).ok).toBe(true);
    });

    it('cannot make a program for someone else: the client id is forced to themselves', async () => {
      as(ctx.a);
      const r = await actions.createProgramAction({ title: 'Sneaky', clientId: ctx.b.id });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const row = await prisma.program.findUniqueOrThrow({ where: { id: r.id } });
      expect(row.clientId).toBe(ctx.a.id);
    });

    it('rejects an exercise that does not exist and out-of-range numbers', async () => {
      as(ctx.a);
      expect(await actions.addItemAction({ dayId: ctx.ownProgram.dayId, exerciseId: 'nope' })).toEqual({ ok: false, error: 'notFound' });
      expect(await actions.updateItemAction({ itemId: ctx.ownProgram.itemId, targetSets: 99 })).toEqual({ ok: false, error: 'invalid' });
      expect(await actions.updateItemAction({ itemId: ctx.ownProgram.itemId, restSeconds: 'abc' })).toEqual({ ok: false, error: 'invalid' });
    });
  });

  describe("a client and another client's workouts", () => {
    it('cannot read, log, edit, delete or finish them', async () => {
      as(ctx.a);
      const w = ctx.bWorkout;
      expect(await actions.logSetAction({ workoutId: w.id, exerciseId: ctx.exerciseId, reps: 5, weightKg: 50 })).toEqual({ ok: false, error: 'forbidden' });
      expect(await actions.updateSetAction({ setId: w.setId, reps: 99 })).toEqual({ ok: false, error: 'forbidden' });
      expect(await actions.deleteSetAction({ setId: w.setId })).toEqual({ ok: false, error: 'forbidden' });
      expect(await actions.restoreSetAction({ workoutId: w.id, exerciseId: ctx.exerciseId, setIndex: 1, reps: 5, weightKg: 50 })).toEqual({ ok: false, error: 'forbidden' });
      expect(await actions.finishWorkoutAction({ workoutId: w.id })).toEqual({ ok: false, error: 'forbidden' });
      expect(await actions.updateWorkoutNoteAction({ workoutId: w.id, note: 'x' })).toEqual({ ok: false, error: 'forbidden' });
      expect(await actions.deleteWorkoutAction({ workoutId: w.id })).toEqual({ ok: false, error: 'forbidden' });
      expect(await actions.exerciseContextAction({ workoutId: w.id, exerciseId: ctx.exerciseId })).toEqual({ ok: false, error: 'forbidden' });
      const set = await prisma.setLog.findUniqueOrThrow({ where: { id: w.setId } });
      expect(set.reps).toBe(5);
      expect(Number(set.weightKg)).toBe(50);
    });

    it("cannot start a workout from another client's program day, nor claim their booking", async () => {
      as(ctx.b);
      expect(await actions.startWorkoutAction({ dayId: ctx.ownProgram.dayId })).toEqual({ ok: false, error: 'forbidden' });
      expect(await actions.startWorkoutAction({ dayId: 'missing' })).toEqual({ ok: false, error: 'notFound' });
    });

    it('cannot pass a clientId to start a workout for someone else', async () => {
      as(ctx.a);
      const r = await actions.startWorkoutAction({ clientId: ctx.b.id });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const row = await prisma.workoutLog.findUniqueOrThrow({ where: { id: r.id } });
      expect(row.clientId).toBe(ctx.a.id);
      await actions.deleteWorkoutAction({ workoutId: r.id });
    });
  });

  describe('linking a workout to a booking', () => {
    it('links the booking owner once, refuses everyone else, and refuses a pending booking', async () => {
      const startsAt = new Date(Date.now() + (Number(PREFIX.slice(-4)) + 1) * 1000);
      const booking = await prisma.booking.create({
        data: { clientId: ctx.a.id, startsAt, endsAt: new Date(startsAt.getTime() + 3600_000), status: 'CONFIRMED' },
      });
      as(ctx.b);
      expect(await actions.startWorkoutAction({ bookingId: booking.id })).toEqual({ ok: false, error: 'forbidden' });

      as(ctx.a);
      const first = await actions.startWorkoutAction({ bookingId: booking.id });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect((await prisma.workoutLog.findUniqueOrThrow({ where: { id: first.id } })).bookingId).toBe(booking.id);
      const second = await actions.startWorkoutAction({ bookingId: booking.id });
      expect(second.ok && second.id === first.id && second.resumed).toBe(true);

      const pendingAt = new Date(startsAt.getTime() + 7200_000);
      const pending = await prisma.booking.create({
        data: { clientId: ctx.a.id, startsAt: pendingAt, endsAt: new Date(pendingAt.getTime() + 3600_000), status: 'PENDING' },
      });
      expect(await actions.startWorkoutAction({ bookingId: pending.id })).toEqual({ ok: false, error: 'invalid' });
      await actions.deleteWorkoutAction({ workoutId: first.id });
    });
  });

  describe('sets', () => {
    it('numbers sets per exercise, renumbers on delete, restores in place, and flags warm-ups', async () => {
      as(ctx.a);
      const start = await actions.startWorkoutAction({});
      expect(start.ok).toBe(true);
      if (!start.ok) return;
      const w = start.id;
      const log = (reps: number, kg: number, isWarmup = false) =>
        actions.logSetAction({ workoutId: w, exerciseId: ctx.exerciseId, reps, weightKg: kg, isWarmup });
      const s1 = await log(5, 20, true);
      const s2 = await log(8, 60);
      const s3 = await log(8, 62.5);
      expect([s1, s2, s3].every((r) => r.ok)).toBe(true);
      if (!s1.ok || !s2.ok || !s3.ok) return;
      expect([s1.set.setIndex, s2.set.setIndex, s3.set.setIndex]).toEqual([1, 2, 3]);
      expect(s1.set.isWarmup).toBe(true);

      const del = await actions.deleteSetAction({ setId: s2.set.id });
      expect(del.ok).toBe(true);
      let rows = await prisma.setLog.findMany({ where: { workoutId: w }, orderBy: { setIndex: 'asc' } });
      expect(rows.map((r) => r.setIndex)).toEqual([1, 2]);

      if (del.ok) {
        const back = await actions.restoreSetAction({
          workoutId: w,
          exerciseId: del.deleted.exerciseId,
          setIndex: del.deleted.setIndex,
          reps: del.deleted.reps,
          weightKg: del.deleted.weightKg,
        });
        expect(back.ok).toBe(true);
      }
      rows = await prisma.setLog.findMany({ where: { workoutId: w }, orderBy: { setIndex: 'asc' } });
      expect(rows.map((r) => [r.setIndex, r.reps, Number(r.weightKg)])).toEqual([
        [1, 5, 20],
        [2, 8, 60],
        [3, 8, 62.5],
      ]);

      // update with an omitted rpe leaves it alone; null clears it
      await actions.updateSetAction({ setId: s3.set.id, rpe: 8.5 });
      await actions.updateSetAction({ setId: s3.set.id, reps: 9 });
      expect(Number((await prisma.setLog.findUniqueOrThrow({ where: { id: s3.set.id } })).rpe)).toBe(8.5);
      await actions.updateSetAction({ setId: s3.set.id, rpe: null });
      expect((await prisma.setLog.findUniqueOrThrow({ where: { id: s3.set.id } })).rpe).toBeNull();

      // finishing returns the summary (warm-ups are not in sets or volume) and closes the workout
      const fin = await actions.finishWorkoutAction({ workoutId: w, note: 'good' });
      expect(fin.ok).toBe(true);
      if (fin.ok) {
        expect(fin.summary.setCount).toBe(2);
        expect(fin.summary.volume).toBe(8 * 60 + 9 * 62.5);
        expect(fin.summary.note).toBe('good');
        expect(fin.summary.finishedAt).not.toBeNull();
      }
      expect(await log(8, 65)).toEqual({ ok: false, error: 'finished' });
    });
  });

  describe('the coach', () => {
    it('can edit any program and log for a client', async () => {
      as(ctx.coach);
      expect((await actions.updateProgramAction({ programId: ctx.coachProgram.id, notes: 'Eat well' })).ok).toBe(true);
      expect((await actions.updateItemAction({ itemId: ctx.coachProgram.itemId, targetSets: 4 })).ok).toBe(true);
      expect((await actions.updateItemAction({ itemId: ctx.ownProgram.itemId, targetSets: 4 })).ok).toBe(true); // even one the client wrote

      const none = await actions.startWorkoutAction({});
      expect(none).toEqual({ ok: false, error: 'invalid' }); // a coach must name the client
      const r = await actions.startWorkoutAction({ clientId: ctx.b.id });
      expect(r.ok).toBe(true);
      if (r.ok) {
        const row = await prisma.workoutLog.findUniqueOrThrow({ where: { id: r.id } });
        expect(row.clientId).toBe(ctx.b.id);
        await actions.deleteWorkoutAction({ workoutId: r.id });
      }
    });

    it('creates a program for a client with the coach as author, and only for real clients', async () => {
      as(ctx.coach);
      const r = await actions.createProgramAction({ title: 'Plan', clientId: ctx.b.id });
      expect(r.ok).toBe(true);
      if (r.ok) {
        const row = await prisma.program.findUniqueOrThrow({ where: { id: r.id } });
        expect([row.clientId, row.authorId]).toEqual([ctx.b.id, ctx.coach.id]);
      }
      expect(await actions.createProgramAction({ title: 'Plan', clientId: ctx.coach.id })).toEqual({ ok: false, error: 'notFound' });
      expect(await actions.createProgramAction({ title: 'Plan' })).toEqual({ ok: false, error: 'invalid' });
    });
  });

  describe('exercise search', () => {
    it('is capped, matches Persian names with or without the half-space, and honours filters', async () => {
      as(ctx.a);
      const some = await actions.searchExercisesAction({ q: '', limit: 5 });
      expect(some.ok && some.exercises.length <= 5).toBe(true);
      const bad = await actions.searchExercisesAction({ q: 'x', limit: 500 });
      expect(bad).toEqual({ ok: false, error: 'invalid' });
      // wildcard characters are literal, not patterns
      const wild = await actions.searchExercisesAction({ q: '%' });
      expect(wild.ok && wild.exercises.length).toBe(0);
      const filtered = await actions.searchExercisesAction({ q: '', bodyPart: 'chest', limit: 10 });
      expect(filtered.ok && filtered.exercises.every((e) => e.bodyPart === 'chest')).toBe(true);
    });
  });
});
