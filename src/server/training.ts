'use server';

import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { getCoachSettings } from '@/lib/settings';
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/session';
import {
  addDaySchema,
  addItemSchema,
  createProgramSchema,
  dayIdSchema,
  deleteSetSchema,
  exerciseContextSchema,
  exerciseSearchSchema,
  finishWorkoutSchema,
  itemIdSchema,
  logSetSchema,
  programIdSchema,
  renameDaySchema,
  reorderDaysSchema,
  reorderItemsSchema,
  restoreSetSchema,
  startWorkoutSchema,
  updateItemSchema,
  updateProgramSchema,
  updateSetSchema,
  workoutIdSchema,
  workoutNoteSchema,
  type ActionErrorCode,
  type ActionResult,
} from '@/lib/training/schemas';
import type { ExerciseContext, ProgramItemDTO, WorkoutSummaryDTO } from '@/lib/training/dto';
import type { ExerciseDTO, SetDTO } from '@/lib/training/types';
import {
  EXERCISE_SELECT,
  getExerciseContexts,
  getWorkoutSummary,
  toProgramItemDTO,
} from '@/lib/training/queries';

/*
 * Server actions for workouts, sets and programs.
 *
 * Rules (docs/ARCHITECTURE.md): every action re-checks the session; a CLIENT only touches rows with
 * clientId = self; the COACH may touch everything. A client can LOG against a coach-written program
 * but cannot EDIT it (only programs they wrote themselves). Numbers are Persian-digit tolerant
 * (schemas.ts). Results are `{ ok: true, ... } | { ok: false, error: code }`; the client translates
 * the code.
 *
 * revalidatePath is skipped on the chatty actions (logSet / updateSet / item autosave): the screens
 * that call them keep their own state, and a refresh payload on every tap would be wasted work.
 */

const fail = (error: ActionErrorCode): { ok: false; error: ActionErrorCode } => ({ ok: false, error });

/** Parse with a schema; bad input is a stable `invalid` code, never a thrown error. */
function parse<S extends z.ZodType>(schema: S, input: unknown): { ok: true; data: z.output<S> } | { ok: false } {
  const result = schema.safeParse(input);
  return result.success ? { ok: true, data: result.data } : { ok: false };
}

/** Run the database work; anything unexpected becomes `generic` (and is logged), never a 500 to the UI. */
async function guard<T extends object>(work: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await work();
  } catch (e) {
    console.error('[training action]', e);
    return fail('generic');
  }
}

const isCoach = (u: SessionUser) => u.role === 'COACH';

/** Can this user act on a workout / sets that belong to `clientId`? */
const canActFor = (u: SessionUser, clientId: string) => isCoach(u) || u.id === clientId;

/** Clients edit only programs they wrote for themselves; the coach edits any. */
const canEditProgram = (u: SessionUser, p: { clientId: string; authorId: string }) =>
  isCoach(u) || (p.clientId === u.id && p.authorId === u.id);

/**
 * Invalidate the LIST pages a change affects (Today, program list, history, progress, the coach's
 * client page) but never the page the action was called from: a server action that revalidates its
 * own page gets that page re-rendered in the response, and a page like the live workout (finished ->
 * redirect) or a deleted program (-> not found) would then jump before the client had navigated.
 */
const APP_LISTS = ['/[locale]/app', '/[locale]/app/history', '/[locale]/app/progress', '/[locale]/app/program'];
const COACH_LISTS = ['/[locale]/coach', '/[locale]/coach/clients/[id]'];

function revalidateTraining(scope: 'app' | 'coach' | 'both' = 'both') {
  if (scope !== 'coach') for (const path of APP_LISTS) revalidatePath(path, 'page');
  if (scope !== 'app') for (const path of COACH_LISTS) revalidatePath(path, 'page');
}

// ------------------------------------------------------------------------------------- DTO helpers

const SET_SELECT = {
  id: true,
  exerciseId: true,
  setIndex: true,
  reps: true,
  weightKg: true,
  rpe: true,
  isWarmup: true,
  createdAt: true,
} satisfies Prisma.SetLogSelect;

type SetRow = Prisma.SetLogGetPayload<{ select: typeof SET_SELECT }>;

