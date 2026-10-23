/** Translated label for a library value (body part, equipment, target); unknown values show as stored. */
export function taxonomyLabel(dict: Record<string, string> | undefined, value: string): string {
  if (dict && Object.prototype.hasOwnProperty.call(dict, value)) return dict[value];
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export type TaxonomyKind = 'bodyPart' | 'equipment' | 'target';

/**
 * The { value: label } map for one kind, read from the `coach` messages. `t.raw` is typed for leaf
 * keys only, so the key goes through `never`; the shape is guaranteed by messages/*\/coach.json.
 */
export function taxonomyDict(t: { raw: (key: never) => unknown }, kind: TaxonomyKind): Record<string, string> {
  return t.raw(`taxonomy.${kind}` as never) as Record<string, string>;
}
