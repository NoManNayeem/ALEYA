#!/usr/bin/env python3 -I
"""
Builds ALEYA's realistic character GLBs from CC0 MakeHuman assets.

Inputs  (assets/source/makehuman/, pinned commit in SOURCE_COMMIT, CC0 1.0):
  3dobjs/base.obj, rigs/default.mhskel, rigs/default_weights.mhw, macrodetail targets
Outputs (assets/optimized/characters/):
  asha.glb, karim.glb, watcher.glb  -- skinned glTF 2.0, metres, Y-up, facing +Z

Pipeline per character:
  1. blend MakeHuman macro targets (ethnicity x gender x age, body shape)
  2. compute joints from helper-joint vertex groups, reduce 163 bones to a game rig
  3. tailor clothing from MakeHuman's own fitting shells (helper-tights/skirt/hair)
  4. export skinned GLB with named material slots that the runtime maps to PBR materials

Only the Python standard library is used. Source files are parsed as data, never executed.
Run:  python3 -I tools/asset-pipeline/build_characters.py
"""
import json
import math
import os
import struct
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'source', 'makehuman')
OUT = os.path.join(ROOT, 'assets', 'optimized', 'characters')

# Game rig: every other MakeHuman bone is merged into its nearest kept ancestor.
KEEP = [
    'root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head',
    'pelvis.L', 'upperleg01.L', 'upperleg02.L', 'lowerleg01.L', 'lowerleg02.L', 'foot.L',
    'pelvis.R', 'upperleg01.R', 'upperleg02.R', 'lowerleg01.R', 'lowerleg02.R', 'foot.R',
    'clavicle.L', 'shoulder01.L', 'upperarm01.L', 'upperarm02.L', 'lowerarm01.L', 'lowerarm02.L', 'wrist.L',
    'clavicle.R', 'shoulder01.R', 'upperarm01.R', 'upperarm02.R', 'lowerarm01.R', 'lowerarm02.R', 'wrist.R',
]

REGION = {
    'head': 'head', 'neck03': 'head', 'neck02': 'neck', 'neck01': 'neck',
    'spine01': 'torso', 'spine02': 'torso', 'spine03': 'torso', 'spine04': 'torso', 'spine05': 'torso', 'root': 'torso',
    'clavicle.L': 'torso', 'clavicle.R': 'torso', 'shoulder01.L': 'torso', 'shoulder01.R': 'torso',
    'pelvis.L': 'hip', 'pelvis.R': 'hip',
    'upperarm01.L': 'upperarm', 'upperarm02.L': 'upperarm', 'upperarm01.R': 'upperarm', 'upperarm02.R': 'upperarm',
    'lowerarm01.L': 'forearm', 'lowerarm02.L': 'forearm', 'lowerarm01.R': 'forearm', 'lowerarm02.R': 'forearm',
    'wrist.L': 'hand', 'wrist.R': 'hand',
    'upperleg01.L': 'thigh', 'upperleg02.L': 'thigh', 'upperleg01.R': 'thigh', 'upperleg02.R': 'thigh',
    'lowerleg01.L': 'shin', 'lowerleg02.L': 'shin', 'lowerleg01.R': 'shin', 'lowerleg02.R': 'shin',
    'foot.L': 'foot', 'foot.R': 'foot',
}


# --------------------------------------------------------------------------- parsing

def load_obj(path):
    verts, uvs, groups = [], [], {}
    cur = None
    with open(path, encoding='utf-8') as f:
        for line in f:
            if line.startswith('v '):
                p = line.split()
                verts.append([float(p[1]), float(p[2]), float(p[3])])
            elif line.startswith('vt '):
                p = line.split()
                uvs.append((float(p[1]), float(p[2])))
            elif line.startswith('g '):
                cur = line.split()[1]
            elif line.startswith('f '):
                corners = []
                for tok in line.split()[1:]:
                    parts = tok.split('/')
                    corners.append((int(parts[0]) - 1, int(parts[1]) - 1 if len(parts) > 1 and parts[1] else -1))
                groups.setdefault(cur, []).append(corners)
    return verts, uvs, groups


