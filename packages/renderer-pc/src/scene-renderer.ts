import * as pc from 'playcanvas';
import type { Condition, LightDef, SceneManifest } from '@aleya/content-schema';
import type { PlayerState, ThreatPhase } from '@aleya/game-core';
import { Builder } from './builder';
import { CameraDirector } from './camera';
import { AshaRig, WatcherRig } from './characters';
import { type CharacterLibrary, type CharacterId, HumanRig, WatcherHuman } from './human';
import type { Stage } from './engine';
import { buildEnvironment, type MaterialLibrary } from './materials';
import { PREFABS, type PrefabContext } from './prefabs';
import * as T from './textures';
import { Weather } from './weather';

export interface ThreatView {
  id: string;
  kind: 'pursuit' | 'patrol';
  x: number;
  y: number;
  phase: ThreatPhase;
  presence: number;
  sweep: number;
  active: boolean;
}

export interface FrameState {
  player: { x: number; y: number; z: number; state: PlayerState; speed: number; facing: 1 | -1; lanternOn: boolean; hasLantern?: boolean };
  threats: ThreatView[];
  highlight: [number, number, number] | null;
  chaseActive: boolean;
}

export interface RendererOptions {
  t: (key: string) => string;
  test: (cond: Condition | undefined) => boolean;
  flag: (f: string) => boolean;
}

interface Conditional {
  entity: pc.Entity;
  when?: Condition;
}

interface LiveLight {
  entity: pc.Entity;
  bulb: pc.Entity | null;
  def: LightDef;
  level: number;
  on: boolean;
  /** seconds since switched on, drives the restoration flicker */
  sinceOn: number;
  phase: number;
}

interface Collapsible {
  entity: pc.Entity;
  x: number;
  t: number;
  vy: number;
}

export class SceneRenderer {
  readonly director: CameraDirector;
  private root: pc.Entity | null = null;
  private builder: Builder | null = null;
  private manifest: SceneManifest | null = null;
  private conditionals: Conditional[] = [];
  private lights: LiveLight[] = [];
  private waters: { entity: pc.Entity; mat: pc.StandardMaterial; tag?: string; y: number; from: number; to: number; t: number; dur: number }[] = [];
  private updaters: ((dt: number, time: number) => void)[] = [];
  private collapsibles: Collapsible[] = [];
  private handles = new Map<string, unknown>();
  private watchers = new Map<string, WatcherRig | WatcherHuman>();
  characters: CharacterLibrary | null = null;
  private moon: pc.Entity | null = null;
  private weather: Weather | null = null;
  private env: { cubemap: pc.Texture; atlas: pc.Texture } | null = null;
  private rippleTex: pc.Texture | null = null;
  private puddleMat: pc.StandardMaterial | null = null;
  private mote: pc.Entity | null = null;
  asha: AshaRig | HumanRig | null = null;
  private time = 0;
  reducedFlash = false;
  brightness = 1;
  onThunder: ((delay: number, strength: number) => void) | null = null;

  constructor(
    private stage: Stage,
    private mats: MaterialLibrary,
    private opts: RendererOptions,
  ) {
    this.director = new CameraDirector(stage.camera);
  }

  get app(): pc.AppBase {
    return this.stage.app;
  }

  /** Swap the material library (asset tier change), only between scenes. */
  setMaterialLibrary(mats: MaterialLibrary): void {
    this.unload();
    this.mats = mats;
  }

  handle<T>(name: string): T | undefined {
    return this.handles.get(name) as T | undefined;
  }

