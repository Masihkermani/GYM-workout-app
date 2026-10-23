import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { requireUser } from '@/lib/auth';
import { getCoachSettings } from '@/lib/settings';
import { getLinkableBooking, listPrograms } from '@/lib/training/queries';
import { ProgramCards } from '@/components/training/ProgramCards';
import { StartWorkoutButton } from '@/components/training/StartWorkoutButton';
import { formatNumber } from '@/lib/format';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'training' });
  return { title: t('program.title') };
}

export default async function ProgramPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const [t, settings, programs, bookingId] = await Promise.all([
    getTranslations({ locale, namespace: 'training' }),
    getCoachSettings(),
    listPrograms(user.id),
    getLinkableBooking(user.id),
  ]);
  const active = programs.filter((p) => p.active);
  const archived = programs.filter((p) => !p.active);

  return (
    <div className="page-x flex flex-col gap-10 py-8 md:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <SectionLabel as="h1">{t('program.title')}</SectionLabel>
        <div className="flex flex-wrap gap-3">
          <StartWorkoutButton label={t('program.freeWorkout')} variant="outline" size="md" bookingId={bookingId} icon={false} />
          <ButtonLink href="/app/program/new" variant="outline">
            <Plus className="size-5" aria-hidden="true" />
            {t('program.new')}
          </ButtonLink>
        </div>
      </header>

      {active.length === 0 ? (
        <EmptyState
          title={t('program.emptyTitle')}
          description={t('program.emptyBody')}
          action={
            <ButtonLink href="/app/program/new" variant="primary">
              {t('program.new')}
            </ButtonLink>
          }
        />
      ) : (
        active.map((p) => (
          <ProgramCards
            key={p.id}
            program={p}
            locale={locale}
            timeZone={settings.timezone}
            clientName={user.name}
            canEdit={p.authorId === user.id && p.clientId === user.id}
            linkableBookingId={bookingId}
          />
        ))
      )}

      {archived.length > 0 ? (
        <details className="border-[1.5px] border-rule-strong bg-card">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">
            {t('program.archived', { count: archived.length, n: formatNumber(archived.length, locale, { grouping: false }) })}
          </summary>
          <div className="flex flex-col gap-10 border-t border-rule p-4">
            {archived.map((p) => (
              <ProgramCards
                key={p.id}
                program={p}
                locale={locale}
                timeZone={settings.timezone}
                clientName={user.name}
                canEdit={p.authorId === user.id && p.clientId === user.id}
              />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
