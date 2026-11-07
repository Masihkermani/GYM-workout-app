/** Serializable demonstration shapes shared by server components, actions and client components. */
import type { Prisma } from '@prisma/client';
import { frameSrc, thumbSrc } from './key';

export type MediaKindName = 'FRAMES' | 'GIF' | 'IMAGE';
export type MediaSourceName = 'BUNDLED_OPEN' | 'COACH' | 'LICENSED';

/** Who made a picture and under what terms: shown next to every picture that is not the coach's own. */
export interface MediaCredit {
  source: 'BUNDLED_OPEN' | 'LICENSED';
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  sourceUrl: string | null;
  modified: boolean;
}

export interface MediaDTO {
  id: string;
  kind: MediaKindName;
  /** Ready-to-use URLs, in play order. */
  frames: string[];
  /** The small still of the first frame. */
  thumb: string;
  /** Line art on a transparent background: draw it with a CSS mask in the ink colour instead of as a picture. */
  recolorable: boolean;
  source: MediaSourceName;
  credit: MediaCredit | null;
}

/** What a list row needs: one small picture, and whether it has to be credited. */
export interface ExerciseThumbDTO {
  src: string;
  recolorable: boolean;
  credit: 'open' | 'licensed' | null;
}

/** Everything the "how to" sheet shows for one exercise. */
export interface ExerciseInfoDTO {
  id: string;
  nameEn: string;
  nameFa: string | null;
  bodyPart: string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  stepsEn: string[];
  stepsFa: string[];
  media: MediaDTO[];
}

/** The ExerciseMedia columns the mappers need. */
export interface MediaRow {
  id: string;
  kind: MediaKindName;
  frames: string[];
  source: MediaSourceName;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  sourceUrl: string | null;
  modified: boolean;
  recolorable: boolean;
}

export function toMediaDTO(row: MediaRow): MediaDTO {
  return {
    id: row.id,
    kind: row.kind,
    frames: row.frames.map(frameSrc),
    thumb: row.frames[0] ? thumbSrc(row.frames[0]) : '',
    recolorable: row.recolorable,
    source: row.source,
    credit:
      row.source === 'COACH'
        ? null
        : {
            source: row.source,
            author: row.author,
            license: row.license,
            licenseUrl: row.licenseUrl,
            sourceUrl: row.sourceUrl,
            modified: row.modified,
          },
  };
}

/** The columns a list needs to build a thumbnail (the first media row by `order`). */
export type ThumbRow = Pick<MediaRow, 'frames' | 'recolorable' | 'source'>;

export function toThumbDTO(row: ThumbRow | undefined | null): ExerciseThumbDTO | null {
  if (!row || !row.frames[0]) return null;
  return {
    src: thumbSrc(row.frames[0]),
    recolorable: row.recolorable,
    credit: row.source === 'BUNDLED_OPEN' ? 'open' : row.source === 'LICENSED' ? 'licensed' : null,
  };
}

/** Prisma `select` fragment for the primary demonstration of an exercise. */
export const THUMB_MEDIA_SELECT = {
  orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  take: 1,
  select: { frames: true, recolorable: true, source: true },
} satisfies Prisma.Exercise$mediaArgs;
