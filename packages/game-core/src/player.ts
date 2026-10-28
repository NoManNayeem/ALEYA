import type { NavConstraint, NavResult } from './nav';

export type PlayerState = 'Idle' | 'Walk' | 'Run' | 'Crouch' | 'Interact' | 'Climb' | 'Stumble' | 'Hide' | 'Cutscene';

export const SPEED = { walk: 1.6, run: 2.8, crouch: 0.8 } as const;
const ACCEL = 9;
const DECEL = 12;

export interface PlayerIntent {
  moveX: number;
  moveZ: number;
  run: boolean;
  crouch: boolean;
}

/** Engine-independent player movement using normalized vectors and acceleration. */
export class PlayerMotor {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vz = 0;
  facing: 1 | -1 = 1;
  state: PlayerState = 'Idle';
  lastNav?: NavResult;
  /** distance travelled, drives footstep cadence and walk cycle */
  stride = 0;
  private lockTimer = 0;
  private lockState: PlayerState | null = null;

  constructor(private nav: NavConstraint) {}

  setNav(nav: NavConstraint): void {
    this.nav = nav;
  }

  teleport(x: number, y: number, z: number, facing: 1 | -1 = 1): void {
    const r = this.nav.resolve(x, z, x, z);
    this.x = r.x;
    this.y = r.y;
    this.z = r.z;
    void y;
    this.vx = this.vz = 0;
    this.facing = facing;
    this.state = 'Idle';
  }

  /** Temporarily force a state (Interact, Stumble) for a duration. */
  lock(state: PlayerState, seconds: number): void {
    this.lockState = state;
    this.lockTimer = seconds;
  }

  setCutscene(on: boolean): void {
    this.lockState = on ? 'Cutscene' : null;
    this.lockTimer = on ? Infinity : 0;
    if (on) this.vx = this.vz = 0;
  }

  get inCutscene(): boolean {
    return this.lockState === 'Cutscene';
  }

  update(dt: number, intent: PlayerIntent, inHideZone: boolean): NavResult | undefined {
    if (this.lockState) {
      this.lockTimer -= dt;
      if (this.lockTimer <= 0) this.lockState = null;
    }
    const locked = this.lockState !== null;
    let mx = locked ? 0 : intent.moveX;
    let mz = locked ? 0 : intent.moveZ;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    const crouch = intent.crouch && !locked;
    const speed = crouch ? SPEED.crouch : intent.run ? SPEED.run : SPEED.walk;
    // depth movement is slower to keep the 2.5D lane readable
    const tx = mx * speed;
    const tz = mz * speed * 0.6;
    const approach = (v: number, t: number) => {
      const rate = Math.abs(t) > Math.abs(v) ? ACCEL : DECEL;
      const d = t - v;
      const step = rate * dt;
      return Math.abs(d) <= step ? t : v + Math.sign(d) * step;
    };
    this.vx = approach(this.vx, tx);
    this.vz = approach(this.vz, tz);
    const r = this.nav.resolve(this.x, this.z, this.x + this.vx * dt, this.z + this.vz * dt);
    const moved = Math.hypot(r.x - this.x, r.z - this.z);
    if (Math.abs(r.x - (this.x + this.vx * dt)) > 1e-4) this.vx = 0;
    this.stride += moved;
    this.x = r.x;
    this.y = r.y;
    this.z = r.z;
    if (Math.abs(mx) > 0.1) this.facing = mx > 0 ? 1 : -1;
    this.lastNav = r;

    if (this.lockState) this.state = this.lockState;
    else if (crouch && inHideZone && moved / Math.max(dt, 1e-6) < 0.2) this.state = 'Hide';
    else if (crouch) this.state = 'Crouch';
    else if (moved / Math.max(dt, 1e-6) < 0.05) this.state = 'Idle';
    else if (Math.abs(r.slope) > 0.45) this.state = 'Climb';
    else this.state = intent.run ? 'Run' : 'Walk';
    return r;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }
}
