import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/Button';
import { LocaleSwitch } from '@/components/ui/LocaleSwitch';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { coachDisplayName, getCoachSettings } from '@/lib/settings';

/** Placeholder landing (the landing agent replaces this): coach name, one way in. */
export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, ta, settings] = await Promise.all([
    getTranslations('common'),
    getTranslations('auth'),
    getCoachSettings(),
  ]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="page-x flex items-center justify-between py-3">
        <span className="text-lg font-extrabold font-expanded">{t('brand.name')}</span>
        <div className="flex items-center gap-1">
          <LocaleSwitch />
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="page-x flex flex-1 flex-col justify-center gap-8 pb-16">
        <h1 className="text-5xl font-extrabold font-expanded [text-wrap:balance]">{coachDisplayName(settings, locale)}</h1>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/register" size="lg">
            {ta('register.title')}
          </ButtonLink>
          <ButtonLink href="/login" size="lg" variant="outline">
            {ta('login.title')}
          </ButtonLink>
        </div>
      </main>
    </div>
  );
}