const toSetDTO = (r: SetRow): SetDTO => ({
  id: r.id,
  exerciseId: r.exerciseId,
  setIndex: r.setIndex,
  reps: r.reps,
  weightKg: Number(r.weightKg),
  rpe: r.rpe == null ? null : Number(r.rpe),
  isWarmup: r.isWarmup,
  createdAt: r.createdAt.toISOString(),
});

const MAX_SETS_PER_EXERCISE = 100;
/** A workout left open longer than this is closed at its last set, not at "now". */
const STALE_WORKOUT_MS = 12 * 3600_000;
/** Starting the same program day again within this window resumes the open workout. */
const RESUME_WINDOW_MS = 8 * 3600_000;

// ------------------------------------------------------------------------------------------ workouts

/**
 * Start a workout: free (no day) or from a program day, optionally linked to a booking. Starting the
 * same day again while one is still open resumes it (double taps, a second tab); a booking can hold
 * only one workout. A coach starting one must name the client.
 */
export async function startWorkoutAction(input: {
  dayId?: string | null;
  bookingId?: string | null;
  clientId?: string | null;
}): Promise<ActionResult<{ id: string; resumed: boolean }>> {
  const user = await requireUser();
  const parsed = parse(startWorkoutSchema, input);
  if (!parsed.ok) return fail('invalid');
  const { dayId, bookingId } = parsed.data;
  const clientId = isCoach(user) ? parsed.data.clientId : user.id;
  if (!clientId) return fail('invalid');

  return guard(async () => {
    if (isCoach(user)) {
      const exists = await prisma.user.findFirst({ where: { id: clientId, role: 'CLIENT' }, select: { id: true } });
      if (!exists) return fail('notFound');
    }

    if (dayId) {
      const day = await prisma.programDay.findUnique({
        where: { id: dayId },
        select: { program: { select: { clientId: true } } },
      });
      if (!day) return fail('notFound');
      if (day.program.clientId !== clientId) return fail('forbidden');
    }

    if (bookingId) {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { clientId: true, status: true, workout: { select: { id: true } } },
      });
      if (!booking) return fail('notFound');
      if (booking.clientId !== clientId) return fail('forbidden');
      if (booking.workout) return { ok: true, id: booking.workout.id, resumed: true };
      if (booking.status !== 'CONFIRMED' && booking.status !== 'COMPLETED') return fail('invalid');
    }

    if (dayId) {
      const open = await prisma.workoutLog.findFirst({
        where: {
          clientId,
          programDayId: dayId,
          finishedAt: null,
          startedAt: { gte: new Date(Date.now() - RESUME_WINDOW_MS) },
        },
        orderBy: { startedAt: 'desc' },
        select: { id: true },
      });
      if (open) return { ok: true, id: open.id, resumed: true };
    }

    try {
      const created = await prisma.workoutLog.create({
        data: { clientId, programDayId: dayId ?? null, bookingId: bookingId ?? null },
        select: { id: true },
      });
      revalidateTraining();
      return { ok: true, id: created.id, resumed: false };
    } catch (e) {
      // two taps raced for the same booking: the unique index keeps one, hand back that one
      if (bookingId && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await prisma.workoutLog.findUnique({ where: { bookingId }, select: { id: true } });
        if (existing) return { ok: true, id: existing.id, resumed: true };
      }
      throw e;
    }
  });
}

