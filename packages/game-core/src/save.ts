import { z } from 'zod';
import type { ClueEntry } from './journal';
import type { PuzzleRecord } from './puzzles/session';

/**
 * Versioned save schema. Saves never store engine entity pointers: only stable
 * content IDs and JSON-safe puzzle state. Each write keeps the prior checkpoint
 * as a backup slot in the same transaction.
 */

export const SAVE_SCHEMA_VERSION = 2;

export interface SaveGame {
  schemaVersion: number;
  gameBuild: string;
  episodeId: string;
  sceneId: string;
  checkpointId: string;
  playSeconds: number;
  questFlags: string[];
  puzzleState: Record<string, PuzzleRecord>;
  inventoryItems: string[];
  clueIds: string[];
  clues: ClueEntry[];
  endingState: 'none' | 'A' | 'B';
  settingsVersion: number;
  savedAt: string;
}

const PuzzleRecordSchema = z.object({
  solved: z.boolean(),
  skipped: z.boolean(),
  failures: z.number(),
  hintLevel: z.number(),
  data: z.unknown().optional(),
});

export const SaveGameSchema = z.object({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION),
  gameBuild: z.string(),
  episodeId: z.string(),
  sceneId: z.string(),
  checkpointId: z.string(),
  playSeconds: z.number().nonnegative(),
  questFlags: z.array(z.string()),
  puzzleState: z.record(z.string(), PuzzleRecordSchema),
  inventoryItems: z.array(z.string()).max(6),
  clueIds: z.array(z.string()),
  clues: z.array(z.object({ id: z.string(), sceneId: z.string(), foundAt: z.number(), isNew: z.boolean() })),
  endingState: z.enum(['none', 'A', 'B']),
  settingsVersion: z.number(),
  savedAt: z.string(),
});

type Migration = (s: Record<string, unknown>) => Record<string, unknown>;

/** migrations[n] upgrades a save from version n to n+1 */
export const MIGRATIONS: Record<number, Migration> = {
  // v1 stored only clue ids and a boolean ending flag
  1: (s) => {
    const ids = (s.clueIds as string[] | undefined) ?? [];
    return {
      ...s,
      schemaVersion: 2,
      clues: ids.map((id, i) => ({ id, sceneId: String(s.sceneId ?? ''), foundAt: i, isNew: false })),
      endingState: s.endingState === true ? 'A' : typeof s.endingState === 'string' ? s.endingState : 'none',
    };
  },
};

export class SaveError extends Error {
  constructor(message: string, readonly reason: 'quota' | 'unavailable' | 'corrupt' | 'version' | 'unknown') {
    super(message);
  }
}

export function migrateSave(raw: unknown): SaveGame {
  if (!raw || typeof raw !== 'object') throw new SaveError('Save data is not an object', 'corrupt');
  let s = raw as Record<string, unknown>;
  let v = Number(s.schemaVersion ?? 1);
  if (v > SAVE_SCHEMA_VERSION) throw new SaveError(`Save is from a newer build (v${v})`, 'version');
  while (v < SAVE_SCHEMA_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new SaveError(`No migration from v${v}`, 'version');
    s = m(s);
    v = Number(s.schemaVersion);
  }
  const parsed = SaveGameSchema.safeParse(s);
  if (!parsed.success) throw new SaveError(`Save failed validation: ${parsed.error.issues[0]?.message}`, 'corrupt');
  return parsed.data as SaveGame;
}

// ---------- Storage backends ----------

export interface SaveBackend {
  read(slot: string): Promise<unknown | undefined>;
  /** atomically write several slots */
  writeMany(entries: Record<string, unknown>): Promise<void>;
  remove(slot: string): Promise<void>;
}

export class MemoryBackend implements SaveBackend {
  data = new Map<string, string>();
  failNext: SaveError | null = null;
  async read(slot: string) {
    const v = this.data.get(slot);
    return v === undefined ? undefined : JSON.parse(v);
  }
  async writeMany(entries: Record<string, unknown>) {
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      throw e;
    }
    const staged = Object.entries(entries).map(([k, v]) => [k, JSON.stringify(v)] as const);
    for (const [k, v] of staged) this.data.set(k, v);
  }
  async remove(slot: string) {
    this.data.delete(slot);
  }
}

export class IndexedDbBackend implements SaveBackend {
  private dbp: Promise<IDBDatabase> | null = null;
  constructor(private dbName = 'aleya', private store = 'saves') {}

  private db(): Promise<IDBDatabase> {
    if (!this.dbp) {
      this.dbp = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') return reject(new SaveError('IndexedDB unavailable', 'unavailable'));
        const req = indexedDB.open(this.dbName, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(this.store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(new SaveError(req.error?.message ?? 'IndexedDB open failed', 'unavailable'));
      });
      this.dbp.catch(() => (this.dbp = null));
    }
    return this.dbp;
  }

  async read(slot: string): Promise<unknown | undefined> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const req = db.transaction(this.store, 'readonly').objectStore(this.store).get(slot);
      req.onsuccess = () => resolve(req.result ?? undefined);
      req.onerror = () => reject(new SaveError(req.error?.message ?? 'read failed', 'unknown'));
    });
  }

  async writeMany(entries: Record<string, unknown>): Promise<void> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.store, 'readwrite');
      const os = tx.objectStore(this.store);
      for (const [k, v] of Object.entries(entries)) os.put(v, k);
      tx.oncomplete = () => resolve();
      const fail = () => {
        const name = tx.error?.name ?? '';
        reject(new SaveError(tx.error?.message ?? 'write failed', name === 'QuotaExceededError' ? 'quota' : 'unknown'));
      };
      tx.onerror = fail;
      tx.onabort = fail;
    });
  }

  async remove(slot: string): Promise<void> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.store, 'readwrite');
      tx.objectStore(this.store).delete(slot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new SaveError(tx.error?.message ?? 'delete failed', 'unknown'));
    });
  }
}

/** Single-profile save repository with backup rotation, export and import. */
export class SaveRepository {
  static readonly CURRENT = 'ep01.current';
  static readonly BACKUP = 'ep01.backup';

  constructor(private backend: SaveBackend) {}

  async save(game: SaveGame): Promise<void> {
    const prev = await this.backend.read(SaveRepository.CURRENT).catch(() => undefined);
    const entries: Record<string, unknown> = { [SaveRepository.CURRENT]: game };
    if (prev) entries[SaveRepository.BACKUP] = prev;
    await this.backend.writeMany(entries);
  }

  /** Load the current save, falling back to the backup if the current one is corrupt. */
  async load(): Promise<SaveGame | null> {
    for (const slot of [SaveRepository.CURRENT, SaveRepository.BACKUP]) {
      const raw = await this.backend.read(slot);
      if (raw === undefined) continue;
      try {
        return migrateSave(raw);
      } catch (e) {
        if (e instanceof SaveError && e.reason === 'version') throw e;
        // corrupt current -> try backup
      }
    }
    return null;
  }

  async hasSave(): Promise<boolean> {
    return (await this.load().catch(() => null)) !== null;
  }

  async clear(): Promise<void> {
    await this.backend.remove(SaveRepository.CURRENT);
    await this.backend.remove(SaveRepository.BACKUP);
  }

  static exportText(game: SaveGame): string {
    return JSON.stringify({ format: 'aleya-save', ...game }, null, 2);
  }

  static parseImport(text: string): SaveGame {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new SaveError('File is not valid JSON', 'corrupt');
    }
    if (raw.format !== 'aleya-save') throw new SaveError('Not an ALEYA save file', 'corrupt');
    delete raw.format;
    return migrateSave(raw);
  }
}
