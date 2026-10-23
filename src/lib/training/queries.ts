import 'server-only';
import { cache } from 'react';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCoachSettings } from '@/lib/settings';
import { formatDate } from '@/lib/format';
import { todayKey, utcToZoned } from '@/lib/time';
import { epleyE1rm, round1 } from './e1rm';
import { buildBaseline, bestSet } from './prs';
import { selectLastTime } from './prefill';
import { e1rmSeries, replayPrs, prHistory, bestByRepCount, type PrEntry } from './series';
import { totalVolume, workingSetCount } from './volume';
import { weeklyVolume, type WeeklyBucket } from './weekly';
import type {
  DetailSetDTO,
  ExerciseContext,
  LoggerData,
  LoggerExercise,
  ProgramDTO,
  ProgramItemDTO,
  ProgressExerciseOption,
  WorkoutDetailDTO,
  WorkoutSummaryDTO,
} from './dto';
import type { ExerciseDTO, LoggedSetLike, PrFlag, SetDTO } from './types';

const num = (d: Prisma.Decimal | number | null | undefined): number => (d == null ? 0 : Number(d));
const numOrNull = (d: Prisma.Decimal | number | null | undefined): number | null => (d == null ? null : Number(d));

export const EXERCISE_SELECT = {
  id: true,
  nameEn: true,
  nameFa: true,
  bodyPart: true,
  equipment: true,
  target: true,
} satisfies Prisma.ExerciseSelect;

export type ExerciseRow = Prisma.ExerciseGetPayload<{ select: typeof EXERCISE_SELECT }>;
export const toExerciseDTO = (e: ExerciseRow): ExerciseDTO => ({ ...e });

// ---------------------------------------------------------------------------------------- history

