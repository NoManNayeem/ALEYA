import { DEFAULT_BINDINGS, type InputActions, keyLabel, REMAPPABLE, type Settings } from '@aleya/game-core';
import { clear, h } from './dom';
import type { Layer, UI } from './ui';

type T = (key: string, vars?: Record<string, string | number>) => string;

// --------------------------------------------------------------------------- loading

export function loadingScreen(ui: UI, label: string): { set(p: number, label?: string): void; close(): void } {
  const bar = h('div');
  const txt = h('div', { class: 'muted' }, label);
  const el = h('div', { class: 'layer solid loading', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, txt, h('div', { class: 'bar' }, bar));
  const layer = ui.push({ el, modal: false });
  return {
    set(p, l) {
      bar.style.width = `${Math.round(p * 100)}%`;
      el.setAttribute('aria-valuenow', String(Math.round(p * 100)));
      if (l) txt.textContent = l;
    },
    close() {
      ui.remove(layer);
    },
  };
}

// --------------------------------------------------------------------------- title

export interface TitleOptions {
  hasSave: boolean;
  complete: boolean;
  version: string;
  onNew(): void;
  onContinue(): void;
  onSettings(): void;
  onCredits(): void;
  onLicenses(): void;
  onImport(): void;
}

export function titleScreen(ui: UI, o: TitleOptions): Layer {
  const t = ui.deps.t;
  const items: HTMLElement[] = [];
  if (o.hasSave) items.push(h('button', { class: 'btn primary', onclick: o.onContinue, 'data-test': 'continue' }, t(o.complete ? 'ui.title.continue_complete' : 'ui.title.continue')));
  items.push(h('button', { class: `btn ${o.hasSave ? '' : 'primary'}`, onclick: o.onNew, 'data-test': 'new-game' }, t('ui.title.new')));
  items.push(h('button', { class: 'btn', onclick: o.onSettings }, t('ui.title.settings')));
  items.push(h('button', { class: 'btn', onclick: o.onImport }, t('ui.save.import')));
  items.push(h('button', { class: 'btn', onclick: o.onCredits }, t('ui.title.credits')));
  items.push(h('button', { class: 'btn', onclick: o.onLicenses }, t('ui.title.licenses')));
  const el = h(
    'div',
    { class: 'layer title-screen', 'data-test': 'title' },
    h('div', { class: 'title-block' }, h('h1', { lang: 'bn' }, 'শেষ খেয়া'), h('div', { class: 'en-title' }, 'ALEYA · THE LAST FERRY'), h('nav', { class: 'menu', 'aria-label': t('ui.title.menu') }, items)),
    h('div', { class: 'title-footer' }, h('span', {}, t('ui.title.footer')), h('span', {}, o.version)),
  );
  return ui.push({ el, initialFocus: items[0] });
}

// --------------------------------------------------------------------------- pre-play prompt

export function prePlay(ui: UI, s: Settings, apply: (s: Settings) => void): Promise<void> {
  const t = ui.deps.t;
  return new Promise((resolve) => {
    const body = h('div');
    const render = () => {
      clear(body);
      body.append(
        h('p', { class: 'muted' }, t('ui.preplay.intro')),
        segRow(t('ui.settings.language'), ['bn', 'en'], s.language, (v) => {
          s.language = v as Settings['language'];
          s.subtitleLanguage = s.language;
          apply(s);
          rerender();
        }, (v) => (v === 'bn' ? 'বাংলা' : 'English')),
        segRow(t('ui.settings.quality'), ['low', 'medium', 'high', 'ultra'], s.quality, (v) => {
          s.quality = v as Settings['quality'];
          apply(s);
        }, (v) => t(`ui.quality.${v}`)),
        segRow(t('ui.settings.subtitle_size'), ['100', '125', '150', '200'], String(s.subtitleSize), (v) => {
          s.subtitleSize = Number(v) as Settings['subtitleSize'];
          apply(s);
        }, (v) => `${v}%`),
        toggleRow(t('ui.settings.reduced_flash'), t('ui.settings.reduced_flash_d'), s.reducedFlash, (v) => {
          s.reducedFlash = v;
          apply(s);
        }),
        toggleRow(t('ui.settings.low_tension'), t('ui.settings.low_tension_d'), s.lowTension, (v) => {
          s.lowTension = v;
          apply(s);
        }),
        toggleRow(t('ui.settings.camera_shake'), '', s.cameraShake, (v) => {
          s.cameraShake = v;
          apply(s);
        }),
        h('div', { class: 'panel', style: 'margin-top:1rem;background:rgba(208,87,74,0.08);padding:0.9rem 1.1rem' }, h('strong', {}, t('ui.warning.title')), h('p', { style: 'margin:0.4rem 0 0' }, t('ui.warning.body'))),
      );
    };
    const rerender = () => {
      title.textContent = t('ui.preplay.title');
      start.textContent = t('ui.preplay.start');
      render();
    };
    const title = h('h2', {}, t('ui.preplay.title'));
    const start = h('button', { class: 'btn inline primary', 'data-test': 'preplay-start', onclick: () => finish() }, t('ui.preplay.start'));
    const el = h('div', { class: 'layer dim' }, h('div', { class: 'panel settings', role: 'dialog', 'aria-modal': 'true' }, title, body, h('div', { class: 'actions' }, start)));
    render();
    const layer = ui.push({ el, initialFocus: start });
    const finish = () => {
      s.firstRunDone = true;
      apply(s);
      ui.remove(layer);
      resolve();
    };
  });
}

// --------------------------------------------------------------------------- form rows

export function segRow(label: string, values: string[], current: string, onPick: (v: string) => void, fmt: (v: string) => string = (v) => v, desc = ''): HTMLElement {
  const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  const buttons = values.map((v) =>
    h(
      'button',
      {
        class: v === current ? 'on' : '',
        role: 'radio',
        'aria-checked': v === current ? 'true' : 'false',
        onclick: () => {
          buttons.forEach((b) => {
            b.classList.remove('on');
            b.setAttribute('aria-checked', 'false');
          });
          const b = buttons[values.indexOf(v)];
          b.classList.add('on');
          b.setAttribute('aria-checked', 'true');
          onPick(v);
        },
      },
      fmt(v),
    ),
  );
  seg.append(...buttons);
  return h('div', { class: 'row' }, h('label', {}, label, desc ? h('small', {}, desc) : null), seg);
}

export function toggleRow(label: string, desc: string, value: boolean, onChange: (v: boolean) => void, onLabel = '✓', offLabel = '—'): HTMLElement {
  return segRow(label, ['on', 'off'], value ? 'on' : 'off', (v) => onChange(v === 'on'), (v) => (v === 'on' ? onLabel : offLabel), desc);
}

export function sliderRow(label: string, value: number, onChange: (v: number) => void, min = 0, max = 1, step = 0.05): HTMLElement {
  const out = h('span', { class: 'muted', style: 'min-width:3rem;text-align:right' }, `${Math.round(value * 100)}%`);
  const input = h('input', {
    type: 'range',
    min,
    max,
    step,
    value,
    'aria-label': label,
    oninput: (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value);
      out.textContent = `${Math.round(v * 100)}%`;
      onChange(v);
    },
  }) as HTMLInputElement;
  return h('div', { class: 'row' }, h('label', {}, label), h('div', { style: 'display:flex;gap:0.6rem;align-items:center' }, input, out));
}

