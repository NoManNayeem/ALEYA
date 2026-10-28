import * as pc from 'playcanvas';
import * as T from './textures';

export type AssetTier = 'high' | 'medium' | 'low';

interface MatDef {
  paint?: () => T.Sampler;
  diffuse?: string;
  tile?: [number, number];
  metal?: number;
  gloss?: number;
  bump?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  twoSided?: boolean;
  reflect?: number;
  unlit?: boolean;
  noFog?: boolean;
}

/** Material families used by scene manifests and prefabs. */
const DEFS: Record<string, MatDef> = {
  wood_plank: { paint: () => T.planks('#6d5038', 0.75), gloss: 1 },
  wood_old: { paint: () => T.grain('#4a3a2a', 0.5) },
  wood_dark: { paint: () => T.grain('#2c2118', 0.45) },
  wood_blue: { paint: () => T.paint2('#2f5d7a', '#4a3a2a', 0.45) },
  tin: { paint: () => T.corrugated('#7b8085', 0.35), metal: 0.6 },
  tin_rust: { paint: () => T.corrugated('#6f6a60', 0.75), metal: 0.5 },
  tin_blue: { paint: () => T.corrugated('#3f6f86', 0.45), metal: 0.4 },
  tin_red: { paint: () => T.corrugated('#8a3226', 0.5), metal: 0.4 },
  mud: { paint: () => T.mud('#3b2f24', 0.5), tile: [2, 2] },
  mud_wet: { paint: () => T.mud('#33291f', 0.85), tile: [2, 2], reflect: 0.4 },
  concrete: { paint: () => T.concrete('#6f6d68', 0.4) },
  concrete_wet: { paint: () => T.concrete('#5d5b57', 0.85), reflect: 0.35 },
  brick: { paint: () => T.brick() },
  plaster_teal: { paint: () => T.plaster('#3f7f78') },
  plaster_ochre: { paint: () => T.plaster('#b08a3e') },
  plaster_white: { paint: () => T.plaster('#b9b4a6') },
  plaster_pink: { paint: () => T.plaster('#a8665e') },
  shutter: { paint: () => T.shutter('#6e7377', 0.35), metal: 0.5 },
  shutter_green: { paint: () => T.shutter('#3b5b45', 0.45), metal: 0.4 },
  shutter_blue: { paint: () => T.shutter('#3d5a7a', 0.45), metal: 0.4 },
  tarp_blue: { paint: () => T.cloth('#24508a'), twoSided: true },
  tarp_red: { paint: () => T.cloth('#8a2a24'), twoSided: true },
  bamboo: { paint: () => T.bamboo(), tile: [1, 2] },
  reed: { paint: () => T.foliage('#556136'), twoSided: true },
  foliage: { paint: () => T.foliage('#1f2d1a'), twoSided: true },
  metal_dark: { paint: () => T.grain('#2b2d2f', 0.6, false), metal: 0.75 },
  metal_green: { paint: () => T.paint2('#2f5a46', '#5c2e15', 0.35), metal: 0.4 },
  hull_white: { paint: () => T.paint2('#c9c6bb', '#7a4a2a', 0.35), tile: [6, 1] },
  hull_red: { paint: () => T.paint2('#7a1f1a', '#3a1a10', 0.4), tile: [6, 1] },
  hull_blue: { paint: () => T.paint2('#1f3f6a', '#3a2a1a', 0.3), tile: [6, 1] },
  cloth_dark: { paint: () => T.cloth('#2a2a2c') },
  raincoat: { paint: () => T.cloth('#8f6a1e', 0.45, 0), gloss: 1.6 },
  jeans: { paint: () => T.cloth('#2a3442', 0.4) },
  kurta: { paint: () => T.cloth('#c4bdaa', 0.12, 0.3) },
  shawl: { paint: () => T.cloth('#5a4a3a') },
  lungi: { paint: () => T.check('#244a7a', '#1b3355', '#7a2a2a') },
  rope: { paint: () => T.grain('#7a6a4a', 0.3) },
  sandbag: { paint: () => T.burlap() },
  skin: { diffuse: '#7a5440', gloss: 0.42 },
  hair: { diffuse: '#141210', gloss: 0.5 },
  rubber: { diffuse: '#161616', gloss: 0.55 },
  glass: { diffuse: '#1a2024', gloss: 0.95, opacity: 0.35, reflect: 1 },
  brass: { diffuse: '#8a6a2a', metal: 0.9, gloss: 0.7 },
  paper: { diffuse: '#d8cfb6', gloss: 0.2 },
  chalkboard: { diffuse: '#1f2622', gloss: 0.3 },
  watcher: { diffuse: '#030304', gloss: 0.15 },
  marigold: { diffuse: '#d07a12', gloss: 0.3, emissive: '#3a1a00', emissiveIntensity: 1 },
  bulb_warm: { diffuse: '#000000', emissive: '#ffb066', emissiveIntensity: 6, unlit: true },
  bulb_cool: { diffuse: '#000000', emissive: '#cfe6ff', emissiveIntensity: 6, unlit: true },
  bulb_green: { diffuse: '#000000', emissive: '#7dffa8', emissiveIntensity: 4, unlit: true },
  bulb_dim: { diffuse: '#000000', emissive: '#40342a', emissiveIntensity: 1, unlit: true },
  far_light: { diffuse: '#000000', emissive: '#ffcf8a', emissiveIntensity: 8, unlit: true, noFog: true },
  silhouette: { diffuse: '#090c0e', gloss: 0.1, noFog: true },
  puddle: { diffuse: '#0b0c0d', gloss: 0.97, reflect: 1.2 },
};

