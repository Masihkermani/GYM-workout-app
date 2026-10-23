'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { CalendarPlus, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Flash } from '@/components/ui/Flash';
import { Select } from '@/components/ui/Select';
import { Sheet } from '@/components/ui/Sheet';
import { Stamp } from '@/components/ui/Stamp';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { formatDate, formatTime, formatWeekday } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import type { BookingErrorCode } from '@/lib/scheduling';
import type { DateKey } from '@/lib/time';
import { bookForClient, moveBooking, setCoachNote } from '@/server/booking';
import { CoachBookingActions } from './CoachBookingActions';
import { longDate, timeRange } from './dates';
import { Timetable } from './Timetable';
import type { CoachBookingDTO, TimetableCell } from './types';

export interface ScheduleBoardProps {
  cells: TimetableCell[];
  bookings: CoachBookingDTO[];
  /** Start instants (ms) of open slots the coach can place a session in. */
  openSlots: number[];
  clients: { id: string; name: string }[];
  locale: string;
  timeZone: string;
  todayKey: DateKey;
  weekStart: DateKey;
  prevWeek: DateKey;
  nextWeek: DateKey;
  /** Open the "book for a client" sheet on load with this client picked (?book=<id>). */
  initialClientId?: string | null;
}

type Panel = { kind: 'booking'; id: string } | { kind: 'book'; startsAt: number | null } | null;