// --------------------------------------------------------------------------- settings

export interface SettingsDeps {
  settings: Settings;
  input: InputActions;
  apply(s: Settings): void;
  onClose(): void;
}

export function settingsScreen(ui: UI, d: SettingsDeps): Layer {
  const t = ui.deps.t;
  const s = d.settings;
  const tabs = ['graphics', 'audio', 'controls', 'access', 'language'] as const;
  let tab: (typeof tabs)[number] = 'graphics';
  const tabBar = h('div', { class: 'tabs', role: 'tablist' });
  const body = h('div', { role: 'tabpanel' });
  const apply = () => d.apply(s);
  let listening: { action: string; slot: number; btn: HTMLButtonElement } | null = null;

  const onKey = (e: KeyboardEvent) => {
    if (!listening) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code !== 'Escape') {
      d.input.rebind(listening.action as (typeof REMAPPABLE)[number], listening.slot, e.code);
      s.bindings = structuredClone(d.input.bindings);
      apply();
    }
    listening = null;
    renderBody();
  };
  window.addEventListener('keydown', onKey, true);

  const renderTabs = () => {
    clear(tabBar);
    for (const k of tabs)
      tabBar.append(
        h(
          'button',
          {
            class: `tab ${k === tab ? 'active' : ''}`,
            role: 'tab',
            'aria-selected': k === tab ? 'true' : 'false',
            onclick: () => {
              tab = k;
              renderTabs();
              renderBody();
            },
          },
          t(`ui.settings.tab.${k}`),
        ),
      );
  };

  const renderBody = () => {
    clear(body);
    if (tab === 'graphics') {
      body.append(
        segRow(t('ui.settings.quality'), ['low', 'medium', 'high', 'ultra'], s.quality, (v) => ((s.quality = v as Settings['quality']), apply()), (v) => t(`ui.quality.${v}`), t('ui.settings.quality_d')),
        toggleRow(t('ui.settings.dynres'), t('ui.settings.dynres_d'), s.dynamicResolution, (v) => ((s.dynamicResolution = v), apply())),
        sliderRow(t('ui.settings.brightness'), s.brightness, (v) => ((s.brightness = v), apply()), 0.7, 1.6, 0.05),
        segRow(t('ui.settings.fps'), ['0', '60', '30'], String(s.fpsCap), (v) => ((s.fpsCap = Number(v) as Settings['fpsCap']), apply()), (v) => (v === '0' ? t('ui.settings.fps_unlimited') : v)),
      );
    } else if (tab === 'audio') {
      for (const bus of ['master', 'music', 'ambience', 'foley', 'sfx', 'dialogue', 'ui'] as const)
        body.append(sliderRow(t(`ui.audio.${bus}`), s.volumes[bus], (v) => ((s.volumes[bus] = v), apply())));
      body.append(
        toggleRow(t('ui.audio.mute'), '', s.mute, (v) => ((s.mute = v), apply())),
        toggleRow(t('ui.audio.boost'), t('ui.audio.boost_d'), s.dialogueBoost, (v) => ((s.dialogueBoost = v), apply())),
        segRow(t('ui.audio.range'), ['night', 'standard', 'headphones'], s.dynamicRange, (v) => ((s.dynamicRange = v as Settings['dynamicRange']), apply()), (v) => t(`ui.audio.range.${v}`)),
      );
    } else if (tab === 'controls') {
      for (const action of REMAPPABLE) {
        const binds = d.input.bindings[action];
        const row = h('div', { class: 'bind' });
        for (let slot = 0; slot < 2; slot++) {
          const code = binds[slot];
          const btn = h(
            'button',
            {
              class: listening?.action === action && listening.slot === slot ? 'listening' : '',
              'aria-label': `${t(`ui.action.${action}`)} ${slot + 1}`,
              onclick: () => {
                listening = { action, slot, btn };
                btn.classList.add('listening');
                btn.textContent = t('ui.controls.press');
              },
            },
            code ? keyLabel(code) : '—',
          ) as HTMLButtonElement;
          row.append(btn);
        }
        body.append(h('div', { class: 'row' }, h('label', {}, t(`ui.action.${action}`)), row));
      }
      body.append(
        toggleRow(t('ui.controls.toggle_run'), t('ui.controls.toggle_run_d'), s.toggleRun, (v) => ((s.toggleRun = v), apply())),
        sliderRow(t('ui.controls.deadzone'), s.deadZone, (v) => ((s.deadZone = v), apply()), 0.05, 0.5, 0.05),
        h('p', { class: 'muted' }, t('ui.controls.gamepad')),
        h(
          'div',
          { class: 'actions' },
          h(
            'button',
            {
              class: 'btn inline',
              onclick: () => {
                d.input.bindings = structuredClone(DEFAULT_BINDINGS);
                s.bindings = structuredClone(DEFAULT_BINDINGS);
                apply();
                renderBody();
              },
            },
            t('ui.controls.reset'),
          ),
        ),
      );
    } else if (tab === 'access') {
      body.append(
        toggleRow(t('ui.settings.subtitles'), '', s.subtitles, (v) => ((s.subtitles = v), apply())),
        segRow(t('ui.settings.subtitle_size'), ['100', '125', '150', '200'], String(s.subtitleSize), (v) => ((s.subtitleSize = Number(v) as Settings['subtitleSize']), apply()), (v) => `${v}%`),
        toggleRow(t('ui.settings.subtitle_bg'), '', s.subtitleBackground, (v) => ((s.subtitleBackground = v), apply())),
        toggleRow(t('ui.settings.captions'), t('ui.settings.captions_d'), s.soundCaptions, (v) => ((s.soundCaptions = v), apply())),
        segRow(t('ui.settings.ui_scale'), ['100', '125', '150', '200'], String(s.uiScale), (v) => ((s.uiScale = Number(v) as Settings['uiScale']), apply()), (v) => `${v}%`),
        toggleRow(t('ui.settings.highlight'), t('ui.settings.highlight_d'), s.highlight, (v) => ((s.highlight = v), apply())),
        toggleRow(t('ui.settings.pin_objective'), '', s.pinObjective, (v) => ((s.pinObjective = v), apply())),
        toggleRow(t('ui.settings.camera_shake'), '', s.cameraShake, (v) => ((s.cameraShake = v), apply())),
        toggleRow(t('ui.settings.reduced_flash'), t('ui.settings.reduced_flash_d'), s.reducedFlash, (v) => ((s.reducedFlash = v), apply())),
        toggleRow(t('ui.settings.reduced_motion'), t('ui.settings.reduced_motion_d'), s.reducedMotion, (v) => ((s.reducedMotion = v), apply())),
        toggleRow(t('ui.settings.low_tension'), t('ui.settings.low_tension_d'), s.lowTension, (v) => ((s.lowTension = v), apply())),
        toggleRow(t('ui.settings.allow_skip'), t('ui.settings.allow_skip_d'), s.allowSkip, (v) => ((s.allowSkip = v), apply())),
        toggleRow(t('ui.settings.hold_skip'), t('ui.settings.hold_skip_d'), s.holdToSkip, (v) => ((s.holdToSkip = v), apply())),
        toggleRow(t('ui.settings.slow_lantern'), t('ui.settings.slow_lantern_d'), s.slowLantern, (v) => ((s.slowLantern = v), apply())),
      );
    } else {
      body.append(
        segRow(t('ui.settings.language'), ['bn', 'en'], s.language, (v) => {
          s.language = v as Settings['language'];
          apply();
          renderTabs();
          renderBody();
          heading.textContent = t('ui.settings.title');
          closeBtn.textContent = t('ui.close');
        }, (v) => (v === 'bn' ? 'বাংলা' : 'English')),
        segRow(t('ui.settings.subtitle_language'), ['bn', 'en'], s.subtitleLanguage, (v) => ((s.subtitleLanguage = v as Settings['language']), apply()), (v) => (v === 'bn' ? 'বাংলা' : 'English')),
        h('p', { class: 'muted' }, t('ui.settings.voice_note')),
      );
    }
  };

  const close = () => {
    window.removeEventListener('keydown', onKey, true);
    ui.remove(layer);
    d.onClose();
  };
  const heading = h('h2', {}, t('ui.settings.title'));
  const closeBtn = h('button', { class: 'btn inline primary', onclick: close }, t('ui.close'));
  const el = h('div', { class: 'layer dim' }, h('div', { class: 'panel settings', role: 'dialog', 'aria-modal': 'true' }, heading, tabBar, body, h('div', { class: 'actions' }, closeBtn)));
  renderTabs();
  renderBody();
  const layer = ui.push({
    el,
    onBack: () => (listening ? undefined : close()),
    onAction: (a) => {
      if (listening) return true;
      if (a === 'pause') {
        close();
        return true;
      }
      return false;
    },
  });
  return layer;
}