def load_target(path):
    deltas = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            if not line.strip() or line.startswith('#'):
                continue
            p = line.split()
            deltas.append((int(p[0]), float(p[1]), float(p[2]), float(p[3])))
    return deltas


def apply_targets(verts, recipe):
    out = [v[:] for v in verts]
    for name, w in recipe.items():
        if w == 0:
            continue
        for i, dx, dy, dz in load_target(os.path.join(SRC, f'targets_{name}.target')):
            out[i][0] += dx * w
            out[i][1] += dy * w
            out[i][2] += dz * w
    return out


# --------------------------------------------------------------------------- rig

def build_rig(verts, skel, raw_weights):
    bones = skel['bones']
    joints = skel['joints']

    def joint_pos(name):
        idx = joints[name]
        n = len(idx)
        return [sum(verts[i][k] for i in idx) / n for k in range(3)]

    def kept_ancestor(b):
        while b not in KEEP:
            b = bones[b]['parent']
        return b

    heads = {b: joint_pos(bones[b]['head']) for b in KEEP}
    tails = {b: joint_pos(bones[b]['tail']) for b in KEEP}
    parents = {b: (kept_ancestor(bones[b]['parent']) if bones[b]['parent'] else None) for b in KEEP}
    # merge weights into kept bones, keep top 4 per vertex
    per_vert = {}
    for bone, lst in raw_weights.items():
        if bone not in bones:
            continue
        kb = KEEP.index(kept_ancestor(bone))
        for vi, w in lst:
            d = per_vert.setdefault(vi, {})
            d[kb] = d.get(kb, 0.0) + w
    weights = {}
    for vi, d in per_vert.items():
        top = sorted(d.items(), key=lambda x: -x[1])[:4]
        s = sum(w for _, w in top) or 1.0
        weights[vi] = [(j, w / s) for j, w in top]
    return heads, tails, parents, weights


def descendants(root, parents):
    out = {root}
    changed = True
    while changed:
        changed = False
        for b, p in parents.items():
            if p in out and b not in out:
                out.add(b)
                changed = True
    return out


def rebake_arms_down(verts, heads, parents, weights, target_deg=9.0):
    """Re-pose MakeHuman's A-pose into an arms-down rest pose by linear-blend skinning,
    so runtime animation can use world-aligned axes with identity rest rotations."""
    for side, sign in (('L', 1.0), ('R', -1.0)):
        sh = heads[f'upperarm01.{side}']
        el = heads[f'lowerarm01.{side}']
        cur = math.degrees(math.atan2(abs(el[0] - sh[0]), -(el[1] - sh[1])))
        delta = math.radians((cur - target_deg)) * -sign  # rotate about +Z toward the body
        chain = descendants(f'upperarm01.{side}', parents)
        partial = {f'shoulder01.{side}': 0.35, f'clavicle.{side}': 0.12}

        def rot(v, amount):
            if amount == 0:
                return v
            a = delta * amount
            ca, sa = math.cos(a), math.sin(a)
            x, y = v[0] - sh[0], v[1] - sh[1]
            return [sh[0] + x * ca - y * sa, sh[1] + x * sa + y * ca, v[2]]

        bone_amount = {}
        for i, b in enumerate(KEEP):
            bone_amount[i] = 1.0 if b in chain else partial.get(b, 0.0)
        for vi, wl in weights.items():
            if vi >= len(verts):
                continue
            total = sum(w for j, w in wl if bone_amount.get(j, 0) > 0)
            if total == 0:
                continue
            v = verts[vi]
            acc = [0.0, 0.0, 0.0]
            for j, w in wl:
                r = rot(v, bone_amount.get(j, 0.0))
                for k in range(3):
                    acc[k] += r[k] * w
            verts[vi] = acc
        for b in chain:
            heads[b] = rot(heads[b], 1.0)


def dominant_region(weights, vi):
    w = weights.get(vi)
    if not w:
        return 'torso'
    return REGION[KEEP[w[0][0]]]


# --------------------------------------------------------------------------- geometry helpers

def tri_faces(faces):
    for f in faces:
        for k in range(1, len(f) - 1):
            yield (f[0], f[k], f[k + 1])


