// news-image-20261125: a front page summing up Wednesday 25 November 2026.
// Node 22, standard library only. Draws the whole image programmatically
// (PNG encoder + bitmap font + flat vector scenes, all written by hand),
// deterministic, no network at runtime.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;
const pxbuf = Buffer.alloc(W * H * 3);

function put(x: number, y: number, r: number, g: number, b: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  pxbuf[i] = r; pxbuf[i + 1] = g; pxbuf[i + 2] = b;
}

function fillRect(x: number, y: number, w: number, h: number, c: number[]): void {
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * W + xx) * 3;
      pxbuf[i] = c[0]; pxbuf[i + 1] = c[1]; pxbuf[i + 2] = c[2];
    }
  }
}

function frame(x: number, y: number, w: number, h: number, c: number[], t: number): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}

function disc(cx: number, cy: number, r: number, c: number[]): void {
  for (let y = -r; y <= r; y++) {
    const dx = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -dx; x <= dx; x++) put(cx + x, cy + y, c[0], c[1], c[2]);
  }
}

function ring(cx: number, cy: number, r: number, t: number, c: number[]): void {
  for (let a = 0; a < 360; a += 1) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < t; k++) {
      put(Math.round(cx + (r + k) * Math.cos(rad)), Math.round(cy + (r + k) * Math.sin(rad)), c[0], c[1], c[2]);
    }
  }
}

function line(x0: number, y0: number, x1: number, y1: number, c: number[], t = 1): void {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + (dx * s) / steps);
    const y = Math.round(y0 + (dy * s) / steps);
    for (let a = 0; a < t; a++) for (let b = 0; b < t; b++) put(x + a, y + b, c[0], c[1], c[2]);
  }
}

function poly(points: number[][], c: number[]): void {
  // scanline fill of a simple polygon
  let minY = Infinity, maxY = -Infinity;
  for (const p of points) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) put(x, y, c[0], c[1], c[2]);
    }
  }
}

function star(cx: number, cy: number, r1: number, r2: number, spikes: number, c: number[]): void {
  const pts: number[][] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? r1 : r2;
    const a = (i * Math.PI) / spikes - Math.PI / 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  poly(pts, c);
}

// Deterministic PRNG (mulberry32) for texture only.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- 5x7 bitmap font, uppercase only ----
const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  ';': ['00000', '01100', '01100', '00000', '01100', '00100', '01000'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '+': ['00000', '00100', '00100', '01110', '00100', '00100', '00000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '"': ['01010', '01010', '00000', '00000', '00000', '00000', '00000'],
  '*': ['00000', '10101', '01110', '10101', '00000', '00000', '00000'],
};

function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}

function drawText(x: number, y: number, s: string, scale: number, c: number[]): void {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = FONT[ch] ?? FONT['?'];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === '1') fillRect(cx + col * scale, y + r * scale, scale, scale, c);
      }
    }
    cx += 6 * scale;
  }
}

function drawTextCentered(cx: number, y: number, s: string, scale: number, c: number[]): void {
  drawText(cx - Math.floor(textWidth(s, scale) / 2), y, s, scale, c);
}

// Greedy word wrap; returns lines that fit maxW at the given scale.
function wrap(s: string, maxW: number, scale: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur === '' ? w : cur + ' ' + w;
    if (textWidth(trial, scale) <= maxW) { cur = trial; continue; }
    if (cur !== '') lines.push(cur);
    cur = w;
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

// ---- PNG encoder (filter 0, zlib) ----
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    pxbuf.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- palette ----
const INK = [18, 20, 26];
const PAPER = [246, 240, 224];
const PAPER2 = [232, 222, 200];
const RED = [178, 34, 28];
const NAVY = [16, 34, 66];
const NAVY2 = [24, 52, 96];
const GOLD = [196, 148, 44];
const TEAL = [18, 110, 108];
const SKY = [126, 178, 214];
const SKY2 = [178, 214, 235];
const SEA = [22, 68, 110];
const SEA2 = [42, 108, 150];
const SAND = [214, 188, 138];
const GREEN = [46, 110, 58];
const WHITE = [248, 248, 244];
const GREY = [90, 90, 88];
const ORANGE = [214, 106, 24];
const YELLOW = [232, 196, 64];

// ---- scenes: one flat-vector picture per story ----
function sky(sx: number, sy: number, sw: number, sh: number, top: number[], bot: number[]): void {
  const bands = 12;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const c = [0, 1, 2].map((k) => Math.round(top[k] + (bot[k] - top[k]) * t));
    fillRect(sx, sy + Math.floor((sh * i) / bands), sw, Math.ceil(sh / bands) + 1, c);
  }
}

