import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/vazirmatn/wght.css';
import '../globals.css';
import { ToastProvider } from '@/components/ui/Toast';
import { dirOf, routing } from '@/i18n/routing';
import { THEME_COOKIE } from '@/lib/constants';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'common' });
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
    title: { default: t('meta.title'), template: t('meta.titleTemplate') },
    description: t('meta.description'),
    applicationName: t('brand.name'),
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  // `theme` cookie = explicit choice; no cookie = follow prefers-color-scheme (CSS handles it).
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  const dataTheme = theme === 'light' || theme === 'dark' ? theme : undefined;

  return (
    <html lang={locale} dir={dirOf(locale)} data-theme={dataTheme}>
      <body>
        <NextIntlClientProvider>
          <ToastProvider>{children}</ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
