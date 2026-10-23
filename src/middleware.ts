import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { ROLE_COOKIE, SESSION_COOKIE } from './lib/constants';

const intlMiddleware = createMiddleware(routing);

const LOCALE_PATH = /^\/(fa|en)(\/.*)?$/;
const area = (rest: string, name: 'app' | 'coach') => rest === `/${name}` || rest.startsWith(`/${name}/`);

/**
 * next-intl routing plus a UX-only auth gate:
 *  - no session cookie on /[locale]/app/* or /[locale]/coach/*  ->  /[locale]/login?next=<path>
 *  - a CLIENT (role hint cookie) opening /[locale]/coach/*       ->  /[locale]/app
 * This only checks that cookies EXIST. It cannot (and does not try to) validate them: every page and
 * server action re-checks with requireUser() / requireCoach().
 */
export default function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const match = LOCALE_PATH.exec(pathname);

  if (match) {
    const locale = match[1];
    const rest = match[2] ?? '';
    const inApp = area(rest, 'app');
    const inCoach = area(rest, 'coach');

    if (inApp || inCoach) {
      if (!request.cookies.has(SESSION_COOKIE)) {
        const url = request.nextUrl.clone();
        url.pathname = `/${locale}/login`;
        url.search = `?next=${encodeURIComponent(pathname + search)}`;
        return NextResponse.redirect(url);
      }
      if (inCoach && request.cookies.get(ROLE_COOKIE)?.value === 'CLIENT') {
        const url = request.nextUrl.clone();
        url.pathname = `/${locale}/app`;
        url.search = '';
        return NextResponse.redirect(url);
      }
    }
  }

  return intlMiddleware(request);
}

export const config = {
  // Everything except API routes, Next internals and files with an extension.
  matcher: ['/((?!api|trpc|_next|_vercel|.*\\..*).*)'],
};
