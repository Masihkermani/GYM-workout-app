import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  createClientSchema,
  fieldCodes,
  notesSchema,
  parseSteps,
  settingsSchema,
  updateClientSchema,
  updateExerciseSchema,
} from '@/components/coach/schemas';

const settings = {
  coachName: 'Coach Arash Kamali',
  coachNameFa: 'مربی آرش کمالی',
  bioEn: '',
  bioFa: '',
  locationEn: '',
  locationFa: '',
  timezone: 'Asia/Tehran',
  slotMinutes: '60',
  bufferMinutes: '0',
  horizonDays: '21',
  minNoticeHours: '12',
  cancelWindowHours: '24',
  barKg: '20',
  requireApproval: true,
  allowSignup: false,
};

describe('settingsSchema', () => {
  it('reads Persian, Arabic-Indic and Latin digits, and the Persian decimal separator', () => {
    const r = settingsSchema.parse({ ...settings, cancelWindowHours: '۴۸', slotMinutes: '٤٥', barKg: '۱۵٫۵' });
    expect(r.cancelWindowHours).toBe(48);
    expect(r.slotMinutes).toBe(45);
    expect(r.barKg).toBe(15.5);
  });

  it('reports a stable code per field', () => {
    const r = settingsSchema.safeParse({
      ...settings,
      slotMinutes: '5',
      horizonDays: 'abc',
      cancelWindowHours: '',
      timezone: 'Mars/Phobos',
      coachName: '   ',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(fieldCodes(r.error)).toMatchObject({
        slotMinutes: 'outOfRange',
        horizonDays: 'numberInvalid',
        cancelWindowHours: 'required',
        timezone: 'timezoneInvalid',
        coachName: 'required',
      });
    }
  });

  it('rejects fractional whole-number fields', () => {
    const r = settingsSchema.safeParse({ ...settings, horizonDays: '2.5' });
    expect(r.success).toBe(false);
  });

  it('normalises Arabic yeh/kaf in Persian text', () => {
    const r = settingsSchema.parse({ ...settings, coachNameFa: 'كريم', bioFa: 'يك متن' });
    expect(r.coachNameFa).toBe('کریم');
    expect(r.bioFa).toBe('یک متن');
  });
});

describe('updateClientSchema', () => {
  it('normalises the phone like sign-up does and tidies the name', () => {
    const r = updateClientSchema.parse({ id: 'c1', name: '  پریسا   آزمون‌پور ', phone: '۰۹۱۳ ۱۲۳ ۴۵۶۷' });
    expect(r.phone).toBe('+989131234567');
    expect(r.name).toBe('پریسا آزمون‌پور');
  });

  it('accepts a foreign number in E.164 and Arabic yeh/kaf in the name', () => {
    const r = updateClientSchema.parse({ id: 'c1', name: 'كيان', phone: '+49 151 2345 6789' });
    expect(r.phone).toBe('+4915123456789');
    expect(r.name).toBe('کیان');
  });

  it('reports a bad phone, an empty phone and a short name as stable codes on their own fields', () => {
    const bad = updateClientSchema.safeParse({ id: 'c1', name: 'آ', phone: '12' });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(fieldCodes(bad.error)).toEqual({ name: 'nameShort', phone: 'phoneInvalid' });
    const empty = updateClientSchema.safeParse({ id: 'c1', name: 'Kian', phone: '  ' });
    if (!empty.success) expect(fieldCodes(empty.error)).toEqual({ phone: 'required' });
    else throw new Error('expected a failure');
  });
});

describe('createClientSchema', () => {
  it('normalises the phone to E.164 and tidies the name', () => {
    const r = createClientSchema.parse({ name: '  پریسا   آزمون‌پور ', phone: '۰۹۱۳ ۱۲۳ ۴۵۶۷', password: 'abcd-efgh-jkmn', locale: 'fa' });
    expect(r.phone).toBe('+989131234567');
    expect(r.name).toBe('پریسا آزمون‌پور');
  });

  it('refuses a short password, a bad phone and an unknown locale falls back to fa', () => {
    const r = createClientSchema.safeParse({ name: 'ا', phone: '123', password: 'short', locale: 'xx' });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldCodes(r.error)).toMatchObject({ name: 'nameShort', phone: 'phoneInvalid', password: 'passwordShort' });
    expect(createClientSchema.parse({ name: 'سارا', phone: '09120000009', password: 'long-enough-1', locale: 'xx' }).locale).toBe('fa');
  });
});

describe('notesSchema', () => {
  it('keeps line breaks, strips control characters and turns blank into null', () => {
    expect(notesSchema.parse({ id: 'x', notes: 'a\r\nb\u0000c' }).notes).toBe('a\nbc');
    expect(notesSchema.parse({ id: 'x', notes: '   \n ' }).notes).toBeNull();
  });

  it('caps the length', () => {
    expect(notesSchema.safeParse({ id: 'x', notes: 'a'.repeat(5001) }).success).toBe(false);
  });
});

describe('exercise steps', () => {
  it('parseSteps: one line per step, blanks dropped, Persian letters normalised', () => {
    expect(parseSteps('اول  بنشین\n\n  دوم   بلند شو \r\nسوم', true)).toEqual(['اول بنشین', 'دوم بلند شو', 'سوم']);
    expect(parseSteps('يك\n', true)).toEqual(['یک']);
  });

  it('updateExerciseSchema limits the number of steps and the length of a step', () => {
    const base = { id: 'x', nameFa: '  پرس  ', stepsFa: '', stepsEn: '', archived: false };
    const ok = updateExerciseSchema.parse({ ...base, stepsFa: 'یک\nدو' });
    expect(ok.nameFa).toBe('پرس');
    expect(ok.stepsFa).toEqual(['یک', 'دو']);
    expect(updateExerciseSchema.parse({ ...base, nameFa: '   ' }).nameFa).toBeNull();
    const tooMany = updateExerciseSchema.safeParse({ ...base, stepsEn: Array.from({ length: 31 }, (_, i) => `s${i}`).join('\n') });
    expect(tooMany.success).toBe(false);
    const tooLong = updateExerciseSchema.safeParse({ ...base, stepsEn: 'x'.repeat(401) });
    expect(tooLong.success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('needs matching new passwords that differ from the current one', () => {
    expect(changePasswordSchema.safeParse({ current: 'old-password-1', next: 'new-password-2', confirm: 'new-password-2' }).success).toBe(true);
    const mismatch = changePasswordSchema.safeParse({ current: 'old-password-1', next: 'new-password-2', confirm: 'nope-nope-nope' });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) expect(fieldCodes(mismatch.error).confirm).toBe('passwordMismatch');
    const same = changePasswordSchema.safeParse({ current: 'same-password-1', next: 'same-password-1', confirm: 'same-password-1' });
    expect(same.success).toBe(false);
    if (!same.success) expect(fieldCodes(same.error).next).toBe('passwordSame');
    const short = changePasswordSchema.safeParse({ current: 'x', next: 'short', confirm: 'short' });
    expect(short.success).toBe(false);
    if (!short.success) expect(fieldCodes(short.error).next).toBe('passwordShort');
  });
});
