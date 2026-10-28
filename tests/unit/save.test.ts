import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { GameSession, IndexedDbBackend, MemoryBackend, migrateSave, SaveError, SaveRepository, SAVE_SCHEMA_VERSION } from '@aleya/game-core';
import { episodeTables } from '../../content/episodes/ep01/index';

function session() {
  const s = new GameSession(episodeTables());
  s.flags.set('L01.power_on');
  s.inventory.add('item.lantern');
  s.addClue('clue.fuse_diagram');
  s.puzzleRecord('P1.breaker').solved = true;
  s.playSeconds = 123.4;
  return s;
}

describe('Saves', () => {
  it('round-trips a session snapshot without entity pointers', async () => {
    const repo = new SaveRepository(new MemoryBackend());
    const snap = session().snapshot('test', 1);
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    await repo.save(snap);
    const back = await repo.load();
    const s2 = new GameSession(episodeTables());
    s2.restore(back!);
    expect(s2.flags.has('L01.power_on')).toBe(true);
    expect(s2.inventory.has('item.lantern')).toBe(true);
    expect(s2.journal.has('clue.fuse_diagram')).toBe(true);
    expect(s2.puzzleRecord('P1.breaker').solved).toBe(true);
  });
  it('keeps one prior checkpoint and falls back to it when current is corrupt', async () => {
    const be = new MemoryBackend();
    const repo = new SaveRepository(be);
    const a = session().snapshot('test', 1);
    await repo.save(a);
    const b = { ...a, checkpointId: 'L01.cp_power' };
    await repo.save(b);
    be.data.set(SaveRepository.CURRENT, '{"schemaVersion":2,"broken":true}');
    const loaded = await repo.load();
    expect(loaded?.checkpointId).toBe(a.checkpointId);
  });
  it('surfaces quota errors instead of failing silently', async () => {
    const be = new MemoryBackend();
    be.failNext = new SaveError('full', 'quota');
    await expect(new SaveRepository(be).save(session().snapshot('t', 1))).rejects.toMatchObject({ reason: 'quota' });
  });
  it('migrates v1 saves and rejects newer versions', () => {
    const v1 = { schemaVersion: 1, gameBuild: 'old', episodeId: 'aleya.ep01', sceneId: 'aleya.ep01.L02', checkpointId: 'L02.cp_start', playSeconds: 10, questFlags: [], puzzleState: {}, inventoryItems: [], clueIds: ['clue.fuse_diagram'], endingState: true, settingsVersion: 1, savedAt: 'x' };
    const m = migrateSave(v1);
    expect(m.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(m.clues[0].id).toBe('clue.fuse_diagram');
    expect(m.endingState).toBe('A');
    expect(() => migrateSave({ ...v1, schemaVersion: 99 })).toThrow(SaveError);
  });
  it('export/import round trip and rejects foreign files', () => {
    const snap = session().snapshot('t', 1);
    expect(SaveRepository.parseImport(SaveRepository.exportText(snap))).toEqual(snap);
    expect(() => SaveRepository.parseImport('{"hello":1}')).toThrow();
    expect(() => SaveRepository.parseImport('not json')).toThrow();
  });
  it('IndexedDB backend: 1000 save/load cycles stay consistent', async () => {
    const repo = new SaveRepository(new IndexedDbBackend('aleya-test', 'saves'));
    const s = session();
    for (let i = 0; i < 1000; i++) {
      s.playSeconds = i;
      await repo.save(s.snapshot('t', 1));
      const back = await repo.load();
      expect(back?.playSeconds).toBe(i);
    }
  });
});
