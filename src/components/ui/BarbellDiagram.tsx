import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { formatKg, formatNumber } from '@/lib/format';
import {
  computePlates,
  groupPlates,
  PLATE_COLOR,
  PLATE_HEIGHT,
  PLATE_THICKNESS,
  type PlateColor,
} from '@/lib/plates';

const FILL: Record<PlateColor, string> = {
  red: 'fill-plate-red',
  blue: 'fill-plate-blue',
  yellow: 'fill-plate-yellow',
  green: 'fill-plate-green',
  white: 'fill-plate-white',
  black: 'fill-plate-black',
  steel: 'fill-plate-steel',
};

const SWATCH: Record<PlateColor, string> = {
  red: 'bg-plate-red',
  blue: 'bg-plate-blue',
  yellow: 'bg-plate-yellow',
  green: 'bg-plate-green',
  white: 'bg-plate-white',
  black: 'bg-plate-black',
  steel: 'bg-plate-steel',
};

// viewBox geometry (units). The bar is drawn horizontally with the collar at COLLAR_X and plates
// stacking outward from it, so a 25 kg plate is the tallest thing on screen.
const H = 120;
const MID = H / 2;
const PLATE_MAX_H = 112;
const PLATE_MAX_W = 15;
const GAP = 1.5;
const COLLAR_X = 200;
const COLLAR_W = 8;
const MIN_WIDTH = 330;
const TIP = 24; // sleeve end beyond the last plate

export interface BarbellDiagramProps {
  weightKg: number;
  /** Bar weight; the coach setting `barKg` (default 20). */
  barKg?: number;
  /** Hide the heading line (the set logger already shows the weight). */
  compact?: boolean;
  className?: string;
}

/**
 * One loaded end of a barbell: plates per side for the entered weight, greedy from
 * 25/20/15/10/5/2.5/1.25 kg in IWF colours at proportional sizes. When the weight cannot be made
 * with those plates it says so and suggests the nearest loadable weights.
 */
export function BarbellDiagram({ weightKg, barKg = 20, compact = false, className }: BarbellDiagramProps) {
  const t = useTranslations('common');
  const locale = useLocale();
  const load = computePlates(weightKg, barKg);
  const kg = (n: number) => formatKg(n, locale);

  if (!load.ok) {
    const message =
      load.reason === 'below-bar'
        ? t('barbell.belowBar', { kg: kg(Math.max(0, Number.isFinite(weightKg) ? weightKg : 0)), bar: kg(barKg) })
        : t('barbell.cantLoad', { kg: kg(weightKg) });
    const nearest =
      load.nearestBelowKg != null && load.nearestAboveKg != null && load.nearestBelowKg >= barKg
        ? t('barbell.nearest', { below: kg(load.nearestBelowKg), above: kg(load.nearestAboveKg) })
        : load.nearestAboveKg != null
          ? t('barbell.nearestOnly', { value: kg(load.nearestAboveKg) })
          : null;
    return (
      <div
        role="status"
        className={cn('border-[1.5px] border-dashed border-danger px-4 py-3 text-sm text-ink', className)}
      >
        <p className="font-semibold text-danger">{message}</p>
        {nearest ? <p className="mt-0.5 text-ink-2">{nearest}</p> : null}
      </div>
    );
  }

  const plates = load.perSide;
  let x = COLLAR_X + COLLAR_W + 3;
  const drawn = plates.map((plate, i) => {
    const w = PLATE_THICKNESS[plate] * PLATE_MAX_W;
    const h = PLATE_HEIGHT[plate] * PLATE_MAX_H;
    const rect = { key: i, plate, x, y: MID - h / 2, w, h };
    x += w + GAP;
    return rect;
  });
  const width = Math.max(MIN_WIDTH, x + TIP);
  const groups = groupPlates(plates);
  const list = groups
    .map((g) =>
      g.count > 1
        ? `${formatNumber(g.plate, locale)} × ${formatNumber(g.count, locale, { grouping: false })}`
        : formatNumber(g.plate, locale),
    )
    .join(' + ');
  const alt = plates.length === 0 ? t('barbell.bareBar') : t('barbell.alt', { plates: list });

  const ink = { strokeWidth: 1, vectorEffect: 'non-scaling-stroke' } as const;

  return (
    <figure className={cn('flex flex-col gap-2', className)}>
      {!compact ? (
        <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
          <span className="label-caps text-ink-2">{t('barbell.title')}</span>
          <span className="text-ink-2">{t('barbell.bar', { kg: kg(barKg) })}</span>
        </figcaption>
      ) : null}

      <svg
        role="img"
        aria-label={alt}
        viewBox={`0 0 ${width} ${H}`}
        className="h-24 w-full max-w-sm self-start"
        preserveAspectRatio="xMinYMid meet"
      >
        {/* bar shaft, running out past the last plate */}
        <rect x={0} y={MID - 3.5} width={width} height={7} rx={1} className="fill-plate-steel stroke-ink" {...ink} />
        {/* knurled grip hint */}
        <rect x={40} y={MID - 4.5} width={90} height={9} className="fill-plate-steel stroke-ink" {...ink} />
        {/* inner collar */}
        <rect x={COLLAR_X} y={MID - 13} width={COLLAR_W} height={26} rx={1} className="fill-plate-black stroke-ink" {...ink} />
        {drawn.map((r) => (
          <rect
            key={r.key}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            rx={1.5}
            className={cn(FILL[PLATE_COLOR[r.plate]], 'stroke-ink')}
            {...ink}
          />
        ))}
        {/* spring clip on the sleeve end */}
        <rect x={x + 3} y={MID - 9} width={6} height={18} rx={1} className="fill-plate-black stroke-ink" {...ink} />
      </svg>

      {/* text alternative and legend */}
      {plates.length === 0 ? (
        <p className="text-sm font-semibold text-ink">{t('barbell.bareBar')}</p>
      ) : (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {groups.map((g) => (
            <li key={g.plate} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cn('size-3 rounded-full border border-ink', SWATCH[PLATE_COLOR[g.plate]])} />
              <span className="num text-base text-ink">{formatNumber(g.plate, locale)}</span>
              {g.count > 1 ? (
                <span className="num text-base text-ink-2">× {formatNumber(g.count, locale, { grouping: false })}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
