import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/EmptyState';

/** CONTRACT STUB (booking agent owns this file and replaces the body; keep the export name and props). Coach dashboard: PENDING bookings with one-tap confirm/decline. */
export async function PendingRequests({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'common' });
  return <EmptyState title={t('placeholder.emptyTitle')} description={t('placeholder.emptyBody')} />;
}
