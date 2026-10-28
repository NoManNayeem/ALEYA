import * as pc from 'playcanvas';
import type { PlayerState } from '@aleya/game-core';
import type { MaterialLibrary } from './materials';

/**
 * Realistic skinned characters built from CC0 MakeHuman assets
 * (tools/asset-pipeline/build_characters.py). The game rig has identity rest
 * rotations, so procedural poses are authored directly in model space:
 * model faces +Z, character's left is +X, up is +Y.
 */

export type CharacterId = 'asha' | 'karim' | 'watcher';

/** Maps GLB material slots to PBR materials (cloth tiled finer on the body atlas). */
const SLOT: Record<string, { base?: string; color?: string; gloss?: number; tile?: number; emissive?: string }> = {
  skin: { color: '#8a5a3e', gloss: 0.42 },
  skin_old: { color: '#76503a', gloss: 0.36 },
  eye: { color: '#1b120c', gloss: 0.92 },
  sclera: { color: '#9c958a', gloss: 0.9 },
  iris: { color: '#2e1c10', gloss: 0.95 },
  pupil: { color: '#050404', gloss: 0.97 },
  eye_glow: { color: '#000000', emissive: '#bfe0ff' },
  hair: { color: '#0d0b0a', gloss: 0.55 },
  hair_grey: { color: '#8e8a82', gloss: 0.4 },
  beard: { color: '#cfcac1', gloss: 0.25 },
  raincoat: { base: 'raincoat', tile: 2 },
  jeans: { color: '#2b3546', gloss: 0.3 },
  rubber: { base: 'rubber' },
  kurta: { color: '#c7c0ad', gloss: 0.22 },
  lungi: { base: 'lungi', tile: 4 },
  shawl: { color: '#5b4a3a', gloss: 0.2 },
  watcher: { color: '#040405', gloss: 0.12 },
};

export class CharacterLibrary {
  private assets = new Map<CharacterId, pc.Asset>();
  private materials = new Map<string, pc.StandardMaterial>();

  constructor(private app: pc.AppBase) {}

  async load(urls: Partial<Record<CharacterId, string>>): Promise<void> {
    await Promise.all(
      Object.entries(urls).map(
        ([id, url]) =>
          new Promise<void>((resolve) => {
            this.app.assets.loadFromUrl(url!, 'container', (err, asset) => {
              if (err || !asset) console.warn(`[characters] ${id} failed to load`, err);
              else this.assets.set(id as CharacterId, asset);
              resolve();
            });
          }),
      ),
    );
  }

  has(id: CharacterId): boolean {
    return this.assets.has(id);
  }

  private material(slot: string, mats: MaterialLibrary, sceneId: string): pc.StandardMaterial {
    const key = `${slot}@${mats.tier}`;
    const cached = this.materials.get(key);
    if (cached) return cached;
    const def = SLOT[slot] ?? { color: '#777777' };
    let m: pc.StandardMaterial;
    if (def.base) {
      m = mats.get(def.base, 'shared').clone();
      if (def.tile) {
        const t = new pc.Vec2(def.tile, def.tile);
        m.diffuseMapTiling = t;
        m.normalMapTiling = t;
        m.glossMapTiling = t;
      }
    } else {
      m = new pc.StandardMaterial();
      m.useMetalness = true;
      m.metalness = 0;
      m.diffuse = new pc.Color().fromString(def.color!);
      m.gloss = def.gloss ?? 0.4;
      if (def.emissive) {
        m.emissive = new pc.Color().fromString(def.emissive);
        m.emissiveIntensity = 4;
        m.useLighting = false;
      }
    }
    m.cull = pc.CULLFACE_NONE;
    m.name = `char:${slot}`;
    m.update();
    void sceneId;
    this.materials.set(key, m);
    return m;
  }

  /** New instance of a character with PBR materials applied, or null if unavailable. */
  instantiate(id: CharacterId, mats: MaterialLibrary, sceneId: string, shadows: boolean): pc.Entity | null {
    const asset = this.assets.get(id);
    if (!asset) return null;
    const res = asset.resource as { instantiateRenderEntity(): pc.Entity };
    const e = res.instantiateRenderEntity();
    for (const r of e.findComponents('render') as pc.RenderComponent[]) {
      r.castShadows = shadows;
      r.receiveShadows = true;
      for (const mi of r.meshInstances) {
        const slot = (mi.material?.name ?? '').replace(/^char:/, '');
        mi.material = this.material(slot, mats, sceneId);
      }
    }
    return e;
  }
}

