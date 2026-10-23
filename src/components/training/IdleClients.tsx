import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/EmptyState';
import { Link } from '@/i18n/navigation';
import { formatNumber } from '@/lib/format';
import { getIdleClients } from '@/lib/training/queries';

/** Coach dashboard: active clients with no workout in the last N days, longest gap first. */
export async function IdleClients({ locale, days = 7 }: { locale: string; days?: number }) {
  const [t, idle] = await Promise.all([getTranslations({ locale, namespace: 'training' }), getIdleClients(days)]);
  if (idle.length === 0) {
    return (
      <EmptyState
        title={t('idle.emptyTitle')}
        description={t('idle.emptyBody', { days })}
      />
    );
  }
  return (
    <ul className="border-[1.5px] border-rule-strong bg-card" aria-label={t('idle.label', { days })}>
      {idle.map((c) => (
        <li key={c.id} className="border-b border-rule last:border-b-0">
          <Link
            href={`/coach/clients/${c.id}`}
            className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 tx hover:bg-paper-2"
          >
            <span className="min-w-0 truncate text-base font-bold">
              <bdi>{c.name}</bdi>
            </span>
            <span className="num shrink-0 text-lg text-ink-2">
              {c.daysIdle == null ? (
                <span className="text-base font-normal">{t('idle.never')}</span>
              ) : (
                t('idle.days', { count: c.daysIdle, n: formatNumber(c.daysIdle, locale, { grouping: false }) })
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