// --------------------------------------------------------------------------- pause

export interface PauseOptions {
  onResume(): void;
  onJournal(): void;
  onSettings(): void;
  onCheckpoint(): void;
  onExport(): void;
  onImport(): void;
  onQuit(): void;
  playTime: string;
  sceneName: string;
}

export function pauseMenu(ui: UI, o: PauseOptions): Layer {
  const t = ui.deps.t;
  const resume = h('button', { class: 'btn primary', onclick: o.onResume, 'data-test': 'resume' }, t('ui.pause.resume'));
  const el = h(
    'div',
    { class: 'layer dim', 'data-test': 'pause' },
    h(
      'div',
      { class: 'panel', style: 'min-width:22rem', role: 'dialog', 'aria-modal': 'true' },
      h('h2', {}, t('ui.pause.title')),
      h('p', { class: 'muted' }, `${o.sceneName} · ${o.playTime}`),
      resume,
      h('button', { class: 'btn', onclick: o.onJournal }, t('ui.pause.journal')),
      h('button', { class: 'btn', onclick: o.onSettings }, t('ui.title.settings')),
      h('button', { class: 'btn', onclick: o.onCheckpoint }, t('ui.pause.checkpoint')),
      h('button', { class: 'btn', onclick: o.onExport }, t('ui.save.export')),
      h('button', { class: 'btn', onclick: o.onImport }, t('ui.save.import')),
      h('button', { class: 'btn', onclick: o.onQuit }, t('ui.pause.quit')),
    ),
  );
  return ui.push({
    el,
    initialFocus: resume,
    onBack: o.onResume,
    onAction: (a) => {
      if (a === 'pause') {
        o.onResume();
        return true;
      }
      return false;
    },
  });
}

