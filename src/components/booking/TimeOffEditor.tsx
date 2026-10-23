'use client';

import { useState, useTransition } from 'react';
import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Flash } from '@/components/ui/Flash';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatNumber } from '@/lib/format';
import type { BookingErrorCode } from '@/lib/scheduling';
import { type DateKey } from '@/lib/time';
import { addTimeOff, deleteTimeOff } from '@/server/booking';
import { ActionButton } from './ActionButton';
import { noonOf } from './dates';
import { DatePicker } from './DatePicker';
import type { TimeOffDTO } from './types';

export function TimeOffEditor({
  items,
  pastCount,
  todayKey,
  locale,
  timeZone,
}: {
  items: TimeOffDTO[];
  pastCount: number;
  todayKey: DateKey;
  locale: string;
  timeZone: string;
}) {
  const t = useTranslations('booking');
  const { toast } = useToast();
  const [startDate, setStartDate] = useState<DateKey>(todayKey);
  const [endDate, setEndDate] = useState<DateKey>(todayKey);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<BookingErrorCode | null>(null);
  const [affected, setAffected] = useState(0);
  const [busy, setBusy] = useState<'add' | string | null>(null);
  const [, startTransition] = useTransition();

  const day = (key: DateKey) => formatDate(noonOf(key, timeZone), locale, { timeZone, style: 'medium' });
  const range = (item: TimeOffDTO) =>
    item.startDate === item.endDate ? day(item.startDate) : `${day(item.startDate)} – ${day(item.endDate)}`;

  const add = () => {
    setError(null);
    setAffected(0);
    if (endDate < startDate) {
      setError('rangeInvalid');
      return;
    }
    setBusy('add');
    startTransition(async () => {
      const res = await addTimeOff({ locale, startDate, endDate, reason: reason.trim() || null });
      setBusy(null);
      if (res.ok) {
        setReason('');
        setAffected(res.affectedBookings);
        toast({ message: t('timeOff.added'), tone: 'success' });
      } else {
        setError(res.error);
      }
    });
  };

  const remove = (id: string) => {
    setBusy(id);
    startTransition(async () => {
      const res = await deleteTimeOff({ locale, id });
      setBusy(null);
      if (res.ok) toast({ message: t('timeOff.removed'), tone: 'success' });
      else toast({ message: t(`errors.${res.error}`), tone: 'error' });
    });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <section aria-labelledby="timeoff-list" className="flex flex-col gap-3">
        <h3 id="timeoff-list" className="label-caps text-ink-2">
          {t('timeOff.upcoming')}
        </h3>
        {items.length === 0 ? (
          <EmptyState icon={CalendarOff} title={t('timeOff.emptyTitle')} description={t('timeOff.emptyBody')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 border-[1.5px] border-rule-strong bg-card px-4 py-3">
                <div className="min-w-0">
                  <p className="num text-base font-semibold">
                    <bdi>{range(item)}</bdi>
                  </p>
                  {item.reason ? (
                    <p className="truncate text-sm text-ink-2">
                      <bdi>{item.reason}</bdi>
                    </p>
                  ) : null}
                </div>
                <ActionButton
                  tone="neutral"
                  loading={busy === item.id}
                  onClick={() => remove(item.id)}
                  aria-label={t('timeOff.deleteAria', { range: range(item) })}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {t('timeOff.delete')}
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
        {pastCount > 0 ? (
          <p className="text-sm text-ink-2">{t('timeOff.past', { count: formatNumber(pastCount, locale, { grouping: false }) })}</p>
        ) : null}
      </section>

      <section aria-labelledby="timeoff-add" className="flex flex-col gap-4 border-[1.5px] border-rule-strong bg-card p-4 lg:self-start">
        <h3 id="timeoff-add" className="label-caps text-ink-2">
          {t('timeOff.addTitle')}
        </h3>
        {error ? <Flash tone="error">{t(`errors.${error}`)}</Flash> : null}
        {affected > 0 ? (
          <Flash tone="warning">{t('timeOff.affected', { count: formatNumber(affected, locale, { grouping: false }) })}</Flash>
        ) : null}
        <DatePicker
          value={startDate}
          onChange={(v) => {
            setStartDate(v);
            if (endDate < v) setEndDate(v);
          }}
          legend={t('timeOff.from')}
          locale={locale}
          timeZone={timeZone}
        />
        <DatePicker value={endDate} onChange={setEndDate} legend={t('timeOff.to')} locale={locale} timeZone={timeZone} />
        <Field label={t('timeOff.reason')} optional>
          <Input maxLength={120} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <ActionButton tone="confirm" fullWidth loading={busy === 'add'} onClick={add}>
          <Plus className="size-4" aria-hidden="true" />
          {t('timeOff.add')}
        </ActionButton>
      </section>
    </div>
  );
}
