import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Avatar } from '@/components/ui/Avatar';
import { DirIcon } from '@/components/ui/DirIcon';
import { Stamp } from '@/components/ui/Stamp';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { ClientStatus } from './ClientStatus';
import { daysSince, formatSlot } from './format';
import type { ClientRow, ClientSort, SortDir } from './queries';

export interface ClientsTableProps {
  rows: ClientRow[];
  locale: string;
  timeZone: string;
  q: string;
  status: string;
  sort: ClientSort;
  dir: SortDir;
}

/** What the first click on a column does: names and programs A-Z, dates soonest / most recent first. */
const DEFAULT_DIR: Record<ClientSort, SortDir> = { name: 'asc', next: 'asc', last: 'desc', program: 'asc', status: 'asc' };

function href(params: Record<string, string>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `/coach/clients?${qs}` : '/coach/clients';
}

export async function ClientsTable({ rows, locale, timeZone, q, status, sort, dir }: ClientsTableProps) {
  const t = await getTranslations({ locale, namespace: 'coach' });
  const now = new Date();

  const lastWorkout = (d: Date | null) => {
    if (!d) return t('clients.never');
    const days = daysSince(d, now, timeZone);
    return days === 0 ? t('time.today') : t('time.daysAgo', { count: days });
  };

  const columns: { id: ClientSort; label: string }[] = [
    { id: 'name', label: t('clients.col.name') },
    { id: 'next', label: t('clients.col.next') },
    { id: 'last', label: t('clients.col.last') },
    { id: 'program', label: t('clients.col.program') },
    { id: 'status', label: t('clients.col.status') },
  ];

  const sortHref = (col: ClientSort) => {
    const nextDir: SortDir = col === sort ? (dir === 'asc' ? 'desc' : 'asc') : DEFAULT_DIR[col];
    return href({ q, status: status === 'all' ? '' : status, sort: col, dir: nextDir });
  };

  const header = (col: { id: ClientSort; label: string }, className?: string) => {
    const active = col.id === sort;
    const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th
        key={col.id}
        scope="col"
        aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={cn('p-0 text-start align-bottom font-bold', className)}
      >
        <Link
          href={sortHref(col.id)}
          scroll={false}
          className="flex min-h-11 items-center gap-1.5 px-3 text-ink hover:bg-paper-2"
        >
          <span>{col.label}</span>
          <Icon className={cn('size-4 shrink-0', active ? 'text-ink' : 'text-ink-3')} aria-hidden="true" />
        </Link>
      </th>
    );
  };

  return (
    <>
      {/* md and up: a ruled ledger table */}
      <div className="hidden border-[1.5px] border-rule-strong bg-card md:block">
        <table className="w-full border-collapse text-start text-base">
          <caption className="sr-only">{t('clients.title')}</caption>
          <thead className="border-b-[1.5px] border-rule-strong text-sm">
            <tr>
              {header(columns[0])}
              <th scope="col" className="min-h-11 px-3 text-start font-bold">
                {t('clients.col.phone')}
              </th>
              {columns.slice(1).map((c) => header(c))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="relative border-b border-rule last:border-b-0 tx hover:bg-paper-2">
                <th scope="row" className="px-3 py-2 text-start font-normal">
                  <Link
                    href={`/coach/clients/${c.id}`}
                    className="flex min-h-11 items-center gap-3 font-semibold text-ink after:absolute after:inset-0 after:content-['']"
                  >
                    <Avatar name={c.name} size="sm" />
                    <bdi className="min-w-0 truncate">{c.name}</bdi>
                  </Link>
                </th>
                <td className="px-3 py-2 text-ink-2">
                  <span dir="ltr" className="inline-block whitespace-nowrap">
                    {formatPhone(c.phone, locale)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {c.nextSession ? (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="whitespace-nowrap">{formatSlot(c.nextSession.startsAt, locale, timeZone)}</span>
                      {c.nextSession.status === 'PENDING' ? <Stamp status="PENDING" size="sm" /> : null}
                    </span>
                  ) : (
                    <span className="text-ink-3">{t('clients.none')}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {c.lastWorkoutAt ? (
                    <span title={formatDate(c.lastWorkoutAt, locale, { timeZone, style: 'long' })}>{lastWorkout(c.lastWorkoutAt)}</span>
                  ) : (
                    <span className="text-ink-3">{lastWorkout(null)}</span>
                  )}
                </td>
                <td className="max-w-[16rem] px-3 py-2">
                  {c.programTitle ? (
                    <bdi className="block truncate" title={c.programTitle}>
                      {c.programTitle}
                    </bdi>
                  ) : (
                    <span className="text-ink-3">{t('clients.none')}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <ClientStatus active={c.active} size="sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* below md: list rows (name and phone first, the rest on one quiet line) */}
      <ul className="border-[1.5px] border-rule-strong bg-card md:hidden">
        {rows.map((c) => (
          <li key={c.id} className="relative border-b border-rule last:border-b-0">
            <Link
              href={`/coach/clients/${c.id}`}
              className="flex min-h-16 items-center gap-3 px-3 py-3 after:absolute after:inset-0 after:content-['']"
            >
              <Avatar name={c.name} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <bdi className="truncate font-semibold text-ink">{c.name}</bdi>
                  {!c.active ? <ClientStatus active={false} size="sm" /> : null}
                </span>
                <span dir="ltr" className="block text-start text-sm text-ink-2 rtl:text-end">
                  {formatPhone(c.phone, locale)}
                </span>
                <span className="mt-0.5 block text-sm text-ink-2">
                  {c.nextSession
                    ? t('clients.nextShort', { when: formatSlot(c.nextSession.startsAt, locale, timeZone) })
                    : t('clients.noNext')}
                </span>
                <span className="block text-sm text-ink-2">
                  {c.lastWorkoutAt ? t('clients.lastShort', { when: lastWorkout(c.lastWorkoutAt) }) : t('clients.never')}
                </span>
              </span>
              <DirIcon name="chevron-forward" className="size-5 shrink-0 text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-2" aria-live="polite">
        {t('clients.count', { count: rows.length })}
      </p>
    </>
  );
}
