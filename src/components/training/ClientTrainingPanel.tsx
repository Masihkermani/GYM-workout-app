import { Dumbbell } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionLabel } from '@/components/ui/SectionLabel';

/** STUB: the training agent replaces this with the client's programs, workout history and progress. */
export async function ClientTrainingPanel({ clientId, locale }: { clientId: string; locale: string }) {
  const t = await getTranslations({ locale, namespace: 'common' });
  return (
    <section data-client-id={clientId} className="flex flex-col gap-4">
      <SectionLabel>{t('placeholder.panels.training')}</SectionLabel>
      <EmptyState icon={Dumbbell} title={t('placeholder.emptyTitle')} description={t('placeholder.emptyBody')} />
    </section>
  );
}
