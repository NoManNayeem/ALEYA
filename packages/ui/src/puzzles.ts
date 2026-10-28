import type { PuzzleDef } from '@aleya/content-schema';
import {
  type BreakerPuzzle,
  type FloodgatePuzzle,
  type LanternPuzzle,
  type LedgerPuzzle,
  type PuzzleFeedback,
  type PuzzleSession,
  type RadioPuzzle,
  type ReconstructPuzzle,
  type WheelhousePuzzle,
} from '@aleya/game-core';
import { clear, h } from './dom';
import type { UI } from './ui';

export type PuzzleOutcome = 'solved' | 'closed' | 'skipped';

export interface PuzzleHost {
  t(key: string, vars?: Record<string, string | number>): string;
  num(n: number | string): string;
  allowSkip: boolean;
  slowLantern: boolean;
  /** push puzzle state into the 3D scene (valve wheels, gauges, disks) */
  sync(): void;
  playLine(lineId: string): Promise<void>;
  lineText(lineId: string): string;
  lanternBlink(pos: string, on: boolean): void;
  lanternRest(): void;
  sfx(cue: string): void;
  setSlowLantern(on: boolean): void;
  /** QA/automation: receives a function that completes the open puzzle */
  onOpen?(forceSolve: () => void): void;
}

interface Widget {
  render(): void;
  destroy?(): void;
  onKey?(a: string): boolean;
}

/**
 * Opens a puzzle panel. Every control is a focusable button so keyboard, gamepad
 * (via UI focus navigation) and pointer all work. Wrong answers are never permanent.
 */
export function openPuzzle(ui: UI, def: PuzzleDef, session: PuzzleSession, host: PuzzleHost): Promise<PuzzleOutcome> {
  const t = host.t;
  return new Promise((resolve) => {
    const body = h('div', { class: 'pbody' });
    const feedback = h('p', { class: 'feedback', role: 'status', 'aria-live': 'polite' });
    const hints = h('div', { class: 'hints hidden', 'aria-live': 'polite' });
    const footer = h('div', { class: 'actions' });
    let finished = false;

    const showHints = () => {
      clear(hints);
      const keys = session.hintKeys();
      hints.classList.toggle('hidden', keys.length === 0);
      keys.forEach((k, i) => hints.append(h('p', {}, h('strong', {}, `${t('ui.puzzle.hint')} ${host.num(i + 1)}: `), t(k))));
    };

    const finish = (o: PuzzleOutcome) => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      widget.destroy?.();
      ui.remove(layer);
      resolve(o);
    };

    const act = (fb?: PuzzleFeedback) => {
      session.activity(fb);
      host.sync();
      if (fb?.messageKey) {
        feedback.textContent = t(fb.messageKey);
        feedback.classList.toggle('bad', fb.failed);
      }
      if (fb?.failed) host.sfx('puzzle_fail');
      renderFooter();
      widget.render();
      if (fb?.solved) {
        host.sfx('puzzle_success');
        setTimeout(() => finish('solved'), 1400);
      }
    };

    const renderFooter = () => {
      const focusedId = (document.activeElement as HTMLElement | null)?.dataset?.fid;
      clear(footer);
      footer.append(
        h(
          'button',
          {
            class: 'btn inline',
            'data-fid': 'hint',
            disabled: session.record.hintLevel >= 3,
            onclick: () => {
              session.requestHint();
              showHints();
              renderFooter();
            },
          },
          `${t('ui.puzzle.hint_btn')} (${host.num(session.record.hintLevel)}/${host.num(3)})`,
        ),
      );
      if (session.canSkip(host.allowSkip))
        footer.append(
          h(
            'button',
            {
              class: 'btn inline',
              'data-fid': 'skip',
              onclick: async () => {
                if (await ui.confirm('ui.puzzle.skip_title', 'ui.puzzle.skip_body')) {
                  session.skip();
                  finish('skipped');
                }
              },
            },
            t('ui.puzzle.skip'),
          ),
        );
      footer.append(h('button', { class: 'btn inline', 'data-fid': 'close', onclick: () => finish('closed') }, t('ui.puzzle.close')));
      if (focusedId) (footer.querySelector(`[data-fid="${focusedId}"]`) as HTMLElement | null)?.focus();
    };

    const widget = makeWidget(def, session, host, body, act);
    const el = h(
      'div',
      { class: 'layer dim', 'data-test': `puzzle-${def.kind}` },
      h('div', { class: 'panel puzzle', role: 'dialog', 'aria-modal': 'true', 'aria-label': t(def.titleKey) }, h('h2', {}, t(def.titleKey)), h('p', { class: 'instructions' }, t(def.instructionsKey)), body, feedback, hints, footer),
    );
    widget.render();
    renderFooter();
    showHints();
    host.onOpen?.(() => {
      session.skip();
      finish('skipped');
    });
    const layer = ui.push({
      el,
      onBack: () => finish('closed'),
      onAction: (a) => {
        if (a === 'hint') {
          if (session.record.hintLevel < 3) {
            session.requestHint();
            showHints();
            renderFooter();
          }
          return true;
        }
        if (a === 'pause') {
          finish('closed');
          return true;
        }
        return widget.onKey?.(a) ?? false;
      },
    });
    // hint protocol: unsolicited level-1 hint only after ~90s of inactivity
    const timer = window.setInterval(() => {
      if (session.tick(1)) {
        session.requestHint();
        showHints();
        renderFooter();
      }
    }, 1000);
  });
}

