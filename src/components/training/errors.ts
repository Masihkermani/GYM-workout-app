import type { ActionErrorCode } from '@/lib/training/schemas';

/**
 * Message key of a training error for a COACH screen. Most `training.errors.*` are worded neutrally
 * because the coach and the client read them; the ones that tell the reader what to do next have a
 * coach twin in the formal register (`errors.<code>Coach`).
 */
export type CoachTrainingErrorKey = `errors.${ActionErrorCode}` | 'errors.dailyLimitCoach';

export function coachErrorKey(code: ActionErrorCode): CoachTrainingErrorKey {
  return code === 'dailyLimit' ? 'errors.dailyLimitCoach' : `errors.${code}`;
}
