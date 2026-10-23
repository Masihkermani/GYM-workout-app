'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { DirIcon } from '@/components/ui/DirIcon';
import { dirOf } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { formatDate, formatMinuteOfDay, formatNumber, formatWeekday } from '@/lib/format';
import { addDaysToKey, utcToZoned, weekendWeekday, weekdayOfKey, type DateKey } from '@/lib/time';
import { dayNumber, noonOf, timeRange, weekTitle, weekdayNarrow, weekdayShort } from './dates';
import type { CellTone, TimetableCell } from './types';

/**
 * The whiteboard timetable (DESIGN.md signature component #3).
 *
 * Desktop: a week grid, days as columns (RTL-aware: Saturday is the rightmost column in fa, Friday is
 * shaded as the weekend; Monday first in en) and one row per distinct start time. Phone: a horizontal
 * day strip plus a vertical slot list for the chosen day.
 *
 * Presentational and controlled: the parent builds the cells (with their words and accessible names),
 * owns the current week and decides what pressing a cell does. Every cell is a real <button> with an
 * aria-label; cells that cannot be pressed use aria-disabled so they stay readable by screen readers.
 * Keyboard: Tab enters the grid once, arrow keys move between cells (mirrored in RTL), Home / End jump
 * to the first / last cell of the row, Enter or Space presses.
 */
export interface TimetableProps {
  cells: TimetableCell[];
  locale: string;
  timeZone: string;
  /** Today in the coach timezone (YYYY-MM-DD): marks the column. */
  todayKey: DateKey;
  /** First day of the visible week (Saturday for fa, Monday for en). */
  weekStart: DateKey;
  onWeekChange: (weekStart: DateKey) => void;
  /** Week start to go to, or null when there is no earlier / later week to show. */
  prevWeek: DateKey | null;
  nextWeek: DateKey | null;
  onSelect: (cell: TimetableCell) => void;
  /** Accessible name of the grid. */
  label: string;
  /** Dim the grid while the parent loads another week. */
  busy?: boolean;
}

const OPEN_TONES: CellTone[] = ['open'];

/** Look of a cell, shared by the desktop grid and the phone list. */
const TONE: Record<CellTone, string> = {
  // whiteboard: outlined block, marker hatching, the word sits on a clean chip
  open: 'border-ink-3 bg-card hatch text-ink hover:border-ink hover:bg-paper-2',
  taken: 'border-transparent bg-paper-2 text-ink-2',
  pending: 'border-plate-yellow bg-plate-yellow text-on-yellow font-semibold',
  confirmed: 'border-plate-blue bg-plate-blue text-on-blue font-semibold',
  completed: 'border-plate-green bg-plate-green text-on-green font-semibold',
  noshow: 'border-danger bg-card text-danger font-semibold',
  past: 'border-rule text-ink-3 opacity-60',
  // past and too-soon are plain and faded: only bookable open slots carry the hatching
  soon: 'border-rule text-ink-3 opacity-70',
  off: 'border-transparent bg-paper-2 text-ink-2',
};

function cellClass(cell: TimetableCell, extra?: string) {
  return cn(
    'flex w-full min-w-0 items-center justify-center rounded-[var(--r)] border-[1.5px] px-1 text-xs tx',
    TONE[cell.tone],
    cell.interactive ? 'cursor-pointer active:translate-y-px' : 'cursor-default',
    extra,
  );
}

/** The word on a cell. Open cells put it on a solid chip so the hatching never runs through the letters. */
function CellText({ cell }: { cell: TimetableCell }) {
  if (cell.tone === 'open') {
    return <span className="truncate bg-card px-1.5 py-0.5 text-ink-2">{cell.text}</span>;
  }
  return <span className="truncate">{cell.text}</span>;
}