/** Append a set to a workout. The set number is assigned here (max + 1), so retries never collide. */
export async function logSetAction(input: {
  workoutId: string;
  exerciseId: string;
  reps: number | string;
  weightKg: number | string;
  rpe?: number | string | null;
  isWarmup?: boolean;
}): Promise<ActionResult<{ set: SetDTO }>> {
  const user = await requireUser();
  const parsed = parse(logSetSchema, input);
  if (!parsed.ok) return fail('invalid');
  const d = parsed.data;

  return guard(async () => {
    const workout = await prisma.workoutLog.findUnique({
      where: { id: d.workoutId },
      select: { clientId: true, finishedAt: true },
    });
    if (!workout) return fail('notFound');
    if (!canActFor(user, workout.clientId)) return fail('forbidden');
    if (workout.finishedAt) return fail('finished');

    const exercise = await prisma.exercise.findUnique({ where: { id: d.exerciseId }, select: { id: true, archived: true } });
    if (!exercise || exercise.archived) return fail('notFound');

    const row = await prisma.$transaction(async (tx) => {
      const agg = await tx.setLog.aggregate({
        where: { workoutId: d.workoutId, exerciseId: d.exerciseId },
        _max: { setIndex: true },
        _count: { _all: true },
      });
      if (agg._count._all >= MAX_SETS_PER_EXERCISE) return null;
      return tx.setLog.create({
        data: {
          workoutId: d.workoutId,
          exerciseId: d.exerciseId,
          setIndex: (agg._max.setIndex ?? 0) + 1,
          reps: d.reps,
          weightKg: d.weightKg,
          rpe: d.rpe ?? null,
          isWarmup: d.isWarmup ?? false,
        },
        select: SET_SELECT,
      });
    });
    if (!row) return fail('limit');
    return { ok: true, set: toSetDTO(row) };
  });
}

/** Change reps / weight / RPE / warm-up of a logged set (also from history, to fix a typo). */
export async function updateSetAction(input: {
  setId: string;
  reps?: number | string;
  weightKg?: number | string;
  rpe?: number | string | null;
  isWarmup?: boolean;
}): Promise<ActionResult<{ set: SetDTO }>> {
  const user = await requireUser();
  const parsed = parse(updateSetSchema, input);
  if (!parsed.ok) return fail('invalid');
  const d = parsed.data;

  return guard(async () => {
    const existing = await prisma.setLog.findUnique({
      where: { id: d.setId },
      select: { workout: { select: { clientId: true } } },
    });
    if (!existing) return fail('notFound');
    if (!canActFor(user, existing.workout.clientId)) return fail('forbidden');

    const row = await prisma.setLog.update({
      where: { id: d.setId },
      data: {
        ...(d.reps !== undefined ? { reps: d.reps } : {}),
        ...(d.weightKg !== undefined ? { weightKg: d.weightKg } : {}),
        ...(d.rpe !== undefined ? { rpe: d.rpe } : {}),
        ...(d.isWarmup !== undefined ? { isWarmup: d.isWarmup } : {}),
      },
      select: SET_SELECT,
    });
    return { ok: true, set: toSetDTO(row) };
  });
}

/** Delete a set and close the gap in the numbering. Returns the deleted set so the UI can offer undo. */
export async function deleteSetAction(input: { setId: string }): Promise<ActionResult<{ deleted: SetDTO; workoutId: string }>> {
  const user = await requireUser();
  const parsed = parse(deleteSetSchema, input);
  if (!parsed.ok) return fail('invalid');

  return guard(async () => {
    const existing = await prisma.setLog.findUnique({
      where: { id: parsed.data.setId },
      select: { ...SET_SELECT, workoutId: true, workout: { select: { clientId: true } } },
    });
    if (!existing) return fail('notFound');
    if (!canActFor(user, existing.workout.clientId)) return fail('forbidden');

    await prisma.$transaction([
      prisma.setLog.delete({ where: { id: existing.id } }),
      prisma.setLog.updateMany({
        where: { workoutId: existing.workoutId, exerciseId: existing.exerciseId, setIndex: { gt: existing.setIndex } },
        data: { setIndex: { decrement: 1 } },
      }),
    ]);
    return { ok: true, deleted: toSetDTO(existing), workoutId: existing.workoutId };
  });
}

