import type { ReactNode } from 'react';
import {
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Dumbbell,
  LayoutDashboard,
  Settings,
  TrendingUp,
  UserRound,
  Users,
} from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Avatar } from '@/components/ui/Avatar';
import { LocaleSwitch } from '@/components/ui/LocaleSwitch';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Link } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/auth';
import { coachDisplayName, getCoachSettings } from '@/lib/settings';
import { LogoutButton } from './LogoutButton';
import { MobileMenu } from './MobileMenu';
import { NavLink, type NavLinkProps } from './NavLink';

type Item = Omit<NavLinkProps, 'variant'>;

const ICON = 'size-5 shrink-0';

/**
 * The signed-in frame. `client`: start-side rail on desktop, five-tab bar at the bottom on mobile.
 * `coach`: start-side rail on desktop, a top bar with a menu sheet on mobile.
 * The caller (the segment layout) has already run requireUser / requireCoach.
 */
export async function Shell({ kind, children }: { kind: 'client' | 'coach'; children: ReactNode }) {
  const [t, locale, user, settings] = await Promise.all([
    getTranslations('common'),
    getLocale(),
    getCurrentUser(),
    getCoachSettings(),
  ]);

  const items: Item[] =
    kind === 'client'
      ? [
          { href: '/app', exact: true, icon: <ClipboardList className={ICON} aria-hidden="true" />, label: t('nav.client.today') },
          { href: '/app/book', match: ['/app/bookings'], icon: <CalendarDays className={ICON} aria-hidden="true" />, label: t('nav.client.book') },
          { href: '/app/program', match: ['/app/workout'], icon: <Dumbbell className={ICON} aria-hidden="true" />, label: t('nav.client.program') },
          { href: '/app/progress', match: ['/app/history'], icon: <TrendingUp className={ICON} aria-hidden="true" />, label: t('nav.client.progress') },
          { href: '/app/me', icon: <UserRound className={ICON} aria-hidden="true" />, label: t('nav.client.me') },
        ]
      : [
          { href: '/coach', exact: true, icon: <LayoutDashboard className={ICON} aria-hidden="true" />, label: t('nav.coach.dashboard') },
          { href: '/coach/schedule', icon: <CalendarRange className={ICON} aria-hidden="true" />, label: t('nav.coach.schedule') },
          { href: '/coach/clients', icon: <Users className={ICON} aria-hidden="true" />, label: t('nav.coach.clients') },
          { href: '/coach/exercises', icon: <Dumbbell className={ICON} aria-hidden="true" />, label: t('nav.coach.exercises') },
          { href: '/coach/settings', icon: <Settings className={ICON} aria-hidden="true" />, label: t('nav.coach.settings') },
        ];

  const home = kind === 'client' ? '/app' : '/coach';
  const coachName = coachDisplayName(settings, locale);

  const railNav = (
    <nav aria-label={t('nav.main')}>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.href}>
            <NavLink {...item} variant="rail" />
          </li>
        ))}
      </ul>
    </nav>
  );

  const account = (
    <div className="flex flex-col gap-2">
      {user ? (
        <div className="flex items-center gap-2 px-2">
          <Avatar name={user.name} size="sm" />
          <span className="min-w-0 truncate text-sm font-semibold" title={t('nav.signedInAs', { name: user.name })}>
            {user.name}
          </span>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-1">
        <LocaleSwitch variant="rail" />
        <ThemeToggle />
      </div>
      <LogoutButton locale={locale} label={t('nav.logout')} />
    </div>
  );

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[70] focus:bg-ink focus:px-4 focus:py-3 focus:text-paper"
      >
        {t('nav.skip')}
      </a>

      {/* desktop rail, at the inline-start edge (right in RTL) */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-60 flex-col border-e-[1.5px] border-rule-strong bg-card md:flex">
        <div className="px-5 pb-4 pt-6">
          <Link href={home} className="block text-2xl font-extrabold font-expanded text-ink">
            {t('brand.name')}
          </Link>
          <p className="mt-1 truncate text-sm text-ink-2">{coachName}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">{railNav}</div>
        <div className="border-t border-rule p-3">{account}</div>
      </aside>

      {/* coach, mobile: top bar + menu sheet */}
      {kind === 'coach' ? (
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-rule bg-paper px-4 md:hidden">
          <Link href={home} className="text-xl font-extrabold font-expanded text-ink">
            {t('brand.name')}
          </Link>
          <MobileMenu title={t('nav.menu')}>
            <div className="flex flex-col gap-6">
              {railNav}
              <div className="border-t border-rule pt-4">{account}</div>
            </div>
          </MobileMenu>
        </header>
      ) : null}

      <main
        id="main"
        tabIndex={-1}
        className={`min-w-0 focus:outline-none md:ps-60 md:pb-12 ${kind === 'client' ? 'pb-[calc(4.5rem+env(safe-area-inset-bottom))]' : 'pb-12'}`}
      >
        {children}
      </main>

      {/* client, mobile: bottom tab bar (five tabs max) */}
      {kind === 'client' ? (
        <nav
          data-tabbar
          aria-label={t('nav.main')}
          className="fixed inset-x-0 bottom-0 z-40 border-t-[1.5px] border-rule-strong bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <ul className="grid grid-cols-5">
            {items.map((item) => (
              <li key={item.href}>
                <NavLink {...item} variant="tab" />
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
