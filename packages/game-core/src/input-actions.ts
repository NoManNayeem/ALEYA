/**
 * Semantic input layer, independent of PlayCanvas and DOM devices. Device adapters
 * feed raw keyboard codes, gamepad snapshots or virtual (touch) actions; gameplay
 * and UI only read semantic actions.
 */

export type ButtonAction =
  | 'interact'
  | 'run'
  | 'crouch'
  | 'lantern'
  | 'journal'
  | 'pause'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'confirm'
  | 'back'
  | 'hint'
  | 'skip';

export type AxisAction = 'moveX' | 'moveZ' | 'aimX' | 'aimY';

export const REMAPPABLE: ButtonAction[] = ['up', 'down', 'left', 'right', 'interact', 'run', 'crouch', 'lantern', 'journal', 'pause', 'hint'];

export type KeyBindings = Record<ButtonAction, string[]>;

export const DEFAULT_BINDINGS: KeyBindings = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  interact: ['KeyE', 'Enter'],
  run: ['ShiftLeft', 'ShiftRight'],
  crouch: ['ControlLeft', 'KeyC'],
  lantern: ['KeyF'],
  journal: ['Tab', 'KeyJ'],
  pause: ['Escape'],
  confirm: ['Enter', 'Space', 'KeyE'],
  back: ['Escape', 'Backspace'],
  hint: ['KeyH'],
  skip: ['Space'],
};

/** Standard gamepad mapping (W3C): 0 south, 1 east, 2 west, 3 north, 4 LB, 5 RB, 6 LT, 7 RT, 8 view, 9 menu, 12-15 d-pad */
export const GAMEPAD_BUTTONS: Record<ButtonAction, number[]> = {
  interact: [0],
  confirm: [0],
  back: [1],
  crouch: [1],
  run: [7],
  lantern: [5],
  journal: [8],
  pause: [9],
  up: [12],
  down: [13],
  left: [14],
  right: [15],
  hint: [3],
  skip: [0],
};

export interface GamepadSnapshot {
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

export type InputDevice = 'keyboard' | 'pointer' | 'gamepad' | 'touch';

export class InputActions {
  bindings: KeyBindings;
  deadZone = 0.2;
  toggleRun = false;
  private keys = new Set<string>();
  /** key-downs latched until the next update, so sub-frame taps are never lost */
  private tapped = new Set<string>();
  private pad: GamepadSnapshot | null = null;
  private virtual = new Map<string, number>();
  private now = new Map<ButtonAction, boolean>();
  private prev = new Map<ButtonAction, boolean>();
  private runToggled = false;
  private heldSince = new Map<ButtonAction, number>();
  private time = 0;
  lastDevice: InputDevice = 'keyboard';

  constructor(bindings: Partial<KeyBindings> = {}) {
    this.bindings = { ...DEFAULT_BINDINGS, ...structuredClone(bindings) };
  }

  feedKey(code: string, down: boolean): void {
    if (down) {
      this.keys.add(code);
      this.tapped.add(code);
    } else this.keys.delete(code);
    this.lastDevice = 'keyboard';
  }

  feedGamepad(pad: GamepadSnapshot | null): void {
    this.pad = pad;
    if (pad && (pad.buttons.some((b) => b.pressed) || pad.axes.some((a) => Math.abs(a) > 0.5))) this.lastDevice = 'gamepad';
  }

  /** Touch/virtual controls: buttons use 0/1, axes use -1..1. */
  feedVirtual(action: ButtonAction | AxisAction, value: number): void {
    this.virtual.set(action, value);
    this.lastDevice = 'touch';
  }

  releaseAll(): void {
    this.keys.clear();
    this.tapped.clear();
    this.virtual.clear();
    this.now.clear();
  }

