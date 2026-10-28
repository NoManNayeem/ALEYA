import { clear, h } from './dom';
import type { UIDeps } from './ui';

export interface SubtitleLine {
  speaker: string;
  speakerLabel: string;
  text: string;
  channel: string;
  caption: boolean;
}

/** In-game HUD: objective, interaction prompt, subtitles, toasts, tips, save and skip indicators, fades. */
export class Hud {
  readonly el: HTMLElement;
  private objective: HTMLElement;
  private prompt: HTMLElement;
  private subs: HTMLElement;
  private toasts: HTMLElement;
  private tipEl: HTMLElement;
  private save: HTMLElement;
  private skip: HTMLElement;
  private vignette: HTMLElement;
  private threatLabel: HTMLElement;
  private flashEl: HTMLElement;
  readonly fadeEl: HTMLElement;
  private objTimer = 0;
  pinObjective = false;
  onPromptClick: (() => void) | null = null;
  private tipTimer = 0;
  private lastObjective = '';

  constructor(root: HTMLElement, private deps: UIDeps) {
    this.objective = h('div', { class: 'objective faded', role: 'status', 'aria-live': 'polite' });
    this.prompt = h('div', { class: 'prompt hidden', role: 'button', onclick: () => this.onPromptClick?.() });
    this.subs = h('div', { class: 'subtitles bg', 'aria-live': 'polite' });
    this.toasts = h('div', { class: 'toast', 'aria-live': 'polite' });
    this.tipEl = h('div', { class: 'tip hidden', role: 'note' });
    this.save = h('div', { class: 'save-indicator' }, h('div', { class: 'spin' }), h('span', {}, ''));
    this.skip = h('div', { class: 'skip-hint hidden' }, h('div', { class: 'skip-ring' }), h('span', {}, ''));
    this.vignette = h('div', { class: 'threat-vignette' });
    this.threatLabel = h('div', { class: 'threat-label hidden', role: 'alert' });
    this.flashEl = h('div', { class: 'flash' });
    this.el = h('div', { class: 'hud hidden' }, this.vignette, this.flashEl, this.objective, this.threatLabel, this.prompt, this.subs, this.toasts, this.tipEl, this.save, this.skip);
    this.fadeEl = h('div', { class: 'fade' });
    root.append(this.el, this.fadeEl);
  }

  show(on: boolean): void {
    this.el.classList.toggle('hidden', !on);
  }

  setObjective(sceneName: string, text: string | null, force = false): void {
    const key = `${sceneName}|${text}`;
    if (key === this.lastObjective && !force) return;
    this.lastObjective = key;
    clear(this.objective);
    if (!text) {
      this.objective.classList.add('faded');
      return;
    }
    this.objective.append(h('span', { class: 'scene' }, sceneName), text);
    this.objective.classList.remove('faded');
    this.objTimer = 6;
  }

  /** Re-show the objective briefly (journal close, pause close). */
  pulseObjective(): void {
    if (this.lastObjective && !this.lastObjective.endsWith('|null')) {
      this.objective.classList.remove('faded');
      this.objTimer = 4;
    }
  }

  setPrompt(key: string | null, verb = '', object = ''): void {
    if (!key) {
      this.prompt.classList.add('hidden');
      return;
    }
    clear(this.prompt);
    const bn = this.deps.locale() === 'bn';
    this.prompt.append(h('span', { class: 'keycap' }, key), bn ? `${object} ${verb}` : `${verb} ${object}`);
    this.prompt.classList.remove('hidden');
  }

  showSubtitle(line: SubtitleLine | null, opts: { background: boolean; size: number; labels: boolean }): void {
    clear(this.subs);
    this.subs.classList.toggle('bg', opts.background);
    document.documentElement.style.setProperty('--sub-scale', String(opts.size / 100));
    if (!line) return;
    const cls = line.caption ? 'caption' : line.channel === 'thought' ? 'thought' : '';
    const el = h('span', { class: `line ${cls}` });
    if (opts.labels && line.speakerLabel && !line.caption) el.append(h('span', { class: `speaker speaker-${line.speaker}` }, `${line.speakerLabel}:`));
    el.append(line.text);
    this.subs.append(el);
  }

  toast(text: string, seconds = 3.5): void {
    const d = h('div', {}, text);
    this.toasts.append(d);
    setTimeout(() => d.remove(), seconds * 1000);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
  }

  tip(text: string, seconds = 6): void {
    this.tipEl.textContent = text;
    this.tipEl.classList.remove('hidden');
    this.tipTimer = seconds;
  }

  saving(on: boolean, label = ''): void {
    this.save.classList.toggle('on', on);
    (this.save.lastElementChild as HTMLElement).textContent = label;
  }

  skipHint(text: string | null, progress = 0): void {
    this.skip.classList.toggle('hidden', !text);
    if (!text) return;
    (this.skip.lastElementChild as HTMLElement).textContent = text;
    (this.skip.firstElementChild as HTMLElement).style.setProperty('--p', String(Math.round(progress * 100)));
  }

  threat(level: number, label: string | null): void {
    this.vignette.style.opacity = String(Math.min(0.9, level));
    this.threatLabel.classList.toggle('hidden', !label);
    if (label) this.threatLabel.textContent = label;
  }

  flash(level: number): void {
    this.flashEl.style.opacity = String(Math.min(0.45, level * 0.35));
  }

  fade(to: 0 | 1, seconds: number): Promise<void> {
    this.fadeEl.style.transitionDuration = `${seconds}s`;
    // force style flush so the transition always runs
    void this.fadeEl.offsetWidth;
    this.fadeEl.style.opacity = String(to);
    return new Promise((r) => setTimeout(r, seconds * 1000));
  }

  update(dt: number): void {
    if (this.objTimer > 0 && !this.pinObjective) {
      this.objTimer -= dt;
      if (this.objTimer <= 0) this.objective.classList.add('faded');
    }
    if (this.pinObjective && this.lastObjective && !this.lastObjective.endsWith('|null')) this.objective.classList.remove('faded');
    if (this.tipTimer > 0) {
      this.tipTimer -= dt;
      if (this.tipTimer <= 0) this.tipEl.classList.add('hidden');
    }
  }
}