function sea(sx: number, sy: number, sw: number, sh: number): void {
  sky(sx, sy, sw, sh, SEA2, SEA);
  for (let i = 0; i < 5; i++) {
    const y = sy + 12 + i * Math.floor(sh / 5);
    line(sx + 8 + (i % 2) * 20, y, sx + sw - 8 - ((i + 1) % 2) * 20, y, [190, 220, 235], 2);
  }
}

function ship(sx: number, sy: number, sw: number, sh: number, hull: number[], list: number): void {
  // cargo ship, slightly listing
  const hx = sx + Math.floor(sw * 0.12), hy = sy + Math.floor(sh * 0.55);
  const hw = Math.floor(sw * 0.76), hh = Math.floor(sh * 0.22);
  poly([[hx, hy], [hx + hw, hy], [hx + hw - 14, hy + hh], [hx + 10 + list, hy + hh]], hull);
  for (let i = 0; i < 4; i++) {
    const cx0 = hx + 12 + i * Math.floor(hw / 4.4);
    fillRect(cx0, hy - Math.floor(sh * 0.2), Math.floor(hw / 5.2), Math.floor(sh * 0.2), [200 + (i % 2) * 30, 90 + i * 20, 40 + i * 30]);
  }
  fillRect(hx + hw - 34, hy - Math.floor(sh * 0.34), 26, Math.floor(sh * 0.34), WHITE);
  line(hx + hw - 21, hy - Math.floor(sh * 0.42), hx + hw - 21, hy - Math.floor(sh * 0.34), INK, 3);
}

function explosion(cx: number, cy: number, r: number): void {
  star(cx, cy, r, Math.floor(r * 0.45), 8, ORANGE);
  star(cx, cy, Math.floor(r * 0.7), Math.floor(r * 0.3), 8, YELLOW);
  disc(cx, cy, Math.floor(r * 0.35), [255, 240, 180]);
  disc(cx - r, cy - Math.floor(r * 0.4), Math.floor(r * 0.3), [120, 120, 118]);
  disc(cx + r, cy - Math.floor(r * 0.6), Math.floor(r * 0.25), [120, 120, 118]);
  disc(cx, cy - r, Math.floor(r * 0.28), [105, 105, 103]);
}

function sceneUkraine(sx: number, sy: number, sw: number, sh: number): void {
  sky(sx, sy, sw, Math.floor(sh * 0.55), SKY2, SKY);
  disc(sx + sw - 30, sy + 26, 16, [255, 244, 200]);
  sea(sx, sy + Math.floor(sh * 0.55), sw, sh - Math.floor(sh * 0.55));
  ship(sx, sy + Math.floor(sh * 0.3), sw, Math.floor(sh * 0.6), [60, 60, 66], 6);
  explosion(sx + Math.floor(sw * 0.72), sy + Math.floor(sh * 0.42), 34);
  // drone above the ship
  const dx = sx + Math.floor(sw * 0.3), dy = sy + Math.floor(sh * 0.22);
  fillRect(dx - 10, dy - 3, 20, 6, INK);
  line(dx - 16, dy - 8, dx + 16, dy - 8, INK, 2);
  line(dx - 16, dy + 8, dx + 16, dy + 8, INK, 2);
  disc(dx - 16, dy - 8, 3, GREY); disc(dx + 16, dy - 8, 3, GREY);
  disc(dx - 16, dy + 8, 3, GREY); disc(dx + 16, dy + 8, 3, GREY);
  line(dx, dy + 4, dx + Math.floor(sw * 0.18), dy + Math.floor(sh * 0.18), RED, 2);
}

