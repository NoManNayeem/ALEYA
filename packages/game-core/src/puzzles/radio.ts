import { type PuzzleFeedback, type PuzzleRules, OK, shuffleDeterministic } from './types';

export interface RadioBand {
  id: string;
  min: number;
  max: number;
  target: number;
  fragment: string;
}

export interface RadioConfig {
  bands: RadioBand[];
  /** fragment ids in their correct chronological order */
  order: string[];
}

/** P3: tune three bands to the numbers on the repair tags, then order the recovered fragments. */
export class RadioPuzzle implements PuzzleRules {
  readonly kind = 'radio';
  dials: Record<string, number> = {};
  arrangement: string[] = [];
  solved = false;

  constructor(readonly config: RadioConfig) {
    this.reset();
  }

  reset(): void {
    this.dials = Object.fromEntries(this.config.bands.map((b) => [b.id, b.min]));
    this.arrangement = shuffleDeterministic(this.config.order, 7);
    if (this.arrangement.join() === this.config.order.join()) this.arrangement.reverse();
    this.solved = false;
  }

  tune(bandId: string, delta: number): PuzzleFeedback {
    if (this.solved) return OK;
    const b = this.band(bandId);
    this.dials[bandId] = Math.min(b.max, Math.max(b.min, this.dials[bandId] + delta));
    return OK;
  }

  setDial(bandId: string, value: number): PuzzleFeedback {
    const b = this.band(bandId);
    this.dials[bandId] = Math.min(b.max, Math.max(b.min, Math.round(value)));
    return OK;
  }

  /** 0..1 signal strength, used for the visual waveform and audio clarity. */
  signal(bandId: string): number {
    const b = this.band(bandId);
    const d = Math.abs(this.dials[bandId] - b.target);
    return Math.max(0, 1 - d / 4);
  }

  isLocked(bandId: string): boolean {
    return this.dials[bandId] === this.band(bandId).target;
  }

  allLocked(): boolean {
    return this.config.bands.every((b) => this.isLocked(b.id));
  }

  /** Unlocked fragments become available for ordering as their band locks. */
  unlockedFragments(): string[] {
    return this.config.bands.filter((b) => this.isLocked(b.id)).map((b) => b.fragment);
  }

  move(index: number, dir: -1 | 1): PuzzleFeedback {
    const j = index + dir;
    if (this.solved || j < 0 || j >= this.arrangement.length) return OK;
    [this.arrangement[index], this.arrangement[j]] = [this.arrangement[j], this.arrangement[index]];
    return OK;
  }

  check(): PuzzleFeedback {
    if (!this.allLocked()) return { solved: false, failed: false, messageKey: 'puzzle.radio.untuned' };
    const correct = this.arrangement.map((f, i) => (f === this.config.order[i] ? i : -1)).filter((i) => i >= 0);
    if (correct.length === this.config.order.length) {
      this.solved = true;
      return { solved: true, failed: false, messageKey: 'puzzle.radio.solved', correct };
    }
    return { solved: false, failed: true, messageKey: 'puzzle.radio.misordered', correct };
  }

  isSolved(): boolean {
    return this.solved;
  }

  private band(id: string): RadioBand {
    const b = this.config.bands.find((x) => x.id === id);
    if (!b) throw new Error(`Unknown band ${id}`);
    return b;
  }

  serialize(): unknown {
    return { dials: this.dials, arrangement: this.arrangement, solved: this.solved };
  }

  restore(data: unknown): void {
    const d = data as { dials?: Record<string, number>; arrangement?: string[]; solved?: boolean } | undefined;
    if (d?.dials) this.dials = { ...this.dials, ...d.dials };
    if (d?.arrangement && d.arrangement.length === this.config.order.length) this.arrangement = d.arrangement.slice();
    this.solved = !!d?.solved;
  }
}
