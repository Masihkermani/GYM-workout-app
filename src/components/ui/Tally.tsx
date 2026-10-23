import { useLocale } from 'next-intl';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

export interface TallyProps {
  /** Number of strokes (completed sets). */
  count: number;
  /** Stroke height in px. */
  size?: number;
  /** Draw the newest stroke with stroke-dashoffset (220ms). Only the newest stroke animates. */
  animateNewest?: boolean;
  /** Accessible text, e.g. "3 sets done". Defaults to the number. */
  label?: string;
  className?: string;
}

const W = 8; // distance between strokes (viewBox units)
const H = 28;

/** Deterministic pseudo-random in [-1, 1] so strokes look hand-drawn but never jitter between renders. */
function jitter(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function stroke(index: number, inGroup: number): string {
  const j = (k: number) => jitter(index * 4 + k);
  if (inGroup === 4) {
    // the fifth stroke crosses the four, bottom-start to top-end
    const x1 = 1 + j(0) * 0.8;
    const y1 = 21 + j(1) * 1.2;
    const x2 = 4 + 4 * W + 1 + j(2) * 0.8;
    const y2 = 6 + j(3) * 1.2;
    return `M${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  const x = 4 + inGroup * W;
  const top = 3 + j(0) * 1.2;
  const bottom = H - 3 + j(1) * 1.2;
  return `M${(x + j(2) * 0.9).toFixed(2)} ${top.toFixed(2)} L${(x + j(3) * 0.9).toFixed(2)} ${bottom.toFixed(2)}`;
}

/**
 * Completed sets as tally strokes; every fifth stroke crosses the previous four. Pure SVG, so it
 * renders on the server and mirrors correctly in RTL (the groups follow the text direction).
 */
export function Tally({ count, size = 28, animateNewest = false, label, className }: TallyProps) {
  const locale = useLocale();
  const total = Math.max(0, Math.floor(count));
  const groups: number[] = [];
  for (let remaining = total; remaining > 0; remaining -= 5) groups.push(Math.min(5, remaining));

  return (
    <span
      role="img"
      aria-label={label ?? formatNumber(total, locale)}
      className={cn('inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-ink', className)}
    >
      {groups.map((n, g) => {
        const width = n === 5 ? 4 + 4 * W + 5 : 4 + n * W;
        return (
          <svg
            key={g}
            aria-hidden="true"
            viewBox={`0 0 ${width} ${H}`}
            width={(width / H) * size}
            height={size}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
          >
            {Array.from({ length: n }, (_, i) => {
              const index = g * 5 + i;
              const newest = animateNewest && index === total - 1;
              return (
                <path
                  key={index}
                  d={stroke(index, i)}
                  pathLength={1}
                  className={newest ? 'tally-new' : undefined}
                />
              );
            })}
          </svg>
        );
      })}
    </span>
  );
}
