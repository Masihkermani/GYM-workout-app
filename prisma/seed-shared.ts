/**
 * Data the development seed (`seed.ts`) and the production base seed (`seed-base.ts`) both load:
 * the weekly availability windows and the exercise library. No side effects on import.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma, type PrismaClient } from '@prisma/client';

/** JS weekday (0 = Sunday) -> [startMinute, endMinute][] in coach wall-clock time. Friday (5) is off. */
export const DEFAULT_WINDOWS: Record<number, [number, number][]> = {
  6: [
    [420, 660],
    [960, 1260],
  ],
  0: [
    [420, 660],
    [960, 1260],
  ],
  1: [
    [420, 660],
    [960, 1260],
  ],
  2: [
    [420, 660],
    [960, 1260],
  ],
  3: [
    [420, 660],
    [960, 1260],
  ],
  4: [[480, 720]],
};

export const DEFAULT_TIME_ZONE = 'Asia/Tehran';

/** The settings row's coach names until `create-coach` sets the real ones (same as the app's own fallback). */
export const PLACEHOLDER_COACH_NAME = 'Your Coach';
export const PLACEHOLDER_COACH_NAME_FA = 'مربی شما';

export const fixMojibake = (s: string) => s.replace(/в°/g, '°'); // "в°" -> "°" (UTF-8 read as cp1251 in the source data)
const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

interface RawExercise {
  id: string;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  steps: string[];
}

export interface ExerciseSeedResult {
  /** lower-case English name -> Exercise.id (what the demo programs look exercises up by) */
  byName: Map<string, string>;
  /** rows in the library after seeding */
  total: number;
  /** rows in the dataset files */
  expected: number;
  /** dataset rows that have a Persian name */
  withFa: number;
  /** Persian steps filled in this run (rows whose stepsFa was empty) */
  stepsFa: StepsFaResult;
  /** bundled demonstrations (data/exercise-media/open-media.json) */
  media: MediaSeedResult;
}

export interface StepsFaResult {
  /** a steps file was found */
  found: boolean;
  /** entries in the file */
  entries: number;
  /** exercises whose empty stepsFa was filled now */
  filled: number;
  /** entries ignored: unknown id, not a list of strings, or not as many steps as the English ones */
  skipped: number;
}

export interface MediaSeedResult {
  /** open-media.json was found and readable */
  found: boolean;
  entries: number;
  created: number;
  updated: number;
  /** BUNDLED_OPEN rows that are no longer in the file */
  removed: number;
  /** entries ignored: unknown exercise, no frames, or a frame file that is not in public/ */
  skipped: number;
}

const DATA_ROOT = join(__dirname, '..', 'data');
const PUBLIC_ROOT = join(__dirname, '..', 'public');

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * Persian steps. `data/exercises/steps.fa.json` is `{ "<sourceId>": ["step", ...] }` with as many steps as the
 * English ones; while it is not merged yet, `steps.fa.part1.json`, `steps.fa.part2.json`... are read and merged.
 * A missing file is not an error (the app then shows the English steps with a note).
 */
export function readStepsFa(root = join(DATA_ROOT, 'exercises')): Record<string, unknown> | null {
  const whole = join(root, 'steps.fa.json');
  if (existsSync(whole)) return readJson<Record<string, unknown>>(whole);
  if (!existsSync(root)) return null;
  const parts = readdirSync(root)
    .filter((f) => /^steps\.fa\.part\d+\.json$/.test(f))
    .sort();
  if (parts.length === 0) return null;
  return Object.assign({}, ...parts.map((f) => readJson<Record<string, unknown>>(join(root, f)) ?? {}));
}

/**
 * Fill `Exercise.stepsFa` from the Persian steps file. Only exercises whose `stepsFa` is still EMPTY are
 * written, so a coach's edit (or an earlier seed) is never overwritten; fixing a translation that was seeded
 * already is done in the coach's exercise editor. Entries that do not match the English steps one to one are
 * skipped, never half-applied.
 */