/** Re-render helper that restores focus to the element with the same data-fid. */
function rerender(container: HTMLElement, build: () => (HTMLElement | null)[]): void {
  const fid = (document.activeElement as HTMLElement | null)?.dataset?.fid;
  const hadFocus = container.contains(document.activeElement);
  clear(container);
  container.append(...build().filter(Boolean as unknown as (x: HTMLElement | null) => x is HTMLElement));
  if (hadFocus && fid) (container.querySelector(`[data-fid="${fid}"]`) as HTMLElement | null)?.focus();
}

const SHAPE: Record<string, string> = { circle: '○', triangle: '△', square: '□' };

function makeWidget(def: PuzzleDef, session: PuzzleSession, host: PuzzleHost, body: HTMLElement, act: (fb?: PuzzleFeedback) => void): Widget {
  const t = host.t;
  const rules = session.rules;
  switch (def.kind) {
    case 'breaker': {
      const r = rules as BreakerPuzzle;
      return {
        render: () =>
          rerender(body, () => [
            h(
              'div',
              { class: 'grid3' },
              r.config.circuits.map((c) => {
                const v = r.wiring[c];
                const lit = r.lastCorrect.includes(c);
                return h(
                  'div',
                  { class: `cell ${lit ? 'ok' : ''}` },
                  h('div', { class: 'label' }, t(`puzzle.P1.circuit.${c}`)),
                  h('div', { class: 'value symbol', 'aria-live': 'polite' }, v ? SHAPE[v] : '·'),
                  h('div', { class: 'muted' }, v ? t(`puzzle.terminal.${v}`) : t('puzzle.terminal.none')),
                  h('button', { class: 'pbtn', 'data-fid': `${c}-p`, 'aria-label': `${t(`puzzle.P1.circuit.${c}`)} ◀`, onclick: () => (host.sfx('puzzle_click'), act(r.cycle(c, -1))) }, '◀'),
                  h('button', { class: 'pbtn', 'data-fid': `${c}-n`, 'aria-label': `${t(`puzzle.P1.circuit.${c}`)} ▶`, onclick: () => (host.sfx('puzzle_click'), act(r.cycle(c, 1))) }, '▶'),
                  lit ? h('div', { class: 'ok-mark' }, '✓') : null,
                );
              }),
            ),
            h(
              'div',
              { class: 'actions', style: 'justify-content:center' },
              h(
                'button',
                {
                  class: 'pbtn big',
                  'data-fid': 'main',
                  'data-test': 'breaker-main',
                  onclick: () => {
                    const fb = r.throwMain();
                    if (fb.failed) host.sfx('spark');
                    act(fb);
                  },
                },
                `⚡ ${t('puzzle.P1.main')}`,
              ),
            ),
          ]),
      };
    }
    case 'ledger': {
      const r = rules as LedgerPuzzle;
      let checked: string[] = [];
      return {
        render: () =>
          rerender(body, () => [
            h(
              'div',
              { class: 'doc ledger', style: 'width:100%;padding:1rem 1.2rem;box-shadow:none' },
              r.config.entries.map((e) => {
                const name = r.assigned[e];
                const ok = checked.includes(e);
                return h(
                  'div',
                  { class: `ledger-row ${ok ? 'ok' : ''}` },
                  h('div', {}, t(`puzzle.P2.entry.${e}`)),
                  h(
                    'div',
                    { class: 'name' },
                    h('button', { class: 'pbtn', 'data-fid': `${e}-p`, 'aria-label': `${t(`puzzle.P2.entry.${e}`)} ◀`, onclick: () => (host.sfx('puzzle_click'), (checked = []), act(r.cycle(e, -1))) }, '◀'),
                    h('strong', { style: 'flex:1;text-align:center' }, name ? t(`puzzle.P2.name.${name}`) : '_______', ok ? ' ✓' : ''),
                    h('button', { class: 'pbtn', 'data-fid': `${e}-n`, 'aria-label': `${t(`puzzle.P2.entry.${e}`)} ▶`, onclick: () => (host.sfx('puzzle_click'), (checked = []), act(r.cycle(e, 1))) }, '▶'),
                  ),
                );
              }),
            ),
            h(
              'div',
              { class: 'actions', style: 'justify-content:center' },
              h(
                'button',
                {
                  class: 'pbtn big',
                  'data-fid': 'check',
                  'data-test': 'ledger-check',
                  onclick: () => {
                    const fb = r.check();
                    checked = (fb.correct ?? []) as string[];
                    act(fb);
                  },
                },
                t('puzzle.P2.check'),
              ),
            ),
          ]),
      };
    }
    case 'radio': {
      const r = rules as RadioPuzzle;
      const cfg = def.config as { fragmentLines: Record<string, string> };
      const heard = new Set<string>();
      let raf = 0;
      const canvases = new Map<string, HTMLCanvasElement>();
      const draw = (time: number) => {
        for (const b of r.config.bands) {
          const c = canvases.get(b.id);
          if (!c || !c.isConnected) continue;
          const g = c.getContext('2d')!;
          const w = (c.width = c.clientWidth || 200);
          const hh = (c.height = 54);
          g.fillStyle = '#0a0f0d';
          g.fillRect(0, 0, w, hh);
          const s = r.signal(b.id);
          g.strokeStyle = s >= 1 ? '#9fffd0' : '#5fae8a';
          g.lineWidth = 2;
          g.beginPath();
          for (let x = 0; x < w; x++) {
            const clean = Math.sin(x * 0.12 + time * 0.006) * Math.sin(x * 0.031 + time * 0.002);
            const noise = Math.random() * 2 - 1;
            const y = hh / 2 + (clean * s + noise * (1 - s) * 0.9) * hh * 0.4;
            if (x === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
        }
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
      const maybePlay = () => {
        for (const b of r.config.bands) {
          if (r.isLocked(b.id) && !heard.has(b.fragment)) {
            heard.add(b.fragment);
            void host.playLine(cfg.fragmentLines[b.fragment]);
          }
        }
      };
      return {
        destroy: () => cancelAnimationFrame(raf),
        render: () =>
          rerender(body, () => {
            const bands = h(
              'div',
              { class: 'grid3' },
              r.config.bands.map((b) => {
                const cv = h('canvas', { class: 'wave', 'aria-hidden': 'true' }) as HTMLCanvasElement;
                canvases.set(b.id, cv);
                const locked = r.isLocked(b.id);
                const tune = (d: number) => {
                  host.sfx('puzzle_click');
                  act(r.tune(b.id, d));
                  maybePlay();
                };
                return h(
                  'div',
                  { class: `cell ${locked ? 'ok' : ''}` },
                  h('div', { class: 'label' }, t(`puzzle.P3.band.${b.id}`)),
                  cv,
                  h('div', { class: 'value', 'aria-live': 'polite' }, host.num(r.dials[b.id])),
                  h('div', { class: 'muted' }, locked ? t('puzzle.P3.locked') : t('puzzle.P3.noise')),
                  h('button', { class: 'pbtn', 'data-fid': `${b.id}-m`, 'aria-label': `${t(`puzzle.P3.band.${b.id}`)} −`, onclick: () => tune(-1) }, '−'),
                  h('button', { class: 'pbtn', 'data-fid': `${b.id}-p`, 'aria-label': `${t(`puzzle.P3.band.${b.id}`)} +`, onclick: () => tune(1) }, '+'),
                );
              }),
            );
            const unlocked = r.unlockedFragments();
            const list = h('ol', { class: 'order-list' });
            r.arrangement.forEach((f, i) => {
              const known = unlocked.includes(f);
              list.append(
                h(
                  'li',
                  {},
                  h('strong', {}, host.num(i + 1)),
                  h('span', {}, known ? host.lineText(cfg.fragmentLines[f]) : `[${t('puzzle.P3.noise')}]`),
                  h(
                    'span',
                    {},
                    known ? h('button', { class: 'pbtn', 'data-fid': `play-${f}`, onclick: () => void host.playLine(cfg.fragmentLines[f]) }, t('puzzle.P3.play')) : null,
                    h('button', { class: 'pbtn', 'data-fid': `up-${f}`, 'aria-label': '▲', disabled: i === 0, onclick: () => act(r.move(i, -1)) }, '▲'),
                    h('button', { class: 'pbtn', 'data-fid': `dn-${f}`, 'aria-label': '▼', disabled: i === r.arrangement.length - 1, onclick: () => act(r.move(i, 1)) }, '▼'),
                  ),
                ),
              );
            });
            return [
              bands,
              h('h3', { style: 'margin:1.2rem 0 0' }, t('puzzle.P3.order')),
              list,
              h('div', { class: 'actions', style: 'justify-content:center' }, h('button', { class: 'pbtn big', 'data-fid': 'check', 'data-test': 'radio-check', onclick: () => act(r.check()) }, t('puzzle.P3.check'))),
            ];
          }),
      };
    }
    case 'floodgate': {
      const r = rules as FloodgatePuzzle;
      const maxG = 6;
      return {
        render: () =>
          rerender(body, () => {
            const g = r.gauges();
            return [
              h(
                'div',
                { class: 'grid3' },
                r.config.target.map((target, i) =>
                  h(
                    'div',
                    { class: `cell ${g[i] === target ? 'ok' : ''}` },
                    h('div', { class: 'label' }, t('puzzle.P4.gauge', { g: ['I', 'II', 'III'][i] })),
                    h(
                      'div',
                      { class: 'gauge', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': maxG, 'aria-valuenow': g[i], 'aria-label': t('puzzle.P4.gauge', { g: ['I', 'II', 'III'][i] }) },
                      [...Array(maxG + 1).keys()].map((k) => h('div', { class: 'tick', style: `bottom:${(k / maxG) * 100}%` })),
                      h('div', { class: 'fill', style: `height:${(Math.min(maxG, g[i]) / maxG) * 100}%` }),
                      h('div', { class: 'mark', style: `bottom:${(target / maxG) * 100}%` }),
                    ),
                    h('div', { class: 'value' }, `${host.num(g[i])} / ${host.num(target)}`),
                  ),
                ),
              ),
              h(
                'div',
                { class: 'grid3', style: 'margin-top:0.8rem' },
                r.config.valves.map((v, i) =>
                  h(
                    'div',
                    { class: 'cell' },
                    h('div', { class: 'label' }, t('puzzle.P4.valve', { v })),
                    h('div', { class: 'value symbol', style: `transform:rotate(${r.turns[i] * 90}deg);display:inline-block` }, '✣'),
                    h('div', { class: 'muted' }, `${host.num(r.turns[i])} / ${host.num(r.config.maxTurns)}`),
                    h('button', { class: 'pbtn', 'data-fid': `${v}-m`, 'aria-label': `${t('puzzle.P4.valve', { v })} ↺`, onclick: () => (host.sfx('puzzle_click'), act(r.rotate(i, -1))) }, '↺'),
                    h('button', { class: 'pbtn', 'data-fid': `${v}-p`, 'aria-label': `${t('puzzle.P4.valve', { v })} ↻`, onclick: () => (host.sfx('puzzle_click'), act(r.rotate(i, 1))) }, '↻'),
                  ),
                ),
              ),
              h('div', { class: 'actions', style: 'justify-content:center' }, h('button', { class: 'pbtn', 'data-fid': 'reset', onclick: () => (r.reset(), act()) }, t('puzzle.P4.reset'))),
            ];
          }),
      };
    }
    case 'lantern': {
      const r = rules as LanternPuzzle;
      let playing = false;
      let lit: string | null = null;
      let slow = host.slowLantern;
      let cancelled = false;
      const play = async () => {
        if (playing) return;
        playing = true;
        const beat = slow ? 1.6 : 0.85;
        widgetRender();
        await sleep(400);
        for (const p of r.config.sequence) {
          if (cancelled) return;
          lit = p;
          host.lanternBlink(p, true);
          host.sfx('lantern_click');
          widgetRender();
          await sleep(beat * 600);
          lit = null;
          host.lanternBlink(p, false);
          widgetRender();
          await sleep(beat * 400);
        }
        host.lanternRest();
        playing = false;
        widgetRender();
      };
      const answer = async (p: string) => {
        if (playing) return;
        lit = p;
        host.lanternBlink(p, true);
        host.sfx('lantern_click');
        const fb = r.signal(p);
        act(fb);
        await sleep(300);
        lit = null;
        host.lanternBlink(p, false);
        widgetRender();
        if (fb.failed) setTimeout(() => void play(), 900);
      };
      const widgetRender = () =>
        rerender(body, () => [
          h(
            'div',
            { class: 'lantern-stage', 'aria-live': 'polite' },
            r.config.positions.map((p) =>
              h('div', { class: `lamp ${lit === p ? 'lit' : ''}` }, h('div', { class: 'symbol' }, { left: '○', center: '△', right: '□' }[p] ?? '•'), h('div', { class: 'muted' }, t(`puzzle.P5.pos.${p}`))),
            ),
          ),
          h(
            'div',
            { class: 'steps', 'aria-label': t('puzzle.P5.progress', { n: host.num(r.progress()), total: host.num(r.config.sequence.length) }) },
            r.config.sequence.map((_, i) => h('span', { class: i < r.progress() ? 'done' : '' })),
          ),
          h(
            'div',
            { class: 'grid3' },
            r.config.positions.map((p) =>
              h('button', { class: 'pbtn big', 'data-fid': `ans-${p}`, 'data-test': `lantern-${p}`, disabled: playing, onclick: () => void answer(p) }, `${{ left: '○', center: '△', right: '□' }[p]} ${t(`puzzle.P5.pos.${p}`)}`),
            ),
          ),
          h(
            'div',
            { class: 'actions', style: 'justify-content:center' },
            h('button', { class: 'pbtn', 'data-fid': 'watch', disabled: playing, onclick: () => void play() }, `▶ ${t('puzzle.P5.watch')}`),
            h(
              'button',
              {
                class: `pbtn ${slow ? 'sel' : ''}`,
                'data-fid': 'slow',
                'aria-pressed': slow ? 'true' : 'false',
                onclick: () => {
                  slow = !slow;
                  host.setSlowLantern(slow);
                  widgetRender();
                },
              },
              `${t('puzzle.P5.slow')}: ${slow ? '✓' : '—'}`,
            ),
          ),
        ]);
      setTimeout(() => void play(), 600);
      return {
        render: widgetRender,
        destroy: () => {
          cancelled = true;
          host.lanternRest();
        },
      };
    }
    case 'wheelhouse': {
      const r = rules as WheelhousePuzzle;
      return {
        render: () =>
          rerender(body, () => [
            h(
              'div',
              { class: 'grid3' },
              r.disks.map((d, i) =>
                h('div', { class: 'cell' }, h('div', { class: 'label' }, t('puzzle.P6.disk', { n: host.num(i + 1) })), h('div', { class: 'value', style: 'font-size:1.5rem', 'aria-live': 'polite' }, t(`puzzle.P6.sym.${d}`))),
              ),
            ),
            h(
              'div',
              { class: 'grid3', style: 'margin-top:0.8rem', role: 'radiogroup' },
              r.config.gears.map((_, g) =>
                h('button', { class: `pbtn ${r.gear === g ? 'sel' : ''}`, role: 'radio', 'aria-checked': r.gear === g ? 'true' : 'false', 'data-fid': `gear-${g}`, onclick: () => (host.sfx('puzzle_click'), act(r.selectGear(g))) }, t(`puzzle.P6.gear.${g}`)),
              ),
            ),
            h(
              'div',
              { class: 'actions', style: 'justify-content:center' },
              h('button', { class: 'pbtn big', 'data-fid': 'back', onclick: () => (host.sfx('puzzle_click'), act(r.crank(-1))) }, t('puzzle.P6.crank_back')),
              h('button', { class: 'pbtn big', 'data-fid': 'fwd', onclick: () => (host.sfx('puzzle_click'), act(r.crank(1))) }, t('puzzle.P6.crank_fwd')),
              h('button', { class: 'pbtn big', 'data-fid': 'handle', 'data-test': 'wheelhouse-handle', onclick: () => act(r.tryHandle()) }, t('puzzle.P6.handle')),
            ),
          ]),
      };
    }
    case 'reconstruct': {
      const r = rules as ReconstructPuzzle;
      let checked: number[] = [];
      return {
        render: () =>
          rerender(body, () => [
            h(
              'ol',
              { class: 'order-list' },
              r.arrangement.map((c, i) =>
                h(
                  'li',
                  { class: checked.includes(i) ? 'ok' : '' },
                  h('strong', {}, host.num(i + 1)),
                  h('span', {}, t(`puzzle.R1.card.${c}`)),
                  h(
                    'span',
                    {},
                    h('button', { class: 'pbtn', 'data-fid': `up-${c}`, 'aria-label': '▲', disabled: i === 0, onclick: () => ((checked = []), act(r.move(i, -1))) }, '▲'),
                    h('button', { class: 'pbtn', 'data-fid': `dn-${c}`, 'aria-label': '▼', disabled: i === r.arrangement.length - 1, onclick: () => ((checked = []), act(r.move(i, 1))) }, '▼'),
                  ),
                ),
              ),
            ),
            h(
              'div',
              { class: 'actions', style: 'justify-content:center' },
              h(
                'button',
                {
                  class: 'pbtn big',
                  'data-fid': 'check',
                  'data-test': 'reconstruct-check',
                  onclick: () => {
                    const fb = r.check();
                    checked = (fb.correct ?? []) as number[];
                    act(fb);
                  },
                },
                t('puzzle.R1.check'),
              ),
            ),
          ]),
      };
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
