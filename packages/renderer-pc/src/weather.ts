import * as pc from 'playcanvas';
import type { LightingPreset } from '@aleya/content-schema';
import type { MaterialLibrary } from './materials';
import * as T from './textures';

/**
 * Rain (camera-local streak particles + ground splashes) and lightning.
 * Particle density scales with quality and the scene's rain amount. Lightning
 * honours the reduced-flash accessibility setting.
 */
export class Weather {
  private rain: pc.Entity;
  private splash: pc.Entity;
  private lightningLight: pc.Entity;
  private nextStrike = 8;
  private strikeT = -1;
  private amount = 0;
  reducedFlash = false;
  onThunder: ((delay: number, strength: number) => void) | null = null;
  /** 0..1 current lightning brightness, for UI/sky flash */
  flash = 0;
  private interval: [number, number] | null = null;

  constructor(private app: pc.AppBase, mats: MaterialLibrary, parent: pc.Entity) {
    const streakTex = mats.texture(T.streak(8, 64));
    const dotTex = mats.texture(T.softDot(32));
    this.rain = new pc.Entity('rain');
    this.rain.addComponent('particlesystem', {
      numParticles: 2000,
      lifetime: 1.1,
      rate: 0.0005,
      rate2: 0.001,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: new pc.Vec3(30, 0.5, 12),
      velocityGraph: new pc.CurveSet([
        [0, -1.6],
        [0, -15],
        [0, 0],
      ]),
      velocityGraph2: new pc.CurveSet([
        [0, -2.2],
        [0, -18],
        [0, 0.4],
      ]),
      scaleGraph: new pc.Curve([0, 0.016]),
      alphaGraph: new pc.Curve([0, 0.0, 0.1, 0.32, 0.9, 0.26, 1, 0]),
      colorGraph: new pc.CurveSet([
        [0, 0.7],
        [0, 0.75],
        [0, 0.85],
      ]),
      colorMap: streakTex,
      stretch: 0.028,
      alignToMotion: true,
      blendType: pc.BLEND_ADDITIVE,
      depthSoftening: 0,
      lighting: false,
      loop: true,
      preWarm: true,
    });
    parent.addChild(this.rain);

    this.splash = new pc.Entity('splash');
    this.splash.addComponent('particlesystem', {
      numParticles: 300,
      lifetime: 0.28,
      rate: 0.004,
      rate2: 0.008,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: new pc.Vec3(14, 0.02, 5),
      velocityGraph: new pc.CurveSet([
        [0, -0.3],
        [0, 1.2],
        [0, -0.3],
      ]),
      velocityGraph2: new pc.CurveSet([
        [0, 0.3],
        [0, 2.0],
        [0, 0.3],
      ]),
      scaleGraph: new pc.Curve([0, 0.012, 1, 0.03]),
      alphaGraph: new pc.Curve([0, 0.22, 1, 0]),
      colorMap: dotTex,
      blendType: pc.BLEND_ADDITIVE,
      lighting: false,
      loop: true,
    });
    parent.addChild(this.splash);

    this.lightningLight = new pc.Entity('lightning');
    this.lightningLight.addComponent('light', {
      type: 'directional',
      color: new pc.Color(0.75, 0.82, 1),
      intensity: 0,
      castShadows: false,
    });
    this.lightningLight.setEulerAngles(60, -40, 0);
    parent.addChild(this.lightningLight);
  }

  configure(preset: LightingPreset, particles: number): void {
    this.amount = preset.rain;
    this.interval = preset.lightning;
    const n = Math.round(particles * preset.rain);
    const ps = this.rain.particlesystem!;
    ps.numParticles = Math.max(1, n);
    this.rain.enabled = n > 30;
    const sp = this.splash.particlesystem!;
    sp.numParticles = Math.max(1, Math.round(300 * preset.rain * Math.min(1, particles / 2500)));
    this.splash.enabled = preset.rain > 0.2;
    ps.reset();
    ps.play();
    this.nextStrike = this.interval ? 4 + Math.random() * 6 : Infinity;
  }

  strike(): void {
    this.strikeT = 0;
    const delay = 0.4 + Math.random() * 2.2;
    this.onThunder?.(delay, 0.6 + Math.random() * 0.4);
  }

  update(dt: number, cameraPos: pc.Vec3, groundY: number, playerX: number): void {
    this.rain.setPosition(cameraPos.x + 2, cameraPos.y + 7, cameraPos.z - 10.5);
    this.splash.setPosition(playerX, groundY + 0.02, 0.3);
    if (this.interval) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.strike();
        this.nextStrike = this.interval[0] + Math.random() * (this.interval[1] - this.interval[0]);
      }
    }
    if (this.strikeT >= 0) {
      this.strikeT += dt;
      const t = this.strikeT;
      // double flash envelope; reduced-flash removes the strobe and dims it heavily
      let f = this.reducedFlash
        ? Math.max(0, 1 - t / 0.9) * 0.18
        : Math.max(0, 1 - t / 0.08) + Math.max(0, 1 - Math.abs(t - 0.22) / 0.07) * 0.7 + Math.max(0, 1 - (t - 0.3) / 0.6) * 0.25 * (t > 0.3 ? 1 : 0);
      f = Math.min(1.2, f);
      this.flash = f;
      this.lightningLight.light!.intensity = f * 2.4;
      if (t > 1.2) this.strikeT = -1;
    } else {
      this.flash = 0;
      this.lightningLight.light!.intensity = 0;
    }
    void this.amount;
    void this.app;
  }

  destroy(): void {
    this.rain.destroy();
    this.splash.destroy();
    this.lightningLight.destroy();
  }
}
