import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/EmptyState';

/** CONTRACT STUB (booking agent owns this file and replaces the body; keep the export name and props). Landing page: live mini timetable of this week's open slots (no client names) + open-slot count. */
export async function PublicWeekPreview({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'common' });
  return <EmptyState title={t('placeholder.emptyTitle')} description={t('placeholder.emptyBody')} />;
}
