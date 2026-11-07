#!/usr/bin/env node
/**
 * Build the Daftar exercise illustrations from the Everkinetic open data.
 *
 *   Source : https://github.com/everkinetic/data  (CC BY-SA 4.0, Greg Priday)
 *   Output : public/exercise-media/everkinetic/<id_num>/1.webp  (start position, "relaxation")
 *                                                    /2.webp  (end position,   "tension")
 *
 * What it does for every Everkinetic entry that is used by the mapping:
 *   1. picks the best source for the two frames (SVG pair on a shared viewBox > images-web pair >
 *      src/exercises PNG pair) and rasterises them to greyscale;
 *   2. when the two frames do not share a coordinate system (everything except the SVG pairs) it
 *      registers frame 2 onto frame 1 by cross-correlating the (static) bench / machine / floor ink;
 *   3. turns white into alpha (black line art with antialiasing kept as partial alpha);
 *   4. crops BOTH frames to the union bounding box of the two + padding, pads to a 3:4..4:3 box,
 *      so the frames have the same size and the same offset (they cross-fade without jitter);
 *   5. resizes to <= 640 px on the long side and encodes WebP (alpha kept lossless, <= 25 KB/frame).
 *
 * The images are black on transparent. In dark mode use `filter: invert(1)` (alpha is untouched).
 *
 * Usage:
 *   node scripts/media/build-everkinetic.mjs --src /path/to/everkinetic [options]
 *   EVERKINETIC_SRC=/path/to/everkinetic node scripts/media/build-everkinetic.mjs
 *
 * Options:
 *   --src <dir>      Everkinetic checkout (contains exercises.json and src/)   [env EVERKINETIC_SRC]
 *   --out <dir>      output root            (default public/exercise-media/everkinetic)
 *   --media <file>   mapping to read the used ids from (default data/exercise-media/open-media.json)
 *   --ids a,b,c      build only these Everkinetic ids (e.g. 0042,0043)
 *   --all            build every Everkinetic entry that has images (ignores --media)
 *   --max <px>       long side of the output (default 640)
 *   --budget <bytes> per-frame size target (default 25600)
 *   --quiet          only print the summary
 *
 * Needs `sharp` (already in node_modules). No other dependency.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const o = { src: process.env.EVERKINETIC_SRC || '', out: '', media: '', ids: null, all: false, max: 640, budget: 25 * 1024, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === '--src') o.src = val();
    else if (a === '--out') o.out = val();
    else if (a === '--media') o.media = val();
    else if (a === '--ids') o.ids = val().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--all') o.all = true;
    else if (a === '--max') o.max = Number(val());
    else if (a === '--budget') o.budget = Number(val());
    else if (a === '--quiet') o.quiet = true;
    else if (a === '-h' || a === '--help') {
      console.log('See the header of scripts/media/build-everkinetic.mjs for usage.');
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!o.src) {
    console.error('Missing --src <everkinetic checkout> (or EVERKINETIC_SRC).');
    process.exit(2);
  }
  o.src = path.resolve(o.src);
  o.out = path.resolve(o.out || path.join(REPO, 'public/exercise-media/everkinetic'));
  o.media = path.resolve(o.media || path.join(REPO, 'data/exercise-media/open-media.json'));
  return o;
}

const exists = (p) => fs.access(p).then(() => true, () => false);

// ---------------------------------------------------------------- source resolution
const KINDS = ['relaxation', 'tension'];

async function resolveSource(src, entry) {
  const id = entry.id_num;
  const dir = path.join(src, 'src/exercises', id);
  // Two entries share id_num 0020; the folder holds the one whose json name matches.
  let dirOk = await exists(path.join(dir, `${id}.json`));
  if (dirOk) {
    try {
      const j = JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), 'utf8'));
      if (j.name && j.name !== entry.name) dirOk = false;
    } catch { /* keep dirOk */ }
  } else {
    dirOk = false;
  }
  if (dirOk) {
    const svg = KINDS.map((k) => path.join(dir, `${id}-${k}.svg`));
    if ((await Promise.all(svg.map(exists))).every(Boolean)) {
      const vb = await Promise.all(svg.map(viewBoxOf));
      return { kind: 'svg', files: svg, sharedViewBox: vb[0] && vb[0].join(' ') === vb[1].join(' '), viewBoxes: vb };
    }
  }
  const web = [1, 2].map((n) => path.join(src, 'src/images-web', `${entry.name}-${n}.png`));
  if ((await Promise.all(web.map(exists))).every(Boolean)) return { kind: 'web', files: web };
  if (dirOk) {
    const png = KINDS.map((k) => path.join(dir, `${id}-${k}.png`));
    if ((await Promise.all(png.map(exists))).every(Boolean)) return { kind: 'png', files: png };
  }
  return null;
}

