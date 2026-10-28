import { describe, expect, it } from 'vitest';
import {
  BreakerPuzzle,
  FlagStore,
  FloodgatePuzzle,
  InputActions,
  Inventory,
  Journal,
  LanternPuzzle,
  LedgerPuzzle,
  NarrativeDirector,
  NavConstraint,
  PlayerMotor,
  PuzzleSession,
  QuestGraph,
  RadioPuzzle,
  ReconstructPuzzle,
  ThreatController,
  WheelhousePuzzle,
  emptyRecord,
  HINT_IDLE_SECONDS,
} from '@aleya/game-core';
import type { PuzzleDef, Sequence } from '@aleya/content-schema';
import puzzles from '../../content/episodes/ep01/puzzles.json';

const P = (id: string) => (puzzles as unknown as PuzzleDef[]).find((p) => p.id === id)!;

describe('FlagStore / QuestGraph', () => {
  it('evaluates conditions', () => {
    const f = new FlagStore();
    expect(f.test({ all: ['a'] })).toBe(false);
    f.set('a');
    expect(f.test({ all: ['a'], none: ['b'] })).toBe(true);
    f.set('b');
    expect(f.test({ none: ['b'] })).toBe(false);
  });
  it('current objective follows authored order and never skips ahead', () => {
    const f = new FlagStore();
    const q = new QuestGraph(
      [
        { id: 'q1', sceneId: 's', objectiveKey: 'o1', activeWhen: {}, doneWhen: { all: ['x'] } },
        { id: 'q2', sceneId: 's', objectiveKey: 'o2', activeWhen: { all: ['x'] }, doneWhen: { all: ['y'] } },
      ],
      f,
    );
    expect(q.current('s')?.id).toBe('q1');
    f.set('x');
    expect(q.current('s')?.id).toBe('q2');
    f.set('y');
    expect(q.current('s')).toBeUndefined();
  });
  it('rejects duplicate quest ids', () => {
    const n = { id: 'q', sceneId: 's', objectiveKey: 'o', activeWhen: {}, doneWhen: {} };
    expect(() => new QuestGraph([n, n], new FlagStore())).toThrow();
  });
});

describe('Inventory / Journal', () => {
  it('caps key items at six', () => {
    const inv = new Inventory();
    for (let i = 0; i < 6; i++) inv.add(`i${i}`);
    expect(() => inv.add('i7')).toThrow();
    expect(inv.add('i0')).toBe(false);
    expect(inv.remove('i0')).toBe(true);
    expect(inv.list().length).toBe(5);
  });
  it('tracks new clues', () => {
    const j = new Journal();
    expect(j.add('c1', 's', 10)).toBe(true);
    expect(j.add('c1', 's', 20)).toBe(false);
    expect(j.newCount()).toBe(1);
    j.markSeen('c1');
    expect(j.newCount()).toBe(0);
  });
});

