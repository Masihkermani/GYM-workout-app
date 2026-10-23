'use server';

import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { generateTempPassword } from '@/components/coach/tempPassword';
import {
  changePasswordSchema,
  createClientSchema,
  createExerciseSchema,
  fieldCodes,
  idSchema,
  localeSchema,
  notesSchema,
  profileSchema,
  settingsSchema,
  updateExerciseSchema,
  type CoachErrorCode,
  type SettingsField,
} from '@/components/coach/schemas';
import { requireCoach, requireUser } from '@/lib/auth';
import { SESSION_COOKIE } from '@/lib/constants';
import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { FailureLimiter } from '@/lib/rate-limit';
import { hashSessionToken } from '@/lib/session';

/**
 * Server actions for the coach area and /app/me. Every coach action calls requireCoach() FIRST,
 * before it reads any input; the /app/me actions call requireUser() and only ever touch the
 * signed-in user's own row. Errors are stable codes (see components/coach/schemas.ts) that the
 * forms translate. Nothing here returns a password hash, and plaintext temporary passwords are
 * returned exactly once to the coach who asked for them.
 */

/** State handed back to forms through useActionState. */
export interface FormState<F extends string = string> {
  ok?: boolean;
  errors?: Partial<Record<F | 'form', CoachErrorCode>>;
  /** What the user typed (never passwords), so a failed submit does not lose it. */
  values?: Record<string, string>;
  /** Bumped on each success so the UI can show "saved" again. */
  savedAt?: number;
}

export interface ClientCreated {
  id: string;
  name: string;
  phone: string;
}
export type CreateClientState = FormState<'name' | 'phone' | 'password'> & { created?: ClientCreated };
export type ExerciseState = FormState<
  'nameEn' | 'nameFa' | 'stepsFa' | 'stepsEn' | 'bodyPart' | 'equipment' | 'target'
> & { deleted?: boolean };
export type SettingsState = FormState<SettingsField>;
export type ProfileState = FormState<'name' | 'goal'>;
export type PasswordState = FormState<'current' | 'next' | 'confirm'>;

const text = (value: FormDataEntryValue | null): string => (typeof value === 'string' ? value : '');
const localeOf = (value: FormDataEntryValue | null): 'fa' | 'en' => (value === 'en' ? 'en' : 'fa');
const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Pages are dynamic, but the client router cache and any memoised reads must not serve stale rows. */
function refreshPages() {
  revalidatePath('/', 'layout');
}

// ------------------------------------------------------------------------------------ clients

/** Coach adds a client with a temporary password (typed or generated). Always creates a CLIENT. */
export async function createClientAction(_prev: CreateClientState, formData: FormData): Promise<CreateClientState> {
  const locale = localeOf(formData.get('locale'));
  await requireCoach(locale);

  const values = { name: text(formData.get('name')), phone: text(formData.get('phone')) };
  const parsed = createClientSchema.safeParse({
    ...values,
    password: text(formData.get('password')),
    locale: text(formData.get('clientLocale')) || locale,
  });
  if (!parsed.success) return { errors: fieldCodes<'name' | 'phone' | 'password'>(parsed.error), values };
  const { name, phone, password } = parsed.data;

  if (await prisma.user.findUnique({ where: { phone }, select: { id: true } })) {
    return { errors: { phone: 'phoneTaken' }, values };
  }
  try {
    const user = await prisma.user.create({
      data: { name, phone, passwordHash: await hashPassword(password), role: 'CLIENT', locale: parsed.data.locale },
      select: { id: true, name: true, phone: true },
    });
    refreshPages();
    return { ok: true, created: user, savedAt: Date.now() };
  } catch (e) {
    if (isUniqueViolation(e)) return { errors: { phone: 'phoneTaken' }, values };
    throw e;
  }
}

export type ActionResult = { ok: true; savedAt: number } | { ok: false; error: CoachErrorCode };

async function findClient(id: string) {
  return prisma.user.findFirst({ where: { id, role: 'CLIENT' }, select: { id: true } });
}

/** Deactivating blocks login at once: the client's sessions are deleted too. */
export async function setClientActiveAction(clientId: string, active: boolean): Promise<ActionResult> {
  await requireCoach();
  const id = idSchema.safeParse(clientId);
  if (!id.success || typeof active !== 'boolean') return { ok: false, error: 'notFound' };
  if (!(await findClient(id.data))) return { ok: false, error: 'notFound' };

  await prisma.$transaction([
    prisma.user.update({ where: { id: id.data }, data: { active } }),
    ...(active ? [] : [prisma.session.deleteMany({ where: { userId: id.data } })]),
  ]);
  refreshPages();
  return { ok: true, savedAt: Date.now() };
}

