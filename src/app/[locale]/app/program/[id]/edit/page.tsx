import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { requireUser } from '@/lib/auth';
import { getProgram } from '@/lib/training/queries';
import { ProgramBuilder } from '@/components/training/ProgramBuilder';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'training' });
  return { title: t('builder.heading') };
}

export default async function EditProgramPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const program = await getProgram(id);
  // someone else's program is simply not there for a client
  if (!program || (user.role !== 'COACH' && program.clientId !== user.id)) notFound();
  // a client cannot edit what the coach wrote: send them to the read-only view
  if (user.role !== 'COACH' && program.authorId !== user.id) redirect({ href: '/app/program', locale });
  return <ProgramBuilder program={program} viewer={user.role === 'COACH' ? 'coach' : 'client'} backHref="/app/program" />;
}