const q = new pc.Quat();
const qa = new pc.Quat();
const qb = new pc.Quat();

/** Rotation in degrees in the bone's parent frame: Z (roll) first, then X (swing), then Y (twist). */
function setRot(bone: pc.Entity | undefined, x: number, y = 0, z = 0): void {
  if (!bone) return;
  qa.setFromAxisAngle(pc.Vec3.RIGHT, x);
  qb.setFromAxisAngle(pc.Vec3.BACK, z);
  q.mul2(qa, qb);
  if (y) {
    qb.setFromAxisAngle(pc.Vec3.UP, y);
    q.mul2(qb, q);
  }
  bone.setLocalRotation(q);
}

export interface HumanOptions {
  id: CharacterId;
  /** attach a hurricane lantern + light to the right hand */
  lantern?: boolean;
  /** walking stick prop (Karim) */
  stick?: boolean;
}

/**
 * Procedural animation over the MakeHuman game rig: walk/run cycle, crouch/hide,
 * climb, stumble, interact reach, idle breathing, stoop (age), lantern carry.
 */
export class HumanRig {
  readonly root: pc.Entity;
  private model: pc.Entity;
  private b = new Map<string, pc.Entity>();
  private rest = new Map<string, pc.Vec3>();
  private armDrop = 48;
  private phase = 0;
  private crouch = 0;
  private yaw = 70;
  private lanternLevel = 0;
  lanternOn = false;
  /** whether the lantern is carried at all (picked up) */
  hasLantern = false;
  private lanternHolder: pc.Entity | null = null;
  readonly lanternLight: pc.Entity | null = null;
  private lanternGlass: pc.Entity | null = null;
  stoop = 0;
  /** watcher distortion amount */
  distortion = 0;

  constructor(instance: pc.Entity, parent: pc.Entity, opts: HumanOptions, mats: MaterialLibrary) {
    this.root = new pc.Entity(`human:${opts.id}`);
    this.model = new pc.Entity('model');
    // model faces +Z; game convention faces +X
    this.model.setLocalEulerAngles(0, 90, 0);
    this.root.addChild(this.model);
    this.model.addChild(instance);
    parent.addChild(this.root);
    for (const name of ['root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head', 'upperleg01.L', 'upperleg01.R', 'lowerleg01.L', 'lowerleg01.R', 'foot.L', 'foot.R', 'clavicle.L', 'clavicle.R', 'upperarm01.L', 'upperarm01.R', 'lowerarm01.L', 'lowerarm01.R', 'wrist.L', 'wrist.R']) {
      const e = instance.findByName(name) as pc.Entity | null;
      if (e) {
        this.b.set(name, e);
        this.rest.set(name, e.getLocalPosition().clone());
      }
    }
    // measure the A-pose so arms can hang naturally at the sides
    const sh = this.b.get('upperarm01.L');
    const el = this.b.get('lowerarm01.L');
    if (sh && el) {
      const v = el.getLocalPosition();
      this.armDrop = Math.atan2(Math.abs(v.x), -v.y) * pc.math.RAD_TO_DEG - 9;
    }
    if (opts.lantern) {
      const hand = this.b.get('wrist.R');
      if (hand) {
        const holder = new pc.Entity('lantern');
        holder.setLocalPosition(0, -0.1, 0);
        hand.addChild(holder);
        this.lanternHolder = holder;
        const brass = mats.get('brass', 'shared');
        const prim = (type: 'cylinder' | 'cone' | 'torus', pos: [number, number, number], scale: [number, number, number], m: pc.Material) => {
          const p = new pc.Entity();
          p.addComponent('render', { type, material: m, castShadows: false });
          p.setLocalPosition(...pos);
          p.setLocalScale(...scale);
          holder.addChild(p);
          return p;
        };
        // hurricane lantern (~24 cm) hanging below the handle
        prim('torus', [0, 0, 0], [0.07, 0.07, 0.07], mats.get('metal_dark', 'shared'));
        prim('cone', [0, -0.05, 0], [0.1, 0.05, 0.1], brass);
        this.lanternGlass = prim('cylinder', [0, -0.13, 0], [0.085, 0.11, 0.085], mats.get('bulb_warm', 'shared'));
        prim('cylinder', [0, -0.2, 0], [0.11, 0.03, 0.11], brass);
        const light = new pc.Entity('lanternLight');
        light.addComponent('light', { type: 'omni', color: new pc.Color(1, 0.62, 0.32), intensity: 0, range: 7, castShadows: false });
        light.setLocalPosition(0, -0.13, 0.04);
        holder.addChild(light);
        (this as { lanternLight: pc.Entity | null }).lanternLight = light;
      }
    }
    if (opts.stick) {
      const hand = this.b.get('wrist.R');
      if (hand) {
        const s = new pc.Entity('stick');
        s.addComponent('render', { type: 'cylinder', material: mats.get('bamboo', 'shared') });
        s.setLocalScale(0.035, 1.05, 0.035);
        s.setLocalPosition(0, -0.45, 0.05);
        hand.addChild(s);
      }
    }
  }

