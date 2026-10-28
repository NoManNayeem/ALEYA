/**
 * PlatformAdapter isolates host capabilities so the same game bundle can run in a
 * browser today and inside a Tauri 2 or Flutter WebView host later.
 */
export interface PlatformAdapter {
  readonly id: 'web' | 'tauri' | 'flutter-host';
  requestFullscreen(): Promise<void>;
  exitFullscreen(): Promise<void>;
  isFullscreen(): boolean;
  /** CSS safe-area insets in px (notches on mobile hosts) */
  safeArea(): { top: number; right: number; bottom: number; left: number };
  haptic(kind: 'light' | 'heavy'): void;
  onSuspend(cb: () => void): void;
  onResume(cb: () => void): void;
  onBack(cb: () => void): void;
  saveFile(name: string, text: string): Promise<void>;
  openFile(accept: string): Promise<string | null>;
  requestPersistentStorage(): Promise<boolean>;
  storageEstimate(): Promise<{ usage: number; quota: number } | null>;
  online(): boolean;
  onNetworkChange(cb: (online: boolean) => void): void;
  /** coarse hardware hint for the default quality preset */
  suggestQuality(): 'low' | 'medium' | 'high';
}
