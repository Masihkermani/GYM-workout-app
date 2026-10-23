import type { Metadata } from 'next';
import { SearchX } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AddExerciseSheet } from '@/components/coach/AddExerciseSheet';
import { ExerciseEditor } from '@/components/coach/ExerciseEditor';
import { ExerciseFilters } from '@/components/coach/ExerciseFilters';
import { ExercisesTable } from '@/components/coach/ExercisesTable';
import { PageHeader } from '@/components/coach/PageHeader';
import {
  EXERCISE_PAGE_SIZE,
  getExerciseDetail,
  getTaxonomy,
  listExercises,
  type ExerciseShow,
} from '@/components/coach/queries';
import { taxonomyDict, taxonomyLabel } from '@/components/coach/taxonomy';
import { DirIcon } from '@/components/ui/DirIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Link } from '@/i18n/navigation';
import { requireCoach } from '@/lib/auth';
import { formatNumber } from '@/lib/format';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'coach' });
  return { title: t('exercises.title'), robots: { index: false } };
}

export default async function CoachExercisesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireCoach(locale);

  const sp = await searchParams;
  const q = (first(sp.q) ?? '').slice(0, 80);
  const bodyPart = (first(sp.bodyPart) ?? '').slice(0, 60);
  const equipment = (first(sp.equipment) ?? '').slice(0, 60);
  const showRaw = first(sp.show);
  const show: ExerciseShow = showRaw === 'archived' || showRaw === 'all' ? showRaw : 'active';
  const custom = first(sp.custom) === '1';
  const pageNumber = Math.max(1, Math.min(10_000, Number.parseInt(first(sp.page) ?? '1', 10) || 1));
  const editId = (first(sp.edit) ?? '').slice(0, 64);

  const t = await getTranslations('coach');
  const [{ items, total }, taxonomy, editing] = await Promise.all([
    listExercises({ q, bodyPart, equipment, custom, show, page: pageNumber, locale }),
    getTaxonomy(),
    editId ? getExerciseDetail(editId) : Promise.resolve(null),
  ]);

  const body = taxonomyDict(t, 'bodyPart');
  const gear = taxonomyDict(t, 'equipment');
  const target = taxonomyDict(t, 'target');
  const options = (values: string[], dict: Record<string, string>) =>
    values.map((value) => ({ value, label: taxonomyLabel(dict, value) })).sort((a, b) => a.label.localeCompare(b.label, locale));

  const pages = Math.max(1, Math.ceil(total / EXERCISE_PAGE_SIZE));
  const baseParams = new URLSearchParams();
  if (q.trim()) baseParams.set('q', q.trim());
  if (bodyPart) baseParams.set('bodyPart', bodyPart);
  if (equipment) baseParams.set('equipment', equipment);
  if (show !== 'active') baseParams.set('show', show);
  if (custom) baseParams.set('custom', '1');
  const withPage = (n: number) => {
    const next = new URLSearchParams(baseParams);
    if (n > 1) next.set('page', String(n));
    const qs = next.toString();
    return qs ? `/coach/exercises?${qs}` : '/coach/exercises';
  };
  // links to the editor keep the filters and the page
  const editQuery = new URLSearchParams(baseParams);
  if (pageNumber > 1) editQuery.set('page', String(pageNumber));

  const from = total === 0 ? 0 : (pageNumber - 1) * EXERCISE_PAGE_SIZE + 1;
  const to = Math.min(total, pageNumber * EXERCISE_PAGE_SIZE);
  const num = (n: number) => formatNumber(n, locale, { grouping: true });

  return (
    <div className="page-x flex flex-col gap-6 py-6 md:py-10">
      <PageHeader
        title={t('exercises.title')}
        description={t('exercises.subtitle')}
        actions={
          <AddExerciseSheet
            bodyParts={options(taxonomy.bodyParts, body)}
            equipment={options(taxonomy.equipment, gear)}
            targets={options(taxonomy.targets, target)}
          />
        }
      />

      <ExerciseFilters
        values={{ q, bodyPart, equipment, show, custom }}
        bodyParts={options(taxonomy.bodyParts, body)}
        equipment={options(taxonomy.equipment, gear)}
      />

      {items.length === 0 ? (
        <EmptyState icon={SearchX} title={t('exercises.empty.title')} description={t('exercises.empty.body')} />
      ) : (
        <>
          <ExercisesTable items={items} locale={locale} baseQuery={editQuery.toString()} />
          <nav aria-label={t('exercises.pager.label')} className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-2" aria-live="polite">
              {t('exercises.pager.range', { from: num(from), to: num(to), total: num(total) })}
            </p>
            {pages > 1 ? (
              <div className="flex items-center gap-2">
                {pageNumber > 1 ? (
                  <Link
                    href={withPage(pageNumber - 1)}
                    scroll={false}
                    className="inline-flex min-h-11 items-center gap-1.5 border-[1.5px] border-ink px-3 text-sm font-semibold tx hover:bg-paper-2"
                  >
                    <DirIcon name="chevron-back" className="size-4" />
                    {t('exercises.pager.prev')}
                  </Link>
                ) : null}
                <span className="px-2 text-sm font-semibold">
                  {t('exercises.pager.page', { page: num(pageNumber), pages: num(pages) })}
                </span>
                {pageNumber < pages ? (
                  <Link
                    href={withPage(pageNumber + 1)}
                    scroll={false}
                    className="inline-flex min-h-11 items-center gap-1.5 border-[1.5px] border-ink px-3 text-sm font-semibold tx hover:bg-paper-2"
                  >
                    {t('exercises.pager.next')}
                    <DirIcon name="chevron-forward" className="size-4" />
                  </Link>
                ) : null}
              </div>
            ) : null}
          </nav>
        </>
      )}

      {editing ? <ExerciseEditor key={editing.id} exercise={editing} /> : null}
    </div>
  );
}