function sceneCOP(sx: number, sy: number, sw: number, sh: number): void {
  sky(sx, sy, sw, sh, [250, 226, 170], [232, 190, 120]);
  disc(sx + Math.floor(sw * 0.5), sy + 34, 22, [255, 214, 120]);
  // globe
  disc(sx + Math.floor(sw * 0.24), sy + Math.floor(sh * 0.62), 34, TEAL);
  disc(sx + Math.floor(sw * 0.24) - 8, sy + Math.floor(sh * 0.62) - 10, 10, GREEN);
  disc(sx + Math.floor(sw * 0.24) + 10, sy + Math.floor(sh * 0.62) + 10, 8, GREEN);
  ring(sx + Math.floor(sw * 0.24), sy + Math.floor(sh * 0.62), 34, 2, WHITE);
  // summit hall with columns and flags
  const bx = sx + Math.floor(sw * 0.48), by = sy + sh - 58;
  fillRect(bx, by, Math.floor(sw * 0.48), 58, NAVY2);
  poly([[bx - 8, by], [bx + Math.floor(sw * 0.48) + 8, by], [bx + Math.floor(sw * 0.24), by - 26]], RED);
  for (let i = 0; i < 5; i++) {
    const cx0 = bx + 10 + i * Math.floor((sw * 0.48 - 20) / 5);
    fillRect(cx0, by + 8, 8, 44, WHITE);
  }
  for (let i = 0; i < 6; i++) {
    const fx = sx + 10 + i * 22;
    line(fx, sy + sh - 22, fx, sy + sh - 44, INK, 2);
    fillRect(fx, sy + sh - 44, 16, 10, [150 + i * 12, 60 + i * 10, 50]);
  }
  // red X over a pact document
  fillRect(sx + sw - 66, sy + 12, 54, 40, WHITE);
  frame(sx + sw - 66, sy + 12, 54, 40, INK, 2);
  line(sx + sw - 60, sy + 20, sx + sw - 24, sy + 20, GREY, 2);
  line(sx + sw - 60, sy + 28, sx + sw - 24, sy + 28, GREY, 2);
  line(sx + sw - 58, sy + 34, sx + sw - 22, sy + 48, RED, 4);
  line(sx + sw - 22, sy + 34, sx + sw - 58, sy + 48, RED, 4);
}

function sceneRiyadh(sx: number, sy: number, sw: number, sh: number): void {
  sky(sx, sy, sw, sh, [64, 48, 70], [214, 130, 60]);
  // Kingdom Centre style tower: tall slab with an arch opening
  const tx = sx + Math.floor(sw * 0.36), tw = Math.floor(sw * 0.28);
  fillRect(tx, sy + 18, tw, sh - 18, [52, 58, 74]);
  poly([[tx, sy + 18], [tx + tw, sy + 18], [tx + Math.floor(tw * 0.72), sy + 44], [tx + Math.floor(tw * 0.28), sy + 44]], [52, 58, 74]);
  disc(tx + Math.floor(tw / 2), sy + 44, Math.floor(tw * 0.22), [214, 130, 60]);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 4; c++) {
      fillRect(tx + 8 + c * Math.floor((tw - 16) / 4), sy + 58 + r * 11, 8, 6, [240, 200, 110]);
    }
  }
  // smaller towers
  fillRect(sx + 12, sy + sh - 66, 44, 66, [70, 66, 80]);
  fillRect(sx + sw - 60, sy + sh - 84, 48, 84, [70, 66, 80]);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 2; c++) {
    fillRect(sx + 20 + c * 18, sy + sh - 58 + r * 10, 8, 5, [240, 200, 110]);
    fillRect(sx + sw - 52 + c * 18, sy + sh - 76 + r * 10, 8, 5, [240, 200, 110]);
  }
  // smoke and fire at the tower top
  disc(tx + Math.floor(tw / 2) - 18, sy + 26, 14, [110, 110, 108]);
  disc(tx + Math.floor(tw / 2) + 6, sy + 12, 18, [95, 95, 93]);
  disc(tx + Math.floor(tw / 2) + 22, sy + 30, 12, [120, 120, 118]);
  star(tx + Math.floor(tw / 2), sy + 52, 16, 7, 6, ORANGE);
  // street lights
  for (let i = 0; i < 4; i++) {
    disc(sx + 30 + i * Math.floor(sw / 4), sy + sh - 8, 3, RED);
    disc(sx + 44 + i * Math.floor(sw / 4), sy + sh - 8, 3, [40, 120, 220]);
  }
}

