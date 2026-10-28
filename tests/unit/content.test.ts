import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { collectKeys, validateEpisodeBundle } from '@aleya/content-schema';
import { MATERIAL_IDS } from '../../packages/renderer-pc/src/materials';
import { PREFABS } from '../../packages/renderer-pc/src/prefabs';
import { episodeTables, rawBundle, stringTables } from '../../content/episodes/ep01/index';

describe('Episode content', () => {
  it('passes schema, cross-reference and localization validation', async () => {
    const errors = validateEpisodeBundle(await rawBundle());
    expect(errors).toEqual([]);
  });

  it('has 5 scenes, 6 mandatory puzzles, 2 optional investigations, 2 pursuits + 1 avoidance, 2 endings', async () => {
    const b = await rawBundle();
    const t = episodeTables();
    expect(t.manifest.scenes.length).toBe(5);
    expect(t.puzzles.filter((p) => p.id.startsWith('P')).length).toBe(6);
    const scenes = b.scenes as { interactables: { optional?: boolean }[]; threats: { kind: string }[] }[];
    expect(scenes.flatMap((s) => s.interactables ?? []).filter((i) => i.optional).length).toBeGreaterThanOrEqual(2);
    const threats = scenes.flatMap((s) => s.threats ?? []);
    expect(threats.filter((x) => x.kind === 'pursuit').length).toBe(2);
    expect(threats.filter((x) => x.kind === 'patrol').length).toBe(1);
    expect(t.choices[0].options.length).toBe(2);
  });

  it('every prefab and material referenced by scenes exists in the renderer', async () => {
    const b = await rawBundle();
    for (const s of b.scenes as { id: string; props: { kind: string; prefab?: string; material?: string }[] }[]) {
      for (const p of s.props) {
        if (p.kind === 'prefab') expect(PREFABS, `${s.id} prefab ${p.prefab}`).toHaveProperty(p.prefab!);
        if (p.material) expect(MATERIAL_IDS, `${s.id} material ${p.material}`).toContain(p.material);
      }
    }
  });

  it('every t("…") key used in code exists in both locales', () => {
    const tables = stringTables();
    const keys = new Set<string>();
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) {
          const src = readFileSync(p, 'utf8');
          for (const m of src.matchAll(/\bt\(\s*'([a-z][\w.]+)'/g)) keys.add(m[1]);
          for (const m of src.matchAll(/\bthis\.t\(\s*'([a-z][\w.]+)'/g)) keys.add(m[1]);
          for (const m of src.matchAll(/ui\.confirm\(\s*'([\w.]+)',\s*'([\w.]+)'/g)) keys.add(m[1]), keys.add(m[2]);
        }
      }
    };
    walk('apps/web/src');
    walk('packages/ui/src');
    const missing = [...keys].filter((k) => !(k in tables.en) || !(k in tables.bn));
    expect(missing).toEqual([]);
  });

  it('dynamic UI keys (settings tabs, actions, puzzle labels, people) are present', () => {
    const { en, bn } = stringTables();
    const dyn = [
      ...['graphics', 'audio', 'controls', 'access', 'language'].map((k) => `ui.settings.tab.${k}`),
      ...['up', 'down', 'left', 'right', 'interact', 'run', 'crouch', 'lantern', 'journal', 'pause', 'hint'].map((k) => `ui.action.${k}`),
      ...['master', 'music', 'ambience', 'foley', 'sfx', 'dialogue', 'ui'].map((k) => `ui.audio.${k}`),
      ...['objective', 'evidence', 'people', 'items', 'map'].map((k) => `ui.journal.${k}`),
      ...['document', 'photo', 'audio', 'object', 'person'].map((k) => `ui.clue.kind.${k}`),
      ...['rafi', 'karim', 'mira', 'jalal', 'talukder', 'watcher', 'tuli'].flatMap((k) => [`people.${k}.name`, `people.${k}.body`]),
      ...['jetty', 'shelter', 'gate'].map((k) => `puzzle.P1.circuit.${k}`),
      ...['circle', 'triangle', 'square', 'none'].map((k) => `puzzle.terminal.${k}`),
      ...['t2050', 't2105', 't2120', 't2140'].map((k) => `puzzle.P2.entry.${k}`),
      ...['rafi', 'malek', 'nurbanu', 'shirin'].map((k) => `puzzle.P2.name.${k}`),
      ...['mw', 'sw1', 'sw2'].map((k) => `puzzle.P3.band.${k}`),
      ...['left', 'center', 'right'].map((k) => `puzzle.P5.pos.${k}`),
      ...[0, 1, 2, 3, 4, 5].map((k) => `puzzle.P6.sym.${k}`),
      ...[0, 1, 2].map((k) => `puzzle.P6.gear.${k}`),
      ...['ev.cut', 'ev.divert', 'ev.lantern', 'ev.ground'].map((k) => `puzzle.R1.card.${k}`),
      ...['L01', 'L02', 'L03', 'L04', 'L05'].map((k) => `scene.${k}.name`),
      ...['tip.move', 'tip.lantern', 'tip.run', 'tip.hide'],
      ...['A', 'B'].flatMap((k) => [`ending.${k}.title`, `ending.${k}.card1`, `ending.${k}.card2`, `ending.${k}.card3`, `credits.epilogue.${k}`]),
    ];
    expect(dyn.filter((k) => !(k in en) || !(k in bn))).toEqual([]);
    expect(collectKeys({ titleKey: 'x' }).has('x')).toBe(true);
  });

  it('no duplicate scene ids and all scene ids are globally stable', async () => {
    const b = await rawBundle();
    const ids = (b.scenes as { id: string }[]).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^aleya\.ep01\.L0[1-5]$/);
  });
});
