import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import type { Role } from '@prisma/client';
import { ROLE_COOKIE, SESSION_COOKIE, SESSION_DAYS } from './constants';
import { prisma } from './db';

/** The only user shape that leaves the data layer: never includes passwordHash or coach notes. */
export interface SessionUser {
  id: string;
  phone: string;
  name: string;
  role: Role;
  locale: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The database only ever stores sha256(token); the raw token lives in the cookie. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/** Create a DB session and set the cookies. Call from a Server Action or Route Handler only. */
export async function createSession(userId: string, role: Role): Promise<void> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
  await prisma.session.create({ data: { tokenHash: hashSessionToken(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(SESSION_DAYS * 24 * 60 * 60));
  // Advisory only (the middleware uses it to keep CLIENTs out of /coach); every page re-checks.
  jar.set(ROLE_COOKIE, role, cookieOptions(SESSION_DAYS * 24 * 60 * 60));
}

/** Delete the DB session (if any) and clear both cookies. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(ROLE_COOKIE);
}

/** Resolve the cookie to a live user, or null. Expired sessions and deactivated users are purged. */
export async function readSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      expiresAt: true,
      user: { select: { id: true, phone: true, name: true, role: true, locale: true, active: true } },
    },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now() || !session.user.active) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  const { active: _active, ...user } = session.user;
  return user;
}