export const MATERIAL_IDS = Object.keys(DEFS);

const TIER_SIZE: Record<AssetTier, number> = { high: 512, medium: 256, low: 128 };

/**
 * Shared material cache with per-scene reference counts. Materials survive scene
 * transitions while any loaded scene references them; unused ones are destroyed.
 */
export class MaterialLibrary {
  private mats = new Map<string, pc.StandardMaterial>();
  private textures = new Map<string, pc.Texture[]>();
  private users = new Map<string, Set<string>>();
  private custom = new Map<string, pc.StandardMaterial>();
  readonly size: number;

  constructor(private device: pc.GraphicsDevice, readonly tier: AssetTier) {
    this.size = TIER_SIZE[tier];
  }

  private tex(source: HTMLCanvasElement, srgb: boolean): pc.Texture {
    const t = new pc.Texture(this.device, {
      width: source.width,
      height: source.height,
      format: srgb ? pc.PIXELFORMAT_SRGBA8 : pc.PIXELFORMAT_RGBA8,
      mipmaps: true,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_REPEAT,
      addressV: pc.ADDRESS_REPEAT,
      anisotropy: this.tier === 'high' ? 8 : 2,
    });
    t.setSource(source);
    return t;
  }

  texture(source: HTMLCanvasElement, srgb = true): pc.Texture {
    return this.tex(source, srgb);
  }

