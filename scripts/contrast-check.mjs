#!/usr/bin/env node
/**
 * WCAG contrast audit of the design tokens in src/app/globals.css (light + dark).
 * Text pairs must reach 4.5:1, UI boundaries 3:1. Exits 1 on any failure.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app', 'globals.css'), 'utf8');

function block(startMarker) {
  const i = css.indexOf(startMarker);
  const open = css.indexOf('{', i);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}
function tokens(body) {
  const out = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const light = tokens(block(':root,\n[data-theme="light"]'));
const dark = tokens(block('\n[data-theme="dark"] {'));

const rgb = (v) => {
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(v);
  if (m) return [+m[1], +m[2], +m[3], +m[4]];
  throw new Error(`cannot parse ${v}`);
};
const over = (fg, bg) => {
  const [r, g, b, a = 1] = fg;
  return [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a)];
};
const lum = ([r, g, b]) => {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground token, background token, minimum, label]
const PAIRS = [
  ['ink', 'paper', 4.5, 'body text'],
  ['ink', 'card', 4.5, 'text on card'],
  ['ink-2', 'paper', 4.5, 'secondary text'],
  ['ink-2', 'card', 4.5, 'secondary on card'],
  ['ink-3', 'paper', 4.5, 'captions'],
  ['ink-3', 'card', 4.5, 'captions on card'],
  ['ink-2', 'paper-2', 4.5, 'secondary on paper-2'],
  ['ink', 'paper-2', 4.5, 'text on paper-2'],
  ['on-red', 'plate-red', 4.5, 'primary button label'],
  ['on-blue', 'plate-blue', 4.5, 'blue fill label'],
  ['on-green', 'plate-green', 4.5, 'green fill label'],
  ['on-yellow', 'plate-yellow', 4.5, 'yellow fill label'],
  ['paper', 'ink', 4.5, 'ink button label'],
  ['on-danger', 'danger', 4.5, 'danger button label'],
  ['danger', 'paper', 4.5, 'error text on paper'],
  ['danger', 'card', 4.5, 'error text on card'],
  ['plate-red', 'paper', 4.5, 'red text/links on paper'],
  ['plate-blue', 'card', 4.5, 'blue text on card'],
  ['ink-3', 'paper', 3, 'input boundary (ink-3) vs page'],
  ['ink-3', 'card', 3, 'input boundary (ink-3) vs card'],
  ['ink', 'paper', 3, 'focus ring'],
];

let failures = 0;
for (const [name, theme] of [['light', light], ['dark', dark]]) {
  console.log(`\n${name}`);
  for (const [fgName, bgName, min, label] of PAIRS) {
    const bg = rgb(theme[bgName]);
    const fg = over(rgb(theme[fgName]), bg);
    const r = ratio(fg, bg);
    const ok = r >= min;
    if (!ok) failures += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2).padStart(5)}:1 (>= ${min})  ${fgName} on ${bgName}  ${label}`);
  }
}
if (failures) {
  console.error(`\n${failures} contrast failure(s)`);
  process.exit(1);
}
console.log('\nAll pairs pass.');
