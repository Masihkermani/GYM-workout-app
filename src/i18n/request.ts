import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_TIME_ZONE } from '@/lib/constants';
import { routing } from './routing';

/** One JSON file per namespace under messages/<locale>/. Each feature owns its namespace file. */
export const NAMESPACES = ['common', 'auth', 'landing', 'booking', 'training', 'coach'] as const;
export type Namespace = (typeof NAMESPACES)[number];

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const mod = (await import(`../../messages/${locale}/${ns}.json`)) as { default: unknown };
      return [ns, mod.default] as const;
    }),
  );

  return {
    locale,
    messages: Object.fromEntries(entries),
    // Display default; components that know the coach's timezone pass it explicitly.
    timeZone: DEFAULT_TIME_ZONE,
  };
});
