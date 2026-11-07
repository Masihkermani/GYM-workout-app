'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { ExerciseThumbDTO, MediaCredit as Credit } from '@/lib/media/dto';

const httpsOnly = (url: string | null | undefined) => (url && /^https:\/\//i.test(url) ? url : null);

const LINK = 'underline underline-offset-2 hover:text-ink';
const CC_BY_SA = { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' } as const;
const EVERKINETIC_URL = 'https://github.com/everkinetic/data';

function ext(url: string | null, chunks: ReactNode, dir?: 'ltr') {
  const inner = dir ? <bdi dir={dir}>{chunks}</bdi> : <bdi>{chunks}</bdi>;
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer license" className={LINK}>
      {inner}
    </a>
  ) : (
    inner
  );
}

/** "Greg Priday (Everkinetic)" -> "Everkinetic" (its Persian spelling when we know it). */
function sourceName(author: string | null, everkinetic: string): string {
  const a = author ?? '';
  if (/everkinetic/i.test(a)) return everkinetic;
  const inBrackets = /\(([^)]+)\)\s*$/.exec(a);
  return inBrackets ? inBrackets[1] : a;
}

/**
 * "Illustration: Everkinetic (CC BY-SA 4.0), modified": the name links to the source, the licence name to
 * the licence. Shown with every bundled or licensed picture (the coach's own uploads carry no credit).
 */
export function MediaCreditLine({ credit, className }: { credit: Credit; className?: string }) {
  const t = useTranslations('training');
  const cls = className ?? 'text-xs text-ink-3';

  if (credit.source === 'LICENSED') {
    return (
      <p className={cls} data-testid="media-credit">
        {t.rich('demo.credit.licensed', {
          author: credit.author ?? '',
          license: credit.license ?? '',
          b: (chunks) => <bdi>{chunks}</bdi>,
        })}
      </p>
    );
  }

  return (
    <p className={cls} data-testid="media-credit">
      {t.rich(credit.modified ? 'demo.credit.openModified' : 'demo.credit.open', {
        source: sourceName(credit.author, t('demo.credit.everkinetic')),
        license: credit.license ?? '',
        src: (chunks) => ext(httpsOnly(credit.sourceUrl), chunks),
        lic: (chunks) => ext(httpsOnly(credit.licenseUrl), chunks, 'ltr'),
      })}
    </p>
  );
}

/**
 * One line under a list that shows thumbnails: the credit for the bundled drawings, rendered only when at
 * least one thumbnail above is such a drawing. (The sheet that opens from a row carries the full credit.)
 */
export function ThumbCreditNote({
  thumbs,
  className,
}: {
  thumbs: readonly (ExerciseThumbDTO | null | undefined)[];
  className?: string;
}) {
  const t = useTranslations('training');
  if (!thumbs.some((x) => x?.credit === 'open')) return null;
  return (
    <p className={className ?? 'text-xs text-ink-3'} data-testid="thumb-credit">
      {t.rich('demo.credit.listNote', {
        source: t('demo.credit.everkinetic'),
        license: CC_BY_SA.name,
        src: (chunks) => ext(EVERKINETIC_URL, chunks),
        lic: (chunks) => ext(CC_BY_SA.url, chunks, 'ltr'),
      })}
    </p>
  );
}
