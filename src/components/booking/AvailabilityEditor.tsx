'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Flash } from '@/components/ui/Flash';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { formatMinuteOfDay, formatNumber, formatWeekday } from '@/lib/format';
import {
  parseTimeOfDay,
  validateWindow,
  type ActionResult,
  type BookingErrorCode,
  type WindowError,
} from '@/lib/scheduling';
import { weekStartsOn } from '@/lib/time';
import { addAvailabilityRule, deleteAvailabilityRule, updateAvailabilityRule } from '@/server/booking';
import { ActionButton } from './ActionButton';
import type { WindowDTO } from './types';

/** Weekday order for the locale: Saturday first for fa, Monday first for en. */
function weekdayOrder(locale: string): number[] {
  const first = weekStartsOn(locale);
  return Array.from({ length: 7 }, (_, i) => (first + i) % 7);
}

/** 2026-10-25 is a Sunday: its weekday name labels JS weekday 0..6 without any timezone maths. */
function weekdayName(weekday: number, locale: string): string {
  return formatWeekday(Date.UTC(2026, 9, 25 + weekday, 12), locale, { timeZone: 'UTC' });
}

function slotCount(startMinute: number, endMinute: number, slotMinutes: number, bufferMinutes: number): number {
  let n = 0;
  for (let m = startMinute; m + slotMinutes <= endMinute; m += slotMinutes + bufferMinutes) n++;
  return n;
}

