import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthCard } from '@/components/auth/AuthCard';
import { LoginForm } from '@/components/auth/LoginForm';
import { Link } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/auth';
import { homeFor, safeNextPath } from '@/lib/redirects';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
};

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('login.title') };
}

export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth');
  const { next } = await searchParams;
  const nextValue = Array.isArray(next) ? next[0] : next;

  // Already signed in: skip the form.
  const user = await getCurrentUser();
  if (user) redirect(nextValue ? safeNextPath(nextValue, locale, user.role) : homeFor(user.role, locale));

  return (
    <AuthCard
      title={t('login.title')}
      subtitle={t('login.subtitle')}
      footer={
        <>
          <span>{t('login.noAccount')}</span>
          <Link href="/register" className="inline-flex min-h-11 items-center font-bold text-ink underline underline-offset-4">
            {t('login.toRegister')}
          </Link>
        </>
      }
    >
      <LoginForm next={nextValue} />
    </AuthCard>
  );
}
