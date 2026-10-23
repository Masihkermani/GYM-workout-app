import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/Button';
import { DirIcon } from '@/components/ui/DirIcon';
import { Link } from '@/i18n/navigation';
import { Stamp } from '@/components/ui/Stamp';
import { requireUser } from '@/lib/auth';
import { formatDate, formatKg, formatLoggedSet, formatNumber } from '@/lib/format';
import { getCoachSettings } from '@/lib/settings';
import { round1 } from '@/lib/training/e1rm';
import { dayToCardData } from '@/lib/training/card';
import { getWorkoutDetail } from '@/lib/training/queries';
import { exerciseName, exerciseSubName } from '@/lib/training/types';
import { formatClock } from '@/components/training/clock';
import { sepFor } from '@/components/training/sep';
import { StatGrid } from '@/components/training/StatGrid';
import { TrainingCard, type TrainingCardData } from '@/components/training/TrainingCard';
import { WorkoutDetailActions } from '@/components/training/WorkoutDetailActions';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'training' });
  return { title: t('detail.title') };
}

export default async function WorkoutDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const [t, settings, w] = await Promise.all([
    getTranslations({ locale, namespace: 'training' }),
    getCoachSettings(),
    getWorkoutDetail(id),
  ]);
  if (!w || (user.role !== 'COACH' && w.clientId !== user.id)) notFound();
  const timeZone = settings.timezone;
  const n = (v: number) => formatNumber(v, locale, { grouping: false });
  const viewingOther = w.clientId !== user.id;

  const card: TrainingCardData = {
    ...dayToCardData({ clientName: w.clientName, dayTitle: w.dayTitle ?? t('workout.free'), date: new Date(w.startedAt), items: [], locale }),
    rows: w.exercises.map((e) => ({
      exerciseName: exerciseName(e.exercise, locale),
      targetSets: e.target?.sets ?? 0,
      targetRepsMin: e.target?.repsMin ?? 0,
      targetRepsMax: e.target?.repsMax ?? null,
      targetWeightKg: e.target?.weightKg ?? null,
      sets: e.sets.filter((s) => !s.isWarmup).map((s) => ({ reps: s.reps, weightKg: s.weightKg, isPr: s.pr != null })),
    })),
  };

  const stats = [
    { label: t('summary.sets'), value: n(w.setCount) },
    { label: t('summary.volume'), value: formatKg(w.volume, locale) },
    { label: t('summary.records'), value: n(w.prCount) },
    { label: t('summary.time'), value: w.durationSec != null ? formatClock(w.durationSec, locale) : '—' },
  ];

  return (
    <div className="page-x flex flex-col gap-8 py-6 md:py-10">
      <div>
        <Link
          href={viewingOther ? `/coach/clients/${w.clientId}` : '/app/history'}
          className="-ms-2 inline-flex min-h-11 items-center gap-1.5 rounded-[var(--r)] px-2 text-base font-semibold tx hover:bg-paper-2"
        >
          <DirIcon name="chevron-back" className="size-5" />
          {viewingOther ? t('detail.backClient', { name: w.clientName }) : t('detail.back')}
        </Link>
      </div>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl">
            <bdi>{w.dayTitle ?? t('workout.free')}</bdi>
          </h1>
          {w.finishedAt ? <Stamp status="COMPLETED" label={t('detail.finished')} /> : <Stamp status="PENDING" label={t('history.unfinished')} />}
        </div>
        <p className="text-base text-ink-2">
          {formatDate(w.startedAt, locale, { style: 'long', timeZone })}
          {w.programTitle ? (
            <>
              {sepFor(locale)}
              <bdi>{w.programTitle}</bdi>
            </>
          ) : null}
        </p>
        {viewingOther ? <p className="text-sm text-ink-2">{t('detail.of', { name: w.clientName })}</p> : null}
      </header>

      {!w.finishedAt && !viewingOther ? (
        <div>
          <ButtonLink href={`/app/workout/${w.id}`} variant="primary" size="lg">
            {t('todayCard.continue')}
          </ButtonLink>
        </div>
      ) : null}

      <StatGrid items={stats} />

      {w.note ? <p className="max-w-prose border-s-[3px] border-ink ps-3 text-base text-ink-2">{w.note}</p> : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start lg:gap-10">
        <div className="flex min-w-0 flex-col gap-6">
          {w.exercises.length === 0 ? (
            <p className="border-[1.5px] border-dashed border-ink-3 px-4 py-8 text-center text-base text-ink-2">{t('detail.noSets')}</p>
          ) : (
            w.exercises.map((e) => {
              const sub = exerciseSubName(e.exercise, locale);
              return (
                <section key={e.exercise.id} className="flex flex-col gap-2" aria-labelledby={`ex-${e.exercise.id}`}>
                  <div>
                    <h2 id={`ex-${e.exercise.id}`} className="text-xl">
                      <bdi>{exerciseName(e.exercise, locale)}</bdi>
                    </h2>
                    {sub ? (
                      <p lang="en" dir="ltr" className="w-fit text-sm text-ink-2">
                        {sub}
                      </p>
                    ) : null}
                  </div>
                  <div className="overflow-x-auto border-[1.5px] border-rule-strong bg-card">
                    <table className="w-full text-start">
                      <caption className="sr-only">{exerciseName(e.exercise, locale)}</caption>
                      <thead>
                        <tr className="border-b-[1.5px] border-rule-strong text-sm text-ink-2">
                          <th scope="col" className="px-3 py-2 text-start font-semibold">{t('detail.colSet')}</th>
                          <th scope="col" className="px-3 py-2 text-start font-semibold">{t('detail.colLift')}</th>
                          <th scope="col" className="px-3 py-2 text-start font-semibold">{t('detail.colE1rm')}</th>
                          <th scope="col" className="px-3 py-2 text-start font-semibold">{t('detail.colRpe')}</th>
                          <th scope="col" className="px-3 py-2 text-start font-semibold"><span className="sr-only">{t('detail.colFlags')}</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          let working = 0;
                          return e.sets.map((s) => {
                            if (!s.isWarmup) working += 1;
                            return (
                              <tr key={s.id} className="border-b border-rule last:border-b-0">
                                <th scope="row" className="num px-3 py-2 text-start text-lg font-bold text-ink-2">
                                  {s.isWarmup ? t('logger.warmupShort') : n(working)}
                                </th>
                                <td className="num px-3 py-2 text-lg">{formatLoggedSet(s.reps, s.weightKg, locale)}</td>
                                <td className="num px-3 py-2 text-base text-ink-2">{s.e1rm != null ? formatNumber(round1(s.e1rm), locale, { maxFractionDigits: 1 }) : '—'}</td>
                                <td className="num px-3 py-2 text-base text-ink-2">{s.rpe != null ? formatNumber(s.rpe, locale) : '—'}</td>
                                <td className="px-3 py-2 text-end">
                                  <span className="inline-flex flex-wrap items-center justify-end gap-2">
                                    {s.isWarmup ? <span className="label-caps text-ink-2">{t('logger.warmupTag')}</span> : null}
                                    {s.pr ? <Stamp status="PR" size="sm" /> : null}
                                  </span>
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })
          )}
          <WorkoutDetailActions workoutId={w.id} note={w.note} />
        </div>

        <aside className="lg:sticky lg:top-6" aria-label={t('workout.cardLabel')}>
          <TrainingCard data={card} locale={locale} />
        </aside>
      </div>
    </div>
  );
}