export async function seedStepsFa(prisma: PrismaClient, steps = readStepsFa()): Promise<StepsFaResult> {
  if (!steps) return { found: false, entries: 0, filled: 0, skipped: 0 };
  const exercises = await prisma.exercise.findMany({
    where: { sourceId: { not: null } },
    select: { id: true, sourceId: true, stepsEn: true, stepsFa: true },
  });
  const bySource = new Map(exercises.map((e) => [e.sourceId as string, e]));
  const todo: { id: string; stepsFa: string[] }[] = [];
  let skipped = 0;
  for (const [sourceId, value] of Object.entries(steps)) {
    const ex = bySource.get(sourceId);
    const ok =
      ex &&
      Array.isArray(value) &&
      value.length === ex.stepsEn.length &&
      value.length > 0 &&
      value.every((v) => typeof v === 'string' && v.trim().length > 0);
    if (!ok) {
      skipped += 1;
      continue;
    }
    if (ex.stepsFa.length === 0) todo.push({ id: ex.id, stepsFa: (value as string[]).map((v) => v.trim()) });
  }
  let filled = 0;
  for (let i = 0; i < todo.length; i += 100) {
    const results = await prisma.$transaction(
      todo
        .slice(i, i + 100)
        .map((t) => prisma.exercise.updateMany({ where: { id: t.id, stepsFa: { isEmpty: true } }, data: { stepsFa: t.stepsFa } })),
    );
    filled += results.reduce((n, r) => n + r.count, 0);
  }
  return { found: true, entries: Object.keys(steps).length, filled, skipped };
}

interface OpenMediaEntry {
  exerciseSourceId: string;
  source?: string;
  frames: string[];
  author?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
  sourceUrl?: string | null;
  modified?: boolean;
  recolorable?: boolean;
}

/**
 * Bundled open-licensed demonstrations (`data/exercise-media/open-media.json`, written by
 * scripts/media/build-everkinetic). Idempotent: a BUNDLED_OPEN row is identified by exercise + first frame,
 * created when missing, refreshed when its credit or frames changed, and removed when it is no longer in the
 * file. COACH and LICENSED rows are never touched. A missing file leaves everything as it is.
 */
export async function seedExerciseMedia(
  prisma: PrismaClient,
  opts: { file?: string; publicDir?: string; checkFiles?: boolean } = {},
): Promise<MediaSeedResult> {
  const file = opts.file ?? join(DATA_ROOT, 'exercise-media', 'open-media.json');
  const publicDir = opts.publicDir ?? PUBLIC_ROOT;
  const checkFiles = opts.checkFiles ?? true;
  const entries = existsSync(file) ? readJson<OpenMediaEntry[]>(file) : null;
  if (!Array.isArray(entries)) return { found: false, entries: 0, created: 0, updated: 0, removed: 0, skipped: 0 };

  const exercises = await prisma.exercise.findMany({ where: { sourceId: { not: null } }, select: { id: true, sourceId: true } });
  const bySource = new Map(exercises.map((e) => [e.sourceId as string, e.id]));
  const existing = await prisma.exerciseMedia.findMany({ where: { source: 'BUNDLED_OPEN' } });
  const existingByKey = new Map(existing.map((r) => [`${r.exerciseId}|${r.frames[0] ?? ''}`, r]));

  const wanted = new Set<string>();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const toCreate: Prisma.ExerciseMediaCreateManyInput[] = [];

  for (const e of entries) {
    const exerciseId = typeof e?.exerciseSourceId === 'string' ? bySource.get(e.exerciseSourceId) : undefined;
    const frames = Array.isArray(e?.frames) ? e.frames.filter((f) => typeof f === 'string' && f.startsWith('/')) : [];
    if (!exerciseId || frames.length === 0 || frames.length !== e.frames.length) {
      skipped += 1;
      continue;
    }
    if (checkFiles && !frames.every((f) => existsSync(join(publicDir, f)))) {
      skipped += 1;
      continue;
    }
    const key = `${exerciseId}|${frames[0]}`;
    if (wanted.has(key)) continue; // the same demonstration listed twice
    wanted.add(key);
    const data = {
      kind: frames.length > 1 ? ('FRAMES' as const) : ('IMAGE' as const),
      frames,
      author: e.author ?? null,
      license: e.license ?? null,
      licenseUrl: e.licenseUrl ?? null,
      sourceUrl: e.sourceUrl ?? null,
      modified: e.modified ?? false,
      recolorable: e.recolorable ?? true, // bundled art is transparent line art
    };
    const row = existingByKey.get(key);
    if (!row) {
      toCreate.push({ exerciseId, source: 'BUNDLED_OPEN', order: 0, ...data });
      created += 1;
    } else if (
      row.kind !== data.kind ||
      row.frames.join('\n') !== data.frames.join('\n') ||
      row.author !== data.author ||
      row.license !== data.license ||
      row.licenseUrl !== data.licenseUrl ||
      row.sourceUrl !== data.sourceUrl ||
      row.modified !== data.modified ||
      row.recolorable !== data.recolorable
    ) {
      await prisma.exerciseMedia.update({ where: { id: row.id }, data });
      updated += 1;
    }
  }
  for (let i = 0; i < toCreate.length; i += 500) await prisma.exerciseMedia.createMany({ data: toCreate.slice(i, i + 500) });

  const stale = existing.filter((r) => !wanted.has(`${r.exerciseId}|${r.frames[0] ?? ''}`)).map((r) => r.id);
  for (let i = 0; i < stale.length; i += 500) {
    await prisma.exerciseMedia.deleteMany({ where: { id: { in: stale.slice(i, i + 500) } } });
  }
  return { found: true, entries: entries.length, created, updated, removed: stale.length, skipped };
}

