import 'server-only';
import { prisma } from '@/lib/db';
import { toMediaDTO, toThumbDTO, type ExerciseInfoDTO, type ExerciseThumbDTO } from './dto';

/** All demonstrations of one exercise, primary first. */
export async function getExerciseInfo(exerciseId: string): Promise<ExerciseInfoDTO | null> {
  if (!exerciseId || exerciseId.length > 64) return null;
  const e = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    select: {
      id: true,
      nameEn: true,
      nameFa: true,
      bodyPart: true,
      equipment: true,
      target: true,
      secondaryMuscles: true,
      stepsEn: true,
      stepsFa: true,
      media: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
    },
  });
  if (!e) return null;
  const { media, ...rest } = e;
  return { ...rest, media: media.map(toMediaDTO) };
}

/** exerciseId -> thumbnail, for lists built from raw SQL or other shapes. Missing = no demonstration. */
export async function thumbsFor(exerciseIds: readonly string[]): Promise<Map<string, ExerciseThumbDTO>> {
  const out = new Map<string, ExerciseThumbDTO>();
  if (exerciseIds.length === 0) return out;
  const rows = await prisma.exerciseMedia.findMany({
    where: { exerciseId: { in: [...exerciseIds] } },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: { exerciseId: true, frames: true, recolorable: true, source: true },
  });
  for (const r of rows) {
    if (out.has(r.exerciseId)) continue; // rows arrive primary first
    const thumb = toThumbDTO(r);
    if (thumb) out.set(r.exerciseId, thumb);
  }
  return out;
}