// --------------------------------------------------------------------------- journal

export interface JournalData {
  sceneName: string;
  objective: string | null;
  clues: { id: string; title: string; body: string; kind: string; isNew: boolean; scene: string; time: string; optional: boolean }[];
  people: { name: string; body: string }[];
  items: { name: string; desc: string }[];
  map: { visited: string[]; current: string; channelRevealed: boolean; ferryFound: boolean };
}

export function journalScreen(ui: UI, data: JournalData, onClose: () => void, markSeen: (id: string) => void): Layer {
  const t = ui.deps.t;
  const tabs = ['objective', 'evidence', 'people', 'items', 'map'] as const;
  let tab: (typeof tabs)[number] = data.clues.some((c) => c.isNew) ? 'evidence' : 'objective';
  const tabBar = h('div', { class: 'tabs', role: 'tablist' });
  const body = h('div', { class: 'body' });
  const renderTabs = () => {
    clear(tabBar);
    for (const k of tabs) {
      const n = k === 'evidence' ? data.clues.filter((c) => c.isNew).length : 0;
      tabBar.append(
        h(
          'button',
          { class: `tab ${k === tab ? 'active' : ''}`, role: 'tab', onclick: () => ((tab = k), renderTabs(), render()) },
          t(`ui.journal.${k}`),
          n ? h('span', { class: 'badge', style: 'margin-left:0.4rem' }, n) : null,
        ),
      );
    }
  };
  const listDetail = (entries: { key: string; label: HTMLElement | string; detail: () => HTMLElement }[]) => {
    const list = h('div', { class: 'list', role: 'listbox' });
    const detail = h('div', { class: 'detail', 'aria-live': 'polite' });
    entries.forEach((e, i) => {
      const b = h(
        'button',
        {
          class: 'btn entry',
          onfocus: () => show(),
          onclick: () => show(),
        },
        e.label,
      );
      const show = () => {
        clear(detail);
        detail.append(e.detail());
      };
      list.append(b);
      if (i === 0) show();
    });
    if (!entries.length) detail.append(h('p', { class: 'muted' }, t('ui.journal.empty')));
    body.append(list, detail);
  };
  const render = () => {
    clear(body);
    body.style.gridTemplateColumns = tab === 'objective' || tab === 'map' ? '1fr' : '';
    if (tab === 'objective') {
      body.append(h('div', { class: 'detail' }, h('p', { class: 'muted' }, data.sceneName), h('p', { style: 'font-size:1.2rem' }, data.objective ?? t('ui.journal.no_objective'))));
    } else if (tab === 'evidence') {
      listDetail(
        data.clues.map((c) => ({
          key: c.id,
          label: h('span', {}, c.title, c.isNew ? h('span', { class: 'new' }, t('ui.journal.new')) : null),
          detail: () => {
            if (c.isNew) {
              c.isNew = false;
              markSeen(c.id);
            }
            return h('div', {}, h('h3', { style: 'margin-top:0' }, c.title), h('p', { class: 'muted' }, `${t(`ui.clue.kind.${c.kind}`)} · ${c.scene} · ${c.time}${c.optional ? ' · ' + t('ui.journal.optional') : ''}`), h('p', {}, c.body));
          },
        })),
      );
    } else if (tab === 'people') {
      listDetail(data.people.map((p) => ({ key: p.name, label: p.name, detail: () => h('div', {}, h('h3', { style: 'margin-top:0' }, p.name), h('p', {}, p.body)) })));
    } else if (tab === 'items') {
      listDetail(data.items.map((p) => ({ key: p.name, label: p.name, detail: () => h('div', {}, h('h3', { style: 'margin-top:0' }, p.name), h('p', {}, p.desc)) })));
    } else {
      body.append(handMap(t, data.map));
    }
  };
  const close = () => {
    ui.remove(layer);
    onClose();
  };
  const el = h('div', { class: 'layer dim', 'data-test': 'journal' }, h('div', { class: 'panel journal', role: 'dialog', 'aria-modal': 'true' }, h('div', {}, h('h2', {}, t('ui.journal.title')), tabBar), body));
  renderTabs();
  render();
  const layer = ui.push({
    el,
    onBack: close,
    onAction: (a) => {
      if (a === 'journal' || a === 'pause') {
        close();
        return true;
      }
      return false;
    },
  });
  return layer;
}

