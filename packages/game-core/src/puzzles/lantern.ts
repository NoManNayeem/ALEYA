import { type PuzzleFeedback, type PuzzleRules, OK } from './types';

export interface LanternConfig {
  positions: string[];
  sequence: string[];
}

/** P5: answer the four-beat light pattern from across the creek with Asha's lantern. */
export class LanternPuzzle implements PuzzleRules {
  readonly kind = 'lantern';
  input: string[] = [];
  solved = false;

  constructor(readonly config: LanternConfig) {
    this.reset();
  }

  reset(): void {
    this.input = [];
    this.solved = false;
  }

  signal(position: string): PuzzleFeedback {
    if (this.solved) return OK;
    if (!this.config.positions.includes(position)) throw new Error(`Unknown lantern position ${position}`);
    const expected = this.config.sequence[this.input.length];
    if (position !== expected) {
      this.input = [];
      return { solved: false, failed: true, messageKey: 'puzzle.lantern.wrong' };
    }
    this.input.push(position);
    if (this.input.length === this.config.sequence.length) {
      this.solved = true;
      return { solved: true, failed: false, messageKey: 'puzzle.lantern.solved' };
    }
    return { solved: false, failed: false, correct: this.input.map((_, i) => i) };
  }

  progress(): number {
    return this.input.length;
  }

  isSolved(): boolean {
    return this.solved;
  }

  serialize(): unknown {
    return { solved: this.solved };
  }

  restore(data: unknown): void {
    this.solved = !!(data as { solved?: boolean } | undefined)?.solved;
  }
}
