import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/EmptyState';

/** CONTRACT STUB (training agent owns this file and replaces the body; keep the export name and props). Coach dashboard: active clients with no workout in the last N days. */
export async function IdleClients({ locale, days = 7 }: { locale: string; days?: number }) {
  const t = await getTranslations({ locale, namespace: 'common' });
  return (
    <div data-stub={String(days)}>
      <EmptyState title={t('placeholder.emptyTitle')} description={t('placeholder.emptyBody')} />
    </div>
  );
}
