/**
 * Barbell plate maths (pure). Plates per side are chosen greedily from the standard set.
 * Colours follow the IWF/IPF calibrated colour code: 25 red, 20 blue, 15 yellow, 10 green, 5 white,
 * 2.5 black, 1.25 steel. The UI maps `PlateColor` to CSS tokens.
 */

export const PLATE_SIZES_KG = [25, 20, 15, 10, 5, 2.5, 1.25] as const;
export type PlateKg = (typeof PLATE_SIZES_KG)[number];
export type PlateColor = 'red' | 'blue' | 'yellow' | 'green' | 'white' | 'black' | 'steel';

export const PLATE_COLOR: Record<PlateKg, PlateColor> = {
  25: 'red',
  20: 'blue',
  15: 'yellow',
  10: 'green',
  5: 'white',
  2.5: 'black',
  1.25: 'steel',
};

/**
 * Real plate diameters in mm. The IWF/IPF bumpers (25, 20, 15, 10 kg) are all 450 mm; only their
 * thickness tells them apart. The small change plates are much smaller discs.
 */
export const PLATE_DIAMETER_MM: Record<PlateKg, number> = {
  25: 450,
  20: 450,
  15: 450,
  10: 450,
  5: 230,
  2.5: 190,
  1.25: 160,
};

/** Relative plate diameter (1 = a 450 mm bumper): proportional to the real diameters above. */
export const PLATE_HEIGHT: Record<PlateKg, number> = {
  25: PLATE_DIAMETER_MM[25] / 450,
  20: PLATE_DIAMETER_MM[20] / 450,
  15: PLATE_DIAMETER_MM[15] / 450,
  10: PLATE_DIAMETER_MM[10] / 450,
  5: PLATE_DIAMETER_MM[5] / 450,
  2.5: PLATE_DIAMETER_MM[2.5] / 450,
  1.25: PLATE_DIAMETER_MM[1.25] / 450,
};

/**
 * Relative plate thickness (1 = the 25 kg bumper). A 25 kg bumper is about twice as thick as a
 * 5 kg change plate; the lighter bumpers step down in between. Drawn slightly exaggerated against the
 * diameter so a plate still reads as a plate at phone size.
 */
export const PLATE_THICKNESS: Record<PlateKg, number> = {
  25: 1,
  20: 0.82,
  15: 0.68,
  10: 0.54,
  5: 0.5,
  2.5: 0.39,
  1.25: 0.29,
};

export type PlateFailure = 'below-bar' | 'unreachable';

export interface PlateLoad {
  /** True when the weight can be made exactly with the plates. */
  ok: boolean;
  /** Plates on ONE side, heaviest (innermost) first. Empty for the bare bar. */
  perSide: PlateKg[];
  /** Total of the loaded plates on both sides plus the bar. When !ok this is the best greedy fit. */
  loadedKg: number;
  reason?: PlateFailure;
  /** Closest loadable totals either side of the request (only set when !ok). */
  nearestBelowKg?: number;
  nearestAboveKg?: number;
}

const EPS = 1e-6;
const SMALLEST = PLATE_SIZES_KG[PLATE_SIZES_KG.length - 1];

/** Round to the nearest 0.01 kg to kill binary floating-point noise. */
const clean = (n: number) => Math.round(n * 100) / 100;

function greedy(perSideKg: number): { plates: PlateKg[]; remainder: number } {
  let rest = clean(perSideKg);
  const plates: PlateKg[] = [];
  for (const p of PLATE_SIZES_KG) {
    while (rest + EPS >= p) {
      plates.push(p);
      rest = clean(rest - p);
    }
  }
  return { plates, remainder: rest };
}

/**
 * Work out how to load `weightKg` on a bar of `barKg`.
 * The smallest increment is 2 x 1.25 = 2.5 kg total.
 */
export function computePlates(weightKg: number, barKg = 20): PlateLoad {
  if (!Number.isFinite(weightKg) || weightKg < 0) {
    return { ok: false, perSide: [], loadedKg: barKg, reason: 'below-bar', nearestAboveKg: barKg };
  }
  if (weightKg + EPS < barKg) {
    return { ok: false, perSide: [], loadedKg: barKg, reason: 'below-bar', nearestAboveKg: barKg };
  }
  const { plates, remainder } = greedy((weightKg - barKg) / 2);
  const loaded = clean(barKg + 2 * plates.reduce((a, b) => a + b, 0));
  if (remainder < EPS) {
    return { ok: true, perSide: plates, loadedKg: loaded };
  }
  const step = 2 * SMALLEST;
  const below = clean(barKg + Math.floor(clean((weightKg - barKg) / step)) * step);
  return {
    ok: false,
    perSide: plates,
    loadedKg: loaded,
    reason: 'unreachable',
    nearestBelowKg: below,
    nearestAboveKg: clean(below + step),
  };
}

/** `[{ plate: 25, count: 2 }, { plate: 5, count: 1 }]` - handy for the text alternative. */
export function groupPlates(perSide: readonly PlateKg[]): { plate: PlateKg; count: number }[] {
  const out: { plate: PlateKg; count: number }[] = [];
  for (const p of perSide) {
    const last = out[out.length - 1];
    if (last && last.plate === p) last.count += 1;
    else out.push({ plate: p, count: 1 });
  }
  return out;
}