def vertex_normals(verts, tris):
    n = {}
    for a, b, c in tris:
        pa, pb, pc_ = verts[a[0]], verts[b[0]], verts[c[0]]
        u = [pb[i] - pa[i] for i in range(3)]
        v = [pc_[i] - pa[i] for i in range(3)]
        fn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        for corner in (a, b, c):
            acc = n.setdefault(corner[0], [0.0, 0.0, 0.0])
            for i in range(3):
                acc[i] += fn[i]
    for k, v in n.items():
        l = math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2) or 1.0
        n[k] = [v[0] / l, v[1] / l, v[2] / l]
    return n


class Prim:
    """One material slot. Vertices are (source vertex, uv) pairs with an optional displacement."""

    def __init__(self, material):
        self.material = material
        self.tris = []  # list of ((vi, ti), (vi, ti), (vi, ti), offset, transform-id)
        self.offsets = {}

    def add(self, tris, offset=0.0, xform=None):
        for t in tris:
            self.tris.append((t, offset, xform))


def build_character(name, recipe, height_m, tailor, extra_scale=(1.0, 1.0, 1.0)):
    verts0, uvs, groups = load_obj(os.path.join(SRC, '3dobjs', 'base.obj'))
    skel = json.load(open(os.path.join(SRC, 'rigs', 'default.mhskel'), encoding='utf-8'))
    raw_w = json.load(open(os.path.join(SRC, 'rigs', 'default_weights.mhw'), encoding='utf-8'))['weights']
    verts = apply_targets(verts0, recipe)

    # units: decimetres -> metres, feet on the ground, scaled to target height
    body_idx = sorted({c[0] for f in groups['body'] for c in f})
    ymin = min(verts[i][1] for i in body_idx)
    ymax = max(verts[i][1] for i in body_idx)
    s = height_m / (ymax - ymin)
    for v in verts:
        v[0] = v[0] * s * extra_scale[0]
        v[1] = (v[1] - ymin) * s * extra_scale[1]
        v[2] = v[2] * s * extra_scale[2]

    heads, tails, parents, weights = build_rig(verts, skel, raw_w)
    rebake_arms_down(verts, heads, parents, weights)
    prims = tailor(verts, groups, weights, heads)
    return write_glb(name, verts, uvs, weights, heads, parents, prims)


# --------------------------------------------------------------------------- tailoring

def faces_where(groups, group, weights, pred):
    return [f for f in groups[group] if pred([dominant_region(weights, c[0]) for c in f])]


def all_in(regs, allowed):
    return all(r in allowed for r in regs)


def any_in(regs, allowed):
    return any(r in allowed for r in regs)


def eye_frame(verts, groups):
    idx = sorted({c[0] for f in groups['helper-l-eye'] + groups['helper-r-eye'] for c in f})
    n = len(idx)
    return {'y': sum(verts[i][1] for i in idx) / n, 'z': sum(verts[i][2] for i in idx) / n, 'x': 0.0}


def eye_prims(verts, groups, dark='iris'):
    """Split each eyeball into sclera / iris / pupil by angle from the eye's forward (+Z) axis."""
    out = {'sclera': Prim('sclera'), dark: Prim(dark), 'pupil': Prim('pupil')}
    for g in ('helper-l-eye', 'helper-r-eye'):
        idx = sorted({c[0] for f in groups[g] for c in f})
        c = [sum(verts[i][k] for i in idx) / len(idx) for k in range(3)]
        for f in groups[g]:
            m = [sum(verts[x[0]][k] for x in f) / len(f) - c[k] for k in range(3)]
            l = math.sqrt(sum(v * v for v in m)) or 1
            cosang = m[2] / l
            zone = 'pupil' if cosang > 0.975 else dark if cosang > 0.87 else 'sclera'
            out[zone].add(tri_faces([f]))
    return list(out.values())


def face_verts_ok(verts, f, pred):
    return all(pred(verts[c[0]]) for c in f)


def scalp(e):
    """Hair-covered skull: above the brow at the front, down to ear level behind the face."""
    return lambda v: v[1] > e['y'] + 0.045 or (v[2] < e['z'] - 0.07 and v[1] > e['y'] - 0.05)


