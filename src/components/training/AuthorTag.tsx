import { Dumbbell, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Who wrote a program. For the client: «از طرف مربی» (read-only for them) or their own. For the
 * coach, looking at a client's programs: written by the coach or by the client.
 */
export function AuthorTag({ authorRole, viewer = 'client' }: { authorRole: 'COACH' | 'CLIENT'; viewer?: 'client' | 'coach' }) {
  const t = useTranslations('training');
  const coach = authorRole === 'COACH';
  const Icon = coach ? Dumbbell : UserRound;
  return (
    <span className="inline-flex items-center gap-1.5 border-[1.5px] border-ink-3 px-2 py-0.5 text-sm font-semibold text-ink-2">
      <Icon className="size-4" aria-hidden="true" />
      {viewer === 'coach' ? (coach ? t('program.byCoach') : t('program.byClient')) : coach ? t('program.fromCoach') : t('program.fromYou')}
    </span>
  );
}