export function Timetable({
  cells,
  locale,
  timeZone,
  todayKey,
  weekStart,
  onWeekChange,
  prevWeek,
  nextWeek,
  onSelect,
  label,
  busy = false,
}: TimetableProps) {
  const t = useTranslations('booking');
  const rtl = dirOf(locale) === 'rtl';
  const weekend = weekendWeekday(locale);
  const gridRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysToKey(weekStart, i)), [weekStart]);

  // cells of the visible week, by day
  const { byDay, minutes } = useMemo(() => {
    const map = new Map<DateKey, (TimetableCell & { minute: number })[]>(days.map((d) => [d, []]));
    const mins = new Set<number>();
    for (const cell of cells) {
      const z = utcToZoned(new Date(cell.startsAt), timeZone);
      const list = map.get(z.dateKey);
      if (!list) continue;
      list.push({ ...cell, minute: z.minuteOfDay });
      mins.add(z.minuteOfDay);
    }
    for (const list of map.values()) list.sort((a, b) => a.startsAt - b.startsAt);
    return { byDay: map, minutes: [...mins].sort((a, b) => a - b) };
  }, [cells, days, timeZone]);

  // desktop matrix: rows = start times, columns = days (DOM order; CSS direction mirrors it in RTL)
  const matrix = useMemo(
    () => minutes.map((m) => days.map((d) => byDay.get(d)?.find((c) => c.minute === m) ?? null)),
    [minutes, days, byDay],
  );

  // roving tabindex
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const allKeys = matrix.flat().filter((c): c is NonNullable<typeof c> => c !== null);
  const activeKey =
    focusKey && allKeys.some((c) => c.key === focusKey)
      ? focusKey
      : (allKeys.find((c) => c.interactive) ?? allKeys[0])?.key;

  const focusCell = (r: number, c: number) => {
    const cell = matrix[r]?.[c];
    if (!cell) return false;
    setFocusKey(cell.key);
    gridRef.current?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`)?.focus();
    return true;
  };

  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]');
    if (!el) return;
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);
    let dr = 0;
    let dc = 0;
    switch (e.key) {
      case 'ArrowDown':
        dr = 1;
        break;
      case 'ArrowUp':
        dr = -1;
        break;
      // visual direction: ArrowRight moves toward the right edge, which is earlier in the DOM in RTL
      case 'ArrowRight':
        dc = rtl ? -1 : 1;
        break;
      case 'ArrowLeft':
        dc = rtl ? 1 : -1;
        break;
      case 'Home':
      case 'End': {
        e.preventDefault();
        const row = matrix[r];
        const order = e.key === 'Home' ? [...row.keys()] : [...row.keys()].reverse();
        // Home = the first cell on the start side, End = the last
        const target = order.find((i) => row[i]);
        if (target !== undefined) focusCell(r, target);
        return;
      }
      default:
        return;
    }
    e.preventDefault();
    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nr < matrix.length && nc >= 0 && nc < 7) {
      if (focusCell(nr, nc)) return;
      nr += dr;
      nc += dc;
    }
  };

  // phone: the chosen day, defaulting to today, else the first day with something to press
  const [chosen, setChosen] = useState<{ week: DateKey; day: DateKey } | null>(null);
  const defaultDay =
    days.find((d) => d === todayKey) && (byDay.get(todayKey)?.length ?? 0) > 0
      ? todayKey
      : (days.find((d) => byDay.get(d)?.some((c) => OPEN_TONES.includes(c.tone))) ??
        days.find((d) => (byDay.get(d)?.length ?? 0) > 0) ??
        days[0]);
  const activeDay = chosen && chosen.week === weekStart && days.includes(chosen.day) ? chosen.day : defaultDay;

  const lastDay = days[6];
  const title = weekTitle(weekStart, lastDay, locale, timeZone);
  const openCount = (day: DateKey) => byDay.get(day)?.filter((c) => c.tone === 'open').length ?? 0;
  const isWeekend = (day: DateKey) => weekend !== null && weekdayOfKey(day) === weekend;

  const nav = (
    <div className="flex items-center justify-between gap-3">
      <Button
        variant="outline"
        size="md"
        className="min-w-11 px-0"
        aria-label={t('week.prev')}
        disabled={!prevWeek}
        onClick={() => prevWeek && onWeekChange(prevWeek)}
      >
        <DirIcon name="chevron-back" className="size-5" />
      </Button>
      <h2 className="text-center text-base font-bold" aria-live="polite">
        <bdi>{title}</bdi>
      </h2>
      <Button
        variant="outline"
        size="md"
        className="min-w-11 px-0"
        aria-label={t('week.next')}
        disabled={!nextWeek}
        onClick={() => nextWeek && onWeekChange(nextWeek)}
      >
        <DirIcon name="chevron-forward" className="size-5" />
      </Button>
    </div>
  );

  const gridCols = 'grid grid-cols-[4rem_repeat(7,minmax(0,1fr))] gap-x-1.5 gap-y-1.5 lg:grid-cols-[4.5rem_repeat(7,minmax(0,1fr))]';

  return (
    <div className={cn('flex flex-col gap-4 tx', busy && 'opacity-60')} aria-busy={busy || undefined}>
      {nav}

      {/* ------------------------------------------------------------------ desktop week grid */}
      <div className="hidden md:block">
        <div
          ref={gridRef}
          role="grid"
          aria-label={label}
          aria-colcount={8}
          onKeyDown={onGridKeyDown}
          className={cn(gridCols, 'border-[1.5px] border-rule-strong bg-card p-3')}
        >
          <div role="row" className="contents">
            <div role="columnheader">
              <span className="sr-only">{t('week.timeColumn')}</span>
            </div>
            {days.map((day) => {
              const today = day === todayKey;
              return (
                <div
                  key={day}
                  role="columnheader"
                  aria-current={today ? 'date' : undefined}
                  className={cn(
                    'flex flex-col items-center gap-0.5 border-b-[1.5px] px-1 pb-2 text-center',
                    today ? 'border-ink' : 'border-rule',
                    isWeekend(day) && 'text-ink-2',
                  )}
                >
                  <span className="text-sm font-semibold">{weekdayShort(day, locale, timeZone)}</span>
                  <span className="num text-xl leading-none">{dayNumber(day, locale)}</span>
                  {today ? <span className="label-caps text-ink-2">{t('week.today')}</span> : null}
                  {isWeekend(day) ? <span className="text-xs text-ink-3">{t('week.weekend')}</span> : null}
                </div>
              );
            })}
          </div>

          {matrix.length === 0 ? (
            <p role="row" className="col-span-full py-10 text-center text-ink-2">
              <span role="gridcell">{t('week.empty')}</span>
            </p>
          ) : null}

          {matrix.map((row, r) => {
            const gap = r > 0 && minutes[r] - minutes[r - 1] > 120;
            return (
              <div key={minutes[r]} role="row" className="contents">
                {gap ? <div aria-hidden="true" className="col-span-full -my-0.5 border-t border-dashed border-rule" /> : null}
                <div role="rowheader" className="num flex items-center text-sm text-ink-2">
                  {formatMinuteOfDay(minutes[r], locale)}
                </div>
                {row.map((cell, c) => (
                  <div
                    key={days[c]}
                    role="gridcell"
                    className={cn('min-w-0 rounded-[var(--r)]', isWeekend(days[c]) && 'bg-paper-2/60')}
                  >
                    {cell ? (
                      <button
                        type="button"
                        data-cell
                        data-start={cell.startsAt}
                        data-tone={cell.tone}
                        data-r={r}
                        data-c={c}
                        aria-label={cell.label}
                        aria-disabled={!cell.interactive || undefined}
                        tabIndex={cell.key === activeKey ? 0 : -1}
                        onFocus={() => setFocusKey(cell.key)}
                        onClick={() => cell.interactive && onSelect(cell)}
                        className={cellClass(cell, 'min-h-12')}
                      >
                        <CellText cell={cell} />
                      </button>
                    ) : (
                      <div className="min-h-12" />
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* --------------------------------------------------------- phone: day strip + slot list */}
      <div className="md:hidden">
        <div role="group" aria-label={t('week.days')} className="flex gap-1 pb-2 sm:gap-1.5">
          {days.map((day) => {
            const selected = day === activeDay;
            const n = openCount(day);
            const noon = noonOf(day, timeZone);
            const full = `${formatWeekday(noon, locale, { timeZone })}${locale === 'fa' ? '\u060c ' : ', '}${formatDate(noon, locale, { timeZone, style: 'short' })}`;
            return (
              <button
                key={day}
                type="button"
                aria-pressed={selected}
                aria-current={day === todayKey ? 'date' : undefined}
                aria-label={n > 0 ? `${full}${locale === 'fa' ? '\u060c ' : ', '}${t('week.openCount', { count: formatNumber(n, locale, { grouping: false }) })}` : full}
                onClick={() => setChosen({ week: weekStart, day })}
                className={cn(
                  'flex min-h-[4.5rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--r)] border-[1.5px] px-0.5 py-1.5 tx',
                  selected
                    ? 'border-ink bg-ink text-paper'
                    : cn('border-ink-3 bg-card text-ink hover:bg-paper-2', isWeekend(day) && 'bg-paper-2 text-ink-2'),
                )}
              >
                <span aria-hidden="true" className="text-xs font-semibold">
                  <span className="sm:hidden">{weekdayNarrow(day, locale, timeZone)}</span>
                  <span className="hidden sm:inline">{weekdayShort(day, locale, timeZone)}</span>
                </span>
                <span aria-hidden="true" className="num text-xl leading-none">
                  {dayNumber(day, locale)}
                </span>
                <span aria-hidden="true" className="num inline-flex items-center gap-1 text-xs">
                  {n > 0 ? (
                    <>
                      <span className="hatch inline-block size-2.5 border border-ink-3 bg-card" />
                      {formatNumber(n, locale, { grouping: false })}
                    </>
                  ) : (
                    '–'
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <ul className="mt-3 flex flex-col gap-2" aria-label={label}>
          {(byDay.get(activeDay) ?? []).length === 0 ? (
            <li className="border-[1.5px] border-dashed border-ink-3 px-4 py-8 text-center text-ink-2">
              {t('week.emptyDay')}
            </li>
          ) : null}
          {(byDay.get(activeDay) ?? []).map((cell) => (
            <li key={cell.key}>
              <button
                type="button"
                data-start={cell.startsAt}
                data-tone={cell.tone}
                aria-label={cell.label}
                aria-disabled={!cell.interactive || undefined}
                onClick={() => cell.interactive && onSelect(cell)}
                className={cellClass(cell, 'min-h-14 justify-between gap-3 px-4 text-start text-sm')}
              >
                <span className={cn('num text-lg', cell.tone === 'open' && 'bg-card px-2 py-0.5')}>
                  <bdi>{timeRange(cell.startsAt, cell.endsAt, locale, timeZone)}</bdi>
                </span>
                <CellText cell={cell} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
