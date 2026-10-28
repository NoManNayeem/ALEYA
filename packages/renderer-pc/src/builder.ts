import * as pc from 'playcanvas';
import type { MaterialLibrary } from './materials';

type V3 = [number, number, number];

export interface PartOpts {
  rot?: V3;
  shadows?: boolean;
  receive?: boolean;
  /** texture world density: texture repeats per metre */
  uv?: number;
}

/**
 * Small helper for building procedural geometry. Boxes use world-scaled UVs so
 * textures tile at consistent density on any size; meshes are cached by size.
 */
export class Builder {
  private meshCache = new Map<string, pc.Mesh>();
  castShadows = true;

  constructor(
    readonly app: pc.AppBase,
    readonly mats: MaterialLibrary,
    readonly sceneId: string,
  ) {}

  get device(): pc.GraphicsDevice {
    return this.app.graphicsDevice;
  }

  mat(id: string): pc.StandardMaterial {
    return this.mats.get(id, this.sceneId);
  }

  group(parent: pc.Entity, pos: V3 = [0, 0, 0], rot?: V3, name = 'group'): pc.Entity {
    const e = new pc.Entity(name);
    e.setLocalPosition(pos[0], pos[1], pos[2]);
    if (rot) e.setLocalEulerAngles(rot[0], rot[1], rot[2]);
    parent.addChild(e);
    return e;
  }

  private place(e: pc.Entity, parent: pc.Entity, pos: V3, o?: PartOpts): pc.Entity {
    e.setLocalPosition(pos[0], pos[1], pos[2]);
    if (o?.rot) e.setLocalEulerAngles(o.rot[0], o.rot[1], o.rot[2]);
    parent.addChild(e);
    return e;
  }

  /** Axis-aligned box centred at pos with full size `size`. */
  box(parent: pc.Entity, pos: V3, size: V3, matId: string | pc.Material, o?: PartOpts): pc.Entity {
    const mesh = this.boxMesh(size, o?.uv ?? 0.5);
    const material = typeof matId === 'string' ? this.mat(matId) : matId;
    const e = new pc.Entity('box');
    e.addComponent('render', {
      meshInstances: [new pc.MeshInstance(mesh, material)],
      castShadows: (o?.shadows ?? false) && this.castShadows,
      receiveShadows: o?.receive ?? true,
    });
    return this.place(e, parent, pos, o);
  }

  prim(
    type: 'cylinder' | 'cone' | 'sphere' | 'capsule' | 'plane' | 'torus',
    parent: pc.Entity,
    pos: V3,
    scale: V3,
    matId: string | pc.Material,
    o?: PartOpts,
  ): pc.Entity {
    const e = new pc.Entity(type);
    e.addComponent('render', {
      type,
      material: typeof matId === 'string' ? this.mat(matId) : matId,
      castShadows: (o?.shadows ?? false) && this.castShadows,
      receiveShadows: o?.receive ?? true,
    });
    // PlayCanvas capsule primitive is 2 units tall; callers pass full height in metres
    e.setLocalScale(scale[0], type === 'capsule' ? scale[1] / 2 : scale[1], scale[2]);
    return this.place(e, parent, pos, o);
  }

  cyl(parent: pc.Entity, pos: V3, radius: number, height: number, mat: string | pc.Material, o?: PartOpts): pc.Entity {
    return this.prim('cylinder', parent, pos, [radius * 2, height, radius * 2], mat, o);
  }

  /** A pole between two points. */
  pole(parent: pc.Entity, a: V3, b: V3, radius: number, mat: string | pc.Material, o?: PartOpts): pc.Entity {
    const va = new pc.Vec3(...a);
    const vb = new pc.Vec3(...b);
    const mid = new pc.Vec3().add2(va, vb).mulScalar(0.5);
    const len = va.distance(vb);
    const e = this.cyl(parent, [mid.x, mid.y, mid.z], radius, len, mat, o);
    const dir = new pc.Vec3().sub2(vb, va).normalize();
    const q = new pc.Quat();
    const up = pc.Vec3.UP;
    const axis = new pc.Vec3().cross(up, dir);
    const angle = Math.acos(Math.max(-1, Math.min(1, up.dot(dir)))) * pc.math.RAD_TO_DEG;
    if (axis.length() < 1e-5) q.setFromEulerAngles(dir.y < 0 ? 180 : 0, 0, 0);
    else q.setFromAxisAngle(axis.normalize(), angle);
    e.setLocalRotation(q);
    return e;
  }

