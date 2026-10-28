import type { ChoiceDef, ClueDef, DialogueLine, DocumentDef, EpisodeManifest, ItemDef, PuzzleDef, QuestNode } from '@aleya/content-schema';
import { FlagStore } from './flags';
import { Inventory } from './inventory';
import { Journal } from './journal';
import { emptyRecord, type PuzzleRecord } from './puzzles/session';
import { QuestGraph } from './quest';
import { SAVE_SCHEMA_VERSION, type SaveGame } from './save';

/** Episode-wide content tables (scene manifests are loaded lazily and separately). */
export interface EpisodeData {
  manifest: EpisodeManifest;
  quests: QuestNode[];
  clues: ClueDef[];
  items: ItemDef[];
  puzzles: PuzzleDef[];
  dialogue: DialogueLine[];
  documents: DocumentDef[];
  choices: ChoiceDef[];
}

/** All persistent game state for one playthrough. */
export class GameSession {
  readonly flags = new FlagStore();
  readonly inventory = new Inventory();
  readonly journal = new Journal();
  readonly quest: QuestGraph;
  puzzles = new Map<string, PuzzleRecord>();
  playSeconds = 0;
  sceneId: string;
  checkpointId: string;
  ending: 'none' | 'A' | 'B' = 'none';

  constructor(readonly episode: EpisodeData) {
    this.quest = new QuestGraph(episode.quests, this.flags);
    this.sceneId = episode.manifest.firstScene;
    this.checkpointId = episode.manifest.firstSpawn;
  }

  puzzleRecord(id: string): PuzzleRecord {
    let r = this.puzzles.get(id);
    if (!r) this.puzzles.set(id, (r = emptyRecord()));
    return r;
  }

  addClue(id: string): boolean {
    const def = this.episode.clues.find((c) => c.id === id);
    if (!def) throw new Error(`Unknown clue ${id}`);
    return this.journal.add(id, def.sceneId, this.playSeconds);
  }

  get complete(): boolean {
    return this.flags.has(this.episode.manifest.completeFlag);
  }

  snapshot(gameBuild: string, settingsVersion: number): SaveGame {
    return {
      schemaVersion: SAVE_SCHEMA_VERSION,
      gameBuild,
      episodeId: this.episode.manifest.id,
      sceneId: this.sceneId,
      checkpointId: this.checkpointId,
      playSeconds: Math.round(this.playSeconds),
      questFlags: this.flags.toJSON(),
      puzzleState: structuredClone(Object.fromEntries(this.puzzles)),
      inventoryItems: [...this.inventory.list()],
      clueIds: this.journal.ids(),
      clues: this.journal.list(),
      endingState: this.ending,
      settingsVersion,
      savedAt: new Date().toISOString(),
    };
  }

  restore(save: SaveGame): void {
    if (save.episodeId !== this.episode.manifest.id) throw new Error(`Save is for ${save.episodeId}`);
    this.flags.load(save.questFlags);
    this.inventory.load(save.inventoryItems);
    this.journal.load(save.clues);
    this.puzzles = new Map(Object.entries(structuredClone(save.puzzleState)));
    this.playSeconds = save.playSeconds;
    this.sceneId = save.sceneId;
    this.checkpointId = save.checkpointId;
    this.ending = save.endingState;
  }
}
