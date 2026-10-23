import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Shell } from '@/components/shell/Shell';
import { requireUser } from '@/lib/auth';

export default async function ClientAreaLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Layouts are not re-rendered on client-side navigation, so every page ALSO calls requireUser().
  await requireUser(locale);
  return <Shell kind="client">{children}</Shell>;
}