describe('Puzzles are solvable with content configs and never deadlock', () => {
  it('P1 breaker: wrong attempt trips safely, correct wiring solves', () => {
    const p = new BreakerPuzzle(P('P1.breaker').config as never);
    expect(p.throwMain().messageKey).toBe('puzzle.breaker.incomplete');
    p.set('jetty', 'circle');
    p.set('shelter', 'circle');
    p.set('gate', 'square');
    const fb = p.throwMain();
    expect(fb.failed).toBe(true);
    expect(fb.correct).toEqual(['shelter', 'gate']);
    p.set('jetty', 'triangle');
    expect(p.throwMain().solved).toBe(true);
  });
  it('P2 ledger: swaps names instead of duplicating; solution passes', () => {
    const p = new LedgerPuzzle(P('P2.ledger').config as never);
    p.assign('t2050', 'malek');
    p.assign('t2105', 'malek');
    expect(p.assigned.t2050).toBe(null);
    p.assign('t2050', 'rafi');
    p.assign('t2120', 'nurbanu');
    p.assign('t2140', 'shirin');
    expect(p.check().solved).toBe(true);
  });
  it('P3 radio: tuning locks bands, order check', () => {
    const p = new RadioPuzzle(P('P3.radio').config as never);
    expect(p.check().solved).toBe(false);
    for (const b of p.config.bands) p.setDial(b.id, b.target);
    expect(p.allLocked()).toBe(true);
    expect(p.unlockedFragments().length).toBe(3);
    // sort arrangement into the correct order using only moves
    for (let pass = 0; pass < 5; pass++)
      for (let i = 0; i < p.arrangement.length - 1; i++)
        if (p.config.order.indexOf(p.arrangement[i]) > p.config.order.indexOf(p.arrangement[i + 1])) p.move(i, 1);
    expect(p.check().solved).toBe(true);
  });
  it('P4 floodgate: unique reachable solution and reset', () => {
    const p = new FloodgatePuzzle(P('P4.floodgate').config as never);
    let solutions = 0;
    for (let a = 0; a <= 3; a++) for (let b = 0; b <= 3; b++) for (let c = 0; c <= 3; c++) {
      p.turns = [a, b, c];
      if (p.matches()) solutions++;
    }
    expect(solutions).toBe(1);
    p.reset();
    p.rotate(0, 1);
    p.rotate(0, 1);
    p.rotate(1, 1);
    p.rotate(1, 1);
    expect(p.rotate(2, 1).solved).toBe(true);
  });
  it('P5 lantern: wrong beat restarts the pattern', () => {
    const p = new LanternPuzzle(P('P5.lantern').config as never);
    p.signal('center');
    expect(p.signal('right').failed).toBe(true);
    expect(p.progress()).toBe(0);
    for (const s of p.config.sequence) p.signal(s);
    expect(p.isSolved()).toBe(true);
  });
  it('P6 wheelhouse: hint-3 solution works; wrong try resets disks only', () => {
    const p = new WheelhousePuzzle(P('P6.wheelhouse').config as never);
    p.crank(1);
    expect(p.tryHandle().failed).toBe(true);
    expect(p.disks).toEqual(p.config.start);
    p.selectGear(1);
    for (let i = 0; i < 4; i++) p.crank(1);
    p.selectGear(0);
    for (let i = 0; i < 2; i++) p.crank(1);
    p.selectGear(2);
    p.crank(1);
    expect(p.tryHandle().solved).toBe(true);
  });
  it('R1 reconstruct: solvable by moves', () => {
    const p = new ReconstructPuzzle(P('R1.reconstruct').config as never);
    for (let pass = 0; pass < 6; pass++)
      for (let i = 0; i < p.arrangement.length - 1; i++)
        if (p.config.order.indexOf(p.arrangement[i]) > p.config.order.indexOf(p.arrangement[i + 1])) p.move(i, 1);
    expect(p.check().solved).toBe(true);
  });
  it('state survives serialize/restore', () => {
    const def = P('P4.floodgate');
    const a = new FloodgatePuzzle(def.config as never);
    a.rotate(0, 1);
    const b = new FloodgatePuzzle(def.config as never);
    b.restore(JSON.parse(JSON.stringify(a.serialize())));
    expect(b.turns).toEqual(a.turns);
  });
});

describe('Hint protocol', () => {
  it('no unsolicited hint before 90s idle; three levels; skip after failures', () => {
    const def = P('P1.breaker');
    const rules = new BreakerPuzzle(def.config as never);
    const s = new PuzzleSession(def, rules, emptyRecord());
    for (let i = 0; i < HINT_IDLE_SECONDS - 1; i++) expect(s.tick(1)).toBe(false);
    expect(s.tick(1)).toBe(true);
    expect(s.tick(1)).toBe(false);
    s.requestHint();
    s.requestHint();
    s.requestHint();
    s.requestHint();
    expect(s.record.hintLevel).toBe(3);
    expect(s.canSkip(true)).toBe(false);
    for (let i = 0; i < 3; i++) s.activity({ solved: false, failed: true });
    expect(s.canSkip(false)).toBe(false);
    expect(s.canSkip(true)).toBe(true);
  });
});

describe('Threats', () => {
  const pursuit = { id: 't', kind: 'pursuit' as const, spawn: [0, 0, 0] as [number, number, number], speed: 0.9, telegraphSeconds: 2, safeX: 30, failCheckpoint: 'cp' };
  it('telegraphs before pursuing and catches a stationary player', () => {
    const t = new ThreatController(pursuit, { lowTension: false });
    t.start();
    expect(t.phase).toBe('Telegraph');
    let caught = false;
    for (let i = 0; i < 600 && !caught; i++) caught = t.update(1 / 60, { playerX: 4, hidden: false, readingText: false, playerRunSpeed: 2.8 }).some((e) => e.type === 'caught');
    expect(caught).toBe(true);
  });
  it('a running player escapes; reading text freezes the threat', () => {
    const t = new ThreatController(pursuit, { lowTension: false });
    t.start();
    let x = 4;
    let escaped = false;
    for (let i = 0; i < 1200 && !escaped; i++) {
      x += 2.8 / 60;
      const ev = t.update(1 / 60, { playerX: x, hidden: false, readingText: false, playerRunSpeed: 2.8 });
      expect(ev.some((e) => e.type === 'caught')).toBe(false);
      escaped = ev.some((e) => e.type === 'escaped');
    }
    expect(escaped).toBe(true);
    const t2 = new ThreatController(pursuit, { lowTension: false });
    t2.start();
    const before = t2.phase;
    for (let i = 0; i < 600; i++) t2.update(1 / 60, { playerX: 1, hidden: false, readingText: true, playerRunSpeed: 2.8 });
    expect(t2.phase).toBe(before);
  });
  it('patrol never catches a hidden player', () => {
    const t = new ThreatController(
      { id: 'p', kind: 'patrol', spawn: [0, 5, 0], speed: 1, telegraphSeconds: 1, patrol: { x0: 0, x1: 10, lookSeconds: 3, restSeconds: 1 }, safeX: 20, failCheckpoint: 'cp' },
      { lowTension: false },
    );
    t.start();
    for (let i = 0; i < 60 * 30; i++) expect(t.update(1 / 60, { playerX: 5, hidden: true, readingText: false, playerRunSpeed: 2.8 }).some((e) => e.type === 'caught')).toBe(false);
  });
});

