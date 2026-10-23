import { Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Stamp } from '@/components/ui/Stamp';
import { Link } from '@/i18n/navigation';
import { formatDate, formatKg, formatLoggedSet, formatNumber } from '@/lib/format';
import { getCoachSettings } from '@/lib/settings';
import { getClientTrainingOverview } from '@/lib/training/queries';
import { exerciseName } from '@/lib/training/types';
import { linearScale } from '@/lib/training/chart';
import type { WeeklyBucket } from '@/lib/training/weekly';
import { AuthorTag } from './AuthorTag';
import { joinFacts, sepFor } from './sep';
import { Sparkline } from './Sparkline';

function MiniVolume({ weeks, rtl, label }: { weeks: WeeklyBucket[]; rtl: boolean; label: string }) {
  const w = 176;
  const h = 44;
  const max = Math.max(...weeks.map((b) => b.volume), 1);
  const slot = w / weeks.length;
  const sy = linearScale([0, max], [h - 2, 4]);
  return (
    <svg role="img" aria-label={label} width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <line x1={0} x2={w} y1={h - 1} y2={h - 1} className="stroke-ink-3" strokeWidth={1} />
      {weeks.map((b, i) => {
        const x = rtl ? w - slot * (i + 1) : slot * i;
        const y = sy(b.volume);
        return b.volume > 0 ? (
          <rect key={b.weekStartKey} x={x + 3} y={y} width={slot - 6} height={h - 1 - y} className={i === weeks.length - 1 ? 'fill-ink' : 'fill-plate-blue'} />
        ) : null;
      })}
    </svg>
  );
}

/**
 * Coach client page, training half: the client's programs (links into the builder), their latest
 * workouts (expandable to the sets) and a mini progress read-out (top lifts, eight weeks of volume).
 */
