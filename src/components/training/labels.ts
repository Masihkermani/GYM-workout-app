/** Body part / equipment labels: translated when we have a word for it, the raw dataset value otherwise. */
type Translator = { (key: string): string; has: (key: string) => boolean };

export function bodyPartLabel(t: unknown, raw: string): string {
  const tt = t as Translator;
  const key = `bodyPart.${raw}`;
  return tt.has(key) ? tt(key) : raw;
}

export function equipmentLabel(t: unknown, raw: string): string {
  const tt = t as Translator;
  const key = `equipment.${raw}`;
  return tt.has(key) ? tt(key) : raw;
}

export const BODY_PARTS = ['chest', 'back', 'shoulders', 'upper arms', 'lower arms', 'upper legs', 'lower legs', 'waist', 'cardio', 'neck'] as const;
export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'cable',
  'leverage machine',
  'smith machine',
  'body weight',
  'ez barbell',
  'kettlebell',
  'band',
  'sled machine',
  'weighted',
  'assisted',
] as const;
