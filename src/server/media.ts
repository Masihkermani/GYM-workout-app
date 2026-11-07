'use server';

import { revalidatePath } from 'next/cache';
import type { CoachErrorCode } from '@/components/coach/schemas';
import { requireCoach, requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  MAX_FILE_BYTES,
  MAX_FRAMES,
  MAX_MEDIA_PER_EXERCISE,
  MAX_UPLOAD_BYTES,
} from '@/lib/media/constants';
import { toMediaDTO, type ExerciseInfoDTO, type MediaDTO } from '@/lib/media/dto';
import { isMainKey } from '@/lib/media/key';
import { MediaError, processImage, type ProcessedImage } from '@/lib/media/process';
import { getExerciseInfo } from '@/lib/media/queries';
import { removeStored, storeProcessed } from '@/lib/media/storage';

/**
 * Exercise demonstrations.
 *  - `exerciseInfoAction`: any signed-in user, read-only (the "how to" sheet loads it when it opens).
 *  - the rest are coach-only (requireCoach() before any input is read): upload 1-8 images as a frame
 *    sequence or one animated GIF/WebP, remove or reorder frames, delete a demonstration, pick the
 *    primary one. Every upload goes through lib/media/process.ts (sniffed by its bytes, re-encoded to
 *    WebP, no metadata) and is stored under MEDIA_DIR with a random name.
 * Errors are the stable codes of components/coach/schemas.ts, translated by the editor.
 */

export type MediaResult = { ok: true; media: MediaDTO[] } | { ok: false; error: CoachErrorCode };
export type InfoResult = { ok: true; info: ExerciseInfoDTO } | { ok: false; error: 'notFound' };

const bad = (error: CoachErrorCode): { ok: false; error: CoachErrorCode } => ({ ok: false, error });

const ERROR_OF: Record<MediaError['code'], CoachErrorCode> = {
  type: 'mediaType',
  corrupt: 'mediaCorrupt',
  tooLarge: 'mediaTooLarge',
  tooManyFrames: 'mediaTooLong',
};

function refreshPages() {
  revalidatePath('/', 'layout');
}

async function listMedia(exerciseId: string): Promise<MediaDTO[]> {
  const rows = await prisma.exerciseMedia.findMany({ where: { exerciseId }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  return rows.map(toMediaDTO);
}

const idOk = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64;

// ------------------------------------------------------------------------------------- read

/** Steps, muscles and demonstrations of one exercise, for the "how to" sheet. */
export async function exerciseInfoAction(exerciseId: string): Promise<InfoResult> {
  await requireUser();
  if (!idOk(exerciseId)) return { ok: false, error: 'notFound' };
  const info = await getExerciseInfo(exerciseId);
  return info ? { ok: true, info } : { ok: false, error: 'notFound' };
}

// ----------------------------------------------------------------------------------- upload

/**
 * Add a demonstration to an exercise. FormData: `exerciseId` and one or more `files`.
 *  - one animated GIF/WebP            -> kind GIF (stored as animated WebP)
 *  - one still image                  -> kind IMAGE
 *  - 2-8 still images, in this order  -> kind FRAMES
 * Limits: 8 MB per file, 24 MB per upload, 8 frames, 6 demonstrations per exercise.
 */
export async function uploadExerciseMediaAction(formData: FormData): Promise<MediaResult> {
  await requireCoach();

  const exerciseId = formData.get('exerciseId');
  if (!idOk(exerciseId)) return bad('notFound');
  const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId }, select: { id: true } });
  if (!exercise) return bad('notFound');

  const files = formData.getAll('files').filter((f): f is File => typeof f !== 'string');
  if (files.length === 0 || files.every((f) => f.size === 0)) return bad('mediaEmpty');
  if (files.length > MAX_FRAMES) return bad('mediaTooMany');
  if (files.some((f) => f.size > MAX_FILE_BYTES) || files.reduce((n, f) => n + f.size, 0) > MAX_UPLOAD_BYTES) {
    return bad('mediaTooLarge');
  }
  if ((await prisma.exerciseMedia.count({ where: { exerciseId } })) >= MAX_MEDIA_PER_EXERCISE) return bad('mediaLimit');

  // decode and re-encode one at a time (a few MB of pixels each), nothing is written until all succeeded
  const processed: ProcessedImage[] = [];
  try {
    for (const file of files) processed.push(await processImage(Buffer.from(await file.arrayBuffer())));
  } catch (e) {
    if (e instanceof MediaError) return bad(ERROR_OF[e.code]);
    throw e;
  }
  if (processed.length > 1 && processed.some((p) => p.animated)) return bad('mediaAnimated');

  const keys: string[] = [];
  try {
    for (const p of processed) keys.push(await storeProcessed(p));
    // a new upload is shown first (the coach can move it back); orders may go negative until the next reorder
    const first = await prisma.exerciseMedia.findFirst({ where: { exerciseId }, orderBy: { order: 'asc' }, select: { order: true } });
    await prisma.exerciseMedia.create({
      data: {
        exerciseId,
        kind: processed[0].animated ? 'GIF' : keys.length > 1 ? 'FRAMES' : 'IMAGE',
        frames: keys,
        source: 'COACH',
        modified: false,
        recolorable: false,
        order: first ? first.order - 1 : 0,
      },
    });
  } catch (e) {
    await removeStored(keys).catch(() => undefined); // do not leave orphans behind
    throw e;
  }

  refreshPages();
  return { ok: true, media: await listMedia(exerciseId) };
}

