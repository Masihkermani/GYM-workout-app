import { z } from 'zod';
import { parseDecimal, parseInteger } from '@/lib/digits';
import { normalizePersianText, phoneSchema } from '@/lib/validation';

/**
 * Validation for the coach area and /app/me. Isomorphic (no server-only imports): the same limits
 * drive the server schemas and the hints the forms print. Messages are STABLE CODES; forms
 * translate them with t(`errors.${code}`) from the `coach` namespace.
 */
export const COACH_ERROR_CODES = [
  'required',
  'phoneInvalid',
  'phoneTaken',
  'nameShort',
  'nameLong',
  'passwordShort',
  'passwordLong',
  'passwordWrong',
  'passwordSame',
  'passwordMismatch',
  'textLong',
  'numberInvalid',
  'outOfRange',
  'timezoneInvalid',
  'stepsTooMany',
  'taxonomyInvalid',
  'inUse',
  'notFound',
  'rateLimited',
  'generic',
] as const;
export type CoachErrorCode = (typeof COACH_ERROR_CODES)[number];

const isCode = (v: string): v is CoachErrorCode => (COACH_ERROR_CODES as readonly string[]).includes(v);

/** First error code per top-level field of a failed parse. */
export function fieldCodes<K extends string>(error: z.ZodError): Partial<Record<K, CoachErrorCode>> {
  const out: Partial<Record<string, CoachErrorCode>> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    if (out[field]) continue;
    out[field] = isCode(issue.message) ? issue.message : 'generic';
  }
  return out as Partial<Record<K, CoachErrorCode>>;
}

export const idSchema = z.string().trim().min(1, 'notFound').max(64, 'notFound');
export const localeSchema = z.enum(['fa', 'en']).catch('fa');

export const personNameSchema = z
  .string()
  .transform(normalizePersianText)
  .pipe(z.string().min(1, 'required').min(2, 'nameShort').max(60, 'nameLong'));

export const newPasswordSchema = z.string().min(1, 'required').min(8, 'passwordShort').max(200, 'passwordLong');

/** A free-text field that may be empty (-> null). Line breaks are kept; invisible control chars are not. */
export const optionalText = (max: number) =>
  z
    .string()
    .transform((v) => v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ''))
    .pipe(z.string().max(max, 'textLong'))
    .transform((v) => v.trim() || null);

/** Persian ي/ك typed on an Arabic keyboard become ی/ک; the text is otherwise untouched. */
export const persianise = (v: string) => v.replace(/ي/g, 'ی').replace(/ك/g, 'ک');

// ----------------------------------------------------------------------------------- clients
export const createClientSchema = z.object({
  name: personNameSchema,
  phone: phoneSchema,
  password: newPasswordSchema,
  locale: localeSchema,
});

/** The coach corrects a client's name or phone (the phone is the login, so it stays unique). */
export const updateClientSchema = z.object({
  id: idSchema,
  name: personNameSchema,
  phone: phoneSchema,
});

export const COACH_NOTES_MAX = 5000;
export const notesSchema = z.object({
  id: idSchema,
  notes: optionalText(COACH_NOTES_MAX),
});

// ---------------------------------------------------------------------------------- exercises
export const STEPS_MAX_LINES = 30;
export const STEP_MAX_CHARS = 400;
export const EXERCISE_NAME_MAX = 120;

/** One textarea line per step: trimmed, blank lines dropped. */
export function parseSteps(text: string, persian: boolean): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (persian ? persianise(line) : line).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const stepsSchema = (persian: boolean) =>
  z
    .string()
    .transform((v) => parseSteps(v, persian))
    .pipe(
      z
        .array(z.string().max(STEP_MAX_CHARS, 'textLong'))
        .max(STEPS_MAX_LINES, 'stepsTooMany'),
    );

const optionalName = z
  .string()
  .transform(normalizePersianText)
  .pipe(z.string().max(EXERCISE_NAME_MAX, 'textLong'))
  .transform((v) => v || null);

const requiredEnglishName = z
  .string()
  .transform((v) => v.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'required').min(2, 'nameShort').max(EXERCISE_NAME_MAX, 'nameLong'));

export const updateExerciseSchema = z.object({
  id: idSchema,
  nameFa: optionalName,
  nameEn: requiredEnglishName.optional(),
  stepsFa: stepsSchema(true),
  stepsEn: stepsSchema(false),
  archived: z.boolean(),
});

const taxonomyValue = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().min(1, 'required').max(60, 'taxonomyInvalid'));

export const createExerciseSchema = z.object({
  nameEn: requiredEnglishName,
  nameFa: optionalName,
  bodyPart: taxonomyValue,
  equipment: taxonomyValue,
  target: taxonomyValue,
});

