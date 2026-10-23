'use client';

import type { ReactNode } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/cn';

export interface NavLinkProps {
  href: string;
  /** Extra path prefixes that also mark this item active (e.g. /app/workout under Program). */
  match?: string[];
  /** Active only on the exact path (for index routes such as /app and /coach). */
  exact?: boolean;
  icon: ReactNode;
  label: string;
  variant: 'rail' | 'tab';
}

const STYLES = {
  rail:
    'flex min-h-11 items-center gap-3 border-s-[3px] border-transparent px-3 text-base font-semibold text-ink-2 tx ' +
    'hover:bg-paper-2 hover:text-ink aria-[current=page]:border-ink aria-[current=page]:bg-paper-2 aria-[current=page]:text-ink',
  tab:
    'flex min-h-14 flex-col items-center justify-center gap-0.5 border-t-[3px] border-transparent px-1 text-xs font-semibold text-ink-2 tx ' +
    'hover:text-ink aria-[current=page]:border-ink aria-[current=page]:text-ink',
} as const;

function isActive(pathname: string, href: string, match: string[], exact?: boolean): boolean {
  if (exact) return pathname === href;
  return [href, ...match].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Navigation link with aria-current="page" on the active route. The icon is passed as an element. */
export function NavLink({ href, match = [], exact, icon, label, variant }: NavLinkProps) {
  const pathname = usePathname();
  const active = isActive(pathname, href, match, exact);
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={cn(STYLES[variant])}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}