/**
 * Insert the exercise library (`data/exercises`). Idempotent: rows that exist are never touched
 * (coach edits survive a re-run); Persian names and Persian steps that are still empty are filled in, and the
 * bundled demonstrations are synced (seedExerciseMedia).
 */
export async function seedExercises(prisma: PrismaClient): Promise<ExerciseSeedResult> {
  const root = join(__dirname, '..', 'data', 'exercises');
  const raw = JSON.parse(readFileSync(join(root, 'exercises.en.json'), 'utf8')) as RawExercise[];
  const faPath = join(root, 'exercises.fa.json');
  const fa: Record<string, string> = existsSync(faPath) ? JSON.parse(readFileSync(faPath, 'utf8')) : {};

  const rows = raw.map((e) => ({
    sourceId: e.id,
    nameEn: capitalise(fixMojibake(e.name)),
    nameFa: fa[e.id] ?? null,
    bodyPart: e.bodyPart,
    equipment: e.equipment,
    target: e.target,
    secondaryMuscles: e.secondaryMuscles,
    stepsEn: e.steps,
    stepsFa: [] as string[],
  }));

  // insert what is missing (never overwrites coach edits on re-run) ...
  await prisma.exercise.createMany({ data: rows, skipDuplicates: true });

  // ... and fill Persian names that are still empty, in one statement per chunk
  const withFa = rows.filter((r) => r.nameFa);
  for (let i = 0; i < withFa.length; i += 500) {
    const chunk = withFa.slice(i, i + 500);
    await prisma.$executeRaw`
      UPDATE "Exercise" AS e SET "nameFa" = v.name
      FROM (VALUES ${Prisma.join(chunk.map((r) => Prisma.sql`(${r.sourceId}, ${r.nameFa})`))}) AS v(id, name)
      WHERE e."sourceId" = v.id AND e."nameFa" IS NULL`;
  }

  const stepsFa = await seedStepsFa(prisma);
  const media = await seedExerciseMedia(prisma);

  const all = await prisma.exercise.findMany({ select: { id: true, nameEn: true } });
  const byName = new Map<string, string>();
  for (const e of all) byName.set(e.nameEn.toLowerCase(), e.id);
  return { byName, total: all.length, expected: raw.length, withFa: withFa.length, stepsFa, media };
}

export interface BaseSeedResult {
  settingsCreated: boolean;
  availabilityCreated: number;
  exercises: ExerciseSeedResult;
}

/**
 * The data a fresh production database needs and nothing else (no users):
 *  - the settings row, with the same placeholder names the app falls back to (`create-coach` sets the real
 *    ones); an existing row is never touched,
 *  - the default weekly availability, only while there are no availability rules at all,
 *  - the exercise library with its Persian names.
 * Safe to run again at any time: it never overwrites what the coach has since changed.
 */
export async function seedBase(prisma: PrismaClient): Promise<BaseSeedResult> {
  const existing = await prisma.coachSettings.findUnique({ where: { id: 1 }, select: { id: true } });
  await prisma.coachSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      coachName: PLACEHOLDER_COACH_NAME,
      coachNameFa: PLACEHOLDER_COACH_NAME_FA,
      timezone: DEFAULT_TIME_ZONE,
    },
  });

  let availabilityCreated = 0;
  if ((await prisma.availabilityRule.count()) === 0) {
    const data = Object.entries(DEFAULT_WINDOWS).flatMap(([weekday, windows]) =>
      windows.map(([startMinute, endMinute]) => ({ weekday: Number(weekday), startMinute, endMinute })),
    );
    availabilityCreated = (await prisma.availabilityRule.createMany({ data })).count;
  }

  const exercises = await seedExercises(prisma);
  return { settingsCreated: !existing, availabilityCreated, exercises };
}