export async function ClientTrainingPanel({ clientId, locale }: { clientId: string; locale: string }) {
  const settings = await getCoachSettings();
  const timeZone = settings.timezone;
  const [t, data] = await Promise.all([
    getTranslations({ locale, namespace: 'training' }),
    getClientTrainingOverview(clientId, { locale, timeZone }),
  ]);
  const n = (v: number) => formatNumber(v, locale, { grouping: false });
  const rtl = locale === 'fa';
  const active = data.programs.filter((p) => p.active);
  const archived = data.programs.filter((p) => !p.active);

  const programRow = (p: (typeof data.programs)[number]) => {
    const items = p.days.reduce((sum, d) => sum + d.items.length, 0);
    return (
      <li key={p.id} className="border-b border-rule last:border-b-0">
        <Link
          href={`/coach/clients/${clientId}/programs/${p.id}`}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 tx hover:bg-paper-2"
        >
          <span className="min-w-0">
            <span className="block text-base font-bold">
              <bdi>{p.title}</bdi>
            </span>
            <span className="block text-sm text-ink-2">
              {joinFacts(
                [
                  t('program.days', { count: p.days.length, n: n(p.days.length) }),
                  t('panel.exercises', { count: items, n: n(items) }),
                  t('program.updated', { date: formatDate(p.updatedAt, locale, { style: 'medium', timeZone }) }),
                ],
                locale,
              )}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <AuthorTag authorRole={p.authorRole} viewer="coach" />
            <Stamp status={p.active ? 'CONFIRMED' : 'CANCELLED'} size="sm" label={p.active ? t('panel.active') : t('panel.archived')} />
          </span>
        </Link>
      </li>
    );
  };

  return (
    <section className="flex flex-col gap-8" aria-label={t('panel.title')}>
      {/* programs ------------------------------------------------------------------------- */}
      <div className="flex flex-col gap-3">
        <SectionLabel
          action={
            <ButtonLink href={`/coach/clients/${clientId}/programs/new`} variant="ink" size="sm">
              <Plus className="size-4" aria-hidden="true" />
              {t('panel.newProgram')}
            </ButtonLink>
          }
        >
          {t('panel.programs')}
        </SectionLabel>
        {data.programs.length === 0 ? (
          <EmptyState title={t('panel.noProgramsTitle')} description={t('panel.noProgramsBody')} />
        ) : (
          <>
            {active.length > 0 ? <ul className="border-[1.5px] border-rule-strong bg-card">{active.map(programRow)}</ul> : null}
            {archived.length > 0 ? (
              <details className="border-[1.5px] border-rule-strong bg-card">
                <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">
                  {t('panel.archivedPrograms', { count: archived.length, n: n(archived.length) })}
                </summary>
                <ul className="border-t border-rule">{archived.map(programRow)}</ul>
              </details>
            ) : null}
          </>
        )}
      </div>

      {/* recent workouts ------------------------------------------------------------------- */}
      <div className="flex flex-col gap-3">
        <SectionLabel>{t('panel.recent')}</SectionLabel>
        {data.workouts.length === 0 ? (
          <EmptyState title={t('panel.noWorkoutsTitle')} description={t('panel.noWorkoutsBody')} />
        ) : (
          <ul className="border-[1.5px] border-rule-strong bg-card">
            {data.workouts.map((w) => (
              <li key={w.id} className="border-b border-rule last:border-b-0">
                <details className="group">
                  <summary className="flex min-h-14 cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 tx hover:bg-paper-2">
                    <span className="min-w-0">
                      <span className="block text-base font-bold">
                        <bdi>{w.dayTitle ?? t('workout.free')}</bdi>
                      </span>
                      <span className="block text-sm text-ink-2">{formatDate(w.startedAt, locale, { style: 'long', timeZone })}</span>
                    </span>
                    <span className="num flex items-center gap-3 text-base text-ink-2">
                      {w.prCount > 0 ? <Stamp status="PR" size="sm" label={t('history.prCount', { count: w.prCount, n: n(w.prCount) })} /> : null}
                      {joinFacts([t('history.sets', { count: w.setCount, n: n(w.setCount) }), formatKg(w.volume, locale)], locale)}
                    </span>
                  </summary>
                  <div className="border-t border-rule bg-paper px-4 py-3">
                    {w.note ? <p className="mb-3 border-s-[3px] border-ink ps-3 text-base text-ink-2">{w.note}</p> : null}
                    <dl className="grid gap-2">
                      {w.exercises.map((e) => (
                        <div key={e.exercise.id} className="grid gap-0.5 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-4">
                          <dt className="text-base font-semibold">
                            <bdi>{exerciseName(e.exercise, locale)}</bdi>
                          </dt>
                          <dd className="num text-base text-ink-2">
                            {e.sets.map((s) => formatLoggedSet(s.reps, s.weightKg, locale)).join(locale === 'fa' ? '، ' : ', ')}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
        {data.totalWorkouts > data.workouts.length ? (
          <p className="text-sm text-ink-2">{t('panel.moreWorkouts', { count: data.totalWorkouts - data.workouts.length })}</p>
        ) : null}
      </div>

      {/* progress ---------------------------------------------------------------------------- */}
      <div className="flex flex-col gap-3">
        <SectionLabel>{t('panel.progress')}</SectionLabel>
        {data.lifts.length === 0 ? (
          <EmptyState title={t('panel.noProgressTitle')} description={t('panel.noProgressBody')} />
        ) : (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <ul className="border-[1.5px] border-rule-strong bg-card">
              {data.lifts.map((l) => (
                <li key={l.exercise.id} className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3 last:border-b-0">
                  <span className="min-w-0">
                    <span className="block truncate text-base font-bold">
                      <bdi>{exerciseName(l.exercise, locale)}</bdi>
                    </span>
                    <span className="block text-sm text-ink-2">
                      {t('panel.e1rm')}
                      {l.delta != null ? (
                        <span className="num">
                          {sepFor(locale)}
                          <bdi dir="ltr">
                            {l.delta > 0 ? '+' : ''}
                            {formatNumber(l.delta, locale, { maxFractionDigits: 1 })}
                          </bdi>
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <Sparkline values={l.points} rtl={rtl} />
                    <span className="num w-20 text-end text-xl">{formatKg(l.current, locale)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-ink-2">{t('panel.weekly')}</p>
              <MiniVolume weeks={data.weekly} rtl={rtl} label={t('panel.weeklyAlt', { n: n(data.weekly.length) })} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
