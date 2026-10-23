import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/coach/PageHeader';
import { SettingsForm } from '@/components/coach/SettingsForm';
import { requireCoach } from '@/lib/auth';
import { getCoachSettings } from '@/lib/settings';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'coach' });
  return { title: t('settings.title'), robots: { index: false } };
}

export default async function CoachSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireCoach(locale);

  const [t, s] = await Promise.all([getTranslations('coach'), getCoachSettings()]);

  return (
    <div className="page-x flex flex-col gap-8 py-6 md:py-10">
      <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />
      <SettingsForm
        initial={{
          coachName: s.coachName,
          coachNameFa: s.coachNameFa,
          bioEn: s.bioEn,
          bioFa: s.bioFa,
          locationEn: s.locationEn,
          locationFa: s.locationFa,
          timezone: s.timezone,
          slotMinutes: s.slotMinutes,
          bufferMinutes: s.bufferMinutes,
          horizonDays: s.horizonDays,
          minNoticeHours: s.minNoticeHours,
          cancelWindowHours: s.cancelWindowHours,
          requireApproval: s.requireApproval,
          allowSignup: s.allowSignup,
          barKg: s.barKg,
        }}
      />
    </div>
  );
}
