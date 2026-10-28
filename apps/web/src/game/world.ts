import type { InteractableDef, SceneManifest, TriggerDef } from '@aleya/content-schema';
import { type GameSession, NavConstraint, PlayerMotor, ThreatController, type ThreatEvent, laneHeight } from '@aleya/game-core';
import type { Surface } from '@aleya/audio';
import type { ThreatView } from '@aleya/renderer-pc';

/**
 * Runtime state for the currently loaded location: navigation, the player motor,
 * interactables, triggers and condition-driven threats. Engine-independent.
 */
export class SceneWorld {
  readonly nav: NavConstraint;
  readonly motor: PlayerMotor;
  readonly threats = new Map<string, ThreatController>();
  private escaped = new Set<string>();
  lanternOn = false;
  nearest: InteractableDef | null = null;

  constructor(
    readonly manifest: SceneManifest,
    private session: GameSession,
    lowTension: boolean,
  ) {
    this.nav = new NavConstraint(manifest.navLanes, manifest.barriers, manifest.staticColliders, session.flags);
    this.motor = new PlayerMotor(this.nav);
    for (const t of manifest.threats) this.threats.set(t.id, new ThreatController(t, { lowTension }));
  }

  get key(): string {
    return this.manifest.id.split('.').pop()!;
  }

  setLowTension(on: boolean): void {
    this.threats.forEach((t) => t.setOptions({ lowTension: on }));
  }

  /** Resolve a checkpoint id or spawn id to a spawn point. */
  spawnFor(id: string) {
    const cp = this.manifest.checkpoints.find((c) => c.id === id);
    const spawnId = cp ? cp.spawn : id;
    return this.manifest.spawnPoints.find((s) => s.id === spawnId) ?? this.manifest.spawnPoints[0];
  }

  spawn(id: string): void {
    const s = this.spawnFor(id);
    this.motor.teleport(s.pos[0], s.pos[1], s.pos[2], s.facing);
  }

  inHideZone(): boolean {
    const x = this.motor.x;
    return this.manifest.hideZones.some((z) => x >= z.x0 && x <= z.x1);
  }

  get hidden(): boolean {
    return this.inHideZone() && (this.motor.state === 'Hide' || this.motor.state === 'Crouch');
  }

  surface(): Surface {
    const lanes = this.nav.lanesAt(this.motor.x);
    return (lanes[0]?.surface ?? 'mud') as Surface;
  }

  heightAt(x: number): number {
    const lane = this.nav.lanesAt(x)[0];
    return lane ? laneHeight(lane, x) : 0;
  }

  findInteractable(): InteractableDef | null {
    const m = this.motor;
    let best: InteractableDef | null = null;
    let bestD = Infinity;
    for (const it of this.manifest.interactables) {
      if (!this.session.flags.test(it.when)) continue;
      if (it.once && this.session.flags.has(`${it.id}.used`)) continue;
      const dx = it.pos[0] - m.x;
      const dz = (it.pos[2] - m.z) * 0.6;
      const dy = it.pos[1] - (m.y + 1);
      if (Math.abs(dy) > 2) continue;
      const d = Math.hypot(dx, dz);
      // must be roughly in front of, or very close to, Asha
      if (d > it.radius || (d > 0.6 && Math.sign(dx) !== m.facing && Math.abs(dx) > 0.5)) continue;
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    this.nearest = best;
    return best;
  }

  /** Triggers whose x-range contains the player and whose condition holds, not yet fired. */
  pendingTriggers(): TriggerDef[] {
    const x = this.motor.x;
    return this.manifest.triggers.filter(
      (t) => x >= t.x0 && x <= t.x1 && this.session.flags.test(t.when) && !(t.once && this.session.flags.has(`trigger.${t.id}`)),
    );
  }

  /** Start/stop threats from their data conditions, then advance them. */
  updateThreats(dt: number, readingText: boolean, runSpeed: number): { id: string; ev: ThreatEvent }[] {
    const out: { id: string; ev: ThreatEvent }[] = [];
    for (const [id, th] of this.threats) {
      const want = this.session.flags.test(th.def.activeWhen) && !!th.def.activeWhen && !this.escaped.has(id);
      if (want && !th.running) th.start();
      if (!want && th.running) th.stop();
      for (const ev of th.update(dt, { playerX: this.motor.x, hidden: this.hidden, readingText, playerRunSpeed: runSpeed })) {
        if (ev.type === 'escaped') this.escaped.add(id);
        out.push({ id, ev });
      }
    }
    return out;
  }

  startThreat(id: string): void {
    this.escaped.delete(id);
    this.threats.get(id)?.start();
  }

  stopThreat(id: string): void {
    this.threats.get(id)?.stop();
  }

  stopAllThreats(): void {
    this.threats.forEach((t) => t.running && t.stop());
  }

  get chaseActive(): boolean {
    for (const t of this.threats.values()) if (t.def.kind === 'pursuit' && t.running) return true;
    return false;
  }

  threatViews(): ThreatView[] {
    return [...this.threats.values()].map((t) => ({
      id: t.def.id,
      kind: t.def.kind,
      x: t.x,
      y: t.def.kind === 'pursuit' ? this.heightAt(t.x) : t.def.spawn[1],
      phase: t.phase,
      presence: t.def.kind === 'pursuit' ? Math.max(t.presence, t.phase === 'Pursue' || t.phase === 'Approach' ? 1 : 0) : t.presence,
      sweep: t.sweep,
      active: t.running,
    }));
  }

  /** 0..1 danger level for HUD vignette / audio tension. */
  dangerLevel(): number {
    let d = 0;
    for (const t of this.threats.values()) {
      if (!t.running) continue;
      if (t.def.kind === 'pursuit') d = Math.max(d, t.phase === 'Telegraph' ? 0.2 : Math.max(0, 1 - (this.motor.x - t.x) / 8));
      else d = Math.max(d, t.phase === 'Search' ? 0.3 + t.alarm * 0.6 : t.phase === 'Telegraph' ? 0.15 : 0);
    }
    return d;
  }
}
