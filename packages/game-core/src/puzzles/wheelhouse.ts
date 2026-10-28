import { type PuzzleFeedback, type PuzzleRules, OK, mod } from './types';

export interface WheelhouseConfig {
  positions: number;
  start: number[];
  target: number[];
  /** gears[g][disk] = teeth advanced per crank of gear g */
  gears: number[][];
}

/** P6: select a gear, crank to turn linked toothed disks, then try the handle. */
export class WheelhousePuzzle implements PuzzleRules {
  readonly kind = 'wheelhouse';
  disks: number[] = [];
  gear = 0;
  solved = false;

  constructor(readonly config: WheelhouseConfig) {
    this.reset();
  }

  reset(): void {
    this.disks = this.config.start.slice();
    this.gear = 0;
    this.solved = false;
  }

  selectGear(g: number): PuzzleFeedback {
    if (g >= 0 && g < this.config.gears.length) this.gear = g;
    return OK;
  }

  crank(dir: 1 | -1): PuzzleFeedback {
    if (this.solved) return OK;
    const g = this.config.gears[this.gear];
    this.disks = this.disks.map((d, i) => mod(d + g[i] * dir, this.config.positions));
    return OK;
  }

  aligned(): boolean[] {
    return this.disks.map((d, i) => d === this.config.target[i]);
  }

  /** Wrong solution resets the disks mechanically; nothing else is lost. */
  tryHandle(): PuzzleFeedback {
    if (this.aligned().every(Boolean)) {
      this.solved = true;
      return { solved: true, failed: false, messageKey: 'puzzle.wheelhouse.solved' };
    }
    this.disks = this.config.start.slice();
    return { solved: false, failed: true, messageKey: 'puzzle.wheelhouse.reset' };
  }

  isSolved(): boolean {
    return this.solved;
  }

  serialize(): unknown {
    return { disks: this.disks, gear: this.gear, solved: this.solved };
  }

  restore(data: unknown): void {
    const d = data as { disks?: number[]; gear?: number; solved?: boolean } | undefined;
    if (d?.disks && d.disks.length === this.disks.length) this.disks = d.disks.slice();
    this.gear = d?.gear ?? 0;
    this.solved = !!d?.solved;
  }
}
