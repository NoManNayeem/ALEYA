import { type PuzzleFeedback, type PuzzleRules, OK, shuffleDeterministic } from './types';

export interface ReconstructConfig {
  order: string[];
}

/** Clue reconstruction on the ferry: order the events of that night. */
export class ReconstructPuzzle implements PuzzleRules {
  readonly kind = 'reconstruct';
  arrangement: string[] = [];
  solved = false;

  constructor(readonly config: ReconstructConfig) {
    this.reset();
  }

  reset(): void {
    this.arrangement = shuffleDeterministic(this.config.order, 11);
    if (this.arrangement.join() === this.config.order.join()) this.arrangement.reverse();
    this.solved = false;
  }

  move(index: number, dir: -1 | 1): PuzzleFeedback {
    const j = index + dir;
    if (this.solved || j < 0 || j >= this.arrangement.length) return OK;
    [this.arrangement[index], this.arrangement[j]] = [this.arrangement[j], this.arrangement[index]];
    return OK;
  }

  check(): PuzzleFeedback {
    const correct = this.arrangement.map((f, i) => (f === this.config.order[i] ? i : -1)).filter((i) => i >= 0);
    if (correct.length === this.config.order.length) {
      this.solved = true;
      return { solved: true, failed: false, messageKey: 'puzzle.reconstruct.solved', correct };
    }
    return { solved: false, failed: true, messageKey: 'puzzle.reconstruct.misordered', correct };
  }

  isSolved(): boolean {
    return this.solved;
  }

  serialize(): unknown {
    return { arrangement: this.arrangement, solved: this.solved };
  }

  restore(data: unknown): void {
    const d = data as { arrangement?: string[]; solved?: boolean } | undefined;
    if (d?.arrangement && d.arrangement.length === this.config.order.length) this.arrangement = d.arrangement.slice();
    this.solved = !!d?.solved;
  }
}