  private rawButton(a: ButtonAction): boolean {
    if (this.bindings[a]?.some((c) => this.keys.has(c) || this.tapped.has(c))) return true;
    if (this.pad) {
      for (const i of GAMEPAD_BUTTONS[a] ?? []) if (this.pad.buttons[i]?.pressed) return true;
      const ax = this.pad.axes;
      const dz = Math.max(this.deadZone, 0.5);
      if (a === 'up' && (ax[1] ?? 0) < -dz) return true;
      if (a === 'down' && (ax[1] ?? 0) > dz) return true;
      if (a === 'left' && (ax[0] ?? 0) < -dz) return true;
      if (a === 'right' && (ax[0] ?? 0) > dz) return true;
    }
    return (this.virtual.get(a) ?? 0) > 0.5;
  }

  /** Call once per frame before reading actions. */
  update(dt: number): void {
    this.time += dt;
    this.prev = new Map(this.now);
    const all = Object.keys(DEFAULT_BINDINGS) as ButtonAction[];
    for (const a of all) {
      const v = this.rawButton(a);
      this.now.set(a, v);
      if (v && !this.prev.get(a)) this.heldSince.set(a, this.time);
      if (!v) this.heldSince.delete(a);
    }
    if (this.toggleRun && this.pressed('run')) this.runToggled = !this.runToggled;
    this.tapped.clear();
  }

  held(a: ButtonAction): boolean {
    if (a === 'run' && this.toggleRun) return this.runToggled;
    return !!this.now.get(a);
  }

  pressed(a: ButtonAction): boolean {
    return !!this.now.get(a) && !this.prev.get(a);
  }

  released(a: ButtonAction): boolean {
    return !this.now.get(a) && !!this.prev.get(a);
  }

  heldFor(a: ButtonAction): number {
    const s = this.heldSince.get(a);
    return s === undefined ? 0 : this.time - s;
  }

  axis(a: AxisAction): number {
    let v = 0;
    if (a === 'moveX') v = (this.keyHeld('right') ? 1 : 0) - (this.keyHeld('left') ? 1 : 0);
    if (a === 'moveZ') v = (this.keyHeld('down') ? 1 : 0) - (this.keyHeld('up') ? 1 : 0);
    if (this.pad) {
      const idx = { moveX: 0, moveZ: 1, aimX: 2, aimY: 3 }[a];
      const raw = this.pad.axes[idx] ?? 0;
      const p = Math.abs(raw) < this.deadZone ? 0 : (raw - Math.sign(raw) * this.deadZone) / (1 - this.deadZone);
      if (Math.abs(p) > Math.abs(v)) v = p;
      if (a === 'moveX') v = v || (this.pad.buttons[15]?.pressed ? 1 : 0) - (this.pad.buttons[14]?.pressed ? 1 : 0);
      if (a === 'moveZ') v = v || (this.pad.buttons[13]?.pressed ? 1 : 0) - (this.pad.buttons[12]?.pressed ? 1 : 0);
    }
    const vt = this.virtual.get(a);
    if (vt !== undefined && Math.abs(vt) > Math.abs(v)) v = vt;
    return Math.max(-1, Math.min(1, v));
  }

  private keyHeld(a: ButtonAction): boolean {
    return this.bindings[a]?.some((c) => this.keys.has(c)) || (this.virtual.get(a) ?? 0) > 0.5;
  }

  rebind(action: ButtonAction, slot: number, code: string): void {
    // remove the code from any other remappable action to avoid silent conflicts
    for (const a of REMAPPABLE) {
      if (a !== action) this.bindings[a] = this.bindings[a].filter((c) => c !== code);
    }
    const list = this.bindings[action].slice();
    list[slot] = code;
    this.bindings[action] = list.filter(Boolean);
  }

  conflicts(): string[] {
    const seen = new Map<string, ButtonAction>();
    const out: string[] = [];
    for (const a of REMAPPABLE) {
      for (const c of this.bindings[a]) {
        if (seen.has(c)) out.push(`${c}:${seen.get(c)}/${a}`);
        seen.set(c, a);
      }
    }
    return out;
  }
}

/** Human-readable label for a KeyboardEvent.code. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    ShiftLeft: 'L-Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl',
    ControlRight: 'R-Ctrl',
    Escape: 'Esc',
    Space: 'Space',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: '⌫',
  };
  return map[code] ?? code;
}
