import * as pc from 'playcanvas';
import type { PropDef } from '@aleya/content-schema';
import { type Builder, rng } from './builder';
import { buildKarim } from './characters';
import type { CharacterId, HumanRig } from './human';
import * as T from './textures';


export interface PrefabContext {
  b: Builder;
  t: (key: string) => string;
  flag: (f: string) => boolean;
  onUpdate(fn: (dt: number, time: number) => void): void;
  addCollapsible(e: pc.Entity, x: number): void;
  addHandle(name: string, handle: unknown): void;
  /** world-space position of the prop root (for seeding) */
  worldX: number;
  density: number;
  puddleMaterial(): pc.StandardMaterial;
  /** realistic character instance, or null when the character library is unavailable */
  human(id: CharacterId, parent: pc.Entity, opts: { lantern?: boolean; stick?: boolean }): HumanRig | null;
}

export type PrefabFn = (ctx: PrefabContext, root: pc.Entity, def: PropDef) => void;

const num = (def: PropDef, k: string, d: number) => (typeof def.params?.[k] === 'number' ? (def.params[k] as number) : d);
const str = (def: PropDef, k: string, d: string) => (typeof def.params?.[k] === 'string' ? (def.params[k] as string) : d);
const bool = (def: PropDef, k: string) => def.params?.[k] === true;

// ---------------------------------------------------------------------------

const distantShore: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const x0 = num(def, 'x0', -100);
  const x1 = num(def, 'x1', 100);
  const r = rng(num(def, 'seed', 1));
  b.castShadows = false;
  b.box(root, [(x0 + x1) / 2, 0.2, 0], [x1 - x0, 1.2, 6], 'silhouette');
  const mangrove = bool(def, 'mangrove');
  for (let x = x0; x < x1; x += 3 + r() * 5) {
    const h = (mangrove ? 5 : 4) + r() * 7;
    const s = 3 + r() * 5;
    b.prim('sphere', root, [x, h * 0.55, -1 - r() * 3], [s, h, s * 0.8], 'silhouette');
    if (r() < 0.25 && !mangrove) b.cyl(root, [x + 1, 4, -1], 0.15, 8, 'silhouette');
  }
  if (bool(def, 'town')) {
    for (let x = x0; x < x1; x += 6 + r() * 6) b.box(root, [x, 2 + r() * 1.5, 1], [3 + r() * 4, 4 + r() * 3, 3], 'silhouette');
  }
  const lights = num(def, 'lights', 0);
  for (let i = 0; i < lights; i++) {
    const x = x0 + (x1 - x0) * (0.2 + r() * 0.6);
    b.prim('sphere', root, [x, 0.9 + r() * 2.5, 3.2], [0.18, 0.18, 0.18], 'far_light');
  }
  b.castShadows = true;
};

const jetty: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const L = num(def, 'length', 12);
  const W = num(def, 'width', 2.6);
  b.box(root, [0, -0.07, 0], [L, 0.14, W], 'wood_plank', { uv: 0.55 });
  b.box(root, [0, -0.2, -W / 2 + 0.05], [L, 0.14, 0.1], 'wood_dark');
  b.box(root, [0, -0.2, W / 2 - 0.05], [L, 0.14, 0.1], 'wood_dark');
  for (const z of [-W / 2 + 0.4, W / 2 - 0.4]) {
    const p = b.cyl(root, [0, -0.55, z], 0.35, L * 0.96, 'tin_rust');
    p.setLocalEulerAngles(0, 0, 90);
  }
  for (let x = -L / 2 + 0.3; x <= L / 2; x += 3) {
    b.cyl(root, [x, 0.2, -W / 2 - 0.1], 0.09, 2.6, 'wood_old', { shadows: true });
    b.cyl(root, [x, -0.3, W / 2 + 0.1], 0.08, 1.4, 'wood_old');
    b.prim('torus', root, [x + 1.2, -0.25, W / 2 + 0.12], [0.5, 0.5, 0.5], 'rubber', { rot: [90, 0, 0] });
  }
  b.box(root, [0, 0.95, -W / 2 - 0.1], [L, 0.06, 0.06], 'wood_old');
  b.box(root, [0, 0.55, -W / 2 - 0.1], [L, 0.05, 0.05], 'wood_old');
  b.box(root, [L / 2 + 0.9, -0.12, 0], [2.0, 0.1, 1.6], 'wood_plank', { rot: [0, 0, -4] });
};

const boat: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const L = num(def, 'length', 6);
  const g = b.group(root);
  b.box(g, [0, 0.12, 0], [L * 0.8, 0.12, 1.0], 'wood_dark');
  b.box(g, [0, 0.4, 0.55], [L * 0.85, 0.55, 0.08], 'wood_blue', { rot: [-18, 0, 0] });
  b.box(g, [0, 0.4, -0.55], [L * 0.85, 0.55, 0.08], 'wood_blue', { rot: [18, 0, 0] });
  for (const s of [1, -1]) {
    const tip = b.box(g, [s * L * 0.46, 0.5, 0], [L * 0.18, 0.12, 0.7], 'wood_dark', { rot: [0, 0, s * -22] });
    tip.setLocalScale(1, 1, 1);
  }
  b.box(g, [0, 0.35, 0], [0.1, 0.06, 1.1], 'wood_old');
  b.box(g, [L * 0.2, 0.35, 0], [0.1, 0.06, 1.1], 'wood_old');
  if (!bool(def, 'overturned')) {
    // bamboo hood (chhoi)
    const hood = b.prim('cylinder', g, [-L * 0.1, 0.65, 0], [1.2, L * 0.28, 1.1], 'bamboo', { rot: [0, 0, 90] });
    hood.setLocalScale(1.25, L * 0.28, 1.0);
    ctx.onUpdate((_dt, t) => {
      g.setLocalEulerAngles(Math.sin(t * 0.9 + ctx.worldX) * 1.5, 0, Math.sin(t * 0.7 + ctx.worldX) * 1.2);
      g.setLocalPosition(0, Math.sin(t * 1.1 + ctx.worldX) * 0.03, 0);
    });
  }
};

const lampPost: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const h = num(def, 'height', 3.4);
  b.cyl(root, [0, h / 2, 0], 0.05, h, 'metal_dark', { shadows: true });
  b.box(root, [0, h - 0.05, 0.3], [0.05, 0.05, 0.6], 'metal_dark');
  const shade = b.prim('cone', root, [0, h - 0.12, 0.6], [0.32, 0.18, 0.32], 'metal_green');
  if (bool(def, 'broken')) shade.setLocalEulerAngles(0, 0, 50);
};

const lantern: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  b.cyl(root, [0, 0.03, 0], 0.08, 0.06, 'brass');
  b.cyl(root, [0, 0.14, 0], 0.065, 0.16, 'glass');
  b.cyl(root, [0, 0.14, 0], 0.012, 0.05, bool(def, 'old') ? 'bulb_dim' : 'bulb_warm');
  b.prim('cone', root, [0, 0.27, 0], [0.15, 0.08, 0.15], 'brass');
  b.prim('torus', root, [0, 0.32, 0], [0.12, 0.12, 0.12], 'metal_dark', { rot: [90, 0, 0] });
};