describe('Navigation', () => {
  const flags = new FlagStore();
  const nav = new NavConstraint(
    [
      { x0: 0, x1: 10, z0: -1, z1: 1, y0: 0, surface: 'mud' },
      { x0: 10, x1: 20, z0: -0.2, z1: 0.2, y0: 0, y1: 2, surface: 'wood' },
    ],
    [{ id: 'b', x: 15, side: 'max', until: { all: ['open'] } }],
    [],
    flags,
  );
  it('clamps to lanes, blocks barriers until their flag, follows ramps', () => {
    const r = nav.resolve(5, 0, 5, 5);
    expect(r.z).toBe(1);
    const b = nav.resolve(14, 0, 16, 0);
    expect(b.x).toBe(15);
    expect(b.blockedBy?.id).toBe('b');
    flags.set('open');
    const c = nav.resolve(14, 0, 16, 0);
    expect(c.x).toBe(16);
    expect(c.y).toBeCloseTo(1.2);
    expect(nav.resolve(19.9, 0, 30, 0).x).toBe(20);
  });
  it('player motor accelerates toward target speeds', () => {
    const m = new PlayerMotor(nav);
    m.teleport(1, 0, 0);
    for (let i = 0; i < 60; i++) m.update(1 / 60, { moveX: 1, moveZ: 0, run: false, crouch: false }, false);
    expect(m.speed).toBeCloseTo(1.6, 1);
    expect(m.state).toBe('Walk');
  });
});

describe('InputActions', () => {
  it('maps keys, edges and remaps without conflicts', () => {
    const i = new InputActions();
    i.feedKey('KeyE', true);
    i.update(1 / 60);
    expect(i.pressed('interact')).toBe(true);
    i.update(1 / 60);
    expect(i.pressed('interact')).toBe(false);
    expect(i.held('interact')).toBe(true);
    i.rebind('lantern', 0, 'KeyE');
    expect(i.bindings.interact).not.toContain('KeyE');
    expect(i.conflicts()).toEqual([]);
  });
  it('gamepad axes respect dead zone; toggle run', () => {
    const i = new InputActions();
    i.deadZone = 0.25;
    i.feedGamepad({ axes: [0.2, 0, 0, 0], buttons: [] });
    i.update(1 / 60);
    expect(i.axis('moveX')).toBe(0);
    i.feedGamepad({ axes: [1, 0, 0, 0], buttons: [] });
    expect(i.axis('moveX')).toBe(1);
    i.toggleRun = true;
    i.feedKey('ShiftLeft', true);
    i.update(1 / 60);
    i.feedKey('ShiftLeft', false);
    i.update(1 / 60);
    expect(i.held('run')).toBe(true);
  });
});

describe('NarrativeDirector', () => {
  it('skipping applies persistent steps but drops presentational ones', async () => {
    const flags = new FlagStore();
    const ran: string[] = [];
    const seq: Sequence = {
      id: 's',
      skippable: true,
      steps: [{ say: 'a' }, { wait: 5 }, { set: 'f1' }, { if: { all: ['f1'] }, then: [{ clue: 'c' }] }, { say: 'b' }, { checkpoint: 'cp' }],
    };
    let director!: NarrativeDirector;
    director = new NarrativeDirector(new Map([[seq.id, seq]]), flags, {
      run: async (step, ctx) => {
        const k = Object.keys(step)[0];
        ran.push(`${k}${ctx.fast ? ':fast' : ''}`);
        if (k === 'set') flags.set((step as { set: string }).set);
        if (k === 'wait') {
          director.skip();
          await ctx.skip.promise;
        }
      },
    });
    await director.play('s');
    expect(ran).toEqual(['say', 'wait', 'set:fast', 'clue:fast', 'checkpoint:fast']);
    expect(flags.has('f1')).toBe(true);
  });
});

describe('InputActions tap latching', () => {
  it('a key pressed and released within one frame still registers once', () => {
    const i = new InputActions();
    i.feedKey('KeyE', true);
    i.feedKey('KeyE', false);
    i.update(1 / 60);
    expect(i.pressed('interact')).toBe(true);
    i.update(1 / 60);
    expect(i.pressed('interact')).toBe(false);
    expect(i.held('interact')).toBe(false);
  });
});
