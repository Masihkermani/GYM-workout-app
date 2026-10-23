import { z } from 'zod';
import { parseDecimal, parseInteger } from '../digits';
import { normalizePersianText } from '../validation';

/**
 * Input schemas for the training server actions. Numbers may arrive as numbers or as strings typed
 * on any keyboard (`۳۰`, `٣٠`, `2٫5`); strings go through src/lib/digits.ts first. Error messages
 * are stable codes, never prose.
 */

const rawNumber = z.union([z.number(), z.string()]);

/** A decimal in [min, max] from a number or a user-typed string. */
export const decimal = (min: number, max: number) =>
  rawNumber.transform((v, ctx) => {
    const n = typeof v === 'number' ? v : parseDecimal(v);
    if (n == null || !Number.isFinite(n) || n < min || n > max) {
      ctx.addIssue({ code: 'custom', message: 'invalid' });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

/** A whole number in [min, max] from a number or a user-typed string. */
export const integer = (min: number, max: number) =>
  rawNumber.transform((v, ctx) => {
    const n = typeof v === 'number' ? v : parseInteger(v);
    if (n == null || !Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: 'custom', message: 'invalid' });
      return z.NEVER;
    }
    return n;
  });

/** null / '' / undefined -> null, otherwise validated. */
const nullable = <T extends z.ZodType>(inner: T) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), inner.nullable());

const id = z.string().min(1).max(64);

export const text = (max: number) =>
  z
    .string()
    .transform((s) => normalizePersianText(s))
    .pipe(z.string().max(max));

/** Free text that may contain line breaks (notes): only Arabic letters and trailing space are cleaned. */
export const multiline = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim())
    .pipe(z.string().max(max));

export const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

// ------------------------------------------------------------------------------------------ workouts
export const startWorkoutSchema = z.object({
  dayId: nullable(id).optional(),
  bookingId: nullable(id).optional(),
  /** Coach logging for a client; ignored (must equal self) for a client. */
  clientId: nullable(id).optional(),
});

export const logSetSchema = z.object({
  workoutId: id,
  exerciseId: id,
  reps: integer(1, 200),
  weightKg: decimal(0, 1000),
  rpe: nullable(decimal(1, 10)).optional(),
  isWarmup: z.boolean().optional(),
});

export const updateSetSchema = z.object({
  setId: id,
  reps: integer(1, 200).optional(),
  weightKg: decimal(0, 1000).optional(),
  rpe: nullable(decimal(1, 10)).optional(),
  isWarmup: z.boolean().optional(),
});

export const deleteSetSchema = z.object({ setId: id });

export const restoreSetSchema = z.object({
  workoutId: id,
  exerciseId: id,
  setIndex: integer(1, 500),
  reps: integer(1, 200),
  weightKg: decimal(0, 1000),
  rpe: nullable(decimal(1, 10)).optional(),
  isWarmup: z.boolean().optional(),
});

export const finishWorkoutSchema = z.object({
  workoutId: id,
  note: multiline(1000).optional(),
});

export const workoutNoteSchema = z.object({ workoutId: id, note: multiline(1000) });
export const workoutIdSchema = z.object({ workoutId: id });

export const exerciseSearchSchema = z.object({
  q: z.string().max(80).default(''),
  bodyPart: z.string().max(40).nullish(),
  equipment: z.string().max(40).nullish(),
  limit: integer(1, 60).optional(),
});

export const exerciseContextSchema = z.object({ exerciseId: id, workoutId: id, locale: z.enum(['fa', 'en']).default('fa') });

// ------------------------------------------------------------------------------------------ programs
export const createProgramSchema = z.object({
  title: text(80).pipe(z.string().min(1)),
  clientId: nullable(id).optional(),
  dayTitle: text(80).optional(),
});

export const updateProgramSchema = z.object({
  programId: id,
  title: text(80).pipe(z.string().min(1)).optional(),
  notes: nullable(multiline(2000)).optional(),
  active: z.boolean().optional(),
});

export const programIdSchema = z.object({ programId: id });

export const addDaySchema = z.object({ programId: id, title: text(80).optional() });
export const renameDaySchema = z.object({ dayId: id, title: text(80).pipe(z.string().min(1)) });
export const dayIdSchema = z.object({ dayId: id });
export const reorderDaysSchema = z.object({ programId: id, orderedIds: z.array(id).min(1).max(30) });

export const itemFieldsSchema = z.object({
  exerciseId: id.optional(),
  targetSets: integer(1, 20).optional(),
  targetRepsMin: integer(1, 100).optional(),
  targetRepsMax: nullable(integer(1, 100)).optional(),
  targetWeightKg: nullable(decimal(0, 1000)).optional(),
  restSeconds: nullable(integer(0, 1800)).optional(),
  note: nullable(text(300)).optional(),
});

export const addItemSchema = itemFieldsSchema.extend({ dayId: id, exerciseId: id });
export const updateItemSchema = itemFieldsSchema.extend({ itemId: id });
export const itemIdSchema = z.object({ itemId: id });
export const reorderItemsSchema = z.object({ dayId: id, orderedIds: z.array(id).min(1).max(60) });

export type ActionErrorCode = 'invalid' | 'forbidden' | 'notFound' | 'finished' | 'limit' | 'generic';

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: ActionErrorCode };
