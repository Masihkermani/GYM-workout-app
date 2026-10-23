import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CoachTodayAgenda } from '@/components/booking/CoachTodayAgenda';
import { PendingRequests } from '@/components/booking/PendingRequests';
import { WeekOccupancy } from '@/components/booking/WeekOccupancy';
import { DashboardSection } from '@/components/coach/DashboardSection';
import { dayPart, firstName } from '@/components/coach/format';
import { getDashboardStats } from '@/components/coach/queries';
import { IdleClients } from '@/components/training/IdleClients';
import { RecentSetsFeed } from '@/components/training/RecentSetsFeed';
import { requireCoach } from '@/lib/auth';
import { formatDate, formatNumber } from '@/lib/format';
import { coachDisplayName, getCoachSettings } from '@/lib/settings';

const IDLE_DAYS = 7;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'coach' });
  return { title: t('dashboard.title'), robots: { index: false } };
}

export default async function CoachDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const coach = await requireCoach(locale);

  const now = new Date();
  const [t, settings] = await Promise.all([getTranslations('coach'), getCoachSettings()]);
  const stats = await getDashboardStats(locale, settings.timezone, now);

  const name = firstName(coachDisplayName(settings, locale)) || firstName(coach.name);
  const num = (n: number) => formatNumber(n, locale, { grouping: false });
  const figures = [
    { label: t('dashboard.stats.sessions'), value: stats.sessionsThisWeek },
    { label: t('dashboard.stats.clients'), value: stats.activeClients },
    { label: t('dashboard.stats.pending'), value: stats.pendingRequests },
  ];

  return (
    <div className="page-x flex flex-col gap-8 py-6 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="label-caps text-ink-2">{formatDate(now, locale, { timeZone: settings.timezone, style: 'long' })}</p>
          <h1 className="mt-1 text-2xl font-extrabold font-expanded md:text-3xl">
            {t(`dashboard.greeting.${dayPart(now, settings.timezone)}`, { name })}
          </h1>
        </div>
        <dl className="grid w-full max-w-md grid-cols-3 border-[1.5px] border-rule-strong bg-card sm:w-auto sm:max-w-none">
          {figures.map((f) => (
            <div key={f.label} className="flex flex-col-reverse justify-end gap-0.5 border-s border-rule px-4 py-2 first:border-s-0 sm:min-w-32">
              <dt className="text-xs leading-snug text-ink-2">{f.label}</dt>
              <dd className="num text-2xl leading-none">{num(f.value)}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-12">
        <div className="contents lg:col-span-7 lg:flex lg:flex-col lg:gap-8">
          <DashboardSection title={t('dashboard.today')} href="/coach/schedule" linkLabel={t('dashboard.toSchedule')} className="order-1 lg:order-none">
            <CoachTodayAgenda locale={locale} />
          </DashboardSection>
          <DashboardSection title={t('dashboard.recent')} href="/coach/clients" linkLabel={t('dashboard.toClients')} className="order-5 lg:order-none">
            <RecentSetsFeed locale={locale} limit={6} />
          </DashboardSection>
        </div>
        <div className="contents lg:col-span-5 lg:flex lg:flex-col lg:gap-8">
          <DashboardSection title={t('dashboard.pending')} className="order-2 lg:order-none">
            <PendingRequests locale={locale} />
          </DashboardSection>
          <DashboardSection title={t('dashboard.week')} className="order-3 lg:order-none">
            <WeekOccupancy locale={locale} />
          </DashboardSection>
          <DashboardSection title={t('dashboard.idle', { days: IDLE_DAYS })} className="order-4 lg:order-none">
            <IdleClients locale={locale} days={IDLE_DAYS} />
          </DashboardSection>
        </div>
      </div>
    </div>
  );
}
