import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/EmptyState';

/** CONTRACT STUB (booking agent owns this file and replaces the body; keep the export name and props). Client Today page: the client's next live booking or a book CTA. */
export async function NextBookingCard({ userId, locale }: { userId: string; locale: string }) {
  const t = await getTranslations({ locale, namespace: 'common' });
  return (
    <div data-stub={String(userId)}>
      <EmptyState title={t('placeholder.emptyTitle')} description={t('placeholder.emptyBody')} />
    </div>
  );
}
