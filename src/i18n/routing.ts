import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['fa', 'en'],
  defaultLocale: 'fa',
  localePrefix: 'always',
  // Persian is the default for everyone: `/` always goes to `/fa`. The switcher is explicit
  // (no Accept-Language guessing), so behaviour is the same for every visitor and every test run.
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (routing.locales as readonly string[]).includes(value);
}

/** Text direction for a locale. */
export function dirOf(locale: string): 'rtl' | 'ltr' {
  return locale === 'fa' ? 'rtl' : 'ltr';
}