def hood_zone(e):
    return lambda v: v[1] > e['y'] + 0.055 or (v[2] < e['z'] - 0.04 and v[1] > e['y'] - 0.17)


def head_frame(verts, groups):
    idx = sorted({c[0] for f in groups['helper-hair'] for c in f})
    xs = [verts[i][0] for i in idx]
    ys = [verts[i][1] for i in idx]
    zs = [verts[i][2] for i in idx]
    return {'top': max(ys), 'bottom': min(ys), 'front': max(zs), 'back': min(zs), 'cz': (max(zs) + min(zs)) / 2, 'cy': (max(ys) + min(ys)) / 2, 'cx': (max(xs) + min(xs)) / 2}


def off_face(verts, f, hf, hairline=0.62, depth=0.15):
    """True when a face lies on the forehead/face front (below the hairline, toward the front)."""
    cy = sum(verts[c[0]][1] for c in f) / len(f)
    cz = sum(verts[c[0]][2] for c in f) / len(f)
    h = hf['top'] - hf['bottom']
    d = hf['front'] - hf['back']
    return cz > hf['cz'] + d * depth and cy < hf['bottom'] + h * hairline


def above(verts, f, y):
    return sum(verts[c[0]][1] for c in f) / len(f) > y


def tailor_asha(verts, groups, weights, heads):
    p = []
    head_c = heads['head']
    skin = Prim('skin')
    skin.add(tri_faces(faces_where(groups, 'body', weights, lambda r: any_in(r, {'head', 'hand'}) or all_in(r, {'neck', 'head'}))))
    p.append(skin)
    p += eye_prims(verts, groups)
    coat = Prim('raincoat')
    coat.add(tri_faces(faces_where(groups, 'helper-tights', weights, lambda r: any_in(r, {'torso', 'hip', 'upperarm', 'forearm', 'neck'}) and not any_in(r, {'head', 'hand'}))), offset=0.012)
    # raincoat skirt: the fitting skirt shell, trimmed just above the knee and lightly flared
    knee = heads['lowerleg01.L'][1]
    coat.add(tri_faces([f for f in groups['helper-skirt'] if above(verts, f, knee + 0.06)]), offset=0.02, xform='flare')
    p.append(coat)
    jeans = Prim('jeans')
    jeans.add(tri_faces(faces_where(groups, 'helper-tights', weights, lambda r: all_in(r, {'thigh', 'shin', 'hip'}) and any_in(r, {'thigh', 'shin'}))), offset=0.004)
    p.append(jeans)
    boots = Prim('rubber')
    boots.add(tri_faces(faces_where(groups, 'body', weights, lambda r: any_in(r, {'foot'}))), offset=0.012)
    p.append(boots)
    e = eye_frame(verts, groups)
    head_faces = [f for f in groups['body'] if any_in([dominant_region(weights, c[0]) for c in f], {'head', 'neck'})]
    hair = Prim('hair')
    hair.add(tri_faces([f for f in head_faces if face_verts_ok(verts, f, scalp(e))]), offset=0.008)
    hair.add(tri_faces([f for f in groups['helper-hair'] if all(verts[c[0]][2] < e['z'] - 0.09 for c in f)]), offset=0.003)
    p.append(hair)
    centre = [0.0, e['y'] + 0.02, e['z'] - 0.07]
    hood = Prim('raincoat')
    hood.add(tri_faces([f for f in head_faces if face_verts_ok(verts, f, hood_zone(e))]), offset=0.035, xform=('scale', centre, 1.17))
    p.append(hood)
    return p


