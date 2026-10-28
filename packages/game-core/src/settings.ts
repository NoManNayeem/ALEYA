import { DEFAULT_BINDINGS, type KeyBindings } from './input-actions';

export const SETTINGS_VERSION = 1;

export type Locale = 'bn' | 'en';
export type QualityProfile = 'ultra' | 'high' | 'medium' | 'low';
export type Bus = 'master' | 'music' | 'ambience' | 'foley' | 'sfx' | 'dialogue' | 'ui';

export interface Settings {
  settingsVersion: number;
  language: Locale;
  subtitleLanguage: Locale;
  subtitles: boolean;
  subtitleSize: 100 | 125 | 150 | 200;
  subtitleBackground: boolean;
  soundCaptions: boolean;
  uiScale: 100 | 125 | 150 | 200;
  quality: QualityProfile;
  dynamicResolution: boolean;
  fpsCap: 0 | 30 | 60;
  brightness: number;
  volumes: Record<Bus, number>;
  mute: boolean;
  dialogueBoost: boolean;
  dynamicRange: 'night' | 'standard' | 'headphones';
  highlight: boolean;
  pinObjective: boolean;
  cameraShake: boolean;
  reducedFlash: boolean;
  reducedMotion: boolean;
  lowTension: boolean;
  allowSkip: boolean;
  holdToSkip: boolean;
  toggleRun: boolean;
  slowLantern: boolean;
  deadZone: number;
  bindings: KeyBindings;
  firstRunDone: boolean;
}

export function defaultSettings(): Settings {
  const lang = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('bn') ? 'bn' : 'en';
  return {
    settingsVersion: SETTINGS_VERSION,
    language: lang,
    subtitleLanguage: lang,
    subtitles: true,
    subtitleSize: 100,
    subtitleBackground: true,
    soundCaptions: true,
    uiScale: 100,
    quality: 'high',
    dynamicResolution: true,
    fpsCap: 0,
    brightness: 1,
    volumes: { master: 0.9, music: 0.7, ambience: 0.8, foley: 0.8, sfx: 0.85, dialogue: 1, ui: 0.6 },
    mute: false,
    dialogueBoost: false,
    dynamicRange: 'standard',
    highlight: true,
    pinObjective: false,
    cameraShake: true,
    reducedFlash: false,
    reducedMotion: false,
    lowTension: false,
    allowSkip: true,
    holdToSkip: true,
    toggleRun: false,
    slowLantern: false,
    deadZone: 0.2,
    bindings: structuredClone(DEFAULT_BINDINGS),
    firstRunDone: false,
  };
}

/** Merge unknown/older settings over defaults so new fields always exist. */
export function migrateSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<Settings>;
  return {
    ...d,
    ...r,
    volumes: { ...d.volumes, ...(r.volumes ?? {}) },
    bindings: { ...d.bindings, ...(r.bindings ?? {}) },
    settingsVersion: SETTINGS_VERSION,
  };
}

export interface SettingsStorage {
  load(): unknown;
  save(s: Settings): void;
}

export class LocalSettingsStorage implements SettingsStorage {
  constructor(private key = 'aleya.settings') {}
  load(): unknown {
    try {
      const v = localStorage.getItem(this.key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  }
  save(s: Settings): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(s));
    } catch {
      /* settings are non-critical; failure is surfaced by save system diagnostics */
    }
  }
}