const shelter: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const W = num(def, 'width', 7);
  const D = num(def, 'depth', 2.8);
  for (const x of [-W / 2 + 0.2, 0, W / 2 - 0.2]) {
    b.box(root, [x, 1.4, D / 2 - 0.2], [0.16, 2.8, 0.16], 'wood_old', { shadows: true });
    b.box(root, [x, 1.5, -D / 2 + 0.15], [0.16, 3.0, 0.16], 'wood_old');
  }
  b.box(root, [0, 3.0, 0], [W + 0.8, 0.06, D + 0.9], 'tin_rust', { rot: [-9, 0, 0], shadows: true, uv: 0.6 });
  b.box(root, [0, 1.0, -D / 2 + 0.05], [W, 2.0, 0.08], 'wood_plank', { rot: [0, 0, 90], uv: 0.6 });
  for (const x of [-W / 4, W / 4]) {
    b.box(root, [x, 0.45, -D / 2 + 0.55], [W / 2.4, 0.07, 0.42], 'wood_old');
    b.box(root, [x - W / 6, 0.22, -D / 2 + 0.55], [0.07, 0.44, 0.38], 'wood_dark');
    b.box(root, [x + W / 6, 0.22, -D / 2 + 0.55], [0.07, 0.44, 0.38], 'wood_dark');
  }
  b.box(root, [0, 0.03, 0], [W, 0.06, D], 'concrete_wet');
  b.box(root, [W / 2 - 1.0, 0.55, -D / 2 + 0.4], [0.9, 0.04, 0.5], 'wood_old');
};

const radioSet: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const s = bool(def, 'large') ? 1.4 : 1;
  b.box(root, [0, 0.14 * s, 0], [0.48 * s, 0.28 * s, 0.2 * s], 'wood_dark', { shadows: true });
  b.box(root, [-0.1 * s, 0.14 * s, 0.101 * s], [0.2 * s, 0.18 * s, 0.01], 'cloth_dark');
  b.box(root, [0.13 * s, 0.17 * s, 0.101 * s], [0.14 * s, 0.06 * s, 0.01], 'bulb_green');
  b.cyl(root, [0.1 * s, 0.07 * s, 0.11 * s], 0.025 * s, 0.03, 'metal_dark', { rot: [90, 0, 0] });
  b.cyl(root, [0.17 * s, 0.07 * s, 0.11 * s], 0.025 * s, 0.03, 'metal_dark', { rot: [90, 0, 0] });
  b.pole(root, [0.18 * s, 0.28 * s, 0], [0.32 * s, 0.7 * s, -0.05], 0.006, 'metal_dark');
  b.box(root, [0, -0.02, 0], [0.7 * s, 0.04, 0.4 * s], 'wood_old');
};

const sign: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const w = num(def, 'w', 2);
  const h = num(def, 'h', 0.6);
  const text = def.textKey ? ctx.t(def.textKey) : '';
  const cv = T.textPanel(text, { w: Math.round(w * 220), h: Math.round(h * 220), bg: str(def, 'bg', '#e8e0c8'), fg: str(def, 'fg', '#222') });
  b.box(root, [0, 0, -0.03], [w + 0.08, h + 0.08, 0.04], 'wood_dark');
  b.panel(root, [0, 0, 0.0], w, h, cv, 'sign');
  if (bool(def, 'post')) {
    const y = def.pos[1];
    b.box(root, [-w / 3, -y / 2, -0.06], [0.08, y, 0.08], 'wood_old');
    b.box(root, [w / 3, -y / 2, -0.06], [0.08, y, 0.08], 'wood_old');
  }
};

const teaStall: PrefabFn = (ctx, root) => {
  const { b } = ctx;
  b.box(root, [0, 0.5, 0.35], [3.0, 1.0, 0.7], 'wood_blue', { shadows: true });
  b.box(root, [0, 1.02, 0.4], [3.2, 0.05, 0.85], 'wood_old');
  b.box(root, [0, 1.2, -0.4], [3.2, 2.4, 0.1], 'wood_plank', { rot: [0, 0, 90], uv: 0.7 });
  b.box(root, [-1.6, 1.2, 0], [0.1, 2.4, 0.9], 'wood_plank');
  b.box(root, [1.6, 1.2, 0], [0.1, 2.4, 0.9], 'wood_plank');
  b.box(root, [0, 2.45, 0.5], [3.8, 0.05, 2.0], 'tin_blue', { rot: [-12, 0, 0], shadows: true });
  b.box(root, [0, 1.75, -0.28], [2.8, 0.04, 0.22], 'wood_old');
  for (let i = 0; i < 7; i++) b.cyl(root, [-1.2 + i * 0.4, 1.9, -0.28], 0.07, 0.24, 'glass');
  // kettle and clay stove
  b.cyl(root, [-0.9, 1.15, 0.35], 0.18, 0.22, 'brick');
  b.prim('sphere', root, [-0.9, 1.4, 0.35], [0.26, 0.2, 0.26], 'metal_dark');
  b.pole(root, [-0.78, 1.42, 0.35], [-0.62, 1.52, 0.35], 0.02, 'metal_dark');
  // tray of abandoned tea cups (memorable non-interactive detail)
  b.box(root, [0.4, 1.06, 0.45], [0.6, 0.02, 0.35], 'brass');
  for (let i = 0; i < 6; i++) b.cyl(root, [0.2 + (i % 3) * 0.2, 1.11, 0.36 + Math.floor(i / 3) * 0.17], 0.035, 0.07, 'paper');
  // hanging biscuit packets
  for (let i = 0; i < 5; i++) b.box(root, [0.7 + i * 0.16, 2.05, 0.75], [0.12, 0.22, 0.02], i % 2 ? 'tarp_red' : 'tarp_blue');
  b.box(root, [1.0, 0.25, 1.4], [1.4, 0.06, 0.32], 'wood_old');
  b.box(root, [0.4, 0.12, 1.4], [0.06, 0.24, 0.3], 'wood_dark');
  b.box(root, [1.6, 0.12, 1.4], [0.06, 0.24, 0.3], 'wood_dark');
};

const chalkboard: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const w = num(def, 'w', 0.7);
  const h = num(def, 'h', 0.5);
  const kind = str(def, 'kind', 'fuse');
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round(512 * (h / w));
  const g = c.getContext('2d')!;
  g.fillStyle = '#26302b';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = g.fillStyle = 'rgba(235,235,225,0.85)';
  g.lineWidth = 4;
  g.font = "600 34px 'Noto Sans Bengali','Noto Sans',sans-serif";
  if (kind === 'fuse') {
    const rows = [
      ['জেটি', 'tri'],
      ['ছাউনি', 'circ'],
      ['গেট', 'sq'],
    ];
    rows.forEach(([label, shape], i) => {
      const y = 70 + i * 95;
      g.fillText(label, 30, y + 12);
      g.beginPath();
      g.moveTo(170, y);
      g.lineTo(330, y);
      g.stroke();
      const cx = 400;
      g.beginPath();
      if (shape === 'tri') {
        g.moveTo(cx, y - 28);
        g.lineTo(cx + 30, y + 24);
        g.lineTo(cx - 30, y + 24);
        g.closePath();
      } else if (shape === 'circ') g.arc(cx, y, 28, 0, Math.PI * 2);
      else g.rect(cx - 26, y - 26, 52, 52);
      g.stroke();
    });
    g.font = "500 26px 'Noto Sans Bengali',sans-serif";
    g.fillText('মেইন সবার শেষে — ক.', 30, c.height - 24);
  } else {
    ['I ← A+C  ৩', 'II ← A+B  ৪', 'III ← B+C  ৩'].forEach((s, i) => g.fillText(s, 30, 70 + i * 90));
  }
  b.box(root, [0, 0, -0.02], [w + 0.05, h + 0.05, 0.03], 'wood_old');
  b.panel(root, [0, 0, 0.0], w, h, c, 'chalk', { gloss: 0.2 });
};