def tailor_karim(verts, groups, weights, heads):
    p = []
    head_c = heads['head']
    skin = Prim('skin_old')
    skin.add(tri_faces(faces_where(groups, 'body', weights, lambda r: any_in(r, {'head', 'hand', 'foot'}) or all_in(r, {'neck', 'head'}))))
    p.append(skin)
    e = eye_frame(verts, groups)
    head_faces = [f for f in groups['body'] if any_in([dominant_region(weights, c[0]) for c in f], {'head', 'neck'})]
    beard_faces = [f for f in head_faces if face_verts_ok(verts, f, lambda v: v[1] < e['y'] - 0.065 and v[1] > e['y'] - 0.16 and v[2] > e['z'] - 0.045)]
    beard = Prim('beard')
    beard.add(tri_faces(beard_faces), offset=0.006)
    p.append(beard)
    p += eye_prims(verts, groups)
    kurta = Prim('kurta')
    kurta.add(tri_faces(faces_where(groups, 'helper-tights', weights, lambda r: any_in(r, {'torso', 'upperarm', 'forearm', 'neck'}) and not any_in(r, {'head', 'hand'}))), offset=0.014)
    knee = heads['lowerleg01.L'][1]
    kurta.add(tri_faces([f for f in groups['helper-skirt'] if above(verts, f, knee + 0.02)]), offset=0.03, xform='flare')
    p.append(kurta)
    lungi = Prim('lungi')
    lungi.add(tri_faces(groups['helper-skirt']), offset=0.018, xform=('lungi', heads['lowerleg02.L'][1]))
    lungi.add(tri_faces(faces_where(groups, 'helper-tights', weights, lambda r: all_in(r, {'thigh', 'shin', 'hip'}) and any_in(r, {'shin'}))), offset=0.03)
    p.append(lungi)
    shawl = Prim('shawl')
    shawl.add(tri_faces(faces_where(groups, 'helper-tights', weights, lambda r: all_in(r, {'torso', 'neck'}) and any_in(r, {'neck'}))), offset=0.03)
    p.append(shawl)
    cap_faces = [f for f in head_faces if face_verts_ok(verts, f, lambda v: v[1] > e['y'] + 0.075)]
    rest = [f for f in head_faces if face_verts_ok(verts, f, scalp(e)) and f not in cap_faces]
    cap = Prim('kurta')
    cap.add(tri_faces(cap_faces), offset=0.014)
    p.append(cap)
    hair = Prim('hair_grey')
    hair.add(tri_faces(rest), offset=0.005)
    p.append(hair)
    return p


def tailor_watcher(verts, groups, weights, heads):
    body = Prim('watcher')
    body.add(tri_faces(groups['body']))
    cape = Prim('watcher')
    cape.add(tri_faces(faces_where(groups, 'helper-tights', weights, lambda r: any_in(r, {'torso', 'upperarm', 'hip', 'thigh'}))), offset=0.03)
    cape.add(tri_faces(groups['helper-skirt']), offset=0.05, xform=('lungi', heads['lowerleg02.L'][1]))
    hood = Prim('watcher')
    e = eye_frame(verts, groups)
    head_faces = [f for f in groups['body'] if any_in([dominant_region(weights, c[0]) for c in f], {'head', 'neck'})]
    hood.add(tri_faces([f for f in head_faces if face_verts_ok(verts, f, hood_zone(e))]), offset=0.05, xform=('scale', [0.0, e['y'] + 0.02, e['z'] - 0.07], 1.2))
    eyes = Prim('eye_glow')
    eyes.add(tri_faces(groups['helper-l-eye'] + groups['helper-r-eye']))
    return [body, cape, hood, eyes]


# --------------------------------------------------------------------------- GLB writer

def displaced(verts, normals, vi, offset, xform):
    v = list(verts[vi])
    if xform and isinstance(xform, tuple) and xform[0] == 'scale':
        c, k = xform[1], xform[2]
        v = [c[i] + (v[i] - c[i]) * k for i in range(3)]
    n = normals.get(vi, [0, 0, 0])
    if xform == 'flare':
        flare = max(0.0, 1.0 - v[1] / 1.0) * 0.06
        offset += flare
    return [v[i] + n[i] * offset for i in range(3)]


def stretch_skirt(verts, groups, ankle_y):
    """Return per-vertex y remap for the skirt shell so its hem reaches ankle_y."""
    idx = sorted({c[0] for f in groups['helper-skirt'] for c in f})
    ys = [verts[i][1] for i in idx]
    top, bottom = max(ys), min(ys)
    return {i: top - (top - verts[i][1]) * (top - ankle_y) / max(1e-4, top - bottom) for i in idx}


