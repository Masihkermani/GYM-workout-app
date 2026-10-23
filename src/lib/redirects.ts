import type { Role } from '@prisma/client';

const LOCALE_PREFIX = /^\/(fa|en)(?=\/|$|\?)/;

/** Remove a leading `/fa` or `/en` so a `next` captured in one language works in another. */
export function stripLocalePrefix(path: string): string {
  const stripped = path.replace(LOCALE_PREFIX, '');
  return stripped === '' || stripped.startsWith('?') ? `/${stripped}` : stripped;
}

export function homeFor(role: Role, locale: string): string {
  return `/${locale}/${role === 'COACH' ? 'coach' : 'app'}`;
}

/**
 * Where to send a user after login. `next` is attacker-controllable (it comes from a query string),
 * so it is only honoured when it is a same-site path inside the area the role may use; anything
 * else falls back to the role's home. Result is always `/<locale>/…`.
 */
export function safeNextPath(next: string | null | undefined, locale: string, role: Role): string {
  const fallback = homeFor(role, locale);
  if (!next || typeof next !== 'string' || next.length > 512) return fallback;
  // same-site, path-only: no scheme, no protocol-relative, no backslash tricks, no control characters
  if (!next.startsWith('/') || next.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  if (/^\/[^/]*:/.test(next)) return fallback;

  const path = stripLocalePrefix(next);
  const area = /^\/(app|coach)(?=\/|\?|#|$)/.exec(path)?.[1];
  if (!area) return fallback;
  if (area === 'coach' && role !== 'COACH') return fallback;
  return `/${locale}${path}`;
}
