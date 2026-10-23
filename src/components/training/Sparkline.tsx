import { linearScale } from '@/lib/training/chart';

/** A tiny trend line (coach panel). Decorative: the numbers beside it carry the meaning. Mirrors in RTL. */
export function Sparkline({ values, rtl, width = 96, height = 28 }: { values: number[]; rtl: boolean; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const pad = 3;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const sx = linearScale([0, values.length - 1], rtl ? [width - pad, pad] : [pad, width - pad]);
  const sy = linearScale([lo === hi ? lo - 1 : lo, lo === hi ? hi + 1 : hi], [height - pad, pad]);
  const pts = values.map((v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`);
  const lastX = sx(values.length - 1);
  const lastY = sy(values[values.length - 1]);
  return (
    <svg aria-hidden="true" width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      <polyline points={pts.join(' ')} fill="none" className="stroke-ink-2" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={3} className="fill-ink" />
    </svg>
  );
}
