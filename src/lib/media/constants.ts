/** Limits and sizes for exercise demonstrations. Shared by the upload action, the importer and the UI. */

/** One uploaded file. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
/** All files of one upload together. */
export const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
/** Frames of one flipbook. */
export const MAX_FRAMES = 8;
/** Demonstrations (rows) per exercise. */
export const MAX_MEDIA_PER_EXERCISE = 6;
/** Longest side of a stored image, in pixels. */
export const MAX_DIMENSION = 960;
/** Longest side of the list thumbnail, in pixels. */
export const THUMB_DIMENSION = 192;
/** Refuse to decode anything larger than this per frame (decompression-bomb guard), in pixels. */
export const MAX_INPUT_PIXELS = 36_000_000;
/** An animated upload may have at most this many frames. */
export const MAX_ANIMATION_FRAMES = 150;

/** Where the demonstration is served from. */
export const MEDIA_URL_PREFIX = '/media/';

/** The MIME types a coach may upload (decided from the bytes, never from the file name). */
export const ACCEPT_ATTR = 'image/jpeg,image/png,image/webp,image/gif';
