import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Shell } from '@/components/shell/Shell';
import { requireCoach } from '@/lib/auth';

export default async function CoachAreaLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Layouts are not re-rendered on client-side navigation, so every page ALSO calls requireCoach().
  await requireCoach(locale);
  return <Shell kind="coach">{children}</Shell>;
}
