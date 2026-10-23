import { Play } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Stamp } from '@/components/ui/Stamp';
import { prisma } from '@/lib/db';
import { formatDate, formatNumber } from '@/lib/format';
import { dayToCardData } from '@/lib/training/card';
import { getLinkableBooking, getNextProgramDay, getOpenWorkout } from '@/lib/training/queries';
import { getCoachSettings } from '@/lib/settings';
import { AuthorTag } from './AuthorTag';
import { joinFacts } from './sep';
import { StartWorkoutButton } from './StartWorkoutButton';
import { TrainingCard } from './TrainingCard';

/**
 * Client Today page: the next program day with a Start button, or "Continue" for a workout that is
 * still open. The workout links itself to a confirmed session happening about now.
 */
export async function TodayWorkoutCard({ userId, locale }: { userId: string; locale: string }) {
  const [t, settings, user] = await Promise.all([
    getTranslations({ locale, namespace: 'training' }),
    getCoachSettings(),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
  ]);
  const timeZone = settings.timezone;
  const [open, next, bookingId] = await Promise.all([
    getOpenWorkout(userId),
    getNextProgramDay(userId, timeZone),
    getLinkableBooking(userId),
  ]);
  const n = (v: number) => formatNumber(v, locale, { grouping: false });

  if (open) {
    return (
      <section className="flex flex-col gap-4" aria-label={t('todayCard.label')}>
        <SectionLabel>{t('todayCard.label')}</SectionLabel>
        <div className="flex flex-col gap-4 border-[1.5px] border-rule-strong bg-card p-4">
          <div>
            <p className="text-xl font-extrabold">{t('todayCard.openTitle')}</p>
            <p className="mt-1 text-base text-ink-2">
              {joinFacts(
                [
                  open.dayTitle ?? t('workout.free'),
                  t('todayCard.openSets', { count: open.setCount, n: n(open.setCount) }),
                  t('todayCard.startedAt', { date: formatDate(open.startedAt, locale, { style: 'short', timeZone }) }),
                ],
                locale,
              )}
            </p>
          </div>
          <div>
            <ButtonLink href={`/app/workout/${open.id}`} variant="primary" size="lg" fullWidth>
              <Play className="size-5 rtl:-scale-x-100" aria-hidden="true" />
              {t('todayCard.continue')}
            </ButtonLink>
          </div>
        </div>
      </section>
    );
  }

  if (!next) {
    return (
      <section className="flex flex-col gap-4" aria-label={t('todayCard.label')}>
        <SectionLabel>{t('todayCard.label')}</SectionLabel>
        <EmptyState
          title={t('todayCard.noneTitle')}
          description={t('todayCard.noneBody')}
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <StartWorkoutButton label={t('todayCard.free')} variant="primary" size="md" bookingId={bookingId} />
              <ButtonLink href="/app/program/new" variant="outline">
                {t('todayCard.writeOwn')}
              </ButtonLink>
            </div>
          }
        />
      </section>
    );
  }

  const { program, day } = next;
  const card = dayToCardData({
    clientName: user?.name ?? '',
    dayTitle: day.title,
    date: new Date(),
    locale,
    items: day.items.map((i) => ({
      exercise: i.exercise,
      targetSets: i.targetSets,
      targetRepsMin: i.targetRepsMin,
      targetRepsMax: i.targetRepsMax,
      targetWeightKg: i.targetWeightKg,
    })),
  });

  return (
    <section className="flex flex-col gap-4" aria-label={t('todayCard.label')}>
      <SectionLabel>{t('todayCard.label')}</SectionLabel>

      {next.trainedToday ? (
        <div className="flex flex-wrap items-center gap-3 border-[1.5px] border-plate-green bg-card px-4 py-3">
          <Stamp status="COMPLETED" />
          <p className="min-w-0 flex-1 text-base">
            <span className="font-bold">{t('todayCard.doneTitle')}</span> {t('todayCard.doneBody')}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <AuthorTag authorRole={program.authorRole} />
        <p className="min-w-0 text-sm text-ink-2">
          {joinFacts(
            [
              program.title,
              t('todayCard.dayOf', { n: n(next.dayNumber), total: n(program.days.length) }),
              next.lastDoneAt ? t('todayCard.lastDone', { date: formatDate(next.lastDoneAt, locale, { style: 'short', timeZone }) }) : null,
            ],
            locale,
          )}
        </p>
      </div>

      <TrainingCard data={card} locale={locale} />

      {bookingId ? <p className="text-sm text-ink-2">{t('todayCard.linked')}</p> : null}
      <StartWorkoutButton
        dayId={day.id}
        bookingId={bookingId}
        label={next.trainedToday ? t('todayCard.startAnyway', { day: day.title }) : t('todayCard.start')}
        variant={next.trainedToday ? 'outline' : 'primary'}
        size="xl"
        fullWidth
      />
    </section>
  );
}
