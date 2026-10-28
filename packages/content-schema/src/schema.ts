import { z } from 'zod';

/**
 * Content schema for ALEYA episodes. Every manifest, dialogue table, puzzle and
 * sequence is validated against these schemas in unit tests and at boot in dev.
 * IDs are globally stable: `aleya.ep01.L01`, `L01.power_on`, `clue.fuse_diagram`.
 */

export const CONTENT_SCHEMA_VERSION = 1;

export const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3>;

export const Color = z.tuple([z.number(), z.number(), z.number()]);

/** Flag condition: all flags in `all` set, none of the flags in `none` set. */
export const Condition = z.object({
  all: z.array(z.string()).optional(),
  none: z.array(z.string()).optional(),
});
export type Condition = z.infer<typeof Condition>;

export const SpawnPoint = z.object({
  id: z.string(),
  pos: Vec3,
  facing: z.union([z.literal(1), z.literal(-1)]).default(1),
});

export const Checkpoint = z.object({ id: z.string(), spawn: z.string() });

/** A walkable lane segment. Height interpolates from y0 at x0 to y1 at x1. */
export const NavLane = z.object({
  x0: z.number(),
  x1: z.number(),
  z0: z.number(),
  z1: z.number(),
  y0: z.number().default(0),
  y1: z.number().optional(),
  surface: z.enum(['wood', 'mud', 'concrete', 'water', 'metal']).default('mud'),
});
export type NavLane = z.infer<typeof NavLane>;

/** Blocks lateral movement past `x` on the given side unless the condition is met. */
export const Barrier = z.object({
  id: z.string(),
  x: z.number(),
  side: z.enum(['max', 'min']).default('max'),
  until: Condition.optional(),
  messageKey: z.string().optional(),
});
export type Barrier = z.infer<typeof Barrier>;

export const StaticCollider = z.object({ x0: z.number(), x1: z.number(), z0: z.number(), z1: z.number() });
export type StaticCollider = z.infer<typeof StaticCollider>;

export const CameraRail = z.object({
  x0: z.number(),
  x1: z.number(),
  offset: Vec3,
  look: Vec3.default([0, 1.2, 0]),
  fov: z.number().default(40),
});
export type CameraRail = z.infer<typeof CameraRail>;

export const ShotKey = z.object({ t: z.number(), pos: Vec3, target: Vec3, fov: z.number().optional() });
export const Shot = z.object({
  id: z.string(),
  kind: z.enum(['Establishing', 'Inspect', 'Dialogue', 'Reveal', 'Chase', 'Choice', 'Ending']).default('Establishing'),
  keys: z.array(ShotKey).min(1),
  ease: z.enum(['linear', 'inOut', 'out']).default('inOut'),
  /** when true the camera stays on the last key until another shot or `follow` */
  hold: z.boolean().default(false),
  skippable: z.boolean().default(true),
  /** shake amplitude, removed when camera shake is disabled */
  shake: z.number().default(0),
});
export type Shot = z.infer<typeof Shot>;

export const MaterialId = z.string();

export const PropDef = z.object({
  kind: z.enum(['box', 'cylinder', 'plane', 'sphere', 'cone', 'capsule', 'prefab']),
  prefab: z.string().optional(),
  pos: Vec3,
  rot: Vec3.optional(),
  scale: Vec3.optional(),
  material: MaterialId.optional(),
  shadows: z.boolean().optional(),
  layer: z.enum(['fg', 'mg', 'bg']).default('mg'),
  tag: z.string().optional(),
  when: Condition.optional(),
  /** text for signage prefabs (localization key) */
  textKey: z.string().optional(),
  /** generic numeric parameters for prefabs */
  params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
});
export type PropDef = z.infer<typeof PropDef>;

export const LightDef = z.object({
  id: z.string(),
  type: z.enum(['omni', 'spot']).default('omni'),
  pos: Vec3,
  rot: Vec3.optional(),
  color: Color,
  intensity: z.number(),
  range: z.number(),
  angle: z.number().optional(),
  flicker: z.number().default(0),
  shadows: z.boolean().default(false),
  tag: z.string().optional(),
  when: Condition.optional(),
  /** draw a small emissive bulb mesh */
  bulb: z.boolean().default(true),
});
export type LightDef = z.infer<typeof LightDef>;

export const InteractableDef = z.object({
  id: z.string(),
  pos: Vec3,
  radius: z.number().default(1.7),
  verbKey: z.string(),
  objectKey: z.string(),
  sequence: z.string(),
  when: Condition.optional(),
  /** sets `<id>.used` flag after first use and hides when once=true */
  once: z.boolean().default(false),
  optional: z.boolean().default(false),
});
export type InteractableDef = z.infer<typeof InteractableDef>;

