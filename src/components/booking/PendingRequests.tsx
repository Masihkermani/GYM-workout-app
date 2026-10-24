import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCoachSettings } from '@/lib/settings';
import { longDate, timeRange } from './dates';
import { PendingRequestsList, type PendingItem } from './PendingRequestsList';

/** Coach dashboard: PENDING requests that have not ended yet, soonest first, with one-tap confirm / decline. */
export async function PendingRequests({ locale }: { locale: string }) {
  const [t, settings] = await Promise.all([getTranslations({ locale, namespace: 'booking' }), getCoachSettings()]);
  const tz = settings.timezone;
  const rows = await prisma.booking.findMany({
    where: { status: 'PENDING', endsAt: { gt: new Date() } },
    orderBy: { startsAt: 'asc' },
    take: 20,
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      clientNote: true,
      client: { select: { id: true, name: true } },
    },
  });

  const items: PendingItem[] = rows.map((b) => ({
    id: b.id,
    clientId: b.client.id,
    clientName: b.client.name,
    date: longDate(b.startsAt, locale, tz),
    time: timeRange(b.startsAt, b.endsAt, locale, tz),
    note: b.clientNote,
  }));

  return (
    <div role="group" className="flex flex-col gap-3" data-testid="pending-requests" aria-label={t('coach.pendingTitle')}>
      <PendingRequestsList items={items} locale={locale} />
    </div>
  );
}