  /** Textured quad facing +z, with a dedicated material (signage, posters). */
  panel(parent: pc.Entity, pos: V3, w: number, h: number, canvas: HTMLCanvasElement, key: string, o?: PartOpts & { emissive?: number; gloss?: number }): pc.Entity {
    const tex = this.mats.texture(canvas, true);
    const m = new pc.StandardMaterial();
    m.diffuseMap = tex;
    m.useMetalness = true;
    m.metalness = 0;
    m.gloss = o?.gloss ?? 0.35;
    if (o?.emissive) {
      m.emissiveMap = tex;
      m.emissiveIntensity = o.emissive;
    }
    m.update();
    this.mats.customMaterial(`${this.sceneId}:${key}:${Math.random().toString(36).slice(2, 7)}`, m);
    const e = this.prim('plane', parent, pos, [w, 1, h], m, { ...o, rot: o?.rot ?? [90, 0, 0] });
    return e;
  }

  boxMesh(size: V3, uvPerMetre: number): pc.Mesh {
    const key = `${size.map((s) => s.toFixed(3)).join('x')}@${uvPerMetre}`;
    const cached = this.meshCache.get(key);
    if (cached) return cached;
    const [w, h, d] = size.map((s) => s / 2);
    const k = uvPerMetre;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    // face: normal, u axis, v axis, half sizes
    const faces: [V3, V3, V3, number, number, number][] = [
      [[0, 0, 1], [1, 0, 0], [0, 1, 0], w, h, d],
      [[0, 0, -1], [-1, 0, 0], [0, 1, 0], w, h, d],
      [[1, 0, 0], [0, 0, -1], [0, 1, 0], d, h, w],
      [[-1, 0, 0], [0, 0, 1], [0, 1, 0], d, h, w],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1], w, d, h],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1], w, d, h],
    ];
    for (const [n, u, v, hu, hv, hn] of faces) {
      const base = positions.length / 3;
      for (const [su, sv] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        positions.push(n[0] * hn + u[0] * su * hu + v[0] * sv * hv, n[1] * hn + u[1] * su * hu + v[1] * sv * hv, n[2] * hn + u[2] * su * hu + v[2] * sv * hv);
        normals.push(...n);
        uvs.push(((su + 1) / 2) * hu * 2 * k, ((sv + 1) / 2) * hv * 2 * k);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const mesh = this.meshFrom(positions, normals, uvs, indices);
    this.meshCache.set(key, mesh);
    return mesh;
  }

  meshFrom(positions: number[], normals: number[], uvs: number[], indices: number[]): pc.Mesh {
    const g = new pc.Geometry();
    g.positions = positions;
    g.normals = normals;
    g.uvs = uvs;
    g.indices = indices;
    g.tangents = pc.calculateTangents(positions, normals, uvs, indices);
    return pc.Mesh.fromGeometry(this.device, g);
  }

  meshEntity(parent: pc.Entity, mesh: pc.Mesh, matId: string | pc.Material, pos: V3 = [0, 0, 0], o?: PartOpts): pc.Entity {
    const e = new pc.Entity('mesh');
    e.addComponent('render', {
      meshInstances: [new pc.MeshInstance(mesh, typeof matId === 'string' ? this.mat(matId) : matId)],
      castShadows: (o?.shadows ?? false) && this.castShadows,
      receiveShadows: o?.receive ?? true,
    });
    return this.place(e, parent, pos, o);
  }

  destroy(): void {
    this.meshCache.forEach((m) => m.destroy());
    this.meshCache.clear();
  }
}

/** Seeded PRNG for deterministic prop scattering. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