export const TriggerDef = z.object({
  id: z.string(),
  x0: z.number(),
  x1: z.number(),
  sequence: z.string(),
  when: Condition.optional(),
  once: z.boolean().default(true),
});
export type TriggerDef = z.infer<typeof TriggerDef>;

export const AudioZone = z.object({
  id: z.string(),
  x0: z.number(),
  x1: z.number(),
  bed: z.string(),
  gain: z.number().default(1),
});
export const SoundEmitter = z.object({
  id: z.string(),
  cue: z.string(),
  pos: Vec3,
  gain: z.number().default(1),
  when: Condition.optional(),
  captionKey: z.string().optional(),
});

export const ThreatDef = z.object({
  id: z.string(),
  kind: z.enum(['pursuit', 'patrol']),
  spawn: Vec3,
  /** pursuit: speed relative to player run speed */
  speed: z.number().default(0.92),
  telegraphSeconds: z.number().default(2.5),
  /** patrol only: x range the watcher sweeps and seconds per sweep phase */
  patrol: z.object({ x0: z.number(), x1: z.number(), lookSeconds: z.number(), restSeconds: z.number() }).optional(),
  /** pursuit ends when player passes this x */
  safeX: z.number().optional(),
  failCheckpoint: z.string(),
  onEscape: z.string().optional(),
  /** the threat runs while this holds; restarts automatically after a checkpoint reload */
  activeWhen: Condition.optional(),
  /** Collapsing segments that fall behind the player during the chase */
  collapseTag: z.string().optional(),
});
export type ThreatDef = z.infer<typeof ThreatDef>;

export const HideZone = z.object({ x0: z.number(), x1: z.number() });

export const Water = z.object({
  y: z.number(),
  x0: z.number(),
  x1: z.number(),
  z0: z.number(),
  z1: z.number(),
  tint: Color.default([0.05, 0.07, 0.07]),
  tag: z.string().optional(),
});

export const LightingPreset = z.object({
  ambient: Color,
  fogColor: Color,
  fogDensity: z.number(),
  skyTop: Color,
  skyBottom: Color,
  moon: z.object({ color: Color, intensity: z.number(), rot: Vec3 }),
  rain: z.number().min(0).max(1),
  lightning: z.tuple([z.number(), z.number()]).nullable(),
  exposure: z.number().default(1),
});
export type LightingPreset = z.infer<typeof LightingPreset>;

export const SceneManifest = z.object({
  id: z.string().regex(/^aleya\.ep\d\d\.L\d\d$/),
  version: z.number().int(),
  displayNameKey: z.string(),
  chapterKey: z.string(),
  lightingPreset: LightingPreset,
  spawnPoints: z.array(SpawnPoint).min(1),
  checkpoints: z.array(Checkpoint).min(1),
  navLanes: z.array(NavLane).min(1),
  barriers: z.array(Barrier).default([]),
  staticColliders: z.array(StaticCollider).default([]),
  cameraRails: z.array(CameraRail).min(1),
  shots: z.array(Shot).default([]),
  audioZones: z.array(AudioZone).default([]),
  soundEmitters: z.array(SoundEmitter).default([]),
  props: z.array(PropDef).default([]),
  lights: z.array(LightDef).default([]),
  water: z.array(Water).default([]),
  interactables: z.array(InteractableDef).default([]),
  triggers: z.array(TriggerDef).default([]),
  threats: z.array(ThreatDef).default([]),
  hideZones: z.array(HideZone).default([]),
  puzzleIds: z.array(z.string()).default([]),
  questNodes: z.array(z.string()).default([]),
  enterSequence: z.string().optional(),
  criticalBundle: z.array(z.string()).default([]),
  deferredBundles: z.array(z.string()).default([]),
  supportedQualityProfiles: z.array(z.enum(['ultra', 'high', 'medium', 'low'])).default(['ultra', 'high', 'medium', 'low']),
  memoryBudgetMb: z.number().default(256),
});
export type SceneManifest = z.infer<typeof SceneManifest>;

// ---------- Narrative ----------

export const Speaker = z.enum(['asha', 'karim', 'mira', 'rafi', 'caption']);
export type Speaker = z.infer<typeof Speaker>;

export const DialogueLine = z.object({
  id: z.string(),
  speaker: Speaker,
  textKey: z.string(),
  /** radio = processed through radio filter; archive = old recording; direct = in person */
  channel: z.enum(['direct', 'radio', 'archive', 'thought']).default('direct'),
  /** audio URI per spoken language; null until recorded */
  audio: z.record(z.string(), z.string().nullable()).default({}),
  /** reading-time seconds when no audio is present */
  duration: z.number().optional(),
  soundDescKey: z.string().optional(),
});
export type DialogueLine = z.infer<typeof DialogueLine>;

