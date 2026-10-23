/** Shared constants with no dependencies (safe to import from client components). */

export const LOCALES = ['fa', 'en'] as const;
export type AppLocaleCode = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocaleCode = 'fa';

/** Coach timezone default. Tehran has been UTC+03:30 with no DST since 2022. */
export const DEFAULT_TIME_ZONE = 'Asia/Tehran';

export const MINUTES_PER_DAY = 24 * 60;

export const SESSION_COOKIE = 'daftar_session';
/** Advisory, non-secret role hint so the middleware can bounce a CLIENT away from /coach. Pages re-check. */
export const ROLE_COOKIE = 'daftar_role';
export const THEME_COOKIE = 'theme';
export const SESSION_DAYS = 30;
