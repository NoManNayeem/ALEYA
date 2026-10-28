import type { ThreatDef } from '@aleya/content-schema';

export type ThreatPhase = 'Dormant' | 'Telegraph' | 'Approach' | 'Pursue' | 'Search' | 'Reset' | 'Exit';

export interface ThreatInput {
  playerX: number;
  hidden: boolean;
  /** true while a document, puzzle or dialogue choice is open: the Watcher never advances then */
  readingText: boolean;
  playerRunSpeed: number;
}

export type ThreatEvent = { type: 'phase'; phase: ThreatPhase } | { type: 'caught' } | { type: 'escaped' };

export interface ThreatOptions {
  lowTension: boolean;
}

const CATCH_DISTANCE = 0.9;
const EXPOSED_GRACE = 1.4;
/** the pursuer never falls further behind than this, so it stays on screen */
const MAX_GAP = 5.5;

/**
 * Scripted threat logic: Dormant -> Telegraph -> Approach -> Pursue -> Search -> Reset/Exit.
 * Pursuit variants chase along the lane; patrol variants sweep a light and only
 * threaten a player who is exposed (not hidden) during the Search phase.
 * Pure logic: the renderer reads `x`, `phase` and `sweep` to present the Watcher.
 */
export class ThreatController {
  phase: ThreatPhase = 'Dormant';
  x: number;
  /** 0..1 intensity of the search light / presence, for presentation */
  presence = 0;
  /** patrol sweep position across [patrol.x0, patrol.x1] */
  sweep = 0;
  private timer = 0;
  private exposed = 0;
  private events: ThreatEvent[] = [];
  private started = false;

  constructor(readonly def: ThreatDef, private opts: ThreatOptions) {
    this.x = def.spawn[0];
  }

  setOptions(opts: ThreatOptions): void {
    this.opts = opts;
  }

  get active(): boolean {
    return this.phase !== 'Dormant' && this.phase !== 'Exit';
  }

  start(): void {
    this.x = this.def.spawn[0];
    this.exposed = 0;
    this.go(this.def.kind === 'pursuit' ? 'Telegraph' : 'Dormant');
    if (this.def.kind === 'patrol') this.timer = 0;
    this.started = true;
  }

  /** true between start() and stop()/escape */
  get running(): boolean {
    return this.started;
  }

  stop(): void {
    this.started = false;
    this.go('Exit');
  }

  private go(phase: ThreatPhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.timer = 0;
    this.events.push({ type: 'phase', phase });
  }

  /** Advance the simulation; returns events produced during this step. */
  update(dt: number, input: ThreatInput): ThreatEvent[] {
    this.events = [];
    if (!this.started || this.phase === 'Exit') return this.events;
    if (input.readingText) return this.events;
    if (this.def.safeX !== undefined && input.playerX >= this.def.safeX) {
      this.started = false;
      this.go('Exit');
      this.events.push({ type: 'escaped' });
      return this.events;
    }
    this.timer += dt;
    if (this.def.kind === 'pursuit') this.updatePursuit(dt, input);
    else this.updatePatrol(dt, input);
    return this.events;
  }

  private speedFactor(): number {
    return this.opts.lowTension ? this.def.speed * 0.72 : this.def.speed;
  }

  private updatePursuit(dt: number, input: ThreatInput): void {
    const tele = this.def.telegraphSeconds * (this.opts.lowTension ? 1.5 : 1);
    switch (this.phase) {
      case 'Telegraph':
        this.presence = Math.min(1, this.timer / tele);
        if (this.timer >= tele) this.go('Approach');
        break;
      case 'Approach':
        this.x += input.playerRunSpeed * this.speedFactor() * 0.55 * dt;
        if (this.timer >= 1.5) this.go('Pursue');
        break;
      case 'Pursue': {
        this.x += input.playerRunSpeed * this.speedFactor() * dt;
        // never overtake; rubber-band so a stalled player is caught but a running player escapes
        const gap = input.playerX - this.x;
        if (gap > MAX_GAP) this.x = input.playerX - MAX_GAP;
        if (gap < CATCH_DISTANCE * (this.opts.lowTension ? 0.6 : 1)) {
          this.events.push({ type: 'caught' });
          this.go('Reset');
        }
        break;
      }
      default:
        break;
    }
  }

  private updatePatrol(dt: number, input: ThreatInput): void {
    const p = this.def.patrol!;
    const tele = this.def.telegraphSeconds * (this.opts.lowTension ? 1.6 : 1);
    const inZone = input.playerX >= p.x0 && input.playerX <= p.x1;
    switch (this.phase) {
      case 'Dormant':
      case 'Reset':
        this.presence = Math.max(0, this.presence - dt);
        if (this.timer >= p.restSeconds) this.go('Telegraph');
        break;
      case 'Telegraph':
        this.presence = Math.min(1, this.timer / tele) * 0.6;
        if (this.timer >= tele) {
          this.exposed = 0;
          this.go('Search');
        }
        break;
      case 'Search':
        this.presence = 1;
        this.sweep = 0.5 - 0.5 * Math.cos((this.timer / p.lookSeconds) * Math.PI * 2);
        if (inZone && !input.hidden) {
          this.exposed += dt;
          if (this.exposed >= EXPOSED_GRACE * (this.opts.lowTension ? 1.8 : 1)) {
            this.events.push({ type: 'caught' });
            this.go('Reset');
            return;
          }
        } else {
          this.exposed = Math.max(0, this.exposed - dt * 0.5);
        }
        if (this.timer >= p.lookSeconds) this.go('Reset');
        break;
      default:
        break;
    }
  }

  /** 0..1 how close a patrol is to spotting the exposed player, for UI/audio warning */
  get alarm(): number {
    return Math.min(1, this.exposed / EXPOSED_GRACE);
  }
}
