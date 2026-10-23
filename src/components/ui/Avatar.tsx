import { cn } from '@/lib/cn';

const SIZE = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
} as const;

// Plate-colour fills; text colours come from the matching on-* tokens.
const TONES = [
  'bg-plate-red text-on-red',
  'bg-plate-blue text-on-blue',
  'bg-plate-green text-on-green',
  'bg-plate-yellow text-on-yellow',
] as const;

const ZWNJ = '‌';

function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

/**
 * Initials for a display name. First letter of the first and last word; works for Persian
 * («علی‌رضا نوری» -> «ع‌ن») and Latin. Persian letters are separated by a ZWNJ so they do not join.
 */
export function getInitials(name: string): string {
  const words = name.trim().split(/[\s‌]+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = graphemes(words[0])[0] ?? '';
  const last = words.length > 1 ? (graphemes(words[words.length - 1])[0] ?? '') : '';
  const joined = /[؀-ۿ]/.test(first) ? `${first}${last ? ZWNJ + last : ''}` : `${first}${last}`.toUpperCase();
  return joined;
}

function toneFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return TONES[h % TONES.length];
}

export interface AvatarProps {
  name: string;
  size?: keyof typeof SIZE;
  className?: string;
}

/** Initials in a plate-coloured circle. The name is the accessible label; the glyphs are decorative. */
export function Avatar({ name, size = 'md', className }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold',
        SIZE[size],
        toneFor(name),
        className,
      )}
    >
      <span aria-hidden="true" dir="auto">
        {getInitials(name)}
      </span>
    </span>
  );
}
