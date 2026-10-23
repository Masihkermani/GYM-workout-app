import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, type LucideProps } from 'lucide-react';
import { cn } from '@/lib/cn';

const ICONS = {
  /** Points in the reading direction (right in LTR, left in RTL): "next", "go to". */
  'chevron-forward': ChevronRight,
  /** Points against the reading direction: "previous", "back". */
  'chevron-back': ChevronLeft,
  'arrow-forward': ArrowRight,
  'arrow-back': ArrowLeft,
} as const;

export type DirIconName = keyof typeof ICONS;

export interface DirIconProps extends Omit<LucideProps, 'ref'> {
  name: DirIconName;
}

/**
 * Directional icon that flips in RTL (chevrons, arrows, "back"). Non-directional icons (plus, check,
 * clock) must NOT use this. Decorative by default; give the surrounding control an accessible name.
 */
export function DirIcon({ name, className, ...props }: DirIconProps) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" className={cn('rtl:-scale-x-100', className)} {...props} />;
}
