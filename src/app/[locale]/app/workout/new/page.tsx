import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/Button';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { requireUser } from '@/lib/auth';
import { dayToCardData } from '@/lib/training/card';
import { getLinkableBooking, getOpenWorkout, listPrograms } from '@/lib/training/queries';
import { StartWorkoutButton } from '@/components/training/StartWorkoutButton';
import { TrainingCard } from '@/components/training/TrainingCard';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'training' });
  return { title: t('workout.newTitle') };
}

/**
 * Where "start a workout" lands. Nothing is created by opening this page (a GET must not write):
 * the buttons call the server action. `?day=<programDayId>` previews that day with a Start button.
 */
export default async function NewWorkoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { locale } = await params;
  const { day: dayParam } = await searchParams;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const [t, open, programs, bookingId] = await Promise.all([
    getTranslations({ locale, namespace: 'training' }),
    getOpenWorkout(user.id),
    listPrograms(user.id, { active: true }),
    getLinkableBooking(user.id),
  ]);

  const days = programs.flatMap((p) => p.days.map((d) => ({ program: p, day: d })));
  const chosen = dayParam ? days.find((d) => d.day.id === dayParam) : undefined;

  return (
    <div className="page-x flex flex-col gap-8 py-8 md:py-12">
      <SectionLabel as="h1">{t('workout.newTitle')}</SectionLabel>

      {open ? (
        <div className="flex flex-col gap-3 border-[1.5px] border-rule-strong bg-card p-4">
          <p className="text-lg font-bold">{t('todayCard.openTitle')}</p>
          <p className="text-base text-ink-2">{open.dayTitle ?? t('workout.free')}</p>
          <div>
            <ButtonLink href={`/app/workout/${open.id}`} variant="ink" size="lg">
              {t('todayCard.continue')}
            </ButtonLink>
          </div>
        </div>
      ) : null}

      {chosen ? (
        <div className="flex max-w-xl flex-col gap-4">
          <TrainingCard
            locale={locale}
            data={dayToCardData({
              clientName: user.name,
              dayTitle: chosen.day.title,
              date: new Date(),
              locale,
              items: chosen.day.items.map((i) => ({
                exercise: i.exercise,
                targetSets: i.targetSets,
                targetRepsMin: i.targetRepsMin,
                targetRepsMax: i.targetRepsMax,
                targetWeightKg: i.targetWeightKg,
              })),
            })}
          />
          <StartWorkoutButton dayId={chosen.day.id} bookingId={bookingId} label={t('program.startDay')} variant="primary" size="xl" fullWidth />
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <section className="flex flex-col gap-3" aria-label={t('workout.freeTitle')}>
            <SectionLabel>{t('workout.freeTitle')}</SectionLabel>
            <p className="text-base text-ink-2">{t('workout.freeBody')}</p>
            <div>
              <StartWorkoutButton label={t('workout.startFree')} variant={days.length ? 'outline' : 'primary'} size="lg" bookingId={bookingId} />
            </div>
          </section>

          {days.length > 0 ? (
            <section className="flex flex-col gap-3" aria-label={t('workout.fromProgram')}>
              <SectionLabel>{t('workout.fromProgram')}</SectionLabel>
              <ul className="border-[1.5px] border-rule-strong bg-card">
                {days.map(({ program, day }) => (
                  <li key={day.id} className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3 last:border-b-0">
                    <span className="min-w-0">
                      <span className="block text-base font-bold">
                        <bdi>{day.title}</bdi>
                      </span>
                      <span className="block truncate text-sm text-ink-2">
                        <bdi>{program.title}</bdi>
                      </span>
                    </span>
                    <StartWorkoutButton dayId={day.id} bookingId={bookingId} label={t('workout.start')} variant="ink" size="sm" icon={false} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
