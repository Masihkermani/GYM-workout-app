/**
 * Data the development seed (`seed.ts`) and the production base seed (`seed-base.ts`) both load:
 * the weekly availability windows and the exercise library. No side effects on import.
 */
import { existsSync, readFileSync } from 'node:fs';
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
}

/**
 * Insert the exercise library (`data/exercises`). Idempotent: rows that exist are never touched
 * (coach edits survive a re-run); Persian names that are still empty are filled in.
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

  const all = await prisma.exercise.findMany({ select: { id: true, nameEn: true } });
  const byName = new Map<string, string>();
  for (const e of all) byName.set(e.nameEn.toLowerCase(), e.id);
  return { byName, total: all.length, expected: raw.length, withFa: withFa.length };
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
