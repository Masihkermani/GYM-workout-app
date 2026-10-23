import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/EmptyState';

/** CONTRACT STUB (booking agent owns this file and replaces the body; keep the export name and props). Coach dashboard: today's sessions as a timeline with status and actions. */
export async function CoachTodayAgenda({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'common' });
  return <EmptyState title={t('placeholder.emptyTitle')} description={t('placeholder.emptyBody')} />;
}
