import { Trophy } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NextBookingCard } from '@/components/booking/NextBookingCard';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Stamp } from '@/components/ui/Stamp';
import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/auth';
import { formatDate, formatKg } from '@/lib/format';
import { getCoachSettings } from '@/lib/settings';
import { getRecentPr, listWorkoutSummaries } from '@/lib/training/queries';
import { round1 } from '@/lib/training/e1rm';
import { exerciseName } from '@/lib/training/types';
import { loggedSetLabel } from '@/components/training/sets';
import { TodayWorkoutCard } from '@/components/training/TodayWorkoutCard';
import { WorkoutList } from '@/components/training/WorkoutList';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'training' });
  return { title: t('today.title') };
}

export default async function TodayPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const [t, settings] = await Promise.all([getTranslations({ locale, namespace: 'training' }), getCoachSettings()]);
  const timeZone = settings.timezone;
  const [last, pr] = await Promise.all([listWorkoutSummaries(user.id, { take: 1 }), getRecentPr(user.id, 21)]);
  const first = user.name.trim().split(/\s+/)[0] ?? user.name;

  return (
    <div className="page-x flex flex-col gap-8 py-8 md:py-12">
      <header className="flex flex-col gap-2">
        <SectionLabel as="h1">{t('today.title')}</SectionLabel>
        <p className="text-2xl font-extrabold">{t('today.hello', { name: first })}</p>
        <p className="text-base text-ink-2">{formatDate(new Date(), locale, { style: 'long', timeZone })}</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-12">
        <div className="flex min-w-0 flex-col gap-8">
          <NextBookingCard userId={user.id} locale={locale} />
          <TodayWorkoutCard userId={user.id} locale={locale} />
        </div>

        <div className="flex min-w-0 flex-col gap-8">
          <section className="flex flex-col gap-3" aria-label={t('today.last')}>
            <SectionLabel
              action={
                <Link href="/app/history" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
                  {t('today.allHistory')}
                </Link>
              }
            >
              {t('today.last')}
            </SectionLabel>
            {last.items.length === 0 ? (
              <p className="border-[1.5px] border-dashed border-ink-3 px-4 py-6 text-base text-ink-2">{t('today.lastEmpty')}</p>
            ) : (
              <WorkoutList items={last.items} locale={locale} timeZone={timeZone} />
            )}
          </section>

          {pr ? (
            <section className="flex flex-col gap-3" aria-label={t('today.record')}>
              <SectionLabel>{t('today.record')}</SectionLabel>
              <Link
                href={`/app/history/${pr.workoutId}`}
                className="flex flex-col gap-2 border-[1.5px] border-rule-strong bg-card p-4 tx hover:bg-paper-2"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0 text-base font-bold">
                    <bdi>{exerciseName(pr.exercise, locale)}</bdi>
                  </span>
                  <Stamp status="PR" />
                </span>
                <span className="num text-3xl">{loggedSetLabel(t, pr.reps, pr.weightKg, locale)}</span>
                <span className="flex flex-wrap items-center gap-x-3 text-sm text-ink-2">
                  <Trophy className="size-4" aria-hidden="true" />
                  {pr.e1rm != null ? (
                    <span>{t('today.recordE1rm', { kg: formatKg(round1(pr.e1rm), locale) })}</span>
                  ) : null}
                  <span>{formatDate(pr.date, locale, { style: 'medium', timeZone })}</span>
                </span>
              </Link>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
