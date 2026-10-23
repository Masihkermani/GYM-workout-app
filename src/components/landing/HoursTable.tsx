import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { formatMinuteOfDay, formatNumber, formatWeekday } from '@/lib/format';
import { groupHours, type HoursRow, type RuleLike } from './hours';

/** A reference date for each weekday (2024-01-07 was a Sunday), formatted in UTC so only the name matters. */
const dayName = (weekday: number, locale: string) =>
  formatWeekday(new Date(Date.UTC(2024, 0, 7 + weekday, 12)), locale, { timeZone: 'UTC', style: 'long' });

export interface HoursTableProps {
  locale: string;
  rules: RuleLike[];
  slotMinutes: number;
  location: string;
}

/** Hours and place as a small ruled ledger: days on the start side, windows next to them. */
export async function HoursTable({ locale, rules, slotMinutes, location }: HoursTableProps) {
  const t = await getTranslations({ locale, namespace: 'landing' });
  const rows = groupHours(rules, locale);

  const label = (row: HoursRow) => {
    const first = dayName(row.days[0], locale);
    if (row.days.length === 1) return first;
    const last = dayName(row.days[row.days.length - 1], locale);
    return row.days.length === 2 ? t('hours.pair', { a: first, b: last }) : t('hours.range', { from: first, to: last });
  };

  const entries: { key: string; head: string; body: ReactNode }[] = [];
  if (rows.length === 0) {
    entries.push({ key: 'hours', head: t('hours.open'), body: <span className="text-ink-2">{t('hours.empty')}</span> });
  }
  for (const row of rows) {
    entries.push({
      key: `d${row.days.join('-')}`,
      head: label(row),
      body:
        row.windows.length === 0 ? (
          <span className="text-ink-3">{t('hours.closed')}</span>
        ) : (
          <ul className="flex flex-col">
            {row.windows.map(([a, b]) => (
              <li key={a} className="num text-lg">
                <bdi>
                  {formatMinuteOfDay(a, locale)}–{formatMinuteOfDay(b, locale)}
                </bdi>
              </li>
            ))}
          </ul>
        ),
    });
  }
  entries.push({
    key: 'session',
    head: t('hours.session'),
    body: <span>{t('hours.sessionValue', { minutes: formatNumber(slotMinutes, locale, { grouping: false }) })}</span>,
  });
  if (location) {
    entries.push({ key: 'place', head: t('hours.place'), body: <span className="block max-w-prose">{location}</span> });
  }

  return (
    <table className="w-full border-[1.5px] border-rule-strong bg-card text-start">
      <caption className="sr-only">{t('hours.title')}</caption>
      <tbody>
        {entries.map((e) => (
          <tr key={e.key} className="border-b border-rule last:border-b-0">
            <th scope="row" className="w-2/5 px-4 py-3 text-start align-top text-base font-semibold sm:w-1/3">
              {e.head}
            </th>
            <td className="px-4 py-3 align-top text-base">{e.body}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
