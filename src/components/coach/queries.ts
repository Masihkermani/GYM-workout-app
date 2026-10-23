import 'server-only';
import type { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { addDaysToKey, startOfWeekKey, utcToZoned, wallClockToUtc } from '@/lib/time';
import { matchesClient, searchTokens, tokenVariants } from './search';

/** Read models for the coach pages. Pages call requireCoach() before using any of these. */

// ------------------------------------------------------------------------------------ clients

export type ClientStatusFilter = 'all' | 'active' | 'inactive';
export const CLIENT_SORTS = ['name', 'next', 'last', 'program', 'status'] as const;
export type ClientSort = (typeof CLIENT_SORTS)[number];
export type SortDir = 'asc' | 'desc';

export interface ClientRow {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  createdAt: Date;
  nextSession: { startsAt: Date; status: BookingStatus } | null;
  lastWorkoutAt: Date | null;
  programTitle: string | null;
}

export interface ClientsQuery {
  q: string;
  status: ClientStatusFilter;
  sort: ClientSort;
  dir: SortDir;
  locale: string;
  now?: Date;
}

export interface ClientsResult {
  rows: ClientRow[];
  counts: { all: number; active: number; inactive: number };
}

/** Empty values (no next session, never trained, no program) sort last whatever the direction. */
function compareNullable<T>(a: T | null, b: T | null, dir: number, cmp: (x: T, y: T) => number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir * cmp(a, b);
}

export async function listClients(query: ClientsQuery): Promise<ClientsResult> {
  const now = query.now ?? new Date();
  const users = await prisma.user.findMany({
    where: { role: 'CLIENT' },
    select: {
      id: true,
      name: true,
      phone: true,
      active: true,
      createdAt: true,
      bookings: {
        where: { status: { in: ['PENDING', 'CONFIRMED'] }, startsAt: { gte: now } },
        orderBy: { startsAt: 'asc' },
        take: 1,
        select: { startsAt: true, status: true },
      },
      workouts: { orderBy: { startedAt: 'desc' }, take: 1, select: { startedAt: true } },
      programs: { where: { active: true }, orderBy: { updatedAt: 'desc' }, take: 1, select: { title: true } },
    },
  });

  const all: ClientRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    active: u.active,
    createdAt: u.createdAt,
    nextSession: u.bookings[0] ?? null,
    lastWorkoutAt: u.workouts[0]?.startedAt ?? null,
    programTitle: u.programs[0]?.title ?? null,
  }));

  const counts = {
    all: all.length,
    active: all.filter((c) => c.active).length,
    inactive: all.filter((c) => !c.active).length,
  };

  const filtered = all.filter(
    (c) =>
      (query.status === 'all' || (query.status === 'active') === c.active) && matchesClient(c, query.q),
  );

  const collator = new Intl.Collator(query.locale === 'fa' ? 'fa' : 'en', { sensitivity: 'base', numeric: true });
  const dir = query.dir === 'asc' ? 1 : -1;
  const num = (x: number, y: number) => x - y;
  filtered.sort((a, b) => {
    const byName = collator.compare(a.name, b.name);
    switch (query.sort) {
      case 'next':
        return (
          compareNullable(a.nextSession?.startsAt.getTime() ?? null, b.nextSession?.startsAt.getTime() ?? null, dir, num) ||
          byName
        );
      case 'last':
        return (
          compareNullable(a.lastWorkoutAt?.getTime() ?? null, b.lastWorkoutAt?.getTime() ?? null, dir, num) || byName
        );
      case 'program':
        return compareNullable(a.programTitle, b.programTitle, dir, collator.compare) || byName;
      case 'status':
        return dir * (Number(b.active) - Number(a.active)) || byName;
      case 'name':
      default:
        return dir * byName;
    }
  });

  return { rows: filtered, counts };
}

export interface ClientDetail {
  id: string;
  name: string;
  phone: string;
  goal: string | null;
  coachNotes: string | null;
  active: boolean;
  locale: string;
  createdAt: Date;
}

/** One client (never a coach), without the password hash. null = unknown id. */
export async function getClientDetail(id: string): Promise<ClientDetail | null> {
  if (!id || id.length > 64) return null;
  return prisma.user.findFirst({
    where: { id, role: 'CLIENT' },
    select: { id: true, name: true, phone: true, goal: true, coachNotes: true, active: true, locale: true, createdAt: true },
  });
}

// ---------------------------------------------------------------------------------- dashboard

export interface DashboardStats {
  sessionsThisWeek: number;
  activeClients: number;
  pendingRequests: number;
}

/** The three numbers on the dashboard. "This week" follows the viewer's week start (Saturday for fa). */
export async function getDashboardStats(locale: string, timeZone: string, now = new Date()): Promise<DashboardStats> {
  const todayKey = utcToZoned(now, timeZone).dateKey;
  const startKey = startOfWeekKey(todayKey, locale);
  const from = wallClockToUtc(startKey, 0, timeZone);
  const to = wallClockToUtc(addDaysToKey(startKey, 7), 0, timeZone);

  const [sessionsThisWeek, activeClients, pendingRequests] = await Promise.all([
    prisma.booking.count({
      where: { startsAt: { gte: from, lt: to }, status: { in: ['CONFIRMED', 'COMPLETED'] } },
    }),
    prisma.user.count({ where: { role: 'CLIENT', active: true } }),
    prisma.booking.count({ where: { status: 'PENDING', startsAt: { gte: now } } }),
  ]);
  return { sessionsThisWeek, activeClients, pendingRequests };
}

