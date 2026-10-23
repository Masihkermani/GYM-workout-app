import { SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionLabel } from '@/components/ui/SectionLabel';

export default function NotFound() {
  const t = useTranslations('common');
  return (
    <main id="main" className="page-x flex min-h-dvh flex-col justify-center gap-6 py-16">
      <SectionLabel as="h1">
        {t('errors.notFoundTitle')}
      </SectionLabel>
      <EmptyState
        icon={SearchX}
        title={t('errors.notFoundTitle')}
        description={t('errors.notFoundBody')}
        action={<ButtonLink href="/">{t('actions.backHome')}</ButtonLink>}
      />
    </main>
  );
}
