import { CalendarDays } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionLabel } from '@/components/ui/SectionLabel';

/** STUB: the booking agent replaces this with the client's sessions (upcoming + past, with actions). */
export async function ClientBookingsPanel({ clientId, locale }: { clientId: string; locale: string }) {
  const t = await getTranslations({ locale, namespace: 'common' });
  return (
    <section data-client-id={clientId} className="flex flex-col gap-4">
      <SectionLabel>{t('placeholder.panels.bookings')}</SectionLabel>
      <EmptyState icon={CalendarDays} title={t('placeholder.emptyTitle')} description={t('placeholder.emptyBody')} />
    </section>
  );
}
