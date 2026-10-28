export interface PuzzleFeedback {
  solved: boolean;
  /** true when an attempt was checked and rejected (counts toward skip availability) */
  failed: boolean;
  /** localization key describing what happened, if any */
  messageKey?: string;
  /** indices/ids that are currently correct, used for non-punitive feedback */
  correct?: (string | number)[];
}

export const OK: PuzzleFeedback = { solved: false, failed: false };

export interface PuzzleRules {
  readonly kind: string;
  isSolved(): boolean;
  reset(): void;
  /** JSON-safe state for save files (never entity pointers) */
  serialize(): unknown;
  restore(data: unknown): void;
}

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export function shuffleDeterministic<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  let s = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
