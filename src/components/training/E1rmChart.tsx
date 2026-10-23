'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { formatDate, formatKg, formatNumber } from '@/lib/format';
import { linearScale, niceScale, timeTicks } from '@/lib/training/chart';
import { round1 } from '@/lib/training/e1rm';
import { useElementWidth } from './use-width';

export interface E1rmChartPoint {
  /** ISO instant of the workout. */
  date: string;
  e1rm: number;
  reps: number;
  weightKg: number;
  /** A record when it was lifted. */
  pr: boolean;
}

/**
 * Estimated-1RM line over time, drawn to scale in plain SVG: the x axis is real time (labelled with
 * calendar ticks), the y axis starts at a round value with a faint grid, the last point is
 * emphasised and carries its value. In Persian the whole chart mirrors, so time flows right to
 * left and the value axis sits at the inline-start (right) edge. Colours are tokens, so it reads in
 * both themes. A data table is always available as the accessible fallback.
 */
export function E1rmChart({
  points,
  locale,
  timeZone,
  exerciseLabel,
}: {
  points: E1rmChartPoint[];
  locale: string;
  timeZone: string;
  exerciseLabel: string;
}) {
  const t = useTranslations('training');
  const { ref, width } = useElementWidth<HTMLDivElement>(640);
  const titleId = useId();
  const rtl = locale === 'fa';

  const height = width < 480 ? 230 : 280;
  const m = { top: 28, bottom: 34, start: 46, end: 16 };
  const innerW = Math.max(60, width - m.start - m.end);
  const innerH = height - m.top - m.bottom;

  const values = points.map((p) => p.e1rm);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const y = niceScale(lo, hi, { target: 4 });
  const sy = linearScale([y.min, y.max], [m.top + innerH, m.top]);

  const times = points.map((p) => Date.parse(p.date));
  let t0 = Math.min(...times);
  let t1 = Math.max(...times);
  if (t1 - t0 < 3 * 86400_000) {
    // a single workout (or a very short span): give the axis room instead of pinning the point to an edge
    const mid = (t0 + t1) / 2;
    t0 = mid - 3.5 * 86400_000;
    t1 = mid + 3.5 * 86400_000;
  }
  // x in LTR terms (0 = oldest), then mirrored for RTL
  const toX = (ms: number) => {
    const x = linearScale([t0, t1], [0, innerW])(ms);
    return rtl ? m.end + innerW - x : m.start + x;
  };
  // plot area edges: the value axis sits at the inline-start edge (right in Persian)
  const plotL = rtl ? m.end : m.start;
  const plotR = rtl ? width - m.start : width - m.end;
  const ticks = timeTicks(t0, t1, { locale, timeZone, maxTicks: Math.max(2, Math.floor(innerW / 90)) });

  const coords = points.map((p) => ({ ...p, x: toX(Date.parse(p.date)), yPos: sy(p.e1rm) }));
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.yPos.toFixed(1)}`).join(' ');
  const end = coords[coords.length - 1];

  const first = points[0];
  const last = points[points.length - 1];
  const summary = t('progress.chartAlt', {
    exercise: exerciseLabel,
    count: points.length,
    n: formatNumber(points.length, locale, { grouping: false }),
    from: formatKg(round1(first.e1rm), locale),
    to: formatKg(round1(last.e1rm), locale),
    start: formatDate(first.date, locale, { style: 'medium', timeZone }),
    end: formatDate(last.date, locale, { style: 'medium', timeZone }),
  });

  // keep the end label inside the plot
  // (number labels are drawn direction:ltr so text-anchor means left / right on screen in both languages)
  const labelAnchor: 'start' | 'middle' | 'end' =
    coords.length < 2 ? 'middle' : rtl ? 'start' : 'end'; // the newest point sits at the outer edge; the label extends inward
  const labelX = labelAnchor === 'end' ? end.x + 10 : labelAnchor === 'start' ? end.x - 10 : end.x;

  return (
    <figure className="flex flex-col gap-3">
      <div ref={ref} className="w-full">
        <svg role="img" aria-labelledby={titleId} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-full">
          <title id={titleId}>{summary}</title>

          {/* grid + value axis */}
          {y.ticks.map((v) => (
            <g key={v}>
              <line
                x1={plotL}
                x2={plotR}
                y1={sy(v)}
                y2={sy(v)}
                className={v === y.min ? 'stroke-ink-3' : 'stroke-rule'}
                strokeWidth={1}
              />
              <text
                x={rtl ? plotR + 8 : plotL - 8}
                y={sy(v)}
                dy="0.35em"
                textAnchor={rtl ? 'start' : 'end'}
                className="num fill-ink-2"
                fontSize={12}
                style={{ direction: 'ltr' }}
              >
                {formatNumber(v, locale, { maxFractionDigits: 1 })}
              </text>
            </g>
          ))}

          {/* time axis */}
          {ticks.map((tk) => {
            const x = toX(tk.ms);
            if (x < plotL - 2 || x > plotR + 2) return null;
            return (
              <g key={tk.key}>
                <line x1={x} x2={x} y1={m.top + innerH} y2={m.top + innerH + 5} className="stroke-ink-3" strokeWidth={1} />
                <text x={x} y={m.top + innerH + 20} textAnchor="middle" className="num fill-ink-2" fontSize={12}>
                  {formatDate(tk.ms, locale, { style: 'short', timeZone })}
                </text>
              </g>
            );
          })}

          {/* the line */}
          {coords.length > 1 ? (
            <path d={path} fill="none" className="stroke-ink" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ) : null}

          {/* points: records are diamonds, the rest dots; the last point is emphasised */}
          {coords.slice(0, -1).map((c) =>
            c.pr ? (
              <rect
                key={c.date}
                x={c.x - 4.5}
                y={c.yPos - 4.5}
                width={9}
                height={9}
                transform={`rotate(45 ${c.x} ${c.yPos})`}
                className="fill-ink stroke-card"
                strokeWidth={1.5}
              >
                <title>{`${formatDate(c.date, locale, { style: 'medium', timeZone })}: ${formatKg(round1(c.e1rm), locale)} (${t('progress.record')})`}</title>
              </rect>
            ) : (
              <circle key={c.date} cx={c.x} cy={c.yPos} r={3.5} className="fill-card stroke-ink" strokeWidth={1.5}>
                <title>{`${formatDate(c.date, locale, { style: 'medium', timeZone })}: ${formatKg(round1(c.e1rm), locale)}`}</title>
              </circle>
            ),
          )}
          <circle cx={end.x} cy={end.yPos} r={9} className="fill-none stroke-ink" strokeWidth={1} opacity={0.35} />
          <circle cx={end.x} cy={end.yPos} r={5.5} className="fill-ink stroke-card" strokeWidth={2}>
            <title>{`${formatDate(end.date, locale, { style: 'medium', timeZone })}: ${formatKg(round1(end.e1rm), locale)}`}</title>
          </circle>
          <text
            x={labelX}
            y={end.yPos - 16}
            textAnchor={labelAnchor}
            className="num fill-ink"
            fontSize={15}
            fontWeight={800}
            paintOrder="stroke"
            strokeWidth={4}
            style={{ stroke: 'var(--card)', direction: 'ltr' }}
          >
            {formatNumber(round1(end.e1rm), locale, { maxFractionDigits: 1 })}
          </text>
        </svg>
      </div>

      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-2">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-2.5 rotate-45 bg-ink" />
          {t('progress.legendRecord')}
        </span>
        <span>{t('progress.axisUnit')}</span>
      </figcaption>

      <details className="border-[1.5px] border-rule-strong bg-card">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">{t('progress.showTable')}</summary>
        <div className="overflow-x-auto px-4 pb-3">
          <table className="w-full text-start text-base">
            <caption className="sr-only">{summary}</caption>
            <thead>
              <tr className="border-b-[1.5px] border-rule-strong text-sm text-ink-2">
                <th scope="col" className="py-2 pe-3 text-start font-semibold">{t('progress.colDate')}</th>
                <th scope="col" className="py-2 pe-3 text-start font-semibold">{t('progress.colBest')}</th>
                <th scope="col" className="py-2 text-start font-semibold">{t('progress.colE1rm')}</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.date} className="border-b border-rule last:border-b-0">
                  <td className="num py-2 pe-3">{formatDate(p.date, locale, { style: 'medium', timeZone })}</td>
                  <td className="num py-2 pe-3">
                    {formatNumber(p.reps, locale, { grouping: false })} × {formatKg(p.weightKg, locale)}
                  </td>
                  <td className="num py-2">
                    {formatKg(round1(p.e1rm), locale)}
                    {p.pr ? <span className="ms-2 text-sm text-ink-2">{t('progress.record')}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
