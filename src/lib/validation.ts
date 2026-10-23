import { z } from 'zod';
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

export const registerSchema = z.object({
  name: z
    .string()
    .transform(normalizePersianText)
    .pipe(z.string().min(1, 'required').min(2, 'nameShort').max(60, 'nameLong')),
  phone: phoneSchema,
  password: z.string().min(1, 'required').min(8, 'passwordShort').max(200, 'passwordLong'),
});

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
