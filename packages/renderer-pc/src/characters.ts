import * as pc from 'playcanvas';
import type { PlayerState } from '@aleya/game-core';
import type { Builder } from './builder';

/**
 * Procedural stand-in characters. Silhouettes and proportions are authored to
 * read clearly at gameplay framing; faces are intentionally minimal (PRD: avoid
 * exposed complex face animation through framing and radio-driven dialogue).
 * Each rig exposes named joints so authored glTF rigs can replace them later.
 */

interface Ctx {
  onUpdate(fn: (dt: number, time: number) => void): void;
  worldX: number;
}

export class AshaRig {
  readonly root: pc.Entity;
  private body: pc.Entity;
  private hips: pc.Entity;
  private legL: pc.Entity;
  private legR: pc.Entity;
  private kneeL: pc.Entity;
  private kneeR: pc.Entity;
  private armL: pc.Entity;
  private armR: pc.Entity;
  private head: pc.Entity;
  readonly lanternHand: pc.Entity;
  readonly lanternLight: pc.Entity;
  private lanternGlass: pc.Entity;
  private phase = 0;
  private crouch = 0;
  private yaw = 70;
  lanternOn = false;
  private lanternLevel = 0;

  constructor(b: Builder, parent: pc.Entity) {
    this.root = b.group(parent, [0, 0, 0], undefined, 'asha');
    this.body = b.group(this.root, [0, 0, 0]);
    this.hips = b.group(this.body, [0, 0.92, 0]);
    const leg = (side: number) => {
      const hip = b.group(this.hips, [0, 0, side * 0.1]);
      b.prim('capsule', hip, [0, -0.24, 0], [0.13, 0.5, 0.13], 'jeans', { shadows: true });
      const knee = b.group(hip, [0, -0.46, 0]);
      b.prim('capsule', knee, [0, -0.22, 0], [0.11, 0.48, 0.11], 'jeans', { shadows: true });
      b.box(knee, [0.05, -0.44, 0], [0.24, 0.08, 0.1], 'rubber', { shadows: true });
      return [hip, knee] as const;
    };
    [this.legL, this.kneeL] = leg(-1);
    [this.legR, this.kneeR] = leg(1);
    const torso = b.group(this.hips, [0, 0.05, 0]);
    // raincoat: flared lower coat + torso
    b.prim('cone', torso, [0, 0.0, 0], [0.5, 0.55, 0.42], 'raincoat', { shadows: true, rot: [180, 0, 0] });
    b.prim('capsule', torso, [0, 0.33, 0], [0.38, 0.62, 0.3], 'raincoat', { shadows: true });
    b.box(torso, [-0.15, 0.32, 0], [0.1, 0.35, 0.28], 'cloth_dark', { shadows: true }); // camera bag
    b.pole(torso, [0.02, 0.6, -0.14], [-0.14, 0.2, 0.14], 0.012, 'cloth_dark');
    const neck = b.group(torso, [0, 0.62, 0]);
    this.head = b.group(neck, [0, 0.12, 0]);
    b.prim('sphere', this.head, [0, 0.02, 0], [0.19, 0.23, 0.2], 'skin', { shadows: true });
    b.prim('sphere', this.head, [-0.02, 0.06, 0], [0.22, 0.24, 0.22], 'raincoat', { shadows: true }); // hood
    b.prim('sphere', this.head, [-0.03, 0.08, 0], [0.18, 0.18, 0.18], 'hair');
    const arm = (side: number) => {
      const sh = b.group(torso, [0, 0.52, side * 0.2]);
      b.prim('capsule', sh, [0, -0.2, 0], [0.11, 0.44, 0.11], 'raincoat', { shadows: true });
      const el = b.group(sh, [0, -0.38, 0]);
      b.prim('capsule', el, [0, -0.17, 0], [0.09, 0.36, 0.09], 'raincoat', { shadows: true });
      b.prim('sphere', el, [0, -0.36, 0], [0.08, 0.09, 0.08], 'skin');
      return [sh, el] as const;
    };
    [this.armL] = arm(-1);
    const [armR, elbowR] = arm(1);
    this.armR = armR;
    this.lanternHand = b.group(elbowR, [0, -0.4, 0]);
    b.cyl(this.lanternHand, [0, -0.12, 0], 0.07, 0.05, 'brass');
    this.lanternGlass = b.cyl(this.lanternHand, [0, -0.02, 0], 0.055, 0.14, 'bulb_dim');
    b.prim('cone', this.lanternHand, [0, 0.08, 0], [0.12, 0.06, 0.12], 'brass');
    this.lanternLight = new pc.Entity('lanternLight');
    this.lanternLight.addComponent('light', {
      type: 'omni',
      color: new pc.Color(1, 0.62, 0.32),
      intensity: 0,
      range: 7,
      castShadows: true,
      shadowResolution: 512,
      shadowBias: 0.3,
      normalOffsetBias: 0.05,
    });
    this.lanternLight.setLocalPosition(0, 0, 0.05);
    this.lanternHand.addChild(this.lanternLight);
  }

