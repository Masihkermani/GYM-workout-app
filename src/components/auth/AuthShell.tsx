import type { ReactNode } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { LocaleSwitch } from '@/components/ui/LocaleSwitch';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Link } from '@/i18n/navigation';
import { coachDisplayName, getCoachSettings } from '@/lib/settings';

/**
 * Chrome shared by login and register: paper background, the coach's name set large in expanded
 * type, then a narrow ruled card. No illustrations, no gradients.
 */
export async function AuthShell({ children }: { children: ReactNode }) {
  const [t, locale, settings] = await Promise.all([getTranslations('common'), getLocale(), getCoachSettings()]);
  const coach = coachDisplayName(settings, locale);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="page-x flex items-center justify-between gap-2 py-3">
        {/* 44px target; the negative start margin cancels the padding, so the wordmark stays where it was */}
        <Link
          href="/"
          className="-ms-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--r)] px-2 text-lg font-extrabold font-expanded text-ink"
        >
          {t('brand.name')}
        </Link>
        <div className="flex items-center gap-1">
          <LocaleSwitch />
          <ThemeToggle />
        </div>
      </header>

      <main id="main" className="page-x flex flex-1 flex-col items-center justify-center pb-16 pt-6">
        <div className="w-full max-w-[26rem]">
          <p className="label-caps text-ink-2">{t('brand.tagline')}</p>
          <p className="mt-2 text-4xl font-extrabold font-expanded text-ink [text-wrap:balance]">{coach}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
