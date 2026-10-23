import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Stamp } from '@/components/ui/Stamp';
import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/auth';
import { formatDate, formatKg, formatLoggedSet, formatNumber } from '@/lib/format';
import { getCoachSettings } from '@/lib/settings';
import { round1 } from '@/lib/training/e1rm';
import { getProgressData } from '@/lib/training/queries';
import { exerciseName, exerciseSubName } from '@/lib/training/types';
import { E1rmChart } from '@/components/training/E1rmChart';
import { ExerciseSelect } from '@/components/training/ExerciseSelect';
import { StatGrid } from '@/components/training/StatGrid';
import { VolumeBars } from '@/components/training/VolumeBars';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'training' });
  return { title: t('progress.title') };
}

export default async function ProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ exercise?: string }>;
}) {
  const { locale } = await params;
  const { exercise } = await searchParams;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const settings = await getCoachSettings();
  const timeZone = settings.timezone;
  const [t, data] = await Promise.all([
    getTranslations({ locale, namespace: 'training' }),
    getProgressData(user.id, exercise ?? null, { locale, timeZone, weeks: 10 }),
  ]);
  const n = (v: number) => formatNumber(v, locale, { grouping: false });

  if (!data.selected) {
    return (
      <div className="page-x flex flex-col gap-6 py-8 md:py-12">
        <SectionLabel as="h1">{t('progress.title')}</SectionLabel>
        <EmptyState
          title={t('progress.emptyTitle')}
          description={t('progress.emptyBody')}
          action={
            <ButtonLink href="/app/workout/new" variant="primary">
              {t('workout.startFree')}
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const sel = data.selected.exercise;
  const prWorkouts = new Set(data.prs.map((p) => p.workoutId));
  const points = data.series.map((p) => ({ date: p.date, e1rm: p.e1rm, reps: p.reps, weightKg: p.weightKg, pr: prWorkouts.has(p.workoutId) }));
  const current = data.series.length ? data.series[data.series.length - 1].e1rm : null;
  const delta = current != null && data.firstE1rm != null && data.series.length > 1 ? round1(current - data.firstE1rm) : null;

  const stats = [
    { label: t('progress.statCurrent'), value: current != null ? formatKg(round1(current), locale) : '—' },
    { label: t('progress.statBest'), value: data.bestE1rm != null ? formatKg(round1(data.bestE1rm), locale) : '—' },
    {
      label: t('progress.statChange'),
      value:
        delta != null ? (
          <bdi dir="ltr">
            {delta > 0 ? '+' : ''}
            {formatNumber(delta, locale, { maxFractionDigits: 1 })}
          </bdi>
        ) : (
          '—'
        ),
    },
    { label: t('progress.statSessions'), value: n(data.selected.workouts) },
  ];

  return (
    <div className="page-x flex flex-col gap-10 py-8 md:py-12">
      <header className="flex flex-col gap-4">
        <SectionLabel as="h1">{t('progress.title')}</SectionLabel>
        <div className="max-w-md">
          <ExerciseSelect options={data.options} value={sel.id} locale={locale} />
        </div>
      </header>

      <section className="flex flex-col gap-4" aria-labelledby="strength">
        <div>
          <h2 id="strength" className="text-2xl">
            {t('progress.strength')}
          </h2>
          <p className="mt-1 text-base text-ink-2">
            <bdi>{exerciseName(sel, locale)}</bdi>
            {exerciseSubName(sel, locale) ? (
              <span lang="en" dir="ltr" className="block w-fit text-sm">
                {exerciseSubName(sel, locale)}
              </span>
            ) : null}
          </p>
        </div>
        <StatGrid items={stats} />
        {points.length === 0 ? (
          <p className="border-[1.5px] border-dashed border-ink-3 px-4 py-8 text-center text-base text-ink-2">{t('progress.noE1rm')}</p>
        ) : (
          <div className="border-[1.5px] border-rule-strong bg-card p-3 md:p-5">
            <E1rmChart points={points} locale={locale} timeZone={timeZone} exerciseLabel={exerciseName(sel, locale)} />
          </div>
        )}
        <p className="max-w-prose text-sm text-ink-2">{t('progress.e1rmHint')}</p>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="records">
        <h2 id="records" className="text-2xl">
          {t('progress.records')}
        </h2>
        {data.prs.length === 0 ? (
          <p className="border-[1.5px] border-dashed border-ink-3 px-4 py-6 text-base text-ink-2">{t('progress.noRecords')}</p>
        ) : (
          <ul className="border-[1.5px] border-rule-strong bg-card">
            {data.prs.slice(0, 8).map((p) => (
              <li key={p.setId} className="border-b border-rule last:border-b-0">
                <Link
                  href={`/app/history/${p.workoutId}`}
                  className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 tx hover:bg-paper-2"
                >
                  <span className="flex items-center gap-3">
                    <Stamp status="PR" size="sm" />
                    <span className="num text-xl">{formatLoggedSet(p.reps, p.weightKg, locale)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-4 text-sm text-ink-2">
                    <span>
                      {p.flag.weight && p.flag.e1rm
                        ? t('progress.prBoth', { reps: n(p.reps) })
                        : p.flag.weight
                          ? t('progress.prWeight', { reps: n(p.reps) })
                          : t('progress.prE1rm')}
                    </span>
                    <span className="num">{formatDate(p.date, locale, { style: 'medium', timeZone })}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {data.repBests.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="label-caps text-ink-2">{t('progress.bestByReps')}</h3>
            <div className="overflow-x-auto border-[1.5px] border-rule-strong bg-card">
              <table className="w-full text-start">
                <caption className="sr-only">{t('progress.bestByReps')}</caption>
                <thead>
                  <tr className="border-b-[1.5px] border-rule-strong text-sm text-ink-2">
                    <th scope="col" className="px-4 py-2 text-start font-semibold">{t('progress.colReps')}</th>
                    <th scope="col" className="px-4 py-2 text-start font-semibold">{t('progress.colHeaviest')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.repBests.map((r) => (
                    <tr key={r.reps} className="border-b border-rule last:border-b-0">
                      <th scope="row" className="num px-4 py-2 text-start text-lg font-bold">{n(r.reps)}</th>
                      <td className="num px-4 py-2 text-lg">{r.weightKg === 0 ? t('progress.bodyweight') : formatKg(r.weightKg, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="weekly">
        <div>
          <h2 id="weekly" className="text-2xl">
            {t('progress.weekly')}
          </h2>
          <p className="mt-1 text-base text-ink-2">{t('progress.weeklyHint', { weeks: n(data.weekly.length) })}</p>
        </div>
        <div className="border-[1.5px] border-rule-strong bg-card p-3 md:p-5">
          <VolumeBars weeks={data.weekly} locale={locale} />
        </div>
      </section>
    </div>
  );
}
