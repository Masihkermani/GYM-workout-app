'use server';

import { Prisma } from '@prisma/client';
import { redirect } from 'next/navigation';
import { authThrottle } from '@/lib/auth-throttle';
import { prisma } from '@/lib/db';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '@/lib/password';
import { homeFor, safeNextPath } from '@/lib/redirects';
import { getClientIp } from '@/lib/request-ip';
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

const retryMinutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));

/**
 * Login: phone + password. Throttled per address+phone (5 per 15 min), per address (30 per 15 min) and per
 * phone (50 per hour); see lib/auth-throttle.ts. The attempt is reserved before the first await on the
 * guess, so a concurrent burst cannot evaluate more than the budget.
 */
export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const locale = localeOf(formData.get('locale'));
  const phoneInput = text(formData.get('phone'));
  const parsed = loginSchema.safeParse({ phone: phoneInput, password: text(formData.get('password')) });

  if (!parsed.success) {
    return { errors: fieldErrorCodes<'phone' | 'password'>(parsed.error), values: { phone: phoneInput } };
  }
  const { phone, password } = parsed.data;

  const attempt = authThrottle.reserveLogin(await getClientIp(), phone);
  if (!attempt.allowed) {
    return {
      errors: { form: 'rateLimited' },
      retryAfterMinutes: retryMinutes(attempt.retryAfterSeconds),
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
    const after = attempt.afterFailure();
    return after.locked
      ? {
          errors: { form: 'rateLimited' },
          retryAfterMinutes: retryMinutes(after.retryAfterSeconds),
          values: { phone: phoneInput },
        }
      : { errors: { form: 'invalidCredentials' }, values: { phone: phoneInput } };
  }

  attempt.succeed();
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

  // 10 sign-ups per address per hour (taken numbers count: this is also what slows number enumeration).
  const gate = authThrottle.reserveRegister(await getClientIp());
  if (!gate.allowed) {
    return { errors: { form: 'rateLimited' }, retryAfterMinutes: retryMinutes(gate.retryAfterSeconds), values };
  }

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