/** Autosave target for the private coach notes. Not revalidated: the textarea already shows the text. */
export async function saveCoachNotesAction(clientId: string, notes: string): Promise<ActionResult> {
  await requireCoach();
  const parsed = notesSchema.safeParse({ id: clientId, notes: typeof notes === 'string' ? notes : '' });
  if (!parsed.success) return { ok: false, error: fieldCodes<'id' | 'notes'>(parsed.error).notes ?? 'notFound' };
  if (!(await findClient(parsed.data.id))) return { ok: false, error: 'notFound' };

  await prisma.user.update({ where: { id: parsed.data.id }, data: { coachNotes: parsed.data.notes } });
  return { ok: true, savedAt: Date.now() };
}

export type ResetPasswordResult = { ok: true; password: string } | { ok: false; error: CoachErrorCode };

/**
 * New random temporary password for a client. Returned once, in the response to the coach who asked;
 * only its argon2 hash is stored. The client's existing sessions are ended.
 */
export async function resetClientPasswordAction(clientId: string): Promise<ResetPasswordResult> {
  await requireCoach();
  const id = idSchema.safeParse(clientId);
  if (!id.success || !(await findClient(id.data))) return { ok: false, error: 'notFound' };

  const password = generateTempPassword();
  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: id.data }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId: id.data } }),
  ]);
  return { ok: true, password };
}

// ---------------------------------------------------------------------------------- exercises

async function taxonomyHas(field: 'bodyPart' | 'equipment' | 'target', value: string): Promise<boolean> {
  const hit = await prisma.exercise.findFirst({ where: { [field]: value }, select: { id: true } });
  return hit !== null;
}

/** Add a custom exercise. Body part, equipment and target must already exist in the library. */
export async function createExerciseAction(_prev: ExerciseState, formData: FormData): Promise<ExerciseState> {
  const coach = await requireCoach(localeOf(formData.get('locale')));

  const values = {
    nameEn: text(formData.get('nameEn')),
    nameFa: text(formData.get('nameFa')),
    bodyPart: text(formData.get('bodyPart')),
    equipment: text(formData.get('equipment')),
    target: text(formData.get('target')),
  };
  const parsed = createExerciseSchema.safeParse(values);
  if (!parsed.success) {
    return { errors: fieldCodes<'nameEn' | 'nameFa' | 'bodyPart' | 'equipment' | 'target'>(parsed.error), values };
  }
  const data = parsed.data;
  const [okBody, okEquipment, okTarget] = await Promise.all([
    taxonomyHas('bodyPart', data.bodyPart),
    taxonomyHas('equipment', data.equipment),
    taxonomyHas('target', data.target),
  ]);
  if (!okBody || !okEquipment || !okTarget) {
    return {
      errors: {
        ...(okBody ? {} : { bodyPart: 'taxonomyInvalid' as const }),
        ...(okEquipment ? {} : { equipment: 'taxonomyInvalid' as const }),
        ...(okTarget ? {} : { target: 'taxonomyInvalid' as const }),
      },
      values,
    };
  }

  await prisma.exercise.create({
    data: {
      nameEn: data.nameEn,
      nameFa: data.nameFa,
      bodyPart: data.bodyPart,
      equipment: data.equipment,
      target: data.target,
      secondaryMuscles: [],
      stepsEn: [],
      stepsFa: [],
      isCustom: true,
      createdById: coach.id,
    },
  });
  refreshPages();
  return { ok: true, savedAt: Date.now() };
}

/** Edit Persian name and steps, archive or restore. The English name only changes on custom exercises. */
export async function updateExerciseAction(_prev: ExerciseState, formData: FormData): Promise<ExerciseState> {
  await requireCoach(localeOf(formData.get('locale')));

  const values = {
    nameFa: text(formData.get('nameFa')),
    nameEn: text(formData.get('nameEn')),
    stepsFa: text(formData.get('stepsFa')),
    stepsEn: text(formData.get('stepsEn')),
  };
  const existing = await prisma.exercise.findUnique({
    where: { id: text(formData.get('id')) },
    select: { id: true, isCustom: true },
  });
  if (!existing) return { errors: { form: 'notFound' }, values };

  const parsed = updateExerciseSchema.safeParse({
    id: existing.id,
    nameFa: values.nameFa,
    nameEn: existing.isCustom ? values.nameEn : undefined,
    stepsFa: values.stepsFa,
    stepsEn: values.stepsEn,
    archived: formData.get('archived') === 'on',
  });
  if (!parsed.success) {
    return { errors: fieldCodes<'nameEn' | 'nameFa' | 'stepsFa' | 'stepsEn'>(parsed.error), values };
  }
  const d = parsed.data;
  await prisma.exercise.update({
    where: { id: existing.id },
    data: {
      nameFa: d.nameFa,
      ...(existing.isCustom && d.nameEn ? { nameEn: d.nameEn } : {}),
      stepsFa: d.stepsFa,
      stepsEn: d.stepsEn,
      archived: d.archived,
    },
  });
  refreshPages();
  return { ok: true, savedAt: Date.now(), values };
}

