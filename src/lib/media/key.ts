/**
 * Storage keys of processed demonstrations. A key is a flat file name: 32 lower-case hex characters
 * (128 random bits) and `.webp`, with an optional `.t` before the extension for the list thumbnail.
 * Nothing else is ever written to or read from MEDIA_DIR, so validating a key against this one pattern
 * is the whole path-traversal defence of the /media route. No Node imports: used by the client too.
 */
import { MEDIA_URL_PREFIX } from './constants';

const MAIN_KEY = /^[a-f0-9]{32}\.webp$/;
const THUMB_KEY = /^[a-f0-9]{32}\.t\.webp$/;

export const isMainKey = (key: string): boolean => MAIN_KEY.test(key);
export const isThumbKey = (key: string): boolean => THUMB_KEY.test(key);
export const isValidMediaKey = (key: unknown): key is string =>
  typeof key === 'string' && (MAIN_KEY.test(key) || THUMB_KEY.test(key));

/** The key of a main file's thumbnail. */
export const thumbKeyOf = (key: string): string => key.replace(/\.webp$/, '.t.webp');

/**
 * The route segments (`/media/<a>/<b>`) as one key, or null. Anything but exactly one valid segment is
 * refused, which also rejects `..`, encoded separators, empty segments and sub-directories.
 */
export function keyFromSegments(segments: readonly string[] | undefined): string | null {
  if (!segments || segments.length !== 1) return null;
  return isValidMediaKey(segments[0]) ? segments[0] : null;
}

/** A frame is either a path/URL that is served as is (bundled art) or a storage key under /media. */
export function isStorageFrame(frame: string): boolean {
  return !frame.startsWith('/') && !/^https?:\/\//i.test(frame);
}

/** The URL to put in `src` for one stored frame. */
export function frameSrc(frame: string): string {
  return isStorageFrame(frame) ? `${MEDIA_URL_PREFIX}${frame}` : frame;
}

/** The URL of the small still for a stored frame (bundled art is small already and is used as is). */
export function thumbSrc(frame: string): string {
  return isStorageFrame(frame) && isMainKey(frame) ? `${MEDIA_URL_PREFIX}${thumbKeyOf(frame)}` : frameSrc(frame);
}
