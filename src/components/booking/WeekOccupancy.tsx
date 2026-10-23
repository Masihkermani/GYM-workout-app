import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/EmptyState';

/** CONTRACT STUB (booking agent owns this file and replaces the body; keep the export name and props). Coach dashboard: booked vs open hours per day this week (numbers, not colour alone). */
export async function WeekOccupancy({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'common' });
  return <EmptyState title={t('placeholder.emptyTitle')} description={t('placeholder.emptyBody')} />;
}