function paperCanvas(kind: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 360;
  const g = c.getContext('2d')!;
  g.fillStyle = kind === 'calendar' ? '#e6dcc0' : '#d9d0b4';
  g.fillRect(0, 0, 256, 360);
  g.fillStyle = '#3a2a20';
  if (kind === 'calendar') {
    g.fillStyle = '#9a2a20';
    g.fillRect(0, 0, 256, 70);
    g.fillStyle = '#fff';
    g.font = "700 34px 'Noto Sans Bengali',sans-serif";
    g.fillText('জুলাই ২০১৪', 30, 48);
    g.fillStyle = '#3a2a20';
    g.font = '500 20px sans-serif';
    for (let i = 0; i < 31; i++) g.fillText(String(i + 1), 18 + (i % 7) * 34, 110 + Math.floor(i / 7) * 46);
    g.strokeStyle = '#b02020';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(18 + 6 * 34 + 10, 110 + 1 * 46 - 6, 18, 0, Math.PI * 2);
    g.stroke();
  } else {
    g.font = "700 22px 'Noto Sans Bengali',sans-serif";
    g.fillText(kind === 'notice' ? 'নোটিশ' : 'কর্মী তালিকা', 20, 40);
    g.fillStyle = 'rgba(40,30,20,0.6)';
    for (let i = 0; i < 12; i++) g.fillRect(20, 70 + i * 22, 140 + ((i * 37) % 80), 4);
    if (kind === 'notice') {
      g.strokeStyle = 'rgba(160,30,30,0.8)';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(190, 310, 34, 0, Math.PI * 2);
      g.stroke();
    }
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(60,45,20,${Math.random() * 0.1})`;
    g.fillRect(Math.random() * 256, Math.random() * 360, 2 + Math.random() * 20, 2 + Math.random() * 60);
  }
  return c;
}

const poster: PrefabFn = (ctx, root, def) => {
  ctx.b.panel(root, [0, 0, 0], num(def, 'w', 0.4), num(def, 'h', 0.55), paperCanvas(str(def, 'kind', 'calendar')), 'poster', { gloss: 0.15 });
};

const figure: PrefabFn = (ctx, root, def) => {
  if (str(def, 'who', 'karim') !== 'karim') return;
  const rig = ctx.human('karim', root, { stick: true });
  if (!rig) return buildKarim(ctx.b, root, ctx);
  rig.stoop = 16;
  // face the camera, angled toward the approach from the left, regardless of the prop's yaw
  const yaw = -125 - (def.rot?.[1] ?? 0);
  ctx.onUpdate((dt, t) => {
    rig.update(dt, 'Idle', 0, 1, t, 0);
    rig.faceYaw(yaw + Math.sin(t * 0.3 + ctx.worldX) * 8);
  });
};

const shack: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const W = num(def, 'width', 4);
  const H = num(def, 'height', 3);
  const D = num(def, 'depth', 2.4);
  const mat = str(def, 'material', 'plaster_white');
  b.box(root, [0, H / 2, 0], [W, H, D], mat, { shadows: true, uv: 0.35 });
  b.box(root, [0, H + 0.05, 0.2], [W + 0.6, 0.06, D + 0.9], 'tin_rust', { rot: [-7, 0, 0], shadows: true });
  b.box(root, [W / 2 - 0.8, 1.0, D / 2 + 0.01], [0.9, 2.0, 0.04], 'wood_dark');
  b.box(root, [-W / 2 + 1.0, 1.6, D / 2 + 0.01], [0.9, 0.7, 0.04], 'glass');
  b.box(root, [-W / 2 + 1.0, 1.6, D / 2 + 0.02], [0.05, 0.7, 0.03], 'metal_dark');
  b.pole(root, [-W / 2 + 0.3, 2.2, D / 2 + 0.05], [-W / 2 + 0.3, H + 1.4, D / 2 + 0.05], 0.02, 'metal_dark');
};

const breakerPanel: PrefabFn = (ctx, root) => {
  const { b } = ctx;
  b.box(root, [0, 0, 0], [0.62, 0.82, 0.16], 'metal_green', { shadows: true });
  b.box(root, [0, 0, 0.085], [0.52, 0.7, 0.01], 'metal_dark');
  for (let i = 0; i < 3; i++) b.box(root, [-0.16 + i * 0.16, 0.1, 0.1], [0.06, 0.14, 0.05], 'rubber');
  b.box(root, [0.24, -0.2, 0.12], [0.05, 0.22, 0.05], 'tarp_red');
  b.pole(root, [0.2, 0.41, -0.04], [0.2, 1.8, -0.04], 0.025, 'metal_dark');
};

const sacks: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const n = num(def, 'count', 5);
  const r = rng(Math.round(ctx.worldX * 13));
  let i = 0;
  for (let layer = 0; i < n; layer++) {
    const perRow = Math.max(1, 3 - layer);
    for (let k = 0; k < perRow && i < n; k++, i++) {
      b.prim('capsule', root, [(k - (perRow - 1) / 2) * 0.62 + r() * 0.06, 0.18 + layer * 0.32, r() * 0.1], [0.42, 0.62, 0.42], 'sandbag', { rot: [90, r() * 20 - 10, 90], shadows: true });
    }
  }
};

const barrel: PrefabFn = (ctx, root) => {
  ctx.b.cyl(root, [0, 0.45, 0], 0.3, 0.9, 'tin_blue', { shadows: true });
  ctx.b.cyl(root, [0, 0.905, 0], 0.27, 0.01, 'metal_dark');
};

const crate: PrefabFn = (ctx, root) => {
  ctx.b.box(root, [0, 0.3, 0], [0.6, 0.6, 0.6], 'wood_old', { shadows: true, uv: 1.2 });
};

const puddle: PrefabFn = (ctx, root, def) => {
  const p = ctx.b.prim('plane', root, [0, 0, 0], [num(def, 'w', 2), 1, num(def, 'd', 1)], ctx.puddleMaterial());
  p.render!.castShadows = false;
};

const steps: PrefabFn = (ctx, root, def) => {
  const L = num(def, 'length', 4);
  const rise = num(def, 'rise', 1.5);
  const W = num(def, 'width', 2.4);
  const n = Math.max(2, Math.round(rise / 0.2));
  for (let i = 0; i < n; i++) {
    const h = ((i + 1) / n) * rise;
    ctx.b.box(root, [-L / 2 + (L / n) * (i + 0.5), h / 2, 0], [L / n + 0.01, h, W], i % 3 === 0 ? 'concrete_wet' : 'concrete', { uv: 0.8 });
  }
};

const gate: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  b.box(root, [0, 1.2, -1.2], [0.18, 2.4, 0.18], 'metal_dark', { shadows: true });
  b.box(root, [0, 1.2, 1.2], [0.18, 2.4, 0.18], 'metal_dark', { shadows: true });
  const open = bool(def, 'open');
  for (const s of [-1, 1]) {
    const hinge = b.group(root, [0, 0, s * 1.15]);
    hinge.setLocalEulerAngles(0, open ? s * -80 : 0, 0);
    const leaf = b.group(hinge, [0, 0, -s * 0.55]);
    b.box(leaf, [0, 0.15, 0], [0.05, 0.05, 1.1], 'metal_green');
    b.box(leaf, [0, 2.0, 0], [0.05, 0.05, 1.1], 'metal_green');
    for (let i = 0; i < 6; i++) b.box(leaf, [0, 1.07, -0.5 + i * 0.2], [0.03, 1.9, 0.03], 'metal_green', { shadows: true });
  }
};

const palm: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const h = num(def, 'height', 8);
  const segs = 6;
  let x = 0;
  for (let i = 0; i < segs; i++) {
    const y = (i + 0.5) * (h / segs);
    x = Math.sin(i * 0.4) * 0.35;
    b.cyl(root, [x, y, 0], 0.18 - i * 0.015, h / segs + 0.05, 'wood_old', { rot: [0, 0, -i * 2] });
  }
  const crown = b.group(root, [x, h, 0]);
  for (let i = 0; i < 9; i++) {
    const frond = b.group(crown, [0, 0, 0], [0, (i / 9) * 360, 0]);
    b.box(frond, [1.3, -0.35, 0], [2.6, 0.04, 0.55], 'foliage', { rot: [0, 0, -25 - (i % 3) * 8] });
  }
  ctx.onUpdate((_dt, t) => crown.setLocalEulerAngles(Math.sin(t * 0.8 + ctx.worldX) * 3, 0, Math.sin(t * 0.6) * 2.5));
};

const tree: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const h = num(def, 'height', 7);
  const rad = num(def, 'radius', 3);
  const r = rng(Math.round(ctx.worldX * 7 + 3));
  b.cyl(root, [0, h * 0.3, 0], 0.32, h * 0.6, 'wood_dark');
  const canopy = b.group(root, [0, h * 0.62, 0]);
  for (let i = 0; i < 7; i++) {
    const s = rad * (0.7 + r() * 0.5);
    b.prim('sphere', canopy, [(r() - 0.5) * rad * 1.4, (r() - 0.3) * rad * 0.7, (r() - 0.5) * rad * 0.8], [s, s * 0.7, s], 'foliage');
  }
  if (bool(def, 'mangrove')) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.pole(root, [Math.cos(a) * 0.2, 1.6, Math.sin(a) * 0.2], [Math.cos(a) * 1.3, -0.3, Math.sin(a) * 1.0], 0.05, 'wood_dark');
    }
  }
  ctx.onUpdate((_dt, t) => canopy.setLocalEulerAngles(Math.sin(t * 0.5 + ctx.worldX) * 1.5, 0, Math.sin(t * 0.4) * 1.5));
};

const fgPost: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const h = num(def, 'height', 4.5);
  b.castShadows = false;
  b.cyl(root, [0, h / 2, 0], bool(def, 'bamboo') ? 0.07 : 0.11, h, bool(def, 'bamboo') ? 'bamboo' : 'wood_dark');
  if (!bool(def, 'bamboo')) {
    b.box(root, [0.25, h * 0.7, 0.05], [0.5, 0.35, 0.02], 'tin_rust', { rot: [0, 0, 6] });
    b.pole(root, [0, h - 0.2, 0], [1.8, h - 1.2, -0.4], 0.012, 'metal_dark');
  }
  b.castShadows = true;
};

const wires: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const x0 = num(def, 'x0', 0);
  const x1 = num(def, 'x1', 10);
  const sag = num(def, 'sag', 0.5);
  const span = 8;
  b.castShadows = false;
  for (const dz of [0, 0.25]) {
    for (let xa = x0; xa < x1; xa += span) {
      const xb = Math.min(x1, xa + span);
      const segs = 6;
      for (let i = 0; i < segs; i++) {
        const ta = i / segs;
        const tb = (i + 1) / segs;
        const ya = -sag * 4 * ta * (1 - ta);
        const yb = -sag * 4 * tb * (1 - tb);
        b.pole(root, [xa + (xb - xa) * ta, ya, dz], [xa + (xb - xa) * tb, yb, dz], 0.01, 'rubber');
      }
    }
  }
  b.castShadows = true;
};

/** Reeds: merged blade meshes in a few sway groups (wind animation, no per-blade simulation). */
const reeds: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const W = num(def, 'width', 4);
  const D = num(def, 'depth', 1.5);
  const count = Math.max(8, Math.round(num(def, 'count', 60) * ctx.density));
  const tall = bool(def, 'tall');
  const r = rng(Math.round(ctx.worldX * 31 + W * 7));
  const groups = 4;
  for (let gi = 0; gi < groups; gi++) {
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const gx0 = -W / 2 + (W / groups) * gi;
    for (let i = 0; i < count / groups; i++) {
      const x = gx0 + r() * (W / groups);
      const z = (r() - 0.5) * D;
      const h = (tall ? 1.9 : 1.1) + r() * (tall ? 0.9 : 0.8);
      const w = 0.03 + r() * 0.03;
      const lean = (r() - 0.5) * 0.35;
      const yaw = r() * Math.PI;
      const cx = Math.cos(yaw) * w;
      const cz = Math.sin(yaw) * w;
      const base = pos.length / 3;
      pos.push(x - cx, 0, z - cz, x + cx, 0, z + cz, x + lean, h, z + lean * 0.3);
      for (let k = 0; k < 3; k++) nor.push(-Math.sin(yaw), 0.3, Math.cos(yaw));
      uv.push(0, 0, 1, 0, 0.5, 1);
      idx.push(base, base + 1, base + 2);
    }
    const mesh = b.meshFrom(pos, nor, uv, idx);
    const e = b.meshEntity(root, mesh, 'reed', [0, 0, 0], { receive: true });
    const phase = r() * 6;
    ctx.onUpdate((_dt, t) => {
      e.setLocalEulerAngles(Math.sin(t * 1.3 + phase + ctx.worldX * 0.2) * 2.2, 0, Math.sin(t * 1.7 + phase) * 3);
    });
  }
};

const rickshaw: PrefabFn = (ctx, root) => {
  const { b } = ctx;
  for (const [x, z] of [
    [0.9, 0],
    [-0.4, -0.55],
    [-0.4, 0.55],
  ]) {
    b.prim('torus', root, [x, 0.33, z], [0.66, 0.4, 0.66], 'rubber', { rot: [90, 0, 0], shadows: true });
    b.cyl(root, [x, 0.33, z], 0.03, 0.06, 'metal_dark', { rot: [90, 0, 0] });
  }
  b.pole(root, [-0.4, 0.33, -0.55], [-0.4, 0.33, 0.55], 0.025, 'metal_dark');
  b.pole(root, [-0.4, 0.4, 0], [0.9, 0.6, 0], 0.03, 'metal_dark');
  b.pole(root, [0.9, 0.33, 0], [0.75, 1.15, 0], 0.025, 'metal_dark');
  b.pole(root, [0.72, 1.15, -0.28], [0.72, 1.15, 0.28], 0.02, 'metal_dark');
  b.box(root, [0.45, 0.95, 0], [0.22, 0.05, 0.14], 'rubber');
  b.box(root, [-0.45, 0.75, 0], [0.6, 0.12, 1.0], 'tarp_red', { shadows: true });
  b.box(root, [-0.72, 1.0, 0], [0.08, 0.5, 1.0], 'tarp_red');
  const hood = b.prim('sphere', root, [-0.65, 1.25, 0], [0.7, 1.1, 1.05], 'tarp_blue', { shadows: true });
  hood.setLocalScale(0.7, 1.0, 1.05);
  // rickshaw art panel on the back
  const art = document.createElement('canvas');
  art.width = 256;
  art.height = 160;
  const g = art.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#d22f6b');
  grad.addColorStop(0.5, '#f2b632');
  grad.addColorStop(1, '#2a9d8f');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = '#123';
  g.beginPath();
  g.moveTo(40, 110);
  g.quadraticCurveTo(128, 150, 216, 110);
  g.lineTo(200, 95);
  g.lineTo(56, 95);
  g.fill();
  g.fillStyle = '#fff';
  g.fillRect(110, 60, 40, 35);
  g.fillStyle = '#e33';
  for (let i = 0; i < 8; i++) g.fillRect(10 + i * 32, 10, 18, 18);
  b.panel(root, [-1.0, 0.8, 0], 0.9, 0.55, art, 'rickshaw', { rot: [90, -90, 0] });
};

const noticeBoard: PrefabFn = (ctx, root) => {
  const { b } = ctx;
  b.box(root, [-0.6, 0.9, 0], [0.08, 1.8, 0.08], 'wood_old');
  b.box(root, [0.6, 0.9, 0], [0.08, 1.8, 0.08], 'wood_old');
  b.box(root, [0, 1.5, 0], [1.5, 1.0, 0.05], 'wood_plank', { shadows: true });
  b.panel(root, [-0.32, 1.52, 0.03], 0.5, 0.72, paperCanvas('notice'), 'notice');
  b.panel(root, [0.32, 1.48, 0.03], 0.46, 0.62, paperCanvas('roster'), 'missing', { rot: [90, 0, 4] });
};

const shopfront: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const W = num(def, 'width', 5);
  const H = num(def, 'height', 3.6);
  const D = 2;
  const mat = str(def, 'material', 'plaster_white');
  const mode = str(def, 'shutter', 'down');
  const openH = 2.5;
  // facade: back wall, sides, header above opening
  b.box(root, [0, H / 2, -D / 2], [W, H, 0.2], mat, { uv: 0.35 });
  b.box(root, [-W / 2 + 0.2, H / 2, 0], [0.4, H, D], mat, { uv: 0.35, shadows: true });
  b.box(root, [W / 2 - 0.2, H / 2, 0], [0.4, H, D], mat, { uv: 0.35, shadows: true });
  b.box(root, [0, (H + openH) / 2, D / 2 - 0.1], [W, H - openH, 0.2], mat, { uv: 0.35 });
  b.box(root, [0, H + 0.08, 0], [W + 0.3, 0.16, D + 0.3], 'concrete');
  b.box(root, [0, 0.04, 0.1], [W - 0.8, 0.08, D - 0.2], 'concrete');
  if (def.textKey) {
    const text = ctx.t(def.textKey);
    const sw = W - 0.9;
    const cv = T.textPanel(text, { w: Math.round(sw * 160), h: 120, bg: str(def, 'signBg', '#f0e6c8'), fg: str(def, 'signFg', '#202020') });
    b.panel(root, [0, openH + (H - openH) / 2, D / 2 + 0.02], sw, Math.min(0.75, (H - openH) * 0.85), cv, 'shopsign');
  }
  const sw = W - 0.8;
  if (mode === 'down' || mode === 'memorial') {
    b.box(root, [0, openH / 2, D / 2 - 0.25], [sw, openH, 0.06], 'shutter', { uv: 0.6, shadows: true });
    if (mode === 'memorial') {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 160;
      const g = c.getContext('2d')!;
      g.fillStyle = 'rgba(0,0,0,0)';
      g.clearRect(0, 0, 512, 160);
      g.fillStyle = '#5d6266';
      g.fillRect(0, 0, 512, 160);
      g.strokeStyle = g.fillStyle = 'rgba(240,240,230,0.92)';
      g.lineWidth = 4;
      const initials = ['R.H.', 'J.U.', 'A.M.', 'N.B.', 'S.A.', 'H.D.', 'K.B.', 'S.M.'];
      initials.forEach((ini, i) => {
        const x = 34 + i * 60;
        g.beginPath();
        g.moveTo(x - 22, 70);
        g.quadraticCurveTo(x, 95, x + 22, 70);
        g.closePath();
        g.stroke();
        g.beginPath();
        g.moveTo(x, 70);
        g.lineTo(x, 42);
        g.lineTo(x + 14, 62);
        g.stroke();
        g.font = '600 16px sans-serif';
        g.fillText(ini, x - 16, 125);
      });
      b.panel(root, [0, 0.7, D / 2 - 0.21], sw * 0.9, 0.9, c, 'memorial', { gloss: 0.4 });
    }
    if (bool(def, 'padlock')) b.box(root, [0.3, 0.12, D / 2 - 0.18], [0.1, 0.12, 0.05], 'brass');
  } else if (mode === 'half') {
    b.box(root, [0, openH * 0.75, D / 2 - 0.25], [sw, openH * 0.5, 0.06], 'shutter', { uv: 0.6, shadows: true });
    b.box(root, [0, 0.5, -0.3], [sw - 0.4, 1.0, 0.6], 'wood_dark');
    if (bool(def, 'interior')) {
      for (let i = 0; i < 3; i++) b.box(root, [0, 1.4 + i * 0.35, -0.85], [sw - 0.3, 0.04, 0.35], 'wood_old');
      for (let i = 0; i < 9; i++) b.box(root, [-sw / 2 + 0.4 + (i % 5) * 0.8, 1.55 + Math.floor(i / 5) * 0.35, -0.85], [0.35, 0.22, 0.2], i % 2 ? 'wood_dark' : 'metal_dark');
    }
  } else if (mode === 'window') {
    b.box(root, [0, 0.5, D / 2 - 0.25], [sw, 1.0, 0.1], 'wood_blue', { shadows: true });
    b.box(root, [0, 1.0, D / 2 - 0.1], [sw, 0.06, 0.45], 'wood_old');
    for (let i = 0; i < 9; i++) b.box(root, [-sw / 2 + 0.3 + i * (sw - 0.6) / 8, 1.75, D / 2 - 0.3], [0.03, 1.5, 0.03], 'metal_dark');
    b.box(root, [0, 1.3, -0.7], [sw - 0.4, 0.9, 0.3], 'wood_dark');
  }
  if (bool(def, 'awning')) b.box(root, [0, openH + 0.1, D / 2 + 0.6], [W, 0.05, 1.3], 'tin_red', { rot: [-15, 0, 0], shadows: true });
};

const ledgerBook: PrefabFn = (ctx, root) => {
  const { b } = ctx;
  b.box(root, [0, 0.01, 0], [0.5, 0.02, 0.36], 'tarp_red');
  b.box(root, [-0.12, 0.03, 0], [0.24, 0.02, 0.34], 'paper', { rot: [0, 0, 4] });
  b.box(root, [0.12, 0.03, 0], [0.24, 0.02, 0.34], 'paper', { rot: [0, 0, -4] });
  b.box(root, [0.18, 0.045, 0.06], [0.08, 0.005, 0.12], 'paper', { rot: [0, 25, 0] });
};

const bench: PrefabFn = (ctx, root) => {
  const { b } = ctx;
  b.box(root, [0, 0.45, 0], [1.4, 0.06, 0.38], 'wood_old', { shadows: true });
  for (const x of [-0.6, 0.6]) b.box(root, [x, 0.22, 0], [0.06, 0.44, 0.34], 'wood_dark');
};

const shelfRadios: PrefabFn = (ctx, root) => {
  const { b } = ctx;
  b.box(root, [0, 1.25, 0], [1.4, 0.04, 0.35], 'wood_old');
  b.box(root, [0, 0.62, 0], [1.4, 0.04, 0.35], 'wood_old');
  const kinds: [number, number, string][] = [
    [-0.45, 0.32, 'wood_dark'],
    [0.05, 0.26, 'metal_dark'],
    [0.5, 0.3, 'tarp_red'],
  ];
  for (const [x, h, m] of kinds) {
    b.box(root, [x, 1.27 + h / 2, 0], [0.38, h, 0.2], m, { shadows: true });
    b.box(root, [x + 0.12, 1.27 + h * 0.3, 0.11], [0.06, 0.08, 0.005], 'paper');
  }
};

const looseBricks: PrefabFn = (ctx, root) => {
  const { b } = ctx;
  b.box(root, [0, 0, -0.05], [0.55, 0.32, 0.1], 'silhouette');
  b.box(root, [-0.13, 0.08, 0.06], [0.24, 0.1, 0.16], 'brick', { rot: [0, 6, 0] });
  b.box(root, [0.13, -0.05, 0.08], [0.24, 0.1, 0.16], 'brick', { rot: [0, -8, 3] });
};

const bicycle: PrefabFn = (ctx, root) => {
  const { b } = ctx;
  for (const x of [-0.5, 0.5]) b.prim('torus', root, [x, 0.33, 0], [0.62, 0.15, 0.62], 'rubber', { rot: [90, 0, 0] });
  b.pole(root, [-0.5, 0.33, 0], [0, 0.75, 0], 0.02, 'metal_green');
  b.pole(root, [0.5, 0.33, 0], [0.35, 0.85, 0], 0.02, 'metal_green');
  b.pole(root, [0, 0.75, 0], [0.35, 0.8, 0], 0.02, 'metal_green');
  b.box(root, [-0.05, 0.82, 0], [0.18, 0.04, 0.08], 'rubber');
};

/** Culvert with three sluice valves and live water gauges (driven by P4 state). */
const culvert: PrefabFn = (ctx, root) => {
  const { b } = ctx;
  b.box(root, [0, -0.2, 0], [7, 1.4, 1.4], 'concrete_wet', { uv: 0.5 });
  b.cyl(root, [-2.2, -0.4, 0.7], 0.45, 0.2, 'silhouette', { rot: [90, 0, 0] });
  b.cyl(root, [2.2, -0.4, 0.7], 0.45, 0.2, 'silhouette', { rot: [90, 0, 0] });
  const header = b.cyl(root, [1.0, 0.75, 0.55], 0.09, 3.0, 'metal_dark');
  header.setLocalEulerAngles(0, 0, 90);
  const wheels: pc.Entity[] = [];
  const floats: pc.Entity[] = [];
  for (let i = 0; i < 3; i++) {
    const x = 0.0 + i * 1.0;
    b.cyl(root, [x, 0.9, 0.62], 0.05, 0.3, 'metal_dark');
    const w = b.group(root, [x, 1.07, 0.7]);
    b.prim('torus', w, [0, 0, 0], [0.42, 0.25, 0.42], 'metal_green', { rot: [90, 0, 0], shadows: true });
    b.box(w, [0, 0, 0], [0.4, 0.03, 0.03], 'metal_green');
    b.box(w, [0, 0, 0], [0.03, 0.4, 0.03], 'metal_green');
    wheels.push(w);
    // gauge board with float
    const gx = -2.6 + i * 0.55;
    b.box(root, [gx, 1.0, 0.68], [0.14, 1.2, 0.03], 'paper');
    for (let m = 0; m <= 6; m++) b.box(root, [gx, 0.45 + m * 0.18, 0.7], [0.1, 0.01, 0.01], 'cloth_dark');
    floats.push(b.box(root, [gx, 0.45, 0.72], [0.16, 0.04, 0.03], 'tarp_red'));
  }
  const handle = {
    set(turns: number[], gauges: number[]) {
      turns.forEach((t, i) => wheels[i]?.setLocalEulerAngles(0, 0, t * 90));
      gauges.forEach((g, i) => floats[i]?.setLocalPosition(-2.6 + i * 0.55, 0.45 + Math.min(6, g) * 0.18, 0.72));
    },
  };
  ctx.addHandle('floodgate', handle);
};

const sandbags: PrefabFn = (ctx, root, def) => {
  const L = num(def, 'length', 4);
  const n = Math.round(L / 0.55);
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < n - row; i++)
      ctx.b.prim('capsule', root, [-L / 2 + (i + row * 0.5) * 0.55, 0.12 + row * 0.22, 0], [0.32, 0.55, 0.32], 'sandbag', { rot: [90, 0, 90] });
};

const bambooBridge: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const L = num(def, 'length', 2);
  const seg = b.group(root);
  for (const z of [-0.35, 0.45]) {
    const rail = b.cyl(seg, [0, 0.9, z], 0.04, L, 'bamboo');
    rail.setLocalEulerAngles(0, 0, 90);
    b.cyl(seg, [0, -0.3, z], 0.05, 2.0, 'bamboo', { shadows: true });
    b.pole(seg, [0, 0, z], [0, 0.95, z], 0.035, 'bamboo');
  }
  for (let i = 0; i < Math.round(L / 0.12); i++) {
    const slat = b.cyl(seg, [-L / 2 + 0.06 + i * 0.12, -0.03, 0.05], 0.035, 0.95, 'bamboo', { rot: [90, 0, 0] });
    slat.render!.castShadows = false;
  }
  ctx.addCollapsible(seg, num(def, 'collapseAt', ctx.worldX));
};

const lookout: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const h = num(def, 'height', 6);
  for (const [x, z] of [
    [-0.9, -0.9],
    [0.9, -0.9],
    [-0.9, 0.9],
    [0.9, 0.9],
  ])
    b.pole(root, [x * 1.3, 0, z * 1.3], [x, h, z], 0.07, 'bamboo', { shadows: true });
  b.box(root, [0, h, 0], [2.2, 0.1, 2.2], 'wood_old');
  b.prim('cone', root, [0, h + 2.1, 0], [3.0, 1.2, 3.0], 'foliage');
  for (let i = 0; i < 4; i++) b.pole(root, [-0.9, h + 0.1, -0.9 + i * 0.6], [-0.9, h + 1.0, -0.9 + i * 0.6], 0.03, 'bamboo');
  for (let y = 0.4; y < h; y += 0.45) b.box(root, [1.3, y, 0], [0.05, 0.05, 0.6], 'bamboo');
};

const shrine: PrefabFn = (ctx, root) => {
  const { b } = ctx;
  b.box(root, [0, 0.25, 0], [1.0, 0.5, 0.7], 'brick', { shadows: true });
  b.pole(root, [-0.45, 0.5, -0.1], [-0.45, 1.6, -0.1], 0.03, 'bamboo');
  b.pole(root, [0.45, 0.5, -0.1], [0.45, 1.6, -0.1], 0.03, 'bamboo');
  b.pole(root, [-0.5, 1.55, -0.1], [0.5, 1.55, -0.1], 0.03, 'bamboo');
  for (let i = 0; i < 8; i++) {
    b.prim('torus', root, [-0.38 + i * 0.108, 1.3, -0.1], [0.1, 0.3, 0.1], 'marigold', { rot: [90, 0, 0] });
  }
  for (const x of [-0.25, 0, 0.25]) {
    b.cyl(root, [x, 0.53, 0.2], 0.04, 0.05, 'brick');
    b.prim('sphere', root, [x, 0.58, 0.2], [0.025, 0.04, 0.025], 'bulb_warm');
  }
  b.box(root, [0.32, 0.03, 0.55], [0.08, 0.025, 0.17], 'tarp_red', { rot: [0, 20, 0] });
};

/** Aleya lights across the creek: blink handle for P5 playback; drift away when solved. */
const creekLights: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const sp = num(def, 'spacing', 6);
  const driftFlag = str(def, 'driftFlag', '');
  const positions = { left: -sp, center: 0, right: sp } as const;
  const orbs: Record<string, { e: pc.Entity; light: pc.Entity; level: number; target: number }> = {};
  const glow = new pc.StandardMaterial();
  glow.emissive = new pc.Color(0.75, 1, 0.8);
  glow.emissiveIntensity = 5;
  glow.useLighting = false;
  glow.diffuse = new pc.Color(0, 0, 0);
  glow.update();
  for (const [k, x] of Object.entries(positions)) {
    const z = k === 'center' ? -4 : 0;
    const e = b.prim('sphere', root, [x, 0.6, z], [0.22, 0.22, 0.22], glow);
    const light = new pc.Entity('aleya');
    light.addComponent('light', { type: 'omni', color: new pc.Color(0.6, 1, 0.75), intensity: 0, range: 7, castShadows: false });
    e.addChild(light);
    orbs[k] = { e, light, level: 0.25, target: 0.25 };
  }
  // shaped markers under each light (non-colour cue): reed tuft, buoy, post
  b.prim('cone', root, [0, -0.1, -4], [0.6, 0.8, 0.6], 'tarp_red');
  b.box(root, [sp, 0.0, 0], [0.25, 1.2, 0.25], 'wood_old');
  b.prim('sphere', root, [-sp, -0.1, 0], [0.9, 0.5, 0.9], 'reed');
  let drift = 0;
  ctx.addHandle('creekLights', {
    blink(pos: string, on: boolean) {
      const o = orbs[pos];
      if (o) o.target = on ? 1 : 0.15;
    },
    rest() {
      for (const o of Object.values(orbs)) o.target = 0.25;
    },
  });
  ctx.onUpdate((dt, t) => {
    const drifting = driftFlag && ctx.flag(driftFlag);
    if (drifting) drift = Math.min(1, drift + dt * 0.05);
    for (const [k, o] of Object.entries(orbs)) {
      o.level += (o.target - o.level) * Math.min(1, dt * 10);
      const idle = 0.85 + Math.sin(t * 2.3 + positions[k as keyof typeof positions]) * 0.15;
      const lvl = drifting ? 0.5 * idle * (1 - drift * 0.6) : o.level * idle;
      o.e.setLocalScale(0.12 + lvl * 0.2, 0.12 + lvl * 0.2, 0.12 + lvl * 0.2);
      o.light.light!.intensity = lvl * 2.2;
      const bx = positions[k as keyof typeof positions];
      const bz = k === 'center' ? -4 : 0;
      o.e.setLocalPosition(bx + drift * 20, 0.6 + Math.sin(t * 0.9 + bx) * 0.12, bz - drift * 16);
    }
  });
};

const ferry: PrefabFn = (ctx, root, def) => {
  const { b } = ctx;
  const L = num(def, 'length', 46);
  const half = L / 2;
  if (bool(def, 'distant')) {
    b.castShadows = false;
    b.box(root, [0, 1.2, 0], [L, 2.4, 4], 'silhouette');
    b.box(root, [-4, 3.4, 0], [L * 0.6, 2, 3.6], 'silhouette');
    b.box(root, [8, 5.4, 0], [6, 2, 3], 'silhouette');
    b.prim('sphere', root, [8, 5.6, 1.6], [0.2, 0.2, 0.2], 'bulb_green');
    b.castShadows = true;
    return;
  }
  const Wz = 3.6;
  const floor = 1.65;
  const deck = 4.0;
  // hull: back wall full height, front (camera side) cut away above lower floor
  b.box(root, [0, 1.0, -Wz / 2], [L, 2.0, 0.12], 'hull_red', { uv: 0.25 });
  b.box(root, [0, 2.85, -Wz / 2], [L, 1.7, 0.12], 'hull_white', { uv: 0.25 });
  b.box(root, [0, 0.8, Wz / 2], [L, 1.6, 0.12], 'hull_red', { uv: 0.25, shadows: true });
  b.box(root, [0, 1.62, Wz / 2 + 0.02], [L, 0.12, 0.06], 'hull_blue');
  b.box(root, [0, 0.2, 0], [L, 0.2, Wz], 'hull_red');
  // bow taper and stern
  b.box(root, [half + 1.5, 1.6, -0.9], [3.6, 2.8, 0.12], 'hull_white', { rot: [0, 28, 0] });
  b.box(root, [half + 1.5, 1.0, 0.9], [3.6, 1.6, 0.12], 'hull_red', { rot: [0, -28, 0] });
  b.box(root, [-half - 0.3, 1.8, 0], [0.12, 3.2, Wz], 'hull_white');
  // lower deck floor and ceiling (upper deck) with stairwell gap
  b.box(root, [-3, floor - 0.08, 0], [L - 6, 0.16, Wz - 0.1], 'wood_plank', { uv: 0.55 });
  const wellX0 = 3; // local x of stairwell start (world 36)
  const wellX1 = 7;
  b.box(root, [(-half + wellX0) / 2, deck - 0.1, 0], [wellX0 + half, 0.2, Wz], 'wood_plank', { uv: 0.55, shadows: true });
  b.box(root, [(wellX1 + half + 2) / 2, deck - 0.1, 0], [half + 2 - wellX1, 0.2, Wz], 'wood_plank', { uv: 0.55, shadows: true });
  // cabin pillars and windows on the back wall
  for (let x = -half + 2; x < wellX0; x += 2.5) {
    b.box(root, [x, (floor + deck) / 2, Wz / 2 - 0.2], [0.12, deck - floor, 0.12], 'metal_green', { shadows: true });
    b.box(root, [x + 1.2, 2.75, -Wz / 2 + 0.07], [1.1, 0.7, 0.02], 'glass');
  }
  // stairs
  for (let i = 0; i < 10; i++) {
    const t = (i + 0.5) / 10;
    b.box(root, [wellX0 + t * (wellX1 - wellX0), floor + t * (deck - floor) - 0.06, -0.05], [0.42, 0.08, 0.9], 'metal_dark');
  }
  // upper deck railing (front)
  for (let x = -half + 1; x < half; x += 1.5) b.box(root, [x, deck + 0.45, Wz / 2 - 0.1], [0.04, 0.9, 0.04], 'metal_dark');
  b.box(root, [0, deck + 0.9, Wz / 2 - 0.1], [L, 0.05, 0.05], 'metal_dark');
  // wheelhouse (world x 44..50 -> local 11..17)
  const wx0 = 11;
  const wx1 = 17;
  const wh = 2.5;
  b.box(root, [(wx0 + wx1) / 2, deck + wh / 2, -Wz / 2 + 0.3], [wx1 - wx0, wh, 0.1], 'hull_white', { shadows: true });
  b.box(root, [(wx0 + wx1) / 2, deck + wh + 0.05, -0.3], [wx1 - wx0 + 0.4, 0.12, Wz - 0.4], 'hull_white', { shadows: true });
  b.box(root, [wx1, deck + wh / 2, -0.3], [0.1, wh, Wz - 0.6], 'hull_white');
  b.box(root, [wx1 + 0.06, deck + 1.6, -0.3], [0.03, 0.9, Wz - 1.2], 'glass');
  b.box(root, [wx0, deck + 2.15, -0.3], [0.1, 0.7, Wz - 0.6], 'hull_white');
  b.box(root, [wx0, deck + 0.9, -1.3], [0.1, 1.8, 1.0], 'hull_white');
  b.box(root, [(wx0 + wx1) / 2, deck + 0.5, -Wz / 2 + 0.6], [wx1 - wx0 - 0.4, 1.0, 0.5], 'wood_dark');
  b.cyl(root, [wx1 - 1.3, deck + 1.3, -1.2], 0.45, 0.06, 'wood_old', { rot: [90, 0, 0] });
  // wheelhouse door, swings open when the lock is solved
  const hinge = b.group(root, [wx0, deck, 0.4]);
  b.box(hinge, [0, 1.0, -0.42], [0.06, 1.9, 0.8], 'hull_white', { shadows: true });
  let open = 0;
  ctx.onUpdate((dt) => {
    const target = ctx.flag('L05.lock_solved') ? 1 : 0;
    open += (target - open) * Math.min(1, dt * 2);
    hinge.setLocalEulerAngles(0, -open * 95, 0);
  });
  // name plate
  const name = T.textPanel('এম.ভি. ময়নামতি', { w: 640, h: 120, bg: '#c9c6bb', fg: '#14365a' });
  b.panel(root, [half - 4, 2.95, Wz / 2 + 0.07], 4.2, 0.8, name, 'ferryname');
  // bow deck clutter
  b.cyl(root, [half - 2, deck + 0.3, 0.4], 0.25, 0.6, 'metal_dark');
  b.prim('torus', root, [half - 3.5, deck + 0.05, 0.6], [0.8, 0.5, 0.8], 'rope');
};

const gangplank: PrefabFn = (ctx, root, def) => {
  const L = num(def, 'length', 4);
  const rise = num(def, 'rise', 1);
  const ang = (Math.atan2(rise, L) * 180) / Math.PI;
  ctx.b.box(root, [0, 0, 0], [Math.hypot(L, rise), 0.08, 0.55], 'wood_plank', { rot: [0, 0, ang], uv: 0.8, shadows: true });
};

const jacketRack: PrefabFn = (ctx, root) => {
  const { b } = ctx;
  b.box(root, [0, 1.3, 0], [2.4, 0.06, 0.08], 'metal_dark');
  for (let i = 0; i < 12; i++) {
    const x = -1.1 + i * 0.2;
    b.box(root, [x, 1.25, 0.05], [0.02, 0.08, 0.06], 'metal_dark');
    if ([1, 4, 6, 9, 11].includes(i)) b.box(root, [x, 0.98, 0.08], [0.18, 0.45, 0.1], 'tarp_red', { shadows: true });
  }
};

const table: PrefabFn = (ctx, root) => {
  const { b } = ctx;
  b.box(root, [0, 0.78, 0], [1.2, 0.05, 0.7], 'wood_old', { shadows: true });
  for (const [x, z] of [
    [-0.55, -0.3],
    [0.55, -0.3],
    [-0.55, 0.3],
    [0.55, 0.3],
  ])
    b.box(root, [x, 0.38, z], [0.05, 0.76, 0.05], 'wood_dark');
};

/** Wheelhouse lock gearbox: three symbol disks driven by P6 state. */
const gearbox: PrefabFn = (ctx, root) => {
  const { b } = ctx;
  b.box(root, [0, 0.8, 0], [0.9, 0.7, 0.3], 'metal_green', { shadows: true });
  const disks: pc.Entity[] = [];
  for (let i = 0; i < 3; i++) {
    const d = b.group(root, [-0.27 + i * 0.27, 0.85, 0.17]);
    b.cyl(d, [0, 0, 0], 0.11, 0.04, 'brass', { rot: [90, 0, 0] });
    b.box(d, [0, 0.08, 0.025], [0.02, 0.05, 0.01], 'rubber');
    disks.push(d);
  }
  const levers: pc.Entity[] = [];
  for (let i = 0; i < 3; i++) {
    const l = b.group(root, [-0.25 + i * 0.25, 0.45, 0.17]);
    b.box(l, [0, -0.1, 0], [0.03, 0.22, 0.03], 'metal_dark');
    b.prim('sphere', l, [0, -0.22, 0], [0.06, 0.06, 0.06], 'tarp_red');
    levers.push(l);
  }
  ctx.addHandle('wheelhouse', {
    set(d: number[], gear: number) {
      d.forEach((v, i) => disks[i]?.setLocalEulerAngles(0, 0, -v * 60));
      levers.forEach((l, i) => l.setLocalEulerAngles(i === gear ? 35 : 0, 0, 0));
    },
  });
};

const recorder: PrefabFn = (ctx, root) => {
  const { b } = ctx;
  b.box(root, [0, 0.06, 0], [0.34, 0.12, 0.2], 'metal_dark', { shadows: true });
  for (const x of [-0.07, 0.07]) b.cyl(root, [x, 0.07, 0.101], 0.04, 0.01, 'brass', { rot: [90, 0, 0] });
  b.box(root, [0, 0.125, 0.05], [0.25, 0.01, 0.05], 'rubber');
};

const rope: PrefabFn = (ctx, root, def) => {
  const L = num(def, 'length', 7);
  const rise = num(def, 'rise', -3);
  const ang = (Math.atan2(rise, L) * 180) / Math.PI;
  const g = ctx.b.group(root, [0, 0, 0], [0, 0, ang]);
  const len = Math.hypot(L, rise);
  ctx.b.box(g, [0, 0, 0], [len, 0.06, 0.6], 'wood_plank', { uv: 0.8 });
  for (let x = -len / 2; x < len / 2; x += 0.5) ctx.b.box(g, [x, 0.05, 0], [0.05, 0.05, 0.62], 'rope');
};

export const PREFABS: Record<string, PrefabFn> = {
  distantShore,
  jetty,
  boat,
  lampPost,
  lantern,
  shelter,
  radioSet,
  sign,
  teaStall,
  chalkboard,
  poster,
  figure,
  shack,
  breakerPanel,
  sacks,
  barrel,
  crate,
  puddle,
  steps,
  gate,
  palm,
  tree,
  fgPost,
  wires,
  reeds,
  rickshaw,
  noticeBoard,
  shopfront,
  ledgerBook,
  bench,
  shelfRadios,
  looseBricks,
  bicycle,
  culvert,
  sandbags,
  bambooBridge,
  lookout,
  shrine,
  creekLights,
  ferry,
  gangplank,
  jacketRack,
  table,
  gearbox,
  recorder,
  rope,
};