  /** the hand lantern never self-shadows (it sits inside the character's silhouette) */
  setShadows(_on: boolean): void {}

  get bones(): Map<string, pc.Entity> {
    return this.b;
  }

  /** Main update; mirrors the stand-in rig API. */
  update(dt: number, state: PlayerState, speed: number, facing: 1 | -1, time: number, lanternFlicker = 0.12): void {
    const moving = state === 'Walk' || state === 'Run' || state === 'Crouch' || state === 'Climb';
    const run = state === 'Run';
    const rate = run ? 1.45 : state === 'Crouch' ? 0.75 : 1.0;
    if (moving) this.phase += dt * Math.PI * 2 * rate * Math.max(0.7, speed / 1.6) * 0.9;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const crouchTarget = state === 'Hide' ? 1.15 : state === 'Crouch' ? 0.85 : 0;
    this.crouch += (crouchTarget - this.crouch) * Math.min(1, dt * 7);
    const k = this.crouch;
    const amp = moving ? (run ? 38 : state === 'Climb' ? 34 : state === 'Crouch' ? 20 : 26) : 0;
    const stumble = state === 'Stumble' ? 1 : 0;

    // legs: thigh swing (negative X = forward), knee bend during swing, foot stays level
    const thighL = -s * amp - k * 62;
    const thighR = s * amp - k * 62;
    const kneeL = Math.max(0, c) * amp * 1.5 + k * 105 + (moving ? 6 : 0);
    const kneeR = Math.max(0, -c) * amp * 1.5 + k * 105 + (moving ? 6 : 0);
    setRot(this.b.get('upperleg01.L'), thighL, 0, 0);
    setRot(this.b.get('upperleg01.R'), thighR, 0, 0);
    setRot(this.b.get('lowerleg01.L'), kneeL);
    setRot(this.b.get('lowerleg01.R'), kneeR);
    setRot(this.b.get('foot.L'), -(thighL + kneeL) * 0.55);
    setRot(this.b.get('foot.R'), -(thighR + kneeR) * 0.55);

    // pelvis: bob, sway, crouch drop
    const root = this.b.get('root');
    const r0 = this.rest.get('root');
    if (root && r0) {
      const bob = moving ? -Math.abs(c) * (run ? 0.045 : 0.025) : Math.sin(time * 1.4) * 0.004;
      root.setLocalPosition(r0.x, r0.y + bob - k * 0.36, r0.z);
      setRot(root, 0, moving ? s * 5 : 0, moving ? c * 2.5 : 0);
    }

    // spine: lean for run/crouch/age, counter-rotation, breathing
    const lean = (run ? 14 : 0) + k * 24 + this.stoop + stumble * 18;
    const breath = Math.sin(time * 1.5) * 1.2;
    setRot(this.b.get('spine04'), (lean * 0.35 + breath * 0.3), moving ? -s * 4 : 0, 0);
    setRot(this.b.get('spine02'), (lean * 0.4 + breath), moving ? -s * 3 : 0, 0);
    setRot(this.b.get('neck01'), -(lean * 0.45 + this.stoop * 0.4), state === 'Idle' ? Math.sin(time * 0.35) * 14 : 0, 0);
    setRot(this.b.get('head'), (-6 + (state === 'Idle' ? Math.sin(time * 0.5) * 3 : 0)), 0, 0);

    // arms: hang at the sides, swing opposite to legs; right arm carries the lantern
    const armAmp = moving ? amp * (run ? 1.1 : 0.75) : 0;
    const drop = this.armDrop;
    const raise = this.lanternOn ? 1 : 0;
    const reach = state === 'Interact' ? 1 : 0;
    setRot(this.b.get('upperarm01.L'), (s * armAmp + stumble * -50), 0, (-drop + stumble * 40));
    setRot(this.b.get('lowerarm01.L'), -(14 + Math.max(0, s) * armAmp * 0.6 + (run ? 45 : 0) + k * 20));
    const rArmSwing = -s * armAmp * (1 - raise * 0.7) - raise * 28 - reach * 55;
    setRot(this.b.get('upperarm01.R'), (rArmSwing + stumble * -50), 0, (drop - stumble * 40 - raise * 6));
    setRot(this.b.get('lowerarm01.R'), -(14 + raise * 62 + reach * 20 + (run && !raise ? 45 : 0) + Math.max(0, -s) * armAmp * 0.6 * (1 - raise)));
    setRot(this.b.get('wrist.R'), raise * 30);

    // facing: side-on with a slight 3/4 turn toward camera
    const targetYaw = facing === 1 ? -22 : 202;
    let d = targetYaw - this.yaw;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    this.yaw += d * Math.min(1, dt * 10);
    this.root.setLocalEulerAngles(0, this.yaw, 0);

    if (this.distortion > 0) {
      const j = this.distortion;
      this.model.setLocalScale(1 + Math.sin(time * 13) * 0.03 * j, 1 + Math.sin(time * 7.7) * 0.025 * j, 1);
    }

    if (this.lanternHolder) {
      this.lanternHolder.enabled = this.hasLantern;
      // gravity: the lantern always hangs upright, with a little lag sway
      this.lanternHolder.setRotation(new pc.Quat().setFromEulerAngles(Math.sin(time * 2.1) * 4 * (moving ? 1.5 : 0.4), 0, Math.cos(time * 1.7) * 3));
      if (this.lanternGlass) {
        const gm = this.lanternGlass.render!.meshInstances[0];
        gm.visible = true;
      }
    }
    if (this.lanternLight) {
      this.lanternLevel += ((this.lanternOn ? 1 : 0) - this.lanternLevel) * Math.min(1, dt * 6);
      const fl = 1 - lanternFlicker * (0.5 + 0.5 * Math.sin(time * 23) * Math.sin(time * 7.3));
      this.lanternLight.light!.intensity = this.lanternLevel * 2.6 * fl;
      this.lanternLight.enabled = this.lanternLevel > 0.02;
      if (this.lanternGlass) this.lanternGlass.enabled = true;
    }
  }

