/**
 * Procedural, tileable PBR texture painters. Every texture in the MVP is generated
 * at runtime from code in this file (original work, CC0), so no third-party image
 * is shipped or hotlinked. Resolution follows the active quality profile's asset tier.
 */

export interface PaintedTexture {
  color: HTMLCanvasElement;
  normal: HTMLCanvasElement;
  gloss: HTMLCanvasElement;
}

type RGB = [number, number, number];

/** Deterministic hash -> [0,1) */
function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Tileable value-noise fBm field, period = size. */
export class NoiseField {
  readonly data: Float32Array;
  constructor(readonly size: number, seed: number, baseCells = 4, octaves = 5) {
    const d = new Float32Array(size * size);
    let amp = 1;
    let total = 0;
    for (let o = 0; o < octaves; o++) {
      const cells = baseCells << o;
      const step = size / cells;
      for (let y = 0; y < size; y++) {
        const gy = y / step;
        const y0 = Math.floor(gy);
        const fy = gy - y0;
        const sy = fy * fy * (3 - 2 * fy);
        for (let x = 0; x < size; x++) {
          const gx = x / step;
          const x0 = Math.floor(gx);
          const fx = gx - x0;
          const sx = fx * fx * (3 - 2 * fx);
          const a = hash2(x0 % cells, y0 % cells, seed + o);
          const b = hash2((x0 + 1) % cells, y0 % cells, seed + o);
          const c = hash2(x0 % cells, (y0 + 1) % cells, seed + o);
          const e = hash2((x0 + 1) % cells, (y0 + 1) % cells, seed + o);
          d[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy);
        }
      }
      total += amp;
      amp *= 0.5;
    }
    for (let i = 0; i < d.length; i++) d[i] /= total;
    this.data = d;
  }

  /** Wrapped sample at integer pixel coords (any scale/offset) */
  at(x: number, y: number): number {
    const s = this.size;
    const xi = ((Math.floor(x) % s) + s) % s;
    const yi = ((Math.floor(y) % s) + s) % s;
    return this.data[yi * s + xi];
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

function canvas(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

export interface Fields {
  a: NoiseField;
  b: NoiseField;
  fine: NoiseField;
}

let sharedFields: Fields | null = null;
export function noiseFields(size: number): Fields {
  if (!sharedFields || sharedFields.a.size !== size) {
    sharedFields = {
      a: new NoiseField(size, 11, 4, 5),
      b: new NoiseField(size, 37, 8, 4),
      fine: new NoiseField(size, 73, 32, 3),
    };
  }
  return sharedFields;
}

/** Sample function returns albedo (0..1 linear-ish sRGB), height (0..1) and gloss (0..1). */
export type Sampler = (u: number, v: number, f: Fields, size: number) => { c: RGB; h: number; g: number };

export function paint(size: number, sampler: Sampler, normalStrength = 2.0): PaintedTexture {
  const f = noiseFields(size);
  const color = canvas(size);
  const normal = canvas(size);
  const gloss = canvas(size);
  const cctx = color.getContext('2d')!;
  const nctx = normal.getContext('2d')!;
  const gctx = gloss.getContext('2d')!;
  const ci = cctx.createImageData(size, size);
  const ni = nctx.createImageData(size, size);
  const gi = gctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = sampler(x, y, f, size);
      const i = y * size + x;
      height[i] = s.h;
      ci.data[i * 4] = clamp01(s.c[0]) * 255;
      ci.data[i * 4 + 1] = clamp01(s.c[1]) * 255;
      ci.data[i * 4 + 2] = clamp01(s.c[2]) * 255;
      ci.data[i * 4 + 3] = 255;
      const gv = clamp01(s.g) * 255;
      gi.data[i * 4] = gi.data[i * 4 + 1] = gi.data[i * 4 + 2] = gv;
      gi.data[i * 4 + 3] = 255;
    }
  }
  const k = normalStrength * (size / 256);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = height[y * size + ((x - 1 + size) % size)];
      const r = height[y * size + ((x + 1) % size)];
      const u = height[((y - 1 + size) % size) * size + x];
      const d = height[((y + 1) % size) * size + x];
      let nx = (l - r) * k;
      let ny = (d - u) * k;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * size + x) * 4;
      ni.data[i] = (nx * 0.5 + 0.5) * 255;
      ni.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      ni.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      ni.data[i + 3] = 255;
    }
  }
  cctx.putImageData(ci, 0, 0);
  nctx.putImageData(ni, 0, 0);
  gctx.putImageData(gi, 0, 0);
  return { color, normal, gloss };
}

