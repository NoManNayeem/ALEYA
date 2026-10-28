import type { DialogueLine, SceneManifest, Sequence } from '@aleya/content-schema';
import {
  type ButtonAction,
  createPuzzle,
  type DirectorHost,
  GameSession,
  IndexedDbBackend,
  InputActions,
  keyLabel,
  type LeafStep,
  LocalSettingsStorage,
  Localizer,
  migrateSettings,
  NarrativeDirector,
  PuzzleSession,
  type SaveGame,
  SaveError,
  SaveRepository,
  SETTINGS_VERSION,
  type Settings,
  SPEED,
  type StepContext,
} from '@aleya/game-core';
import { AudioEngine, type Channel, type Speaker } from '@aleya/audio';
import { CharacterLibrary, MaterialLibrary, QUALITY, SceneRenderer, Stage } from '@aleya/renderer-pc';
import ashaGlb from '../../../../assets/optimized/characters/asha.glb?url';
import karimGlb from '../../../../assets/optimized/characters/karim.glb?url';
import watcherGlb from '../../../../assets/optimized/characters/watcher.glb?url';
import {
  card,
  choiceScreen,
  creditsRoll,
  documentReader,
  errorScreen,
  failOverlay,
  journalScreen,
  type Layer,
  licensesScreen,
  loadingScreen,
  openPuzzle,
  pauseMenu,
  prePlay,
  settingsScreen,
  titleScreen,
  UI,
  type UIAction,
} from '@aleya/ui';
import { episodeTables, loadScene, sceneKey, stringTables } from '@content/episodes/ep01/index';
import type { PlatformAdapter } from '../platform/platform';
import { DeviceInput } from '../input/devices';
import { creditsData, licenseRows, softwareNotices } from './credits';
import { SceneWorld } from './world';

type AppState = 'boot' | 'menu' | 'loading' | 'play' | 'paused' | 'finished';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Application Coordinator: boot → menu → play ↔ pause → game-over/finish.
 * Owns the domain session, presentation (renderer, audio, UI) and persistence.
 */
