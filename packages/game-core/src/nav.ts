import type { Barrier, NavLane, StaticCollider } from '@aleya/content-schema';
import type { FlagStore } from './flags';

export interface NavResult {
  x: number;
  y: number;
  z: number;
  blockedBy?: Barrier;
  /** slope dy/dx of the lane at this point (used for Climb state) */
  slope: number;
}

export function laneHeight(lane: NavLane, x: number): number {
  const y1 = lane.y1 ?? lane.y0;
  const t = lane.x1 === lane.x0 ? 0 : (x - lane.x0) / (lane.x1 - lane.x0);
  return lane.y0 + (y1 - lane.y0) * Math.min(1, Math.max(0, t));
}

/**
 * Constrains a proposed position to the authored 2.5D lanes. The player can never
 * leave the lanes, so no unscripted falls are possible (edge detection by construction).
 */
export class NavConstraint {
  readonly minX: number;
  readonly maxX: number;

  constructor(
    private readonly lanes: readonly NavLane[],
    private readonly barriers: readonly Barrier[],
    private readonly colliders: readonly StaticCollider[],
    private readonly flags: FlagStore,
  ) {
    this.minX = Math.min(...lanes.map((l) => l.x0));
    this.maxX = Math.max(...lanes.map((l) => l.x1));
  }

  lanesAt(x: number): NavLane[] {
    return this.lanes.filter((l) => x >= l.x0 - 1e-6 && x <= l.x1 + 1e-6);
  }

  /** Effective x limits given current flags. */
  limits(fromX: number): { min: number; max: number; maxBarrier?: Barrier; minBarrier?: Barrier } {
    let min = this.minX;
    let max = this.maxX;
    let maxBarrier: Barrier | undefined;
    let minBarrier: Barrier | undefined;
    for (const b of this.barriers) {
      if (this.flags.test(b.until) && b.until) continue;
      if (b.side === 'max' && b.x >= fromX - 0.01 && b.x < max) {
        max = b.x;
        maxBarrier = b;
      }
      if (b.side === 'min' && b.x <= fromX + 0.01 && b.x > min) {
        min = b.x;
        minBarrier = b;
      }
    }
    return { min, max, maxBarrier, minBarrier };
  }

  resolve(fromX: number, fromZ: number, toX: number, toZ: number): NavResult {
    const lim = this.limits(fromX);
    let blockedBy: Barrier | undefined;
    let x = toX;
    if (x > lim.max) {
      x = lim.max;
      blockedBy = lim.maxBarrier;
    }
    if (x < lim.min) {
      x = lim.min;
      blockedBy = lim.minBarrier;
    }
    let candidates = this.lanesAt(x);
    if (candidates.length === 0) {
      // gap between lanes: stay where we were laterally
      x = fromX;
      candidates = this.lanesAt(x);
    }
    let lane = candidates[0];
    let best = Infinity;
    for (const l of candidates) {
      const d = toZ < l.z0 ? l.z0 - toZ : toZ > l.z1 ? toZ - l.z1 : 0;
      if (d < best) {
        best = d;
        lane = l;
      }
    }
    let z = Math.min(lane.z1, Math.max(lane.z0, toZ));
    for (const c of this.colliders) {
      if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) {
        // revert the axis that entered the collider
        const wasInsideX = fromX > c.x0 && fromX < c.x1;
        if (!wasInsideX) x = fromX;
        else z = fromZ;
      }
    }
    const y = laneHeight(lane, x);
    const dx = 0.05;
    const slope = (laneHeight(lane, Math.min(lane.x1, x + dx)) - laneHeight(lane, Math.max(lane.x0, x - dx))) / (2 * dx);
    return { x, y, z, blockedBy, slope };
  }
}
