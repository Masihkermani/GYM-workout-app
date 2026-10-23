import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PublicWeekPreview } from '@/components/booking/PublicWeekPreview';
import { getAvailabilityRules } from '@/components/landing/data';
import { HoursTable } from '@/components/landing/HoursTable';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { sampleCard } from '@/components/landing/sampleCard';
import { TrainingCard } from '@/components/training/TrainingCard';
import { ButtonLink } from '@/components/ui/Button';
import { LocaleSwitch } from '@/components/ui/LocaleSwitch';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { cn } from '@/lib/cn';
import { getCurrentUser } from '@/lib/auth';
import { coachDisplayName, getCoachSettings } from '@/lib/settings';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const [t, settings] = await Promise.all([getTranslations({ locale, namespace: 'landing' }), getCoachSettings()]);
  const coach = coachDisplayName(settings, locale);
  const title = t('meta.title', { coach });
  const description = t('meta.description', { coach });
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/${locale}`, languages: { fa: '/fa', en: '/en' } },
    openGraph: {
      type: 'website',
      siteName: (await getTranslations({ locale, namespace: 'common' }))('brand.name'),
      title,
      description,
      url: `/${locale}`,
      locale: locale === 'fa' ? 'fa_IR' : 'en_GB',
      alternateLocale: locale === 'fa' ? ['en_GB'] : ['fa_IR'],
    },
    twitter: { card: 'summary', title, description },
  };
}

/** A labelled block of the page. Labels sit above their content: sections are separated by space, not rules. */
function Section({ title, note, className, children }: { title: string; note?: string; className?: string; children: ReactNode }) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-5', className)}>
      <div>
        <SectionLabel>{title}</SectionLabel>
        {note ? <p className="mt-3 max-w-md text-sm text-ink-2">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default async function LandingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tc, settings, user, rules] = await Promise.all([
    getTranslations('landing'),
    getTranslations('common'),
    getCoachSettings(),
    getCurrentUser(),
    getAvailabilityRules(),
  ]);

  const coach = coachDisplayName(settings, locale);
  const bio = (locale === 'fa' ? settings.bioFa || settings.bioEn : settings.bioEn || settings.bioFa).trim();
  const location = (locale === 'fa' ? settings.locationFa || settings.locationEn : settings.locationEn || settings.locationFa).trim();

  // Signed-in visitors get their own door instead of a login link.
  const door = user
    ? { href: user.role === 'COACH' ? '/coach' : '/app', label: user.role === 'COACH' ? t('nav.openDashboard') : t('nav.openLog') }
    : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[70] focus:bg-ink focus:px-4 focus:py-3 focus:text-paper"
      >
        {tc('nav.skip')}
      </a>

      <header className="page-x flex items-center justify-between gap-2 py-3">
        <span className="text-lg font-extrabold font-expanded">{tc('brand.name')}</span>
        <nav aria-label={tc('nav.main')} className="flex items-center gap-1">
          <LocaleSwitch />
          <ThemeToggle />
          {door ? (
            <ButtonLink href={door.href} variant="outline" size="sm" className="ms-1">
              {door.label}
            </ButtonLink>
          ) : (
            <ButtonLink href="/login" variant="outline" size="sm" className="ms-1">
              {t('nav.login')}
            </ButtonLink>
          )}
        </nav>
      </header>

      <main id="main" tabIndex={-1} className="page-x flex flex-1 flex-col gap-10 pb-20 pt-8 focus:outline-none md:gap-14 md:pt-16">
        <div className="flex flex-col gap-5">
          <p className="label-caps text-ink-2">{tc('brand.tagline')}</p>
          <h1 className="text-balance text-[clamp(2.75rem,10.5vw,6.75rem)] font-extrabold leading-[1.02] font-expanded ltr:tracking-[-0.03em] rtl:font-black rtl:leading-[1.3]">
            {coach}
          </h1>
        </div>

        {/* Two columns on wide screens: words on the start side, objects (timetable, card) on the other.
            On a phone the order is lede, timetable, how it works, card, hours. */}
        <div className="flex flex-col gap-14 lg:grid lg:grid-cols-12 lg:gap-x-12">
          <div className="contents lg:col-span-5 lg:flex lg:flex-col lg:gap-14">
            <div className="order-1 flex flex-col gap-6 lg:order-none">
              <p className="max-w-[34ch] text-2xl font-semibold leading-snug text-ink rtl:leading-relaxed">{t('hero.lede')}</p>
              {bio ? <p className="max-w-prose text-base text-ink-2">{bio}</p> : null}
              {!user ? (
                settings.allowSignup ? (
                  <div>
                    <ButtonLink href="/register" variant="outline">
                      {t('nav.register')}
                    </ButtonLink>
                  </div>
                ) : (
                  <p className="text-sm text-ink-2">{t('hero.byInvitation')}</p>
                )
              ) : null}
            </div>
            <Section title={t('how.title')} className="order-3 lg:order-none">
              <HowItWorks locale={locale} cancelWindowHours={settings.cancelWindowHours} requireApproval={settings.requireApproval} />
            </Section>
            <Section title={t('hours.title')} className="order-5 lg:order-none">
              <HoursTable locale={locale} rules={rules} slotMinutes={settings.slotMinutes} location={location} />
            </Section>
          </div>
          <div className="contents lg:col-span-7 lg:flex lg:flex-col lg:gap-14">
            <div className="order-2 min-w-0 lg:order-none">
              <PublicWeekPreview locale={locale} />
            </div>
            <Section title={t('card.title')} note={t('card.caption')} className="order-4 lg:order-none">
              <TrainingCard data={sampleCard(locale, new Date())} locale={locale} />
            </Section>
          </div>
        </div>
      </main>

      <footer className="page-x flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pb-10">
        <p className="text-sm text-ink-2">
          <span className="font-extrabold font-expanded text-ink">{tc('brand.name')}</span>
          {locale === 'fa' ? '\u060c ' : ' \u00b7 '}
          {t('footer.note')}
        </p>
        <div className="flex items-center gap-1">
          <LocaleSwitch variant="button" />
          <ThemeToggle />
        </div>
      </footer>
    </div>
  );
}