export function ScheduleBoard({
  cells,
  bookings,
  openSlots,
  clients,
  locale,
  timeZone,
  todayKey,
  weekStart,
  prevWeek,
  nextWeek,
  initialClientId = null,
}: ScheduleBoardProps) {
  const t = useTranslations('booking');
  const router = useRouter();
  const [navigating, startNav] = useTransition();
  const [panel, setPanel] = useState<Panel>(initialClientId ? { kind: 'book', startsAt: null } : null);
  const [bookClient, setBookClient] = useState(initialClientId ?? '');

  const goToWeek = (week: DateKey) => startNav(() => router.push(`/coach/schedule?week=${week}`, { scroll: false }));

  const onSelect = (cell: TimetableCell) => {
    if (cell.bookingId) setPanel({ kind: 'booking', id: cell.bookingId });
    else setPanel({ kind: 'book', startsAt: cell.startsAt });
  };

  const close = () => setPanel(null);
  const booking = panel?.kind === 'booking' ? (bookings.find((b) => b.id === panel.id) ?? null) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">{t('coach.gridHint')}</p>
        <Button
          variant="outline"
          onClick={() => {
            setBookClient('');
            setPanel({ kind: 'book', startsAt: null });
          }}
        >
          <CalendarPlus className="size-5" aria-hidden="true" />
          {t('coach.bookForClient')}
        </Button>
      </div>

      <Timetable
        cells={cells}
        locale={locale}
        timeZone={timeZone}
        todayKey={todayKey}
        weekStart={weekStart}
        onWeekChange={goToWeek}
        prevWeek={prevWeek}
        nextWeek={nextWeek}
        onSelect={onSelect}
        label={t('coach.gridLabel')}
        busy={navigating}
      />
      <CoachLegend />

      <Sheet
        open={panel?.kind === 'booking' && booking !== null}
        onOpenChange={(open) => !open && close()}
        title={booking?.clientName ?? ''}
        description={
          booking ? (
            <>
              {longDate(booking.startsAt, locale, timeZone)}
              {locale === 'fa' ? '، ' : ', '}
              <bdi>{timeRange(booking.startsAt, booking.endsAt, locale, timeZone)}</bdi>
            </>
          ) : undefined
        }
      >
        {booking ? (
          <BookingDetail
            key={booking.id}
            booking={booking}
            openSlots={openSlots}
            locale={locale}
            timeZone={timeZone}
            onClose={close}
          />
        ) : null}
      </Sheet>

      <Sheet
        open={panel?.kind === 'book'}
        onOpenChange={(open) => !open && close()}
        title={t('coach.bookTitle')}
        description={t('coach.bookBody')}
      >
        {panel?.kind === 'book' ? (
          <BookForClient
            key={`${panel.startsAt ?? 'none'}-${bookClient}`}
            clients={clients}
            openSlots={openSlots}
            initialStartsAt={panel.startsAt}
            initialClientId={bookClient}
            locale={locale}
            timeZone={timeZone}
            onDone={close}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

/** Slot picker options grouped by day: «شنبه ۳ آبان» → «۱۷:۰۰». */
function SlotOptions({
  slots,
  locale,
  timeZone,
}: {
  slots: number[];
  locale: string;
  timeZone: string;
}) {
  const groups = new Map<string, number[]>();
  for (const s of slots) {
    const day = `${formatWeekday(s, locale, { timeZone })}${locale === 'fa' ? '، ' : ', '}${formatDate(s, locale, { timeZone, style: 'short' })}`;
    groups.set(day, [...(groups.get(day) ?? []), s]);
  }
  return (
    <>
      {[...groups].map(([day, list]) => (
        <optgroup key={day} label={day}>
          {list.map((s) => (
            <option key={s} value={s}>
              {day}
              {locale === 'fa' ? '، ' : ', '}
              {formatTime(s, locale, { timeZone })}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

function BookingDetail({
  booking,
  openSlots,
  locale,
  timeZone,
  onClose,
}: {
  booking: CoachBookingDTO;
  openSlots: number[];
  locale: string;
  timeZone: string;
  onClose: () => void;
}) {
  const t = useTranslations('booking');
  const { toast } = useToast();
  const [note, setNote] = useState(booking.coachNote ?? '');
  const [moveTo, setMoveTo] = useState('');
  const [error, setError] = useState<BookingErrorCode | null>(null);
  const [noteBusy, startNote] = useTransition();
  const [moveBusy, startMove] = useTransition();

  const live = booking.status === 'PENDING' || booking.status === 'CONFIRMED';
  const targets = openSlots.filter((s) => s !== booking.startsAt);

  const saveNote = () =>
    startNote(async () => {
      const res = await setCoachNote({ locale, bookingId: booking.id, note });
      if (res.ok) {
        setError(null);
        toast({ message: t('coach.noteSaved'), tone: 'success' });
      } else setError(res.error);
    });

  const move = () => {
    if (!moveTo) return;
    setError(null);
    startMove(async () => {
      const res = await moveBooking({ locale, bookingId: booking.id, startsAt: Number(moveTo) });
      if (res.ok) {
        onClose();
        toast({ message: t('coach.toast.move'), tone: 'success' });
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {error ? <Flash tone="error">{t(`errors.${error}`)}</Flash> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Stamp status={booking.status} label={booking.status === 'PENDING' ? t('legend.awaiting') : undefined} />
        <Link
          href={`/coach/clients/${booking.clientId}`}
          className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
        >
          {t('coach.openProfile')}
        </Link>
      </div>

      <p className="flex items-center gap-2 text-sm">
        <Phone className="size-4 shrink-0" aria-hidden="true" />
        <a
          href={`tel:${booking.clientPhone}`}
          dir="ltr"
          className="num inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
        >
          {formatPhone(booking.clientPhone, locale)}
        </a>
      </p>

      {booking.clientNote ? (
        <div className="border-s-[3px] border-ink ps-3 text-sm">
          <p className="font-semibold">{t('row.clientNote')}</p>
          <p className="whitespace-pre-line text-ink-2">
            <bdi>{booking.clientNote}</bdi>
          </p>
        </div>
      ) : null}

      <CoachBookingActions
        bookingId={booking.id}
        status={booking.status}
        started={booking.started}
        locale={locale}
        allowCorrect
        onDone={onClose}
      />

      <Field label={t('coach.noteLabel')} hint={t('coach.noteHint')} optional>
        <Textarea
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="neutral" size="sm" loading={noteBusy} disabled={note === (booking.coachNote ?? '')} onClick={saveNote}>
          {t('coach.saveNote')}
        </Button>
      </div>

      {live ? (
        <div className="flex flex-col gap-3 border-t border-rule pt-5">
          <h3 className="label-caps text-ink-2">{t('coach.moveTitle')}</h3>
          {targets.length === 0 ? (
            <p className="text-sm text-ink-2">{t('coach.noOpenSlots')}</p>
          ) : (
            <>
              <Field label={t('coach.moveTo')}>
                <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  <option value="">{t('coach.pickSlot')}</option>
                  <SlotOptions slots={targets} locale={locale} timeZone={timeZone} />
                </Select>
              </Field>
              <div>
                <Button variant="neutral" size="sm" loading={moveBusy} disabled={!moveTo} onClick={move}>
                  {t('coach.move')}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function BookForClient({
  clients,
  openSlots,
  initialStartsAt,
  initialClientId,
  locale,
  timeZone,
  onDone,
}: {
  clients: { id: string; name: string }[];
  openSlots: number[];
  initialStartsAt: number | null;
  initialClientId: string;
  locale: string;
  timeZone: string;
  onDone: () => void;
}) {
  const t = useTranslations('booking');
  const { toast } = useToast();
  const [clientId, setClientId] = useState(initialClientId);
  const [startsAt, setStartsAt] = useState(initialStartsAt ? String(initialStartsAt) : '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<BookingErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  // a slot opened from the grid may lie beyond the list the page prepared: keep it selectable
  const slots = initialStartsAt && !openSlots.includes(initialStartsAt) ? [...openSlots, initialStartsAt].sort((a, b) => a - b) : openSlots;
  const ready = clientId !== '' && startsAt !== '';

  const submit = () => {
    if (!ready) return;
    setError(null);
    startTransition(async () => {
      const res = await bookForClient({ locale, clientId, startsAt: Number(startsAt), note: note.trim() || null });
      if (res.ok) {
        const name = clients.find((c) => c.id === clientId)?.name ?? '';
        toast({ message: t('coach.toast.book', { name }), tone: 'success' });
        onDone();
      } else {
        setError(res.error);
      }
    });
  };

  let footerHint: ReactNode = null;
  if (!ready) footerHint = <p className="text-sm text-ink-2">{t('coach.bookNeeds')}</p>;

  return (
    <div className="flex flex-col gap-4">
      {error ? <Flash tone="error">{t(`errors.${error}`)}</Flash> : null}
      <Field label={t('coach.client')} required>
        <Select value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={pending}>
          <option value="">{t('coach.pickClient')}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('coach.slot')} required>
        <Select value={startsAt} onChange={(e) => setStartsAt(e.target.value)} disabled={pending}>
          <option value="">{t('coach.pickSlot')}</option>
          <SlotOptions slots={slots} locale={locale} timeZone={timeZone} />
        </Select>
      </Field>
      <Field label={t('sheet.noteLabel')} optional>
        <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} />
      </Field>
      {footerHint}
      <Button variant="blue" size="sm" fullWidth loading={pending} disabled={!ready} onClick={submit}>
        {t('coach.bookConfirm')}
      </Button>
    </div>
  );
}

/** Coach grid legend: every tone also carries words in its cell. */
function CoachLegend() {
  const t = useTranslations('booking');
  const items: { tone: string; label: string }[] = [
    { tone: 'border-ink-3 bg-card hatch', label: t('legend.open') },
    { tone: 'border-plate-yellow bg-plate-yellow', label: t('legend.awaiting') },
    { tone: 'border-plate-blue bg-plate-blue', label: t('legend.confirmedCoach') },
    { tone: 'border-plate-green bg-plate-green', label: t('legend.completed') },
    { tone: 'border-danger bg-card', label: t('legend.noShow') },
    { tone: 'border-transparent bg-paper-2', label: t('legend.off') },
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