function sceneBenghazi(sx: number, sy: number, sw: number, sh: number): void {
  sky(sx, sy, sw, Math.floor(sh * 0.45), SKY2, [200, 190, 160]);
  sea(sx, sy + Math.floor(sh * 0.45), sw, sh - Math.floor(sh * 0.45));
  // warship listing hard to starboard, bow down
  const hx = sx + Math.floor(sw * 0.14), hy = sy + Math.floor(sh * 0.5);
  poly([[hx, hy], [hx + Math.floor(sw * 0.7), hy + 22], [hx + Math.floor(sw * 0.66), hy + 52], [hx + 8, hy + 44]], [84, 88, 92]);
  fillRect(hx + Math.floor(sw * 0.3), hy - 16, 30, 18, [100, 104, 108]);
  line(hx + Math.floor(sw * 0.42), hy - 16, hx + Math.floor(sw * 0.42), hy - 34, INK, 3);
  disc(hx + Math.floor(sw * 0.58), hy + 8, 16, [110, 110, 108]);
  disc(hx + Math.floor(sw * 0.62), hy - 8, 12, [95, 95, 93]);
  star(hx + Math.floor(sw * 0.55), hy + 2, 14, 6, 6, ORANGE);
  // waves washing over the deck
  line(sx + 6, sy + sh - 16, sx + sw - 6, sy + sh - 16, WHITE, 2);
  line(sx + 20, sy + sh - 26, sx + sw - 30, sy + sh - 26, [190, 220, 235], 2);
}

function sceneCyber(sx: number, sy: number, sw: number, sh: number): void {
  fillRect(sx, sy, sw, sh, [12, 16, 26]);
  // server racks
  for (let i = 0; i < 3; i++) {
    const rx = sx + 12 + i * Math.floor((sw - 24) / 3);
    fillRect(rx, sy + 14, Math.floor((sw - 24) / 3) - 8, sh - 28, [28, 34, 48]);
    frame(rx, sy + 14, Math.floor((sw - 24) / 3) - 8, sh - 28, [70, 80, 100], 2);
    for (let r = 0; r < 6; r++) {
      fillRect(rx + 6, sy + 22 + r * 16, Math.floor((sw - 24) / 3) - 20, 4, r % 2 ? [60, 200, 90] : RED);
    }
  }
  // big padlock, broken open
  const px = sx + Math.floor(sw * 0.5), py = sy + Math.floor(sh * 0.5);
  ring(px, py - 18, 20, 5, YELLOW);
  line(px + 14, py - 30, px + 26, py - 44, YELLOW, 5);
  fillRect(px - 26, py - 8, 52, 44, YELLOW);
  disc(px, py + 8, 7, INK);
  fillRect(px - 3, py + 8, 6, 14, INK);
  // warning triangle
  poly([[sx + sw - 34, sy + 12], [sx + sw - 8, sy + 12], [sx + sw - 21, sy + 34]], YELLOW);
  drawText(sx + sw - 26, sy + 16, '!', 1, INK);
  drawText(sx + 10, sy + sh - 18, 'ACCESS DENIED', 1, RED);
}

