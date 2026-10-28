import { z } from 'zod';
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
  type Step,
  StringTable,
} from './schema';

export interface EpisodeBundle {
  episode: unknown;
  scenes: unknown[];
  sequences: unknown[];
  dialogue: unknown[];
  clues: unknown[];
  items: unknown[];
  puzzles: unknown[];
  documents: unknown[];
  choices: unknown[];
  quests: unknown[];
  strings: Record<string, unknown>;
}

function parseAll<T>(schema: z.ZodType<T>, list: unknown[], label: string, errors: string[]): T[] {
  const out: T[] = [];
  list.forEach((item, i) => {
    const r = schema.safeParse(item);
    if (r.success) out.push(r.data);
    else {
      const id = (item as { id?: string })?.id ?? `#${i}`;
      errors.push(`${label} ${id}: ${r.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
    }
  });
  return out;
}

function dupes(ids: string[], label: string, errors: string[]): Set<string> {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`duplicate ${label} id ${id}`);
    seen.add(id);
  }
  return seen;
}

/** Collect every localization key referenced by a content object (fields named *Key / *Keys). */
export function collectKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => collectKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k.endsWith('Key') && typeof v === 'string') out.add(v);
      else if (k.endsWith('Keys') && Array.isArray(v)) v.forEach((x) => typeof x === 'string' && out.add(x));
      else if ((k === 'objective' || k === 'chapter') && typeof v === 'string') out.add(v);
      else collectKeys(v, out);
    }
  }
  return out;
}

function walkSteps(steps: readonly Step[], fn: (s: Exclude<Step, { if: unknown }>) => void): void {
  for (const s of steps) {
    if ('if' in s) {
      walkSteps(s.then, fn);
      if (s.else) walkSteps(s.else, fn);
    } else fn(s as Exclude<Step, { if: unknown }>);
  }
}

/**
 * Validates an entire episode: schemas, unique IDs, cross references and
 * localization completeness in every locale. Returns a list of errors (empty = valid).
 */
export function validateEpisodeBundle(b: EpisodeBundle, allowEmpty: readonly string[] = ['speaker.caption']): string[] {
  const errors: string[] = [];
  const ep = EpisodeManifest.safeParse(b.episode);
  if (!ep.success) errors.push(`episode: ${ep.error.issues[0]?.message}`);
  const scenes = parseAll(SceneManifest, b.scenes, 'scene', errors);
  const sequences = parseAll(Sequence, b.sequences, 'sequence', errors);
  const lines = parseAll(DialogueLine, b.dialogue, 'line', errors);
  const clues = parseAll(ClueDef, b.clues, 'clue', errors);
  const items = parseAll(ItemDef, b.items, 'item', errors);
  const puzzles = parseAll(PuzzleDef, b.puzzles, 'puzzle', errors);
  const docs = parseAll(DocumentDef, b.documents, 'document', errors);
  const choices = parseAll(ChoiceDef, b.choices, 'choice', errors);
  const quests = parseAll(QuestNode, b.quests, 'quest', errors);

  const sceneIds = dupes(scenes.map((s) => s.id), 'scene', errors);
  const seqIds = dupes(sequences.map((s) => s.id), 'sequence', errors);
  const lineIds = dupes(lines.map((s) => s.id), 'line', errors);
  const clueIds = dupes(clues.map((s) => s.id), 'clue', errors);
  const itemIds = dupes(items.map((s) => s.id), 'item', errors);
  const puzzleIds = dupes(puzzles.map((s) => s.id), 'puzzle', errors);
  const docIds = dupes(docs.map((s) => s.id), 'document', errors);
  const choiceIds = dupes(choices.map((s) => s.id), 'choice', errors);
  dupes(quests.map((s) => s.id), 'quest', errors);
  if (items.length > 6) errors.push(`inventory has ${items.length} key items; max 6`);

  const shotIds = new Set<string>();
  const checkpointIds = new Set<string>();
  const threatIds = new Set<string>();
  const spawnsByScene = new Map<string, Set<string>>();
  for (const s of scenes) {
    dupes(s.interactables.map((i) => i.id), `interactable in ${s.id}`, errors);
    s.shots.forEach((x) => shotIds.add(x.id));
    s.checkpoints.forEach((c) => checkpointIds.add(c.id));
    s.threats.forEach((t) => threatIds.add(t.id));
    const spawns = new Set(s.spawnPoints.map((p) => p.id));
    spawnsByScene.set(s.id, spawns);
    for (const c of s.checkpoints) if (!spawns.has(c.spawn)) errors.push(`${s.id}: checkpoint ${c.id} -> unknown spawn ${c.spawn}`);
    for (const i of s.interactables) if (!seqIds.has(i.sequence)) errors.push(`${s.id}: interactable ${i.id} -> unknown sequence ${i.sequence}`);
    for (const t of s.triggers) if (!seqIds.has(t.sequence)) errors.push(`${s.id}: trigger ${t.id} -> unknown sequence ${t.sequence}`);
    if (s.enterSequence && !seqIds.has(s.enterSequence)) errors.push(`${s.id}: unknown enterSequence ${s.enterSequence}`);
    for (const t of s.threats) {
      if (t.onEscape && !seqIds.has(t.onEscape)) errors.push(`${s.id}: threat ${t.id} -> unknown sequence ${t.onEscape}`);
      if (!s.checkpoints.some((c) => c.id === t.failCheckpoint)) errors.push(`${s.id}: threat ${t.id} -> unknown checkpoint ${t.failCheckpoint}`);
    }
    for (const p of s.puzzleIds) if (!puzzleIds.has(p)) errors.push(`${s.id}: unknown puzzle ${p}`);
    for (const lane of s.navLanes) if (lane.x1 <= lane.x0 || lane.z1 < lane.z0) errors.push(`${s.id}: degenerate nav lane ${JSON.stringify(lane)}`);
  }
  if (ep.success) {
    for (const id of ep.data.scenes) if (!sceneIds.has(id)) errors.push(`episode lists unknown scene ${id}`);
    if (!spawnsByScene.get(ep.data.firstScene)?.has(ep.data.firstSpawn)) errors.push('episode first spawn invalid');
  }
  for (const c of choices) for (const o of c.options) if (!seqIds.has(o.sequence)) errors.push(`choice ${c.id} -> unknown sequence ${o.sequence}`);
  for (const p of puzzles) if (!sceneIds.has(p.sceneId)) errors.push(`puzzle ${p.id} -> unknown scene ${p.sceneId}`);

  for (const seq of sequences) {
    walkSteps(seq.steps, (st) => {
      const bad = (what: string, id: string) => errors.push(`sequence ${seq.id}: unknown ${what} ${id}`);
      if ('say' in st && !lineIds.has(st.say)) bad('line', st.say);
      if ('shot' in st && !shotIds.has(st.shot)) bad('shot', st.shot);
      if ('clue' in st && !clueIds.has(st.clue)) bad('clue', st.clue);
      if ('item' in st && !itemIds.has(st.item)) bad('item', st.item);
      if ('removeItem' in st && !itemIds.has(st.removeItem)) bad('item', st.removeItem);
      if ('puzzle' in st && !puzzleIds.has(st.puzzle)) bad('puzzle', st.puzzle);
      if ('document' in st && !docIds.has(st.document)) bad('document', st.document);
      if ('choice' in st && !choiceIds.has(st.choice)) bad('choice', st.choice);
      if ('checkpoint' in st && !checkpointIds.has(st.checkpoint)) bad('checkpoint', st.checkpoint);
      if ('threat' in st && !threatIds.has(st.threat)) bad('threat', st.threat);
      if ('loadScene' in st) {
        if (!sceneIds.has(st.loadScene)) bad('scene', st.loadScene);
        else if (!spawnsByScene.get(st.loadScene)?.has(st.spawn)) bad(`spawn in ${st.loadScene}`, st.spawn);
      }
    });
  }

  // Localization completeness
  const keys = collectKeys([scenes, sequences, lines, clues, items, puzzles, docs, choices, quests, b.episode]);
  const locales = Object.keys(b.strings);
  const tables: Record<string, Record<string, string>> = {};
  for (const loc of locales) {
    const r = StringTable.safeParse(b.strings[loc]);
    if (!r.success) errors.push(`strings ${loc} invalid`);
    else tables[loc] = r.data;
  }
  for (const loc of locales) {
    for (const k of keys) if (!(k in (tables[loc] ?? {}))) errors.push(`missing ${loc} string ${k}`);
  }
  if (locales.length > 1) {
    const [a, ...rest] = locales;
    for (const other of rest) {
      for (const k of Object.keys(tables[a] ?? {})) if (!(k in (tables[other] ?? {}))) errors.push(`${other} lacks key ${k} present in ${a}`);
      for (const k of Object.keys(tables[other] ?? {})) if (!(k in (tables[a] ?? {}))) errors.push(`${a} lacks key ${k} present in ${other}`);
    }
  }
  for (const loc of locales) for (const [k, v] of Object.entries(tables[loc] ?? {})) if (!v.trim() && !allowEmpty.includes(k)) errors.push(`empty ${loc} string ${k}`);
  return errors;
}
