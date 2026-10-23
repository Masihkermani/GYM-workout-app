import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { requireUser } from '@/lib/auth';
import { formatNumber } from '@/lib/format';
import { getCoachSettings } from '@/lib/settings';
import { listWorkoutSummaries } from '@/lib/training/queries';
import { DirIcon } from '@/components/ui/DirIcon';
import { WorkoutList } from '@/components/training/WorkoutList';

const PAGE_SIZE = 15;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'training' });
  return { title: t('history.title') };
}

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  const { page: pageParam } = await searchParams;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  const [t, settings, { items, total }] = await Promise.all([
    getTranslations({ locale, namespace: 'training' }),
    getCoachSettings(),
    listWorkoutSummaries(user.id, { take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page-x flex flex-col gap-6 py-8 md:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SectionLabel as="h1">{t('history.title')}</SectionLabel>
          {total > 0 ? (
            <p className="mt-2 text-base text-ink-2">{t('history.total', { count: total, n: formatNumber(total, locale, { grouping: false }) })}</p>
          ) : null}
        </div>
        <ButtonLink href="/app/progress" variant="outline" size="sm">
          {t('history.toProgress')}
        </ButtonLink>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title={t('history.emptyTitle')}
          description={t('history.emptyBody')}
          action={
            <ButtonLink href="/app/workout/new" variant="primary">
              {t('workout.startFree')}
            </ButtonLink>
          }
        />
      ) : (
        <WorkoutList items={items} locale={locale} timeZone={settings.timezone} />
      )}

      {pages > 1 ? (
        <nav aria-label={t('history.pages')} className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <ButtonLink href={`/app/history?page=${page - 1}`} variant="outline" size="sm">
              <DirIcon name="chevron-back" className="size-4" />
              {t('history.newer')}
            </ButtonLink>
          ) : (
            <span />
          )}
          <p className="num text-base text-ink-2">
            {t('history.pageOf', { page: formatNumber(page, locale, { grouping: false }), pages: formatNumber(pages, locale, { grouping: false }) })}
          </p>
          {page < pages ? (
            <ButtonLink href={`/app/history?page=${page + 1}`} variant="outline" size="sm">
              {t('history.older')}
              <DirIcon name="chevron-forward" className="size-4" />
            </ButtonLink>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
