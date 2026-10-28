/**
 * ALEYA audio engine: bus mixer, procedural ambience/SFX/score synthesis, 3D emitters,
 * dialogue voice placeholders and ducking. All sound is synthesised at runtime with
 * Web Audio (original work, CC0) so no third-party audio is shipped or streamed.
 * Recorded masters can replace any cue by registering a buffer under the same id.
 */

export type Bus = 'master' | 'music' | 'ambience' | 'foley' | 'sfx' | 'dialogue' | 'ui';
export type Surface = 'wood' | 'mud' | 'concrete' | 'water' | 'metal';
export type Speaker = 'asha' | 'karim' | 'mira' | 'rafi' | 'caption';
export type Channel = 'direct' | 'radio' | 'archive' | 'thought';

type V3 = readonly [number, number, number];

interface Loop {
  stop(fade?: number): void;
  out: GainNode;
  panner?: PannerNode;
}

const NOTE = (semi: number, base = 146.83) => base * Math.pow(2, semi / 12); // D3 base

export class AudioEngine {
  readonly ctx: AudioContext;
  private buses = {} as Record<Bus, GainNode>;
  private comp: DynamicsCompressorNode;
  private noise: { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer };
  private reverb: ConvolverNode;
  private reverbSend: GainNode;
  private bed: { id: string; loop: Loop } | null = null;
  private emitters = new Map<string, Loop>();
  private music: { id: string; stop: (f?: number) => void } | null = null;
  private volumes: Record<Bus, number> = { master: 0.9, music: 0.7, ambience: 0.8, foley: 0.8, sfx: 0.85, dialogue: 1, ui: 0.6 };
  private muted = false;
  private dialogueBoost = false;
  private duckDepth = 1;
  private buffers = new Map<string, AudioBuffer>();
  unlocked = false;