// ------------------------------------------------------------------------------------ settings
/** Inclusive ranges, shared by the schema and the "from X to Y" hints. */
export const SETTINGS_LIMITS = {
  slotMinutes: { min: 15, max: 240 },
  bufferMinutes: { min: 0, max: 120 },
  horizonDays: { min: 1, max: 180 },
  minNoticeHours: { min: 0, max: 168 },
  cancelWindowHours: { min: 0, max: 336 },
  barKg: { min: 1, max: 50 },
} as const;

export const SETTINGS_TEXT_LIMITS = { name: 80, bio: 600, location: 160 } as const;

const int = (min: number, max: number) =>
  z.string().transform((raw, ctx) => {
    if (!raw.trim()) {
      ctx.addIssue({ code: 'custom', message: 'required', input: raw });
      return z.NEVER;
    }
    const n = parseInteger(raw);
    if (n === null) {
      ctx.addIssue({ code: 'custom', message: 'numberInvalid', input: raw });
      return z.NEVER;
    }
    if (n < min || n > max) {
      ctx.addIssue({ code: 'custom', message: 'outOfRange', input: raw });
      return z.NEVER;
    }
    return n;
  });

const decimal = (min: number, max: number) =>
  z.string().transform((raw, ctx) => {
    if (!raw.trim()) {
      ctx.addIssue({ code: 'custom', message: 'required', input: raw });
      return z.NEVER;
    }
    const n = parseDecimal(raw);
    if (n === null) {
      ctx.addIssue({ code: 'custom', message: 'numberInvalid', input: raw });
      return z.NEVER;
    }
    if (n < min || n > max) {
      ctx.addIssue({ code: 'custom', message: 'outOfRange', input: raw });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

const settingsName = z
  .string()
  .transform(normalizePersianText)
  .pipe(z.string().min(1, 'required').max(SETTINGS_TEXT_LIMITS.name, 'textLong'));

const settingsText = (max: number) =>
  z
    .string()
    .transform((v) => persianise(v).replace(/\r\n?/g, '\n').trim())
    .pipe(z.string().max(max, 'textLong'));

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const settingsSchema = z.object({
  coachName: settingsName,
  coachNameFa: settingsName,
  bioEn: settingsText(SETTINGS_TEXT_LIMITS.bio),
  bioFa: settingsText(SETTINGS_TEXT_LIMITS.bio),
  locationEn: settingsText(SETTINGS_TEXT_LIMITS.location),
  locationFa: settingsText(SETTINGS_TEXT_LIMITS.location),
  timezone: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, 'required').refine(isValidTimeZone, 'timezoneInvalid')),
  slotMinutes: int(SETTINGS_LIMITS.slotMinutes.min, SETTINGS_LIMITS.slotMinutes.max),
  bufferMinutes: int(SETTINGS_LIMITS.bufferMinutes.min, SETTINGS_LIMITS.bufferMinutes.max),
  horizonDays: int(SETTINGS_LIMITS.horizonDays.min, SETTINGS_LIMITS.horizonDays.max),
  minNoticeHours: int(SETTINGS_LIMITS.minNoticeHours.min, SETTINGS_LIMITS.minNoticeHours.max),
  cancelWindowHours: int(SETTINGS_LIMITS.cancelWindowHours.min, SETTINGS_LIMITS.cancelWindowHours.max),
  barKg: decimal(SETTINGS_LIMITS.barKg.min, SETTINGS_LIMITS.barKg.max),
  requireApproval: z.boolean(),
  allowSignup: z.boolean(),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

export const SETTINGS_FIELDS = [
  'coachName',
  'coachNameFa',
  'bioEn',
  'bioFa',
  'locationEn',
  'locationFa',
  'timezone',
  'slotMinutes',
  'bufferMinutes',
  'horizonDays',
  'minNoticeHours',
  'cancelWindowHours',
  'barKg',
] as const;
export type SettingsField = (typeof SETTINGS_FIELDS)[number];

// ---------------------------------------------------------------------------------- my profile
export const GOAL_MAX = 300;
export const profileSchema = z.object({
  name: personNameSchema,
  goal: optionalText(GOAL_MAX),
});

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, 'required').max(200, 'passwordLong'),
    next: newPasswordSchema,
    confirm: z.string().min(1, 'required').max(200, 'passwordLong'),
  })
  .superRefine((v, ctx) => {
    if (v.next !== v.confirm) ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'passwordMismatch' });
    else if (v.next === v.current) ctx.addIssue({ code: 'custom', path: ['next'], message: 'passwordSame' });
  });