function sceneHuawei(sx: number, sy: number, sw: number, sh: number): void {
  sky(sx, sy, sw, sh, SKY2, [210, 205, 180]);
  // courthouse
  const bx = sx + 10, by = sy + sh - 78;
  fillRect(bx, by, sw - 20, 78, [232, 224, 200]);
  poly([[bx - 6, by], [bx + sw - 14, by], [sx + Math.floor(sw / 2), by - 30]], NAVY2);
  for (let i = 0; i < 4; i++) {
    const cx0 = bx + 12 + i * Math.floor((sw - 44) / 4);
    fillRect(cx0, by + 10, 10, 60, WHITE);
  }
  fillRect(sx + Math.floor(sw / 2) - 22, by + 34, 44, 36, [60, 50, 44]);
  // gavel
  const gx = sx + Math.floor(sw * 0.5), gy = sy + 34;
  line(gx - 26, gy + 10, gx + 26, gy - 10, [90, 60, 30], 8);
  line(gx + 8, gy + 2, gx + 30, gy + 26, [90, 60, 30], 5);
  fillRect(gx - 34, gy + 22, 68, 6, [90, 60, 30]);
}

function sceneWHO(sx: number, sy: number, sw: number, sh: number): void {
  sky(sx, sy, sw, sh, [235, 220, 190], SKY2);
  // hospital building with a red cross
  const bx = sx + 12, by = sy + sh - 84;
  fillRect(bx, by, Math.floor(sw * 0.62), 84, WHITE);
  frame(bx, by, Math.floor(sw * 0.62), 84, INK, 2);
  fillRect(bx + Math.floor(sw * 0.31) - 18, by - 26, 36, 26, WHITE);
  frame(bx + Math.floor(sw * 0.31) - 18, by - 26, 36, 26, INK, 2);
  fillRect(bx + Math.floor(sw * 0.31) - 4, by - 22, 8, 18, RED);
  fillRect(bx + Math.floor(sw * 0.31) - 10, by - 16, 20, 8, RED);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    fillRect(bx + 10 + c * 30, by + 12 + r * 20, 16, 12, SKY);
  }
  // ambulance leaving
  const ax = sx + Math.floor(sw * 0.62) + 6, ay = sy + sh - 40;
  fillRect(ax, ay, 52, 24, WHITE);
  frame(ax, ay, 52, 24, RED, 2);
  fillRect(ax + 22, ay + 8, 8, 8, RED);
  disc(ax + 12, ay + 26, 6, INK); disc(ax + 40, ay + 26, 6, INK);
  line(ax + 52, ay + 12, sx + sw - 8, ay + 12, RED, 2);
  // tents and trees behind
  poly([[sx + 8, sy + sh - 84], [sx + 30, sy + sh - 108], [sx + 52, sy + sh - 84]], [200, 180, 120]);
  disc(sx + sw - 24, sy + 22, 14, GREEN);
  disc(sx + sw - 44, sy + 30, 10, GREEN);
}

