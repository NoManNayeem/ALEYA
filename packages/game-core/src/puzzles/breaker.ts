import { type PuzzleFeedback, type PuzzleRules, OK } from './types';

export interface BreakerConfig {
  circuits: string[];
  terminals: string[];
  solution: Record<string, string>;
}

/** P1: wire three circuits to the terminals shown on the tea-stall fuse diagram, then throw the main. */
export class BreakerPuzzle implements PuzzleRules {
  readonly kind = 'breaker';
  wiring: Record<string, string | null> = {};
  mainOn = false;
  lastCorrect: string[] = [];

  constructor(readonly config: BreakerConfig) {
    this.reset();
  }

  reset(): void {
    this.wiring = Object.fromEntries(this.config.circuits.map((c) => [c, null]));
    this.mainOn = false;
    this.lastCorrect = [];
  }

  /** Cycle the terminal for a circuit forward (dir=1) or backward (dir=-1). */
  cycle(circuit: string, dir: 1 | -1 = 1): PuzzleFeedback {
    if (this.mainOn) return OK;
    const t = this.config.terminals;
    const cur = this.wiring[circuit];
    const idx = cur === null ? (dir === 1 ? 0 : t.length - 1) : (t.indexOf(cur) + dir + t.length) % t.length;
    this.wiring[circuit] = t[idx];
    return OK;
  }

  set(circuit: string, terminal: string | null): PuzzleFeedback {
    if (this.mainOn) return OK;
    this.wiring[circuit] = terminal;
    return OK;
  }

  throwMain(): PuzzleFeedback {
    const correct = this.config.circuits.filter((c) => this.wiring[c] === this.config.solution[c]);
    this.lastCorrect = correct;
    if (this.config.circuits.some((c) => this.wiring[c] === null)) {
      return { solved: false, failed: false, messageKey: 'puzzle.breaker.incomplete', correct };
    }
    if (correct.length === this.config.circuits.length) {
      this.mainOn = true;
      return { solved: true, failed: false, messageKey: 'puzzle.breaker.solved', correct };
    }
    // Trips safely: wiring stays so the player can adjust; nothing is lost.
    return { solved: false, failed: true, messageKey: 'puzzle.breaker.trip', correct };
  }

  isSolved(): boolean {
    return this.mainOn;
  }

  serialize(): unknown {
    return { wiring: this.wiring, mainOn: this.mainOn };
  }

  restore(data: unknown): void {
    const d = data as { wiring?: Record<string, string | null>; mainOn?: boolean } | undefined;
    if (d?.wiring) this.wiring = { ...this.wiring, ...d.wiring };
    this.mainOn = !!d?.mainOn;
  }
}
