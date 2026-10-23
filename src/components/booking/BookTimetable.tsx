'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { CalendarCheck, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Flash } from '@/components/ui/Flash';
import { Sheet } from '@/components/ui/Sheet';
import { Stamp } from '@/components/ui/Stamp';
import { Textarea } from '@/components/ui/Textarea';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { formatPhone } from '@/lib/phone';
import { MAX_LIVE_BOOKINGS, type BookingErrorCode } from '@/lib/scheduling';
import type { DateKey } from '@/lib/time';
import { createBooking, type CreatedBooking } from '@/server/booking';
import { longDate, timeRange } from './dates';
import { Timetable } from './Timetable';
import type { CoachContact, PolicyInfo, TimetableCell } from './types';

export interface BookTimetableProps {
  cells: TimetableCell[];
  locale: string;
  timeZone: string;
  todayKey: DateKey;
  /** Week starts the client can browse (this week up to the end of the horizon). */
  weekStarts: DateKey[];
  initialWeek: DateKey;
  policy: PolicyInfo;
  coach: CoachContact;
  /** How many future live bookings the client already holds. */
  liveCount: number;
}

/** Errors that mean the picture on screen is out of date: refresh it. */
const STALE: BookingErrorCode[] = ['slotTaken', 'slotUnavailable', 'slotPast', 'tooSoon', 'outsideHorizon'];

export function BookTimetable({
  cells,
  locale,
  timeZone,
  todayKey,
  weekStarts,
  initialWeek,
  policy,
  coach,
  liveCount,
}: BookTimetableProps) {
  const t = useTranslations('booking');
  const router = useRouter();

  const [weekStart, setWeekStart] = useState(initialWeek);
  const index = Math.max(0, weekStarts.indexOf(weekStart));

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<TimetableCell | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<BookingErrorCode | null>(null);
  const [created, setCreated] = useState<CreatedBooking | null>(null);
  const [pending, startTransition] = useTransition();

  const atLimit = liveCount >= MAX_LIVE_BOOKINGS;

  const onSelect = (cell: TimetableCell) => {
    setSelected(cell);
    setNote('');
    setError(null);
    setCreated(null);
    setOpen(true);
  };

  const submit = () => {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await createBooking({ locale, startsAt: selected.startsAt, note: note.trim() || null });
      if (res.ok) {
        setCreated(res);
      } else {
        setError(res.error);
        if (STALE.includes(res.error)) router.refresh();
      }
    });
  };

  const isMine = selected?.tone === 'pending' || selected?.tone === 'confirmed';
  const when = selected
    ? {
        date: longDate(selected.startsAt, locale, timeZone),
        range: timeRange(selected.startsAt, selected.endsAt, locale, timeZone),
      }
    : null;
  const policyLine = t('sheet.policy', { hours: policy.cancelWindowHours });

  const summary = when ? (
    <div className="border-[1.5px] border-rule-strong bg-paper px-4 py-3">
      <p className="text-base font-semibold">{when.date}</p>
      <p className="num mt-1 text-3xl">
        <bdi>{when.range}</bdi>
      </p>
    </div>
  ) : null;

  let title = t('sheet.title');
  let body: ReactNode;
  let footer: ReactNode;

  if (created) {
    const sent = created.status === 'PENDING';
    title = sent ? t('sheet.titleSent') : t('sheet.titleBooked');
    body = (
      <div className="flex flex-col gap-5" role="status">
        <div className="pt-2">
          <Stamp
            status={created.status}
            size="lg"
            land
            label={sent ? t('sheet.stamp.sent') : t('sheet.stamp.confirmed')}
          />
        </div>
        {summary}
        <p className="text-base text-ink-2">{sent ? t('sheet.doneApproval') : t('sheet.doneInstant')}</p>
        <p className="text-sm text-ink-2">{policyLine}</p>
      </div>
    );
    footer = (
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <ButtonLink href="/app/bookings" fullWidth variant="primary">
          {t('sheet.mySessions')}
        </ButtonLink>
        <Button fullWidth variant="outline" onClick={() => setOpen(false)}>
          {t('sheet.done')}
        </Button>
      </div>
    );
  } else if (isMine && selected) {
    const confirmed = selected.tone === 'confirmed';
    title = t('sheet.mineTitle');
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <Stamp status={confirmed ? 'CONFIRMED' : 'PENDING'} />
        </div>
        {summary}
        <p className="text-base text-ink-2">{confirmed ? t('sheet.mineConfirmed') : t('sheet.minePending')}</p>
      </div>
    );
    footer = (
      <ButtonLink href="/app/bookings" fullWidth>
        {t('sheet.manage')}
      </ButtonLink>
    );
  } else {
    const blocked = atLimit || (error !== null && STALE.includes(error));
    body = (
      <div className="flex flex-col gap-4">
        {summary}
        {atLimit ? (
          <Flash tone="warning" title={t('errors.tooManyBookings')}>
            <ButtonLink href="/app/bookings" variant="outline" size="sm" className="mt-2">
              {t('sheet.mySessions')}
            </ButtonLink>
          </Flash>
        ) : null}
        {error ? (
          <Flash tone="error" title={t(`errors.${error}`)}>
            {STALE.includes(error) ? (
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setOpen(false)}>
                {t('sheet.pickAnother')}
              </Button>
            ) : null}
          </Flash>
        ) : null}
        <Field label={t('sheet.noteLabel')} hint={t('sheet.noteHint')} optional>
          <Textarea
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={pending}
          />
        </Field>
        <ul className="flex flex-col gap-1.5 text-sm text-ink-2">
          <li>{policy.requireApproval ? t('sheet.approvalNote') : t('sheet.instantNote')}</li>
          <li>{policyLine}</li>
        </ul>
      </div>
    );
    footer = (
      <Button fullWidth size="lg" loading={pending} disabled={blocked} onClick={submit}>
        <CalendarCheck className="size-5" aria-hidden="true" />
        {t('sheet.confirm')}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Timetable
        cells={cells}
        locale={locale}
        timeZone={timeZone}
        todayKey={todayKey}
        weekStart={weekStart}
        onWeekChange={setWeekStart}
        prevWeek={weekStarts[index - 1] ?? null}
        nextWeek={weekStarts[index + 1] ?? null}
        onSelect={onSelect}
        label={t('book.gridLabel')}
      />
      <Legend />
      {coach.phone ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
          <Phone className="size-4 shrink-0" aria-hidden="true" />
          <span>{t('book.callCoach', { name: coach.name })}</span>
          <a href={`tel:${coach.phone}`} dir="ltr" className="num font-semibold text-ink underline underline-offset-4">
            {formatPhone(coach.phone, locale)}
          </a>
        </p>
      ) : null}

      <Sheet open={open} onOpenChange={setOpen} title={title} footer={footer}>
        {body}
      </Sheet>
    </div>
  );
}

/** What the cell looks mean: every state also carries words inside the cell. */
function Legend() {
  const t = useTranslations('booking');
  const items: { tone: string; label: string }[] = [
    { tone: 'border-ink-3 bg-card hatch', label: t('legend.open') },
    { tone: 'border-transparent bg-paper-2', label: t('legend.taken') },
    { tone: 'border-plate-yellow bg-plate-yellow', label: t('legend.pending') },
    { tone: 'border-plate-blue bg-plate-blue', label: t('legend.confirmed') },
    { tone: 'border-rule bg-transparent opacity-60', label: t('legend.unavailable') },
  ];
  return (
    <ul aria-label={t('legend.title')} className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span aria-hidden="true" className={cn('inline-block h-4 w-6 rounded-[var(--r)] border-[1.5px]', item.tone)} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