  /** Build all entities for a scene manifest. Yields between batches to keep the loading UI responsive. */
  async load(manifest: SceneManifest, onProgress?: (p: number) => void): Promise<void> {
    this.unload();
    this.manifest = manifest;
    const app = this.app;
    const root = new pc.Entity(manifest.id);
    this.stage.world.addChild(root);
    this.root = root;
    const b = (this.builder = new Builder(app, this.mats, manifest.id));
    const q = this.stage.quality;
    const L = manifest.lightingPreset;

    // environment, fog, ambient
    this.env = buildEnvironment(app.graphicsDevice, L.skyTop as [number, number, number], L.skyBottom as [number, number, number]);
    app.scene.envAtlas = this.env.atlas;
    app.scene.skybox = this.env.cubemap;
    // night-visibility calibration: authored presets are physically dark; lift them so
    // silhouettes and paths stay readable (player brightness setting scales exposure)
    app.scene.skyboxIntensity = 1.3;
    app.scene.skyboxMip = 1;
    app.scene.exposure = L.exposure * 1.45 * this.brightness;
    app.scene.ambientLight = new pc.Color(L.ambient[0] * 3.2, L.ambient[1] * 3.2, L.ambient[2] * 3.2);
    app.scene.fog.type = pc.FOG_EXP2;
    app.scene.fog.color = new pc.Color(...L.fogColor);
    app.scene.fog.density = L.fogDensity;
    this.stage.camera.camera!.clearColor = new pc.Color(...L.skyBottom);

    this.moon = new pc.Entity('moon');
    this.moon.addComponent('light', {
      type: 'directional',
      color: new pc.Color(...L.moon.color),
      intensity: L.moon.intensity * 2.6,
      castShadows: q.shadows && q.shadowRes >= 1024,
      shadowDistance: 30,
      shadowResolution: q.shadowRes,
      numCascades: 1,
      shadowBias: 0.4,
      normalOffsetBias: 0.06,
    });
    this.moon.setEulerAngles(L.moon.rot[0], L.moon.rot[1], L.moon.rot[2]);
    root.addChild(this.moon);

    // shared ripple texture for water and puddles
    this.rippleTex = this.mats.texture(T.waterRipples(256), false);
    this.puddleMat = this.waterMaterial([0.02, 0.022, 0.025], 3);
    // puddles are a thin reflective film over the ground, never an opaque hole
    this.puddleMat.opacity = 0.45;
    this.puddleMat.blendType = pc.BLEND_NORMAL;
    this.puddleMat.depthWrite = false;
    this.puddleMat.update();

    this.weather = new Weather(app, this.mats, root);
    this.weather.reducedFlash = this.reducedFlash;
    this.weather.onThunder = (d, s) => this.onThunder?.(d, s);
    this.weather.configure(L, q.rain);

    // water planes
    for (const w of manifest.water) {
      const mat = this.waterMaterial(w.tint as [number, number, number], 0.18);
      const e = b.prim('plane', root, [(w.x0 + w.x1) / 2, w.y, (w.z0 + w.z1) / 2], [w.x1 - w.x0, 1, w.z1 - w.z0], mat, { receive: true });
      mat.normalMapTiling = new pc.Vec2((w.x1 - w.x0) * 0.22, (w.z1 - w.z0) * 0.22);
      mat.normalDetailMapTiling = new pc.Vec2((w.x1 - w.x0) * 0.6, (w.z1 - w.z0) * 0.6);
      mat.update();
      this.waters.push({ entity: e, mat, tag: w.tag, y: w.y, from: w.y, to: w.y, t: 1, dur: 1 });
    }

    // props
    const ctxBase = (worldX: number): PrefabContext => ({
      b,
      t: this.opts.t,
      flag: this.opts.flag,
      onUpdate: (fn) => this.updaters.push(fn),
      addCollapsible: (e, x) => this.collapsibles.push({ entity: e, x, t: -1, vy: 0 }),
      addHandle: (name, h) => this.handles.set(name, h),
      worldX,
      density: q.reedDensity,
      puddleMaterial: () => this.puddleMat!,
      human: (id, parent, opts) => this.human(id, parent, opts),
    });
    let i = 0;
    for (const p of manifest.props) {
      const e = new pc.Entity(p.prefab ?? p.kind);
      e.setLocalPosition(p.pos[0], p.pos[1], p.pos[2]);
      if (p.rot) e.setLocalEulerAngles(p.rot[0], p.rot[1], p.rot[2]);
      root.addChild(e);
      if (p.kind === 'prefab') {
        const fn = PREFABS[p.prefab ?? ''];
        if (!fn) console.warn(`[renderer] unknown prefab ${p.prefab}`);
        else fn(ctxBase(p.pos[0]), e, p);
      } else if (p.kind === 'box') {
        b.box(e, [0, 0, 0], (p.scale ?? [1, 1, 1]) as [number, number, number], p.material ?? 'concrete', { shadows: p.shadows });
      } else {
        b.prim(p.kind, e, [0, 0, 0], (p.scale ?? [1, 1, 1]) as [number, number, number], p.material ?? 'concrete', { shadows: p.shadows });
      }
      if (p.when) this.conditionals.push({ entity: e, when: p.when });
      if (++i % 8 === 0) {
        onProgress?.(i / manifest.props.length);
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // lights
    for (const def of manifest.lights) {
      const e = new pc.Entity(def.id);
      e.setLocalPosition(def.pos[0], def.pos[1], def.pos[2]);
      if (def.rot) e.setLocalEulerAngles(def.rot[0], def.rot[1], def.rot[2]);
      e.addComponent('light', {
        type: def.type,
        color: new pc.Color(...def.color),
        intensity: 0,
        range: def.range,
        innerConeAngle: (def.angle ?? 40) * 0.6,
        outerConeAngle: def.angle ?? 40,
        castShadows: def.shadows && q.shadows,
        shadowResolution: Math.min(1024, q.shadowRes),
        shadowBias: 0.3,
        normalOffsetBias: 0.05,
      });
      root.addChild(e);
      let bulb: pc.Entity | null = null;
      if (def.bulb) {
        const [r, g, bl] = def.color;
        const mat = g > r && g > bl ? 'bulb_green' : bl > r ? 'bulb_cool' : 'bulb_warm';
        bulb = b.prim('sphere', root, [def.pos[0], def.pos[1] - 0.05, def.pos[2]], [0.09, 0.11, 0.09], mat);
        bulb.render!.castShadows = false;
      }
      this.lights.push({ entity: e, bulb, def, level: 0, on: false, sinceOn: 10, phase: Math.random() * 10 });
    }

    // characters: realistic skinned rigs when available, procedural stand-ins otherwise
    this.asha = this.human('asha', root, { lantern: true }) ?? new AshaRig(b, root);
    this.asha.setShadows(q.shadows);
    for (const t of manifest.threats) {
      const h = this.human('watcher', root, {});
      const rig = h ? new WatcherHuman(h, t.kind === 'patrol') : new WatcherRig(b, root, t.kind === 'patrol');
      rig.root.setLocalPosition(t.spawn[0], t.spawn[1], t.spawn[2]);
      this.watchers.set(t.id, rig);
    }

    // subtle interaction highlight mote
    const moteMat = new pc.StandardMaterial();
    moteMat.useLighting = false;
    moteMat.emissive = new pc.Color(1, 0.85, 0.6);
    moteMat.emissiveIntensity = 3;
    moteMat.opacityMap = this.mats.texture(T.softDot(64), false);
    moteMat.opacityMapChannel = 'r';
    moteMat.blendType = pc.BLEND_ADDITIVE;
    moteMat.depthWrite = false;
    moteMat.update();
    this.mote = b.prim('plane', root, [0, -50, 0], [0.22, 1, 0.22], moteMat, { rot: [90, 0, 0] });
    this.mote.render!.castShadows = false;

    this.director.setRails(manifest.cameraRails);
    this.refresh(true);
    onProgress?.(1);
  }

  private human(id: CharacterId, parent: pc.Entity, opts: { lantern?: boolean; stick?: boolean }): HumanRig | null {
    const inst = this.characters?.instantiate(id, this.mats, this.manifest?.id ?? 'shared', this.stage.quality.shadows);
    return inst ? new HumanRig(inst, parent, { id, ...opts }, this.mats) : null;
  }

  private waterMaterial(tint: [number, number, number], tiling: number): pc.StandardMaterial {
    const m = new pc.StandardMaterial();
    m.diffuse = new pc.Color(...tint);
    m.useMetalness = true;
    m.metalness = 0;
    m.gloss = 0.93;
    m.normalMap = this.rippleTex;
    m.bumpiness = 0.55;
    m.normalMapTiling = new pc.Vec2(tiling, tiling);
    m.normalDetailMap = this.rippleTex;
    m.normalDetailMapBumpiness = 0.5;
    m.reflectivity = 1.1;
    m.update();
    return m;
  }

  /** Re-evaluate conditional props/lights after flags change. */
  refresh(instant = false): void {
    for (const c of this.conditionals) c.entity.enabled = this.opts.test(c.when);
    for (const l of this.lights) {
      const on = this.opts.test(l.def.when);
      if (on && !l.on) l.sinceOn = instant ? 10 : 0;
      l.on = on;
      if (instant) l.level = on ? 1 : 0;
    }
  }

  setWater(tag: string, y: number, duration: number): void {
    for (const w of this.waters) {
      if (w.tag !== tag) continue;
      w.from = w.entity.getLocalPosition().y;
      w.to = y;
      w.t = duration <= 0 ? 1 : 0;
      w.dur = Math.max(0.001, duration);
      if (duration <= 0) w.entity.setLocalPosition(w.entity.getLocalPosition().x, y, w.entity.getLocalPosition().z);
    }
  }

  playShot(id: string): number {
    const shot = this.manifest?.shots.find((s) => s.id === id);
    if (!shot) return 0;
    return this.director.playShot(shot);
  }

  lightning(): void {
    this.weather?.strike();
  }

  quake(amount: number): void {
    this.director.addShake(amount);
  }

  snapCamera(x: number, y: number, z: number, facing: number): void {
    this.director.snap(x, y, z, facing);
  }

  /** Reset collapsing bridge segments (checkpoint reload). */
  resetCollapsibles(): void {
    for (const c of this.collapsibles) {
      if (c.t >= 0) {
        c.entity.setLocalPosition(0, 0, 0);
        c.entity.setLocalEulerAngles(0, 0, 0);
        c.entity.enabled = true;
      }
      c.t = -1;
      c.vy = 0;
    }
  }

  update(dt: number, s: FrameState): void {
    if (!this.root) return;
    this.time += dt;
    const time = this.time;
    const p = s.player;
    this.director.update(dt, p.x, p.y, p.z, p.facing, time);
    if (this.asha) {
      this.asha.lanternOn = p.lanternOn;
      if ('hasLantern' in this.asha) this.asha.hasLantern = p.hasLantern ?? p.lanternOn;
      this.asha.root.setLocalPosition(p.x, p.y, p.z);
      this.asha.root.enabled = true;
      this.asha.update(dt, p.state, p.speed, p.facing, time, 0.12);
    }
    for (const fn of this.updaters) fn(dt, time);
    // lights: fade + flicker + restoration flicker
    for (const l of this.lights) {
      l.sinceOn += dt;
      const target = l.on ? 1 : 0;
      l.level += (target - l.level) * Math.min(1, dt * 5);
      let f = 1;
      if (l.def.flicker > 0) {
        const n = 0.5 + 0.5 * Math.sin(time * 17 + l.phase) * Math.sin(time * 5.3 + l.phase * 2);
        f = 1 - l.def.flicker * n * 0.6;
        if (l.def.flicker > 0.4 && Math.sin(time * 1.7 + l.phase) > 0.97) f *= 0.2;
      }
      if (l.on && l.sinceOn < 1.4) f *= Math.sin(l.sinceOn * 40) > 0.2 || l.sinceOn > 1.1 ? 1 : 0.05;
      const v = l.level * f;
      l.entity.light!.intensity = l.def.intensity * v;
      l.entity.enabled = v > 0.01;
      if (l.bulb) l.bulb.enabled = v > 0.05;
    }
    // water animation
    for (const w of this.waters) {
      const off = w.mat.normalMapOffset;
      off.set((time * 0.012) % 1, (time * 0.02) % 1);
      w.mat.normalMapOffset = off;
      const od = w.mat.normalDetailMapOffset;
      od.set((-time * 0.017) % 1, (time * 0.011) % 1);
      w.mat.normalDetailMapOffset = od;
      w.mat.update();
      if (w.t < 1) {
        w.t = Math.min(1, w.t + dt / w.dur);
        const e = w.t * w.t * (3 - 2 * w.t);
        const lp = w.entity.getLocalPosition();
        w.entity.setLocalPosition(lp.x, w.from + (w.to - w.from) * e, lp.z);
      }
    }
    if (this.puddleMat) {
      const o = this.puddleMat.normalMapOffset;
      o.set((time * 0.05) % 1, (time * 0.07) % 1);
      this.puddleMat.normalMapOffset = o;
      this.puddleMat.update();
    }
    // collapsing segments behind a fleeing player
    for (const c of this.collapsibles) {
      if (c.t < 0 && s.chaseActive && p.x > c.x + 2.6) {
        c.t = 0;
        this.director.addShake(0.15);
      }
      if (c.t >= 0 && c.entity.enabled) {
        c.t += dt;
        c.vy -= 9.8 * dt;
        const lp = c.entity.getLocalPosition();
        c.entity.setLocalPosition(lp.x, lp.y + c.vy * dt, lp.z);
        c.entity.setLocalEulerAngles(c.t * 30, 0, c.t * -45);
        if (c.t > 2) c.entity.enabled = false;
      }
    }
    // watchers
    for (const t of s.threats) {
      const rig = this.watchers.get(t.id);
      if (!rig) continue;
      const def = this.manifest!.threats.find((d) => d.id === t.id)!;
      if (t.kind === 'pursuit') {
        rig.root.setLocalPosition(t.x, t.y, def.spawn[2]);
        rig.update(dt, time, t.presence, t.active, 1);
      } else {
        rig.update(dt, time, Math.max(0.6, t.presence), t.active, -1);
        const pa = def.patrol!;
        const sx = pa.x0 + (pa.x1 - pa.x0) * t.sweep;
        const intensity = t.phase === 'Search' ? 5 : t.phase === 'Telegraph' ? 1.5 * t.presence : 0;
        rig.aimTorch(new pc.Vec3(sx, 0, 0.4), intensity);
      }
    }
    // interaction mote
    if (this.mote) {
      if (s.highlight) {
        this.mote.enabled = true;
        this.mote.setLocalPosition(s.highlight[0], s.highlight[1] + 0.25 + Math.sin(time * 2.5) * 0.04, s.highlight[2] + 0.15);
        const k = 0.16 + Math.sin(time * 3) * 0.03;
        this.mote.setLocalScale(k, 1, k);
        this.mote.lookAt(this.stage.camera.getPosition());
        this.mote.rotateLocal(90, 0, 0);
      } else this.mote.enabled = false;
    }
    this.weather?.update(dt, this.director.position, p.y, p.x);
  }

  get lightningFlash(): number {
    return this.weather?.flash ?? 0;
  }

  setBrightness(b: number): void {
    this.brightness = b;
    if (this.manifest) this.app.scene.exposure = this.manifest.lightingPreset.exposure * 1.45 * b;
  }

  setReducedFlash(on: boolean): void {
    this.reducedFlash = on;
    if (this.weather) this.weather.reducedFlash = on;
  }

  unload(): void {
    if (!this.root) return;
    const id = this.manifest?.id ?? '';
    this.weather?.destroy();
    this.weather = null;
    this.root.destroy();
    this.root = null;
    this.builder?.destroy();
    this.builder = null;
    this.mats.releaseScene(id);
    this.env?.atlas.destroy();
    this.env?.cubemap.destroy();
    this.env = null;
    this.app.scene.envAtlas = null;
    this.app.scene.skybox = null;
    this.rippleTex?.destroy();
    this.rippleTex = null;
    this.conditionals = [];
    this.lights = [];
    this.waters = [];
    this.updaters = [];
    this.collapsibles = [];
    this.handles.clear();
    this.watchers.clear();
    this.asha = null;
    this.mote = null;
    this.manifest = null;
  }
}
