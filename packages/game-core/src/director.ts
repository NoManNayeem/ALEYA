import type { Sequence, Step } from '@aleya/content-schema';
import type { FlagStore } from './flags';

export type LeafStep = Exclude<Step, { if: unknown }>;

/** Resolves when fired; used to cut presentational steps short on skip. */
export class Signal {
  fired = false;
  readonly promise: Promise<void>;
  private resolve!: () => void;
  constructor() {
    this.promise = new Promise((r) => (this.resolve = r));
  }
  fire(): void {
    if (this.fired) return;
    this.fired = true;
    this.resolve();
  }
}

export interface StepContext {
  /** true when the step must apply only its persistent effect, instantly */
  fast: boolean;
  /** fires when the player skips the current sequence */
  skip: Signal;
  sequenceId: string;
}

export interface DirectorHost {
  run(step: LeafStep, ctx: StepContext): Promise<void> | void;
  sequenceStart?(seq: Sequence): void;
  sequenceEnd?(seq: Sequence, skipped: boolean): void;
}

const PRESENTATIONAL = ['say', 'shot', 'wait', 'sfx', 'fade', 'lightning', 'chapter', 'quake'] as const;
const INTERACTIVE = ['puzzle', 'choice', 'document', 'credits'] as const;

export function stepKind(step: LeafStep): string {
  return Object.keys(step)[0];
}

export function isPresentational(step: LeafStep): boolean {
  return (PRESENTATIONAL as readonly string[]).includes(stepKind(step));
}

export function isInteractive(step: LeafStep): boolean {
  return (INTERACTIVE as readonly string[]).includes(stepKind(step));
}

/**
 * Runs data-driven sequences one at a time. Skipping a skippable sequence drops
 * presentational steps but still applies every persistent step (flags, clues,
 * items, checkpoints, scene loads), so skipping never breaks quest state.
 */
export class NarrativeDirector {
  private queue: { seq: Sequence; resolve: () => void }[] = [];
  private current: { seq: Sequence; skip: Signal } | null = null;
  private skipping = false;

  constructor(
    private sequences: Map<string, Sequence>,
    private flags: FlagStore,
    private host: DirectorHost,
  ) {}

  addSequences(list: readonly Sequence[]): void {
    for (const s of list) this.sequences.set(s.id, s);
  }

  has(id: string): boolean {
    return this.sequences.has(id);
  }

  get busy(): boolean {
    return this.current !== null || this.queue.length > 0;
  }

  get currentId(): string | null {
    return this.current?.seq.id ?? null;
  }

  get canSkip(): boolean {
    return !!this.current?.seq.skippable && !this.skipping;
  }

  play(id: string): Promise<void> {
    const seq = this.sequences.get(id);
    if (!seq) return Promise.reject(new Error(`Unknown sequence ${id}`));
    return new Promise((resolve) => {
      this.queue.push({ seq, resolve });
      if (!this.current) void this.pump();
    });
  }

  skip(): void {
    if (!this.canSkip || !this.current) return;
    this.skipping = true;
    this.current.skip.fire();
  }

  /** Abort everything (scene reload / return to title). Persistent steps not yet run are dropped. */
  abortAll(): void {
    this.aborted = true;
    this.current?.skip.fire();
    for (const q of this.queue) q.resolve();
    this.queue = [];
  }

  private aborted = false;

  private async pump(): Promise<void> {
    while (this.queue.length) {
      const { seq, resolve } = this.queue.shift()!;
      const skip = new Signal();
      this.current = { seq, skip };
      this.skipping = false;
      this.aborted = false;
      this.host.sequenceStart?.(seq);
      try {
        await this.runSteps(seq.steps, seq, skip);
      } catch (e) {
        console.error(`[director] sequence ${seq.id} failed`, e);
      }
      const skipped = this.skipping;
      this.current = null;
      this.skipping = false;
      if (!this.aborted) this.host.sequenceEnd?.(seq, skipped);
      resolve();
    }
  }

  private async runSteps(steps: readonly Step[], seq: Sequence, skip: Signal): Promise<void> {
    for (const step of steps) {
      if (this.aborted) return;
      if ('if' in step) {
        const branch = this.flags.test(step.if) ? step.then : step.else ?? [];
        await this.runSteps(branch, seq, skip);
        continue;
      }
      const leaf = step as LeafStep;
      if (this.skipping && isPresentational(leaf)) continue;
      if (this.skipping && isInteractive(leaf)) this.skipping = false;
      await this.host.run(leaf, { fast: this.skipping, skip: this.skipping ? alreadyFired : skip, sequenceId: seq.id });
    }
  }
}

const alreadyFired = (() => {
  const s = new Signal();
  s.fire();
  return s;
})();