/** Undo for delete: put the set back at its old number, pushing later ones down. */
export async function restoreSetAction(input: {
  workoutId: string;
  exerciseId: string;
  setIndex: number;
  reps: number | string;
  weightKg: number | string;
  rpe?: number | string | null;
  isWarmup?: boolean;
}): Promise<ActionResult<{ set: SetDTO }>> {
  const user = await requireUser();
  const parsed = parse(restoreSetSchema, input);
  if (!parsed.ok) return fail('invalid');
  const d = parsed.data;

  return guard(async () => {
    const workout = await prisma.workoutLog.findUnique({ where: { id: d.workoutId }, select: { clientId: true } });
    if (!workout) return fail('notFound');
    if (!canActFor(user, workout.clientId)) return fail('forbidden');

    const row = await prisma.$transaction(async (tx) => {
      const agg = await tx.setLog.aggregate({
        where: { workoutId: d.workoutId, exerciseId: d.exerciseId },
        _max: { setIndex: true },
      });
      const at = Math.min(d.setIndex, (agg._max.setIndex ?? 0) + 1);
      await tx.setLog.updateMany({
        where: { workoutId: d.workoutId, exerciseId: d.exerciseId, setIndex: { gte: at } },
        data: { setIndex: { increment: 1 } },
      });
      return tx.setLog.create({
        data: {
          workoutId: d.workoutId,
          exerciseId: d.exerciseId,
          setIndex: at,
          reps: d.reps,
          weightKg: d.weightKg,
          rpe: d.rpe ?? null,
          isWarmup: d.isWarmup ?? false,
        },
        select: SET_SELECT,
      });
    });
    return { ok: true, set: toSetDTO(row) };
  });
}

/**
 * Close the workout and return its summary (sets, volume, PRs, duration). Idempotent. A workout that
 * was left open for more than 12 hours is closed at its last set instead of "now".
 */
export async function finishWorkoutAction(input: {
  workoutId: string;
  note?: string;
}): Promise<ActionResult<{ summary: WorkoutSummaryDTO }>> {
  const user = await requireUser();
  const parsed = parse(finishWorkoutSchema, input);
  if (!parsed.ok) return fail('invalid');
  const { workoutId, note } = parsed.data;

  return guard(async () => {
    const workout = await prisma.workoutLog.findUnique({
      where: { id: workoutId },
      select: {
        clientId: true,
        startedAt: true,
        finishedAt: true,
        sets: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!workout) return fail('notFound');
    if (!canActFor(user, workout.clientId)) return fail('forbidden');

    const now = new Date();
    let finishedAt = workout.finishedAt;
    if (!finishedAt) {
      const stale = now.getTime() - workout.startedAt.getTime() > STALE_WORKOUT_MS;
      finishedAt = stale ? (workout.sets[0]?.createdAt ?? workout.startedAt) : now;
    }
    await prisma.workoutLog.update({
      where: { id: workoutId },
      data: { finishedAt, ...(note !== undefined ? { note: note || null } : {}) },
    });
    // no revalidatePath here: the page that called this is about to become invalid (finished -> redirect, deleted -> not found)
    // and Next re-renders the calling page when an action revalidates; the client navigates next and every list page is fetched fresh.
    const summary = await getWorkoutSummary(workoutId);
    if (!summary) return fail('notFound');
    return { ok: true, summary };
  });
}

/** Edit the free-text note of a workout. */
export async function updateWorkoutNoteAction(input: { workoutId: string; note: string }): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = parse(workoutNoteSchema, input);
  if (!parsed.ok) return fail('invalid');

  return guard(async () => {
    const workout = await prisma.workoutLog.findUnique({ where: { id: parsed.data.workoutId }, select: { clientId: true } });
    if (!workout) return fail('notFound');
    if (!canActFor(user, workout.clientId)) return fail('forbidden');
    await prisma.workoutLog.update({ where: { id: parsed.data.workoutId }, data: { note: parsed.data.note || null } });
    revalidateTraining();
    return { ok: true };
  });
}

/** Delete a whole workout and its sets (an accidental start, a duplicate). */
export async function deleteWorkoutAction(input: { workoutId: string }): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = parse(workoutIdSchema, input);
  if (!parsed.ok) return fail('invalid');

  return guard(async () => {
    const workout = await prisma.workoutLog.findUnique({ where: { id: parsed.data.workoutId }, select: { clientId: true } });
    if (!workout) return fail('notFound');
    if (!canActFor(user, workout.clientId)) return fail('forbidden');
    await prisma.workoutLog.delete({ where: { id: parsed.data.workoutId } });
    // no revalidatePath here: the page that called this is about to become invalid (finished -> redirect, deleted -> not found)
    // and Next re-renders the calling page when an action revalidates; the client navigates next and every list page is fetched fresh.
    return { ok: true };
  });
}

