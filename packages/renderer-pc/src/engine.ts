import * as pc from 'playcanvas';
import type { AssetTier } from './materials';

export type QualityProfile = 'ultra' | 'high' | 'medium' | 'low';

export interface QualityConfig {
  renderScale: number;
  minScale: number;
  postFx: boolean;
  taa: boolean;
  ssao: boolean;
  bloom: number;
  volumetric: 'none' | 'spot' | 'all';
  shadows: boolean;
  shadowRes: number;
  rain: number;
  reedDensity: number;
  tier: AssetTier;
  maxPixelRatio: number;
}

/** Quality profiles (PRD §9). Degrade effects, then render scale, before texture tier. */
export const QUALITY: Record<QualityProfile, QualityConfig> = {
  ultra: { renderScale: 1, minScale: 0.85, postFx: true, taa: true, ssao: true, bloom: 0.03, volumetric: 'all', shadows: true, shadowRes: 2048, rain: 4500, reedDensity: 1, tier: 'high', maxPixelRatio: 2 },
  high: { renderScale: 0.92, minScale: 0.8, postFx: true, taa: true, ssao: false, bloom: 0.025, volumetric: 'spot', shadows: true, shadowRes: 1024, rain: 2800, reedDensity: 0.85, tier: 'high', maxPixelRatio: 1.5 },
  medium: { renderScale: 0.8, minScale: 0.7, postFx: true, taa: false, ssao: false, bloom: 0.02, volumetric: 'none', shadows: true, shadowRes: 512, rain: 1500, reedDensity: 0.6, tier: 'medium', maxPixelRatio: 1.25 },
  low: { renderScale: 0.68, minScale: 0.6, postFx: false, taa: false, ssao: false, bloom: 0, volumetric: 'none', shadows: false, shadowRes: 256, rain: 600, reedDensity: 0.4, tier: 'low', maxPixelRatio: 1 },
};

export interface StageEvents {
  contextLost?: () => void;
  contextRestored?: () => void;
}

/**
 * Engine-level, scene-independent stage: graphics device, app, camera and the
 * post-processing frame. Scenes are built under `world` and destroyed on exit.
 */
export class Stage {
  frame: pc.CameraFrame | null = null;
  quality: QualityConfig = QUALITY.high;
  profile: QualityProfile = 'high';
  dynamicResolution = true;
  private scale = 1;
  private ftAvg = 16.7;
  private overBudget = 0;
  private underBudget = 0;
  readonly world: pc.Entity;
  fpsCap = 0;
  private lastFrame = 0;
  private stats = { fps: 0, frames: 0, acc: 0 };

  private constructor(
    readonly app: pc.AppBase,
    readonly camera: pc.Entity,
    readonly deviceType: string,
  ) {
    this.world = new pc.Entity('world');
    app.root.addChild(this.world);
  }

  static async create(canvas: HTMLCanvasElement, opts: { preferWebGPU?: boolean; events?: StageEvents }): Promise<Stage> {
    const deviceTypes = opts.preferWebGPU ? [pc.DEVICETYPE_WEBGPU, pc.DEVICETYPE_WEBGL2] : [pc.DEVICETYPE_WEBGL2];
    const device = await pc.createGraphicsDevice(canvas, {
      deviceTypes,
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
    });
    const createOptions = new pc.AppOptions();
    createOptions.graphicsDevice = device;
    createOptions.componentSystems = [
      pc.RenderComponentSystem,
      pc.CameraComponentSystem,
      pc.LightComponentSystem,
      pc.ParticleSystemComponentSystem,
      pc.AnimComponentSystem,
    ];
    createOptions.resourceHandlers = [pc.TextureHandler, pc.ContainerHandler];
    const app = new pc.AppBase(canvas);
    app.init(createOptions);
    app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);
    const onResize = () => app.resizeCanvas();
    window.addEventListener('resize', onResize);

    const camera = new pc.Entity('camera');
    camera.addComponent('camera', {
      clearColor: new pc.Color(0.03, 0.035, 0.045),
      fov: 40,
      nearClip: 0.1,
      farClip: 260,
    });
    app.root.addChild(camera);

    const stage = new Stage(app, camera, device.deviceType);
    app.scene.lighting.shadowsEnabled = true;
    app.scene.lighting.shadowAtlasResolution = 2048;
    app.scene.lighting.cookiesEnabled = false;

