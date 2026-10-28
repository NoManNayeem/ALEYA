import type { Condition } from '@aleya/content-schema';

/** Persistent quest flags. Flags are stable string IDs such as `L01.power_on`. */
export class FlagStore {
  private flags = new Set<string>();
  private listeners = new Set<(flag: string, value: boolean) => void>();

  has(flag: string): boolean {
    return this.flags.has(flag);
  }

  set(flag: string, value = true): void {
    if (value === this.flags.has(flag)) return;
    if (value) this.flags.add(flag);
    else this.flags.delete(flag);
    this.listeners.forEach((l) => l(flag, value));
  }

  test(cond: Condition | undefined): boolean {
    if (!cond) return true;
    if (cond.all && !cond.all.every((f) => this.flags.has(f))) return false;
    if (cond.none && cond.none.some((f) => this.flags.has(f))) return false;
    return true;
  }

  onChange(listener: (flag: string, value: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  toJSON(): string[] {
    return [...this.flags].sort();
  }

  load(flags: readonly string[]): void {
    this.flags = new Set(flags);
  }
}