// ------------------------------------------------------------------------------- change

async function findMedia(mediaId: unknown) {
  if (!idOk(mediaId)) return null;
  return prisma.exerciseMedia.findUnique({ where: { id: mediaId } });
}

/** Delete one demonstration (and its stored files). Bundled art comes back at the next `db:seed`. */
export async function deleteExerciseMediaAction(mediaId: string): Promise<MediaResult> {
  await requireCoach();
  const row = await findMedia(mediaId);
  if (!row) return bad('notFound');
  await prisma.exerciseMedia.delete({ where: { id: row.id } });
  await removeStored(row.frames).catch(() => undefined);
  refreshPages();
  return { ok: true, media: await listMedia(row.exerciseId) };
}

/**
 * Put the demonstrations of an exercise in this order (first = primary). `orderedIds` must be exactly
 * the exercise's current demonstrations, so a stale list from another tab is refused instead of
 * silently dropping one.
 */
export async function reorderExerciseMediaAction(exerciseId: string, orderedIds: string[]): Promise<MediaResult> {
  await requireCoach();
  if (!idOk(exerciseId) || !Array.isArray(orderedIds) || !orderedIds.every(idOk)) return bad('notFound');
  const rows = await prisma.exerciseMedia.findMany({ where: { exerciseId }, select: { id: true } });
  const known = new Set(rows.map((r) => r.id));
  if (orderedIds.length !== known.size || new Set(orderedIds).size !== known.size || !orderedIds.every((id) => known.has(id))) {
    return bad('notFound');
  }
  await prisma.$transaction(orderedIds.map((id, order) => prisma.exerciseMedia.update({ where: { id }, data: { order } })));
  refreshPages();
  return { ok: true, media: await listMedia(exerciseId) };
}

/**
 * Reorder the frames of one demonstration, or remove some of them. `frames` must be a non-empty
 * selection of the current frames without repeats; removed frames are deleted from disk. A flipbook
 * left with one frame becomes a single image.
 */
export async function updateMediaFramesAction(mediaId: string, frames: string[]): Promise<MediaResult> {
  await requireCoach();
  const row = await findMedia(mediaId);
  if (!row || !Array.isArray(frames)) return bad('notFound');
  const current = new Set(row.frames);
  if (frames.length === 0 || new Set(frames).size !== frames.length || !frames.every((f) => current.has(f))) {
    return bad('notFound');
  }
  const kept = new Set(frames);
  const removed = row.frames.filter((f) => !kept.has(f));
  await prisma.exerciseMedia.update({
    where: { id: row.id },
    data: { frames, kind: row.kind === 'FRAMES' && frames.length === 1 ? 'IMAGE' : row.kind },
  });
  await removeStored(removed.filter(isMainKey)).catch(() => undefined);
  refreshPages();
  return { ok: true, media: await listMedia(row.exerciseId) };
}
