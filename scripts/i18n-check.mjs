#!/usr/bin/env node
/**
 * i18n parity check. For every namespace file in messages/<locale>/ it compares the flattened key
 * set across locales and exits 1 on any mismatch. It also catches a few Persian-typography slips:
 *   - Arabic yeh / kaf (U+064A, U+0643) instead of Persian ی / ک
 *   - "می " / "نمی " followed by a space instead of a zero-width non-joiner
 *   - ICU placeholders ({name}) that differ between locales
 *   - empty strings
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'messages');
const LOCALES = ['fa', 'en'];
const SOURCE = 'fa';

const errors = [];
const err = (msg) => errors.push(msg);

function flatten(obj, prefix = '') {
  const out = new Map();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [ck, cv] of flatten(v, key)) out.set(ck, cv);
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => out.set(`${key}.${i}`, item));
    } else {
      out.set(key, v);
    }
  }
  return out;
}

/** Top-level argument names of an ICU message: {name}, {n, plural, ...}, {n, number}. Nested plural bodies are ignored. */
function placeholders(str) {
  const names = new Set();
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '{') {
      if (depth === 0) {
        const m = /^\{\s*([A-Za-z0-9_]+)/.exec(str.slice(i));
        if (m) names.add(m[1]);
      }
      depth++;
    } else if (ch === '}') depth--;
  }
  return [...names].sort().join(',');
}

function load(locale) {
  const dir = join(root, locale);
  if (!existsSync(dir)) {
    err(`missing directory messages/${locale}`);
    return new Map();
  }
  const files = new Map();
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    try {
      files.set(f.replace(/\.json$/, ''), flatten(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
    } catch (e) {
      err(`messages/${locale}/${f}: invalid JSON (${e.message})`);
    }
  }
  return files;
}

const data = Object.fromEntries(LOCALES.map((l) => [l, load(l)]));
const namespaces = new Set(LOCALES.flatMap((l) => [...data[l].keys()]));

let keyCount = 0;
for (const ns of [...namespaces].sort()) {
  const sets = LOCALES.map((l) => data[l].get(ns));
  LOCALES.forEach((l, i) => {
    if (!sets[i]) err(`namespace "${ns}" is missing in messages/${l}/${ns}.json`);
  });
  if (sets.some((s) => !s)) continue;

  const src = data[SOURCE].get(ns);
  keyCount += src.size;
  for (const l of LOCALES) {
    const map = data[l].get(ns);
    for (const key of src.keys()) if (!map.has(key)) err(`[${l}] ${ns}: missing key "${key}"`);
    for (const key of map.keys()) if (!src.has(key)) err(`[${l}] ${ns}: extra key "${key}" (not in ${SOURCE})`);
  }
  for (const [key, srcVal] of src) {
    for (const l of LOCALES) {
      const val = data[l].get(ns).get(key);
      if (val === undefined) continue;
      if (typeof val !== 'string') {
        err(`[${l}] ${ns}.${key}: value must be a string`);
        continue;
      }
      if (val.trim() === '') err(`[${l}] ${ns}.${key}: empty string`);
      if (typeof srcVal === 'string' && placeholders(val) !== placeholders(srcVal)) {
        err(`[${l}] ${ns}.${key}: placeholders differ ({${placeholders(val)}} vs {${placeholders(srcVal)}})`);
      }
    }
  }
  for (const [key, val] of data.fa.get(ns)) {
    if (typeof val !== 'string') continue;
    if (/[يك]/.test(val)) err(`[fa] ${ns}.${key}: Arabic yeh/kaf found; use Persian ی / ک`);
    if (/(^|\s)(ن?می) \S/.test(val)) err(`[fa] ${ns}.${key}: "${val.match(/(^|\s)(ن?می) \S+/)[0].trim()}" needs a zero-width non-joiner after می`);
  }
}

if (errors.length) {
  console.error(`i18n:check FAILED (${errors.length} problem${errors.length === 1 ? '' : 's'})`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`i18n:check OK: ${namespaces.size} namespaces, ${keyCount} keys, locales ${LOCALES.join('/')}`);
