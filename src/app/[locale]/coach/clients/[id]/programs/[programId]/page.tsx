import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCoach } from '@/lib/auth';
import { getProgram } from '@/lib/training/queries';
import { ProgramBuilder } from '@/components/training/ProgramBuilder';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'training' });
  return { title: t('builder.heading') };
}

export default async function CoachProgramBuilderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; programId: string }>;
}) {
  const { locale, id, programId } = await params;
  setRequestLocale(locale);
  await requireCoach(locale);
  const program = await getProgram(programId);
  if (!program || program.clientId !== id) notFound();
  return <ProgramBuilder program={program} viewer="coach" backHref={`/coach/clients/${id}`} />;
}
