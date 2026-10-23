import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ProfileForm } from '@/components/coach/profile/ProfileForm';
import { LanguagePicker } from '@/components/coach/profile/LanguagePicker';
import { PasswordForm } from '@/components/coach/profile/PasswordForm';
import { ProfileSection } from '@/components/coach/profile/ProfileSection';
import { LogoutButton } from '@/components/shell/LogoutButton';
import { Avatar } from '@/components/ui/Avatar';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { getCoachSettings } from '@/lib/settings';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'coach' });
  return { title: t('profile.title'), robots: { index: false } };
}

export default async function MePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser(locale);

  const [t, settings, me] = await Promise.all([
    getTranslations('coach'),
    getCoachSettings(),
    prisma.user.findUnique({
      where: { id: session.id },
      select: { name: true, phone: true, goal: true, createdAt: true },
    }),
  ]);
  if (!me) return null; // the session row outlived the user; requireUser() redirects on the next request

  return (
    <div className="page-x flex max-w-2xl flex-col gap-6 py-6 md:py-10">
      <header className="flex items-center gap-4">
        <Avatar name={me.name} size="lg" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold font-expanded">{me.name}</h1>
          <p dir="auto" className="mt-0.5 text-sm text-ink-2">
            <span dir="ltr" className="inline-block">
              {formatPhone(me.phone, locale)}
            </span>
            {locale === 'fa' ? '\u060c ' : ' \u00b7 '}
            {t('profile.since', {
              date: formatDate(me.createdAt, locale, { timeZone: settings.timezone, style: 'medium' }),
            })}
          </p>
        </div>
      </header>

      <ProfileSection title={t('profile.about.title')}>
        <ProfileForm name={me.name} goal={me.goal ?? ''} />
      </ProfileSection>

      <ProfileSection title={t('profile.language.title')} description={t('profile.language.description')}>
        <LanguagePicker />
      </ProfileSection>

      <ProfileSection title={t('profile.theme.title')}>
        <ThemeToggle variant="segmented" />
      </ProfileSection>

      <ProfileSection title={t('profile.password.title')} description={t('profile.password.description')}>
        <PasswordForm />
      </ProfileSection>

      <div className="max-w-xs">
        <LogoutButton locale={locale} label={t('profile.logout')} />
      </div>
    </div>
  );
}