/** "Last time" and the PR baseline for one exercise (when an exercise is added mid-workout). */
export async function exerciseContextAction(input: {
  exerciseId: string;
  workoutId: string;
  locale?: string;
}): Promise<ActionResult<{ context: ExerciseContext }>> {
  const user = await requireUser();
  const parsed = parse(exerciseContextSchema, input);
  if (!parsed.ok) return fail('invalid');

  return guard(async () => {
    const workout = await prisma.workoutLog.findUnique({ where: { id: parsed.data.workoutId }, select: { clientId: true } });
    if (!workout) return fail('notFound');
    if (!canActFor(user, workout.clientId)) return fail('forbidden');
    const settings = await getCoachSettings();
    const contexts = await getExerciseContexts(workout.clientId, [parsed.data.exerciseId], parsed.data.workoutId, {
      locale: parsed.data.locale,
      timeZone: settings.timezone,
    });
    return { ok: true, context: contexts[parsed.data.exerciseId] };
  });
}

// ------------------------------------------------------------------------------------- exercise search

/** Collapse what people type: Arabic yeh/kaf -> Persian, ZWNJ -> space, one space between words. */
function normalizeQuery(q: string): string {
  return q
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[‌‍]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

/**
 * Search the exercise library by English or Persian name (every word must match somewhere), with
 * optional body part / equipment filters. Server-side, capped (default 30, max 60). Exact and
 * prefix matches rank first, then shorter names.
 */
export async function searchExercisesAction(input: {
  q?: string;
  bodyPart?: string | null;
  equipment?: string | null;
  limit?: number;
}): Promise<ActionResult<{ exercises: ExerciseDTO[] }>> {
  await requireUser();
  const parsed = parse(exerciseSearchSchema, input);
  if (!parsed.ok) return fail('invalid');
  const { bodyPart, equipment } = parsed.data;
  const limit = parsed.data.limit ?? 30;
  const q = normalizeQuery(parsed.data.q);
  const tokens = q ? q.split(' ').slice(0, 5) : [];

  return guard(async () => {
    const faNorm = Prisma.sql`replace("nameFa", ${'‌'}, ' ')`;
    const where: Prisma.Sql[] = [Prisma.sql`archived = false`];
    if (bodyPart) where.push(Prisma.sql`"bodyPart" = ${bodyPart}`);
    if (equipment) where.push(Prisma.sql`equipment = ${equipment}`);
    for (const t of tokens) {
      const like = `%${escapeLike(t)}%`;
      where.push(Prisma.sql`("nameEn" ILIKE ${like} OR ${faNorm} ILIKE ${like})`);
    }

    const lowerQ = q.toLowerCase();
    const prefix = `${escapeLike(q)}%`;
    const rank = q
      ? Prisma.sql`CASE
          WHEN lower("nameEn") = ${lowerQ} OR ${faNorm} = ${q} THEN 0
          WHEN "nameEn" ILIKE ${prefix} OR ${faNorm} ILIKE ${prefix} THEN 1
          ELSE 2 END`
      : Prisma.sql`0::int`;

    const rows = await prisma.$queryRaw<ExerciseDTO[]>(Prisma.sql`
      SELECT id, "nameEn", "nameFa", "bodyPart", equipment, target
      FROM "Exercise"
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY ${rank}, length("nameEn"), "nameEn"
      LIMIT ${limit}`);
    return { ok: true, exercises: rows };
  });
}

// ------------------------------------------------------------------------------------------ programs

async function loadProgramAccess(user: SessionUser, programId: string) {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { id: true, clientId: true, authorId: true },
  });
  if (!program) return { ok: false as const, error: 'notFound' as const };
  if (!canEditProgram(user, program)) return { ok: false as const, error: 'forbidden' as const };
  return { ok: true as const, program };
}

async function programIdOfDay(dayId: string) {
  const day = await prisma.programDay.findUnique({ where: { id: dayId }, select: { id: true, programId: true } });
  return day;
}

/** Touch `updatedAt` so program lists sort by last edit (child edits do not bump the parent). */
const touchProgram = (programId: string) =>
  prisma.program.update({ where: { id: programId }, data: { updatedAt: new Date() }, select: { id: true } });