function sceneNATO(sx: number, sy: number, sw: number, sh: number): void {
  sky(sx, sy, sw, sh, SKY, SKY2);
  disc(sx + sw - 28, sy + 24, 14, [255, 244, 200]);
  // radar rings
  ring(sx + Math.floor(sw * 0.5), sy + sh - 30, 26, 2, TEAL);
  ring(sx + Math.floor(sw * 0.5), sy + sh - 30, 40, 2, TEAL);
  line(sx + Math.floor(sw * 0.5), sy + sh - 30, sx + Math.floor(sw * 0.5) + 34, sy + sh - 62, TEAL, 2);
  // AWACS plane with radar dome
  const px = sx + Math.floor(sw * 0.5), py = sy + Math.floor(sh * 0.38);
  poly([[px - 64, py], [px + 64, py - 4], [px + 78, py + 4], [px - 50, py + 10]], [200, 204, 208]);
  fillRect(px - 64, py - 2, 138, 9, [200, 204, 208]);
  poly([[px - 10, py - 2], [px + 20, py - 2], [px + 6, py - 22], [px - 2, py - 22]], [180, 184, 188]);
  disc(px + 2, py - 26, 16, [120, 126, 132]);
  line(px + 2, py - 10, px + 2, py - 26, INK, 2);
  poly([[px - 30, py + 8], [px - 44, py + 26], [px - 26, py + 10]], [160, 164, 168]);
  // Polish flag
  fillRect(sx + 12, sy + sh - 34, 40, 12, WHITE);
  fillRect(sx + 12, sy + sh - 22, 40, 12, RED);
  frame(sx + 12, sy + sh - 34, 40, 24, INK, 1);
  drawText(sx + 60, sy + sh - 30, 'POLAND', 1, NAVY);
  // small jets in formation
  for (let i = 0; i < 2; i++) {
    const jx = sx + 26 + i * 34, jy = sy + 26 + i * 14;
    poly([[jx, jy], [jx + 18, jy + 3], [jx, jy + 6]], GREY);
  }
}

function sceneHormuz(sx: number, sy: number, sw: number, sh: number): void {
  sky(sx, sy, sw, Math.floor(sh * 0.4), [240, 200, 140], SKY2);
  // cliffs of the strait on both sides
  poly([[sx, sy + 40], [sx + 34, sy + 40], [sx + 20, sy + sh], [sx, sy + sh]], [150, 120, 84]);
  poly([[sx + sw, sy + 40], [sx + sw - 34, sy + 40], [sx + sw - 20, sy + sh], [sx + sw, sy + sh]], [150, 120, 84]);
  sea(sx, sy + Math.floor(sh * 0.4), sw, sh - Math.floor(sh * 0.4));
  // three tankers in a line
  for (let i = 0; i < 3; i++) {
    const tx = sx + 30 + i * Math.floor((sw - 90) / 3);
    const ty = sy + Math.floor(sh * 0.52) + (i % 2) * 26;
    poly([[tx, ty], [tx + 62, ty], [tx + 54, ty + 18], [tx + 8, ty + 18]], i === 1 ? [150, 60, 50] : [40, 60, 80]);
    fillRect(tx + 8, ty - 14, 16, 14, WHITE);
    fillRect(tx + 30, ty - 10, 10, 10, [200, 200, 190]);
    line(tx + 38, ty - 10, tx + 38, ty - 22, INK, 2);
  }
  // naval mine, spiked ball
  const mx = sx + Math.floor(sw * 0.5), my = sy + Math.floor(sh * 0.82);
  disc(mx, my, 12, INK);
  for (let a = 0; a < 8; a++) {
    const rad = (a * Math.PI) / 4;
    line(mx, my, Math.round(mx + 18 * Math.cos(rad)), Math.round(my + 18 * Math.sin(rad)), INK, 2);
  }
  explosion(sx + Math.floor(sw * 0.78), sy + Math.floor(sh * 0.6), 20);
}

function sceneSarkozy(sx: number, sy: number, sw: number, sh: number): void {
  sky(sx, sy, sw, sh, SKY2, [214, 208, 190]);
  // French flag
  fillRect(sx + 12, sy + 12, 14, 26, [0, 60, 140]);
  fillRect(sx + 26, sy + 12, 14, 26, WHITE);
  fillRect(sx + 40, sy + 12, 14, 26, RED);
  frame(sx + 12, sy + 12, 42, 26, INK, 1);
  // courthouse
  const bx = sx + 12, by = sy + sh - 80;
  fillRect(bx, by, sw - 24, 80, [226, 216, 188]);
  poly([[bx - 6, by], [bx + sw - 18, by], [sx + Math.floor(sw / 2), by - 28]], NAVY2);
  for (let i = 0; i < 4; i++) {
    const cx0 = bx + 14 + i * Math.floor((sw - 52) / 4);
    fillRect(cx0, by + 10, 10, 62, WHITE);
  }
  fillRect(sx + Math.floor(sw / 2) - 20, by + 36, 40, 36, [60, 50, 44]);
  // gavel on the steps
  const gx = sx + Math.floor(sw * 0.5), gy = sy + 58;
  line(gx - 24, gy + 8, gx + 24, gy - 8, [90, 60, 30], 7);
  line(gx + 6, gy, gx + 26, gy + 22, [90, 60, 30], 5);
  fillRect(gx - 30, gy + 18, 60, 5, [90, 60, 30]);
}

