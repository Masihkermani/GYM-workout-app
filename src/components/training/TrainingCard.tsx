import { useTranslations } from 'next-intl';
import { Tally } from '@/components/ui/Tally';
import { cn } from '@/lib/cn';
import { sepFor } from './sep';
import { formatDate, formatLoggedSet, formatNumber, formatSet } from '@/lib/format';

/**
 * The signature component (docs/DESIGN.md, "Training card"): the card a coach hands the client.
 * An ink header strip (client · program day · date) over ruled rows: exercise, target
 * (`3 x 8 @ 30 kg`), then one cell per set. Done sets show reps over weight and add a tally stroke;
 * sets still to do are dashed empty boxes; a record set carries a plate-red edge and "PR".
 *
 * Presentational and locale-driven (all numbers and the Jalali date go through src/lib/format.ts),
 * so it renders on the server (landing page, program list) and inside client components (live
 * logger, builder preview) alike.
 */
export type TrainingCardSet = { reps: number; weightKg: number; isPr?: boolean };
export type TrainingCardRow = {
  exerciseName: string;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax?: number | null;
  targetWeightKg?: number | null;
  sets: TrainingCardSet[];
};
export type TrainingCardData = {
  clientName: string;
  dayTitle: string;
  date: Date;
  rows: TrainingCardRow[];
};

function SetCell({ set, locale, label }: { set: TrainingCardSet | null; locale: string; label: string }) {
  const t = useTranslations('training');
  if (!set) {
    return (
      <li className="h-[2.875rem] min-w-[3.25rem] border border-dashed border-ink-3">
        <span className="sr-only">
          {label}: {t('card.todo')}
        </span>
      </li>
    );
  }
  return (
    <li
      className={cn(
        'relative flex h-[2.875rem] min-w-[3.25rem] flex-col items-center justify-center border px-1.5 leading-tight',
        set.isPr ? 'border-[1.5px] border-plate-red' : 'border-ink',
      )}
    >
      <span className="sr-only">
        {label}: {formatLoggedSet(set.reps, set.weightKg, locale)}
        {set.isPr ? `, ${t('card.record')}` : ''}
      </span>
      <span aria-hidden="true" className="num text-base">
        {formatNumber(set.reps, locale, { grouping: false })}
      </span>
      <span aria-hidden="true" className="num text-xs text-ink-2">
        {set.weightKg === 0 ? '—' : formatNumber(set.weightKg, locale)}
      </span>
      {set.isPr ? (
        <span
          aria-hidden="true"
          className="label-caps absolute -top-2.5 end-0.5 bg-plate-red px-1 !text-xs leading-tight text-on-red"
        >
          {t('card.recordShort')}
        </span>
      ) : null}
    </li>
  );
}

export function TrainingCard({ data, locale }: { data: TrainingCardData; locale: string }) {
  const t = useTranslations('training');
  return (
    <article
      aria-label={`${data.dayTitle} — ${data.clientName}`}
      className="border-[1.5px] border-rule-strong bg-card text-ink"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 bg-ink px-4 py-2.5 text-paper">
        <p className="min-w-0 text-base font-bold">
          <bdi>{data.clientName}</bdi>
          <span aria-hidden="true">{sepFor(locale)}</span>
          <bdi>{data.dayTitle}</bdi>
        </p>
        <p className="num shrink-0 text-base">{formatDate(data.date, locale, { style: 'medium' })}</p>
      </header>

      {data.rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-base text-ink-2">{t('card.empty')}</p>
      ) : (
        <ul>
          {data.rows.map((row, i) => {
            const cells = Math.max(row.targetSets, row.sets.length);
            const hasTarget = row.targetSets > 0;
            return (
              <li key={`${row.exerciseName}-${i}`} className="border-b border-rule px-4 py-3 last:border-b-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 text-base font-bold">
                    <bdi>{row.exerciseName}</bdi>
                  </p>
                  {hasTarget ? (
                    <p className="num shrink-0 text-lg text-ink-2">
                      {formatSet(
                        {
                          sets: row.targetSets,
                          reps: row.targetRepsMin,
                          repsMax: row.targetRepsMax,
                          weightKg: row.targetWeightKg,
                        },
                        locale,
                      )}
                    </p>
                  ) : null}
                </div>
                {cells > 0 ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <ol className="flex flex-wrap gap-2" aria-label={t('card.sets')}>
                      {Array.from({ length: cells }, (_, n) => (
                        <SetCell
                          key={n}
                          set={row.sets[n] ?? null}
                          locale={locale}
                          label={t('card.setN', { n: formatNumber(n + 1, locale, { grouping: false }) })}
                        />
                      ))}
                    </ol>
                    {row.sets.length > 0 ? (
                      <Tally
                        count={row.sets.length}
                        size={24}
                        label={t('card.done', { count: row.sets.length })}
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
