import { type PuzzleFeedback, type PuzzleRules, OK } from './types';

export interface LedgerConfig {
  entries: string[];
  names: string[];
  solution: Record<string, string>;
}

/** P2: restore four torn ledger lines by matching passenger names to boarding times. */
export class LedgerPuzzle implements PuzzleRules {
  readonly kind = 'ledger';
  assigned: Record<string, string | null> = {};
  solved = false;

  constructor(readonly config: LedgerConfig) {
    this.reset();
  }

  reset(): void {
    this.assigned = Object.fromEntries(this.config.entries.map((e) => [e, null]));
    this.solved = false;
  }

  /** Assigning a name already used elsewhere swaps the two lines, so no state is ever stuck. */
  assign(entry: string, name: string | null): PuzzleFeedback {
    if (this.solved) return OK;
    if (name !== null) {
      const other = this.config.entries.find((e) => e !== entry && this.assigned[e] === name);
      if (other) this.assigned[other] = this.assigned[entry];
    }
    this.assigned[entry] = name;
    return OK;
  }

  cycle(entry: string, dir: 1 | -1 = 1): PuzzleFeedback {
    const names = this.config.names;
    const cur = this.assigned[entry];
    const idx = cur === null ? (dir === 1 ? 0 : names.length - 1) : (names.indexOf(cur) + dir + names.length) % names.length;
    return this.assign(entry, names[idx]);
  }

  check(): PuzzleFeedback {
    const correct = this.config.entries.filter((e) => this.assigned[e] === this.config.solution[e]);
    if (this.config.entries.some((e) => this.assigned[e] === null)) {
      return { solved: false, failed: false, messageKey: 'puzzle.ledger.incomplete', correct: [] };
    }
    if (correct.length === this.config.entries.length) {
      this.solved = true;
      return { solved: true, failed: false, messageKey: 'puzzle.ledger.solved', correct };
    }
    return { solved: false, failed: true, messageKey: 'puzzle.ledger.mismatch', correct };
  }

  isSolved(): boolean {
    return this.solved;
  }

  serialize(): unknown {
    return { assigned: this.assigned, solved: this.solved };
  }

  restore(data: unknown): void {
    const d = data as { assigned?: Record<string, string | null>; solved?: boolean } | undefined;
    if (d?.assigned) this.assigned = { ...this.assigned, ...d.assigned };
    this.solved = !!d?.solved;
  }
}
