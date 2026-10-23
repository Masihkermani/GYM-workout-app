import 'server-only';
import { prisma } from '@/lib/db';
import type { RuleLike } from './hours';

/** Active weekly windows, straight from the availability editor's table. */
export async function getAvailabilityRules(): Promise<RuleLike[]> {
  return prisma.availabilityRule.findMany({
    where: { active: true },
    select: { weekday: true, startMinute: true, endMinute: true, active: true },
    orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
  });
}