/**
 * Hard delete, allowed ONLY for a custom exercise nothing refers to (a typo). Anything with logged
 * sets or program items is refused with `inUse`: archive it instead.
 */
export async function deleteExerciseAction(exerciseId: string): Promise<ActionResult> {
  await requireCoach();
  const id = idSchema.safeParse(exerciseId);
  if (!id.success) return { ok: false, error: 'notFound' };
  const ex = await prisma.exercise.findUnique({
    where: { id: id.data },
    select: { isCustom: true, _count: { select: { sets: true, items: true } } },
  });
  if (!ex) return { ok: false, error: 'notFound' };
  if (!ex.isCustom || ex._count.sets > 0 || ex._count.items > 0) return { ok: false, error: 'inUse' };
  try {
    await prisma.exercise.delete({ where: { id: id.data } });
  } catch (e) {
    // a foreign key appeared between the check and the delete
    if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === 'P2003' || e.code === 'P2014')) {
      return { ok: false, error: 'inUse' };
    }
    throw e;
  }
  refreshPages();
  return { ok: true, savedAt: Date.now() };
}

// ------------------------------------------------------------------------------------ settings

/** Every CoachSettings field. Numbers may be typed in Persian, Arabic-Indic or Latin digits. */
export async function saveSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  await requireCoach(localeOf(formData.get('locale')));

  const fields = [
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
  const values = Object.fromEntries(fields.map((f) => [f, text(formData.get(f))]));
  const parsed = settingsSchema.safeParse({
    ...values,
    requireApproval: formData.get('requireApproval') === 'on',
    allowSignup: formData.get('allowSignup') === 'on',
  });
  if (!parsed.success) return { errors: fieldCodes<SettingsField>(parsed.error), values };

  const data = parsed.data;
  await prisma.coachSettings.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });
  refreshPages();
  return { ok: true, savedAt: Date.now(), values };
}

// ------------------------------------------------------------------------------------- /app/me

export async function updateProfileAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireUser(localeOf(formData.get('locale')));
  const values = { name: text(formData.get('name')), goal: text(formData.get('goal')) };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldCodes<'name' | 'goal'>(parsed.error), values };

  await prisma.user.update({ where: { id: user.id }, data: { name: parsed.data.name, goal: parsed.data.goal } });
  refreshPages();
  return { ok: true, savedAt: Date.now(), values };
}

const globalForLimiter = globalThis as unknown as { __daftarPasswordLimiter?: FailureLimiter };
/** 5 wrong "current password" answers per account per 15 minutes (a stolen session cannot be used to guess it). */
const passwordLimiter = (globalForLimiter.__daftarPasswordLimiter ??= new FailureLimiter(5, 15 * 60 * 1000));

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await requireUser(localeOf(formData.get('locale')));
  const parsed = changePasswordSchema.safeParse({
    current: text(formData.get('current')),
    next: text(formData.get('next')),
    confirm: text(formData.get('confirm')),
  });
  if (!parsed.success) return { errors: fieldCodes<'current' | 'next' | 'confirm'>(parsed.error) };

  if (!passwordLimiter.check(user.id).allowed) return { errors: { form: 'rateLimited' } };
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row || !(await verifyPassword(row.passwordHash, parsed.data.current))) {
    const after = passwordLimiter.recordFailure(user.id);
    return { errors: after.allowed ? { current: 'passwordWrong' } : { form: 'rateLimited' } };
  }
  passwordLimiter.reset(user.id);

  const passwordHash = await hashPassword(parsed.data.next);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    // every other device is signed out; this one stays
    prisma.session.deleteMany({
      where: { userId: user.id, ...(token ? { tokenHash: { not: hashSessionToken(token) } } : {}) },
    }),
  ]);
  return { ok: true, savedAt: Date.now() };
}

/** Persist the language preference. The client then navigates to the chosen locale. */
export async function setLocalePreferenceAction(locale: string): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = localeSchema.safeParse(locale);
  if (!parsed.success || (locale !== 'fa' && locale !== 'en')) return { ok: false, error: 'generic' };
  await prisma.user.update({ where: { id: user.id }, data: { locale: parsed.data } });
  return { ok: true, savedAt: Date.now() };
}
