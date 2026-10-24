'use client';

import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionLabel } from '@/components/ui/SectionLabel';

/**
 * What an `error.tsx` boundary renders: the same ruled box as the 404 page, a retry and a way home.
 * The copy is neutral (no «تو», no «شما») because the coach and the client both land here.
 * `framed` is for boundaries that sit INSIDE the signed-in Shell (it already provides <main>).
 */
export function ErrorView({
  error,
  reset,
  framed = false,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  framed?: boolean;
}) {
  const t = useTranslations('common');

  useEffect(() => {
    // Next.js only prints the digest for server errors in production; keep the full error in the console
    console.error(error);
  }, [error]);

  const body = (
    <>
      <SectionLabel as="h1">{t('errors.serverTitle')}</SectionLabel>
      <div role="alert">
        <EmptyState
          icon={TriangleAlert}
          title={t('errors.serverTitle')}
          description={t('errors.serverBody')}
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button variant="primary" onClick={reset}>
                {t('actions.tryAgain')}
              </Button>
              <ButtonLink href="/" variant="outline">
                {t('actions.backHome')}
              </ButtonLink>
            </div>
          }
        />
      </div>
    </>
  );

  return framed ? (
    <div className="page-x flex flex-col gap-6 py-10 md:py-16">
      {body}
    </div>
  ) : (
    <main id="main" className="page-x flex min-h-dvh flex-col justify-center gap-6 py-16">
      {body}
    </main>
  );
}
