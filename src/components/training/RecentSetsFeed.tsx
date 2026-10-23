import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/EmptyState';
import { Stamp } from '@/components/ui/Stamp';
import { Link } from '@/i18n/navigation';
import { getRecentSetFeed } from '@/lib/training/queries';
import { formatRelative } from '@/lib/training/relative';
import { exerciseName } from '@/lib/training/types';
import { loggedSetLabel } from './sets';

/** Coach dashboard: the latest exercises logged across all clients (client, exercise, best set, how long ago). */
export async function RecentSetsFeed({ locale, limit = 5 }: { locale: string; limit?: number }) {
  const [t, items] = await Promise.all([getTranslations({ locale, namespace: 'training' }), getRecentSetFeed(limit)]);
  if (items.length === 0) {
    return <EmptyState title={t('feed.emptyTitle')} description={t('feed.emptyBody')} />;
  }
  const now = Date.now();
  return (
    <ul className="border-[1.5px] border-rule-strong bg-card" aria-label={t('feed.label')}>
      {items.map((it) => (
        <li key={it.key} className="border-b border-rule last:border-b-0">
          <Link
            href={`/coach/clients/${it.clientId}`}
            className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 tx hover:bg-paper-2"
          >
            <span className="min-w-0">
              <span className="block truncate text-base font-bold">
                <bdi>{it.clientName}</bdi>
              </span>
              <span className="block truncate text-sm text-ink-2">
                <bdi>{exerciseName(it.exercise, locale)}</bdi>
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5 text-end">
              <span className="flex items-center gap-2">
                {it.isPr ? <Stamp status="PR" size="sm" /> : null}
                <span className="num text-lg">{loggedSetLabel(t, it.reps, it.weightKg, locale)}</span>
              </span>
              <span className="text-sm text-ink-2">{formatRelative(it.at, now, locale)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