  /** Simple standing pose for NPCs. */
  idle(dt: number, time: number): void {
    this.update(dt, 'Idle', 0, 1, time, 0);
  }

  /** NPCs face a fixed yaw (degrees) rather than the player convention. */
  faceYaw(deg: number): void {
    this.yaw = deg;
    this.root.setLocalEulerAngles(0, deg, 0);
  }
}

/** The River Watcher on the realistic rig: elongated, dark, subtly distorted, with a torch for patrols. */
export class WatcherHuman {
  readonly root: pc.Entity;
  readonly torch: pc.Entity;
  private presence = 0;
  private lastX = 0;
  private speed = 0;

  constructor(readonly rig: HumanRig, withTorch: boolean) {
    this.root = rig.root;
    rig.distortion = 1;
    this.torch = new pc.Entity('watcherTorch');
    this.torch.addComponent('light', { type: 'spot', color: new pc.Color(0.85, 0.9, 1), intensity: 0, range: 30, innerConeAngle: 8, outerConeAngle: 16, castShadows: false });
    this.torch.setLocalPosition(0.3, 1.9, 0);
    this.root.addChild(this.torch);
    this.torch.enabled = withTorch;
    this.root.enabled = false;
  }

  update(dt: number, time: number, presence: number, visible: boolean, facing: 1 | -1): void {
    this.root.enabled = visible || this.presence > 0.02;
    this.presence += ((visible ? presence : 0) - this.presence) * Math.min(1, dt * 4);
    const x = this.root.getLocalPosition().x;
    const v = dt > 0 ? Math.abs(x - this.lastX) / dt : 0;
    this.lastX = x;
    this.speed += (v - this.speed) * Math.min(1, dt * 6);
    this.rig.stoop = 8;
    this.rig.update(dt, this.speed > 2.2 ? 'Run' : this.speed > 0.2 ? 'Walk' : 'Idle', this.speed, facing, time, 0);
  }

  aimTorch(target: pc.Vec3, intensity: number): void {
    this.torch.lookAt(target);
    this.torch.rotateLocal(90, 0, 0);
    this.torch.light!.intensity = intensity;
  }
}