/** Every set a client ever logged, oldest first. One query; memoised for the request. */
export const getClientHistory = cache(async (clientId: string): Promise<LoggedSetLike[]> => {
  const rows = await prisma.setLog.findMany({
    where: { workout: { clientId } },
    select: {
      id: true,
      exerciseId: true,
      workoutId: true,
      setIndex: true,
      reps: true,
      weightKg: true,
      isWarmup: true,
      workout: { select: { startedAt: true } },
    },
    orderBy: [{ workout: { startedAt: 'asc' } }, { setIndex: 'asc' }, { id: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    exerciseId: r.exerciseId,
    workoutId: r.workoutId,
    setIndex: r.setIndex,
    reps: r.reps,
    weightKg: num(r.weightKg),
    isWarmup: r.isWarmup,
    workoutStartedAt: r.workout.startedAt,
  }));
});

const getClientPrFlags = cache(async (clientId: string) => replayPrs(await getClientHistory(clientId)));

const WORKOUT_SELECT = {
  id: true,
  clientId: true,
  startedAt: true,
  finishedAt: true,
  note: true,
  programDay: { select: { title: true, program: { select: { title: true } } } },
} satisfies Prisma.WorkoutLogSelect;

type WorkoutRow = Prisma.WorkoutLogGetPayload<{ select: typeof WORKOUT_SELECT }>;

function summarize(row: WorkoutRow, sets: readonly LoggedSetLike[], flags: Map<string, PrFlag>): WorkoutSummaryDTO {
  const mine = sets.filter((s) => s.workoutId === row.id);
  return {
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    dayTitle: row.programDay?.title ?? null,
    programTitle: row.programDay?.program.title ?? null,
    note: row.note,
    setCount: workingSetCount(mine),
    volume: totalVolume(mine),
    exerciseCount: new Set(mine.filter((s) => !s.isWarmup).map((s) => s.exerciseId)).size,
    prCount: mine.filter((s) => flags.has(s.id)).length,
    durationSec: row.finishedAt ? Math.max(0, Math.round((row.finishedAt.getTime() - row.startedAt.getTime()) / 1000)) : null,
  };
}

export async function listWorkoutSummaries(
  clientId: string,
  opts: { take?: number; skip?: number } = {},
): Promise<{ items: WorkoutSummaryDTO[]; total: number }> {
  const { take = 20, skip = 0 } = opts;
  const [rows, total, history, flags] = await Promise.all([
    prisma.workoutLog.findMany({
      where: { clientId },
      select: WORKOUT_SELECT,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take,
      skip,
    }),
    prisma.workoutLog.count({ where: { clientId } }),
    getClientHistory(clientId),
    getClientPrFlags(clientId),
  ]);
  return { items: rows.map((r) => summarize(r, history, flags)), total };
}

export async function getWorkoutSummary(workoutId: string): Promise<WorkoutSummaryDTO | null> {
  const row = await prisma.workoutLog.findUnique({ where: { id: workoutId }, select: WORKOUT_SELECT });
  if (!row) return null;
  const [history, flags] = await Promise.all([getClientHistory(row.clientId), getClientPrFlags(row.clientId)]);
  return summarize(row, history, flags);
}

export async function getWorkoutDetail(workoutId: string): Promise<WorkoutDetailDTO | null> {
  const row = await prisma.workoutLog.findUnique({
    where: { id: workoutId },
    select: {
      ...WORKOUT_SELECT,
      client: { select: { name: true } },
      programDayId: true,
      sets: {
        orderBy: [{ setIndex: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          exerciseId: true,
          setIndex: true,
          reps: true,
          weightKg: true,
          rpe: true,
          isWarmup: true,
          createdAt: true,
          exercise: { select: EXERCISE_SELECT },
        },
      },
    },
  });
  if (!row) return null;
  const [history, flags] = await Promise.all([getClientHistory(row.clientId), getClientPrFlags(row.clientId)]);
  const summary = summarize(row, history, flags);

  // target per exercise from the program day (if any)
  const items = row.programDayId
    ? await prisma.programItem.findMany({ where: { dayId: row.programDayId }, orderBy: { order: 'asc' } })
    : [];
  const targetOf = (exerciseId: string): LoggerExercise['target'] => {
    const it = items.find((i) => i.exerciseId === exerciseId);
    return it
      ? {
          itemId: it.id,
          sets: it.targetSets,
          repsMin: it.targetRepsMin,
          repsMax: it.targetRepsMax,
          weightKg: numOrNull(it.targetWeightKg),
          restSeconds: it.restSeconds,
          note: it.note,
        }
      : null;
  };

  const order: string[] = [];
  const groups = new Map<string, { exercise: ExerciseDTO; sets: DetailSetDTO[] }>();
  // program order first, then anything extra in the order it was logged
  for (const it of items) order.push(it.exerciseId);
  for (const s of row.sets) if (!order.includes(s.exerciseId)) order.push(s.exerciseId);
  for (const s of row.sets) {
    const g = groups.get(s.exerciseId) ?? { exercise: toExerciseDTO(s.exercise), sets: [] };
    const w = num(s.weightKg);
    g.sets.push({
      id: s.id,
      exerciseId: s.exerciseId,
      setIndex: s.setIndex,
      reps: s.reps,
      weightKg: w,
      rpe: numOrNull(s.rpe),
      isWarmup: s.isWarmup,
      createdAt: s.createdAt.toISOString(),
      e1rm: s.isWarmup ? null : epleyE1rm(w, s.reps),
      pr: flags.get(s.id) ?? null,
    });
    groups.set(s.exerciseId, g);
  }
  return {
    ...summary,
    clientId: row.clientId,
    clientName: row.client.name,
    exercises: order
      .filter((id) => groups.has(id))
      .map((id) => ({ ...groups.get(id)!, target: targetOf(id) })),
  };
}

// ---------------------------------------------------------------------------------- live logging

/** Last time + PR baseline for the given exercises, from this client's OTHER workouts. */
export async function getExerciseContexts(
  clientId: string,
  exerciseIds: readonly string[],
  excludeWorkoutId: string | null,
  fmt: { locale: string; timeZone: string },
): Promise<Record<string, ExerciseContext>> {
  const out: Record<string, ExerciseContext> = {};
  if (exerciseIds.length === 0) return out;
  const rows = await prisma.setLog.findMany({
    where: {
      exerciseId: { in: [...exerciseIds] },
      workout: { clientId, ...(excludeWorkoutId ? { id: { not: excludeWorkoutId } } : {}) },
    },
    select: {
      exerciseId: true,
      workoutId: true,
      setIndex: true,
      reps: true,
      weightKg: true,
      rpe: true,
      isWarmup: true,
      workout: { select: { startedAt: true } },
    },
  });
  for (const id of exerciseIds) {
    const mine = rows
      .filter((r) => r.exerciseId === id)
      .map((r) => ({
        workoutId: r.workoutId,
        workoutStartedAt: r.workout.startedAt,
        setIndex: r.setIndex,
        reps: r.reps,
        weightKg: num(r.weightKg),
        rpe: numOrNull(r.rpe),
        isWarmup: r.isWarmup,
      }));
    const last = selectLastTime(mine);
    out[id] = {
      lastTime: last
        ? {
            date: (last.startedAt instanceof Date ? last.startedAt : new Date(last.startedAt)).toISOString(),
            dateLabel: formatDate(last.startedAt, fmt.locale, { style: 'short', timeZone: fmt.timeZone }),
            sets: last.sets.map((s) => ({ reps: s.reps, weightKg: s.weightKg, rpe: s.rpe ?? null })),
          }
        : null,
      baseline: buildBaseline(mine),
    };
  }
  return out;
}

export async function getLoggerData(workoutId: string, locale: string): Promise<LoggerData | null> {
  const [row, settings] = await Promise.all([
    prisma.workoutLog.findUnique({
      where: { id: workoutId },
      select: {
        id: true,
        clientId: true,
        startedAt: true,
        finishedAt: true,
        note: true,
        client: { select: { name: true } },
        programDay: {
          select: {
            title: true,
            program: { select: { title: true } },
            items: { orderBy: { order: 'asc' }, include: { exercise: { select: EXERCISE_SELECT } } },
          },
        },
        sets: {
          orderBy: [{ setIndex: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            exerciseId: true,
            setIndex: true,
            reps: true,
            weightKg: true,
            rpe: true,
            isWarmup: true,
            createdAt: true,
            exercise: { select: EXERCISE_SELECT },
          },
        },
      },
    }),
    getCoachSettings(),
  ]);
  if (!row) return null;

  const exercises: LoggerExercise[] = [];
  const seen = new Set<string>();
  for (const it of row.programDay?.items ?? []) {
    if (seen.has(it.exerciseId)) continue; // the same lift twice in a day shares one set run
    seen.add(it.exerciseId);
    exercises.push({
      exercise: toExerciseDTO(it.exercise),
      target: {
        itemId: it.id,
        sets: it.targetSets,
        repsMin: it.targetRepsMin,
        repsMax: it.targetRepsMax,
        weightKg: numOrNull(it.targetWeightKg),
        restSeconds: it.restSeconds,
        note: it.note,
      },
    });
  }
  for (const s of row.sets) {
    if (seen.has(s.exerciseId)) continue;
    seen.add(s.exerciseId);
    exercises.push({ exercise: toExerciseDTO(s.exercise), target: null });
  }

  const contexts = await getExerciseContexts(
    row.clientId,
    exercises.map((e) => e.exercise.id),
    row.id,
    { locale, timeZone: settings.timezone },
  );

  const sets: SetDTO[] = row.sets.map((s) => ({
    id: s.id,
    exerciseId: s.exerciseId,
    setIndex: s.setIndex,
    reps: s.reps,
    weightKg: num(s.weightKg),
    rpe: numOrNull(s.rpe),
    isWarmup: s.isWarmup,
    createdAt: s.createdAt.toISOString(),
  }));

  return {
    workoutId: row.id,
    clientId: row.clientId,
    clientName: row.client.name,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    note: row.note,
    dayTitle: row.programDay?.title ?? null,
    programTitle: row.programDay?.program.title ?? null,
    exercises,
    sets,
    contexts,
    dateLabel: formatDate(row.startedAt, locale, { style: 'long', timeZone: settings.timezone }),
    barKg: settings.barKg,
    timeZone: settings.timezone,
    serverNow: new Date().toISOString(),
  };
}

// --------------------------------------------------------------------------------------- programs

const PROGRAM_INCLUDE = {
  client: { select: { name: true } },
  author: { select: { name: true, role: true } },
  days: {
    orderBy: { order: 'asc' },
    include: { items: { orderBy: { order: 'asc' }, include: { exercise: { select: EXERCISE_SELECT } } } },
  },
} satisfies Prisma.ProgramInclude;

type ProgramRow = Prisma.ProgramGetPayload<{ include: typeof PROGRAM_INCLUDE }>;

export function toProgramItemDTO(it: ProgramRow['days'][number]['items'][number]): ProgramItemDTO {
  return {
    id: it.id,
    order: it.order,
    exercise: toExerciseDTO(it.exercise),
    targetSets: it.targetSets,
    targetRepsMin: it.targetRepsMin,
    targetRepsMax: it.targetRepsMax,
    targetWeightKg: numOrNull(it.targetWeightKg),
    restSeconds: it.restSeconds,
    note: it.note,
  };
}

function toProgramDTO(p: ProgramRow): ProgramDTO {
  return {
    id: p.id,
    clientId: p.clientId,
    clientName: p.client.name,
    authorId: p.authorId,
    authorName: p.author.name,
    authorRole: p.author.role,
    title: p.title,
    notes: p.notes,
    active: p.active,
    updatedAt: p.updatedAt.toISOString(),
    days: p.days.map((d) => ({ id: d.id, order: d.order, title: d.title, items: d.items.map(toProgramItemDTO) })),
  };
}

export async function getProgram(programId: string): Promise<ProgramDTO | null> {
  const row = await prisma.program.findUnique({ where: { id: programId }, include: PROGRAM_INCLUDE });
  return row ? toProgramDTO(row) : null;
}

export async function listPrograms(clientId: string, opts: { active?: boolean } = {}): Promise<ProgramDTO[]> {
  const rows = await prisma.program.findMany({
    where: { clientId, ...(opts.active == null ? {} : { active: opts.active }) },
    include: PROGRAM_INCLUDE,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  });
  return rows.map(toProgramDTO);
}

// ------------------------------------------------------------------------------------------ Today

export interface NextDayInfo {
  program: ProgramDTO;
  day: ProgramDTO['days'][number];
  /** Day number within the program (1-based). */
  dayNumber: number;
  /** A workout was already finished today (coach timezone). */
  trainedToday: boolean;
  /** Last time this day was trained. */
  lastDoneAt: string | null;
}

export interface OpenWorkoutInfo {
  id: string;
  startedAt: string;
  dayTitle: string | null;
  setCount: number;
}

export async function getOpenWorkout(clientId: string, maxAgeHours = 14): Promise<OpenWorkoutInfo | null> {
  const since = new Date(Date.now() - maxAgeHours * 3600_000);
  const row = await prisma.workoutLog.findFirst({
    where: { clientId, finishedAt: null, startedAt: { gte: since } },
    orderBy: { startedAt: 'desc' },
    select: { id: true, startedAt: true, programDay: { select: { title: true } }, _count: { select: { sets: true } } },
  });
  return row
    ? { id: row.id, startedAt: row.startedAt.toISOString(), dayTitle: row.programDay?.title ?? null, setCount: row._count.sets }
    : null;
}

/**
 * The next program day to train: in the program of the latest workout (or the coach's active one),
 * the day after the one trained last, wrapping around.
 */
export async function getNextProgramDay(clientId: string, timeZone: string): Promise<NextDayInfo | null> {
  const programs = await listPrograms(clientId, { active: true });
  const withDays = programs.filter((p) => p.days.length > 0);
  if (withDays.length === 0) return null;

  const logs = await prisma.workoutLog.findMany({
    where: { clientId, programDayId: { not: null } },
    orderBy: { startedAt: 'desc' },
    take: 30,
    select: { programDayId: true, startedAt: true, finishedAt: true },
  });
  const dayToProgram = new Map<string, ProgramDTO>();
  for (const p of withDays) for (const d of p.days) dayToProgram.set(d.id, p);

  const latest = logs.find((l) => l.programDayId && dayToProgram.has(l.programDayId));
  const program = latest ? dayToProgram.get(latest.programDayId!)! : (withDays.find((p) => p.authorRole === 'COACH') ?? withDays[0]);

  let dayIndex = 0;
  if (latest) {
    const at = program.days.findIndex((d) => d.id === latest.programDayId);
    dayIndex = (at + 1) % program.days.length;
  }
  const day = program.days[dayIndex];

  const today = todayKey(timeZone);
  const trainedToday = logs.some(
    (l) => l.finishedAt && utcToZoned(l.startedAt, timeZone).dateKey === today && dayToProgram.has(l.programDayId!),
  );
  const lastOfThisDay = logs.find((l) => l.programDayId === day.id);

  return {
    program,
    day,
    dayNumber: dayIndex + 1,
    trainedToday,
    lastDoneAt: lastOfThisDay?.startedAt.toISOString() ?? null,
  };
}

/** A confirmed booking happening about now with no workout attached yet: the workout links to it. */
export async function getLinkableBooking(clientId: string): Promise<string | null> {
  const now = Date.now();
  const row = await prisma.booking.findFirst({
    where: {
      clientId,
      status: 'CONFIRMED',
      workout: null,
      startsAt: { gte: new Date(now - 3 * 3600_000), lte: new Date(now + 3 * 3600_000) },
    },
    orderBy: { startsAt: 'asc' },
    select: { id: true },
  });
  return row?.id ?? null;
}

export interface RecentPrInfo {
  exercise: ExerciseDTO;
  reps: number;
  weightKg: number;
  e1rm: number | null;
  date: string;
  workoutId: string;
  flag: PrFlag;
}

/** The newest PR in the last `days` days (the one with the biggest e1RM if several share a workout). */
export async function getRecentPr(clientId: string, days = 21): Promise<RecentPrInfo | null> {
  const [history, flags] = await Promise.all([getClientHistory(clientId), getClientPrFlags(clientId)]);
  const since = Date.now() - days * 86400_000;
  let best: LoggedSetLike | null = null;
  let bestKey = -1;
  for (const s of history) {
    if (!flags.has(s.id)) continue;
    const t = (s.workoutStartedAt instanceof Date ? s.workoutStartedAt : new Date(s.workoutStartedAt)).getTime();
    if (t < since) continue;
    const key = t + (epleyE1rm(s.weightKg, s.reps) ?? 0) / 1000;
    if (key > bestKey) {
      best = s;
      bestKey = key;
    }
  }
  if (!best) return null;
  const ex = await prisma.exercise.findUnique({ where: { id: best.exerciseId }, select: EXERCISE_SELECT });
  if (!ex) return null;
  return {
    exercise: toExerciseDTO(ex),
    reps: best.reps,
    weightKg: best.weightKg,
    e1rm: epleyE1rm(best.weightKg, best.reps),
    date: (best.workoutStartedAt instanceof Date ? best.workoutStartedAt : new Date(best.workoutStartedAt)).toISOString(),
    workoutId: best.workoutId,
    flag: flags.get(best.id)!,
  };
}

// ----------------------------------------------------------------------------------------- progress

export async function getProgressOptions(clientId: string): Promise<ProgressExerciseOption[]> {
  const history = await getClientHistory(clientId);
  const stats = new Map<string, { workouts: Set<string>; last: number }>();
  for (const s of history) {
    if (s.isWarmup) continue;
    const t = (s.workoutStartedAt instanceof Date ? s.workoutStartedAt : new Date(s.workoutStartedAt)).getTime();
    const e = stats.get(s.exerciseId) ?? { workouts: new Set<string>(), last: 0 };
    e.workouts.add(s.workoutId);
    e.last = Math.max(e.last, t);
    stats.set(s.exerciseId, e);
  }
  if (stats.size === 0) return [];
  const exercises = await prisma.exercise.findMany({ where: { id: { in: [...stats.keys()] } }, select: EXERCISE_SELECT });
  return exercises
    .map((ex) => {
      const st = stats.get(ex.id)!;
      return { exercise: toExerciseDTO(ex), workouts: st.workouts.size, lastDate: new Date(st.last).toISOString() };
    })
    .sort((a, b) => b.workouts - a.workouts || b.lastDate.localeCompare(a.lastDate));
}

export interface ProgressData {
  options: ProgressExerciseOption[];
  selected: ProgressExerciseOption | null;
  series: ReturnType<typeof e1rmSeries>;
  prs: PrEntry[];
  repBests: { reps: number; weightKg: number }[];
  bestE1rm: number | null;
  firstE1rm: number | null;
  weekly: WeeklyBucket[];
}

export async function getProgressData(
  clientId: string,
  exerciseId: string | null,
  opts: { locale: string; timeZone: string; weeks?: number },
): Promise<ProgressData> {
  const [options, history] = await Promise.all([getProgressOptions(clientId), getClientHistory(clientId)]);
  const selected = options.find((o) => o.exercise.id === exerciseId) ?? options[0] ?? null;
  const mine = selected ? history.filter((s) => s.exerciseId === selected.exercise.id) : [];
  const series = e1rmSeries(mine);
  const weekly = weeklyVolume(history, { weeks: opts.weeks ?? 10, locale: opts.locale, timeZone: opts.timeZone });
  return {
    options,
    selected,
    series,
    prs: prHistory(mine),
    repBests: bestByRepCount(mine),
    bestE1rm: series.length ? Math.max(...series.map((p) => p.e1rm)) : null,
    firstE1rm: series.length ? series[0].e1rm : null,
    weekly,
  };
}

// ----------------------------------------------------------------------------------- coach widgets

export interface FeedItem {
  key: string;
  clientId: string;
  clientName: string;
  exercise: ExerciseDTO;
  reps: number;
  weightKg: number;
  at: string;
  isPr: boolean;
}

/** Latest exercises logged across all clients (one row per client + workout + exercise). */
export async function getRecentSetFeed(limit: number): Promise<FeedItem[]> {
  const rows = await prisma.setLog.findMany({
    where: { isWarmup: false, workout: { client: { role: 'CLIENT' } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: Math.max(limit * 24, 60),
    select: {
      id: true,
      workoutId: true,
      exerciseId: true,
      reps: true,
      weightKg: true,
      createdAt: true,
      exercise: { select: EXERCISE_SELECT },
      workout: { select: { clientId: true, client: { select: { name: true } } } },
    },
  });
  const groups = new Map<string, { rows: typeof rows; first: (typeof rows)[number] }>();
  for (const r of rows) {
    const key = `${r.workoutId}:${r.exerciseId}`;
    const g = groups.get(key);
    if (g) g.rows.push(r);
    else if (groups.size < limit) groups.set(key, { rows: [r], first: r });
    else break;
  }
  const picked = [...groups.entries()].slice(0, limit);

  // PR flags for the clients involved (to stamp record sets in the feed)
  const clientIds = [...new Set(picked.map(([, g]) => g.first.workout.clientId))];
  const flagMaps = new Map<string, Map<string, PrFlag>>();
  await Promise.all(
    clientIds.map(async (id) => {
      flagMaps.set(id, await getClientPrFlags(id));
    }),
  );

  return picked.map(([key, g]) => {
    const best = bestSet(g.rows.map((r) => ({ reps: r.reps, weightKg: num(r.weightKg), id: r.id })))!;
    const flags = flagMaps.get(g.first.workout.clientId);
    return {
      key,
      clientId: g.first.workout.clientId,
      clientName: g.first.workout.client.name,
      exercise: toExerciseDTO(g.first.exercise),
      reps: best.reps,
      weightKg: best.weightKg,
      at: g.first.createdAt.toISOString(),
      isPr: g.rows.some((r) => flags?.has(r.id)),
    };
  });
}

export interface IdleClient {
  id: string;
  name: string;
  /** null = never trained. */
  lastWorkoutAt: string | null;
  daysIdle: number | null;
}

export async function getIdleClients(days: number): Promise<IdleClient[]> {
  const [clients, last] = await Promise.all([
    prisma.user.findMany({ where: { role: 'CLIENT', active: true }, select: { id: true, name: true, createdAt: true } }),
    prisma.workoutLog.groupBy({ by: ['clientId'], _max: { startedAt: true } }),
  ]);
  const lastBy = new Map(last.map((l) => [l.clientId, l._max.startedAt]));
  const now = Date.now();
  const out: IdleClient[] = [];
  for (const c of clients) {
    const at = lastBy.get(c.id) ?? null;
    const daysIdle = at ? Math.floor((now - at.getTime()) / 86400_000) : null;
    if (at && daysIdle! < days) continue;
    // a brand-new client who has not had time to train yet is not "idle"
    if (!at && now - c.createdAt.getTime() < days * 86400_000) continue;
    out.push({ id: c.id, name: c.name, lastWorkoutAt: at?.toISOString() ?? null, daysIdle });
  }
  return out.sort((a, b) => (b.daysIdle ?? 1e9) - (a.daysIdle ?? 1e9) || a.name.localeCompare(b.name));
}

export interface TopLift {
  exercise: ExerciseDTO;
  current: number;
  delta: number | null;
  points: number[];
}

export async function getClientTrainingOverview(clientId: string, opts: { locale: string; timeZone: string }) {
  const [programs, workouts, history] = await Promise.all([
    listPrograms(clientId),
    listWorkoutSummaries(clientId, { take: 5 }),
    getClientHistory(clientId),
  ]);

  // the recent workouts' sets, for the expandable readout
  const ids = workouts.items.map((w) => w.id);
  const setRows = ids.length
    ? await prisma.setLog.findMany({
        where: { workoutId: { in: ids } },
        orderBy: [{ setIndex: 'asc' }, { createdAt: 'asc' }],
        select: {
          workoutId: true,
          exerciseId: true,
          reps: true,
          weightKg: true,
          isWarmup: true,
          exercise: { select: EXERCISE_SELECT },
        },
      })
    : [];
  const byWorkout = new Map<string, { exercise: ExerciseDTO; sets: { reps: number; weightKg: number; isWarmup: boolean }[] }[]>();
  for (const r of setRows) {
    const list = byWorkout.get(r.workoutId) ?? [];
    let g = list.find((x) => x.exercise.id === r.exerciseId);
    if (!g) {
      g = { exercise: toExerciseDTO(r.exercise), sets: [] };
      list.push(g);
    }
    g.sets.push({ reps: r.reps, weightKg: num(r.weightKg), isWarmup: r.isWarmup });
    byWorkout.set(r.workoutId, list);
  }

  // top lifts: the three most trained exercises, with their e1RM trend
  const counts = new Map<string, Set<string>>();
  for (const s of history) {
    if (s.isWarmup) continue;
    const set = counts.get(s.exerciseId) ?? new Set<string>();
    set.add(s.workoutId);
    counts.set(s.exerciseId, set);
  }
  const topIds = [...counts.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 3)
    .map(([id]) => id);
  const exs = topIds.length ? await prisma.exercise.findMany({ where: { id: { in: topIds } }, select: EXERCISE_SELECT }) : [];
  const lifts: TopLift[] = [];
  for (const id of topIds) {
    const ex = exs.find((e) => e.id === id);
    if (!ex) continue;
    const series = e1rmSeries(history.filter((s) => s.exerciseId === id));
    if (series.length === 0) continue;
    const current = series[series.length - 1].e1rm;
    const fourWeeksAgo = Date.now() - 28 * 86400_000;
    const before = series.filter((p) => new Date(p.date).getTime() <= fourWeeksAgo);
    const ref = before.length ? before[before.length - 1].e1rm : series.length > 1 ? series[0].e1rm : null;
    lifts.push({
      exercise: toExerciseDTO(ex),
      current: round1(current),
      delta: ref != null ? round1(current - ref) : null,
      points: series.slice(-12).map((p) => p.e1rm),
    });
  }

  return {
    programs,
    workouts: workouts.items.map((w) => ({ ...w, exercises: byWorkout.get(w.id) ?? [] })),
    totalWorkouts: workouts.total,
    lifts,
    weekly: weeklyVolume(history, { weeks: 8, locale: opts.locale, timeZone: opts.timeZone }),
  };
}