/** Asha's hand-drawn map; reveals the blocked channel once the survey map is found. */
function handMap(t: T, m: JournalData['map']): HTMLElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 600 300');
  svg.setAttribute('class', 'map-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('ui.journal.map'));
  const add = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text) e.textContent = text;
    svg.append(e);
    return e;
  };
  add('path', { d: 'M0,80 C120,60 200,120 320,90 S520,40 600,70', stroke: '#5a7d8c', 'stroke-width': 38, fill: 'none', opacity: 0.55 });
  add('text', { x: 20, y: 40, fill: '#3d5a66', 'font-size': 16, 'font-style': 'italic' }, t('ui.map.river'));
  const places: [string, number, number][] = [
    ['L01', 90, 120],
    ['L02', 180, 200],
    ['L03', 300, 160],
    ['L04', 420, 200],
    ['L05', 520, 140],
  ];
  add('path', { d: 'M90,120 L180,200 L300,160', stroke: '#6b4a2a', 'stroke-width': 3, fill: 'none', 'stroke-dasharray': '2 6' });
  if (m.visited.includes('L03')) add('path', { d: 'M300,160 L420,200 L520,140', stroke: '#6b4a2a', 'stroke-width': 3, fill: 'none', 'stroke-dasharray': '2 6' });
  if (m.channelRevealed) {
    add('path', { d: 'M330,95 C360,150 400,170 520,140', stroke: '#a3271d', 'stroke-width': 4, fill: 'none', 'stroke-dasharray': '10 6' });
    add('text', { x: 380, y: 128, fill: '#a3271d', 'font-size': 14 }, t('ui.map.kanakhal'));
  }
  for (const [id, x, y] of places) {
    const known = m.visited.includes(id) || (id === 'L05' && m.ferryFound);
    add('circle', { cx: x, cy: y, r: id === m.current ? 9 : 6, fill: known ? '#2b241a' : 'none', stroke: '#2b241a', 'stroke-width': 2 });
    add('text', { x: x - 30, y: y + 26, fill: '#2b241a', 'font-size': 14 }, known ? t(`scene.${id}.name`) : '?');
  }
  return h('div', { class: 'detail' }, svg as unknown as HTMLElement);
}

