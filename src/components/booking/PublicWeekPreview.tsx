import { CalendarDays } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { formatMinuteOfDay, formatNumber, formatWeekday } from '@/lib/format';
import { generateSlots, weekRange, type Slot } from '@/lib/scheduling';
import { loadSchedulingData } from '@/lib/scheduling/load';
import { getCoachSettings } from '@/lib/settings';
import { addDaysToKey, todayKey, utcToZoned, weekdayOfKey, weekendWeekday } from '@/lib/time';
import { dayNumber, noonOf } from './dates';

/**
 * Landing page: the live mini timetable. Public: no client names, no ids, only whether a slot is open,
 * taken or out of reach. Shows this week; if nothing in it can be booked any more (Friday evening,
 * a week off) it shows next week instead and says so. The CTA goes to /app/book (login first).
 */
export async function PublicWeekPreview({ locale }: { locale: string }) {
  const [t, settings] = await Promise.all([getTranslations({ locale, namespace: 'booking' }), getCoachSettings()]);
  const tz = settings.timezone;
  const now = new Date();
  const thisWeek = weekRange(todayKey(tz, now), locale, tz);
  const nextWeek = weekRange(addDaysToKey(thisWeek.startKey, 7), locale, tz);

  const data = await loadSchedulingData(thisWeek.from, nextWeek.to);
  const all = generateSlots({
    rules: data.rules,
    timeOff: data.timeOff,
    bookings: data.bookings,
    settings,
    from: thisWeek.from,
    to: nextWeek.to,
    now,
    viewerId: null,
  });
  const inWeek = (w: { from: Date; to: Date }) =>
    all.filter((s) => s.startsAt >= w.from && s.startsAt < w.to);
  const openIn = (slots: Slot[]) => slots.filter((s) => s.state === 'open').length;

  let week = thisWeek;
  let slots = inWeek(thisWeek);
  let isNext = false;
  if (openIn(slots) === 0 && openIn(inWeek(nextWeek)) > 0) {
    week = nextWeek;
    slots = inWeek(nextWeek);
    isNext = true;
  }
  const openCount = openIn(slots);

  // rows = distinct start times in the week; columns = the seven days
  const minutes = [...new Set(slots.map((s) => utcToZoned(s.startsAt, tz).minuteOfDay))].sort((a, b) => a - b);
  const cell = (key: string, minute: number) =>
    slots.find((s) => {
      const z = utcToZoned(s.startsAt, tz);
      return z.dateKey === key && z.minuteOfDay === minute;
    });
  const weekend = weekendWeekday(locale);
  const perDay = week.keys.map((key) => ({
    key,
    open: slots.filter((s) => s.state === 'open' && utcToZoned(s.startsAt, tz).dateKey === key).length,
  }));
  const summary = perDay
    .filter((d) => d.open > 0)
    .map((d) =>
      t('preview.dayOpen', {
        day: formatWeekday(noonOf(d.key, tz), locale, { timeZone: tz, style: 'long' }),
        count: formatNumber(d.open, locale, { grouping: false }),
      }),
    )
    .join(locale === 'fa' ? '\u060c ' : ', ');

  return (
    <section className="flex flex-col gap-5" aria-labelledby="week-preview-title" data-testid="week-preview">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p id="week-preview-title" className="label-caps text-ink-2">
            {isNext ? t('preview.nextWeek') : t('preview.thisWeek')}
          </p>
          <p className="mt-1 flex items-baseline gap-3">
            <span className="num text-6xl leading-none" data-testid="week-open-count">
              {formatNumber(openCount, locale, { grouping: false })}
            </span>
            <span className="text-lg text-ink-2">{t('preview.openSlots', { count: openCount })}</span>
          </p>
        </div>
        <ButtonLink href="/app/book" size="lg">
          <CalendarDays className="size-5" aria-hidden="true" />
          {t('preview.cta')}
        </ButtonLink>
      </div>

      {minutes.length > 0 ? (
        <>
          <div
            role="img"
            aria-label={openCount > 0 ? t('preview.aria', { summary }) : t('preview.ariaNone')}
            className="grid grid-cols-[2.75rem_repeat(7,minmax(0,1fr))] gap-1 border-[1.5px] border-rule-strong bg-card p-2 sm:gap-1.5 sm:p-3"
          >
            <span />
            {week.keys.map((key) => {
              const isWeekend = weekend !== null && weekdayOfKey(key) === weekend;
              return (
                <span
                  key={key}
                  aria-hidden="true"
                  className={cn('flex flex-col items-center border-b border-rule pb-1 text-xs', isWeekend && 'text-ink-3')}
                >
                  <span className="font-semibold">
                    {formatWeekday(noonOf(key, tz), locale, { timeZone: tz, style: 'narrow' })}
                  </span>
                  <span className="num">{dayNumber(key, locale)}</span>
                </span>
              );
            })}
            {minutes.map((m) => (
              <div key={m} className="contents">
                <span aria-hidden="true" className="num flex items-center text-xs text-ink-3">
                  {formatMinuteOfDay(m, locale)}
                </span>
                {week.keys.map((key) => {
                  const s = cell(key, m);
                  const isWeekend = weekend !== null && weekdayOfKey(key) === weekend;
                  return (
                    <span
                      key={key}
                      aria-hidden="true"
                      className={cn(
                        'h-5 rounded-[var(--r)] border sm:h-6',
                        !s && cn('border-transparent', isWeekend && 'bg-paper-2/60'),
                        s?.state === 'open' && 'hatch border-ink-3 bg-card',
                        (s?.state === 'taken' || s?.state === 'mine-pending' || s?.state === 'mine-confirmed') &&
                          'border-transparent bg-paper-2',
                        (s?.state === 'past' || s?.state === 'too-soon') && 'border-rule opacity-50',
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-2" aria-hidden="true">
            <li className="flex items-center gap-2">
              <span className="hatch inline-block h-4 w-6 rounded-[var(--r)] border border-ink-3 bg-card" />
              {t('legend.open')}
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block h-4 w-6 rounded-[var(--r)] bg-paper-2" />
              {t('legend.taken')}
            </li>
          </ul>
        </>
      ) : (
        <p className="border-[1.5px] border-dashed border-ink-3 px-4 py-8 text-center text-ink-2">
          {t('preview.none')}
        </p>
      )}
    </section>
  );
}
