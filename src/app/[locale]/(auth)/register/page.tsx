import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthCard } from '@/components/auth/AuthCard';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { Flash } from '@/components/ui/Flash';
import { Link } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/auth';
import { homeFor } from '@/lib/redirects';
import { coachDisplayName, getCoachSettings } from '@/lib/settings';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('register.title') };
}

export default async function RegisterPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth');

  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role, locale));

  const settings = await getCoachSettings();

  return (
    <AuthCard
      title={settings.allowSignup ? t('register.title') : t('register.closedTitle')}
      subtitle={settings.allowSignup ? t('register.subtitle') : undefined}
      footer={
        <>
          <span>{t('register.haveAccount')}</span>
          <Link href="/login" className="inline-flex min-h-11 items-center font-bold text-ink underline underline-offset-4">
            {t('register.toLogin')}
          </Link>
        </>
      }
    >
      {settings.allowSignup ? (
        <RegisterForm />
      ) : (
        <Flash tone="info">{t('register.closedBody', { coach: coachDisplayName(settings, locale) })}</Flash>
      )}
    </AuthCard>
  );
}