async function viewBoxOf(file) {
  const head = (await fs.readFile(file, 'utf8')).slice(0, 800);
  const m = head.match(/viewBox="([^"]+)"/);
  return m ? m[1].trim().split(/\s+/).map(Number) : null;
}

// ---------------------------------------------------------------- rasterising
/** Greyscale, white-flattened raster of one frame. */
async function renderGrey(file, kind, viewBox, svgLong) {
  let img;
  if (kind === 'svg') {
    const [, , vw, vh] = viewBox;
    // librsvg: 1 user unit (pt) = density/72 px  ->  choose density so the long side is svgLong px
    const density = (72 * svgLong) / Math.max(vw, vh);
    img = sharp(file, { density, limitInputPixels: false });
  } else {
    img = sharp(file, { limitInputPixels: false });
  }
  const { data, info } = await img
    .flatten({ background: '#ffffff' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), w: info.width, h: info.height };
}

// ---------------------------------------------------------------- registration (non-SVG pairs)
/** Box-downsample the ink (255-grey) of a frame by an integer factor, then a 3x3 blur. */
function inkMap(g, factor) {
  const w = Math.max(1, Math.floor(g.w / factor));
  const h = Math.max(1, Math.floor(g.h / factor));
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let yy = 0; yy < factor; yy++) {
        const row = (y * factor + yy) * g.w + x * factor;
        for (let xx = 0; xx < factor; xx++) s += 255 - g.data[row + xx];
      }
      out[y * w + x] = s / (factor * factor * 255);
    }
  }
  // 3x3 box blur
  const b = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          s += out[yy * w + xx];
          n++;
        }
      }
      b[y * w + x] = s / n;
    }
  }
  return { data: b, w, h };
}

/** correlation of A(x,y) with B(x-dx, y-dy) over the overlap */
function corr(A, B, dx, dy) {
  const x0 = Math.max(0, dx), x1 = Math.min(A.w, B.w + dx);
  const y0 = Math.max(0, dy), y1 = Math.min(A.h, B.h + dy);
  if (x1 <= x0 || y1 <= y0) return 0;
  let s = 0;
  for (let y = y0; y < y1; y++) {
    const ra = y * A.w, rb = (y - dy) * B.w - dx;
    for (let x = x0; x < x1; x++) s += A.data[ra + x] * B.data[rb + x];
  }
  return s;
}

/**
 * Translation (dx, dy) in px of g1's coordinate system at which g2 must be placed so that the
 * static structure (bench, machine, floor, torso base) overlaps best.
 */
function register(g1, g2) {
  const maxDim = Math.max(g1.w, g1.h, g2.w, g2.h);
  const f1 = Math.max(1, Math.ceil(maxDim / 90));
  const A = inkMap(g1, f1), B = inkMap(g2, f1);
  let best = { s: -1, dx: 0, dy: 0 };
  const rx = Math.max(A.w, B.w), ry = Math.max(A.h, B.h);
  for (let dy = -ry + 4; dy <= ry - 4; dy++) {
    for (let dx = -rx + 4; dx <= rx - 4; dx++) {
      const s = corr(A, B, dx, dy);
      if (s > best.s) best = { s, dx, dy };
    }
  }
  // refine at ~4x finer resolution
  const f2 = Math.max(1, Math.ceil(maxDim / 360));
  const A2 = inkMap(g1, f2), B2 = inkMap(g2, f2);
  const ratio = f1 / f2;
  const cx = Math.round(best.dx * ratio), cy = Math.round(best.dy * ratio);
  const span = Math.ceil(ratio) + 2;
  let best2 = { s: -1, dx: cx, dy: cy };
  for (let dy = cy - span; dy <= cy + span; dy++) {
    for (let dx = cx - span; dx <= cx + span; dx++) {
      const s = corr(A2, B2, dx, dy);
      if (s > best2.s) best2 = { s, dx, dy };
    }
  }
  const norm = Math.sqrt(corr(A2, A2, 0, 0) * corr(B2, B2, 0, 0)) || 1;
  return { dx: best2.dx * f2, dy: best2.dy * f2, score: best2.s / norm };
}

