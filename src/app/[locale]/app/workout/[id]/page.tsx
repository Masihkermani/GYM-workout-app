import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { requireUser } from '@/lib/auth';
import { getLoggerData } from '@/lib/training/queries';
import { WorkoutLogger } from '@/components/training/WorkoutLogger';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'training' });
  return { title: t('workout.label') };
}

export default async function WorkoutPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const data = await getLoggerData(id, locale);
  if (!data || (user.role !== 'COACH' && data.clientId !== user.id)) notFound();
  // a finished workout is history now
  if (data.finishedAt) redirect({ href: `/app/history/${id}`, locale });
  return <WorkoutLogger data={data} locale={locale} />;
}
