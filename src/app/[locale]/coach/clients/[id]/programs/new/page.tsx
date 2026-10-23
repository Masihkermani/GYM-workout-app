import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { requireCoach } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NewProgramForm } from '@/components/training/NewProgramForm';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'training' });
  return { title: t('program.new') };
}

export default async function CoachNewProgramPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireCoach(locale);
  const client = await prisma.user.findFirst({ where: { id, role: 'CLIENT' }, select: { id: true, name: true } });
  if (!client) notFound();
  const t = await getTranslations({ locale, namespace: 'training' });
  return (
    <div className="page-x flex flex-col gap-6 py-8 md:py-12">
      <SectionLabel as="h1">{t('program.newFor', { name: client.name })}</SectionLabel>
      <p className="max-w-prose text-base text-ink-2">{t('program.newIntroCoach')}</p>
      <NewProgramForm viewer="coach" clientId={client.id} />
    </div>
  );
}