export function AvailabilityEditor({
  rules,
  slotMinutes,
  bufferMinutes,
  locale,
}: {
  rules: WindowDTO[];
  slotMinutes: number;
  bufferMinutes: number;
  locale: string;
}) {
  const t = useTranslations('booking');
  const [offGrid, setOffGrid] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-ink-2">{t('availability.intro', { minutes: formatNumber(slotMinutes, locale, { grouping: false }) })}</p>
      {offGrid > 0 ? (
        <Flash tone="warning">{t('availability.offGrid', { count: formatNumber(offGrid, locale, { grouping: false }) })}</Flash>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {weekdayOrder(locale).map((weekday) => (
          <DayCard
            key={weekday}
            weekday={weekday}
            rules={rules.filter((r) => r.weekday === weekday && r.active)}
            allRules={rules}
            slotMinutes={slotMinutes}
            bufferMinutes={bufferMinutes}
            locale={locale}
            onResult={(n) => setOffGrid(n)}
          />
        ))}
      </div>
    </div>
  );
}

function DayCard({
  weekday,
  rules,
  allRules,
  slotMinutes,
  bufferMinutes,
  locale,
  onResult,
}: {
  weekday: number;
  rules: WindowDTO[];
  allRules: WindowDTO[];
  slotMinutes: number;
  bufferMinutes: number;
  locale: string;
  onResult: (offGrid: number) => void;
}) {
  const t = useTranslations('booking');
  const name = weekdayName(weekday, locale);
  return (
    <section aria-label={name} className="border-[1.5px] border-rule-strong bg-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-2.5">
        <h3 className="text-lg">{name}</h3>
        {rules.length === 0 ? <span className="text-sm text-ink-2">{t('availability.dayOff')}</span> : null}
      </header>
      <ul className="flex flex-col divide-y divide-rule">
        {rules.map((rule, i) => (
          <WindowRow
            key={`${rule.id}-${rule.startMinute}-${rule.endMinute}`}
            rule={rule}
            index={i + 1}
            dayName={name}
            allRules={allRules}
            slotMinutes={slotMinutes}
            bufferMinutes={bufferMinutes}
            locale={locale}
            onResult={onResult}
          />
        ))}
        <WindowRow
          weekday={weekday}
          index={rules.length + 1}
          dayName={name}
          allRules={allRules}
          slotMinutes={slotMinutes}
          bufferMinutes={bufferMinutes}
          locale={locale}
          onResult={onResult}
        />
      </ul>
    </section>
  );
}

type RowProps = {
  /** Existing window to edit; omit for the "add" row. */
  rule?: WindowDTO;
  weekday?: number;
  index: number;
  dayName: string;
  allRules: WindowDTO[];
  slotMinutes: number;
  bufferMinutes: number;
  locale: string;
  onResult: (offGrid: number) => void;
};

function WindowRow({ rule, weekday, index, dayName, allRules, slotMinutes, bufferMinutes, locale, onResult }: RowProps) {
  const t = useTranslations('booking');
  const { toast } = useToast();
  const adding = !rule;
  const [start, setStart] = useState(rule ? formatMinuteOfDay(rule.startMinute, locale) : '');
  const [end, setEnd] = useState(rule ? formatMinuteOfDay(rule.endMinute, locale) : '');
  const [error, setError] = useState<BookingErrorCode | WindowError | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [, startTransition] = useTransition();

  const startMin = parseTimeOfDay(start);
  const endMin = parseTimeOfDay(end);
  const dirty = adding ? start !== '' || end !== '' : startMin !== rule.startMinute || endMin !== rule.endMinute;

  const tidy = (value: string, set: (v: string) => void) => {
    const m = parseTimeOfDay(value);
    if (m !== null) set(formatMinuteOfDay(m, locale));
  };

  const run = (kind: 'save' | 'delete', fn: () => Promise<ActionResult<{ offGrid?: number }>>) => {
    setBusy(kind);
    setError(null);
    startTransition(async () => {
      const res = await fn();
      setBusy(null);
      if (res.ok) {
        onResult(res.offGrid ?? 0);
        if (adding) {
          setStart('');
          setEnd('');
        }
        toast({ message: t(kind === 'delete' ? 'availability.removed' : 'availability.saved'), tone: 'success' });
      } else {
        setError(res.error);
      }
    });
  };

  const save = () => {
    if (startMin === null || endMin === null) {
      setError('invalidTime');
      return;
    }
    // instant feedback; the server re-validates against the real rules
    const problem = validateWindow(
      { id: rule?.id, weekday: rule?.weekday ?? weekday!, startMinute: startMin, endMinute: endMin },
      allRules.filter((r) => r.active),
      slotMinutes,
    );
    if (problem) {
      setError(problem);
      return;
    }
    run('save', () =>
      rule
        ? updateAvailabilityRule({ locale, id: rule.id, startMinute: startMin, endMinute: endMin })
        : addAvailabilityRule({ locale, weekday: weekday!, startMinute: startMin, endMinute: endMin }),
    );
  };

  const count = startMin !== null && endMin !== null ? slotCount(startMin, endMin, slotMinutes, bufferMinutes) : null;
  const num = formatNumber(index, locale, { grouping: false });
  const errId = `err-${rule?.id ?? `new-${weekday}`}`;

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[5.5rem]">
          <Input
            aria-label={t('availability.startAria', { day: dayName, n: num })}
            aria-describedby={error ? errId : undefined}
            aria-invalid={error ? true : undefined}
            inputMode="numeric"
            dir="ltr"
            autoComplete="off"
            maxLength={5}
            placeholder={formatMinuteOfDay(17 * 60, locale)}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            onBlur={() => tidy(start, setStart)}
            className="num px-1 text-center"
          />
        </div>
        <span aria-hidden="true" className="text-ink-3">
          –
        </span>
        <div className="w-[5.5rem]">
          <Input
            aria-label={t('availability.endAria', { day: dayName, n: num })}
            aria-describedby={error ? errId : undefined}
            aria-invalid={error ? true : undefined}
            inputMode="numeric"
            dir="ltr"
            autoComplete="off"
            maxLength={5}
            placeholder={formatMinuteOfDay(21 * 60, locale)}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            onBlur={() => tidy(end, setEnd)}
            className="num px-1 text-center"
          />
        </div>
        <div className="ms-auto flex items-center gap-2">
          {adding ? (
            <ActionButton
              tone="confirm"
              loading={busy === 'save'}
              disabled={!dirty}
              onClick={save}
              aria-label={t('availability.addAria', { day: dayName })}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t('availability.add')}
            </ActionButton>
          ) : (
            <>
              {dirty ? (
                <ActionButton tone="confirm" loading={busy === 'save'} onClick={save}>
                  {t('availability.save')}
                </ActionButton>
              ) : null}
              <ActionButton
                tone="neutral"
                loading={busy === 'delete'}
                onClick={() => run('delete', () => deleteAvailabilityRule({ locale, id: rule.id }))}
                aria-label={t('availability.deleteAria', { day: dayName, n: num })}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </ActionButton>
            </>
          )}
        </div>
      </div>
      {error ? (
        <p id={errId} role="alert" className="text-sm font-medium text-danger">
          {t(`errors.${error}`)}
        </p>
      ) : count !== null && !adding ? (
        <p className={cn('text-xs text-ink-2')}>{t('availability.slots', { count })}</p>
      ) : null}
    </li>
  );
}
