export const MAX_KEY_ITEMS = 6;

/** Intentionally small key-item inventory; non-story junk never accumulates. */
export class Inventory {
  private items: string[] = [];

  has(id: string): boolean {
    return this.items.includes(id);
  }

  add(id: string): boolean {
    if (this.has(id)) return false;
    if (this.items.length >= MAX_KEY_ITEMS) throw new Error(`Inventory full: cannot add ${id}`);
    this.items.push(id);
    return true;
  }

  remove(id: string): boolean {
    const i = this.items.indexOf(id);
    if (i < 0) return false;
    this.items.splice(i, 1);
    return true;
  }

  list(): readonly string[] {
    return this.items;
  }

  load(items: readonly string[]): void {
    this.items = items.slice(0, MAX_KEY_ITEMS);
  }
}