/**
 * Create a program with one empty first day. A client creates one for themselves (author = client);
 * the coach creates one for any client (author = coach).
 */
export async function createProgramAction(input: {
  title: string;
  clientId?: string | null;
  dayTitle?: string;
}): Promise<ActionResult<{ id: string; dayId: string }>> {
  const user = await requireUser();
  const parsed = parse(createProgramSchema, input);
  if (!parsed.ok) return fail('invalid');
  const clientId = isCoach(user) ? parsed.data.clientId : user.id;
  if (!clientId) return fail('invalid');

  return guard(async () => {
    if (isCoach(user)) {
      const client = await prisma.user.findFirst({ where: { id: clientId, role: 'CLIENT' }, select: { id: true } });
      if (!client) return fail('notFound');
    }
    const program = await prisma.program.create({
      data: {
        clientId,
        authorId: user.id,
        title: parsed.data.title,
        active: true,
        days: { create: [{ order: 1, title: parsed.data.dayTitle || 'A' }] },
      },
      select: { id: true, days: { select: { id: true } } },
    });
    revalidateTraining();
    return { ok: true, id: program.id, dayId: program.days[0].id };
  });
}

/** Rename, edit notes, archive (active = false) or re-activate a program. */
export async function updateProgramAction(input: {
  programId: string;
  title?: string;
  notes?: string | null;
  active?: boolean;
}): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = parse(updateProgramSchema, input);
  if (!parsed.ok) return fail('invalid');
  const d = parsed.data;

  return guard(async () => {
    const access = await loadProgramAccess(user, d.programId);
    if (!access.ok) return fail(access.error);
    await prisma.program.update({
      where: { id: d.programId },
      data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.notes !== undefined ? { notes: d.notes } : {}),
        ...(d.active !== undefined ? { active: d.active } : {}),
      },
    });
    if (d.active !== undefined) revalidateTraining();
    return { ok: true };
  });
}

/** Delete a program. Workouts already logged keep their sets (the day link is cleared). */
export async function deleteProgramAction(input: { programId: string }): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = parse(programIdSchema, input);
  if (!parsed.ok) return fail('invalid');

  return guard(async () => {
    const access = await loadProgramAccess(user, parsed.data.programId);
    if (!access.ok) return fail(access.error);
    await prisma.program.delete({ where: { id: parsed.data.programId } });
    // no revalidatePath here: the page that called this is about to become invalid (finished -> redirect, deleted -> not found)
    // and Next re-renders the calling page when an action revalidates; the client navigates next and every list page is fetched fresh.
    return { ok: true };
  });
}

export async function addDayAction(input: {
  programId: string;
  title?: string;
}): Promise<ActionResult<{ day: { id: string; order: number; title: string } }>> {
  const user = await requireUser();
  const parsed = parse(addDaySchema, input);
  if (!parsed.ok) return fail('invalid');

  return guard(async () => {
    const access = await loadProgramAccess(user, parsed.data.programId);
    if (!access.ok) return fail(access.error);
    const count = await prisma.programDay.count({ where: { programId: parsed.data.programId } });
    if (count >= 14) return fail('limit');
    const agg = await prisma.programDay.aggregate({ where: { programId: parsed.data.programId }, _max: { order: true } });
    const day = await prisma.programDay.create({
      data: {
        programId: parsed.data.programId,
        order: (agg._max.order ?? 0) + 1,
        title: parsed.data.title || String((agg._max.order ?? 0) + 1),
      },
      select: { id: true, order: true, title: true },
    });
    await touchProgram(parsed.data.programId);
    return { ok: true, day };
  });
}

export async function renameDayAction(input: { dayId: string; title: string }): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = parse(renameDaySchema, input);
  if (!parsed.ok) return fail('invalid');

  return guard(async () => {
    const day = await programIdOfDay(parsed.data.dayId);
    if (!day) return fail('notFound');
    const access = await loadProgramAccess(user, day.programId);
    if (!access.ok) return fail(access.error);
    await prisma.programDay.update({ where: { id: day.id }, data: { title: parsed.data.title } });
    return { ok: true };
  });
}

