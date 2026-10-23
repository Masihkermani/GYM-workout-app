import { getTranslations } from 'next-intl/server';
import { Stamp } from '@/components/ui/Stamp';
import { DirIcon } from '@/components/ui/DirIcon';
import { Link } from '@/i18n/navigation';
import { formatDate, formatKg, formatNumber } from '@/lib/format';
import type { WorkoutSummaryDTO } from '@/lib/training/dto';
import { joinFacts } from './sep';

/** Finished (and still-open) workouts as ruled rows: date, day title, sets, volume, record count. */
export async function WorkoutList({
  items,
  locale,
  timeZone,
  hrefBase = '/app/history',
}: {
  items: WorkoutSummaryDTO[];
  locale: string;
  timeZone: string;
  hrefBase?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'training' });
  const n = (v: number) => formatNumber(v, locale, { grouping: false });
  return (
    <ul className="border-[1.5px] border-rule-strong bg-card">
      {items.map((w) => (
        <li key={w.id} className="border-b border-rule last:border-b-0">
          <Link href={`${hrefBase}/${w.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 tx hover:bg-paper-2">
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-base font-bold">
                  <bdi>{w.dayTitle ?? t('workout.free')}</bdi>
                </span>
                {!w.finishedAt ? <span className="label-caps text-ink-2">{t('history.unfinished')}</span> : null}
              </span>
              <span className="block text-sm text-ink-2">
                {formatDate(w.startedAt, locale, { style: 'long', timeZone })}
              </span>
              <span className="num mt-0.5 block text-base text-ink-2">
                {joinFacts([t('history.sets', { count: w.setCount, n: n(w.setCount) }), formatKg(w.volume, locale)], locale)}
              </span>
            </span>
            {w.prCount > 0 ? <Stamp status="PR" size="sm" label={t('history.prCount', { count: w.prCount, n: n(w.prCount) })} /> : null}
            <DirIcon name="chevron-forward" className="size-5 shrink-0 text-ink-3" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