function sceneCricket(sx: number, sy: number, sw: number, sh: number): void {
  sky(sx, sy, sw, sh, SKY2, [200, 226, 240]);
  // green outfield
  fillRect(sx, sy + Math.floor(sh * 0.55), sw, sh - Math.floor(sh * 0.55), GREEN);
  fillRect(sx, sy + Math.floor(sh * 0.55), sw, 4, [70, 140, 80]);
  // pitch strip
  poly([[sx + Math.floor(sw * 0.42), sy + Math.floor(sh * 0.55)], [sx + Math.floor(sw * 0.58), sy + Math.floor(sh * 0.55)], [sx + Math.floor(sw * 0.66), sy + sh], [sx + Math.floor(sw * 0.34), sy + sh]], [214, 188, 138]);
  // stumps
  for (let i = 0; i < 3; i++) line(sx + Math.floor(sw * 0.46) + i * 6, sy + sh - 46, sx + Math.floor(sw * 0.46) + i * 6, sy + sh - 66, YELLOW, 3);
  // bat and ball
  line(sx + Math.floor(sw * 0.3), sy + sh - 30, sx + Math.floor(sw * 0.38), sy + sh - 78, [120, 84, 44], 8);
  disc(sx + Math.floor(sw * 0.62), sy + sh - 60, 7, RED);
  // scoreboard
  fillRect(sx + 10, sy + 10, 96, 44, INK);
  frame(sx + 10, sy + 10, 96, 44, GOLD, 2);
  drawText(sx + 16, sy + 16, 'ENG WIN', 1, YELLOW);
  drawText(sx + 16, sy + 32, 'BY 8 WKT', 1, WHITE);
  // crowd dots
  const rnd = mulberry32(25);
  for (let i = 0; i < 60; i++) {
    const cx = sx + Math.floor(rnd() * sw), cy = sy + Math.floor(sh * 0.42) + Math.floor(rnd() * 12);
    disc(cx, cy, 2, [40 + Math.floor(rnd() * 180), 40 + Math.floor(rnd() * 120), 40 + Math.floor(rnd() * 120)]);
  }
}

// ---- panel assembly ----
function panel(
  x: number, y: number, w: number, h: number,
  tag: string, scene: (sx: number, sy: number, sw: number, sh: number) => void,
  headline: string, caption: string, hero: boolean,
): void {
  fillRect(x, y, w, h, PAPER);
  frame(x, y, w, h, INK, 2);
  const sceneH = hero ? 148 : 132;
  scene(x + 2, y + 2, w - 4, sceneH, );
  // tag chip
  const tw = textWidth(tag, 1) + 12;
  fillRect(x + 6, y + 6, tw, 14, RED);
  drawText(x + 12, y + 9, tag, 1, WHITE);
  // headline + caption
  const tx = x + 10, maxW = w - 20;
  const hl = wrap(headline, maxW, 2);
  let ty = y + sceneH + 12;
  for (const ln of hl) { drawText(tx, ty, ln, 2, INK); ty += 17; }
  const capScale = hero ? 2 : 1;
  const cl = wrap(caption, maxW, capScale);
  ty += 2;
  for (const ln of cl) { drawText(tx, ty, ln, capScale, GREY); ty += capScale === 2 ? 17 : 10; }
}

