import { toLatinDigits } from '@/lib/digits';
import { MINUTES_PER_DAY } from '@/lib/time';

/**
 * Parse a clock time typed by a person: `17`, `17:30`, `1730`, `17.30`, `۱۷:۳۰`, `١٧:٣٠`, `24:00`.
 * Returns minutes from midnight (0..1440) or null. 24:00 (1440) is accepted so a window can end at midnight.
 */
export function parseTimeOfDay(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = toLatinDigits(input)
    .replace(/[\s‌‍‎‏‪-‮⁦-⁩]/g, '')
    .replace(/[٫.،,]/g, ':')
    .replace(/[:：]/g, ':');
  let h: number;
  let m: number;
  let match: RegExpExecArray | null;
  if ((match = /^(\d{1,2}):(\d{2})$/.exec(s))) {
    h = Number(match[1]);
    m = Number(match[2]);
  } else if ((match = /^(\d{1,2})$/.exec(s))) {
    h = Number(match[1]);
    m = 0;
  } else if ((match = /^(\d{1,2})(\d{2})$/.exec(s))) {
    h = Number(match[1]);
    m = Number(match[2]);
  } else {
    return null;
  }
  if (m > 59) return null;
  const total = h * 60 + m;
  return total <= MINUTES_PER_DAY ? total : null;
}

/** `1020` -> `17:00` in Latin digits (value for inputs and HH:MM payloads). */
export function minutesToHHMM(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export type WindowError = 'invalidTime' | 'endBeforeStart' | 'tooShort' | 'overlap';

export interface WindowLike {
  id?: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
}

/**
 * Validate one availability window against the others of the same weekday.
 *  - minutes must be whole numbers inside 0..1440
 *  - end must be after start
 *  - the window must fit at least one slot of `slotMinutes`
 *  - it must not overlap another window that day (touching end-to-start is fine)
 * `others` may include the window being edited (matched by id); it is skipped.
 */
export function validateWindow(
  candidate: WindowLike,
  others: readonly WindowLike[],
  slotMinutes: number,
): WindowError | null {
  const { weekday, startMinute, endMinute } = candidate;
  const whole = Number.isInteger(startMinute) && Number.isInteger(endMinute);
  if (!whole || startMinute < 0 || endMinute > MINUTES_PER_DAY || weekday < 0 || weekday > 6 || !Number.isInteger(weekday))
    return 'invalidTime';
  if (endMinute <= startMinute) return 'endBeforeStart';
  if (endMinute - startMinute < slotMinutes) return 'tooShort';
  for (const other of others) {
    if (other.weekday !== weekday) continue;
    if (candidate.id && other.id === candidate.id) continue;
    if (startMinute < other.endMinute && endMinute > other.startMinute) return 'overlap';
  }
  return null;
}