const BaseStep = z.union([
  z.object({ say: z.string() }),
  z.object({ shot: z.string() }),
  z.object({ follow: z.literal(true) }),
  z.object({ set: z.string() }),
  z.object({ unset: z.string() }),
  z.object({ clue: z.string() }),
  z.object({ item: z.string() }),
  z.object({ removeItem: z.string() }),
  z.object({ wait: z.number() }),
  z.object({ sfx: z.string(), at: Vec3.optional(), captionKey: z.string().optional() }),
  z.object({ music: z.string().nullable() }),
  z.object({ fade: z.enum(['out', 'in']), duration: z.number().default(1) }),
  z.object({ checkpoint: z.string() }),
  z.object({ puzzle: z.string() }),
  z.object({ threat: z.string(), action: z.enum(['start', 'stop']) }),
  z.object({ lightning: z.literal(true) }),
  z.object({ loadScene: z.string(), spawn: z.string() }),
  z.object({ choice: z.string() }),
  z.object({ objective: z.string() }),
  z.object({ document: z.string() }),
  z.object({ chapter: z.string() }),
  z.object({ toggle: z.string(), on: z.boolean() }),
  z.object({ water: z.string(), y: z.number(), duration: z.number() }),
  z.object({ playerState: z.enum(['Idle', 'Cutscene']) }),
  z.object({ credits: z.literal(true) }),
  z.object({ quake: z.number() }),
]);

export type Step = z.infer<typeof BaseStep> | { if: Condition; then: Step[]; else?: Step[] };
export const Step: z.ZodType<Step> = z.lazy(() =>
  z.union([BaseStep, z.object({ if: Condition, then: z.array(Step), else: z.array(Step).optional() })]),
) as z.ZodType<Step>;

export const Sequence = z.object({
  id: z.string(),
  /** cinematic sequences can be skipped; flag steps are still applied */
  skippable: z.boolean().default(false),
  steps: z.array(Step),
});
export type Sequence = z.infer<typeof Sequence>;

export const ClueDef = z.object({
  id: z.string(),
  sceneId: z.string(),
  kind: z.enum(['document', 'photo', 'audio', 'object', 'person']),
  titleKey: z.string(),
  bodyKey: z.string(),
  optional: z.boolean().default(false),
});
export type ClueDef = z.infer<typeof ClueDef>;

export const ItemDef = z.object({ id: z.string(), nameKey: z.string(), descKey: z.string() });
export type ItemDef = z.infer<typeof ItemDef>;

export const DocumentDef = z.object({
  id: z.string(),
  titleKey: z.string(),
  bodyKey: z.string(),
  style: z.enum(['paper', 'ledger', 'notice', 'chalk', 'photo', 'map']).default('paper'),
});
export type DocumentDef = z.infer<typeof DocumentDef>;

export const QuestNode = z.object({
  id: z.string(),
  sceneId: z.string(),
  objectiveKey: z.string(),
  activeWhen: Condition,
  doneWhen: Condition,
});
export type QuestNode = z.infer<typeof QuestNode>;

export const PuzzleDef = z.object({
  id: z.string(),
  sceneId: z.string(),
  kind: z.enum(['breaker', 'ledger', 'radio', 'floodgate', 'lantern', 'wheelhouse', 'reconstruct']),
  titleKey: z.string(),
  instructionsKey: z.string(),
  hintKeys: z.tuple([z.string(), z.string(), z.string()]),
  solvedFlag: z.string(),
  config: z.record(z.string(), z.unknown()),
});
export type PuzzleDef = z.infer<typeof PuzzleDef>;

export const ChoiceDef = z.object({
  id: z.string(),
  promptKey: z.string(),
  options: z.array(z.object({ id: z.string(), labelKey: z.string(), detailKey: z.string(), sequence: z.string() })).min(2),
});
export type ChoiceDef = z.infer<typeof ChoiceDef>;

export const EpisodeManifest = z.object({
  schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  id: z.string(),
  titleKey: z.string(),
  firstScene: z.string(),
  firstSpawn: z.string(),
  scenes: z.array(z.string()).min(1),
  completeFlag: z.string(),
});
export type EpisodeManifest = z.infer<typeof EpisodeManifest>;

export const StringTable = z.record(z.string(), z.string());
export type StringTable = z.infer<typeof StringTable>;

export const AssetRecord = z.object({
  asset_id: z.string(),
  source_url: z.string(),
  creator: z.string(),
  original_title: z.string(),
  license: z.string(),
  download_date: z.string(),
  source_sha256: z.string(),
  modification_notes: z.string(),
  attribution: z.string(),
  release: z.string(),
  reviewer: z.string(),
  approval: z.enum(['approved', 'pending', 'rejected']),
  paths: z.string(),
});
export type AssetRecord = z.infer<typeof AssetRecord>;
