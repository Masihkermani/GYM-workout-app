import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { ClientBookingsPanel } from '@/components/booking/ClientBookingsPanel';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { ClientTrainingPanel } from '@/components/training/ClientTrainingPanel';
import { requireCoach } from '@/lib/auth';
import { prisma } from '@/lib/db';

export default async function CoachClientPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireCoach(locale);

  const client = await prisma.user.findFirst({ where: { id, role: 'CLIENT' }, select: { id: true, name: true } });
  if (!client) notFound();

  return (
    <div className="page-x flex flex-col gap-10 py-8 md:py-12">
      <SectionLabel as="h1">{client.name}</SectionLabel>
      {/* Feature agents replace these two panels; the signatures are fixed. */}
      <ClientBookingsPanel clientId={client.id} locale={locale} />
      <ClientTrainingPanel clientId={client.id} locale={locale} />
    </div>
  );
}