// ---------------------------------------------------------------- compositing helpers
/** Put grey frames on a shared canvas (white background). offsets are top-left positions. */
function toCanvas(frames, offs) {
  const minX = Math.min(...offs.map((o) => o.x));
  const minY = Math.min(...offs.map((o) => o.y));
  const maxX = Math.max(...frames.map((f, i) => offs[i].x + f.w));
  const maxY = Math.max(...frames.map((f, i) => offs[i].y + f.h));
  const W = maxX - minX, H = maxY - minY;
  return frames.map((f, i) => {
    const buf = new Uint8Array(W * H).fill(255);
    const ox = offs[i].x - minX, oy = offs[i].y - minY;
    for (let y = 0; y < f.h; y++) buf.set(f.data.subarray(y * f.w, (y + 1) * f.w), (y + oy) * W + ox);
    return { data: buf, w: W, h: H };
  });
}

const WHITE = 252; // grey >= WHITE -> fully transparent
const BLACK = 51; // grey <= BLACK -> fully opaque (the SVG lines are #333, the PNG lines #000)
const alphaOf = (g) => {
  const a = ((WHITE - g) / (WHITE - BLACK)) * 255;
  return a <= 0 ? 0 : a >= 255 ? 255 : a;
};

function inkBBox(g, thr = 40) {
  let x0 = g.w, y0 = g.h, x1 = -1, y1 = -1;
  for (let y = 0; y < g.h; y++) {
    const row = y * g.w;
    for (let x = 0; x < g.w; x++) {
      if (alphaOf(g.data[row + x]) > thr) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** crop (box may exceed the canvas -> white) */
function cropGrey(g, box) {
  const w = box.x1 - box.x0, h = box.y1 - box.y0;
  const out = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) {
    const sy = y + box.y0;
    if (sy < 0 || sy >= g.h) continue;
    const sx0 = Math.max(0, box.x0), sx1 = Math.min(g.w, box.x1);
    if (sx1 <= sx0) continue;
    out.set(g.data.subarray(sy * g.w + sx0, sy * g.w + sx1), y * w + (sx0 - box.x0));
  }
  return { data: out, w, h };
}

// ---------------------------------------------------------------- encode
async function encodeFrame(grey, outW, outH, budget) {
  // resize the greyscale (white = no ink), then turn it into black + alpha
  const resized = await sharp(Buffer.from(grey.data.buffer, grey.data.byteOffset, grey.data.length), {
    raw: { width: grey.w, height: grey.h, channels: 1 },
  })
    .resize(outW, outH, { kernel: 'lanczos3', fit: 'fill' })
    .greyscale() // keep a single channel in the raw output
    .raw()
    .toBuffer();
  const alpha = new Uint8Array(outW * outH);
  for (let i = 0; i < resized.length; i++) alpha[i] = Math.round(alphaOf(resized[i]));
  let last = null;
  // Lossless WebP (flat black + alpha). Only if a frame is over budget are the antialiasing
  // levels reduced (64, 32, 16 levels), which keeps the lines clean instead of blocky.
  for (const levels of [256, 64, 32, 16]) {
    const rgba = Buffer.alloc(outW * outH * 4); // RGB stays 0 (black)
    const q = 255 / (levels - 1);
    for (let i = 0; i < alpha.length; i++) rgba[i * 4 + 3] = levels === 256 ? alpha[i] : Math.round(Math.round(alpha[i] / q) * q);
    const buf = await sharp(rgba, { raw: { width: outW, height: outH, channels: 4 } })
      .webp({ lossless: true, effort: 6 })
      .toBuffer();
    last = { buf, levels };
    if (buf.length <= budget) break;
  }
  return last;
}

// ---------------------------------------------------------------- one entry
async function buildEntry(entry, source, opts) {
  const SVG_LONG = 1400;
  let frames, offs, reg = null;
  if (source.kind === 'svg') {
    // same px-per-user-unit for both frames, so frames on a shared viewBox come out identical in size
    const unit = SVG_LONG / Math.max(...source.viewBoxes.flatMap((v) => [v[2], v[3]]));
    frames = await Promise.all(
      source.files.map((f, i) => renderGrey(f, 'svg', source.viewBoxes[i], Math.max(source.viewBoxes[i][2], source.viewBoxes[i][3]) * unit)),
    );
  } else {
    frames = await Promise.all(source.files.map((f) => renderGrey(f, source.kind, null, 0)));
  }
  if (source.kind === 'svg' && source.sharedViewBox) {
    if (frames[0].w !== frames[1].w || frames[0].h !== frames[1].h) throw new Error('svg frames differ in size');
    offs = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  } else {
    reg = register(frames[0], frames[1]);
    offs = [{ x: 0, y: 0 }, { x: reg.dx, y: reg.dy }];
  }
  const [c1, c2] = toCanvas(frames, offs);

  const b1 = inkBBox(c1), b2 = inkBBox(c2);
  if (!b1 || !b2) throw new Error('empty frame');
  const u = { x0: Math.min(b1.x0, b2.x0), y0: Math.min(b1.y0, b2.y0), x1: Math.max(b1.x1, b2.x1), y1: Math.max(b1.y1, b2.y1) };
  let bw = u.x1 - u.x0, bh = u.y1 - u.y0;
  const pad = Math.max(6, Math.round(0.035 * Math.max(bw, bh)));
  let box = { x0: u.x0 - pad, y0: u.y0 - pad, x1: u.x1 + pad, y1: u.y1 + pad };
  bw = box.x1 - box.x0;
  bh = box.y1 - box.y0;
  // square-ish: keep the aspect ratio within 3:4 .. 4:3 by padding the short side (centered)
  if (bw / bh > 4 / 3) {
    const need = Math.round(bw * 0.75) - bh;
    box.y0 -= Math.floor(need / 2);
    box.y1 += Math.ceil(need / 2);
  } else if (bw / bh < 3 / 4) {
    const need = Math.round(bh * 0.75) - bw;
    box.x0 -= Math.floor(need / 2);
    box.x1 += Math.ceil(need / 2);
  }
  const f1 = cropGrey(c1, box), f2 = cropGrey(c2, box);
  const scale = opts.max / Math.max(f1.w, f1.h);
  const outW = Math.max(1, Math.round(f1.w * scale));
  const outH = Math.max(1, Math.round(f1.h * scale));

  const results = [];
  for (const [i, f] of [f1, f2].entries()) {
    const enc = await encodeFrame(f, outW, outH, opts.budget);
    results.push(enc);
  }
  return { outW, outH, results, reg, kind: source.kind };
}

// ---------------------------------------------------------------- main
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const all = JSON.parse(await fs.readFile(path.join(opts.src, 'exercises.json'), 'utf8'));

  // which Everkinetic ids to build
  let wanted;
  if (opts.ids) wanted = new Set(opts.ids);
  else if (opts.all) wanted = null;
  else {
    const media = JSON.parse(await fs.readFile(opts.media, 'utf8'));
    wanted = new Set();
    for (const m of media) for (const f of m.frames) {
      const mm = String(f).match(/\/everkinetic\/([^/]+)\//);
      if (mm) wanted.add(mm[1]);
    }
  }

  // one entry per id_num (id 0020 exists twice: prefer the one that has a source)
  const byId = new Map();
  for (const e of all) {
    if (wanted && !wanted.has(e.id_num)) continue;
    const src = await resolveSource(opts.src, e);
    if (!src) continue;
    if (!byId.has(e.id_num) || (src.kind === 'svg' && byId.get(e.id_num).source.kind !== 'svg')) byId.set(e.id_num, { entry: e, source: src });
  }
  if (wanted) for (const id of wanted) if (!byId.has(id)) console.warn(`! no source images for Everkinetic id ${id}`);

  const ids = [...byId.keys()].sort();
  let totalBytes = 0, over = 0, failed = 0, n = 0;
  const byKind = {};
  for (const id of ids) {
    const { entry, source } = byId.get(id);
    try {
      const r = await buildEntry(entry, source, opts);
      const dir = path.join(opts.out, id);
      await fs.mkdir(dir, { recursive: true });
      await Promise.all(r.results.map((res, i) => fs.writeFile(path.join(dir, `${i + 1}.webp`), res.buf)));
      const sizes = r.results.map((x) => x.buf.length);
      totalBytes += sizes[0] + sizes[1];
      if (sizes.some((s) => s > opts.budget)) over++;
      n++;
      byKind[r.kind] = (byKind[r.kind] || 0) + 1;
      if (!opts.quiet) {
        const regTxt = r.reg ? ` reg=(${r.reg.dx},${r.reg.dy}) score=${r.reg.score.toFixed(2)}` : '';
        console.log(`${id} ${entry.name.padEnd(48)} ${source.kind.padEnd(4)} ${r.outW}x${r.outH} ${(sizes[0] / 1024).toFixed(1)}K ${(sizes[1] / 1024).toFixed(1)}K lv=${r.results[0].levels}/${r.results[1].levels}${regTxt}`);
      }
    } catch (err) {
      failed++;
      console.error(`FAILED ${id} ${entry.name}: ${err.message}`);
    }
  }
  console.log(`\nBuilt ${n} entries (${n * 2} frames) into ${path.relative(REPO, opts.out) || opts.out}`);
  console.log(`  sources: ${Object.entries(byKind).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(`  total ${(totalBytes / 1024 / 1024).toFixed(2)} MB, avg ${(totalBytes / Math.max(1, n * 2) / 1024).toFixed(1)} KB/frame, ${over} entries with a frame over ${(opts.budget / 1024).toFixed(0)} KB, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
