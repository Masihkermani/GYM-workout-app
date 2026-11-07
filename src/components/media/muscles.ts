/** Muscle names: translated when we have a word for it (training.json › muscle), the dataset's own value otherwise. */
type Translator = { (key: string): string; has: (key: string) => boolean };

export function muscleLabel(t: unknown, raw: string): string {
  const tt = t as Translator;
  const key = `muscle.${raw}`;
  return tt.has(key) ? tt(key) : raw;
}