// ---- grain: deterministic paper texture, lifts the file into the dense range ----
function grain(): void {
  const rnd = mulberry32(20261125);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = rnd();
      if (r < 0.22) {
        const i = (y * W + x) * 3;
        const d = Math.floor(rnd() * 11) - 5;
        pxbuf[i] = Math.max(0, Math.min(255, pxbuf[i] + d));
        pxbuf[i + 1] = Math.max(0, Math.min(255, pxbuf[i + 1] + d));
        pxbuf[i + 2] = Math.max(0, Math.min(255, pxbuf[i + 2] + d));
      }
    }
  }
}

function main(): void {
  fillRect(0, 0, W, H, PAPER);
  frame(0, 0, W, H, INK, 8);

  // ---- masthead ----
  fillRect(8, 8, W - 16, 116, NAVY);
  fillRect(8, 120, W - 16, 4, GOLD);
  drawTextCentered(512, 20, 'THE WORLD IN ONE DAY', 3, GOLD);
  drawTextCentered(512, 48, 'WEDNESDAY 25 NOVEMBER 2026', 4, WHITE);
  drawTextCentered(512, 84, '11 STORIES - 7 REGIONS - ONE DAY', 2, [200, 210, 230]);
  drawTextCentered(512, 104, 'GULF STRIKE - COP31 ENDS WITHOUT A PACT - RIYADH TOWER HIT', 2, YELLOW);

  // ---- hero row: the three biggest stories ----
  panel(8, 132, 328, 266, 'EUROPE', sceneUkraine,
    'UKRAINE DRONE HITS RUSSIAN SHIP', 'GULF OF FINLAND - ZELENSKIY CONFIRMS', true);
  panel(348, 132, 328, 266, 'CLIMATE', sceneCOP,
    'COP31 ENDS WITH NO DEAL', 'ANTALYA - OIL STATES BLOCK PHASEOUT', true);
  panel(688, 132, 328, 266, 'MIDDLE EAST', sceneRiyadh,
    'RIYADH TOWER HIT', 'HOUTHI STRIKE - 11 WOUNDED', true);

  // ---- middle row ----
  panel(8, 406, 248, 284, 'MEDITERRANEAN', sceneBenghazi,
    'RUSSIAN WARSHIP SUNK', 'OFF BENGHAZI, LIBYA', false);
  panel(264, 406, 248, 284, 'USA', sceneCyber,
    'CIA AND SPY CHIEF HIT BY CYBERATTACK', 'WASHINGTON - SYSTEMS TARGETED', false);
  panel(520, 406, 248, 284, 'COURTS', sceneHuawei,
    'HUAWEI GUILTY ON 10 OF 12 COUNTS', 'NEW YORK JURY - TRADE SECRET THEFT', false);
  panel(776, 406, 248, 284, 'AFRICA', sceneWHO,
    'WHO PULLS STAFF FROM HOSPITAL', 'AKWE, ITURI, DR CONGO - EBOLA AND FIGHTING', false);

  // ---- bottom row ----
  panel(8, 698, 248, 288, 'EUROPE', sceneNATO,
    'NATO SENDS EARLY WARNING JETS TO POLAND', 'POLAND - ALLIANCE AIR WATCH', false);
  panel(264, 698, 248, 288, 'ENERGY', sceneHormuz,
    'THREE TANKERS HIT BY MINES', 'STRAIT OF HORMUZ', false);
  panel(520, 698, 248, 288, 'EUROPE', sceneSarkozy,
    'SARKOZY CORRUPTION CASE GOES TO TRIAL', 'PARIS - FORMER PRESIDENT', false);
  panel(776, 698, 248, 288, 'SPORT', sceneCricket,
    'ENGLAND BEAT AUSTRALIA BY 8 WICKETS', '2ND T20 INTERNATIONAL', false);

  // ---- footer ----
  drawTextCentered(512, 996, 'ALL 11 STORIES WERE REPORTED ON 25 NOVEMBER 2026', 1, GREY);

  grain();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), encodePNG());
}

main();
