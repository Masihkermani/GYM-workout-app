import { Pencil } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/Button';
import { formatDate, formatNumber } from '@/lib/format';
import { dayToCardData } from '@/lib/training/card';
import type { ProgramDTO } from '@/lib/training/dto';
import { AuthorTag } from './AuthorTag';
import { ProgramStateButton } from './ProgramStateButton';
import { joinFacts } from './sep';
import { StartWorkoutButton } from './StartWorkoutButton';
import { TrainingCard } from './TrainingCard';

/**
 * One program as its days' training cards. For a client: a "Start this day" button under each day,
 * an Edit link only on programs they wrote themselves, and a clear "From your coach" tag on the
 * coach's (read-only for them).
 */
export async function ProgramCards({
  program,
  locale,
  timeZone,
  canEdit,
  clientName,
  linkableBookingId,
}: {
  program: ProgramDTO;
  locale: string;
  timeZone: string;
  canEdit: boolean;
  clientName: string;
  linkableBookingId?: string | null;
}) {
  const t = await getTranslations({ locale, namespace: 'training' });
  const now = new Date();
  return (
    <article className="flex flex-col gap-4" aria-label={program.title}>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl">
              <bdi>{program.title}</bdi>
            </h2>
            <p className="mt-1 text-sm text-ink-2">
              {joinFacts(
                [
                  t('program.days', { count: program.days.length, n: formatNumber(program.days.length, locale, { grouping: false }) }),
                  t('program.updated', { date: formatDate(program.updatedAt, locale, { style: 'medium', timeZone }) }),
                ],
                locale,
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AuthorTag authorRole={program.authorRole} />
            {canEdit ? (
              <>
                <ButtonLink href={`/app/program/${program.id}/edit`} variant="outline" size="sm">
                  <Pencil className="size-4" aria-hidden="true" />
                  {t('program.edit')}
                </ButtonLink>
                <ProgramStateButton programId={program.id} active={program.active} />
              </>
            ) : null}
          </div>
        </div>
        {program.authorRole === 'COACH' ? <p className="max-w-prose text-sm text-ink-2">{t('program.readOnly')}</p> : null}
        {program.notes ? <p className="max-w-prose border-s-[3px] border-ink ps-3 text-base text-ink-2">{program.notes}</p> : null}
      </header>

      {program.days.length === 0 ? (
        <p className="border-[1.5px] border-dashed border-ink-3 px-4 py-6 text-center text-base text-ink-2">{t('program.noDays')}</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {program.days.map((day) => (
            <div key={day.id} className="flex flex-col gap-3">
              <TrainingCard
                locale={locale}
                data={dayToCardData({
                  clientName,
                  dayTitle: day.title,
                  date: now,
                  locale,
                  items: day.items.map((i) => ({
                    exercise: i.exercise,
                    targetSets: i.targetSets,
                    targetRepsMin: i.targetRepsMin,
                    targetRepsMax: i.targetRepsMax,
                    targetWeightKg: i.targetWeightKg,
                  })),
                })}
              />
              {program.active && day.items.length > 0 ? (
                <StartWorkoutButton dayId={day.id} bookingId={linkableBookingId ?? null} label={t('program.startDay')} size="md" variant="ink" />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