// --------------------------------------------------------------------------- document reader

export function documentReader(ui: UI, title: string, body: string, style: string): Promise<void> {
  const t = ui.deps.t;
  return new Promise((resolve) => {
    const close = () => {
      ui.remove(layer);
      resolve();
    };
    const btn = h('button', { class: 'btn inline', style: 'color:inherit;border-color:currentColor;opacity:0.8', onclick: close, 'data-test': 'doc-close' }, t('ui.close'));
    const el = h('div', { class: 'layer dim', 'data-test': 'document' }, h('article', { class: `doc ${style}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h3', {}, title), h('div', {}, body), h('div', { class: 'close-hint' }, btn)));
    const layer = ui.push({ el, onBack: close, initialFocus: btn });
  });
}

// --------------------------------------------------------------------------- choice

export function choiceScreen(ui: UI, prompt: string, options: { id: string; label: string; detail: string }[]): Promise<string> {
  return new Promise((resolve) => {
    const buttons = options.map((o) =>
      h(
        'button',
        {
          class: 'btn',
          'data-test': `choice-${o.id}`,
          onclick: () => {
            ui.remove(layer);
            resolve(o.id);
          },
        },
        h('strong', {}, o.label),
        h('small', {}, o.detail),
      ),
    );
    const el = h('div', { class: 'layer dim', 'data-test': 'choice' }, h('div', { class: 'panel choice', role: 'dialog', 'aria-modal': 'true' }, h('p', { style: 'font-size:1.15rem' }, prompt), h('div', { class: 'options' }, buttons)));
    const layer = ui.push({ el, initialFocus: buttons[0] });
  });
}

// --------------------------------------------------------------------------- chapter / text cards

export function card(ui: UI, text: string, seconds: number, reducedMotion: boolean): Promise<void> {
  const el = h('div', { class: `card ${text.length > 60 ? 'long' : ''}`, role: 'status', 'aria-live': 'polite' }, h('div', { class: 'inner' }, text));
  const layer = ui.push({ el, modal: false });
  return new Promise((resolve) => {
    setTimeout(
      () => {
        el.style.transition = 'opacity 0.8s';
        el.style.opacity = '0';
        setTimeout(() => {
          ui.remove(layer);
          resolve();
        }, reducedMotion ? 300 : 800);
      },
      seconds * 1000,
    );
  });
}

// --------------------------------------------------------------------------- credits

export interface CreditsData {
  sections: { title: string; lines: string[] }[];
  epilogue: string;
}

export function creditsRoll(ui: UI, data: CreditsData, opts: { reducedMotion: boolean }): Promise<void> {
  const t = ui.deps.t;
  return new Promise((resolve) => {
    const roll = h('div', { class: 'roll' });
    roll.append(h('div', { style: 'height:100vh' }), h('h1', { lang: 'bn', style: 'font-size:3rem;margin:0' }, 'শেষ খেয়া'), h('div', { class: 'muted' }, 'ALEYA · THE LAST FERRY'));
    if (data.epilogue) roll.append(h('p', { style: 'margin-top:2rem;font-style:italic' }, data.epilogue));
    for (const s of data.sections) roll.append(h('h3', {}, s.title), h('div', {}, s.lines.join('\n')));
    roll.append(h('div', { style: 'height:100vh' }));
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      ui.remove(layer);
      resolve();
    };
    const skip = h('button', { class: 'btn inline', style: 'position:fixed;right:1.5rem;bottom:1.5rem', onclick: finish, 'data-test': 'credits-skip' }, t('ui.credits.skip'));
    const el = h('div', { class: 'layer solid', 'data-test': 'credits' }, h('div', { class: 'credits' }, roll), skip);
    const layer = ui.push({ el, onBack: finish, initialFocus: skip });
    let y = 0;
    let last = performance.now();
    let raf = 0;
    const speed = opts.reducedMotion ? 28 : 42;
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      y += speed * dt;
      roll.style.transform = `translateY(${-y}px)`;
      if (y > roll.scrollHeight - 50) finish();
      else raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });
}

export function licensesScreen(ui: UI, rows: { asset: string; source: string; license: string; credit: string }[], notices: { name: string; license: string; url: string }[], onClose: () => void): Layer {
  const t = ui.deps.t;
  const close = () => {
    ui.remove(layer);
    onClose();
  };
  const closeBtn = h('button', { class: 'btn inline primary', onclick: close }, t('ui.close'));
  const el = h(
    'div',
    { class: 'layer dim' },
    h(
      'div',
      { class: 'panel licenses', role: 'dialog', 'aria-modal': 'true', style: 'width:min(94vw,60rem)' },
      h('h2', {}, t('ui.licenses.title')),
      h('p', { class: 'muted' }, t('ui.licenses.intro')),
      h('h3', {}, t('ui.licenses.software')),
      h('table', {}, h('tr', {}, h('th', {}, t('ui.licenses.component')), h('th', {}, t('ui.licenses.license'))), notices.map((n) => h('tr', {}, h('td', {}, n.name), h('td', {}, n.license)))),
      h('p', {}, h('a', { href: './licenses/THIRD_PARTY_NOTICES.txt', target: '_blank', rel: 'noopener', style: 'color:var(--accent)' }, t('ui.licenses.full'))),
      h('h3', {}, t('ui.licenses.assets')),
      h('table', {}, h('tr', {}, h('th', {}, t('ui.licenses.asset')), h('th', {}, t('ui.licenses.source')), h('th', {}, t('ui.licenses.license'))), rows.map((r) => h('tr', {}, h('td', {}, r.asset), h('td', {}, r.source), h('td', {}, r.license)))),
      h('div', { class: 'actions' }, closeBtn),
    ),
  );
  const layer = ui.push({ el, onBack: close, initialFocus: closeBtn });
  return layer;
}

// --------------------------------------------------------------------------- fail / errors

export function failOverlay(ui: UI, text: string, seconds: number): Promise<void> {
  const el = h('div', { class: 'layer fail', style: 'background:rgba(0,0,0,0.85)', role: 'alert', 'data-test': 'fail' }, h('div', { class: 'panel', style: 'background:none;border:none;box-shadow:none' }, h('h2', {}, text)));
  const layer = ui.push({ el, modal: false });
  return new Promise((r) =>
    setTimeout(() => {
      ui.remove(layer);
      r();
    }, seconds * 1000),
  );
}

export function errorScreen(ui: UI, title: string, body: string, actions: { label: string; onClick: () => void }[]): Layer {
  const buttons = actions.map((a) => h('button', { class: 'btn inline', onclick: a.onClick }, a.label));
  const el = h('div', { class: 'layer dim', role: 'alertdialog', 'data-test': 'error' }, h('div', { class: 'panel', style: 'max-width:34rem' }, h('h2', {}, title), h('p', {}, body), h('div', { class: 'actions' }, buttons)));
  return ui.push({ el, initialFocus: buttons[0] });
}