// ----------------------------------------------------------------------------------- exercises

export const EXERCISE_PAGE_SIZE = 25;
export type ExerciseShow = 'active' | 'archived' | 'all';

export interface ExercisesQuery {
  q: string;
  bodyPart: string;
  equipment: string;
  custom: boolean;
  show: ExerciseShow;
  page: number;
  locale: string;
}

export interface ExerciseListItem {
  id: string;
  nameEn: string;
  nameFa: string | null;
  bodyPart: string;
  equipment: string;
  target: string;
  isCustom: boolean;
  archived: boolean;
}

export function exerciseWhere(q: ExercisesQuery): Prisma.ExerciseWhereInput {
  const and: Prisma.ExerciseWhereInput[] = [];
  // every word must match the English or the Persian name (word order does not matter)
  for (const token of searchTokens(q.q)) {
    and.push({
      OR: tokenVariants(token).flatMap((v) => [
        { nameEn: { contains: v, mode: 'insensitive' as const } },
        { nameFa: { contains: v, mode: 'insensitive' as const } },
      ]),
    });
  }
  if (q.bodyPart) and.push({ bodyPart: q.bodyPart });
  if (q.equipment) and.push({ equipment: q.equipment });
  if (q.custom) and.push({ isCustom: true });
  if (q.show === 'active') and.push({ archived: false });
  if (q.show === 'archived') and.push({ archived: true });
  return and.length ? { AND: and } : {};
}

/**
 * One page of the library, sorted in the viewer's language. The database cannot sort Persian
 * properly (it compares code points, so پ lands after ی), so the matching rows are ordered in
 * memory with Intl.Collator. The library is ~1.3k rows: a cheap id/name query, then one page fetch.
 */
export async function listExercises(q: ExercisesQuery): Promise<{ items: ExerciseListItem[]; total: number }> {
  const where = exerciseWhere(q);
  const names = await prisma.exercise.findMany({ where, select: { id: true, nameEn: true, nameFa: true } });

  const fa = q.locale === 'fa';
  const collator = new Intl.Collator(fa ? 'fa' : 'en', { sensitivity: 'base', numeric: true });
  const en = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  names.sort((a, b) => {
    if (fa) {
      // exercises without a Persian name sort last, English among themselves
      if (a.nameFa === null || b.nameFa === null) {
        if (a.nameFa !== null) return -1;
        if (b.nameFa !== null) return 1;
        return en.compare(a.nameEn, b.nameEn);
      }
      return collator.compare(a.nameFa, b.nameFa) || en.compare(a.nameEn, b.nameEn);
    }
    return collator.compare(a.nameEn, b.nameEn);
  });

  const ids = names.slice((q.page - 1) * EXERCISE_PAGE_SIZE, q.page * EXERCISE_PAGE_SIZE).map((n) => n.id);
  const rows = await prisma.exercise.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      nameEn: true,
      nameFa: true,
      bodyPart: true,
      equipment: true,
      target: true,
      isCustom: true,
      archived: true,
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items = ids.flatMap((id) => byId.get(id) ?? []);
  return { items, total: names.length };
}

export interface ExerciseDetail extends ExerciseListItem {
  stepsEn: string[];
  stepsFa: string[];
  usage: { sets: number; items: number };
}

export async function getExerciseDetail(id: string): Promise<ExerciseDetail | null> {
  if (!id || id.length > 64) return null;
  const e = await prisma.exercise.findUnique({
    where: { id },
    select: {
      id: true,
      nameEn: true,
      nameFa: true,
      bodyPart: true,
      equipment: true,
      target: true,
      isCustom: true,
      archived: true,
      stepsEn: true,
      stepsFa: true,
      _count: { select: { sets: true, items: true } },
    },
  });
  if (!e) return null;
  const { _count, ...rest } = e;
  return { ...rest, usage: { sets: _count.sets, items: _count.items } };
}

export interface Taxonomy {
  bodyParts: string[];
  equipment: string[];
  targets: string[];
}

export async function getTaxonomy(): Promise<Taxonomy> {
  const [bodyParts, equipment, targets] = await Promise.all([
    prisma.exercise.findMany({ distinct: ['bodyPart'], select: { bodyPart: true }, orderBy: { bodyPart: 'asc' } }),
    prisma.exercise.findMany({ distinct: ['equipment'], select: { equipment: true }, orderBy: { equipment: 'asc' } }),
    prisma.exercise.findMany({ distinct: ['target'], select: { target: true }, orderBy: { target: 'asc' } }),
  ]);
  return {
    bodyParts: bodyParts.map((r) => r.bodyPart),
    equipment: equipment.map((r) => r.equipment),
    targets: targets.map((r) => r.target),
  };
}
