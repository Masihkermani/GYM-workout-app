# Everkinetic mapping notes

Source: Everkinetic open data (Greg Priday, CC BY-SA 4.0), 293 entries, 290 with usable images (0230, 0283, 0298 have none).

## Counts
- Our exercises covered (high confidence, shipped in open-media.json): 198 of 1324 (15.0%)
- Everkinetic entries used: 173 (images: 161 from the aligned SVG pairs, 12 from images-web PNG pairs registered by script)
- Medium-confidence pairs (NOT shipped, for human review, review-medium.json): 46
- Assets: 346 WebP frames, 7.2 MB, avg 21 KB per frame (all at most 25 KB)
- mapping-high.json lists every shipped pair with a one-line reason.

## Method
1. Normalised names on both sides (equipment words, plurals, hyphens, synonyms) and generated candidates by token overlap, with equipment class (barbell, dumbbell, cable, machine, smith, body, band, ball, ez-bar) required to match.
2. Reviewed every Everkinetic entry against its candidates by reading names, equipment, muscles and steps; no cross-equipment mapping.
3. Looked at the rendered images of every mapped Everkinetic entry (contact sheets). This caught entries whose picture does not match their name; these were dropped: 0010 front-raises and 0033 front-dumbbell-raise (both show a curl), 0167 (shows a cable movement), 0268 (shows a rear-delt raise), 0192, 0098, 0020, 0040, 0202.
4. High = same movement, equipment and body position. Several of our duplicates ("v. 2", back/side POV) map to one entry. Medium = same family but a visible difference (machine brand, grip, ball vs bosu, single vs two arm) or an uncertain picture.

## Notable unmatched common lifts
No usable Everkinetic picture exists for: barbell bent-over row (0027, entry 0298 has no image), dumbbell bent-over row, one-arm dumbbell row, dumbbell front raise, standing dumbbell/barbell overhead press, barbell glute bridge / hip thrust, plank and side plank, hanging leg raise, barbell sumo deadlift, goblet squat, dumbbell fly on cable/crossover variants, face pull, lateral raise on cable, all kettlebell and most band, bosu and medicine-ball exercises, all stretches and cardio.

## Notes
- Images are black line art on transparent. For dark mode use `filter: invert(1)` (alpha is preserved).
- Everkinetic id 0020 is used twice in the source; the script prefers the entry that has an image folder.
- Rebuild: `node scripts/media/build-everkinetic.mjs --src <everkinetic checkout>`.