  setShadows(on: boolean): void {
    this.lanternLight.light!.castShadows = on;
  }

  update(dt: number, state: PlayerState, speed: number, facing: 1 | -1, time: number, lanternFlicker: number): void {
    const moving = state === 'Walk' || state === 'Run' || state === 'Crouch' || state === 'Climb';
    const rate = state === 'Run' ? 2.9 : state === 'Crouch' ? 1.3 : 1.9;
    if (moving) this.phase += dt * rate * Math.PI * Math.max(0.6, speed / 1.6);
    const amp = state === 'Run' ? 42 : state === 'Climb' ? 30 : moving ? 26 : 0;
    const s = Math.sin(this.phase);
    const crouchTarget = state === 'Crouch' || state === 'Hide' ? 1 : 0;
    this.crouch += (crouchTarget - this.crouch) * Math.min(1, dt * 8);
    // legs
    this.legL.setLocalEulerAngles(0, 0, s * amp - this.crouch * 50);
    this.legR.setLocalEulerAngles(0, 0, -s * amp - this.crouch * 50);
    this.kneeL.setLocalEulerAngles(0, 0, -Math.max(0, -s) * amp * 1.3 + this.crouch * 95);
    this.kneeR.setLocalEulerAngles(0, 0, -Math.max(0, s) * amp * 1.3 + this.crouch * 95);
    // arms (right arm carries the lantern forward when raised)
    const lanternRaise = this.lanternOn ? 1 : 0;
    this.armL.setLocalEulerAngles(0, 0, -s * amp * 0.8);
    this.armR.setLocalEulerAngles(0, 0, s * amp * 0.5 * (1 - lanternRaise) + lanternRaise * 55);
    const bob = moving ? Math.abs(Math.cos(this.phase)) * (state === 'Run' ? 0.06 : 0.035) : Math.sin(time * 1.6) * 0.008;
    this.hips.setLocalPosition(0, 0.92 + bob - this.crouch * 0.33, 0);
    const lean = state === 'Run' ? 12 : state === 'Hide' ? 25 : this.crouch * 18;
    this.hips.setLocalEulerAngles(0, 0, -lean);
    this.head.setLocalEulerAngles(0, 0, lean * 0.6 + (state === 'Idle' ? Math.sin(time * 0.4) * 4 : 0));
    // facing: side-on with a slight 3/4 turn toward camera for readability
    // forward is local +x; negative yaw turns toward the camera (+z)
    const targetYaw = facing === 1 ? -22 : 202;
    let d = targetYaw - this.yaw;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    this.yaw += d * Math.min(1, dt * 10);
    this.root.setLocalEulerAngles(0, this.yaw, 0);
    // lantern light
    this.lanternLevel += ((this.lanternOn ? 1 : 0) - this.lanternLevel) * Math.min(1, dt * 6);
    const fl = 1 - lanternFlicker * (0.5 + 0.5 * Math.sin(time * 23) * Math.sin(time * 7.3));
    this.lanternLight.light!.intensity = this.lanternLevel * 2.6 * fl;
    this.lanternLight.light!.enabled = this.lanternLevel > 0.02;
    const glass = this.lanternGlass.render!.meshInstances[0].material as pc.StandardMaterial;
    void glass;
    this.lanternGlass.enabled = true;
  }
}