/** Delete a day (never the last one) and renumber the rest. */
export async function deleteDayAction(input: { dayId: string }): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = parse(dayIdSchema, input);
  if (!parsed.ok) return fail('invalid');

  return guard(async () => {
    const day = await programIdOfDay(parsed.data.dayId);
    if (!day) return fail('notFound');
    const access = await loadProgramAccess(user, day.programId);
    if (!access.ok) return fail(access.error);
    const days = await prisma.programDay.findMany({
      where: { programId: day.programId },
      orderBy: { order: 'asc' },
      select: { id: true },
    });
    if (days.length <= 1) return fail('invalid');
    const rest = days.filter((d) => d.id !== day.id);
    await prisma.$transaction([
      prisma.programDay.delete({ where: { id: day.id } }),
      ...rest.map((d, i) => prisma.programDay.update({ where: { id: d.id }, data: { order: i + 1 } })),
    ]);
    await touchProgram(day.programId);
    return { ok: true };
  });
}

/** Set the order of a program's days: `orderedIds` must be exactly its day ids. */
export async function reorderDaysAction(input: { programId: string; orderedIds: string[] }): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = parse(reorderDaysSchema, input);
  if (!parsed.ok) return fail('invalid');

  return guard(async () => {
    const access = await loadProgramAccess(user, parsed.data.programId);
    if (!access.ok) return fail(access.error);
    const days = await prisma.programDay.findMany({ where: { programId: parsed.data.programId }, select: { id: true } });
    const ids = parsed.data.orderedIds;
    if (ids.length !== days.length || !days.every((d) => ids.includes(d.id)) || new Set(ids).size !== ids.length) {
      return fail('invalid');
    }
    await prisma.$transaction(ids.map((id, i) => prisma.programDay.update({ where: { id }, data: { order: i + 1 } })));
    await touchProgram(parsed.data.programId);
    return { ok: true };
  });
}

const ITEM_DEFAULTS = { targetSets: 3, targetRepsMin: 8, restSeconds: 90 } as const;

export async function addItemAction(input: {
  dayId: string;
  exerciseId: string;
  targetSets?: number | string;
  targetRepsMin?: number | string;
  targetRepsMax?: number | string | null;
  targetWeightKg?: number | string | null;
  restSeconds?: number | string | null;
  note?: string | null;
}): Promise<ActionResult<{ item: ProgramItemDTO }>> {
  const user = await requireUser();
  const parsed = parse(addItemSchema, input);
  if (!parsed.ok) return fail('invalid');
  const d = parsed.data;

  return guard(async () => {
    const day = await programIdOfDay(d.dayId);
    if (!day) return fail('notFound');
    const access = await loadProgramAccess(user, day.programId);
    if (!access.ok) return fail(access.error);
    const exercise = await prisma.exercise.findUnique({ where: { id: d.exerciseId }, select: { id: true, archived: true } });
    if (!exercise || exercise.archived) return fail('notFound');

    const count = await prisma.programItem.count({ where: { dayId: d.dayId } });
    if (count >= 40) return fail('limit');
    const agg = await prisma.programItem.aggregate({ where: { dayId: d.dayId }, _max: { order: true } });
    const repsMin = d.targetRepsMin ?? ITEM_DEFAULTS.targetRepsMin;
    const row = await prisma.programItem.create({
      data: {
        dayId: d.dayId,
        exerciseId: d.exerciseId,
        order: (agg._max.order ?? 0) + 1,
        targetSets: d.targetSets ?? ITEM_DEFAULTS.targetSets,
        targetRepsMin: repsMin,
        targetRepsMax: d.targetRepsMax != null && d.targetRepsMax > repsMin ? d.targetRepsMax : null,
        targetWeightKg: d.targetWeightKg != null && d.targetWeightKg > 0 ? d.targetWeightKg : null,
        restSeconds: d.restSeconds === undefined ? ITEM_DEFAULTS.restSeconds : d.restSeconds,
        note: d.note ?? null,
      },
      include: { exercise: { select: EXERCISE_SELECT } },
    });
    await touchProgram(day.programId);
    return { ok: true, item: toProgramItemDTO(row) };
  });
}

