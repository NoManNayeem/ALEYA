import { type PuzzleFeedback, type PuzzleRules, OK } from './types';

export interface FloodgateConfig {
  valves: string[];
  maxTurns: number;
  /** matrix[gauge][valve] = water added to gauge per valve turn */
  matrix: number[][];
  base: number[];
  target: number[];
}

/** P4: rotate three culvert valves until each gauge sits on its chalk mark. Always resettable. */
export class FloodgatePuzzle implements PuzzleRules {
  readonly kind = 'floodgate';
  turns: number[] = [];
  solved = false;

  constructor(readonly config: FloodgateConfig) {
    this.reset();
  }

  reset(): void {
    this.turns = this.config.valves.map(() => 0);
    this.solved = false;
  }

  rotate(valve: number, dir: 1 | -1): PuzzleFeedback {
    if (this.solved) return OK;
    this.turns[valve] = Math.min(this.config.maxTurns, Math.max(0, this.turns[valve] + dir));
    if (this.matches()) {
      this.solved = true;
      return { solved: true, failed: false, messageKey: 'puzzle.floodgate.solved' };
    }
    return OK;
  }

  gauges(): number[] {
    return this.config.matrix.map((row, g) => row.reduce((sum, w, v) => sum + w * this.turns[v], this.config.base[g]));
  }

  matches(): boolean {
    const g = this.gauges();
    return g.every((v, i) => v === this.config.target[i]);
  }

  isSolved(): boolean {
    return this.solved;
  }

  serialize(): unknown {
    return { turns: this.turns, solved: this.solved };
  }

  restore(data: unknown): void {
    const d = data as { turns?: number[]; solved?: boolean } | undefined;
    if (d?.turns && d.turns.length === this.turns.length) this.turns = d.turns.slice();
    this.solved = !!d?.solved;
  }
}
