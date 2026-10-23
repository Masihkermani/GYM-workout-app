import { describe, expect, it } from 'vitest';
import { groupHours, mergeWindows, weekdayOrder, type RuleLike } from '@/components/landing/hours';

const rule = (weekday: number, startMinute: number, endMinute: number, active = true): RuleLike => ({
  weekday,
  startMinute,
  endMinute,
  active,
});

// the seed: Sat-Wed 07-11 and 16-21, Thu 08-12, Fri off
const SEED: RuleLike[] = [
  ...[6, 0, 1, 2, 3].flatMap((d) => [rule(d, 420, 660), rule(d, 960, 1260)]),
  rule(4, 480, 720),
];

describe('weekdayOrder', () => {
  it('starts on Saturday for fa and Monday for en', () => {
    expect(weekdayOrder('fa')).toEqual([6, 0, 1, 2, 3, 4, 5]);
    expect(weekdayOrder('en')).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

describe('mergeWindows', () => {
  it('sorts, merges touching and overlapping windows and drops empty ones', () => {
    expect(mergeWindows([[540, 660], [420, 540], [960, 1020], [1000, 1260], [700, 700]])).toEqual([
      [420, 660],
      [960, 1260],
    ]);
  });
});

describe('groupHours', () => {
  it('fa: Saturday to Wednesday share one line, Thursday and Friday follow', () => {
    const rows = groupHours(SEED, 'fa');
    expect(rows.map((r) => r.days)).toEqual([[6, 0, 1, 2, 3], [4], [5]]);
    expect(rows[0].windows).toEqual([[420, 660], [960, 1260]]);
    expect(rows[1].windows).toEqual([[480, 720]]);
    expect(rows[2].windows).toEqual([]); // Friday: closed
  });

  it('en: Monday first, so the Saturday-Sunday block is its own line', () => {
    const rows = groupHours(SEED, 'en');
    // Mon-Wed, Thu, Fri closed, Sat + Sun (Sunday is open: weekday 0 is in the seed)
    expect(rows.map((r) => r.days)).toEqual([[1, 2, 3], [4], [5], [6, 0]]);
  });

  it('ignores inactive rules and returns nothing when there are no hours at all', () => {
    expect(groupHours([rule(1, 420, 660, false)], 'en')).toEqual([]);
    expect(groupHours([], 'fa')).toEqual([]);
  });

  it('treats a day with only inactive rules as closed', () => {
    const rows = groupHours([rule(6, 420, 660), rule(0, 420, 660, false)], 'fa');
    expect(rows.map((r) => r.days)).toEqual([[6], [0, 1, 2, 3, 4, 5]]);
    expect(rows[1].windows).toEqual([]);
  });
});
