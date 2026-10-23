import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { WorkoutLogger } from '@/components/training/WorkoutLogger';
import { redirect } from '@/i18n/navigation';
import { requireCoach } from '@/lib/auth';
import { getLoggerData } from '@/lib/training/queries';

type Props = { params: Promise<{ locale: string; id: string; workoutId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'training' });
  // Generic on purpose: metadata runs before the auth check and must not reveal a client's name.
  return { title: t('workout.label'), robots: { index: false } };
}

/**
 * The coach logs a workout FOR a client (the in-person session): the same live logger the client
 * uses, in the coach shell. The workout must belong to the client in the URL, so a mismatched pair is a
 * 404; every server action behind the logger re-checks the coach role itself.
 */
export default async function CoachWorkoutPage({ params }: Props) {
  const { locale, id, workoutId } = await params;
  setRequestLocale(locale);
  await requireCoach(locale);

  const data = await getLoggerData(workoutId, locale);
  if (!data || data.clientId !== id) notFound();

  const backHref = `/coach/clients/${id}`;
  // a finished workout is history: it shows under the client's recent workouts
  if (data.finishedAt) redirect({ href: backHref, locale });
  return <WorkoutLogger data={data} locale={locale} coachMode={{ backHref }} />;
}
