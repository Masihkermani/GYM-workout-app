import 'server-only';
import { cache } from 'react';
import { prisma } from './db';
import { DEFAULT_TIME_ZONE } from './constants';

/** CoachSettings with the Decimal converted to a plain number (safe to pass to client components). */
export interface CoachSettingsData {
  coachName: string;
  coachNameFa: string;
  bioEn: string;
  bioFa: string;
  locationEn: string;
  locationFa: string;
  timezone: string;
  slotMinutes: number;
  bufferMinutes: number;
  horizonDays: number;
  minNoticeHours: number;
  cancelWindowHours: number;
  requireApproval: boolean;
  allowSignup: boolean;
  barKg: number;
  updatedAt: Date;
}

/**
 * The singleton settings row (id = 1). Created with defaults if missing so a fresh database still
 * renders. Memoised per request.
 */
export const getCoachSettings = cache(async (): Promise<CoachSettingsData> => {
  const row =
    (await prisma.coachSettings.findUnique({ where: { id: 1 } })) ??
    // upsert (not create) so two concurrent first requests cannot race into a unique violation
    (await prisma.coachSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, coachName: 'Your Coach', coachNameFa: 'مربی شما', timezone: DEFAULT_TIME_ZONE },
    }));
  const { id: _id, barKg, ...rest } = row;
  return { ...rest, barKg: Number(barKg) };
});

/** The coach's name in the viewer's language. */
export function coachDisplayName(
  settings: Pick<CoachSettingsData, 'coachName' | 'coachNameFa'>,
  locale: string,
): string {
  return locale === 'fa' ? settings.coachNameFa : settings.coachName;
}