/** Karim: stooped elderly caretaker in lungi, kurta, shawl and cap. */
export function buildKarim(b: Builder, root: pc.Entity, ctx: Ctx): void {
  const body = b.group(root, [0, 0, 0], undefined, 'karim');
  b.prim('cone', body, [0, 0.45, 0], [0.44, 0.9, 0.4], 'lungi', { shadows: true, rot: [180, 0, 0] });
  b.box(body, [0.05, 0.03, 0.08], [0.22, 0.05, 0.1], 'rubber');
  b.box(body, [0.05, 0.03, -0.1], [0.22, 0.05, 0.1], 'rubber');
  const torso = b.group(body, [0, 0.9, 0], [0, 0, -14]);
  b.prim('capsule', torso, [0, 0.28, 0], [0.4, 0.66, 0.3], 'kurta', { shadows: true });
  b.prim('capsule', torso, [0, 0.46, 0], [0.44, 0.3, 0.34], 'shawl', { shadows: true, rot: [90, 0, 0] });
  const head = b.group(torso, [0.06, 0.72, 0]);
  b.prim('sphere', head, [0, 0, 0], [0.19, 0.22, 0.19], 'skin', { shadows: true });
  b.prim('sphere', head, [-0.01, 0.08, 0], [0.19, 0.1, 0.19], 'kurta'); // tupi cap
  b.prim('sphere', head, [0.06, -0.08, 0], [0.12, 0.1, 0.15], 'paper'); // white beard
  for (const z of [-0.2, 0.2]) {
    const arm = b.group(torso, [0, 0.48, z], [0, 0, z > 0 ? 20 : 8]);
    b.prim('capsule', arm, [0, -0.3, 0], [0.1, 0.62, 0.1], 'kurta', { shadows: true });
  }
  b.pole(body, [0.32, 0, 0.2], [0.28, 1.05, 0.2], 0.022, 'bamboo'); // walking stick
  ctx.onUpdate((_dt, t) => {
    torso.setLocalEulerAngles(0, 0, -14 + Math.sin(t * 0.9 + ctx.worldX) * 2);
    head.setLocalEulerAngles(0, Math.sin(t * 0.3) * 12, 0);
  });
}

/** The River Watcher: tall, distorted silhouette; never shown in full light. */
export class WatcherRig {
  readonly root: pc.Entity;
  private body: pc.Entity;
  private eyes: pc.Entity;
  readonly torch: pc.Entity;
  private presence = 0;

  constructor(b: Builder, parent: pc.Entity, withTorch: boolean) {
    this.root = b.group(parent, [0, 0, 0], undefined, 'watcher');
    this.body = b.group(this.root);
    b.prim('cone', this.body, [0, 1.0, 0], [0.9, 2.0, 0.7], 'watcher', { shadows: true, rot: [180, 0, 0] });
    b.prim('capsule', this.body, [0, 1.85, 0], [0.42, 0.9, 0.36], 'watcher', { shadows: true });
    b.prim('sphere', this.body, [0.04, 2.45, 0], [0.26, 0.36, 0.26], 'watcher', { shadows: true });
    for (const z of [-0.26, 0.26]) b.prim('capsule', this.body, [0.05, 1.45, z], [0.08, 1.4, 0.08], 'watcher', { shadows: true, rot: [0, 0, 6] });
    this.eyes = b.group(this.body, [0.15, 2.48, 0]);
    for (const z of [-0.05, 0.05]) b.prim('sphere', this.eyes, [0, 0, z], [0.025, 0.012, 0.025], 'bulb_cool');
    this.torch = new pc.Entity('watcherTorch');
    this.torch.addComponent('light', {
      type: 'spot',
      color: new pc.Color(0.85, 0.9, 1),
      intensity: 0,
      range: 30,
      innerConeAngle: 8,
      outerConeAngle: 16,
      castShadows: false,
    });
    this.torch.setLocalPosition(0.3, 2.0, 0);
    this.root.addChild(this.torch);
    this.torch.enabled = withTorch;
    this.root.enabled = false;
  }

  update(dt: number, time: number, presence: number, visible: boolean, facing: 1 | -1): void {
    this.root.enabled = visible || this.presence > 0.02;
    this.presence += ((visible ? presence : 0) - this.presence) * Math.min(1, dt * 4);
    // distortion: subtle non-uniform jitter and sway, stronger with presence
    const j = 0.02 + this.presence * 0.04;
    this.body.setLocalScale(1 + Math.sin(time * 13) * j, 1 + Math.sin(time * 7.7) * j * 0.6, 1);
    this.body.setLocalEulerAngles(Math.sin(time * 1.3) * 3, facing === 1 ? 0 : 180, Math.sin(time * 0.8) * 4);
    this.eyes.enabled = this.presence > 0.5 && Math.sin(time * 3.1) > -0.6;
  }

  aimTorch(target: pc.Vec3, intensity: number): void {
    this.torch.lookAt(target);
    this.torch.rotateLocal(90, 0, 0);
    this.torch.light!.intensity = intensity;
  }
}