    // WebGL context loss: surface recovery UI; PlayCanvas restores GPU resources on restore.
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      opts.events?.contextLost?.();
    });
    canvas.addEventListener('webglcontextrestored', () => opts.events?.contextRestored?.());
    app.start();
    return stage;
  }

  applyQuality(profile: QualityProfile): void {
    this.profile = profile;
    const q = (this.quality = QUALITY[profile]);
    const device = this.app.graphicsDevice;
    device.maxPixelRatio = Math.min(window.devicePixelRatio || 1, q.maxPixelRatio);
    this.app.resizeCanvas();
    this.app.scene.lighting.shadowsEnabled = q.shadows;
    this.app.scene.lighting.shadowAtlasResolution = q.shadowRes * 2;
    this.scale = q.renderScale;
    const cam = this.camera.camera!;
    if (q.postFx) {
      if (!this.frame) this.frame = new pc.CameraFrame(this.app, cam);
      const f = this.frame;
      f.rendering.toneMapping = pc.TONEMAP_ACES;
      f.rendering.renderTargetScale = this.scale;
      f.rendering.samples = q.taa ? 1 : 2;
      f.rendering.sharpness = q.taa ? 0.4 : 0.15;
      f.taa.enabled = q.taa;
      f.taa.jitter = 1;
      f.ssao.type = q.ssao ? pc.SSAOTYPE_LIGHTING : pc.SSAOTYPE_NONE;
      f.ssao.intensity = 0.5;
      f.ssao.radius = 0.6;
      f.ssao.samples = 12;
      f.bloom.intensity = q.bloom;
      f.bloom.blurLevel = 6;
      // colour grading renders black on some WebGL2 drivers in PlayCanvas 2.23; mood comes from lighting/fog instead
      f.grading.enabled = false;
      f.vignette.intensity = 0.45;
      f.vignette.inner = 0.45;
      f.vignette.outer = 1.1;
      f.vignette.curvature = 0.6;
      f.vignette.color = new pc.Color(0, 0, 0);
      f.volumetricFog.enabled = q.volumetric !== 'none';
      f.volumetricFog.localSpotLights = q.volumetric !== 'none';
      f.volumetricFog.localOmniLights = q.volumetric === 'all';
      f.volumetricFog.localIntensity = 0.55;
      f.volumetricFog.density = 0.012;
      f.volumetricFog.heightBase = 1.5;
      f.volumetricFog.heightFalloff = 0.12;
      f.volumetricFog.tint = new pc.Color(0.7, 0.75, 0.8);
      f.update();
    } else {
      this.frame?.destroy();
      this.frame = null;
      cam.toneMapping = pc.TONEMAP_ACES;
      cam.gammaCorrection = pc.GAMMA_SRGB;
    }
  }

  /** Per-frame bookkeeping: dynamic resolution with hysteresis. Returns false when the frame should be skipped (fps cap). */
  tick(dtSeconds: number): void {
    const ms = dtSeconds * 1000;
    this.ftAvg += (ms - this.ftAvg) * 0.05;
    this.stats.frames++;
    this.stats.acc += dtSeconds;
    if (this.stats.acc >= 1) {
      this.stats.fps = this.stats.frames / this.stats.acc;
      this.stats.frames = 0;
      this.stats.acc = 0;
    }
    if (!this.dynamicResolution || !this.frame) return;
    const target = this.fpsCap === 30 ? 33.3 : 16.7;
    if (this.ftAvg > target * 1.2) {
      this.overBudget += dtSeconds;
      this.underBudget = 0;
    } else if (this.ftAvg < target * 0.8) {
      this.underBudget += dtSeconds;
      this.overBudget = 0;
    } else {
      this.overBudget = this.underBudget = 0;
    }
    if (this.overBudget > 2 && this.scale > this.quality.minScale) {
      this.scale = Math.max(this.quality.minScale, this.scale - 0.05);
      this.frame.rendering.renderTargetScale = this.scale;
      this.overBudget = 0;
    } else if (this.underBudget > 4 && this.scale < this.quality.renderScale) {
      this.scale = Math.min(this.quality.renderScale, this.scale + 0.05);
      this.frame.rendering.renderTargetScale = this.scale;
      this.underBudget = 0;
    }
  }

  /** Optional 30 FPS cap (mobile-ready); implemented by skipping app updates. */
  shouldRender(now: number): boolean {
    if (!this.fpsCap) return true;
    const interval = 1000 / this.fpsCap;
    if (now - this.lastFrame < interval - 1) return false;
    this.lastFrame = now;
    return true;
  }

  get fps(): number {
    return this.stats.fps;
  }

  get currentScale(): number {
    return this.scale;
  }
}
