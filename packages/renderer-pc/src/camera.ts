import * as pc from 'playcanvas';
import type { CameraRail, Shot } from '@aleya/content-schema';

export type CameraMode = 'GameplayFollow' | 'Establishing' | 'Inspect' | 'Dialogue' | 'Reveal' | 'Chase' | 'Choice' | 'Ending';

const ease = {
  linear: (t: number) => t,
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
};

interface Pose {
  pos: pc.Vec3;
  target: pc.Vec3;
  fov: number;
}

/**
 * Rail-constrained 2.5D camera. GameplayFollow tracks the player along authored
 * rails with lateral lag and look-ahead; data-driven shots blend in and out.
 * Shake is removable (accessibility) and reduced-motion shortens lag/moves.
 */
export class CameraDirector {
  mode: CameraMode = 'GameplayFollow';
  shakeEnabled = true;
  reducedMotion = false;
  private rails: CameraRail[] = [];
  private shot: Shot | null = null;
  private shotTime = 0;
  private blend = 1;
  private blendFrom: Pose | null = null;
  private current: Pose = { pos: new pc.Vec3(0, 2, 8), target: new pc.Vec3(), fov: 40 };
  private follow: Pose = { pos: new pc.Vec3(0, 2, 8), target: new pc.Vec3(), fov: 40 };
  private railOffset = new pc.Vec3(0, 2, 7.5);
  private railLook = new pc.Vec3(0.6, 1.1, 0);
  private railFov = 40;
  private lookAhead = 0;
  private shake = 0;
  private shotShake = 0;
  private tmp = new pc.Vec3();

  constructor(readonly camera: pc.Entity) {}

  setRails(rails: CameraRail[]): void {
    this.rails = rails;
  }

  /** Snap the follow camera to the player (scene load, checkpoint). */
  snap(px: number, py: number, pz: number, facing: number): void {
    this.lookAhead = facing * 0.6;
    this.updateFollow(1, px, py, pz, facing, true);
    this.current = clonePose(this.follow);
    this.shot = null;
    this.mode = 'GameplayFollow';
    this.blend = 1;
    this.apply(0);
  }

  playShot(shot: Shot): number {
    this.blendFrom = clonePose(this.current);
    this.shot = shot;
    this.shotTime = 0;
    this.blend = 0;
    this.mode = shot.kind;
    this.shotShake = shot.shake;
    return shot.keys[shot.keys.length - 1].t;
  }

  returnToFollow(): void {
    if (!this.shot && this.mode === 'GameplayFollow') return;
    this.blendFrom = clonePose(this.current);
    this.shot = null;
    this.blend = 0;
    this.mode = 'GameplayFollow';
    this.shotShake = 0;
  }

  addShake(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  get inShot(): boolean {
    return this.shot !== null;
  }

  private updateFollow(dt: number, px: number, py: number, pz: number, facing: number, instant = false): void {
    const rail = this.rails.find((r) => px >= r.x0 && px < r.x1) ?? this.rails[0];
    const k = instant ? 1 : Math.min(1, dt * 1.6);
    if (rail) {
      this.railOffset.lerp(this.railOffset, new pc.Vec3(...rail.offset), k);
      this.railLook.lerp(this.railLook, new pc.Vec3(...rail.look), k);
      this.railFov += (rail.fov - this.railFov) * k;
    }
    const aheadTarget = facing * (this.reducedMotion ? 0.3 : 0.9);
    this.lookAhead += (aheadTarget - this.lookAhead) * (instant ? 1 : Math.min(1, dt * 0.9));
    const lag = instant ? 1 : Math.min(1, dt * (this.reducedMotion ? 6 : 3.2));
    const desired = this.tmp.set(px + this.railOffset.x + this.lookAhead * 0.6, this.railOffset.y + py * 0.7, this.railOffset.z + pz * 0.35);
    this.follow.pos.lerp(this.follow.pos, desired, lag);
    const tgt = new pc.Vec3(px + this.railLook.x * Math.sign(facing || 1) * 0.4 + this.lookAhead, py + this.railLook.y, pz * 0.5 + this.railLook.z);
    this.follow.target.lerp(this.follow.target, tgt, instant ? 1 : Math.min(1, dt * 4));
    this.follow.fov = this.railFov;
  }

  update(dt: number, px: number, py: number, pz: number, facing: number, time: number): void {
    this.updateFollow(dt, px, py, pz, facing);
    let pose: Pose;
    if (this.shot) {
      this.shotTime += dt;
      pose = this.sampleShot(this.shot, this.shotTime);
      const end = this.shot.keys[this.shot.keys.length - 1].t;
      if (this.shotTime > end && !this.shot.hold) this.returnToFollow();
    } else pose = this.follow;
    if (this.blend < 1 && this.blendFrom) {
      this.blend = Math.min(1, this.blend + dt / (this.reducedMotion ? 0.5 : 1.1));
      const t = ease.inOut(this.blend);
      this.current = lerpPose(this.blendFrom, pose, t);
    } else this.current = clonePose(pose);
    this.apply(time);
    this.shake = Math.max(0, this.shake - dt * 1.4);
  }

  private sampleShot(shot: Shot, t: number): Pose {
    const keys = shot.keys;
    if (keys.length === 1 || t <= keys[0].t) return keyPose(keys[0]);
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i];
      const b = keys[i + 1];
      if (t <= b.t) {
        const u = ease[shot.ease]((t - a.t) / Math.max(1e-4, b.t - a.t));
        return lerpPose(keyPose(a), keyPose(b), u);
      }
    }
    return keyPose(keys[keys.length - 1]);
  }

  private apply(time: number): void {
    const p = this.current.pos.clone();
    const amt = this.shakeEnabled ? this.shake * 0.12 + this.shotShake : 0;
    if (amt > 0) {
      p.x += Math.sin(time * 37) * amt;
      p.y += Math.sin(time * 41 + 1) * amt;
    }
    // subtle handheld drift for a cinematic feel (disabled in reduced motion)
    if (!this.reducedMotion) {
      p.x += Math.sin(time * 0.37) * 0.025;
      p.y += Math.sin(time * 0.53) * 0.02;
    }
    this.camera.setPosition(p);
    this.camera.lookAt(this.current.target);
    this.camera.camera!.fov = this.current.fov;
  }

  get position(): pc.Vec3 {
    return this.current.pos;
  }
}

function keyPose(k: Shot['keys'][number]): Pose {
  return { pos: new pc.Vec3(...k.pos), target: new pc.Vec3(...k.target), fov: k.fov ?? 40 };
}

function clonePose(p: Pose): Pose {
  return { pos: p.pos.clone(), target: p.target.clone(), fov: p.fov };
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    pos: new pc.Vec3().lerp(a.pos, b.pos, t),
    target: new pc.Vec3().lerp(a.target, b.target, t),
    fov: a.fov + (b.fov - a.fov) * t,
  };
}
