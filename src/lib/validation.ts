import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, MIN_NEW_PASSWORD_LENGTH, isWeakPassword, matchesPhone } from './password-policy';
import { normalizePhone } from './phone';

/**
 * Validation schemas. Error messages are STABLE CODES (not prose): server actions return the code,
 * the client translates it with t(`errors.${code}`) in the viewer's language.
 */
export const AUTH_ERROR_CODES = [
  'required',
  'phoneInvalid',
  'phoneTaken',
  'nameShort',
  'nameLong',
  'passwordShort',
  'passwordLong',
  'passwordWeak',
  'invalidCredentials',
  'rateLimited',
  'signupClosed',
  'generic',
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

const isAuthErrorCode = (v: string): v is AuthErrorCode => (AUTH_ERROR_CODES as readonly string[]).includes(v);

/** Arabic yeh / kaf typed on an Arabic keyboard -> Persian ی / ک, and tidy whitespace. */
export function normalizePersianText(input: string): string {
  return input.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim();
}

/** Phone typed in any digits -> E.164, or a `phoneInvalid` issue. */
export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'required')
  .transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'phoneInvalid', input: value });
      return z.NEVER;
    }
    return phone;
  });

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'required').max(200, 'passwordLong'),
});

/**
 * A password somebody is CHOOSING (sign-up, change password, a temporary one typed by the coach): 10+
 * characters, not on the common-password list. Login does not use it: accounts made under the old
 * 8-character rule must still sign in.
 */
export const newPasswordSchema = z
  .string()
  .min(1, 'required')
  .min(MIN_NEW_PASSWORD_LENGTH, 'passwordShort')
  .max(MAX_PASSWORD_LENGTH, 'passwordLong')
  .refine((value) => !isWeakPassword(value), 'passwordWeak');

/** A new password may not be (or contain) the account's own phone number. */
export function refuseOwnPhone(value: { phone: string; password: string }, ctx: z.RefinementCtx): void {
  if (matchesPhone(value.password, value.phone)) {
    ctx.addIssue({ code: 'custom', path: ['password'], message: 'passwordWeak', input: value.password });
  }
}

export const registerSchema = z
  .object({
    name: z
      .string()
      .transform(normalizePersianText)
      .pipe(z.string().min(1, 'required').min(2, 'nameShort').max(60, 'nameLong')),
    phone: phoneSchema,
    password: newPasswordSchema,
  })
  .superRefine(refuseOwnPhone);

/** First error code per field from a failed parse. */
export function fieldErrorCodes<K extends string>(error: z.ZodError): Partial<Record<K, AuthErrorCode>> {
  const out: Partial<Record<string, AuthErrorCode>> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    if (out[field]) continue;
    out[field] = isAuthErrorCode(issue.message) ? issue.message : 'generic';
  }
  return out as Partial<Record<K, AuthErrorCode>>;
}