const hex = (h: string): RGB => {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// ---------------------------------------------------------------------------
// Painters
// ---------------------------------------------------------------------------

export function planks(base: string, wet = 0.6, count = 6): Sampler {
  const b = hex(base);
  return (x, y, f, s) => {
    const row = Math.floor((y / s) * count);
    const rv = (y / s) * count - row;
    const tint = 0.75 + hash2(row, 3, 9) * 0.5;
    const offs = hash2(row, 1, 5) * s;
    const grain = f.b.at((x + offs) * 0.25, y * 4) * 0.6 + f.fine.at(x + offs, y * 3) * 0.4;
    const gap = smooth(0.0, 0.06, rv) * smooth(1.0, 0.94, rv);
    const joint = Math.abs(((x + offs) % s) / s - 0.5) < 0.004 ? 0.3 : 1;
    const dirt = f.a.at(x, y);
    const c: RGB = mix(b.map((v) => v * tint * (0.7 + grain * 0.6)) as RGB, [0.06, 0.05, 0.04], (1 - gap) * 0.85 + dirt * 0.25);
    const h = gap * joint * (0.8 + grain * 0.2);
    return { c: c.map((v) => v * joint) as RGB, h, g: lerp(0.35, 0.82, wet) * (0.75 + dirt * 0.4) * gap };
  };
}

export function corrugated(base: string, rust = 0.5, ribs = 10): Sampler {
  const b = hex(base);
  const r1 = hex('#6b3418');
  const r2 = hex('#3a2010');
  return (x, y, f, s) => {
    const wave = 0.5 + 0.5 * Math.sin((x / s) * ribs * Math.PI * 2);
    const n = f.a.at(x, y);
    const rmask = smooth(1 - rust, 1 - rust + 0.18, n * 0.7 + f.fine.at(x, y) * 0.3 + (y / s) * 0.15);
    const streak = f.b.at(x * 2, y * 0.15);
    let c = mix(b.map((v) => v * (0.8 + wave * 0.25)) as RGB, mix(r1, r2, streak), rmask);
    c = mix(c, [0.04, 0.04, 0.04], streak * 0.25);
    return { c, h: wave * 0.8 + rmask * 0.1, g: lerp(0.78, 0.3, rmask) };
  };
}

export function mud(base = '#3b2f24', wet = 0.7): Sampler {
  const b = hex(base);
  const dark = hex('#1d1712');
  return (x, y, f) => {
    const n = f.a.at(x, y);
    const m = f.b.at(x, y);
    const fine = f.fine.at(x * 2, y * 2);
    const puddle = smooth(0.66, 0.72, n) * smooth(0.35, 0.6, m);
    const c = mix(mix(b, dark, m * 0.5), [0.05, 0.045, 0.04], puddle * 0.55);
    const h = (1 - puddle) * (m * 0.6 + fine * 0.4);
    return { c: c.map((v) => v * (0.85 + fine * 0.3)) as RGB, h, g: lerp(0.3 + wet * 0.35, 0.95, puddle) };
  };
}

export function concrete(base = '#6f6d68', wet = 0.6): Sampler {
  const b = hex(base);
  return (x, y, f, s) => {
    const n = f.a.at(x, y);
    const fine = f.fine.at(x, y);
    const stain = f.b.at(x * 0.5, y * 0.5);
    const crack = Math.abs(f.b.at(x, y * 0.3) - 0.5) < 0.008 ? 1 : 0;
    const streak = f.b.at(x * 3, y * 0.08) * smooth(0.0, 0.5, y / s);
    let c = b.map((v) => v * (0.7 + n * 0.4 + fine * 0.15)) as RGB;
    c = mix(c, [0.12, 0.13, 0.11], stain * 0.45 + streak * 0.3);
    c = mix(c, [0.05, 0.05, 0.05], crack);
    const puddle = smooth(0.62, 0.66, n);
    return { c, h: fine * 0.4 + n * 0.3 - crack * 0.4, g: lerp(0.25 + wet * 0.4, 0.92, puddle) };
  };
}

export function brick(base = '#7d3b27', mortar = '#8c8478'): Sampler {
  const b = hex(base);
  const m = hex(mortar);
  return (x, y, f, s) => {
    const rows = 12;
    const cols = 5;
    const ry = (y / s) * rows;
    const row = Math.floor(ry);
    const fy = ry - row;
    const rx = (x / s) * cols + (row % 2) * 0.5;
    const col = Math.floor(rx);
    const fx = rx - col;
    const mortarMask = fy < 0.1 || fx < 0.04 ? 1 : 0;
    const tint = 0.75 + hash2(col, row, 4) * 0.45;
    const n = f.fine.at(x, y);
    const grime = f.a.at(x, y) * smooth(0.2, 1, y / s);
    let c = mortarMask ? m.map((v) => v * (0.6 + n * 0.3)) as RGB : (b.map((v) => v * tint * (0.8 + n * 0.3)) as RGB);
    c = mix(c, [0.06, 0.07, 0.05], grime * 0.5);
    return { c, h: mortarMask ? 0.1 : 0.7 + n * 0.3, g: 0.45 + f.b.at(x, y) * 0.3 };
  };
}

export function plaster(base: string, peel = 0.4): Sampler {
  const b = hex(base);
  const under = hex('#8a6f5a');
  return (x, y, f, s) => {
    const n = f.a.at(x, y);
    const fine = f.fine.at(x, y);
    const streak = f.b.at(x * 4, y * 0.06) * smooth(0, 0.8, y / s);
    const peelMask = smooth(1 - peel * 0.4, 1 - peel * 0.4 + 0.05, f.b.at(x * 0.7, y * 0.7));
    let c = b.map((v) => v * (0.75 + n * 0.3 + fine * 0.1)) as RGB;
    c = mix(c, under, peelMask);
    c = mix(c, [0.05, 0.06, 0.04], streak * 0.55 + smooth(0.75, 1, y / s) * 0.35);
    return { c, h: (1 - peelMask) * 0.5 + fine * 0.3, g: 0.35 + streak * 0.35 };
  };
}

export function shutter(base: string, rust = 0.4): Sampler {
  const b = hex(base);
  const r = hex('#5c2e15');
  return (x, y, f, s) => {
    const rib = 0.5 + 0.5 * Math.sin((y / s) * 28 * Math.PI * 2);
    const n = f.a.at(x, y);
    const rm = smooth(1 - rust, 1 - rust + 0.15, n * 0.6 + f.fine.at(x, y) * 0.2 + (1 - y / s) * 0.25);
    const streak = f.b.at(x * 3, y * 0.1);
    let c = mix(b.map((v) => v * (0.8 + rib * 0.2)) as RGB, r, rm);
    c = mix(c, [0.05, 0.05, 0.05], streak * 0.3);
    return { c, h: rib, g: lerp(0.7, 0.3, rm) };
  };
}

export function bamboo(): Sampler {
  const a = hex('#8f7f45');
  const d = hex('#4d4422');
  return (x, y, f, s) => {
    const node = Math.abs(((y / s) * 3) % 1 - 0.5) < 0.03 ? 1 : 0;
    const stripe = f.b.at(x * 2, y * 0.1);
    const c = mix(mix(a, d, stripe * 0.6 + f.a.at(x, y) * 0.3), [0.15, 0.12, 0.06], node * 0.7);
    return { c, h: 0.5 + node * 0.4 + stripe * 0.1, g: 0.62 };
  };
}

export function grain(base: string, gloss = 0.4, vertical = true): Sampler {
  const b = hex(base);
  return (x, y, f) => {
    const g = vertical ? f.b.at(x * 4, y * 0.25) : f.b.at(x * 0.25, y * 4);
    const n = f.a.at(x, y);
    const c = b.map((v) => v * (0.6 + g * 0.5 + n * 0.2)) as RGB;
    return { c, h: g, g: gloss * (0.7 + n * 0.5) };
  };
}

export function cloth(base: string, folds = 0.5, weaveAmt = 1): Sampler {
  const b = hex(base);
  return (x, y, f) => {
    const weave = ((Math.sin(x * 1.6) * Math.sin(y * 1.6)) * 0.5 + 0.5) * weaveAmt;
    const fold = f.a.at(x * 0.6, y * 1.5);
    const c = b.map((v) => v * (0.65 + fold * folds * 0.6 + weave * 0.08)) as RGB;
    return { c, h: weave * 0.3 + fold * 0.7, g: 0.3 + fold * 0.2 };
  };
}

export function check(c1: string, c2: string, c3: string): Sampler {
  const a = hex(c1);
  const b = hex(c2);
  const k = hex(c3);
  return (x, y, f, s) => {
    const cx = Math.floor((x / s) * 8) % 2;
    const cy = Math.floor((y / s) * 8) % 2;
    const line = Math.abs(((x / s) * 8) % 1 - 0.5) < 0.05 || Math.abs(((y / s) * 8) % 1 - 0.5) < 0.05;
    let c = cx ^ cy ? a : b;
    if (line) c = k;
    return { c: c.map((v) => v * (0.8 + f.fine.at(x, y) * 0.3)) as RGB, h: f.fine.at(x, y), g: 0.25 };
  };
}

export function paint2(base: string, accent: string, rust = 0.3): Sampler {
  const b = hex(base);
  const a = hex(accent);
  return (x, y, f, s) => {
    const n = f.a.at(x, y);
    const streak = f.b.at(x * 3, y * 0.08);
    const rm = smooth(1 - rust, 1 - rust + 0.1, f.b.at(x, y) * 0.7 + n * 0.3);
    let c = b.map((v) => v * (0.85 + n * 0.2)) as RGB;
    c = mix(c, a, rm);
    c = mix(c, [0.32, 0.18, 0.08], streak * smooth(0.2, 1, y / s) * 0.55);
    return { c, h: rm * 0.4 + f.fine.at(x, y) * 0.2, g: lerp(0.65, 0.3, rm) };
  };
}

export function foliage(base = '#1f2d1a'): Sampler {
  const b = hex(base);
  return (x, y, f) => {
    const n = f.fine.at(x * 2, y * 2);
    const m = f.a.at(x, y);
    const c = b.map((v) => v * (0.5 + n * 0.8 + m * 0.3)) as RGB;
    return { c, h: n, g: 0.45 };
  };
}

export function burlap(): Sampler {
  const b = hex('#8a7a5a');
  return (x, y, f) => {
    const w = (Math.sin(x * 2.2) + Math.sin(y * 2.2)) * 0.25 + 0.5;
    const n = f.a.at(x, y);
    const c = b.map((v) => v * (0.6 + w * 0.3 + n * 0.3)) as RGB;
    return { c: mix(c, [0.1, 0.09, 0.07], f.b.at(x, y) * 0.4), h: w, g: 0.35 };
  };
}

/** Normal map for animated water: layered directional ripples (tileable). */
export function waterRipples(size: number): HTMLCanvasElement {
  const t = paint(
    size,
    (x, y, f, s) => {
      const u = (x / s) * Math.PI * 2;
      const v = (y / s) * Math.PI * 2;
      const h =
        0.3 * Math.sin(u * 3 + v * 2 + f.a.at(x, y) * 4) +
        0.2 * Math.sin(u * 7 - v * 5 + f.b.at(x, y) * 3) +
        0.25 * f.b.at(x, y) +
        0.25 * f.fine.at(x, y);
      return { c: [0, 0, 0], h: h * 0.5 + 0.5, g: 1 };
    },
    1.2,
  );
  return t.normal;
}

/** Vertical gradient canvas used for the sky dome and environment cube faces. */
export function gradient(w: number, h: number, top: RGB, bottom: RGB, glowAt = -1, glow: RGB = [0, 0, 0]): HTMLCanvasElement {
  const c = canvas(Math.max(w, h));
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  const css = (k: RGB) => `rgb(${Math.round(Math.min(1, k[0]) * 255)},${Math.round(Math.min(1, k[1]) * 255)},${Math.round(Math.min(1, k[2]) * 255)})`;
  g.addColorStop(0, css(top));
  g.addColorStop(1, css(bottom));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (glowAt >= 0) {
    const rg = ctx.createRadialGradient(w * glowAt, h * 0.85, 0, w * glowAt, h * 0.85, w * 0.4);
    rg.addColorStop(0, css(glow));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  }
  return c;
}

/** Text panel canvas: signboards, posters, chalk sketches. Uses the shipped OFL Noto fonts. */
export function textPanel(
  text: string,
  opts: { w: number; h: number; bg: string; fg: string; font?: string; weathered?: boolean; align?: CanvasTextAlign; size?: number; chalk?: boolean },
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = opts.w;
  c.height = opts.h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = opts.bg;
  ctx.fillRect(0, 0, opts.w, opts.h);
  const lines = text.split('\n');
  const size = opts.size ?? Math.floor(Math.min(opts.h / (lines.length * 1.35), opts.w / (Math.max(...lines.map((l) => l.length)) * 0.62)));
  ctx.font = `${opts.chalk ? 500 : 700} ${size}px ${opts.font ?? "'Noto Sans Bengali', 'Noto Sans', sans-serif"}`;
  ctx.fillStyle = opts.fg;
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = 'middle';
  const lh = size * 1.3;
  const y0 = opts.h / 2 - ((lines.length - 1) * lh) / 2;
  const x = opts.align === 'left' ? opts.w * 0.06 : opts.w / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, y0 + i * lh));
  if (opts.weathered !== false) {
    // grime and rain streaks
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(20,18,12,${Math.random() * 0.12})`;
      const sx = Math.random() * opts.w;
      ctx.fillRect(sx, Math.random() * opts.h * 0.4, 1 + Math.random() * 3, opts.h * (0.3 + Math.random() * 0.7));
    }
    const g = ctx.createLinearGradient(0, 0, 0, opts.h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(20,15,10,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, opts.w, opts.h);
  }
  return c;
}

/** Soft round sprite (white) for particles and glows. */
export function softDot(size = 64): HTMLCanvasElement {
  const c = canvas(size);
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** Rain streak sprite: thin vertical gradient line. */
export function streak(w = 8, h = 64): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(w * 0.35, 0, w * 0.3, h);
  return c;
}
