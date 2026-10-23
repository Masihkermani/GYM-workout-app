'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Select } from '@/components/ui/Select';
import { formatMonthYear } from '@/lib/format';
import { addDaysToKey, addMonthsToKey, monthOf, todayKey, type DateKey } from '@/lib/time';
import { dayNumber, noonOf } from './dates';

/**
 * A calendar date as two selects: day, then month and year, in the locale's calendar (Jalali for fa,
 * Gregorian for en). Native selects keep it accessible and phone-friendly, and avoid a type="date"
 * field that only knows the Gregorian calendar.
 */
export function DatePicker({
  value,
  onChange,
  legend,
  locale,
  timeZone,
  monthsAhead = 18,
}: {
  value: DateKey;
  onChange: (next: DateKey) => void;
  legend: string;
  locale: string;
  timeZone: string;
  monthsAhead?: number;
}) {
  const t = useTranslations('booking');
  const today = todayKey(timeZone);
  const current = monthOf(value, locale);

  const months = useMemo(() => {
    const out: { first: DateKey; label: string }[] = [];
    for (let i = 0; i <= monthsAhead; i++) {
      const first = addMonthsToKey(today, i, locale);
      out.push({ first, label: formatMonthYear(noonOf(first, timeZone), locale, { timeZone }) });
    }
    // a value outside the list (e.g. an earlier month) stays selectable
    if (!out.some((m) => m.first === current.firstKey)) {
      out.unshift({ first: current.firstKey, label: formatMonthYear(noonOf(current.firstKey, timeZone), locale, { timeZone }) });
    }
    return out;
  }, [today, locale, timeZone, monthsAhead, current.firstKey]);

  const days = Array.from({ length: current.days }, (_, i) => addDaysToKey(current.firstKey, i));
  const offset = days.indexOf(value);

  const onMonth = (first: DateKey) => {
    const target = monthOf(first, locale);
    const day = Math.min(Math.max(offset, 0), target.days - 1);
    onChange(addDaysToKey(target.firstKey, day));
  };

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-semibold text-ink">{legend}</legend>
      <div className="grid grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)] gap-2">
        <Select aria-label={`${legend}, ${t('date.day')}`} value={value} onChange={(e) => onChange(e.target.value)}>
          {days.map((d) => (
            <option key={d} value={d}>
              {dayNumber(d, locale)}
            </option>
          ))}
        </Select>
        <Select
          aria-label={`${legend}, ${t('date.month')}`}
          value={current.firstKey}
          onChange={(e) => onMonth(e.target.value)}
        >
          {months.map((m) => (
            <option key={m.first} value={m.first}>
              {m.label}
            </option>
          ))}
        </Select>
      </div>
    </fieldset>
  );
}
