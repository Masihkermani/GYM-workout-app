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

// viewBox geometry (units; 100 units = a 450 mm bumper). The whole bar is drawn, shortened in the
// middle, and mirrored: the same plates sit on both sleeves, innermost = heaviest, as on a real bar.
const H = 112;
const MID = H / 2;
const PLATE_MAX_H = 100; // a 450 mm bumper
const PLATE_MAX_W = 28; // a 25 kg bumper (thickness is drawn a little fat so plates read as plates)
const SHAFT_HALF = 36; // visible shaft either side of the centre
const SHAFT_H = 6;
const SLEEVE_H = 11;
const FLANGE_W = 6; // the bar's fixed collar, plates stop against it
const FLANGE_H = 26;
const CLAMP_W = 9; // the lock collar that holds the plates on
const CLAMP_H = 30;
const SLEEVE_MIN = 62; // sleeve length (from the flange) when the bar is bare
const TIP = 12; // sleeve end beyond the lock collar
const PAD = 2;

export interface BarbellDiagramProps {
  weightKg: number;
  /** Bar weight; the coach setting `barKg` (default 20). */
  barKg?: number;
  /** Hide the heading line (the set logger already shows the weight). */
  compact?: boolean;
  className?: string;
}

/**
 * A barbell loaded for the entered weight: the same plates on both sleeves (greedy from
 * 25/20/15/10/5/2.5/1.25 kg), IWF colours, thickness and diameter in real proportion (450 mm bumpers,
 * smaller change plates), with the fixed collar, the lock collar and the sleeve visible. When the
 * weight cannot be made with those plates it says so and suggests the nearest loadable weights.
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
  // x measured outward from the centre of the bar, for the right-hand sleeve
  const flangeEnd = SHAFT_HALF + FLANGE_W;
  let x = flangeEnd;
  const drawn = plates.map((plate, i) => {
    const w = PLATE_THICKNESS[plate] * PLATE_MAX_W;
    const h = PLATE_HEIGHT[plate] * PLATE_MAX_H;
    const rect = { key: i, plate, x, y: MID - h / 2, w, h };
    x += w;
    return rect;
  });
  const clampX = x + 1;
  const sleeveEnd = Math.max(flangeEnd + SLEEVE_MIN, plates.length > 0 ? clampX + CLAMP_W + TIP : 0);
  const half = sleeveEnd + PAD;
  const width = half * 2;
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

  // One sleeve, drawn for the right-hand end around x = 0 at the bar's centre; the left-hand end is
  // the same group mirrored, so the two sides can never disagree.
  const sleeve = (
    <>
      {/* shaft, then the sleeve it carries the plates on */}
      <rect x={0} y={MID - SHAFT_H / 2} width={SHAFT_HALF + 1} height={SHAFT_H} className="fill-plate-steel stroke-ink" {...ink} />
      <rect
        x={flangeEnd}
        y={MID - SLEEVE_H / 2}
        width={sleeveEnd - flangeEnd}
        height={SLEEVE_H}
        rx={1}
        className="fill-plate-steel stroke-ink"
        {...ink}
      />
      {/* fixed collar (flange) */}
      <rect x={SHAFT_HALF} y={MID - FLANGE_H / 2} width={FLANGE_W} height={FLANGE_H} rx={1} className="fill-plate-black stroke-ink" {...ink} />
      {drawn.map((r) => (
        <rect
          key={r.key}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          rx={2}
          className={cn(FILL[PLATE_COLOR[r.plate]], 'stroke-ink')}
          {...ink}
        />
      ))}
      {/* lock collar holding the plates on */}
      {plates.length > 0 ? (
        <>
          <rect x={clampX} y={MID - CLAMP_H / 2} width={CLAMP_W} height={CLAMP_H} rx={1.5} className="fill-plate-black stroke-ink" {...ink} />
          <rect x={clampX + CLAMP_W / 2 - 1} y={MID - CLAMP_H / 2 - 4} width={2} height={5} className="fill-plate-steel stroke-ink" {...ink} />
        </>
      ) : null}
    </>
  );

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
        className="h-24 w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* the bar is the same left and right: draw one sleeve and its mirror around the centre */}
        <g transform={`translate(${half} 0)`}>{sleeve}</g>
        <g transform={`translate(${half} 0) scale(-1 1)`}>{sleeve}</g>
        {/* grip knurl at the centre */}
        <rect x={half - 22} y={MID - SHAFT_H / 2 - 1} width={44} height={SHAFT_H + 2} className="fill-plate-steel stroke-ink" {...ink} />
      </svg>

      {/* text alternative and legend */}
      {plates.length === 0 ? (
        <p className="text-center text-sm font-semibold text-ink">{t('barbell.bareBar')}</p>
      ) : (
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
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
