'use client';

import { useTranslations } from 'next-intl';
import { ButtonLink } from '@/components/ui/Button';
import { Stamp } from '@/components/ui/Stamp';
import { formatKg, formatNumber } from '@/lib/format';
import type { WorkoutSummaryDTO } from '@/lib/training/dto';
import { formatClock } from './clock';
import { loggedSetLabel } from './sets';
import { StatGrid } from './StatGrid';
import { TrainingCard, type TrainingCardData } from './TrainingCard';

/** The end-of-workout screen: what you did, in numbers, on the finished card, with the stamp. */
export function WorkoutSummary({
  summary,
  locale,
  prSets,
  card,
  coach,
}: {
  summary: WorkoutSummaryDTO;
  locale: string;
  prSets: { id: string; name: string; reps: number; weightKg: number }[];
  card: TrainingCardData;
  /** The coach ran this session: the way on is back to the client's page, not the client's own history. */
  coach?: { backHref: string; clientName: string };
}) {
  const t = useTranslations('training');
  const n = (v: number) => formatNumber(v, locale, { grouping: false });
  const stats = [
    { label: t('summary.sets'), value: n(summary.setCount) },
    { label: t('summary.volume'), value: formatKg(summary.volume, locale) },
    { label: t('summary.records'), value: n(summary.prCount) },
    { label: t('summary.time'), value: formatClock(summary.durationSec ?? 0, locale) },
  ];

  return (
    <div className="page-x flex flex-col gap-8 py-6 md:py-12 lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start lg:gap-10">
      <div className="flex min-w-0 flex-col gap-6">
        <header className="flex flex-col items-start gap-3">
          <Stamp status="COMPLETED" size="lg" label={t('summary.stamp')} />
          <h1 className="text-3xl">{t('summary.title')}</h1>
          <p className="text-base text-ink-2">
            {summary.setCount === 0
              ? t('summary.bodyEmpty')
              : coach
                ? t('coachMode.summaryBody', { name: coach.clientName })
                : t('summary.body')}
          </p>
        </header>

        <StatGrid items={stats} />

        {prSets.length > 0 ? (
          <section className="flex flex-col gap-3" aria-labelledby="summary-prs">
            <h2 id="summary-prs" className="label-caps text-ink-2">
              {t('summary.recordsTitle')}
            </h2>
            <ul className="border-[1.5px] border-rule-strong bg-card">
              {prSets.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3 last:border-b-0">
                  <span className="min-w-0 text-base font-semibold">
                    <bdi>{p.name}</bdi>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="num text-xl">{loggedSetLabel(t, p.reps, p.weightKg, locale)}</span>
                    <Stamp status="PR" size="sm" />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {summary.note ? (
          <p className="border-s-[3px] border-ink ps-3 text-base text-ink-2">{summary.note}</p>
        ) : null}

        {coach ? (
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={coach.backHref} variant="ink" size="lg">
              {t('coachMode.backToClient', { name: coach.clientName })}
            </ButtonLink>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={`/app/history/${summary.id}`} variant="ink" size="lg">
              {t('summary.seeHistory')}
            </ButtonLink>
            <ButtonLink href="/app" variant="outline" size="lg">
              {t('summary.backToday')}
            </ButtonLink>
          </div>
        )}
      </div>

      <aside aria-label={t('workout.cardLabel')}>
        <TrainingCard data={card} locale={locale} />
      </aside>
    </div>
  );
}
