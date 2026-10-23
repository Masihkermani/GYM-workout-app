import { describe, expect, it } from 'vitest';
import { generateTempPassword } from '@/components/coach/tempPassword';

describe('generateTempPassword', () => {
  it('is 12 unambiguous symbols grouped 4-4-4', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTempPassword()).toMatch(/^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/);
    }
  });

  it('never contains the look-alikes i l o 0 1', () => {
    const all = Array.from({ length: 300 }, () => generateTempPassword()).join('');
    expect(all).not.toMatch(/[ilo01]/);
  });

  it('is random: 500 passwords, no repeats, every symbol shows up', () => {
    const batch = Array.from({ length: 500 }, () => generateTempPassword());
    expect(new Set(batch).size).toBe(500);
    const seen = new Set(batch.join('').replace(/-/g, ''));
    expect(seen.size).toBe(31);
  });

  it('is long enough to satisfy the 8-character rule', () => {
    expect(generateTempPassword().length).toBeGreaterThanOrEqual(8);
  });
});
