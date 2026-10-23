import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { readSessionUser, type SessionUser } from './session';

export { hashPassword, verifyPassword, verifyAgainstDummy } from './password';
export type { SessionUser } from './session';

/** The signed-in user for this request (memoised per request), or null. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => readSessionUser());

async function resolveLocale(locale?: string): Promise<string> {
  return locale ?? (await getLocale());
}

/**
 * Pages and server actions call this; the middleware only checks cookie presence for UX.
 * Redirects to /[locale]/login when there is no valid session.
 */
export async function requireUser(locale?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/${await resolveLocale(locale)}/login`);
  return user;
}

/** Coach-only. A signed-in CLIENT is sent to /[locale]/app; anonymous visitors to /login. */
export async function requireCoach(locale?: string): Promise<SessionUser> {
  const user = await requireUser(locale);
  if (user.role !== 'COACH') redirect(`/${await resolveLocale(locale)}/app`);
  return user;
}
