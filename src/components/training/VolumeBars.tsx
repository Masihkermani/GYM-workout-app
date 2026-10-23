'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { formatDate, formatKg, formatNumber } from '@/lib/format';
import { linearScale, niceScale } from '@/lib/training/chart';
import type { WeeklyBucket } from '@/lib/training/weekly';
import { useElementWidth } from './use-width';

/**
 * Weekly volume as bars (one per calendar week, the locale's week: Saturday-first in Persian). Drawn
 * to scale from zero with labelled value ticks and a faint grid; time flows right to left in
 * Persian. The current week is solid ink, earlier weeks blue; a table gives the exact numbers.
 */
export function VolumeBars({ weeks, locale }: { weeks: WeeklyBucket[]; locale: string }) {
  const t = useTranslations('training');
  const { ref, width } = useElementWidth<HTMLDivElement>(640);
  const titleId = useId();
  const rtl = locale === 'fa';

  const height = width < 480 ? 210 : 250;
  const m = { top: 22, bottom: 34, start: 52, end: 12 };
  const innerW = Math.max(60, width - m.start - m.end);
  const innerH = height - m.top - m.bottom;
  const max = Math.max(...weeks.map((w) => w.volume), 0);
  const y = niceScale(0, max <= 0 ? 1000 : max, { target: 4, zeroBased: true });
  const sy = linearScale([y.min, y.max], [m.top + innerH, m.top]);

  const plotL = rtl ? m.end : m.start;
  const plotR = rtl ? width - m.start : width - m.end;
  const slot = innerW / weeks.length;
  const barW = Math.max(6, Math.min(34, slot * 0.62));
  const centerX = (i: number) => {
    const x = slot * (i + 0.5);
    return rtl ? m.end + innerW - x : m.start + x;
  };
  const labelEvery = Math.max(1, Math.ceil(72 / slot));
  const total = weeks.reduce((s, w) => s + w.volume, 0);
  const summary = t('progress.volumeAlt', {
    weeks: formatNumber(weeks.length, locale, { grouping: false }),
    total: formatKg(total, locale),
  });
  const compact = (v: number) => formatNumber(v, locale, { maxFractionDigits: 0 });

  return (
    <figure className="flex flex-col gap-3">
      <div ref={ref} className="w-full">
        <svg role="img" aria-labelledby={titleId} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-full">
          <title id={titleId}>{summary}</title>
          {y.ticks.map((v) => (
            <g key={v}>
              <line
                x1={plotL}
                x2={plotR}
                y1={sy(v)}
                y2={sy(v)}
                className={v === 0 ? 'stroke-ink-3' : 'stroke-rule'}
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
                {compact(v)}
              </text>
            </g>
          ))}

          {weeks.map((w, i) => {
            const x = centerX(i);
            const h = m.top + innerH - sy(w.volume);
            const current = i === weeks.length - 1;
            return (
              <g key={w.weekStartKey}>
                {w.volume > 0 ? (
                  <rect
                    x={x - barW / 2}
                    y={sy(w.volume)}
                    width={barW}
                    height={Math.max(2, h)}
                    className={current ? 'fill-ink' : 'fill-plate-blue'}
                  >
                    <title>{`${formatDate(w.weekStartKey, locale, { style: 'short', timeZone: 'UTC' })}: ${formatKg(w.volume, locale)}`}</title>
                  </rect>
                ) : (
                  <line x1={x - barW / 2} x2={x + barW / 2} y1={sy(0) - 1} y2={sy(0) - 1} className="stroke-ink-3" strokeWidth={2} />
                )}
                {i % labelEvery === (weeks.length - 1) % labelEvery ? (
                  <text x={x} y={m.top + innerH + 20} textAnchor="middle" className="num fill-ink-2" fontSize={12}>
                    {formatDate(`${w.weekStartKey}T12:00:00Z`, locale, { style: 'short', timeZone: 'UTC' })}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-2">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-2.5 bg-ink" />
          {t('progress.thisWeek')}
        </span>
        <span>{t('progress.volumeUnit')}</span>
      </figcaption>

      <details className="border-[1.5px] border-rule-strong bg-card">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">{t('progress.showTable')}</summary>
        <div className="overflow-x-auto px-4 pb-3">
          <table className="w-full text-start text-base">
            <caption className="sr-only">{summary}</caption>
            <thead>
              <tr className="border-b-[1.5px] border-rule-strong text-sm text-ink-2">
                <th scope="col" className="py-2 pe-3 text-start font-semibold">{t('progress.colWeek')}</th>
                <th scope="col" className="py-2 pe-3 text-start font-semibold">{t('progress.colSets')}</th>
                <th scope="col" className="py-2 text-start font-semibold">{t('progress.colVolume')}</th>
              </tr>
            </thead>
            <tbody>
              {[...weeks].reverse().map((w) => (
                <tr key={w.weekStartKey} className="border-b border-rule last:border-b-0">
                  <td className="num py-2 pe-3">{formatDate(`${w.weekStartKey}T12:00:00Z`, locale, { style: 'medium', timeZone: 'UTC' })}</td>
                  <td className="num py-2 pe-3">{formatNumber(w.sets, locale, { grouping: false })}</td>
                  <td className="num py-2">{formatKg(w.volume, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
