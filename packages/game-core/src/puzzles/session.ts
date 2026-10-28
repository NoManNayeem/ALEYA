import type { PuzzleDef } from '@aleya/content-schema';
import { BreakerPuzzle, type BreakerConfig } from './breaker';
import { FloodgatePuzzle, type FloodgateConfig } from './floodgate';
import { LanternPuzzle, type LanternConfig } from './lantern';
import { LedgerPuzzle, type LedgerConfig } from './ledger';
import { RadioPuzzle, type RadioConfig } from './radio';
import { ReconstructPuzzle, type ReconstructConfig } from './reconstruct';
import type { PuzzleFeedback, PuzzleRules } from './types';
import { WheelhousePuzzle, type WheelhouseConfig } from './wheelhouse';

export const HINT_IDLE_SECONDS = 90;
export const SKIP_AFTER_FAILURES = 3;

export type AnyPuzzle =
  | BreakerPuzzle
  | LedgerPuzzle
  | RadioPuzzle
  | FloodgatePuzzle
  | LanternPuzzle
  | WheelhousePuzzle
  | ReconstructPuzzle;

export function createPuzzle(def: PuzzleDef): AnyPuzzle {
  const c = def.config as unknown;
  switch (def.kind) {
    case 'breaker':
      return new BreakerPuzzle(c as BreakerConfig);
    case 'ledger':
      return new LedgerPuzzle(c as LedgerConfig);
    case 'radio':
      return new RadioPuzzle(c as RadioConfig);
    case 'floodgate':
      return new FloodgatePuzzle(c as FloodgateConfig);
    case 'lantern':
      return new LanternPuzzle(c as LanternConfig);
    case 'wheelhouse':
      return new WheelhousePuzzle(c as WheelhouseConfig);
    case 'reconstruct':
      return new ReconstructPuzzle(c as ReconstructConfig);
  }
}

/** Persistent, per-puzzle progress, stored separately from the objective flags. */
export interface PuzzleRecord {
  solved: boolean;
  skipped: boolean;
  failures: number;
  hintLevel: number;
  data?: unknown;
}

export function emptyRecord(): PuzzleRecord {
  return { solved: false, skipped: false, failures: 0, hintLevel: 0 };
}

/**
 * Tracks an open puzzle: idle time for the hint protocol, failures for skip
 * availability, and the progressive hint level (1 attention, 2 interpretation, 3 solution).
 */
export class PuzzleSession {
  idleSeconds = 0;
  nudged = false;

  constructor(
    readonly def: PuzzleDef,
    readonly rules: PuzzleRules & AnyPuzzle,
    readonly record: PuzzleRecord,
  ) {}

  /** Advance time; returns true exactly once when an unsolicited level-1 hint should be offered. */
  tick(dt: number): boolean {
    this.idleSeconds += dt;
    if (!this.nudged && this.record.hintLevel === 0 && this.idleSeconds >= HINT_IDLE_SECONDS) {
      this.nudged = true;
      return true;
    }
    return false;
  }

  /** Call on every player action within the puzzle. */
  activity(feedback?: PuzzleFeedback): void {
    this.idleSeconds = 0;
    if (feedback?.failed) this.record.failures++;
    if (feedback?.solved) this.record.solved = true;
    this.record.data = this.rules.serialize();
  }

  requestHint(): string {
    this.record.hintLevel = Math.min(3, this.record.hintLevel + 1);
    return this.def.hintKeys[this.record.hintLevel - 1];
  }

  hintKeys(): string[] {
    return this.def.hintKeys.slice(0, this.record.hintLevel);
  }

  canSkip(skipAllowed: boolean): boolean {
    return skipAllowed && this.record.failures >= SKIP_AFTER_FAILURES && !this.record.solved;
  }

  skip(): void {
    this.record.skipped = true;
    this.record.solved = true;
  }
}
