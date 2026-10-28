import type { InputActions } from '@aleya/game-core';

/** Feeds DOM keyboard and the Gamepad API into the device-independent InputActions. */
export class DeviceInput {
  private padIndex: number | null = null;
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (this.captureGameKeys() && GAME_KEYS.has(e.code)) e.preventDefault();
    this.input.feedKey(e.code, true);
  };
  private onKeyUp = (e: KeyboardEvent) => this.input.feedKey(e.code, false);
  private onBlur = () => this.input.releaseAll();

  constructor(
    private input: InputActions,
    private captureGameKeys: () => boolean,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('gamepadconnected', (e) => (this.padIndex = (e as GamepadEvent).gamepad.index));
    window.addEventListener('gamepaddisconnected', () => (this.padIndex = null));
  }

  /** Poll the gamepad once per frame. */
  poll(): void {
    const pads = navigator.getGamepads?.() ?? [];
    let pad = this.padIndex !== null ? pads[this.padIndex] : null;
    if (!pad) pad = [...pads].find((p) => p && p.connected) ?? null;
    this.input.feedGamepad(pad ? { axes: pad.axes, buttons: pad.buttons } : null);
  }

  get gamepadConnected(): boolean {
    return !!(navigator.getGamepads?.() ?? []).some((p) => p?.connected);
  }
}

const GAME_KEYS = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft']);

/**
 * Touch controls (feature flag TouchControlsV2, dormant until tested on devices):
 * virtual stick on the left half, context buttons on the right.
 */
export class TouchControls {
  readonly el: HTMLElement;
  constructor(input: InputActions) {
    this.el = document.createElement('div');
    this.el.className = 'touch-controls';
    this.el.style.pointerEvents = 'auto';
    const stick = { id: -1, x: 0, y: 0 };
    this.el.addEventListener('pointerdown', (e) => {
      if (e.clientX < window.innerWidth / 2) {
        stick.id = e.pointerId;
        stick.x = e.clientX;
        stick.y = e.clientY;
      } else input.feedVirtual('interact', 1);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stick.id) return;
      input.feedVirtual('moveX', Math.max(-1, Math.min(1, (e.clientX - stick.x) / 60)));
      input.feedVirtual('moveZ', Math.max(-1, Math.min(1, (e.clientY - stick.y) / 60)));
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === stick.id) {
        stick.id = -1;
        input.feedVirtual('moveX', 0);
        input.feedVirtual('moveZ', 0);
      } else input.feedVirtual('interact', 0);
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
  }
}