export class Coordinator {
  state: AppState = 'boot';
  readonly settings: Settings;
  private settingsStore = new LocalSettingsStorage();
  readonly loc: Localizer;
  readonly input: InputActions;
  readonly ui: UI;
  private devices: DeviceInput;
  readonly tables = episodeTables();
  private lines = new Map<string, DialogueLine>();
  stage!: Stage;
  private mats!: MaterialLibrary;
  renderer!: SceneRenderer;
  audio!: AudioEngine;
  private saves = new SaveRepository(new IndexedDbBackend());
  session: GameSession | null = null;
  world: SceneWorld | null = null;
  director: NarrativeDirector | null = null;
  private lastCheckpoint: SaveGame | null = null;
  private manifest: SceneManifest | null = null;
  private stride = 0;
  private barrierCooldown = 0;
  private failing = false;
  private pauseLayer: Layer | null = null;
  private skipHold = 0;
  private repeat = new Map<ButtonAction, number>();
  private flagsDirty = true;
  private persistRequested = false;
  private visibleBefore = true;
  private forceSolve: (() => void) | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
    readonly platform: PlatformAdapter,
  ) {
    this.settings = migrateSettings(this.settingsStore.load());
    if (!this.settings.firstRunDone) this.settings.quality = platform.suggestQuality();
    this.loc = new Localizer(stringTables());
    this.input = new InputActions(this.settings.bindings);
    for (const l of this.tables.dialogue) this.lines.set(l.id, l);
    this.ui = new UI(uiRoot, {
      t: (k, v) => this.t(k, v),
      locale: () => this.settings.language,
      sfx: (c) => this.audio?.sfx(c),
      keyFor: (a) => this.keyFor(a),
    });
    this.devices = new DeviceInput(this.input, () => this.state === 'play' && !this.ui.hasModal);
    this.ui.hud.onPromptClick = () => this.tryInteract();
    this.applySettings(false);
  }

  // ------------------------------------------------------------------ helpers

  t(key: string, vars?: Record<string, string | number>, locale = this.settings.language): string {
    if (vars && locale === 'bn') {
      vars = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, typeof v === 'number' ? this.loc.num(v, 'bn') : v]));
    }
    return this.loc.t(key, vars, locale);
  }

  keyFor(action: string): string {
    if (this.input.lastDevice === 'gamepad') {
      return { interact: 'A', run: 'RT', crouch: 'B', lantern: 'RB', journal: 'View', pause: 'Menu', hint: 'Y', skip: 'A', left: '◀', right: '▶', up: '▲', down: '▼' }[action] ?? action;
    }
    const code = this.input.bindings[action as ButtonAction]?.[0];
    return code ? keyLabel(code) : '?';
  }

  private tipText(key: string): string {
    const vars: Record<string, string> = {};
    for (const a of ['left', 'right', 'up', 'down', 'run', 'lantern', 'crouch', 'interact']) vars[a] = this.keyFor(a);
    return this.loc.t(key, vars, this.settings.language);
  }

  private sceneName(): string {
    return this.manifest ? this.t(this.manifest.displayNameKey) : '';
  }

  applySettings(persist = true): void {
    const s = this.settings;
    this.loc.locale = s.language;
    document.documentElement.lang = s.language;
    document.documentElement.style.setProperty('--ui-scale', String(s.uiScale / 100));
    document.documentElement.classList.toggle('reduced-motion', s.reducedMotion);
    this.input.bindings = structuredClone(s.bindings);
    this.input.toggleRun = s.toggleRun;
    this.input.deadZone = s.deadZone;
    this.ui.hud.pinObjective = s.pinObjective;
    if (this.audio) {
      this.audio.setVolumes(s.volumes, s.mute, s.dialogueBoost);
      this.audio.setDynamicRange(s.dynamicRange);
    }
    if (this.stage) {
      if (this.stage.profile !== s.quality) this.stage.applyQuality(s.quality);
      this.stage.dynamicResolution = s.dynamicResolution;
      this.stage.fpsCap = s.fpsCap;
    }
    if (this.renderer) {
      this.renderer.director.shakeEnabled = s.cameraShake;
      this.renderer.director.reducedMotion = s.reducedMotion;
      this.renderer.setReducedFlash(s.reducedFlash);
      this.renderer.setBrightness(s.brightness);
    }
    this.world?.setLowTension(s.lowTension);
    this.flagsDirty = true;
    if (persist) this.settingsStore.save(s);
  }

  // ------------------------------------------------------------------ boot

  async boot(): Promise<void> {
    const loading = loadingScreen(this.ui, 'ALEYA · শেষ খেয়া');
    loading.set(0.1);
    if (!this.webgl2Supported()) {
      loading.close();
      errorScreen(this.ui, this.t('ui.error.webgl_title'), this.t('ui.error.webgl_body'), [{ label: this.t('ui.retry'), onClick: () => location.reload() }]);
      return;
    }
    try {
      this.stage = await Stage.create(this.canvas, {
        preferWebGPU: new URLSearchParams(location.search).has('webgpu'),
        events: { contextLost: () => this.onContextLost(), contextRestored: () => this.onContextRestored() },
      });
    } catch (e) {
      console.error(e);
      loading.close();
      errorScreen(this.ui, this.t('ui.error.webgl_title'), this.t('ui.error.webgl_body'), [{ label: this.t('ui.retry'), onClick: () => location.reload() }]);
      return;
    }
    loading.set(0.4);
    this.stage.applyQuality(this.settings.quality);
    this.mats = new MaterialLibrary(this.stage.app.graphicsDevice, QUALITY[this.settings.quality].tier);
    this.audio = new AudioEngine();
    this.renderer = new SceneRenderer(this.stage, this.mats, {
      t: (k) => this.t(k),
      test: (c) => this.session?.flags.test(c) ?? false,
      flag: (f) => this.session?.flags.has(f) ?? false,
    });
    this.renderer.onThunder = (d, s) => this.audio.thunder(d, s);
    loading.set(0.6);
    const characters = new CharacterLibrary(this.stage.app);
    await characters.load({ asha: ashaGlb, karim: karimGlb, watcher: watcherGlb });
    this.renderer.characters = characters;
    this.applySettings(false);
    await document.fonts?.ready;
    await Promise.all([document.fonts?.load("700 32px 'Noto Sans Bengali'"), document.fonts?.load("700 32px 'Noto Sans'")]).catch(() => undefined);
    loading.set(1);
    this.stage.app.on('update', (dt: number) => this.frame(dt));
    this.platform.onSuspend(() => this.onSuspend());
    this.platform.onResume(() => this.onResume());
    this.platform.onNetworkChange((on) => !on && this.ui.hud.toast(this.t('ui.offline')));
    const unlock = () => void this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    loading.close();
    await this.showTitle();
  }

  private webgl2Supported(): boolean {
    try {
      return !!document.createElement('canvas').getContext('webgl2');
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------ menu

  async showTitle(): Promise<void> {
    this.state = 'menu';
    this.ui.hud.show(false);
    this.audio?.stopAll();
    this.ui.clear();
    void this.ui.hud.fade(0, 0.6);
    let save: SaveGame | null = null;
    try {
      save = await this.saves.load();
    } catch (e) {
      if (e instanceof SaveError && e.reason === 'version') this.ui.hud.toast(this.t('ui.save.newer'));
    }
    titleScreen(this.ui, {
      hasSave: !!save,
      complete: save?.endingState !== 'none' && !!save,
      version: `v${__GAME_BUILD__}`,
      onNew: () => void this.newGame(!!save),
      onContinue: () => save && void this.continueGame(save),
      onSettings: () => this.openSettings(),
      onCredits: () => void creditsRoll(this.ui, creditsData((k) => this.t(k), 'none'), { reducedMotion: this.settings.reducedMotion }),
      onLicenses: () => licensesScreen(this.ui, licenseRows(), softwareNotices(), () => undefined),
      onImport: () => void this.importSave(),
    });
  }

  private openSettings(onClose?: () => void): void {
    settingsScreen(this.ui, {
      settings: this.settings,
      input: this.input,
      apply: () => this.applySettings(),
      onClose: () => {
        if (this.state === 'menu') void this.showTitle();
        onClose?.();
      },
    });
  }

  private async newGame(hasSave: boolean): Promise<void> {
    await this.audio.unlock();
    if (hasSave && !(await this.ui.confirm('ui.title.overwrite_title', 'ui.title.overwrite_body'))) return;
    if (!this.settings.firstRunDone) await prePlay(this.ui, this.settings, () => this.applySettings());
    this.ui.clear();
    const s = new GameSession(this.tables);
    s.inventory.add('item.camera');
    s.inventory.add('item.radio');
    s.flags.set('has.item.camera');
    s.flags.set('has.item.radio');
    await this.startSession(s, this.tables.manifest.firstScene, this.tables.manifest.firstSpawn);
  }

  private async continueGame(save: SaveGame): Promise<void> {
    await this.audio.unlock();
    if (!this.settings.firstRunDone) await prePlay(this.ui, this.settings, () => this.applySettings());
    this.ui.clear();
    const s = new GameSession(this.tables);
    s.restore(save);
    if (s.complete) {
      // replay the final decision to see the other ending
      for (const f of ['ep01.complete', 'ending.A', 'ending.B', 'trigger.L05.t_decide']) s.flags.set(f, false);
      s.ending = 'none';
      s.sceneId = 'aleya.ep01.L05';
      s.checkpointId = 'L05.cp_bank';
    }
    await this.startSession(s, s.sceneId, s.checkpointId);
  }

  private async startSession(s: GameSession, sceneId: string, spawn: string): Promise<void> {
    this.session = s;
    s.flags.onChange(() => (this.flagsDirty = true));
    this.director = new NarrativeDirector(new Map(), s.flags, this.directorHost());
    this.lastCheckpoint = s.snapshot(__GAME_BUILD__, SETTINGS_VERSION);
    await this.loadScene(sceneId, spawn);
  }

  // ------------------------------------------------------------------ scenes

  async loadScene(sceneId: string, spawnOrCheckpoint: string, opts: { reload?: boolean } = {}): Promise<void> {
    const s = this.session!;
    this.state = 'loading';
    this.ui.hud.show(false);
    this.ui.hud.setPrompt(null);
    this.ui.hud.showSubtitle(null, this.subOpts());
    await this.ui.hud.fade(1, opts.reload ? 0.3 : 0.6);
    const loading = loadingScreen(this.ui, this.t('ui.loading'));
    this.audio.clearEmitters();
    let pkg: { manifest: SceneManifest; sequences: Sequence[] };
    try {
      pkg = await loadScene(sceneId);
    } catch (e) {
      console.error(e);
      loading.close();
      errorScreen(this.ui, this.t('ui.error.load_title'), this.t('ui.error.load_body'), [
        { label: this.t('ui.retry'), onClick: () => (this.ui.clear(), void this.loadScene(sceneId, spawnOrCheckpoint, opts)) },
        { label: this.t('ui.pause.quit'), onClick: () => void this.showTitle() },
      ]);
      return;
    }
    const { manifest, sequences } = pkg;
    this.manifest = manifest;
    this.director!.addSequences(sequences);
    // asset tier follows the quality profile, applied only between scenes
    const tier = QUALITY[this.settings.quality].tier;
    if (this.mats.tier !== tier) {
      this.mats = new MaterialLibrary(this.stage.app.graphicsDevice, tier);
      this.renderer.setMaterialLibrary(this.mats);
    }
    await this.renderer.load(manifest, (p) => loading.set(p));
    this.world = new SceneWorld(manifest, s, this.settings.lowTension);
    // restore persistent water levels recorded by earlier sequences
    for (const f of s.flags.toJSON()) {
      const m = f.match(/^water:([^=]+)=(-?[\d.]+)$/);
      if (m) this.renderer.setWater(m[1], Number(m[2]), 0);
    }
    this.world.spawn(spawnOrCheckpoint);
    this.world.lanternOn = s.inventory.has('item.lantern');
    const m = this.world.motor;
    this.renderer.snapCamera(m.x, m.y, m.z, m.facing);
    s.sceneId = sceneId;
    const cp = manifest.checkpoints.find((c) => c.id === spawnOrCheckpoint) ?? manifest.checkpoints.find((c) => c.spawn === spawnOrCheckpoint) ?? manifest.checkpoints[0];
    s.checkpointId = cp.id;
    s.flags.set(`visited.${sceneKey(sceneId)}`);
    this.updateAudioZones(true);
    loading.close();
    this.state = 'play';
    this.ui.hud.show(true);
    this.flagsDirty = true;
    // save on every scene transition (checkpoint semantics)
    if (!opts.reload) await this.checkpoint(cp.id);
    const key = sceneKey(sceneId);
    if (manifest.enterSequence && !s.flags.has(`${key}.entered`)) void this.director!.play(manifest.enterSequence);
    else void this.ui.hud.fade(0, 1.0);
  }

  private updateAudioZones(force = false): void {
    if (!this.manifest || !this.world || !this.session) return;
    const x = this.world.motor.x;
    const zone = this.manifest.audioZones.find((z) => x >= z.x0 && x < z.x1);
    this.audio.setBed(zone?.bed ?? null, force ? 1.5 : 3);
    for (const e of this.manifest.soundEmitters) this.audio.setEmitter(e.id, e.cue, e.pos, e.gain, this.session.flags.test(e.when));
  }

  // ------------------------------------------------------------------ persistence

  private async checkpoint(id: string): Promise<void> {
    const s = this.session!;
    s.checkpointId = id;
    const snap = s.snapshot(__GAME_BUILD__, SETTINGS_VERSION);
    this.lastCheckpoint = structuredClone(snap);
    await this.persist(snap);
  }

  private async persist(snap: SaveGame): Promise<void> {
    this.ui.hud.saving(true, this.t('ui.saving'));
    try {
      await this.saves.save(snap);
      if (!this.persistRequested) {
        this.persistRequested = true;
        void this.platform.requestPersistentStorage();
      }
    } catch (e) {
      console.error(e);
      const reason = e instanceof SaveError ? e.reason : 'unknown';
      this.ui.hud.toast(this.t(reason === 'quota' ? 'ui.save.quota' : 'ui.save.failed'), 8);
    } finally {
      setTimeout(() => this.ui.hud.saving(false), 900);
    }
  }

  /** Best-effort save of the last checkpoint plus clues and play time (never mid-sequence state). */
  private safeSnapshot(): SaveGame | null {
    if (!this.lastCheckpoint || !this.session) return null;
    const snap = structuredClone(this.lastCheckpoint);
    snap.playSeconds = Math.round(this.session.playSeconds);
    const known = new Set(snap.clueIds);
    for (const c of this.session.journal.list()) if (!known.has(c.id)) {
      snap.clues.push(c);
      snap.clueIds.push(c.id);
      snap.questFlags.push(`has.${c.id}`);
    }
    snap.savedAt = new Date().toISOString();
    return snap;
  }

  private async exportSave(): Promise<void> {
    const snap = this.safeSnapshot() ?? (await this.saves.load().catch(() => null));
    if (!snap) {
      this.ui.hud.toast(this.t('ui.save.none'));
      return;
    }
    await this.platform.saveFile(`aleya-ep01-save-${snap.savedAt.slice(0, 10)}.json`, SaveRepository.exportText(snap));
    this.ui.hud.toast(this.t('ui.save.exported'));
  }

  private async importSave(): Promise<void> {
    const text = await this.platform.openFile('application/json,.json');
    if (!text) return;
    try {
      const save = SaveRepository.parseImport(text);
      if (!(await this.ui.confirm('ui.save.import_title', 'ui.save.import_body'))) return;
      await this.saves.save(save);
      this.ui.clear();
      await this.continueGame(save);
    } catch (e) {
      console.error(e);
      errorScreen(this.ui, this.t('ui.save.import_failed'), e instanceof Error ? e.message : String(e), [{ label: this.t('ui.close'), onClick: () => this.ui.pop() }]);
    }
  }

  // ------------------------------------------------------------------ director host

  private directorHost(): DirectorHost {
    return {
      run: (step, ctx) => this.runStep(step, ctx),
      sequenceStart: () => undefined,
      sequenceEnd: (seq, skipped) => {
        const m = this.world?.motor;
        this.ui.hud.showSubtitle(null, this.subOpts());
        if (this.session?.complete && (seq.id.includes('ending'))) {
          void this.finishEpisode();
          return;
        }
        if (skipped) {
          this.renderer.director.returnToFollow();
          void this.ui.hud.fade(0, 0.5);
        }
        if (m?.inCutscene) m.setCutscene(false);
        if (this.state === 'play' && Number(this.ui.hud.fadeEl.style.opacity || 0) > 0.5 && !this.failing) void this.ui.hud.fade(0, 0.8);
      },
    };
  }

  private subOpts() {
    return { background: this.settings.subtitleBackground, size: this.settings.subtitleSize, labels: true };
  }

  lineDuration(line: DialogueLine): number {
    if (line.duration) return line.duration;
    const bn = this.loc.t(line.textKey, undefined, 'bn').length;
    const en = this.loc.t(line.textKey, undefined, 'en').length;
    const chars = Math.max(bn, en);
    const d = Math.min(9.5, Math.max(1.8, 1.3 + chars * 0.058));
    return line.speaker === 'caption' ? Math.max(2.2, d * 0.8) : d;
  }

  /** QA automation only: scales narrative waits (1 = real time) */
  private timeScale = 1;

  private wait(seconds: number, ctx?: StepContext): Promise<void> {
    if (ctx?.fast) return Promise.resolve();
    return Promise.race([sleep((seconds * 1000) / this.timeScale), ctx?.skip.promise ?? new Promise<void>(() => undefined)]);
  }

  async say(lineId: string, ctx?: StepContext): Promise<void> {
    const line = this.lines.get(lineId);
    if (!line) return;
    const dur = this.lineDuration(line);
    const caption = line.speaker === 'caption';
    const show = caption ? this.settings.soundCaptions : this.settings.subtitles;
    const stop = this.audio.voice(line.id, line.speaker as Speaker, line.channel as Channel, dur);
    if (show) {
      this.ui.hud.showSubtitle(
        {
          speaker: line.speaker,
          speakerLabel: caption ? '' : this.t(`speaker.${line.speaker}`, undefined, this.settings.subtitleLanguage),
          text: this.loc.t(line.textKey, undefined, this.settings.subtitleLanguage),
          channel: line.channel,
          caption,
        },
        this.subOpts(),
      );
    }
    await this.wait(dur, ctx);
    stop();
    this.ui.hud.showSubtitle(null, this.subOpts());
    await this.wait(0.18, ctx);
  }

  private async runStep(step: LeafStep, ctx: StepContext): Promise<void> {
    const s = this.session!;
    const k = Object.keys(step)[0];
    switch (k) {
      case 'say':
        if (!ctx.fast) await this.say((step as { say: string }).say, ctx);
        return;
      case 'shot':
        if (!ctx.fast) this.renderer.playShot((step as { shot: string }).shot);
        return;
      case 'follow':
        this.renderer.director.returnToFollow();
        return;
      case 'set': {
        const f = (step as { set: string }).set;
        s.flags.set(f);
        if (f.startsWith('tip.') && !ctx.fast) this.ui.hud.tip(this.tipText(f));
        if (f === 'ending.A' || f === 'ending.B') s.ending = f === 'ending.A' ? 'A' : 'B';
        return;
      }
      case 'unset':
        s.flags.set((step as { unset: string }).unset, false);
        return;
      case 'clue': {
        const id = (step as { clue: string }).clue;
        if (s.addClue(id)) {
          s.flags.set(`has.${id}`);
          const def = this.tables.clues.find((c) => c.id === id)!;
          this.ui.hud.toast(`${this.t('ui.toast.clue')}: ${this.t(def.titleKey)}`);
        }
        return;
      }
      case 'item': {
        const id = (step as { item: string }).item;
        if (s.inventory.add(id)) {
          s.flags.set(`has.${id}`);
          const def = this.tables.items.find((c) => c.id === id)!;
          this.ui.hud.toast(`${this.t('ui.toast.item')}: ${this.t(def.nameKey)}`);
          if (id === 'item.lantern' && this.world) this.world.lanternOn = true;
        }
        return;
      }
      case 'removeItem': {
        const id = (step as { removeItem: string }).removeItem;
        s.inventory.remove(id);
        s.flags.set(`has.${id}`, false);
        return;
      }
      case 'wait':
        await this.wait((step as { wait: number }).wait, ctx);
        return;
      case 'sfx':
        if (!ctx.fast) {
          const st = step as { sfx: string; at?: [number, number, number] };
          this.audio.sfx(st.sfx, st.at);
          if (st.sfx.startsWith('horn') || st.sfx === 'collapse' || st.sfx === 'hull_groan') this.platform.haptic('heavy');
        }
        return;
      case 'music':
        this.audio.setMusic((step as { music: string | null }).music);
        return;
      case 'fade': {
        const st = step as { fade: 'out' | 'in'; duration: number };
        await this.ui.hud.fade(st.fade === 'out' ? 1 : 0, ctx.fast ? 0 : st.duration / this.timeScale);
        return;
      }
      case 'checkpoint':
        await this.checkpoint((step as { checkpoint: string }).checkpoint);
        return;
      case 'puzzle':
        await this.runPuzzle((step as { puzzle: string }).puzzle);
        return;
      case 'threat': {
        const st = step as { threat: string; action: 'start' | 'stop' };
        if (st.action === 'start') this.world?.startThreat(st.threat);
        else this.world?.stopThreat(st.threat);
        return;
      }
      case 'lightning':
        if (!ctx.fast) this.renderer.lightning();
        return;
      case 'loadScene': {
        const st = step as { loadScene: string; spawn: string };
        await this.loadScene(st.loadScene, st.spawn);
        return;
      }
      case 'choice': {
        const def = this.tables.choices.find((c) => c.id === (step as { choice: string }).choice)!;
        const pick = await choiceScreen(
          this.ui,
          this.t(def.promptKey),
          def.options.map((o) => ({ id: o.id, label: this.t(o.labelKey), detail: this.t(o.detailKey) })),
        );
        const opt = def.options.find((o) => o.id === pick)!;
        void this.director!.play(opt.sequence);
        return;
      }
      case 'objective':
        this.flagsDirty = true;
        return;
      case 'document': {
        const doc = this.tables.documents.find((d) => d.id === (step as { document: string }).document)!;
        await documentReader(this.ui, this.t(doc.titleKey), this.t(doc.bodyKey), doc.style);
        return;
      }
      case 'chapter': {
        if (ctx.fast) return;
        const text = this.t((step as { chapter: string }).chapter);
        await card(this.ui, text, (text.length > 60 ? Math.min(9, 3 + text.length * 0.04) : 3.2) / this.timeScale, this.settings.reducedMotion);
        return;
      }
      case 'toggle': {
        const st = step as { toggle: string; on: boolean };
        s.flags.set(`tag:${st.toggle}`, st.on);
        return;
      }
      case 'water': {
        const st = step as { water: string; y: number; duration: number };
        for (const f of s.flags.toJSON()) if (f.startsWith(`water:${st.water}=`)) s.flags.set(f, false);
        s.flags.set(`water:${st.water}=${st.y}`);
        this.renderer.setWater(st.water, st.y, ctx.fast ? 0 : st.duration);
        return;
      }
      case 'playerState':
        this.world?.motor.setCutscene((step as { playerState: string }).playerState === 'Cutscene');
        return;
      case 'credits': {
        this.audio.setMusic('credits');
        this.ui.hud.show(false);
        await creditsRoll(this.ui, creditsData((k2) => this.t(k2), s.ending), { reducedMotion: this.settings.reducedMotion });
        return;
      }
      case 'quake':
        if (!ctx.fast) {
          this.renderer.quake((step as { quake: number }).quake);
          this.world?.motor.lock('Stumble', 0.7);
          this.platform.haptic('heavy');
        }
        return;
    }
  }

  private async runPuzzle(id: string): Promise<void> {
    const s = this.session!;
    const def = this.tables.puzzles.find((p) => p.id === id)!;
    const rules = createPuzzle(def);
    const rec = s.puzzleRecord(id);
    if (rec.data) rules.restore(rec.data);
    if (rec.solved) {
      s.flags.set(def.solvedFlag);
      return;
    }
    const session = new PuzzleSession(def, rules, rec);
    const sync = () => {
      if (rules.kind === 'floodgate') this.renderer.handle<{ set(t: number[], g: number[]): void }>('floodgate')?.set(rules.turns, rules.gauges());
      if (rules.kind === 'wheelhouse') this.renderer.handle<{ set(d: number[], g: number): void }>('wheelhouse')?.set(rules.disks, rules.gear);
    };
    sync();
    const lights = this.renderer.handle<{ blink(p: string, on: boolean): void; rest(): void }>('creekLights');
    const outcome = await openPuzzle(this.ui, def, session, {
      t: (k, v) => this.t(k, v),
      num: (n) => this.loc.num(n),
      allowSkip: this.settings.allowSkip,
      slowLantern: this.settings.slowLantern,
      sync,
      playLine: (lineId) => this.say(lineId),
      lineText: (lineId) => {
        const l = this.lines.get(lineId);
        return l ? this.loc.t(l.textKey, undefined, this.settings.subtitleLanguage) : '';
      },
      lanternBlink: (p, on) => lights?.blink(p, on),
      lanternRest: () => lights?.rest(),
      sfx: (c) => this.audio.sfx(c),
      onOpen: (fn) => (this.forceSolve = fn),
      setSlowLantern: (on) => {
        this.settings.slowLantern = on;
        this.applySettings();
      },
    });
    this.forceSolve = null;
    rec.data = rules.serialize();
    if (outcome === 'solved' || outcome === 'skipped') {
      rec.solved = true;
      s.flags.set(def.solvedFlag);
    }
  }

  private async finishEpisode(): Promise<void> {
    const s = this.session!;
    this.state = 'finished';
    const snap = s.snapshot(__GAME_BUILD__, SETTINGS_VERSION);
    await this.persist(snap);
    this.lastCheckpoint = snap;
    await this.ui.hud.fade(1, 1);
    this.renderer.unload();
    this.world = null;
    this.audio.stopAll();
    const done = errorScreen(this.ui, this.t(s.ending === 'A' ? 'ending.A.title' : 'ending.B.title'), this.t('ui.end.body'), [
      { label: this.t('ui.end.title'), onClick: () => (this.ui.remove(done), void this.showTitle()) },
    ]);
  }

  // ------------------------------------------------------------------ failure

  private async fail(): Promise<void> {
    if (this.failing || !this.lastCheckpoint || !this.session) return;
    this.failing = true;
    this.world?.stopAllThreats();
    this.director?.abortAll();
    this.audio.sfx('watcher_tele');
    this.platform.haptic('heavy');
    await this.ui.hud.fade(1, 0.5);
    await failOverlay(this.ui, this.t('ui.fail.caught'), 1.6);
    const s = this.session;
    const journal = s.journal.list();
    s.restore(structuredClone(this.lastCheckpoint));
    // clues are never lost on failure
    for (const c of journal) if (!s.journal.has(c.id)) {
      s.journal.load([...s.journal.list(), c]);
      s.flags.set(`has.${c.id}`);
    }
    // a fresh director drops any half-run sequence
    this.director = new NarrativeDirector(new Map(), s.flags, this.directorHost());
    s.flags.onChange(() => (this.flagsDirty = true));
    await this.loadScene(s.sceneId, s.checkpointId, { reload: true });
    this.failing = false;
  }

  // ------------------------------------------------------------------ pause / journal

  private openPause(): void {
    if (this.pauseLayer || this.state !== 'play') return;
    this.state = 'paused';
    this.input.releaseAll();
    const s = this.session!;
    const secs = Math.round(s.playSeconds);
    const time = this.loc.num(`${Math.floor(secs / 3600)}:${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`);
    const resume = () => {
      if (this.pauseLayer) this.ui.remove(this.pauseLayer);
      this.pauseLayer = null;
      this.state = 'play';
      this.ui.hud.pulseObjective();
    };
    this.pauseLayer = pauseMenu(this.ui, {
      onResume: resume,
      onJournal: () => this.openJournal(),
      onSettings: () => this.openSettings(),
      onCheckpoint: async () => {
        if (!(await this.ui.confirm('ui.pause.checkpoint_title', 'ui.pause.checkpoint_body'))) return;
        resume();
        void this.fail();
      },
      onExport: () => void this.exportSave(),
      onImport: () => void this.importSave(),
      onQuit: async () => {
        if (!(await this.ui.confirm('ui.pause.quit_title', 'ui.pause.quit_body'))) return;
        const snap = this.safeSnapshot();
        if (snap) await this.persist(snap);
        this.director?.abortAll();
        this.pauseLayer = null;
        this.renderer.unload();
        this.world = null;
        this.session = null;
        void this.showTitle();
      },
      playTime: time,
      sceneName: this.sceneName(),
    });
  }

  private openJournal(): void {
    const s = this.session!;
    const t = (k: string) => this.t(k);
    const node = this.manifest ? s.quest.current(this.manifest.id) : undefined;
    const people: { name: string; body: string }[] = [];
    const person = (key: string, flag?: string) => (!flag || s.flags.has(flag)) && people.push({ name: t(`people.${key}.name`), body: t(`people.${key}.body`) });
    person('rafi');
    person('karim', 'has.clue.karim_story');
    person('mira', 'L01.mira_called');
    person('jalal', 'has.clue.crew_roster');
    person('talukder', 'has.clue.official_notice');
    person('watcher', 'has.clue.watcher');
    person('tuli', 'has.clue.karim_confession');
    const wasPaused = this.state === 'paused';
    if (!wasPaused) this.state = 'paused';
    journalScreen(
      this.ui,
      {
        sceneName: this.sceneName(),
        objective: node ? t(node.objectiveKey) : null,
        clues: s.journal
          .list()
          .slice()
          .reverse()
          .map((e) => {
            const def = this.tables.clues.find((c) => c.id === e.id)!;
            const mins = Math.floor(e.foundAt / 60);
            return {
              id: e.id,
              title: t(def.titleKey),
              body: t(def.bodyKey),
              kind: def.kind,
              isNew: e.isNew,
              scene: t(`scene.${sceneKey(def.sceneId)}.name`),
              time: this.t('ui.journal.time', { m: mins }),
              optional: def.optional,
            };
          }),
        people,
        items: s.inventory.list().map((id) => {
          const d = this.tables.items.find((i) => i.id === id)!;
          return { name: t(d.nameKey), desc: t(d.descKey) };
        }),
        map: {
          visited: ['L01', 'L02', 'L03', 'L04', 'L05'].filter((k) => s.flags.has(`visited.${k}`)),
          current: this.manifest ? sceneKey(this.manifest.id) : 'L01',
          channelRevealed: s.flags.has('L02.map_found'),
          ferryFound: s.flags.has('L04.exit'),
        },
      },
      () => {
        if (!wasPaused) {
          this.state = 'play';
          this.ui.hud.pulseObjective();
        }
      },
      (id) => s.journal.markSeen(id),
    );
  }

  // ------------------------------------------------------------------ lifecycle

  private onSuspend(): void {
    this.visibleBefore = false;
    if (this.state === 'play') this.openPause();
    const snap = this.safeSnapshot();
    if (snap) void this.saves.save(snap).catch(() => undefined);
    this.audio?.suspend();
  }

  private onResume(): void {
    if (this.visibleBefore) return;
    this.visibleBefore = true;
    this.audio?.resume();
  }

  private contextLayer: Layer | null = null;

  private onContextLost(): void {
    if (this.state === 'play') this.openPause();
    this.contextLayer = errorScreen(this.ui, this.t('ui.error.context_title'), this.t('ui.error.context_body'), [
      {
        label: this.t('ui.error.reload_checkpoint'),
        onClick: () => {
          const snap = this.safeSnapshot();
          void (snap ? this.saves.save(snap) : Promise.resolve()).finally(() => location.reload());
        },
      },
    ]);
  }

  private onContextRestored(): void {
    if (this.contextLayer) this.ui.remove(this.contextLayer);
    this.contextLayer = null;
    this.ui.hud.toast(this.t('ui.error.context_restored'));
    if (this.session && this.lastCheckpoint) void this.fail();
  }

  // ------------------------------------------------------------------ frame

  private uiActionsFromInput(): UIAction[] {
    const out: UIAction[] = [];
    const map: [ButtonAction, UIAction][] = [
      ['up', 'up'],
      ['down', 'down'],
      ['left', 'left'],
      ['right', 'right'],
      ['confirm', 'confirm'],
      ['back', 'back'],
      ['journal', 'journal'],
      ['hint', 'hint'],
    ];
    for (const [a, u] of map) {
      if (this.input.pressed(a)) {
        out.push(u);
        this.repeat.set(a, 0.42);
      } else if (this.input.held(a) && (a === 'up' || a === 'down' || a === 'left' || a === 'right')) {
        const r = (this.repeat.get(a) ?? 0.42) - 1 / 60;
        if (r <= 0) {
          out.push(u);
          this.repeat.set(a, 0.11);
        } else this.repeat.set(a, r);
      }
    }
    if (this.input.pressed('pause') && !out.includes('back')) out.push('pause');
    return out;
  }

  private frame(rawDt: number): void {
    const dt = Math.min(0.1, rawDt);
    this.devices.poll();
    this.input.update(dt);
    this.stage.tick(rawDt);
    if (this.ui.hasModal) {
      // keyboard focus is native; gamepad + mapped keys drive spatial navigation
      for (const a of this.uiActionsFromInput()) this.ui.handleAction(a);
    }
    const playing = this.state === 'play' && !!this.world && !this.ui.hasModal && !this.failing;
    if (playing) this.gameplay(dt);
    else this.ui.hud.setPrompt(null);
    if (this.world && this.state !== 'loading') {
      const m = this.world.motor;
      this.renderer.update(this.state === 'paused' ? 0 : dt, {
        player: { x: m.x, y: m.y, z: m.z, state: m.state, speed: m.speed, facing: m.facing, lanternOn: this.world.lanternOn, hasLantern: !!this.session?.inventory.has('item.lantern') },
        threats: this.world.threatViews(),
        highlight: this.settings.highlight && this.world.nearest && !this.director?.busy ? (this.world.nearest.pos as [number, number, number]) : null,
        chaseActive: this.world.chaseActive,
      });
      const cp = this.renderer.director.position;
      this.audio.setListener(cp.x, cp.y, cp.z);
      this.ui.hud.flash(this.renderer.lightningFlash * (this.settings.reducedFlash ? 0.15 : 1));
    }
    if (this.flagsDirty && this.session && this.manifest) {
      this.flagsDirty = false;
      this.renderer.refresh();
      const node = this.session.quest.current(this.manifest.id);
      this.ui.hud.setObjective(this.sceneName(), node ? this.t(node.objectiveKey) : null);
      this.updateAudioZones();
    }
    this.ui.hud.update(dt);
  }

  private tryInteract(): void {
    const w = this.world;
    if (!w || this.director?.busy || w.motor.inCutscene || this.state !== 'play') return;
    const it = w.findInteractable();
    if (!it) return;
    this.session!.flags.set(`${it.id}.used`);
    w.motor.lock('Interact', 0.45);
    this.audio.sfx('puzzle_click');
    void this.director!.play(it.sequence);
  }

  private gameplay(dt: number): void {
    const w = this.world!;
    const s = this.session!;
    const m = w.motor;
    const inp = this.input;
    s.playSeconds += dt;
    if (inp.pressed('pause')) return this.openPause();
    if (inp.pressed('journal') && !m.inCutscene) return this.openJournal();
    // skip cinematics (hold-to-skip by default)
    if (this.director?.canSkip) {
      const holdNeeded = this.settings.holdToSkip ? 1.0 : 0;
      if (inp.held('skip')) this.skipHold += dt;
      else this.skipHold = 0;
      this.ui.hud.skipHint(this.t(this.settings.holdToSkip ? 'ui.skip.hold' : 'ui.skip.press', { key: this.keyFor('skip') }), holdNeeded ? Math.min(1, this.skipHold / holdNeeded) : 0);
      if ((holdNeeded && this.skipHold >= holdNeeded) || (!holdNeeded && inp.pressed('skip'))) {
        this.skipHold = 0;
        this.director.skip();
      }
    } else {
      this.skipHold = 0;
      this.ui.hud.skipHint(null);
    }
    if (inp.pressed('lantern') && s.inventory.has('item.lantern') && !m.inCutscene) {
      w.lanternOn = !w.lanternOn;
      this.audio.sfx('lantern_click');
    }
    const intent = { moveX: inp.axis('moveX'), moveZ: inp.axis('moveZ'), run: inp.held('run'), crouch: inp.held('crouch') };
    const nav = m.update(dt, intent, w.inHideZone());
    // barrier feedback
    this.barrierCooldown -= dt;
    if (nav?.blockedBy?.messageKey && Math.abs(intent.moveX) > 0.3 && this.barrierCooldown <= 0 && !this.director?.busy) {
      this.barrierCooldown = 5;
      const text = this.t(nav.blockedBy.messageKey);
      this.ui.hud.showSubtitle({ speaker: 'asha', speakerLabel: this.t('speaker.asha'), text, channel: 'thought', caption: false }, this.subOpts());
      setTimeout(() => this.ui.hud.showSubtitle(null, this.subOpts()), 2800);
    }
    // footsteps
    if (m.state === 'Walk' || m.state === 'Run' || m.state === 'Crouch' || m.state === 'Climb') {
      const strideLen = m.state === 'Run' ? 0.85 : m.state === 'Crouch' ? 0.45 : 0.65;
      if (m.stride - this.stride > strideLen) {
        this.stride = m.stride;
        this.audio.footstep(w.surface(), m.state === 'Crouch' ? 0.4 : m.state === 'Run' ? 1.1 : 0.8);
      }
    } else this.stride = m.stride;
    // interactables
    const busy = !!this.director?.busy;
    const it = !busy && !m.inCutscene ? w.findInteractable() : ((w.nearest = null), null);
    if (it) this.ui.hud.setPrompt(this.keyFor('interact'), this.t(it.verbKey), this.t(it.objectKey));
    else this.ui.hud.setPrompt(null);
    if (it && inp.pressed('interact')) this.tryInteract();
    // triggers
    if (!busy) {
      for (const tr of w.pendingTriggers()) {
        s.flags.set(`trigger.${tr.id}`);
        void this.director!.play(tr.sequence);
        break;
      }
    }
    // threats (never advance while text/puzzles are open — those set ui.hasModal and stop gameplay)
    for (const { id, ev } of w.updateThreats(dt, false, SPEED.run)) {
      if (ev.type === 'caught') void this.fail();
      if (ev.type === 'escaped') {
        const def = w.threats.get(id)!.def;
        this.ui.hud.threat(0, null);
        if (def.onEscape) void this.director!.play(def.onEscape);
      }
      if (ev.type === 'phase' && ev.phase === 'Telegraph') this.audio.sfx('watcher_tele', undefined, 0.6);
    }
    const danger = w.dangerLevel();
    const patrol = [...w.threats.values()].find((t) => t.def.kind === 'patrol' && t.running);
    const label = patrol
      ? patrol.phase === 'Telegraph'
        ? this.t('ui.threat.sweep_coming')
        : patrol.phase === 'Search'
          ? this.t(w.hidden ? 'ui.threat.hidden' : 'ui.threat.exposed')
          : null
      : w.chaseActive
        ? this.t('ui.threat.run')
        : null;
    this.ui.hud.threat(this.settings.lowTension ? danger * 0.5 : danger, label);
    this.updateAudioZones();
  }

  // ------------------------------------------------------------------ debug / automation hooks

  debugApi() {
    return {
      state: () => ({
        app: this.state,
        scene: this.manifest?.id ?? null,
        x: this.world?.motor.x ?? null,
        flags: this.session?.flags.toJSON() ?? [],
        busy: !!this.director?.busy,
        sequence: this.director?.currentId ?? null,
        modal: this.ui.hasModal,
        fps: this.stage?.fps ?? 0,
        scale: this.stage?.currentScale ?? 1,
        materials: this.mats?.stats(),
      }),
      setFlag: (f: string, v = true) => this.session?.flags.set(f, v),
      teleport: (x: number, z = 0) => this.world?.motor.teleport(x, 0, z, 1),
      skip: () => this.director?.skip(),
      load: (scene: string, spawn: string) => this.loadScene(scene, spawn),
      interact: () => this.tryInteract(),
      solvePuzzle: () => this.forceSolve?.(),
      speed: (k: number) => (this.timeScale = Math.max(1, k)),
      canSkip: () => !!this.director?.canSkip,
      closeModal: () => this.ui.handleAction('back'),
      /** walk the player to x by teleporting next to it (automation) */
      goTo: (x: number) => this.world?.motor.teleport(x, 0, this.world.motor.z, 1),
      quality: (q: Settings['quality']) => {
        this.settings.quality = q;
        this.applySettings();
      },
      fail: () => this.fail(),
      /** raw engine access for QA tooling only */
      pc: () => this.stage.app,
      stage: () => this.stage,
      newGame: () => this.newGame(false),
      /** ad-hoc inspection camera relative to the player */
      closeup: (dx: number, dy: number, dz: number, ty = 1.5, fov = 30) => {
        const m = this.world!.motor;
        this.renderer.director.playShot({ id: 'debug', kind: 'Inspect', ease: 'linear', hold: true, skippable: true, shake: 0, keys: [{ t: 0, pos: [m.x + dx, m.y + dy, m.z + dz], target: [m.x, m.y + ty, m.z], fov }] });
      },
      follow: () => this.renderer.director.returnToFollow(),
      closeAt: (pos: [number, number, number], target: [number, number, number], fov = 28) =>
        this.renderer.director.playShot({ id: 'debug', kind: 'Inspect', ease: 'linear', hold: true, skippable: true, shake: 0, keys: [{ t: 0, pos, target, fov }] }),
    };
  }
}