def write_glb(name, verts, uvs, weights, heads, parents, prims):
    # per-primitive normals (computed on the source geometry of that primitive)
    accessors, views, chunks = [], [], []
    offset_bytes = 0

    def add_view(data, target=None):
        nonlocal offset_bytes
        pad = (-len(data)) % 4
        data += b'\x00' * pad
        views.append({'buffer': 0, 'byteOffset': offset_bytes, 'byteLength': len(data) - pad, **({'target': target} if target else {})})
        chunks.append(data)
        offset_bytes += len(data)
        return len(views) - 1

    def add_acc(data, ctype, count, typ, target=None, minmax=None):
        view = add_view(data, target)
        acc = {'bufferView': view, 'componentType': ctype, 'count': count, 'type': typ}
        if minmax:
            acc['min'], acc['max'] = minmax
        accessors.append(acc)
        return len(accessors) - 1

    materials = []
    mat_index = {}
    gl_prims = []
    total_v = 0
    lungi_map = None
    images, textures = [], []
    for prim in prims:
        if prim.material not in mat_index:
            mat_index[prim.material] = len(materials)
            mat = {'name': prim.material, 'pbrMetallicRoughness': {'baseColorFactor': [0.6, 0.6, 0.6, 1], 'metallicFactor': 0, 'roughnessFactor': 0.7}, 'doubleSided': True}
            if prim.material == 'eye_textured':
                with open(os.path.join(SRC, 'eyes', 'brown_eye.png'), 'rb') as f:
                    png = f.read()
                images.append({'bufferView': add_view(png), 'mimeType': 'image/png'})
                textures.append({'source': len(images) - 1, 'sampler': 0})
                mat['pbrMetallicRoughness'] = {'baseColorTexture': {'index': len(textures) - 1}, 'metallicFactor': 0, 'roughnessFactor': 0.15}
            materials.append(mat)
        tris_only = [t for t, _, _ in prim.tris]
        normals = vertex_normals(verts, tris_only)
        remap = {}
        pos, nor, uv, jnt, wgt, ind = [], [], [], [], [], []
        for (tri, off, xform) in prim.tris:
            for corner in tri:
                key = (corner[0], corner[1], off, str(xform))
                if key not in remap:
                    remap[key] = len(pos) // 3
                    vi = corner[0]
                    p = displaced(verts, normals, vi, off, xform)
                    if isinstance(xform, tuple) and xform[0] == 'lungi':
                        if lungi_map is None:
                            lungi_map = stretch_skirt(verts, GROUPS, xform[1])
                        if vi in lungi_map:
                            p[1] = lungi_map[vi] + (normals.get(vi, [0, 0, 0])[1] * off)
                            # widen toward the hem like a wrap skirt
                            k = 1.0 + max(0.0, (heads['upperleg02.L'][1] - p[1])) * 0.35
                            p[0] *= k
                            p[2] = heads['root'][2] + (p[2] - heads['root'][2]) * k
                    pos += p
                    nor += normals.get(vi, [0, 1, 0])
                    t = uvs[corner[1]] if corner[1] >= 0 else (0.0, 0.0)
                    uv += [t[0], 1.0 - t[1]]
                    w = weights.get(vi, [(0, 1.0)])
                    w = (w + [(0, 0.0)] * 4)[:4]
                    jnt += [j for j, _ in w]
                    wgt += [x for _, x in w]
                ind.append(remap[key])
        n = len(pos) // 3
        total_v += n
        mins = [min(pos[i::3]) for i in range(3)]
        maxs = [max(pos[i::3]) for i in range(3)]
        a_pos = add_acc(struct.pack(f'<{len(pos)}f', *pos), 5126, n, 'VEC3', 34962, (mins, maxs))
        a_nor = add_acc(struct.pack(f'<{len(nor)}f', *nor), 5126, n, 'VEC3', 34962)
        a_uv = add_acc(struct.pack(f'<{len(uv)}f', *uv), 5126, n, 'VEC2', 34962)
        a_j = add_acc(struct.pack(f'<{len(jnt)}H', *jnt), 5123, n, 'VEC4', 34962)
        a_w = add_acc(struct.pack(f'<{len(wgt)}f', *wgt), 5126, n, 'VEC4', 34962)
        a_i = add_acc(struct.pack(f'<{len(ind)}I', *ind), 5125, len(ind), 'SCALAR', 34963)
        gl_prims.append({'attributes': {'POSITION': a_pos, 'NORMAL': a_nor, 'TEXCOORD_0': a_uv, 'JOINTS_0': a_j, 'WEIGHTS_0': a_w}, 'indices': a_i, 'material': mat_index[prim.material]})

    # skeleton nodes: identity rest rotations, joints placed at bone heads
    nodes = [{'name': name, 'mesh': 0, 'skin': 0}]
    joint_nodes = []
    for b in KEEP:
        h = heads[b]
        par = parents[b]
        ph = heads[par] if par else [0.0, 0.0, 0.0]
        nodes.append({'name': b, 'translation': [h[i] - ph[i] for i in range(3)]})
        joint_nodes.append(len(nodes) - 1)
    for i, b in enumerate(KEEP):
        kids = [joint_nodes[j] for j, c in enumerate(KEEP) if parents[c] == b]
        if kids:
            nodes[joint_nodes[i]]['children'] = kids
    ibm = []
    for b in KEEP:
        h = heads[b]
        ibm += [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -h[0], -h[1], -h[2], 1]
    a_ibm = add_acc(struct.pack(f'<{len(ibm)}f', *ibm), 5126, len(KEEP), 'MAT4')
    gltf = {
        'asset': {'version': '2.0', 'generator': 'ALEYA build_characters.py (from CC0 MakeHuman assets)', 'copyright': 'CC0-1.0'},
        'scene': 0,
        'scenes': [{'nodes': [0, joint_nodes[0]]}],
        'nodes': nodes,
        'meshes': [{'name': name, 'primitives': gl_prims}],
        'skins': [{'joints': joint_nodes, 'skeleton': joint_nodes[0], 'inverseBindMatrices': a_ibm}],
        'materials': materials,
        **({'images': images, 'textures': textures, 'samplers': [{'magFilter': 9729, 'minFilter': 9987}]} if images else {}),
        'accessors': accessors,
        'bufferViews': views,
        'buffers': [{'byteLength': offset_bytes}],
        'extras': {'bones': KEEP, 'height': max(v[1] for v in verts[:13380])},
    }
    js = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    js += b' ' * ((-len(js)) % 4)
    binary = b''.join(chunks)
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary))
    glb += struct.pack('<II', len(js), 0x4E4F534A) + js
    glb += struct.pack('<II', len(binary), 0x004E4942) + binary
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{name}.glb')
    with open(path, 'wb') as f:
        f.write(glb)
    print(f'{name}: {total_v} verts, {sum(len(p["attributes"]) and 1 for p in gl_prims)} prims, {len(KEEP)} bones, {len(glb) / 1024:.0f} KB -> {os.path.relpath(path, ROOT)}')
    return path


GROUPS = None


def main():
    global GROUPS
    _, _, GROUPS = load_obj(os.path.join(SRC, '3dobjs', 'base.obj'))
    # South Asian appearance via MakeHuman's ethnicity blend (Bangladeshi characters)
    eth = {'asian': 0.42, 'african': 0.18, 'caucasian': 0.40}
    asha = {f'{r}-female-young': w for r, w in eth.items()}
    asha['universal-female-young-averagemuscle-minweight'] = 0.25
    build_character('asha', asha, 1.60, tailor_asha)
    old = 0.66
    karim = {}
    for r, w in eth.items():
        karim[f'{r}-male-old'] = w * old
        karim[f'{r}-male-young'] = w * (1 - old)
    karim['universal-male-old-minmuscle-minweight'] = 0.55
    build_character('karim', karim, 1.64, tailor_karim)
    watcher = {f'{r}-male-young': w for r, w in eth.items()}
    watcher['universal-male-young-averagemuscle-minweight'] = 1.0
    build_character('watcher', watcher, 2.35, tailor_watcher, extra_scale=(0.82, 1.0, 0.82))


if __name__ == '__main__':
    sys.exit(main())