/** Autosave target: change any of exercise, sets, reps (min / optional max), weight, rest, note. */
export async function updateItemAction(input: {
  itemId: string;
  exerciseId?: string;
  targetSets?: number | string;
  targetRepsMin?: number | string;
  targetRepsMax?: number | string | null;
  targetWeightKg?: number | string | null;
  restSeconds?: number | string | null;
  note?: string | null;
}): Promise<ActionResult<{ item: ProgramItemDTO }>> {
  const user = await requireUser();
  const parsed = parse(updateItemSchema, input);
  if (!parsed.ok) return fail('invalid');
  const d = parsed.data;

  return guard(async () => {
    const item = await prisma.programItem.findUnique({
      where: { id: d.itemId },
      select: { id: true, targetRepsMin: true, targetRepsMax: true, day: { select: { programId: true } } },
    });
    if (!item) return fail('notFound');
    const access = await loadProgramAccess(user, item.day.programId);
    if (!access.ok) return fail(access.error);

    if (d.exerciseId) {
      const exercise = await prisma.exercise.findUnique({ where: { id: d.exerciseId }, select: { id: true, archived: true } });
      if (!exercise || exercise.archived) return fail('notFound');
    }

    // a range only makes sense when max > min; otherwise it is a fixed rep count
    const repsMin = d.targetRepsMin ?? item.targetRepsMin;
    const repsMaxInput = d.targetRepsMax !== undefined ? d.targetRepsMax : item.targetRepsMax;
    const repsMax = repsMaxInput != null && repsMaxInput > repsMin ? repsMaxInput : null;

    const row = await prisma.programItem.update({
      where: { id: d.itemId },
      data: {
        ...(d.exerciseId ? { exerciseId: d.exerciseId } : {}),
        ...(d.targetSets !== undefined ? { targetSets: d.targetSets } : {}),
        targetRepsMin: repsMin,
        targetRepsMax: repsMax,
        ...(d.targetWeightKg !== undefined ? { targetWeightKg: d.targetWeightKg != null && d.targetWeightKg > 0 ? d.targetWeightKg : null } : {}),
        ...(d.restSeconds !== undefined ? { restSeconds: d.restSeconds } : {}),
        ...(d.note !== undefined ? { note: d.note } : {}),
      },
      include: { exercise: { select: EXERCISE_SELECT } },
    });
    await touchProgram(item.day.programId);
    return { ok: true, item: toProgramItemDTO(row) };
  });
}

export async function deleteItemAction(input: { itemId: string }): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = parse(itemIdSchema, input);
  if (!parsed.ok) return fail('invalid');

  return guard(async () => {
    const item = await prisma.programItem.findUnique({
      where: { id: parsed.data.itemId },
      select: { id: true, dayId: true, day: { select: { programId: true } } },
    });
    if (!item) return fail('notFound');
    const access = await loadProgramAccess(user, item.day.programId);
    if (!access.ok) return fail(access.error);
    const rest = await prisma.programItem.findMany({
      where: { dayId: item.dayId, id: { not: item.id } },
      orderBy: { order: 'asc' },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.programItem.delete({ where: { id: item.id } }),
      ...rest.map((r, i) => prisma.programItem.update({ where: { id: r.id }, data: { order: i + 1 } })),
    ]);
    await touchProgram(item.day.programId);
    return { ok: true };
  });
}

/** Set the order of a day's exercises: `orderedIds` must be exactly its item ids. */
export async function reorderItemsAction(input: { dayId: string; orderedIds: string[] }): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = parse(reorderItemsSchema, input);
  if (!parsed.ok) return fail('invalid');

  return guard(async () => {
    const day = await programIdOfDay(parsed.data.dayId);
    if (!day) return fail('notFound');
    const access = await loadProgramAccess(user, day.programId);
    if (!access.ok) return fail(access.error);
    const items = await prisma.programItem.findMany({ where: { dayId: day.id }, select: { id: true } });
    const ids = parsed.data.orderedIds;
    if (ids.length !== items.length || !items.every((i) => ids.includes(i.id)) || new Set(ids).size !== ids.length) {
      return fail('invalid');
    }
    await prisma.$transaction(ids.map((id, i) => prisma.programItem.update({ where: { id }, data: { order: i + 1 } })));
    await touchProgram(day.programId);
    return { ok: true };
  });
}
