import {
  ChoiceDef,
  ClueDef,
  DialogueLine,
  DocumentDef,
  EpisodeManifest,
  ItemDef,
  PuzzleDef,
  QuestNode,
  SceneManifest,
  Sequence,
  type StringTable,
} from '@aleya/content-schema';
import { z } from 'zod';
import episode from './episode.json';
import items from './items.json';
import clues from './clues.json';
import documents from './documents.json';
import puzzles from './puzzles.json';
import quests from './quests.json';
import choices from './choices.json';
import dialogue from './dialogue.json';

/**
 * Episode 1 content package. Episode-wide tables load eagerly (small); scene
 * manifests and their sequences are lazy chunks so each location streams in
 * before its transition.
 */

const sceneModules = import.meta.glob('./scenes/*.json', { import: 'default' });
const sequenceModules = import.meta.glob('./sequences/*.json', { import: 'default' });
const stringModules = import.meta.glob('./strings/*.json', { import: 'default', eager: true }) as Record<string, StringTable>;

export function episodeTables() {
  return {
    manifest: EpisodeManifest.parse(episode),
    items: z.array(ItemDef).parse(items),
    clues: z.array(ClueDef).parse(clues),
    documents: z.array(DocumentDef).parse(documents),
    puzzles: z.array(PuzzleDef).parse(puzzles),
    quests: z.array(QuestNode).parse(quests),
    choices: z.array(ChoiceDef).parse(choices),
    dialogue: z.array(DialogueLine).parse(dialogue),
  };
}

/** Short scene key from the global id: aleya.ep01.L03 -> L03 */
export function sceneKey(id: string): string {
  return id.split('.').pop()!;
}

export async function loadScene(id: string): Promise<{ manifest: SceneManifest; sequences: Sequence[] }> {
  const key = sceneKey(id);
  const sm = sceneModules[`./scenes/${key}.json`];
  const qm = sequenceModules[`./sequences/${key}.json`];
  if (!sm || !qm) throw new Error(`Scene package ${id} not found`);
  const [rawScene, rawSeq] = await Promise.all([sm(), qm()]);
  return { manifest: SceneManifest.parse(rawScene), sequences: z.array(Sequence).parse(rawSeq) };
}

/** Raw (unparsed) content for validation tooling. */
export async function rawBundle() {
  const scenes = await Promise.all(Object.values(sceneModules).map((m) => m()));
  const sequences = (await Promise.all(Object.values(sequenceModules).map((m) => m()))).flat();
  return {
    episode,
    scenes,
    sequences,
    dialogue,
    clues,
    items,
    puzzles,
    documents,
    choices,
    quests,
    strings: stringTables(),
  };
}

/** Merge all string files per locale: content.<loc>.json + ui.<loc>.json */
export function stringTables(): Record<'en' | 'bn', StringTable> {
  const out: Record<string, StringTable> = { en: {}, bn: {} };
  for (const [path, table] of Object.entries(stringModules)) {
    const m = path.match(/\.(en|bn)\.json$/);
    if (!m) continue;
    Object.assign(out[m[1]], table);
  }
  return out as Record<'en' | 'bn', StringTable>;
}
