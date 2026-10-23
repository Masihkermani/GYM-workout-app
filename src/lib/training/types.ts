/** Shapes shared by the pure training maths, the server layer and the client components. */

/** The minimum a set needs for the maths. Everything else is extra. */
export interface SetLike {
  reps: number;
  weightKg: number;
  isWarmup?: boolean;
}

/** A logged set with identity, used by replay / series helpers. */
export interface LoggedSetLike extends SetLike {
  id: string;
  exerciseId: string;
  workoutId: string;
  /** 1-based within (workout, exercise). */
  setIndex: number;
  /** Start of the workout the set belongs to (ISO string or Date). */
  workoutStartedAt: Date | string;
}

export type PrKind = 'e1rm' | 'weight';

export interface PrFlag {
  /** Beat the best estimated one-rep max. */
  e1rm: boolean;
  /** Beat the best weight previously lifted for exactly this many reps. */
  weight: boolean;
}

/** What the client has already done with one exercise (non-warm-up sets only). */
export interface PrBaseline {
  /** Best e1RM so far, null when nothing has an e1RM yet. */
  bestE1rm: number | null;
  /** reps -> heaviest weight lifted for exactly that many reps. */
  bestWeightByReps: Record<number, number>;
}

export interface SetDTO {
  id: string;
  exerciseId: string;
  setIndex: number;
  reps: number;
  weightKg: number;
  rpe: number | null;
  isWarmup: boolean;
  createdAt: string;
}

export interface ExerciseDTO {
  id: string;
  nameEn: string;
  nameFa: string | null;
  bodyPart: string;
  equipment: string;
  target: string;
}

/** `3 x 8-10 @ 30` as stored on a ProgramItem. */
export interface TargetDTO {
  sets: number;
  repsMin: number;
  repsMax: number | null;
  weightKg: number | null;
  restSeconds: number | null;
  note: string | null;
}

export type ExerciseNameSource = { nameEn: string; nameFa?: string | null };

/** Persian name in fa (falling back to English), English in en. */
export function exerciseName(ex: ExerciseNameSource, locale: string): string {
  return locale === 'fa' ? ((ex.nameFa && ex.nameFa.trim()) || ex.nameEn) : ex.nameEn;
}

/** The English name shown small under the Persian one (fa only, and only when it differs). */
export function exerciseSubName(ex: ExerciseNameSource, locale: string): string | null {
  if (locale !== 'fa') return null;
  const fa = ex.nameFa?.trim();
  return fa && fa !== ex.nameEn ? ex.nameEn : null;
}

/** Equipment that is loaded with plates on a bar: the logger shows the barbell diagram for these. */
export const BARBELL_EQUIPMENT = ['barbell', 'ez barbell', 'smith machine', 'olympic barbell', 'trap bar'] as const;

export function usesBarbell(equipment: string): boolean {
  return (BARBELL_EQUIPMENT as readonly string[]).includes(equipment.toLowerCase());
}

export function isBodyweight(equipment: string): boolean {
  return equipment.toLowerCase() === 'body weight';
}
