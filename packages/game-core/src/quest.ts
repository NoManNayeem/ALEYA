import type { QuestNode } from '@aleya/content-schema';
import type { FlagStore } from './flags';

/**
 * Data-driven quest graph. A node is active when its `activeWhen` condition holds
 * and its `doneWhen` condition does not. The current objective is the first
 * active node of the current scene (author order).
 */
export class QuestGraph {
  constructor(private readonly nodes: readonly QuestNode[], private readonly flags: FlagStore) {
    const ids = new Set<string>();
    for (const n of nodes) {
      if (ids.has(n.id)) throw new Error(`Duplicate quest node id ${n.id}`);
      ids.add(n.id);
    }
  }

  isDone(id: string): boolean {
    const n = this.nodes.find((q) => q.id === id);
    return !!n && this.flags.test(n.doneWhen);
  }

  active(sceneId?: string): QuestNode[] {
    return this.nodes.filter(
      (n) => (!sceneId || n.sceneId === sceneId) && this.flags.test(n.activeWhen) && !this.flags.test(n.doneWhen),
    );
  }

  current(sceneId: string): QuestNode | undefined {
    return this.active(sceneId)[0];
  }

  completed(): QuestNode[] {
    return this.nodes.filter((n) => this.flags.test(n.doneWhen));
  }
}
