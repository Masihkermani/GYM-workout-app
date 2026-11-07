/**
 * Where processed demonstrations live: flat files in MEDIA_DIR (default ./storage/media, a volume in
 * docker-compose). Server only. File names are generated here (random, never derived from the upload)
 * and every read goes through `isValidMediaKey`, so no user input ever reaches a path unvalidated.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isMainKey, isValidMediaKey, thumbKeyOf } from './key';
import type { ProcessedImage } from './process';

export function mediaDir(): string {
  return resolve(process.env.MEDIA_DIR?.trim() || './storage/media');
}

const pathOf = (key: string): string => {
  if (!isValidMediaKey(key)) throw new Error('invalid media key');
  return join(mediaDir(), key);
};

async function writeAtomic(file: string, data: Buffer) {
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmp, data, { mode: 0o640 });
  await rename(tmp, file);
}

/** Write the main file and its thumbnail; returns the key of the main file (what ExerciseMedia.frames stores). */
export async function storeProcessed(p: Pick<ProcessedImage, 'main' | 'thumb'>): Promise<string> {
  await mkdir(mediaDir(), { recursive: true });
  const key = `${randomBytes(16).toString('hex')}.webp`;
  await writeAtomic(pathOf(key), p.main);
  await writeAtomic(pathOf(thumbKeyOf(key)), p.thumb);
  return key;
}

/** The bytes of a stored file, or null when the key is invalid or the file does not exist. */
export async function readStored(key: string): Promise<Buffer | null> {
  if (!isValidMediaKey(key)) return null;
  try {
    const file = pathOf(key);
    if (!(await stat(file)).isFile()) return null;
    return await readFile(file);
  } catch {
    return null;
  }
}

/** Remove stored frames (and their thumbnails). Entries that are not storage keys (bundled art) are ignored. */
export async function removeStored(frames: readonly string[]): Promise<void> {
  for (const frame of frames) {
    if (!isMainKey(frame)) continue;
    await Promise.all([rm(pathOf(frame), { force: true }), rm(pathOf(thumbKeyOf(frame)), { force: true })]);
  }
}
