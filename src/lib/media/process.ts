/**
 * The one pipeline every stored demonstration goes through (coach upload and licensed-pack import).
 *
 *   bytes -> sniff the real format -> decode with sharp (pixel and frame limits) -> auto-orient ->
 *   fit inside 960 px -> animated WebP / WebP, with NO metadata -> plus a 192 px still thumbnail
 *
 * sharp drops EXIF (GPS, camera, orientation), XMP, IPTC, comments and the ICC profile unless
 * `withMetadata()` is asked for, and we never ask. A test builds a JPEG with GPS EXIF and asserts it
 * is gone from the output. The input is never written to disk: only the re-encoded result is.
 */
import sharp, { type Metadata } from 'sharp';
import {
  MAX_ANIMATION_FRAMES,
  MAX_DIMENSION,
  MAX_INPUT_PIXELS,
  THUMB_DIMENSION,
} from './constants';
import { sniffImage, type SniffedFormat } from './sniff';

export type MediaErrorCode =
  /** not a JPEG, PNG, WebP or GIF (by its bytes) */
  | 'type'
  /** looks like an image but cannot be decoded */
  | 'corrupt'
  /** more pixels than we are willing to decode */
  | 'tooLarge'
  /** an animation with too many frames */
  | 'tooManyFrames';

export class MediaError extends Error {
  constructor(readonly code: MediaErrorCode) {
    super(`media: ${code}`);
    this.name = 'MediaError';
  }
}

/** Largest total number of pixels (frames x width x height) of an animation we decode: about 190 MB of RGBA. */
const MAX_ANIMATION_PIXELS = 48_000_000;

export interface Probe {
  format: SniffedFormat;
  width: number;
  height: number;
  /** 1 for a still image */
  frames: number;
  animated: boolean;
}

/** Look at the bytes and the header only; throws MediaError for anything we will not decode. */
export async function probeImage(input: Uint8Array): Promise<Probe> {
  const format = sniffImage(input);
  if (!format) throw new MediaError('type');
  let meta: Metadata;
  try {
    // header only; the pixel limit is checked by hand below because an animation is judged by its total size
    meta = await sharp(input, { animated: true, limitInputPixels: false, failOn: 'error' }).metadata();
  } catch {
    throw new MediaError('corrupt');
  }
  const width = meta.width ?? 0;
  const frames = Math.max(1, meta.pages ?? 1);
  const height = meta.pageHeight ?? meta.height ?? 0;
  if (width < 1 || height < 1) throw new MediaError('corrupt');
  if (width * height > MAX_INPUT_PIXELS) throw new MediaError('tooLarge');
  if (frames > MAX_ANIMATION_FRAMES) throw new MediaError('tooManyFrames');
  if (frames > 1 && width * height * frames > MAX_ANIMATION_PIXELS) throw new MediaError('tooLarge');
  return { format, width, height, frames, animated: frames > 1 };
}

export interface ProcessedImage {
  /** animated WebP or WebP, <= 960 px, no metadata */
  main: Buffer;
  /** WebP still of the first frame, <= 192 px */
  thumb: Buffer;
  width: number;
  height: number;
  frames: number;
  animated: boolean;
}

/**
 * Re-encode one uploaded image. `animated` follows the file: a GIF or WebP with several frames stays
 * animated; everything else becomes one still frame.
 */
export async function processImage(input: Uint8Array): Promise<ProcessedImage> {
  const probe = await probeImage(input);
  try {
    const decoded = () =>
      sharp(input, {
        animated: probe.animated,
        limitInputPixels: Math.max(MAX_INPUT_PIXELS, probe.width * probe.height * probe.frames),
        failOn: 'error',
      })
        .rotate() // apply the EXIF orientation, then forget it
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true });

    const main = await decoded().webp({ quality: 82, effort: 4 }).toBuffer();
    const out = await sharp(main, { animated: probe.animated }).metadata();
    const thumb = await sharp(main, { animated: false })
      .resize({ width: THUMB_DIMENSION, height: THUMB_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 72, effort: 4 })
      .toBuffer();
    return {
      main,
      thumb,
      width: out.width ?? probe.width,
      height: out.pageHeight ?? out.height ?? probe.height,
      frames: probe.frames,
      animated: probe.animated,
    };
  } catch (e) {
    if (e instanceof MediaError) throw e;
    throw new MediaError('corrupt');
  }
}
