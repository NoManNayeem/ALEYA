import { h } from './dom';
import { Hud } from './hud';

export type UIAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'journal' | 'pause' | 'hint';

export interface UIDeps {
  t(key: string, vars?: Record<string, string | number>): string;
  locale(): 'bn' | 'en';
  sfx(cue: string): void;
  /** label of the first key bound to an action, e.g. "E" */
  keyFor(action: string): string;
}

export interface Layer {
  el: HTMLElement;
  /** return true when the action was consumed */
  onAction?(a: UIAction): boolean;
  onBack?(): void;
  /** non-modal layers (e.g. chapter card) don't capture input */
  modal?: boolean;
  /** focus this element when the layer opens */
  initialFocus?: HTMLElement | null;
}

/**
 * Layer stack + spatial focus navigation shared by every screen. Pointer, keyboard
 * and gamepad all drive the same buttons; semantic actions arrive from InputActions.
 */
export class UI {
  readonly hud: Hud;
  private stack: Layer[] = [];

  constructor(readonly root: HTMLElement, readonly deps: UIDeps) {
    this.hud = new Hud(root, deps);
    // prevent the browser from also activating/scrolling on navigation keys when menus are open
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.hasModal) return;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Tab'].includes(e.key)) {
          const el = document.activeElement as HTMLElement | null;
          if (e.key === 'Tab') e.preventDefault();
          else if (el?.tagName === 'INPUT' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
          else e.preventDefault();
        }
      },
      true,
    );
  }

  get hasModal(): boolean {
    return this.stack.some((l) => l.modal !== false);
  }

  get top(): Layer | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) if (this.stack[i].modal !== false) return this.stack[i];
    return undefined;
  }

  push(layer: Layer): Layer {
    this.stack.push(layer);
    this.root.append(layer.el);
    if (layer.modal !== false) {
      const f = layer.initialFocus ?? this.focusables(layer.el)[0];
      requestAnimationFrame(() => f?.focus({ preventScroll: true }));
    }
    return layer;
  }

  remove(layer: Layer): void {
    const i = this.stack.indexOf(layer);
    if (i >= 0) this.stack.splice(i, 1);
    layer.el.remove();
    const t = this.top;
    if (t && !t.el.contains(document.activeElement)) this.focusables(t.el)[0]?.focus({ preventScroll: true });
  }

  pop(): void {
    const t = this.top;
    if (t) this.remove(t);
  }

  clear(): void {
    for (const l of this.stack.slice()) this.remove(l);
  }

  focusables(el: HTMLElement): HTMLElement[] {
    return [...el.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, [data-nav]')].filter((x) => x.offsetParent !== null || x === document.activeElement);
  }

  handleAction(a: UIAction): void {
    const layer = this.top;
    if (!layer) return;
    if (layer.onAction?.(a)) return;
    if (a === 'back') {
      if (layer.onBack) {
        this.deps.sfx('ui_back');
        layer.onBack();
      }
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const inLayer = active && layer.el.contains(active);
    if (a === 'confirm') {
      if (inLayer && active) {
        if (active instanceof HTMLInputElement && active.type === 'range') return;
        this.deps.sfx('ui_confirm');
        active.click();
      }
      return;
    }
    if (a === 'up' || a === 'down' || a === 'left' || a === 'right') {
      if (inLayer && active instanceof HTMLInputElement && active.type === 'range' && (a === 'left' || a === 'right')) {
        const step = Number(active.step || 0.05);
        active.value = String(Number(active.value) + (a === 'right' ? step : -step));
        active.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      this.moveFocus(layer.el, a, inLayer ? active! : null);
    }
  }

  private moveFocus(scope: HTMLElement, dir: 'up' | 'down' | 'left' | 'right', from: HTMLElement | null): void {
    const items = this.focusables(scope);
    if (!items.length) return;
    if (!from) {
      items[0].focus();
      return;
    }
    const r0 = from.getBoundingClientRect();
    const c0 = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 };
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of items) {
      if (el === from) continue;
      const r = el.getBoundingClientRect();
      const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const dx = c.x - c0.x;
      const dy = c.y - c0.y;
      const primary = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
      if (primary <= 2) continue;
      const secondary = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
      const score = primary + secondary * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (!best && (dir === 'down' || dir === 'up')) {
      const i = items.indexOf(from);
      best = items[(i + (dir === 'down' ? 1 : -1) + items.length) % items.length];
    }
    if (best) {
      this.deps.sfx('ui_move');
      best.focus({ preventScroll: false });
      best.scrollIntoView({ block: 'nearest' });
    }
  }

  /** Simple modal confirm dialog. */
  confirm(titleKey: string, bodyKey: string, yesKey = 'ui.yes', noKey = 'ui.no'): Promise<boolean> {
    const t = this.deps.t;
    return new Promise((resolve) => {
      const done = (v: boolean) => {
        this.remove(layer);
        resolve(v);
      };
      const yes = h('button', { class: 'btn inline primary', onclick: () => done(true) }, t(yesKey));
      const el = h(
        'div',
        { class: 'layer dim', role: 'dialog', 'aria-modal': 'true' },
        h('div', { class: 'panel' }, h('h2', {}, t(titleKey)), h('p', {}, t(bodyKey)), h('div', { class: 'actions' }, h('button', { class: 'btn inline', onclick: () => done(false) }, t(noKey)), yes)),
      );
      const layer = this.push({ el, onBack: () => done(false), initialFocus: yes });
    });
  }
}
