import { Hammer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionLabel } from '@/components/ui/SectionLabel';

export type PlaceholderKey =
  | 'landing'
  | 'today'
  | 'book'
  | 'bookings'
  | 'program'
  | 'programNew'
  | 'programEdit'
  | 'workout'
  | 'workoutNew'
  | 'history'
  | 'historyDetail'
  | 'progress'
  | 'me'
  | 'dashboard'
  | 'schedule'
  | 'clients'
  | 'client'
  | 'programBuilder'
  | 'exercises'
  | 'settings';

/** Stand-in for a screen another agent will build: the page title as a SectionLabel plus an EmptyState. */
export function PlaceholderPage({ page }: { page: PlaceholderKey }) {
  const t = useTranslations('common');
  return (
    <div className="page-x flex flex-col gap-6 py-8 md:py-12">
      <SectionLabel as="h1">{t(`placeholder.titles.${page}`)}</SectionLabel>
      <EmptyState icon={Hammer} title={t('placeholder.emptyTitle')} description={t('placeholder.emptyBody')} />
    </div>
  );
}
