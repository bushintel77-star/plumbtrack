#!/usr/bin/env node
/**
 * PlumbTrack PWA icon generator — zero dependencies, pure Node.
 *
 * Draws the brand mark (orange water droplet on a near-black rounded square,
 * with a soft top-light gradient and a specular highlight) and writes the
 * icons the manifest + iOS standalone mode need:
 *
 *   public/icon-192.png             manifest "any"       (transparent corners)
 *   public/icon-512.png             manifest "any"
 *   public/icon-512-maskable.png    manifest "maskable"  (full-bleed background)
 *   public/apple-touch-icon.png     iOS home screen      (full-bleed, 180px)
 *   public/favicon.png              browser tab          (32px)
 *
 * Renders at 4× supersampling per axis so edges stay clean at every size.
 *
 * Usage: node scripts/gen-icons.mjs   (or `pnpm icons:gen` in apps/web)
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public");

/* ── Palette (matches the app's design tokens) ──────────────────────────── */
const BG_TOP = [30, 36, 48]; // slate-850-ish — subtle top light
const BG_BOTTOM = [10, 10, 12]; // --page-bg
const ACCENT = [232, 135, 30]; // #E8871E
const ACCENT_HI = [250, 178, 92]; // lighter orange toward the top

/* ── Minimal PNG encoder (8-bit RGBA) ───────────────────────────────────── */
let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ── Shape maths (normalised 0..1 coords, y-down) ───────────────────────── */
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

function inRoundedRect(px, py, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(px, x1 - r));
  const cy = Math.max(y0 + r, Math.min(py, y1 - r));
  return dist(px, py, cx, cy) <= r;
}

function sample(px, py, mode) {
  // Background — vertical gradient, full-bleed for square modes, rounded
  // rect with transparent corners otherwise.
  let inBg = false;
  if (mode === "square") {
    inBg = true;
  } else {
    const inset = 0.06;
    inBg = inRoundedRect(px, py, inset, inset, 1 - inset, 1 - inset, 0.2);
  }
  if (!inBg) return [0, 0, 0, 0];

  const t = Math.max(0, Math.min(1, py));
  let r = lerp(BG_TOP[0], BG_BOTTOM[0], t);
  let g = lerp(BG_TOP[1], BG_BOTTOM[1], t);
  let b = lerp(BG_TOP[2], BG_BOTTOM[2], t);
  let a = 1;

  // Droplet: circle body + tapering tail (classic teardrop).
  const cx = 0.5;
  const cy = 0.37;
  const rad = 0.205;
  const baseY = 0.465;
  const halfW = Math.sqrt(rad * rad - (baseY - cy) * (baseY - cy));
  const tipY = 0.865;
  const inCircle = dist(px, py, cx, cy) <= rad;
  const halfAtPy = halfW * ((tipY - py) / (tipY - baseY));
  const inTail = py >= baseY && py <= tipY && Math.abs(px - cx) <= halfAtPy;

  if (inCircle || inTail) {
    // Vertical shading — brighter at the top of the droplet.
    const shade = Math.max(0, Math.min(1, (0.52 - py) / 0.28));
    r = lerp(ACCENT[0], ACCENT_HI[0], shade);
    g = lerp(ACCENT[1], ACCENT_HI[1], shade);
    b = lerp(ACCENT[2], ACCENT_HI[2], shade);

    // Specular highlight (small soft white spot, upper-left).
    const hx = 0.415;
    const hy = 0.285;
    const hr = 0.055;
    const d = dist(px, py, hx, hy);
    if (d <= hr) {
      const h = 0.85 * (1 - d / hr);
      r = lerp(r, 255, h);
      g = lerp(g, 255, h);
      b = lerp(b, 255, h);
    }
  }

  // Subtle inner edge light on the rounded-rect boundary (depth).
  if (mode !== "square") {
    const inset = 0.06;
    const nearEdge =
      Math.min(px - inset, 1 - inset - px, py - inset, 1 - inset - py) < 0.018;
    if (nearEdge) {
      const e = 0.10;
      r = lerp(r, 255, e);
      g = lerp(g, 255, e);
      b = lerp(b, 255, e);
    }
  }

  return [r, g, b, a];
}

/* ── Supersampled renderer ──────────────────────────────────────────────── */
function render(size, mode) {
  const S = 4;
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = (x + (sx + 0.5) / S) / size;
          const py = (y + (sy + 0.5) / S) / size;
          const [cr, cg, cb, ca] = sample(px, py, mode);
          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }
      const n = S * S;
      const i = (y * size + x) * 4;
      out[i] = Math.round(r / n);
      out[i + 1] = Math.round(g / n);
      out[i + 2] = Math.round(b / n);
      out[i + 3] = Math.round((a / n) * 255);
    }
  }
  return Buffer.from(out);
}

/* ── Emit ───────────────────────────────────────────────────────────────── */
const targets = [
  { file: "icon-192.png", size: 192, mode: "rounded" },
  { file: "icon-512.png", size: 512, mode: "rounded" },
  { file: "icon-512-maskable.png", size: 512, mode: "square" },
  { file: "apple-touch-icon.png", size: 180, mode: "square" },
  { file: "favicon.png", size: 32, mode: "rounded" },
];

for (const { file, size, mode } of targets) {
  const png = encodePng(size, render(size, mode));
  writeFileSync(resolve(OUT, file), png);
  console.log(`✓ ${file} (${size}×${size}, ${Math.round(png.length / 1024)} KB)`);
}
console.log(`\nIcons written to ${OUT}`);
