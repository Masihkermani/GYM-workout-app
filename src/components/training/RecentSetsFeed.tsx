import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/EmptyState';

/** CONTRACT STUB (training agent owns this file and replaces the body; keep the export name and props). Coach dashboard: latest logged exercises across all clients (client, exercise, best set). */
export async function RecentSetsFeed({ locale, limit = 5 }: { locale: string; limit?: number }) {
  const t = await getTranslations({ locale, namespace: 'common' });
  return (
    <div data-stub={String(limit)}>
      <EmptyState title={t('placeholder.emptyTitle')} description={t('placeholder.emptyBody')} />
    </div>
  );
}