  get(id: string, sceneId = 'shared'): pc.StandardMaterial {
    const c = this.custom.get(id);
    if (c) return c;
    let set = this.users.get(id);
    if (!set) this.users.set(id, (set = new Set()));
    set.add(sceneId);
    const existing = this.mats.get(id);
    if (existing) return existing;
    const def = DEFS[id] ?? DEFS.concrete;
    const m = new pc.StandardMaterial();
    m.name = id;
    m.useMetalness = true;
    m.metalness = def.metal ?? 0;
    m.gloss = Math.min(1, 0.55 * (def.gloss ?? 1));
    const texList: pc.Texture[] = [];
    if (def.paint) {
      const painted = T.paint(this.size, def.paint());
      const cTex = this.tex(painted.color, true);
      const nTex = this.tex(painted.normal, false);
      const gTex = this.tex(painted.gloss, false);
      texList.push(cTex, nTex, gTex);
      m.diffuseMap = cTex;
      m.normalMap = nTex;
      m.bumpiness = def.bump ?? 1;
      m.glossMap = gTex;
      m.glossMapChannel = 'r';
      m.gloss = Math.min(1, def.gloss ?? 1);
      if (def.tile) {
        const tv = new pc.Vec2(def.tile[0], def.tile[1]);
        m.diffuseMapTiling = tv;
        m.normalMapTiling = tv;
        m.glossMapTiling = tv;
      }
    } else if (def.diffuse) {
      m.diffuse = new pc.Color().fromString(def.diffuse);
      m.gloss = def.gloss ?? 0.4;
    }
    if (def.emissive) {
      m.emissive = new pc.Color().fromString(def.emissive);
      m.emissiveIntensity = def.emissiveIntensity ?? 1;
    }
    if (def.unlit) {
      m.useLighting = false;
      m.diffuse = new pc.Color(0, 0, 0);
    }
    if (def.noFog) m.useFog = false;
    if (def.opacity !== undefined) {
      m.opacity = def.opacity;
      m.blendType = pc.BLEND_NORMAL;
      m.depthWrite = false;
    }
    if (def.twoSided) {
      m.cull = pc.CULLFACE_NONE;
      m.twoSidedLighting = true;
    }
    if (def.reflect) m.reflectivity = def.reflect;
    m.update();
    this.mats.set(id, m);
    this.textures.set(id, texList);
    return m;
  }

  /** Register a one-off material (signage, posters) owned by a scene. */
  customMaterial(id: string, m: pc.StandardMaterial): pc.StandardMaterial {
    this.custom.set(id, m);
    return m;
  }

  releaseScene(sceneId: string): void {
    for (const [id, set] of this.users) {
      set.delete(sceneId);
      if (set.size === 0 && !set.has('shared')) {
        this.mats.get(id)?.destroy();
        this.textures.get(id)?.forEach((t) => t.destroy());
        this.mats.delete(id);
        this.textures.delete(id);
        this.users.delete(id);
      }
    }
    for (const [id, m] of this.custom) {
      if (id.startsWith(sceneId + ':')) {
        (m.diffuseMap as pc.Texture | null)?.destroy();
        m.destroy();
        this.custom.delete(id);
      }
    }
  }

  stats(): { materials: number; textures: number } {
    let t = 0;
    this.textures.forEach((l) => (t += l.length));
    return { materials: this.mats.size + this.custom.size, textures: t };
  }
}

/** Build a procedural night-sky environment (cubemap + prefiltered atlas) for reflections and ambient. */
export function buildEnvironment(
  device: pc.GraphicsDevice,
  top: [number, number, number],
  bottom: [number, number, number],
): { cubemap: pc.Texture; atlas: pc.Texture } {
  const size = 128;
  const horizon: [number, number, number] = [bottom[0] * 1.4, bottom[1] * 1.4, bottom[2] * 1.4];
  const side = (glowAt: number) => T.gradient(size, size, top, horizon, glowAt, [0.35, 0.22, 0.1]);
  const faces = [
    side(0.3), // +x
    side(0.7), // -x
    T.gradient(size, size, top, top), // +y
    T.gradient(size, size, [0.01, 0.012, 0.014], [0.01, 0.012, 0.014]), // -y (water/ground)
    side(-1), // +z
    side(0.5), // -z
  ];
  const cubemap = new pc.Texture(device, {
    cubemap: true,
    width: size,
    height: size,
    format: pc.PIXELFORMAT_SRGBA8,
    mipmaps: false,
  });
  cubemap.setSource(faces);
  const lighting = pc.EnvLighting.generateLightingSource(cubemap, { size: 64 });
  const atlas = pc.EnvLighting.generateAtlas(lighting, { size: 256, numReflectionSamples: 256, numAmbientSamples: 512 });
  lighting.destroy();
  return { cubemap, atlas };
}
