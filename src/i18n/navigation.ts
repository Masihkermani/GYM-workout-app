import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/** Locale-aware Link / redirect / usePathname / useRouter. Pathnames are NOT prefixed with the locale. */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