  constructor() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.comp = c.createDynamicsCompressor();
    this.comp.connect(c.destination);
    for (const b of ['master', 'music', 'ambience', 'foley', 'sfx', 'dialogue', 'ui'] as Bus[]) {
      const g = c.createGain();
      this.buses[b] = g;
      if (b === 'master') g.connect(this.comp);
      else g.connect(this.buses.master ?? this.comp);
    }
    // ensure all buses route through master (master created first)
    for (const b of ['music', 'ambience', 'foley', 'sfx', 'dialogue', 'ui'] as Bus[]) {
      this.buses[b].disconnect();
      this.buses[b].connect(this.buses.master);
    }
    this.noise = { white: this.makeNoise('white'), pink: this.makeNoise('pink'), brown: this.makeNoise('brown') };
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.makeImpulse(3.2, 2.4);
    this.reverbSend = c.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.buses.sfx);
    this.setDynamicRange('standard');
    this.applyVolumes();
  }

  // ---------------------------------------------------------------- mixer

  async unlock(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => undefined);
    this.unlocked = this.ctx.state === 'running';
  }

  suspend(): void {
    void this.ctx.suspend().catch(() => undefined);
  }

  resume(): void {
    if (this.unlocked) void this.ctx.resume().catch(() => undefined);
  }

  setVolumes(v: Partial<Record<Bus, number>>, muted: boolean, dialogueBoost: boolean): void {
    Object.assign(this.volumes, v);
    this.muted = muted;
    this.dialogueBoost = dialogueBoost;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const t = this.ctx.currentTime;
    for (const [b, g] of Object.entries(this.buses) as [Bus, GainNode][]) {
      let v = this.volumes[b];
      if (b === 'master' && this.muted) v = 0;
      if (b === 'dialogue' && this.dialogueBoost) v *= 1.6;
      if ((b === 'music' || b === 'ambience' || b === 'sfx') && this.duckDepth < 1) v *= this.duckDepth;
      g.gain.setTargetAtTime(v, t, 0.08);
    }
  }

  /** Night: heavy compression for quiet listening; Headphones: wide dynamics. */
  setDynamicRange(preset: 'night' | 'standard' | 'headphones'): void {
    const p = { night: [-34, 12, 10], standard: [-18, 4, 6], headphones: [-6, 2, 12] }[preset];
    this.comp.threshold.value = p[0];
    this.comp.ratio.value = p[1];
    this.comp.knee.value = p[2];
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.25;
  }

  private duck(on: boolean): void {
    this.duckDepth = on ? (this.dialogueBoost ? 0.45 : 0.7) : 1;
    this.applyVolumes();
  }

  setListener(x: number, y: number, z: number): void {
    const l = this.ctx.listener;
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(x, t, 0.05);
      l.positionY.setTargetAtTime(y, t, 0.05);
      l.positionZ.setTargetAtTime(z, t, 0.05);
      l.forwardX.value = 0;
      l.forwardY.value = 0;
      l.forwardZ.value = -1;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(x, y, z);
    }
  }

  /** Register a decoded recording that replaces the synthesised cue of the same id. */
  registerBuffer(id: string, buf: AudioBuffer): void {
    this.buffers.set(id, buf);
  }

  // ---------------------------------------------------------------- building blocks

  private makeNoise(kind: 'white' | 'pink' | 'brown'): AudioBuffer {
    const len = this.ctx.sampleRate * 4;
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0,
        b1 = 0,
        b2 = 0,
        b3 = 0,
        b4 = 0,
        b5 = 0,
        b6 = 0,
        last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w * 0.5;
        else if (kind === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        } else {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        }
      }
    }
    return buf;
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private noiseSrc(kind: 'white' | 'pink' | 'brown', loop = true): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise[kind];
    s.loop = loop;
    s.loopStart = Math.random();
    s.start(this.ctx.currentTime, Math.random() * 3);
    return s;
  }

  private filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  private gain(v: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  private lfo(target: AudioParam, rate: number, depth: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.frequency.value = rate;
    const g = this.gain(depth);
    o.connect(g).connect(target);
    o.start();
    return o;
  }

  private panner(pos: V3, refDistance = 3, rolloff = 1.2): PannerNode {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = refDistance;
    p.maxDistance = 120;
    p.rolloffFactor = rolloff;
    if (p.positionX) {
      p.positionX.value = pos[0];
      p.positionY.value = pos[1];
      p.positionZ.value = pos[2];
    } else (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(pos[0], pos[1], pos[2]);
    return p;
  }

  private makeLoop(out: GainNode, nodes: AudioScheduledSourceNode[], timers: number[] = [], panner?: PannerNode): Loop {
    return {
      out,
      panner,
      stop: (fade = 1.5) => {
        const t = this.ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.linearRampToValueAtTime(0, t + fade);
        timers.forEach((id) => clearInterval(id));
        setTimeout(() => {
          nodes.forEach((n) => {
            try {
              n.stop();
            } catch {
              /* already stopped */
            }
          });
          out.disconnect();
        }, fade * 1000 + 100);
      },
    };
  }

  // ---------------------------------------------------------------- ambience

  private rainLayer(out: AudioNode, level: number, bright = 1): AudioScheduledSourceNode[] {
    const hiss = this.noiseSrc('pink');
    const hp = this.filter('highpass', 900 * bright);
    const lp = this.filter('lowpass', 7000);
    const g = this.gain(level);
    hiss.connect(hp).connect(lp).connect(g).connect(out);
    const o = this.lfo(g.gain, 0.07, level * 0.25);
    const body = this.noiseSrc('brown');
    const bp = this.filter('bandpass', 400, 0.6);
    const g2 = this.gain(level * 0.6);
    body.connect(bp).connect(g2).connect(out);
    return [hiss, body, o];
  }

  private bedNodes(id: string, out: GainNode): { nodes: AudioScheduledSourceNode[]; timers: number[] } {
    const nodes: AudioScheduledSourceNode[] = [];
    const timers: number[] = [];
    const river = (lvl: number) => {
      const n = this.noiseSrc('brown');
      const f = this.filter('lowpass', 380);
      const g = this.gain(lvl);
      n.connect(f).connect(g).connect(out);
      nodes.push(n, this.lfo(g.gain, 0.11, lvl * 0.4), this.lfo(f.frequency, 0.05, 120));
    };
    const wind = (lvl: number) => {
      const n = this.noiseSrc('pink');
      const f = this.filter('bandpass', 500, 1.2);
      const g = this.gain(lvl);
      n.connect(f).connect(g).connect(out);
      nodes.push(n, this.lfo(f.frequency, 0.13, 300), this.lfo(g.gain, 0.09, lvl * 0.5));
    };
    const insects = (lvl: number) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 4300;
      const f = this.filter('bandpass', 4300, 18);
      const g = this.gain(0);
      o.connect(f).connect(g).connect(out);
      o.start();
      nodes.push(o, this.lfo(g.gain, 22, lvl), this.lfo(o.frequency, 0.3, 200));
    };
    switch (id) {
      case 'bed_ghat':
        nodes.push(...this.rainLayer(out, 0.32));
        river(0.45);
        break;
      case 'bed_bazaar':
        nodes.push(...this.rainLayer(out, 0.26, 1.3));
        timers.push(this.randomTicks(out, 0.18, 120, 900));
        break;
      case 'bed_alley':
        nodes.push(...this.rainLayer(out, 0.18, 1.5));
        timers.push(this.randomTicks(out, 0.25, 80, 500));
        break;
      case 'bed_embankment':
        nodes.push(...this.rainLayer(out, 0.4, 0.8));
        wind(0.35);
        river(0.3);
        break;
      case 'bed_current':
        nodes.push(...this.rainLayer(out, 0.36, 0.8));
        wind(0.25);
        river(0.7);
        break;
      case 'bed_creek':
        nodes.push(...this.rainLayer(out, 0.14, 1.4));
        insects(0.012);
        wind(0.08);
        break;
      case 'bed_ferry':
        nodes.push(...this.rainLayer(out, 0.12, 1.6));
        river(0.25);
        timers.push(this.randomCreaks(out, 0.2));
        break;
      default:
        nodes.push(...this.rainLayer(out, 0.25));
    }
    return { nodes, timers };
  }

  /** Random short drip/tick transients. */
  private randomTicks(out: AudioNode, level: number, minMs: number, maxMs: number): number {
    const fire = () => {
      if (this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.frequency.setValueAtTime(1800 + Math.random() * 2400, t);
      o.frequency.exponentialRampToValueAtTime(600, t + 0.05);
      const g = this.gain(0);
      g.gain.setValueAtTime(level * (0.3 + Math.random() * 0.7), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.08);
    };
    return window.setInterval(() => {
      if (Math.random() < 0.6) fire();
    }, minMs + Math.random() * (maxMs - minMs));
  }

  private randomCreaks(out: AudioNode, level: number): number {
    return window.setInterval(() => {
      if (this.ctx.state !== 'running' || Math.random() > 0.35) return;
      this.creak(out, level * (0.4 + Math.random() * 0.6), 0.6 + Math.random() * 1.2);
    }, 1800);
  }

  private creak(out: AudioNode, level: number, dur: number): void {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    const base = 70 + Math.random() * 60;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * (1.2 + Math.random() * 0.4), t + dur);
    const f = this.filter('bandpass', 600, 4);
    const g = this.gain(0);
    g.gain.linearRampToValueAtTime(level, t + 0.1);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const am = this.ctx.createOscillator();
    am.frequency.value = 18 + Math.random() * 20;
    const amg = this.gain(level * 0.6);
    am.connect(amg).connect(g.gain);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    am.start(t);
    o.stop(t + dur + 0.1);
    am.stop(t + dur + 0.1);
  }

  setBed(id: string | null, fade = 2.5): void {
    if (this.bed?.id === id) return;
    this.bed?.loop.stop(fade);
    this.bed = null;
    if (!id) return;
    const out = this.gain(0);
    out.connect(this.buses.ambience);
    out.gain.linearRampToValueAtTime(1, this.ctx.currentTime + fade);
    const { nodes, timers } = this.bedNodes(id, out);
    this.bed = { id, loop: this.makeLoop(out, nodes, timers) };
  }

  // ---------------------------------------------------------------- 3D emitters

  private emitterNodes(cue: string, out: AudioNode): { nodes: AudioScheduledSourceNode[]; timers: number[] } {
    const nodes: AudioScheduledSourceNode[] = [];
    const timers: number[] = [];
    switch (cue) {
      case 'loop_river':
      case 'loop_current':
      case 'loop_culvert':
      case 'loop_wade': {
        const n = this.noiseSrc(cue === 'loop_wade' ? 'pink' : 'brown');
        const f = this.filter(cue === 'loop_culvert' ? 'bandpass' : 'lowpass', cue === 'loop_current' ? 900 : cue === 'loop_wade' ? 1200 : 500, 0.8);
        const g = this.gain(cue === 'loop_current' ? 1.1 : 0.7);
        n.connect(f).connect(g).connect(out);
        nodes.push(n, this.lfo(g.gain, 0.2, 0.25));
        break;
      }
      case 'loop_tin':
        timers.push(
          window.setInterval(() => {
            if (this.ctx.state !== 'running' || Math.random() > 0.4) return;
            this.metalHit(out, 0.25 + Math.random() * 0.3, 300 + Math.random() * 400);
          }, 700),
        );
        break;
      case 'loop_buzz': {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 100;
        const f = this.filter('lowpass', 900);
        const g = this.gain(0.05);
        o.connect(f).connect(g).connect(out);
        o.start();
        nodes.push(o, this.lfo(g.gain, 3.1, 0.02));
        break;
      }
      case 'loop_radio': {
        const n = this.noiseSrc('white');
        const f = this.filter('bandpass', 2200, 1.4);
        const g = this.gain(0.18);
        n.connect(f).connect(g).connect(out);
        const o = this.ctx.createOscillator();
        o.frequency.value = 1450;
        const og = this.gain(0.015);
        o.connect(og).connect(out);
        o.start();
        nodes.push(n, o, this.lfo(o.frequency, 0.4, 300), this.lfo(g.gain, 0.7, 0.08));
        break;
      }
      case 'loop_drip':
        timers.push(this.randomTicks(out, 0.35, 250, 900));
        break;
      case 'loop_frogs':
        timers.push(
          window.setInterval(() => {
            if (this.ctx.state !== 'running' || Math.random() > 0.5) return;
            this.croak(out);
          }, 600),
        );
        break;
      case 'loop_pulse': {
        const o = this.ctx.createOscillator();
        o.frequency.value = 55;
        const g = this.gain(0);
        o.connect(g).connect(out);
        o.start();
        nodes.push(o, this.lfo(g.gain, 0.25, 0.12));
        break;
      }
      case 'loop_hull':
        timers.push(this.randomCreaks(out, 0.5));
        break;
      case 'loop_tick':
        timers.push(window.setInterval(() => this.ctx.state === 'running' && this.click(out, 0.12, 3000), 1000));
        break;
    }
    return { nodes, timers };
  }

  setEmitter(id: string, cue: string, pos: V3, gain: number, active: boolean): void {
    const existing = this.emitters.get(id);
    if (!active) {
      if (existing) {
        existing.stop(1.2);
        this.emitters.delete(id);
      }
      return;
    }
    if (existing) return;
    const out = this.gain(0);
    const p = this.panner(pos, cue === 'loop_river' || cue === 'loop_current' ? 8 : 2.5);
    out.connect(p).connect(this.buses.ambience);
    out.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 1.2);
    const { nodes, timers } = this.emitterNodes(cue, out);
    this.emitters.set(id, this.makeLoop(out, nodes, timers, p));
  }

  clearEmitters(): void {
    this.emitters.forEach((l) => l.stop(0.8));
    this.emitters.clear();
  }

  // ---------------------------------------------------------------- one-shots

  private metalHit(out: AudioNode, level: number, freq: number): void {
    const t = this.ctx.currentTime;
    for (const mult of [1, 2.76, 5.4]) {
      const o = this.ctx.createOscillator();
      o.frequency.value = freq * mult;
      const g = this.gain(0);
      g.gain.setValueAtTime(level / mult, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.6 / mult);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.7);
    }
  }

  private croak(out: AudioNode): void {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 180 + Math.random() * 120;
    const f = this.filter('bandpass', 700, 3);
    const g = this.gain(0);
    for (let i = 0; i < 3; i++) {
      g.gain.setValueAtTime(0.06, t + i * 0.09);
      g.gain.setValueAtTime(0, t + i * 0.09 + 0.05);
    }
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.35);
  }

  private click(out: AudioNode, level: number, freq: number): void {
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise.white;
    const f = this.filter('bandpass', freq, 2);
    const g = this.gain(level);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.04);
    n.connect(f).connect(g).connect(out);
    n.start(t, Math.random() * 2);
    n.stop(t + 0.05);
  }

  private burst(out: AudioNode, kind: 'white' | 'pink' | 'brown', dur: number, level: number, f0: number, f1: number, type: BiquadFilterType = 'lowpass', attack = 0.01): void {
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise[kind];
    const f = this.filter(type, f0, 0.9);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.gain(0);
    g.gain.linearRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    n.connect(f).connect(g).connect(out);
    n.start(t, Math.random() * 2);
    n.stop(t + dur + 0.05);
  }

  private tone(out: AudioNode, type: OscillatorType, f0: number, f1: number, dur: number, level: number, attack = 0.01, delay = 0): void {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private horn(out: AudioNode, level: number, dur: number): void {
    const t = this.ctx.currentTime;
    const g = this.gain(0);
    g.gain.linearRampToValueAtTime(level, t + 0.6);
    g.gain.setValueAtTime(level, t + dur - 1.2);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const f = this.filter('lowpass', 700, 1.5);
    g.connect(f).connect(out);
    f.connect(this.reverbSend);
    for (const [fr, det] of [
      [98, 0],
      [98, 7],
      [147, -5],
      [196, 3],
    ]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      o.detune.value = det;
      const og = this.gain(0.22);
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  /** Play a one-shot cue, optionally positioned in 3D. */
  sfx(cue: string, pos?: V3, level = 1): void {
    if (this.ctx.state !== 'running') return;
    const out = this.gain(level);
    const bus = cue.startsWith('ui_') ? this.buses.ui : cue === 'footstep' || cue.startsWith('foley_') ? this.buses.foley : this.buses.sfx;
    if (pos) out.connect(this.panner(pos, cue.startsWith('horn') ? 30 : 4, 1)).connect(bus);
    else out.connect(bus);
    const rec = this.buffers.get(cue);
    if (rec) {
      const s = this.ctx.createBufferSource();
      s.buffer = rec;
      s.connect(out);
      s.start();
      return;
    }
    switch (cue) {
      case 'horn_far':
        this.horn(out, 0.5, 4.5);
        break;
      case 'horn_near':
        this.horn(out, 1.0, 3.6);
        break;
      case 'thunder':
        this.burst(out, 'brown', 4 + Math.random() * 2, 1.2, 900, 60, 'lowpass', 0.05);
        this.burst(out, 'brown', 1.2, 0.8, 2500, 200, 'lowpass', 0.005);
        break;
      case 'radio_burst':
        this.burst(out, 'white', 1.4, 0.5, 3200, 900, 'bandpass', 0.005);
        this.tone(out, 'sine', 1600, 600, 1.0, 0.08);
        break;
      case 'radio_click':
        this.click(out, 0.5, 2500);
        this.burst(out, 'white', 0.25, 0.25, 4000, 2000, 'bandpass');
        break;
      case 'radio_send':
        for (let i = 0; i < 10; i++) this.tone(out, 'square', 1200 + (i % 3) * 400, 1200 + (i % 3) * 400, 0.08, 0.05, 0.005, i * 0.11);
        break;
      case 'power_on':
        this.burst(out, 'brown', 0.5, 1.0, 400, 60);
        this.tone(out, 'sawtooth', 40, 100, 1.5, 0.12, 0.3);
        break;
      case 'spark':
        this.burst(out, 'white', 0.3, 0.6, 6000, 1500, 'highpass');
        this.click(out, 0.6, 5000);
        break;
      case 'gate_open':
        this.creak(out, 0.6, 1.6);
        this.metalHit(out, 0.4, 220);
        break;
      case 'plank_creak':
        this.creak(out, 0.5, 0.8);
        break;
      case 'camera_shutter':
        this.click(out, 0.7, 3500);
        setTimeout(() => this.click(out, 0.5, 2500), 70);
        break;
      case 'brick_scrape':
        this.burst(out, 'pink', 0.9, 0.6, 1800, 600, 'bandpass', 0.05);
        break;
      case 'sluice':
        this.burst(out, 'pink', 5, 0.9, 1500, 300, 'lowpass', 0.6);
        this.creak(out, 0.6, 1.4);
        break;
      case 'collapse':
        this.burst(out, 'brown', 3.5, 1.4, 600, 40, 'lowpass', 0.02);
        this.burst(out, 'pink', 1.5, 0.7, 2500, 300, 'lowpass', 0.02);
        break;
      case 'watcher_tele':
        this.tone(out, 'sine', 41, 38, 4, 0.5, 1.5);
        this.burst(out, 'pink', 3, 0.15, 3000, 800, 'bandpass', 1.5);
        break;
      case 'lock_open':
        this.metalHit(out, 0.7, 160);
        this.burst(out, 'brown', 0.4, 0.8, 600, 80);
        break;
      case 'tape_click':
        this.click(out, 0.7, 1800);
        this.tone(out, 'sine', 60, 60, 0.6, 0.05, 0.2);
        break;
      case 'footsteps_stairs':
        for (let i = 0; i < 5; i++) setTimeout(() => this.footstep('metal', 0.9), i * 520);
        break;
      case 'hull_groan':
        this.creak(out, 1.0, 3.5);
        this.burst(out, 'brown', 3, 1.0, 300, 50, 'lowpass', 0.3);
        break;
      case 'puzzle_success':
      case 'ui_success':
        [0, 3, 7].forEach((s, i) => this.tone(out, 'triangle', NOTE(s + 12), NOTE(s + 12), 0.9, 0.12, 0.01, i * 0.09));
        break;
      case 'puzzle_fail':
        this.tone(out, 'triangle', NOTE(1), NOTE(0), 0.5, 0.12);
        break;
      case 'ui_move':
        this.tone(out, 'sine', 900, 900, 0.05, 0.05);
        break;
      case 'ui_confirm':
        this.tone(out, 'sine', 700, 1100, 0.1, 0.07);
        break;
      case 'ui_back':
        this.tone(out, 'sine', 800, 500, 0.1, 0.06);
        break;
      case 'puzzle_click':
        this.click(out, 0.35, 2200);
        break;
      case 'lantern_click':
        this.click(out, 0.4, 3000);
        this.metalHit(out, 0.08, 900);
        break;
      default:
        this.click(out, 0.2, 2000);
    }
  }

  thunder(delay: number, strength: number): void {
    setTimeout(() => this.sfx('thunder', undefined, strength), delay * 1000);
  }

  footstep(surface: Surface, level = 1): void {
    if (this.ctx.state !== 'running') return;
    const out = this.gain(level * 0.8);
    out.connect(this.buses.foley);
    switch (surface) {
      case 'wood':
        this.burst(out, 'brown', 0.12, 0.7, 900, 150);
        this.tone(out, 'sine', 140, 90, 0.08, 0.15);
        break;
      case 'mud':
        this.burst(out, 'pink', 0.18, 0.5, 700, 200, 'lowpass', 0.02);
        break;
      case 'water':
        this.burst(out, 'white', 0.3, 0.35, 2500, 600, 'bandpass', 0.02);
        break;
      case 'metal':
        this.metalHit(out, 0.15, 260);
        this.burst(out, 'brown', 0.1, 0.5, 1200, 200);
        break;
      default:
        this.burst(out, 'white', 0.08, 0.35, 3000, 900, 'bandpass');
    }
  }

  // ---------------------------------------------------------------- dialogue

  /**
   * Voice placeholder until recorded Bangla performances are delivered: a soft,
   * wordless syllabic murmur shaped by speaker pitch and channel (radio, archive).
   * Returns a stop function. Recorded audio (registerBuffer('line:<id>')) is preferred.
   */
  voice(lineId: string, speaker: Speaker, channel: Channel, duration: number): () => void {
    this.duck(true);
    const stopDuck = () => this.duck(false);
    if (speaker === 'caption' || this.ctx.state !== 'running') {
      return stopDuck;
    }
    const rec = this.buffers.get(`line:${lineId}`);
    const out = this.gain(1);
    let chain: AudioNode = out;
    const extras: AudioScheduledSourceNode[] = [];
    if (channel === 'radio' || channel === 'archive') {
      const bp = this.filter('bandpass', channel === 'radio' ? 1600 : 1100, channel === 'radio' ? 1.1 : 0.6);
      out.connect(bp);
      chain = bp;
      const hiss = this.noiseSrc('white');
      const hf = this.filter('bandpass', 3000, 0.8);
      const hg = this.gain(channel === 'radio' ? 0.03 : 0.02);
      hiss.connect(hf).connect(hg).connect(this.buses.dialogue);
      extras.push(hiss);
      setTimeout(() => {
        try {
          hiss.stop();
        } catch {
          /* noop */
        }
      }, duration * 1000 + 200);
    }
    chain.connect(this.buses.dialogue);
    if (channel !== 'thought') chain.connect(this.reverbSend);
    if (rec) {
      const s = this.ctx.createBufferSource();
      s.buffer = rec;
      s.connect(out);
      s.start();
      return () => {
        try {
          s.stop();
        } catch {
          /* noop */
        }
        stopDuck();
      };
    }
    const pitch = { asha: 205, karim: 118, mira: 225, rafi: 255 }[speaker];
    const level = channel === 'thought' ? 0.0 : 0.05;
    if (level === 0) return stopDuck;
    const t0 = this.ctx.currentTime + 0.05;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = pitch;
    const f1 = this.filter('bandpass', 700, 4);
    const f2 = this.filter('bandpass', 1500, 5);
    const env = this.gain(0);
    o.connect(f1).connect(env);
    o.connect(f2).connect(env);
    env.connect(out);
    let t = t0;
    const end = t0 + Math.max(0.6, duration - 0.4);
    while (t < end) {
      const syl = 0.09 + Math.random() * 0.14;
      env.gain.setTargetAtTime(level * (0.5 + Math.random() * 0.5), t, 0.02);
      f1.frequency.setTargetAtTime(500 + Math.random() * 500, t, 0.03);
      f2.frequency.setTargetAtTime(1100 + Math.random() * 900, t, 0.03);
      o.frequency.setTargetAtTime(pitch * (0.9 + Math.random() * 0.25), t, 0.05);
      env.gain.setTargetAtTime(0, t + syl, 0.02);
      t += syl + 0.03 + (Math.random() < 0.15 ? 0.25 : 0.02);
    }
    o.start(t0);
    o.stop(end + 0.2);
    return () => {
      try {
        o.stop();
      } catch {
        /* noop */
      }
      extras.forEach((e) => {
        try {
          e.stop();
        } catch {
          /* noop */
        }
      });
      stopDuck();
    };
  }

  // ---------------------------------------------------------------- music

  private voiceNote(out: AudioNode, freq: number, start: number, dur: number, level: number, timbre: 'pluck' | 'pad' | 'flute' | 'bass'): void {
    const g = this.gain(0);
    g.connect(out);
    const oscs: OscillatorNode[] = [];
    const mk = (type: OscillatorType, f: number, det = 0, lvl = 1) => {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det;
      const og = this.gain(lvl);
      o.connect(og).connect(g);
      oscs.push(o);
    };
    if (timbre === 'pluck') {
      mk('triangle', freq);
      mk('sine', freq * 2, 3, 0.3);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(level, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0008, start + dur);
    } else if (timbre === 'flute') {
      mk('sine', freq);
      mk('triangle', freq, 6, 0.25);
      const vib = this.ctx.createOscillator();
      vib.frequency.value = 5;
      const vg = this.gain(freq * 0.006);
      vib.connect(vg);
      oscs.forEach((o) => vg.connect(o.frequency));
      vib.start(start);
      vib.stop(start + dur + 0.1);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(level, start + 0.25);
      g.gain.setValueAtTime(level, start + dur * 0.7);
      g.gain.linearRampToValueAtTime(0, start + dur);
    } else if (timbre === 'bass') {
      mk('sine', freq);
      mk('triangle', freq * 2, 0, 0.15);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(level, start + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    } else {
      mk('sawtooth', freq, -8, 0.3);
      mk('sawtooth', freq, 8, 0.3);
      mk('sine', freq / 2, 0, 0.5);
      const lp = this.filter('lowpass', 900);
      g.disconnect();
      g.connect(lp).connect(out);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(level, start + dur * 0.35);
      g.gain.linearRampToValueAtTime(0, start + dur);
    }
    oscs.forEach((o) => {
      o.start(start);
      o.stop(start + dur + 0.1);
    });
  }

  /**
   * Original generative cues. Melodies use a Bhairavi-like mode (komal re, ga, dha, ni)
   * in the spirit of river (bhatiyali) songs, played restrained and sparse.
   */
  setMusic(id: string | null): void {
    if (this.music?.id === id) return;
    this.music?.stop(2.5);
    this.music = null;
    if (!id || this.ctx.state !== 'running') return;
    const out = this.gain(0);
    out.connect(this.buses.music);
    out.connect(this.reverbSend);
    const now = this.ctx.currentTime;
    out.gain.linearRampToValueAtTime(1, now + 1.5);
    const mode = [0, 1, 3, 5, 7, 8, 10, 12, 13, 15];
    const timers: number[] = [];
    const schedule = (fn: (t: number) => number, first = 0.1) => {
      let next = this.ctx.currentTime + first;
      const tick = () => {
        while (next < this.ctx.currentTime + 1.0) next += fn(next);
      };
      tick();
      timers.push(window.setInterval(tick, 250));
    };
    const melody = (notes: (number | null)[], beat: number, timbre: 'pluck' | 'flute', level: number, loop: boolean, base?: number) => {
      let i = 0;
      schedule((t) => {
        if (i >= notes.length) {
          if (!loop) return 9999;
          i = 0;
          return beat * 4;
        }
        const n = notes[i++];
        if (n !== null) this.voiceNote(out, NOTE(mode[(n + mode.length * 4) % mode.length] + 12 * Math.floor(n / mode.length), base), t, beat * 1.8, level, timbre);
        return beat;
      });
    };
    const drone = (semi: number, level: number) => {
      const o1 = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      o1.frequency.value = NOTE(semi - 12);
      o2.frequency.value = NOTE(semi - 5);
      o1.type = o2.type = 'sine';
      const g = this.gain(level);
      o1.connect(g);
      o2.connect(g);
      g.connect(out);
      o1.start();
      o2.start();
      return [o1, o2];
    };
    const nodes: AudioScheduledSourceNode[] = [];
    switch (id) {
      case 'motif_opening':
        nodes.push(...drone(0, 0.05));
        melody([4, null, 3, 2, 1, null, 2, 1, 0, null, null, null, 4, 5, 4, 3, 2, null, 1, 0], 0.75, 'flute', 0.06, false);
        break;
      case 'swell_reveal':
        this.voiceNote(out, NOTE(0), now + 0.1, 12, 0.08, 'pad');
        this.voiceNote(out, NOTE(7), now + 2, 10, 0.05, 'pad');
        this.voiceNote(out, NOTE(13), now + 4, 9, 0.04, 'pad');
        break;
      case 'chase_pulse': {
        let k = 0;
        schedule(() => {
          const t = this.ctx.currentTime + 0.05;
          this.voiceNote(out, NOTE(k % 8 === 7 ? 1 : 0, 73.42), t, 0.3, 0.22, 'bass');
          if (k % 2 === 0) this.burst(out, 'brown', 0.15, 0.25, 300, 60);
          k++;
          return 0.3;
        });
        nodes.push(...drone(1, 0.03));
        break;
      }
      case 'near_silence':
        nodes.push(...drone(0, 0.025));
        break;
      case 'sustained_tone':
        this.voiceNote(out, NOTE(12), now + 0.1, 14, 0.05, 'pad');
        this.voiceNote(out, NOTE(19), now + 1.0, 13, 0.03, 'pad');
        break;
      case 'motif_ferry':
        nodes.push(...drone(-2, 0.04));
        melody([0, null, null, 1, null, null, 3, null, 1, null, 0, null, null, null], 1.2, 'pluck', 0.07, true);
        break;
      case 'motif_truth':
        nodes.push(...drone(0, 0.035));
        melody([7, 5, 4, 3, null, 4, 3, 1, 0, null, null, 3, 4, 5, 4, null, 3, 1, 0, null, null, null], 0.9, 'pluck', 0.07, true);
        break;
      case 'motif_end_A':
        nodes.push(...drone(0, 0.04));
        melody([0, 2, 4, 5, 7, null, 5, 4, null, 2, 4, 2, 0, null, null, null], 0.8, 'flute', 0.06, true);
        break;
      case 'motif_end_B':
        nodes.push(...drone(5, 0.04));
        melody([5, null, 4, 3, null, 4, 5, 7, null, null, 8, 7, 5, null, null, null], 0.9, 'flute', 0.06, true);
        break;
      case 'credits':
        nodes.push(...drone(0, 0.04));
        melody([4, 3, 2, 1, null, 2, 1, 0, null, 0, 1, 2, 4, null, 5, 4, 3, 2, 1, 0, null, null], 0.7, 'flute', 0.06, true);
        melody([0, null, null, null, -3, null, null, null, -2, null, null, null, 0, null, null, null], 0.7, 'pluck', 0.05, true);
        break;
    }
    this.music = { id, stop: this.makeLoop(out, nodes, timers).stop };
  }

  stopAll(): void {
    this.setBed(null, 0.5);
    this.clearEmitters();
    this.setMusic(null);
  }
}
