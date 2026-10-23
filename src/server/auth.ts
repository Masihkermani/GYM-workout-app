'use server';

import { Prisma } from '@prisma/client';
import { redirect } from 'next/navigation';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '@/lib/password';
import { prisma } from '@/lib/db';
import { homeFor, safeNextPath } from '@/lib/redirects';
import { loginLimiter } from '@/lib/rate-limit';
import { createSession, destroySession } from '@/lib/session';
import { getCoachSettings } from '@/lib/settings';
import {
  fieldErrorCodes,
  loginSchema,
  registerSchema,
  type AuthErrorCode,
} from '@/lib/validation';

/**
 * State returned to the forms via useActionState. Errors are codes; the client translates them
 * (auth.errors.<code>) so the same action serves both languages. Passwords are never echoed back.
 */
export interface AuthFormState {
  errors?: Partial<Record<'name' | 'phone' | 'password' | 'form', AuthErrorCode>>;
  values?: { name?: string; phone?: string };
  /** For `rateLimited`: whole minutes until the next attempt. */
  retryAfterMinutes?: number;
}

const text = (value: FormDataEntryValue | null): string => (typeof value === 'string' ? value : '');
const localeOf = (value: FormDataEntryValue | null): 'fa' | 'en' => (value === 'en' ? 'en' : 'fa');

/** Login: phone + password. Rate limited to 5 failures per phone per 15 minutes. */
export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const locale = localeOf(formData.get('locale'));
  const phoneInput = text(formData.get('phone'));
  const parsed = loginSchema.safeParse({ phone: phoneInput, password: text(formData.get('password')) });

  if (!parsed.success) {
    return { errors: fieldErrorCodes<'phone' | 'password'>(parsed.error), values: { phone: phoneInput } };
  }
  const { phone, password } = parsed.data;

  const limit = loginLimiter.check(phone);
  if (!limit.allowed) {
    return {
      errors: { form: 'rateLimited' },
      retryAfterMinutes: Math.max(1, Math.ceil(limit.retryAfterSeconds / 60)),
      values: { phone: phoneInput },
    };
  }

  const user = await prisma.user.findUnique({
    where: { phone },
    select: { id: true, passwordHash: true, role: true, active: true },
  });
  // Always spend one argon2 verification so response time does not reveal which numbers exist.
  const valid =
    user && user.active ? await verifyPassword(user.passwordHash, password) : await verifyAgainstDummy(password);

  if (!user || !user.active || !valid) {
    const after = loginLimiter.recordFailure(phone);
    return after.allowed
      ? { errors: { form: 'invalidCredentials' }, values: { phone: phoneInput } }
      : {
          errors: { form: 'rateLimited' },
          retryAfterMinutes: Math.max(1, Math.ceil(after.retryAfterSeconds / 60)),
          values: { phone: phoneInput },
        };
  }

  loginLimiter.reset(phone);
  await createSession(user.id, user.role);
  // COACH -> /coach, CLIENT -> /app; `next` only when it stays inside the role's area.
  redirect(safeNextPath(text(formData.get('next')), locale, user.role));
}

/** Self-registration (blocked when the coach turned sign-ups off). Always creates a CLIENT. */
export async function registerAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const locale = localeOf(formData.get('locale'));
  const nameInput = text(formData.get('name'));
  const phoneInput = text(formData.get('phone'));
  const values = { name: nameInput, phone: phoneInput };

  const settings = await getCoachSettings();
  if (!settings.allowSignup) return { errors: { form: 'signupClosed' }, values };

  const parsed = registerSchema.safeParse({
    name: nameInput,
    phone: phoneInput,
    password: text(formData.get('password')),
  });
  if (!parsed.success) {
    return { errors: fieldErrorCodes<'name' | 'phone' | 'password'>(parsed.error), values };
  }
  const { name, phone, password } = parsed.data;

  if (await prisma.user.findUnique({ where: { phone }, select: { id: true } })) {
    return { errors: { phone: 'phoneTaken' }, values };
  }

  let userId: string;
  try {
    const user = await prisma.user.create({
      data: { name, phone, passwordHash: await hashPassword(password), role: 'CLIENT', locale },
      select: { id: true },
    });
    userId = user.id;
  } catch (e) {
    // Two concurrent sign-ups with the same number: the unique index wins.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { errors: { phone: 'phoneTaken' }, values };
    }
    throw e;
  }

  await createSession(userId, 'CLIENT');
  redirect(homeFor('CLIENT', locale));
}

/** Logout: deletes the DB session, clears cookies, goes back to /[locale]/login. */
export async function logoutAction(formData: FormData): Promise<void> {
  const locale = localeOf(formData.get('locale'));
  await destroySession();
  redirect(`/${locale}/login`);
}
