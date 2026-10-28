import type { PlatformAdapter } from './platform';

export class WebPlatform implements PlatformAdapter {
  readonly id = 'web' as const;

  async requestFullscreen(): Promise<void> {
    await document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  async exitFullscreen(): Promise<void> {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
  }

  isFullscreen(): boolean {
    return !!document.fullscreenElement;
  }

  safeArea() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => parseFloat(cs.getPropertyValue(n)) || 0;
    return { top: v('--sat'), right: v('--sar'), bottom: v('--sab'), left: v('--sal') };
  }

  haptic(kind: 'light' | 'heavy'): void {
    navigator.vibrate?.(kind === 'light' ? 10 : 35);
    for (const pad of navigator.getGamepads?.() ?? []) {
      const act = (pad as unknown as { vibrationActuator?: { playEffect(t: string, o: object): Promise<void> } })?.vibrationActuator;
      act?.playEffect('dual-rumble', { duration: kind === 'light' ? 60 : 220, strongMagnitude: kind === 'light' ? 0.2 : 0.7, weakMagnitude: 0.4 }).catch(() => undefined);
    }
  }

  onSuspend(cb: () => void): void {
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && cb());
    window.addEventListener('pagehide', cb);
  }

  onResume(cb: () => void): void {
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && cb());
  }

  onBack(cb: () => void): void {
    // browsers have no hardware back during play; mobile hosts wire this to the OS back button
    void cb;
  }

  async saveFile(name: string, text: string): Promise<void> {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  openFile(accept: string): Promise<string | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.onchange = async () => {
        const f = input.files?.[0];
        resolve(f ? await f.text() : null);
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  async requestPersistentStorage(): Promise<boolean> {
    return (await navigator.storage?.persist?.().catch(() => false)) ?? false;
  }

  async storageEstimate() {
    const e = await navigator.storage?.estimate?.().catch(() => null);
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  }

  online(): boolean {
    return navigator.onLine;
  }

  onNetworkChange(cb: (online: boolean) => void): void {
    window.addEventListener('online', () => cb(true));
    window.addEventListener('offline', () => cb(false));
  }

  suggestQuality(): 'low' | 'medium' | 'high' {
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
    const cores = navigator.hardwareConcurrency ?? 4;
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (mobile || mem <= 4 || cores <= 4) return 'low';
    if (mem <= 8 && cores <= 8) return 'medium';
    return 'high';
  }
}
