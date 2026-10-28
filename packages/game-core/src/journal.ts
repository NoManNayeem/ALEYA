export interface ClueEntry {
  id: string;
  sceneId: string;
  /** play-time seconds when discovered */
  foundAt: number;
  isNew: boolean;
}

/** Clue journal. Clues are never lost on failure or reload. */
export class Journal {
  private entries = new Map<string, ClueEntry>();

  add(id: string, sceneId: string, playSeconds: number): boolean {
    if (this.entries.has(id)) return false;
    this.entries.set(id, { id, sceneId, foundAt: Math.round(playSeconds), isNew: true });
    return true;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  markSeen(id?: string): void {
    for (const e of this.entries.values()) if (!id || e.id === id) e.isNew = false;
  }

  newCount(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.isNew) n++;
    return n;
  }

  list(): ClueEntry[] {
    return [...this.entries.values()].sort((a, b) => a.foundAt - b.foundAt);
  }

  ids(): string[] {
    return [...this.entries.keys()];
  }

  load(entries: readonly ClueEntry[]): void {
    this.entries = new Map(entries.map((e) => [e.id, { ...e }]));
  }
}
