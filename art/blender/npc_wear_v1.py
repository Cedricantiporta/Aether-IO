"""Aether Survivor - NPC wear kit v1 (hair, beards, hats, clothes for the town's KayKit villagers; cute toy / Zelda: Echoes of Wisdom style).

Rebuild:   python3 art/blender/npc_wear_v1.py                    (needs `pip install bpy`; npx for compress + KayKit decompress)
           python3 art/blender/npc_wear_v1.py --no-render        (skip the preview renders)
           python3 art/blender/npc_wear_v1.py --no-compress      (keep only the raw glb)
           python3 art/blender/npc_wear_v1.py --only=hair,hats,clothes,lineup
           python3 art/blender/npc_wear_v1.py --closeup=hair_ponytail+hair_braid[,yaw,pitch,ortho,y,spacing]
Outputs:   public/models/characters/npc_wear_v1.glb (weld + meshopt medium).  Previews: $NPCWEAR_SHOTS (default art/renders/npcwear/):
           sheet_hair / sheet_beards / sheet_hats / sheet_clothes (pieces on mannequins) + lineup.png (8 dressed villagers).

Reuses the kit_v3 pipeline (B helpers, flat shared materials, COLOR_0 vertex gradients that MULTIPLY the material colour, weld + meshopt).
Piece = Empty root `<name>` + ONE child mesh `<name>_mesh`.  The root's ORIGIN IS THE ATTACH POINT of the KayKit bone the piece rides on
(head 1.241 / chest 0.973 / hips 0.406 m above the feet; the KayKit bones have no rotation, so bone-local axes = model axes: +Y up, +Z front).
Pieces are authored in CHARACTER space (y from the feet) and shifted by the bone origin when finished.  Which bone = the name prefix:
  head:  hair_* beard_* mustache_* hat_* helm_* veil_* mitre crown_* tiara bandana blush      chest: tunic dress apron smock robe_* cape_* vest sash scarf collar_* tabard pauldrons
  hips:  skirt_* pouch_* belt_*
Materials (flat, white = tinted per NPC by the game):  main (role A), second (role B), hair (role H), skin (role S);  fixed: cream, cloth_white,
gold, leather, steel, straw, ink, red, blue, green, pink, wood.  Every mesh has COLOR_0 (RGBA) that multiplies the material colour.
Head fit: the KayKit skull (hair removed) is x +-0.54, y 0..0.73, front z 0.45 (nose 0.53), back z -0.40; eyes y 0.30-0.43, mouth y ~0.15.
"""
import os, sys, math, random, zlib, subprocess, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Matrix, Vector
import kit_v3 as K
from kit_v3 import (T, Rx, Ry, Rz, Sc, I4, G, clamp, lerp, mixc, smooth, nz, spline, lin, descendants, tri_count, V)

ROOT = K.ROOT
OUT_DIR = os.path.join(ROOT, 'public/models/characters')
RAW = os.path.join(OUT_DIR, 'npc_wear_v1.raw.glb')
SHOTS = os.environ.get('NPCWEAR_SHOTS', os.path.join(ROOT, 'art/renders/npcwear'))
PI = math.pi
HEADY, CHESTY, HIPSY = 1.241, 0.973, 0.406
BONEY = {'head': HEADY, 'chest': CHESTY, 'hips': HIPSY}

# ---------------------------------------------------------------- palette (role mats are white: the game multiplies the role colour in)
PAL = {
    'main': '#ffffff', 'second': '#ffffff', 'hair': '#ffffff', 'skin': '#ffffff',
    'cream': '#fff4de', 'cloth_white': '#ffffff', 'gold': '#f7c548', 'leather': '#a8693a', 'steel': '#cdd5e2', 'straw': '#f3d27a',
    'ink': '#3a3446', 'red': '#e5483f', 'blue': '#4f7fe0', 'green': '#5bb261', 'pink': '#ff9db5', 'wood': '#b27a45',
}
ORDER = list(PAL)
K.PALETTE.clear(); K.PALETTE.update(PAL)
K.ORDER[:] = ORDER
K.MI.clear(); K.MI.update({k: i for i, k in enumerate(ORDER)})
K.EMISSIVE = ()
MI = K.MI
ROLE_MATS = ('main', 'second', 'hair', 'skin')


def make_materials():
    out = []
    for k in ORDER:
        m = bpy.data.materials.new(k)
        m.use_nodes = True
        bsdf = m.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = lin(PAL[k])
        bsdf.inputs['Roughness'].default_value = 0.8
        bsdf.inputs['Metallic'].default_value = 0.0
        m.diffuse_color = lin(PAL[k])
        m.use_backface_culling = False       # hair / cloth shells are single sided: show both faces
        out.append(m)
    return out


# ---------------------------------------------------------------- vertex colour gradients (multiplier of the material colour)
def g_up(dark=(0.66, 0.62, 0.66), light=(1.0, 1.0, 1.0), y0=None, y1=None, k=0.5):
    """darker underside / roots -> lighter top: mix of the height (y0..y1) and how much the face points up"""
    def f(co, n):
        u = clamp(0.5 + 0.5 * n.y)
        t = clamp((co.y - y0) / (y1 - y0)) if y0 is not None else u
        return mixc(dark, light, smooth(k * t + (1 - k) * u))
    return f


def g_h(y0, y1, c0, c1):
    return K.g_lin(y0, y1, c0, c1)


# ---------------------------------------------------------------- piece builder
class Wear(K.B):
    """one piece authored in character coordinates; finish_wear shifts it so the bone origin is the origin"""
    def __init__(s, name, bone):
        super().__init__(name, 0.0)
        s.bone = bone
        s.tilt = 0.0           # radians: tips the piece back about the head centre (hats: front brim up so the face stays visible)
        s.dgrad = g_up()

    def finish_wear(s):
        bm = s.bm
        if s.tilt:
            c = Vector((0, hy(0.45), 0.0))
            bmesh.ops.rotate(bm, cent=c, matrix=Rx(-s.tilt), verts=bm.verts)
        bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if not f.tag])
        bm.normal_update()
        layer = bm.loops.layers.color.new('Col')
        for f in bm.faces:
            nm = K.ORDER[f.material_index]
            fn = s.grads.get(nm) or s.dgrad
            for l in f.loops:
                l[layer] = fn(l.vert.co, l.vert.normal if f.smooth else f.normal)
        oy = BONEY[s.bone]
        bmesh.ops.translate(bm, vec=(0, -oy, 0), verts=bm.verts)
        bmesh.ops.transform(bm, matrix=Rx(PI / 2), verts=bm.verts)
        me = bpy.data.meshes.new(s.name)
        bm.to_mesh(me); bm.free()
        me.color_attributes.active_color = me.color_attributes['Col']; me.color_attributes.render_color_index = me.color_attributes.active_color_index
        for m in K.MATS: me.materials.append(m)
        root = bpy.data.objects.new(s.name, None)
        bpy.context.scene.collection.objects.link(root)
        ob = bpy.data.objects.new(s.name + '_mesh', me)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = root
        root['bone'] = s.bone
        return root


PIECES = {}          # name -> (builder fn)
def piece(name, bone):
    def deco(fn):
        PIECES[name] = (bone, fn)
        return fn
    return deco


def build_piece(name):
    bone, fn = PIECES[name]
    b = Wear(name, bone)
    fn(b)
    return b.finish_wear()


# ---------------------------------------------------------------- shared shape helpers (character coordinates, head local y from HEADY)
HY = HEADY      # neck joint: head-local y = 0 here


def hy(y): return HEADY + y     # head-local height -> character height


def dome(b, mat, c=(0.0, 0.42, 0.03), r=(0.585, 0.5, 0.56), rzb=0.5, hem=None, bump=None, nu=32, nv=14, flip=False, pole=1.0, n=2.6, tuck=0.0, flat=True):
    """hair / cap shell: part of a squarish ellipsoid (the KayKit head is a rounded box) from the top pole (v=0) down to a hem that depends
    on the azimuth.  theta 0 = front (+z), +90deg = +x.  c / r in HEAD-local units (y above the neck joint); r[2] = front depth, rzb = back depth;
    hem(theta) = head-local y of the lower edge; bump(theta, v) = radial multiplier offset (clumps)"""
    cx, cy, cz = c; rx, ry, rz = r

    def fn(u, v):
        th = 2 * PI * u
        yh = hem(th) if hem else 0.2
        cm = clamp((yh - cy) / ry, -1, 1)
        phi = math.acos(cm) * (v ** pole)
        dx, dy, dz = math.sin(phi) * math.sin(th), math.cos(phi), math.sin(phi) * math.cos(th)
        sr = 1.0 / (abs(dx) ** n + abs(dy) ** n + abs(dz) ** n) ** (1.0 / n)
        k = 1.0 + (bump(th, v, dx, dy, dz) if bump else 0.0) - tuck * smooth((v - 0.72) / 0.28)
        zr = rz if dz >= 0 else rzb
        return V(cx + rx * k * dx * sr, hy(cy + ry * dy * sr * (1 + (k - 1) * 0.5)), cz + zr * k * dz * sr)
    b.surf(fn, nu, nv, mat, close_u=True, smooth=not flat, flip=flip)


def lock(b, mat, pts, w0, w1, depth=0.55, segs=5, tip=0.12, sq=1.0, sub=2, ch=False):
    """tapered strand / lock along head-local points (list of (x, y, z)); width w0 -> w1 (radius), flattened by `depth`"""
    P = [V(p[0], p[1] if ch else hy(p[1]), p[2]) for p in pts]
    n = len(P)
    sp = spline(P, sub) if n > 2 else P
    m = len(sp)
    rad = []
    for i in range(m):
        t = i / (m - 1)
        r = lerp(w0, w1, t)
        if t > 1 - tip: r *= math.sqrt(max(0.0, (1 - t) / tip)) * 0.92 + 0.08
        rad.append(max(r, 0.004))
    b.tube(sp, rad, mat, segs=segs, smooth=True, cap=True, sq=sq)


def ball(b, mat, p, r, sq=(1, 1, 1), seg=12, rings=8, rot=None):
    b.ball(V(p[0], hy(p[1]), p[2]), r, mat, sq=sq, seg=seg, rings=rings, rot=rot)


def blob(b, mat, p, r, sq=(1, 1, 1), amp=0.1, seed=0.0, seg=12, rings=8, rot=None):
    b.blob(V(p[0], hy(p[1]), p[2]), r, mat, sq=sq, seg=seg, rings=rings, amp=amp, seed=seed, rot=rot)


def hair_grad(b, y0=0.2, y1=0.95):
    b.grads['hair'] = g_up((0.56, 0.52, 0.56), (1.0, 1.0, 1.0), hy(y0), hy(y1), 0.45)
    b.grads['skin'] = g_up((0.93, 0.9, 0.9), (1.0, 1.0, 1.0), hy(y0), hy(y1), 0.4)
    b.grads['main'] = g_up((0.62, 0.6, 0.66), (1.0, 1.0, 1.0), hy(y0), hy(y1), 0.5)
    b.grads['second'] = g_up((0.7, 0.68, 0.7), (1.0, 1.0, 1.0), hy(y0), hy(y1), 0.5)
    b.dgrad = g_up((0.72, 0.7, 0.72), (1.0, 1.0, 1.0), hy(y0), hy(y1), 0.5)


def hem_const(front, side, back, spread=0.5, wob=None):
    """hem profile: head-local y at the front / sides (ears) / back, smoothly blended; wob(theta) adds the locks / scallops"""
    def f(th):
        c = math.cos(th); s = abs(math.sin(th))
        # front: c=1; sides: |s|=1; back: c=-1
        if c >= 0: y = lerp(side, front, smooth(c ** spread))
        else: y = lerp(side, back, smooth((-c) ** spread))
        if wob: y += wob(th)
        return y
    return f


def scallop(n, amp, phase=0.0, front_only=False):
    def f(th):
        w = 1.0
        if front_only: w = clamp(math.cos(th) * 2.0 - 0.2)
        return -amp * abs(math.sin(n * th * 0.5 + phase)) * w
    return f


# ================================================================= HAIR (all on the head bone; material `hair` = role H)
class Hd:
    """the cranial surface the hair rides on (a squarish ellipsoid hugging the KayKit head) + helpers to lay locks along it.
    theta 0 = front (+z), +90deg = +x; v 0 = crown (top), 1 = hem, > 1 continues under the hem.  Everything in head-local units."""
    def __init__(s, c=(0.0, 0.40, 0.03), r=(0.57, 0.41, 0.55), rzb=0.50, hem=None, n=2.6, tuck=0.0):
        s.c, s.r, s.rzb, s.hem, s.n, s.tuck = c, r, rzb, hem or (lambda th: 0.3), n, tuck

    def pt(s, th, v):
        cx, cy, cz = s.c; rx, ry, rz = s.r
        cm = clamp((s.hem(th) - cy) / ry, -1, 1)
        phi = min(math.acos(cm) * v, PI * 0.97)
        dx, dy, dz = math.sin(phi) * math.sin(th), math.cos(phi), math.sin(phi) * math.cos(th)
        sr = 1.0 / (abs(dx) ** s.n + abs(dy) ** s.n + abs(dz) ** s.n) ** (1.0 / s.n)
        zr = rz if dz >= 0 else s.rzb
        k = 1.0 - s.tuck * smooth((v - 0.72) / 0.28)
        p = V(cx + rx * k * dx * sr, cy + ry * dy * sr, cz + zr * k * dz * sr)
        nrm = V((p.x - cx) / rx ** 2, (p.y - cy) / ry ** 2, (p.z - cz) / zr ** 2).normalized()
        return p, nrm

    def cap(s, b, mat='hair', nu=30, nv=9, flat=False, bump=None, puff=True):
        def fn(u, v):
            th = 2 * PI * u
            p, nrm = s.pt(th, v)
            if bump: p = p + nrm * bump(th, v)
            return V(p.x, hy(p.y), p.z)
        b.surf(fn, nu, nv, mat, close_u=True, smooth=not flat, flip=True)
        if puff:
            cx, cy, cz = s.c; rx, ry, rz = s.r
            b.ball(V(cx, hy(cy + ry * 0.93) + 0.02, cz - 0.02), 0.34, mat, sq=(1.0, 0.32, 1.0), seg=12, rings=6)

    def strand(s, b, th0, v0, th1, v1, w0=0.1, w1=0.02, lift=0.045, flare=0.0, tip=0.4, bend=0.0, n=3, mat='hair', segs=5, lift1=None):
        pts = []
        for i in range(n + 1):
            t = i / n
            th = lerp(th0, th1, t) + bend * math.sin(PI * t)
            p, nrm = s.pt(th, lerp(v0, v1, t))
            l = lift + ((lift1 if lift1 is not None else lift) - lift) * t + flare * t * t
            pts.append((p.x + nrm.x * l, p.y + nrm.y * l, p.z + nrm.z * l))
        lock(b, mat, pts, w0, w1, tip=tip, segs=segs)

    def radial(s, b, count, v0=0.12, v1=1.08, w0=0.1, w1=0.018, twist=0.16, th_from=0.0, th_to=2 * PI, skip=None, rng=None, lift=0.05, flare=0.012, tip=0.45, jit=0.05):
        rng = rng or random.Random(3)
        for i in range(count):
            th = th_from + (th_to - th_from) * (i + 0.5) / count + rng.uniform(-jit, jit)
            if skip and skip(th): continue
            s.strand(b, th - twist * 0.5, v0 + rng.uniform(0, 0.08), th + twist, v1 + rng.uniform(-0.1, 0.06), w0 * 1.2, w1, lift, flare, tip, bend=rng.uniform(-0.06, 0.06))


def hair_head(b, hem, **kw):
    H = Hd(hem=hem, **kw)
    return H


def strip(b, mat, fn_xy, nu, nv, flip=False, smooth_=True):
    b.surf(lambda u, v: V(*fn_xy(u, v)), nu, nv, mat, smooth=smooth_, flip=flip)


def hem_front_dip(front, side, back, spread=0.5, tips=0, amp=0.0, ph=0.0):
    base = hem_const(front, side, back, spread)
    def f(th):
        y = base(th)
        if tips and math.cos(th) > -0.1: y -= amp * abs(math.sin(tips * th * 0.5 + ph)) * clamp(math.cos(th) * 2 + 0.2)
        return y
    return f


@piece('hair_short_tousled', 'head')
def _(b):
    hair_grad(b)
    H = Hd(hem=hem_const(0.58, 0.44, 0.27))
    H.cap(b)
    rng = random.Random(5)
    H.radial(b, 9, v0=0.1, v1=1.06, w0=0.12, w1=0.02, twist=0.28, skip=lambda t: abs(math.sin(t / 2)) < 0.3 and False, rng=rng)
    # fringe: short locks over the brow, flicking to one side
    for k, th in enumerate((-0.95, -0.5, -0.1, 0.3, 0.75, 1.15)):
        H.strand(b, th, 0.28, th + 0.12 * (1 if k % 2 else -1), 1.02 + 0.03 * (k % 3), 0.1, 0.012, lift=0.05, lift1=0.07, tip=0.5, bend=0.08)
    # cowlicks
    for (x, z, dx, dz, h) in ((0.02, 0.0, 0.08, -0.04, 1.02), (0.2, -0.12, 0.18, -0.06, 0.98), (-0.16, -0.16, -0.2, -0.04, 0.96)):
        lock(b, 'hair', [(x, 0.78, z), (x + dx * 0.5, 0.9, z + dz * 0.5), (x + dx, h, z + dz)], 0.1, 0.012, tip=0.35)


@piece('hair_side_part', 'head')
def _(b):
    hair_grad(b)
    H = Hd(hem=hem_const(0.6, 0.44, 0.24))
    H.cap(b)
    rng = random.Random(7)
    H.radial(b, 7, v0=0.12, v1=1.06, w0=0.12, w1=0.02, twist=-0.3, th_from=PI * 0.45, th_to=PI * 2.0, rng=rng)
    # the swept fringe: big overlapping locks from a parting (left of centre) over the forehead to the right ear
    for (x0, y0, z0, x1, y1, z1, x2, y2, z2, w) in (
            (-0.2, 0.84, 0.2, 0.05, 0.84, 0.5, 0.5, 0.5, 0.42, 0.17),
            (-0.14, 0.86, 0.1, 0.22, 0.84, 0.46, 0.56, 0.38, 0.28, 0.15),
            (-0.1, 0.86, 0.0, 0.3, 0.88, 0.34, 0.58, 0.28, 0.1, 0.13)):
        lock(b, 'hair', [(x0, y0, z0), (x1, y1, z1), (x2, y2, z2)], w, 0.02, tip=0.42, segs=6)
    for (x0, y0, z0, x1, y1, z1, x2, y2, z2) in ((-0.2, 0.8, 0.28, -0.38, 0.66, 0.44, -0.5, 0.46, 0.38), (-0.2, 0.84, 0.1, -0.44, 0.64, 0.24, -0.58, 0.4, 0.14)):
        lock(b, 'hair', [(x0, y0, z0), (x1, y1, z1), (x2, y2, z2)], 0.11, 0.02, tip=0.4)
    lock(b, 'hair', [(0.0, 0.96, 0.0), (0.12, 1.0, -0.12), (0.3, 0.92, -0.3)], 0.08, 0.012, tip=0.5)


@piece('hair_spiky_kid', 'head')
def _(b):
    hair_grad(b)
    H = Hd(hem=hem_const(0.62, 0.46, 0.3), r=(0.56, 0.4, 0.54))
    H.cap(b)
    rng = random.Random(4)
    H.radial(b, 8, v0=0.1, v1=1.0, w0=0.1, w1=0.02, twist=0.15, rng=rng, flare=0.06)
    # a crown of spikes sweeping back and up
    for i in range(9):
        a = 2 * PI * i / 9 + 0.2
        r0 = 0.3
        x0, z0 = math.sin(a) * r0, math.cos(a) * r0 * 0.9 - 0.02
        h = 1.14 + 0.1 * rng.random()
        lock(b, 'hair', [(x0, 0.76, z0), (x0 * 1.5, 0.96, z0 * 1.4 - 0.06), (x0 * 2.0, h, z0 * 1.9 - 0.16)], 0.14, 0.01, tip=0.55)
    lock(b, 'hair', [(0.0, 0.82, 0.3), (0.0, 0.98, 0.46), (0.0, 1.08, 0.64)], 0.13, 0.01, tip=0.55)     # front tuft
    for sx in (-1, 1):
        lock(b, 'hair', [(sx * 0.3, 0.78, 0.38), (sx * 0.44, 0.88, 0.46), (sx * 0.6, 0.98, 0.5)], 0.11, 0.01, tip=0.55)


@piece('hair_long_straight', 'head')
def _(b):
    hair_grad(b, -0.5, 0.95)
    H = Hd(hem=hem_const(0.6, 0.32, 0.16), rzb=0.52)
    H.cap(b)
    rng = random.Random(9)
    H.radial(b, 9, v0=0.12, v1=1.02, w0=0.12, w1=0.03, twist=0.1, rng=rng, flare=0.0, th_from=PI * 0.35, th_to=PI * 1.65)
    # front fringe: straight locks across the brow
    for k, th in enumerate((-0.85, -0.45, -0.1, 0.25, 0.6, 0.95)):
        H.strand(b, th * 0.9, 0.3, th * 1.0 + 0.05, 1.04, 0.1, 0.02, lift=0.05, lift1=0.065, tip=0.4)
    # long curtains at the sides (behind the ears) and a back sheet with a pointed hem
    for sx in (-1, 1):
        b.surf(lambda u, v, sx=sx: V(sx * (0.5 + 0.12 * u + 0.05 * v), hy(0.36 - 0.8 * v), lerp(0.2, -0.3, u) * (1 - 0.1 * v)), 5, 8, 'hair', smooth=True, flip=(sx > 0))
    def back(u, v):
        x = lerp(-0.55, 0.55, u) * (1 + 0.1 * v)
        tipv = 0.0 + 0.12 * abs(math.sin(u * PI * 5.5))
        return V(x, hy(0.3 - (0.78 + tipv) * v), -0.48 - 0.12 * math.sin(math.pi * u) * v - 0.1 * v)
    b.surf(back, 16, 8, 'hair', smooth=True, flip=True)
    for sx in (-1, 1):
        lock(b, 'hair', [(sx * 0.42, 0.62, 0.44), (sx * 0.54, 0.4, 0.4), (sx * 0.58, 0.14, 0.3), (sx * 0.56, -0.2, 0.18), (sx * 0.52, -0.42, 0.08)], 0.1, 0.03, tip=0.3)


@piece('hair_ponytail', 'head')
def _(b):
    hair_grad(b, -0.5, 0.95)
    H = Hd(hem=hem_const(0.58, 0.45, 0.45), r=(0.565, 0.41, 0.54))
    H.cap(b)
    rng = random.Random(12)
    H.radial(b, 8, v0=0.1, v1=1.04, w0=0.11, w1=0.02, twist=0.28, rng=rng)
    for k, th in enumerate((-0.85, -0.4, 0.0, 0.4, 0.85)):
        H.strand(b, th, 0.3, th + 0.1, 1.03, 0.12, 0.012, lift=0.05, lift1=0.07, tip=0.45, bend=0.05)
    ball(b, 'second', (0, 0.66, -0.52), 0.14, sq=(1.0, 0.75, 1.0))
    lock(b, 'hair', [(0, 0.68, -0.52), (0, 0.55, -0.78), (0, 0.22, -0.88), (0.02, -0.14, -0.8), (0.14, -0.36, -0.64)], 0.21, 0.03, tip=0.3)
    lock(b, 'hair', [(0.09, 0.68, -0.5), (0.2, 0.5, -0.74), (0.24, 0.15, -0.8), (0.22, -0.12, -0.7)], 0.11, 0.02, tip=0.3)
    lock(b, 'hair', [(-0.09, 0.68, -0.5), (-0.2, 0.5, -0.74), (-0.22, 0.2, -0.8), (-0.2, -0.04, -0.7)], 0.1, 0.02, tip=0.3)
    for sx in (-1, 1):
        lock(b, 'hair', [(sx * 0.36, 0.78, 0.4), (sx * 0.5, 0.56, 0.45), (sx * 0.56, 0.3, 0.36)], 0.08, 0.02, tip=0.35)


@piece('hair_twin_buns', 'head')
def _(b):
    hair_grad(b)
    H = Hd(hem=hem_const(0.6, 0.45, 0.33))
    H.cap(b)
    rng = random.Random(14)
    H.radial(b, 8, v0=0.1, v1=1.04, w0=0.11, w1=0.02, twist=0.28, rng=rng)
    for k, th in enumerate((-0.8, -0.35, 0.0, 0.35, 0.8)):
        H.strand(b, th, 0.3, th * 1.1, 1.03, 0.1, 0.012, lift=0.05, lift1=0.07, tip=0.45)
    for sx in (-1, 1):
        blob(b, 'hair', (sx * 0.42, 0.98, -0.06), 0.24, sq=(1, 0.95, 1), amp=0.05, seed=sx, seg=10, rings=8)
        ball(b, 'second', (sx * 0.35, 0.82, -0.04), 0.17, sq=(1.15, 0.36, 1.15), seg=10, rings=6)       # ribbon / tie
        ball(b, 'second', (sx * 0.52, 0.86, 0.04), 0.075, seg=8, rings=6)
        lock(b, 'hair', [(sx * 0.42, 0.66, 0.4), (sx * 0.52, 0.46, 0.43), (sx * 0.57, 0.26, 0.34)], 0.07, 0.018, tip=0.35)


@piece('hair_braid', 'head')
def _(b):
    hair_grad(b, -0.4, 0.95)
    H = Hd(hem=hem_const(0.6, 0.45, 0.36))
    H.cap(b)
    rng = random.Random(16)
    H.radial(b, 8, v0=0.1, v1=1.04, w0=0.11, w1=0.02, twist=0.28, rng=rng)
    for k, th in enumerate((-0.8, -0.35, 0.0, 0.35, 0.8)):
        H.strand(b, th, 0.3, th * 1.1, 1.03, 0.1, 0.012, lift=0.05, lift1=0.07, tip=0.45)
    # one thick braid over the shoulder (chain of overlapping lobes), tied with a ribbon
    pts = [(0.0, 0.5, -0.52), (0.1, 0.3, -0.66), (0.16, 0.08, -0.66), (0.18, -0.12, -0.6), (0.2, -0.3, -0.54), (0.2, -0.46, -0.48)]
    sp = spline([V(p[0], hy(p[1]), p[2]) for p in pts], 2)
    n = len(sp)
    for i, p in enumerate(sp):
        t = i / (n - 1)
        r = lerp(0.15, 0.075, t)
        b.ball(p + V(0.035 * (1 if i % 2 else -1), 0, 0), r, 'hair', sq=(1.05, 0.9, 1.05), seg=8, rings=6)
    ball(b, 'second', (0.2, -0.5, -0.47), 0.12, sq=(1, 0.5, 1), seg=8, rings=6)
    for sx in (-1, 1):
        lock(b, 'hair', [(sx * 0.4, 0.64, 0.4), (sx * 0.5, 0.44, 0.43), (sx * 0.55, 0.24, 0.34)], 0.075, 0.018, tip=0.35)


@piece('hair_curly', 'head')
def _(b):
    hair_grad(b, 0.05, 1.05)
    rng = random.Random(11)
    H = Hd(hem=hem_const(0.56, 0.36, 0.26), r=(0.56, 0.4, 0.52))
    H.cap(b, nu=20, nv=6)
    pts = []
    for i in range(26):
        th = rng.uniform(0, 2 * PI); v = rng.uniform(0.02, 0.9)
        if abs(th - 0) < 0.45 and v > 0.7: continue
        p, nrm = H.pt(th, v)
        q = p + nrm * 0.07
        pts.append((q.x, q.y, q.z, rng.uniform(0.15, 0.22)))
    for (x, y, z, r) in pts:
        blob(b, 'hair', (x, y, z), r, amp=0.12, seed=x * 9, seg=9, rings=6)
    for x in (-0.3, -0.1, 0.1, 0.3):
        blob(b, 'hair', (x, 0.68 + 0.04 * (abs(x) < 0.2), 0.44), 0.14, amp=0.1, seed=x * 5, seg=9, rings=6)


@piece('hair_bald_fringe', 'head')
def _(b):
    # bald crown (skin colour, closes the open KayKit skull) + a ring of hair from ear to ear round the back
    hair_grad(b, 0.0, 0.95)
    H = Hd(c=(0, 0.40, 0.03), r=(0.555, 0.34, 0.5), rzb=0.45, hem=hem_const(0.6, 0.42, 0.4))
    H.cap(b, mat='skin', nu=24, nv=8, puff=False)
    for sx in (-1, 1):
        lock(b, 'hair', [(sx * 0.5, 0.54, 0.2), (sx * 0.56, 0.4, -0.05), (sx * 0.52, 0.3, -0.3), (sx * 0.3, 0.22, -0.5), (0.0, 0.2, -0.54)], 0.13, 0.13, tip=0.0)
        lock(b, 'hair', [(sx * 0.5, 0.44, -0.14), (sx * 0.53, 0.3, -0.16), (sx * 0.52, 0.12, -0.1)], 0.07, 0.015, tip=0.4)


@piece('hair_swept_elder', 'head')
def _(b):
    hair_grad(b, -0.15, 0.95)
    H = Hd(c=(0, 0.42, 0.0), r=(0.575, 0.41, 0.55), rzb=0.57, hem=hem_const(0.72, 0.46, 0.06))
    H.cap(b, bump=lambda th, v: 0.022 * math.sin(9 * th + 4 * v) * v, nu=36, nv=10, puff=False)
    # swept back from the high brow: long soft locks following the dome from front to nape
    for i in range(7):
        x = -0.42 + i * 0.14
        q = (x / 0.5) ** 2
        lock(b, 'hair', [(x * 0.85, 0.72 + 0.1 * (1 - q), 0.5 - 0.3 * q), (x, 0.9 - 0.34 * q, 0.14 - 0.1 * q), (x * 1.1, 0.8 - 0.36 * q, -0.36 - 0.06 * q), (x * 1.0, 0.46, -0.62), (x * 0.9, 0.12, -0.6)], 0.11, 0.03, tip=0.3)
    for sx in (-1, 1):
        lock(b, 'hair', [(sx * 0.52, 0.5, 0.0), (sx * 0.57, 0.34, -0.14), (sx * 0.54, 0.14, -0.2)], 0.08, 0.02, tip=0.35)


@piece('hair_bob', 'head')
def _(b):
    hair_grad(b, 0.0, 0.95)
    H = Hd(hem=hem_const(0.6, 0.2, 0.18, spread=0.7), r=(0.58, 0.42, 0.56), rzb=0.54, tuck=0.12)
    H.cap(b, nv=12)
    rng = random.Random(18)
    H.radial(b, 9, v0=0.1, v1=1.05, w0=0.11, w1=0.04, twist=0.12, rng=rng, flare=0.0)
    for k, th in enumerate((-0.9, -0.5, -0.15, 0.2, 0.55, 0.95)):
        H.strand(b, th, 0.3, th * 1.05, 1.03, 0.1, 0.03, lift=0.05, lift1=0.065, tip=0.2)


@piece('hair_pigtails', 'head')
def _(b):
    hair_grad(b, -0.1, 0.95)
    H = Hd(hem=hem_const(0.6, 0.45, 0.33))
    H.cap(b)
    rng = random.Random(20)
    H.radial(b, 8, v0=0.1, v1=1.04, w0=0.11, w1=0.02, twist=0.28, rng=rng)
    for k, th in enumerate((-0.8, -0.35, 0.0, 0.35, 0.8)):
        H.strand(b, th, 0.3, th * 1.1, 1.03, 0.1, 0.012, lift=0.05, lift1=0.07, tip=0.45)
    for sx in (-1, 1):
        ball(b, 'second', (sx * 0.52, 0.52, -0.12), 0.11, sq=(0.8, 1, 1), seg=8, rings=6)
        lock(b, 'hair', [(sx * 0.54, 0.5, -0.12), (sx * 0.74, 0.3, -0.16), (sx * 0.8, 0.04, -0.12), (sx * 0.72, -0.2, -0.04)], 0.17, 0.03, tip=0.3)


# ================================================================= BEARDS (head bone)
def beard_shell(b, mat, top, bottom, rx=0.5, rz=0.46, push=0.06, a_max=105, nu=14, nv=7, jut=0.1, narrow=0.3, flat=False):
    """a shell hugging the jaw from ear to ear.  top(a) / bottom(a) = head-local y of the upper / lower edge at azimuth a (rad, 0 = front)"""
    def fn(u, v):
        a = math.radians(a_max) * (2 * u - 1)
        yt, yb = top(a), bottom(a)
        y = lerp(yt, yb, v)
        k = 1 - narrow * v * v
        x = (rx + push) * math.sin(a) * k
        z = 0.03 + (rz + push) * math.cos(a) * (1 - 0.1 * v * v) + jut * v * math.cos(a) ** 2
        return V(x, hy(y), z)
    b.surf(fn, nu, nv, mat, smooth=not flat, flip=True)


def beard_grad(b):
    b.grads['hair'] = g_up((0.6, 0.57, 0.6), (1.0, 1.0, 1.0), hy(-0.5), hy(0.3), 0.6)
    b.dgrad = b.grads['hair']


@piece('beard_full', 'head')
def _(b):
    beard_grad(b)
    beard_shell(b, 'hair', lambda a: 0.36 - 0.1 * math.cos(a) ** 3, lambda a: 0.0 - 0.2 * math.cos(a) ** 2 + 0.1 * (1 - math.cos(a)) - 0.07 * abs(math.sin(4 * a)) * math.cos(a), rx=0.47, rz=0.43, push=0.075, nu=24, nv=7, narrow=0.22, jut=0.14)
    # moustache + chin tuft
    for sx in (-1, 1):
        lock(b, 'hair', [(sx * 0.03, 0.2, 0.52), (sx * 0.2, 0.19, 0.52), (sx * 0.33, 0.1, 0.42)], 0.1, 0.04, tip=0.2)
    ball(b, 'hair', (0, -0.15, 0.46), 0.14, sq=(1.1, 1.0, 0.8), seg=10, rings=7)


@piece('beard_goatee', 'head')
def _(b):
    beard_grad(b)
    lock(b, 'hair', [(0, 0.1, 0.46), (0, -0.04, 0.5), (0, -0.2, 0.46), (0, -0.28, 0.42)], 0.16, 0.02, tip=0.55)
    ball(b, 'hair', (0, 0.07, 0.45), 0.13, sq=(1.15, 0.8, 0.7), seg=10, rings=7)
    for sx in (-1, 1):
        lock(b, 'hair', [(sx * 0.03, 0.2, 0.52), (sx * 0.18, 0.2, 0.52), (sx * 0.3, 0.14, 0.45)], 0.06, 0.02, tip=0.3)


@piece('beard_wizard_long', 'head')
def _(b):
    beard_grad(b)
    beard_shell(b, 'hair', lambda a: 0.38 - 0.1 * math.cos(a) ** 3, lambda a: 0.05 - 0.25 * math.cos(a) ** 2, rx=0.46, rz=0.42, push=0.07, nu=18, nv=5, narrow=0.0, jut=0.1)
    # the long flowing part down the chest: three tapering lobes
    def lobe(u, v):
        wdt = 0.5 * (1 - 0.7 * v) * (1 + 0.1 * math.sin(v * 8))
        x = (2 * u - 1) * wdt
        y = hy(-0.12 - 0.75 * v + 0.12 * (1 - abs(2 * u - 1)) * v * 0.0)
        z = 0.5 + 0.1 * (1 - (2 * u - 1) ** 2) - 0.05 * v
        return V(x, y - 0.2 * v * (abs(2 * u - 1) < 0.4) * 0, z)
    b.surf(lobe, 10, 10, 'hair', smooth=True, flip=True)
    for sx in (-1, 1):
        lock(b, 'hair', [(sx * 0.03, 0.2, 0.52), (sx * 0.22, 0.2, 0.53), (sx * 0.38, 0.06, 0.44), (sx * 0.42, -0.12, 0.38)], 0.1, 0.03, tip=0.25)
    lock(b, 'hair', [(0, -0.1, 0.55), (0, -0.4, 0.58), (0, -0.75, 0.56)], 0.14, 0.02, tip=0.5)


@piece('mustache_walrus', 'head')
def _(b):
    beard_grad(b)
    ball(b, 'hair', (0, 0.2, 0.5), 0.15, sq=(1.5, 0.8, 0.8), seg=10, rings=7)
    for sx in (-1, 1):
        lock(b, 'hair', [(sx * 0.06, 0.19, 0.53), (sx * 0.22, 0.17, 0.54), (sx * 0.36, 0.04, 0.46), (sx * 0.4, -0.1, 0.38)], 0.13, 0.03, tip=0.3)


@piece('mustache_curly', 'head')
def _(b):
    beard_grad(b)
    for sx in (-1, 1):
        lock(b, 'hair', [(sx * 0.02, 0.2, 0.52), (sx * 0.2, 0.19, 0.53), (sx * 0.34, 0.14, 0.45), (sx * 0.4, 0.22, 0.4), (sx * 0.36, 0.28, 0.4)], 0.07, 0.02, tip=0.25)


@piece('face_blush', 'head')
def _(b):
    b.dgrad = lambda co, n: (1, 1, 1, 1)
    for sx in (-1, 1):
        b.ball(V(sx * 0.33, hy(0.2), 0.3), 0.1, 'pink', sq=(1.0, 0.65, 0.16), seg=10, rings=6, rot=Ry(sx * 0.55))


@piece('glasses_round', 'head')
def _(b):
    b.dgrad = lambda co, n: (1, 1, 1, 1)
    for sx in (-1, 1):
        pts = [V(sx * 0.19 + 0.15 * math.cos(a), hy(0.37 + 0.15 * math.sin(a)), 0.5) for a in [math.radians(k) for k in range(0, 361, 30)]]
        b.tube(pts, [0.022] * len(pts), 'ink', segs=5, smooth=True, cap=False)
        lock(b, 'ink', [(sx * 0.34, 0.38, 0.5), (sx * 0.5, 0.4, 0.36), (sx * 0.54, 0.4, 0.1)], 0.02, 0.02, tip=0.0, segs=4)
    lock(b, 'ink', [(-0.05, 0.4, 0.51), (0.0, 0.42, 0.52), (0.05, 0.4, 0.51)], 0.02, 0.02, tip=0.0, segs=4)


@piece('scalp_bald', 'head')
def _(b):
    # skin-coloured dome that closes the open top of the KayKit skull (bald heads under crowns / tiaras / helms)
    b.grads['skin'] = g_up((0.93, 0.9, 0.9), (1, 1, 1), hy(0.2), hy(0.8), 0.4)
    b.dgrad = b.grads['skin']
    H = Hd(c=(0, 0.40, 0.03), r=(0.55, 0.34, 0.5), rzb=0.45, hem=hem_const(0.6, 0.42, 0.4))
    H.cap(b, mat='skin', nu=24, nv=8, puff=False)


# ================================================================= HATS (head bone)
def ring(b, mat, y0, y1, r0, r1, segs=24, lobes=0, amp=0.0, thick=0.0, **kw):
    """closed hoop: outer radius r0 at y0 -> r1 at y1 (+ optional wall thickness)"""
    pts = [(r0, y0), (r1, y1), (r1 - thick, y1), (r0 - thick, y0)] if thick else [(r0, y0), (r1, y1)]
    b.lathe([(r, hy(y)) for r, y in pts], mat, segs=segs, closed=bool(thick), lobes=lobes, amp=amp, **kw)


def brim_r(a, front, side, back):
    """hat brim radius around the head: a = azimuth (0 = front); short in front so the face stays visible from above"""
    c = math.cos(a)
    return lerp(side, front, smooth(c)) if c >= 0 else lerp(side, back, smooth(-c))


def hat_grad(b, y0=0.5, y1=1.4):
    b.grads['main'] = g_up((0.6, 0.58, 0.64), (1, 1, 1), hy(y0), hy(y1), 0.5)
    b.grads['second'] = g_up((0.7, 0.68, 0.7), (1, 1, 1), hy(y0), hy(y1), 0.5)
    b.grads['straw'] = g_up((0.7, 0.66, 0.6), (1, 1, 1), hy(y0), hy(y1), 0.5)
    b.grads['cloth_white'] = g_up((0.72, 0.72, 0.78), (1, 1, 1), hy(y0), hy(y1), 0.5)
    b.dgrad = g_up((0.7, 0.68, 0.7), (1, 1, 1), hy(y0), hy(y1), 0.5)


@piece('hat_straw_farmer', 'head')
def _(b):
    hat_grad(b, 0.5, 1.1)
    b.tilt = 0.16
    b.lathe([(0.0, hy(1.04)), (0.2, hy(1.03)), (0.4, hy(0.97)), (0.5, hy(0.86)), (0.54, hy(0.7)), (0.55, hy(0.62))], 'straw', segs=24, smooth=True)
    def brim(u, v):
        a = 2 * PI * u; r = lerp(0.5, brim_r(a, 0.74, 0.9, 0.92) + 0.025 * math.sin(9 * a), v)
        return V(r * math.sin(a), hy(0.64 - 0.1 * v ** 1.8), r * math.cos(a))
    b.cloth(brim, 36, 4, 'straw', th=0.05, smooth=True)
    b.lathe([(0.54, hy(0.68)), (0.56, hy(0.69)), (0.56, hy(0.8)), (0.54, hy(0.81))], 'second', segs=24, closed=True, smooth=True)

@piece('hat_toque_chef', 'head')
def _(b):
    hat_grad(b, 0.5, 1.6)
    b.lathe([(0.55, hy(0.6)), (0.58, hy(0.6)), (0.58, hy(0.8)), (0.55, hy(0.8))], 'cloth_white', segs=24, closed=True, smooth=True)
    b.lathe([(0.0, hy(1.58)), (0.3, hy(1.55)), (0.55, hy(1.42)), (0.7, hy(1.2)), (0.7, hy(1.02)), (0.6, hy(0.88)), (0.54, hy(0.79))], 'cloth_white', segs=30, lobes=10, amp=0.09, smooth=True)
    b.lathe([(0.545, hy(0.62)), (0.595, hy(0.64)), (0.595, hy(0.72)), (0.545, hy(0.72))], 'second', segs=24, closed=True)


@piece('hat_feather_cap', 'head')
def _(b):
    hat_grad(b, 0.5, 1.2)
    b.lathe([(0.0, hy(1.08)), (0.22, hy(1.06)), (0.45, hy(0.98)), (0.6, hy(0.84)), (0.64, hy(0.68)), (0.62, hy(0.58))], 'main', segs=24, smooth=True)
    b.lathe([(0.6, hy(0.54)), (0.68, hy(0.56)), (0.68, hy(0.66)), (0.6, hy(0.68))], 'second', segs=24, closed=True, smooth=True)
    b.lathe([(0.0, hy(0.0)), (0.0, hy(0.0))], 'main', segs=3) if False else None
    # front peak (pointed turn-up) + feather
    b.cyl(V(0, hy(0.64), 0.64), 0.0, 0.2, 0.34, 8, 'main', rot=Rx(PI / 2 - 0.5), smooth=True)
    lock(b, 'red', [(0.4, 0.82, 0.12), (0.56, 1.1, -0.1), (0.6, 1.42, -0.36), (0.5, 1.5, -0.6)], 0.09, 0.012, tip=0.4)
    lock(b, 'cream', [(0.4, 0.82, 0.12), (0.52, 1.08, -0.08), (0.56, 1.4, -0.34)], 0.025, 0.01, tip=0.2, segs=4)


@piece('hat_bard', 'head')
def _(b):
    hat_grad(b, 0.5, 1.3)
    b.tilt = 0.2
    b.lathe([(0.0, hy(1.02)), (0.2, hy(1.04)), (0.42, hy(0.98)), (0.52, hy(0.86)), (0.54, hy(0.7)), (0.55, hy(0.62))], 'main', segs=24, smooth=True)
    def brim(u, v):     # floppy brim, dipping over one eye and curling up on the other side
        a = 2 * PI * u; r = lerp(0.52, brim_r(a, 0.7, 0.88, 0.9), v)
        x, z = r * math.sin(a), r * math.cos(a)
        y = 0.62 - 0.12 * v ** 1.6 * (0.5 + 0.5 * math.cos(a - 0.9)) + 0.2 * v ** 2 * max(0.0, math.cos(a + 1.9))
        return V(x, hy(y), z)
    b.cloth(brim, 24, 4, 'main', th=0.045, smooth=True)
    b.lathe([(0.55, hy(0.66)), (0.58, hy(0.67)), (0.58, hy(0.76)), (0.55, hy(0.77))], 'second', segs=24, closed=True, smooth=True)
    lock(b, 'red', [(-0.45, 0.78, 0.22), (-0.62, 1.0, 0.0), (-0.72, 1.3, -0.28), (-0.62, 1.42, -0.52)], 0.1, 0.012, tip=0.4)
    lock(b, 'cream', [(-0.45, 0.78, 0.22), (-0.6, 0.98, 0.0), (-0.68, 1.26, -0.26)], 0.025, 0.01, tip=0.2, segs=4)

@piece('hat_bonnet', 'head')
def _(b):
    hat_grad(b, -0.1, 1.0)
    def hem(th):
        a = abs((th + PI) % (2 * PI) - PI)       # 0 front
        return lerp(0.02, 0.7, smooth(1 - a / 1.15)) if a < 1.15 else 0.02
    H = Hd(hem=hem, r=(0.6, 0.43, 0.58), rzb=0.55, tuck=0.0)
    H.cap(b, mat='main', nu=32, nv=10, puff=False)
    # frilled brim framing the face + ribbon bow
    pts = [(-0.52, 0.04, 0.16), (-0.54, 0.36, 0.36), (-0.4, 0.62, 0.52), (0.0, 0.74, 0.58), (0.4, 0.62, 0.52), (0.54, 0.36, 0.36), (0.52, 0.04, 0.16)]
    lock(b, 'cloth_white', pts, 0.1, 0.1, tip=0.0, segs=7, sub=3)
    sp = spline([V(p[0], hy(p[1]), p[2]) for p in pts], 3)
    for i in range(1, len(sp) - 1, 2): b.ball(sp[i], 0.075, 'cloth_white', seg=7, rings=5)
    ball(b, 'second', (0.5, 0.0, 0.22), 0.1, seg=8, rings=6)
    for sg in (-1, 1): lock(b, 'second', [(0.5, 0.0, 0.22), (0.56 + 0.1 * sg, -0.16, 0.2), (0.6 + 0.16 * sg, -0.36, 0.14)], 0.05, 0.02, tip=0.3, segs=4)


@piece('hat_hood', 'head')
def _(b):
    hat_grad(b, -0.4, 1.0)
    def hem(th):
        a = abs((th + PI) % (2 * PI) - PI)
        return lerp(-0.02, 0.68, smooth((1.15 - a) / 0.5)) if a < 1.15 else -0.02
    H = Hd(hem=hem, r=(0.66, 0.5, 0.64), rzb=0.62, c=(0, 0.4, 0.0))
    H.cap(b, mat='main', nu=32, nv=10, puff=False)
    # drape on the shoulders + a soft peak at the back + trimmed edge
    b.surf(lambda u, v: V(lerp(-0.62, 0.62, u) * (1 + 0.28 * v), hy(0.0 - 0.38 * v), -0.45 - 0.18 * math.sin(PI * u) * v - 0.12 * v + 0.2 * (1 - v) * 0), 14, 6, 'main', smooth=True, flip=True)
    lock(b, 'main', [(0, 0.86, -0.38), (0, 0.9, -0.6), (0, 0.8, -0.78)], 0.15, 0.04, tip=0.35)
    pts = [(-0.55, 0.0, 0.2), (-0.6, 0.35, 0.42), (-0.44, 0.62, 0.56), (0.0, 0.72, 0.62), (0.44, 0.62, 0.56), (0.6, 0.35, 0.42), (0.55, 0.0, 0.2)]
    lock(b, 'second', pts, 0.055, 0.055, tip=0.0, segs=6, sub=3)


@piece('hat_witch', 'head')
def _(b):
    hat_grad(b, 0.5, 1.9)
    b.tilt = 0.2
    def brim(u, v):
        a = 2 * PI * u; r = lerp(0.5, brim_r(a, 0.68, 0.9, 0.96), v)
        return V(r * math.sin(a), hy(0.6 + 0.07 * v - 0.05 * v * v * (1 + math.cos(a))), r * math.cos(a))
    b.cloth(brim, 28, 4, 'main', th=0.05, smooth=True)
    spine = [V(0, hy(0.62), 0), V(0.0, hy(0.95), -0.02), V(0.02, hy(1.35), -0.06), V(0.14, hy(1.7), -0.18), V(0.36, hy(1.88), -0.3), V(0.58, hy(1.86), -0.34)]
    b.tube(spline(spine, 3), lambda t: lerp(0.52, 0.025, t ** 0.75), 'main', segs=14, smooth=True, cap=True)
    b.lathe([(0.52, hy(0.66)), (0.58, hy(0.68)), (0.56, hy(0.82)), (0.5, hy(0.84))], 'second', segs=24, closed=True, smooth=True)
    b.box(V(0, hy(0.76), 0.55), (0.2, 0.18, 0.05), 'gold')
    b.box(V(0, hy(0.76), 0.56), (0.11, 0.09, 0.05), 'main')

@piece('hat_tricorn', 'head')
def _(b):
    hat_grad(b, 0.5, 1.1)
    b.tilt = 0.12
    def edge(a):
        up = (0.5 + 0.5 * math.cos(3 * a + PI)) ** 1.5
        return up
    def brim(u, v):     # three turned-up corners
        a = 2 * PI * u; R = 0.74 + 0.08 * edge(a); r = lerp(0.5, R, v)
        return V(r * math.sin(a) * 1.04, hy(0.6 + 0.3 * v * v * edge(a) - 0.02 * v), r * math.cos(a))
    b.cloth(brim, 30, 4, 'main', th=0.05, smooth=True)
    b.lathe([(0.0, hy(0.98)), (0.3, hy(0.96)), (0.5, hy(0.85)), (0.56, hy(0.7)), (0.54, hy(0.6))], 'main', segs=24, smooth=True)
    # gold braid along the brim edge, cockade + feather
    pts = [V((0.74 + 0.08 * edge(2 * PI * k / 36)) * math.sin(2 * PI * k / 36) * 1.04, hy(0.6 + 0.3 * edge(2 * PI * k / 36) - 0.02), (0.74 + 0.08 * edge(2 * PI * k / 36)) * math.cos(2 * PI * k / 36)) for k in range(37)]
    b.tube(pts, [0.028] * 37, 'gold', segs=5, smooth=True, cap=False)
    ball(b, 'gold', (0.0, 0.78, 0.58), 0.1, sq=(1, 1, 0.5), seg=8, rings=6)
    lock(b, 'cloth_white', [(0.42, 0.84, 0.42), (0.6, 1.08, 0.3), (0.62, 1.3, 0.0), (0.5, 1.42, -0.24)], 0.09, 0.012, tip=0.4)

@piece('helm_kettle', 'head')
def _(b):
    hat_grad(b, 0.5, 1.2)
    b.tilt = 0.1
    b.grads['steel'] = g_up((0.55, 0.58, 0.68), (1, 1, 1), hy(0.5), hy(1.2), 0.5)
    b.lathe([(0.0, hy(1.08)), (0.24, hy(1.06)), (0.46, hy(0.99)), (0.59, hy(0.86)), (0.62, hy(0.7)), (0.62, hy(0.58))], 'steel', segs=24, smooth=True)
    def brim(u, v):
        a = 2 * PI * u; r = lerp(0.6, brim_r(a, 0.68, 0.76, 0.82), v)
        return V(r * math.sin(a), hy(0.58 - 0.07 * v), r * math.cos(a))
    b.cloth(brim, 28, 3, 'steel', th=0.04, smooth=True)
    pts = [V(brim_r(2 * PI * k / 36, 0.68, 0.76, 0.82) * math.sin(2 * PI * k / 36), hy(0.51), brim_r(2 * PI * k / 36, 0.68, 0.76, 0.82) * math.cos(2 * PI * k / 36)) for k in range(37)]
    b.tube(pts, [0.03] * 37, 'gold', segs=5, smooth=True, cap=False)
    b.lathe([(0.6, hy(0.64)), (0.65, hy(0.64)), (0.65, hy(0.72)), (0.6, hy(0.72))], 'gold', segs=24, closed=True, smooth=True)
    # crest ridge front-to-back + top knob
    b.lathe([(0.0, hy(1.2)), (0.09, hy(1.18)), (0.12, hy(1.11)), (0.0, hy(1.09))], 'gold', segs=10, smooth=True)
    b.surf(lambda u, v: V((v - 0.5) * 0.07, hy(0.92 + 0.18 * math.sin(PI * (0.08 + 0.84 * u))), 0.58 - 1.2 * u), 12, 1, 'second', smooth=False)

@piece('veil_nun', 'head')
def _(b):
    hat_grad(b, -0.6, 1.0)
    def hem(th):
        a = abs((th + PI) % (2 * PI) - PI)
        return lerp(-0.1, 0.66, smooth((1.1 - a) / 0.4)) if a < 1.1 else -0.1
    H = Hd(hem=hem, r=(0.62, 0.46, 0.6), rzb=0.6, c=(0, 0.4, 0.0), tuck=0.0)
    H.cap(b, mat='main', nu=30, nv=10, puff=False)
    # veil falling over the shoulders down the back, white coif framing the face
    b.surf(lambda u, v: V(lerp(-0.6, 0.6, u) * (1 + 0.55 * v), hy(0.0 - 0.62 * v), -0.5 - 0.22 * math.sin(PI * u) * v - 0.22 * v), 14, 8, 'main', smooth=True, flip=True)
    b.surf(lambda u, v: V(lerp(-0.6, 0.6, u) * (1 + 0.55 * v) * 0.0 + (1 if u > 0.5 else -1) * 0.0, hy(0.0), 0.0), 1, 1, 'main') if False else None
    pts = [(-0.54, 0.0, 0.16), (-0.54, 0.34, 0.34), (-0.4, 0.58, 0.5), (0.0, 0.7, 0.56), (0.4, 0.58, 0.5), (0.54, 0.34, 0.34), (0.54, 0.0, 0.16)]
    lock(b, 'cloth_white', pts, 0.1, 0.1, tip=0.0, segs=7, sub=3)
    b.box(V(0, hy(0.84), 0.5), (0.05, 0.2, 0.04), 'gold'); b.box(V(0, hy(0.86), 0.5), (0.14, 0.05, 0.04), 'gold')


@piece('mitre', 'head')
def _(b):
    hat_grad(b, 0.5, 1.6)
    # a pointed arch seen from the front, extruded front-to-back with a bulge: prism outline then gold bands
    outline = [(-0.46, 0.6), (-0.5, 0.78), (-0.4, 1.1), (-0.2, 1.42), (0.0, 1.62), (0.2, 1.42), (0.4, 1.1), (0.5, 0.78), (0.46, 0.6)]
    b.prism([(x, hy(y)) for x, y in outline], -0.17, 0.17, 'main')
    # the two lobes meet in a cleft: dark seam on top, gold borders
    b.prism([(x * 0.34, hy(y * 0.9 + 0.16)) for x, y in outline[1:-1]], 0.171, 0.2, 'second')
    b.prism([(x * 0.34, hy(y * 0.9 + 0.16)) for x, y in outline[1:-1]], -0.2, -0.171, 'second')
    b.lathe([(0.5, hy(0.58)), (0.55, hy(0.6)), (0.55, hy(0.76)), (0.5, hy(0.76))], 'gold', segs=24, closed=True, smooth=True)
    b.box(V(0, hy(1.0), 0.205), (0.05, 0.84, 0.03), 'gold')
    b.box(V(0, hy(0.96), 0.22), (0.16, 0.05, 0.03), 'gold'); b.box(V(0, hy(1.06), 0.22), (0.05, 0.2, 0.03), 'gold')
    for sx in (-1, 1): lock(b, 'second', [(sx * 0.14, 0.7, -0.28), (sx * 0.22, 0.4, -0.38), (sx * 0.26, 0.05, -0.36)], 0.06, 0.05, tip=0.0, segs=4)


@piece('crown_king', 'head')
def _(b):
    hat_grad(b, 0.5, 1.2)
    b.grads['gold'] = g_up((0.72, 0.66, 0.5), (1, 1, 1), hy(0.5), hy(1.2), 0.5)
    b.lathe([(0.0, hy(0.98)), (0.3, hy(0.94)), (0.52, hy(0.82)), (0.56, hy(0.7))], 'main', segs=20, smooth=True)       # velvet cap
    b.lathe([(0.57, hy(0.62)), (0.63, hy(0.64)), (0.65, hy(0.88)), (0.59, hy(0.86))], 'gold', segs=24, closed=True, smooth=True)
    for i in range(5):
        a = 2 * PI * i / 5 + PI / 5
        x, z = math.sin(a) * 0.6, math.cos(a) * 0.6
        b.cyl(V(x, hy(1.0), z), 0.1, 0.0, 0.34, 6, 'gold', smooth=True)
        b.ball(V(x, hy(1.2), z), 0.085, 'gold', seg=8, rings=6)
        b.ball(V(math.sin(a + PI / 5) * 0.63, hy(0.75), math.cos(a + PI / 5) * 0.63), 0.07, 'red' if i % 2 else 'blue', sq=(1, 1, 1), seg=8, rings=6)
        b.ball(V(math.sin(a) * 0.62, hy(0.77), math.cos(a) * 0.62), 0.06, 'blue' if i % 2 else 'red', seg=8, rings=6)


@piece('tiara_queen', 'head')
def _(b):
    hat_grad(b, 0.5, 1.2)
    b.grads['gold'] = g_up((0.72, 0.66, 0.5), (1, 1, 1), hy(0.5), hy(1.2), 0.5)
    pts = [V(0.58 * math.sin(a), hy(0.68 + 0.04 * math.cos(a * 2)), 0.56 * math.cos(a) + 0.02) for a in [math.radians(k) for k in range(-110, 111, 22)]]
    b.tube(pts, [0.04] * len(pts), 'gold', segs=6, smooth=True, cap=True)
    for k, a in enumerate((-60, -30, 0, 30, 60)):
        x, z = 0.58 * math.sin(math.radians(a)), 0.56 * math.cos(math.radians(a)) + 0.02
        h = 0.2 - 0.05 * abs(a) / 30 if a else 0.3
        b.cyl(V(x, hy(0.7 + h / 2), z), 0.05, 0.0, h, 5, 'gold', smooth=True)
        b.ball(V(x, hy(0.72 + h), z), 0.04, 'gold', seg=6, rings=5)
    b.ball(V(0, hy(0.82), 0.6), 0.075, 'blue', sq=(1, 1.3, 0.8), seg=8, rings=6)
    for sx in (-1, 1): b.ball(V(sx * 0.3, hy(0.74), 0.58), 0.045, 'pink', seg=6, rings=5)


@piece('bandana', 'head')
def _(b):
    hat_grad(b, 0.3, 1.0)
    def hem(th):
        a = abs((th + PI) % (2 * PI) - PI)
        return lerp(0.52, 0.62, smooth(1 - a / PI)) + 0.0
    H = Hd(hem=hem, r=(0.58, 0.41, 0.56), rzb=0.52, c=(0, 0.4, 0.03))
    H.cap(b, mat='main', nu=30, nv=8, puff=False)
    pts = [V(0.585 * math.sin(a), hy(0.55 + 0.03 * math.cos(a)), 0.03 + (0.56 if math.cos(a) > 0 else 0.52) * math.cos(a)) for a in [math.radians(k) for k in range(0, 361, 20)]]
    b.tube(pts, [0.06] * len(pts), 'second', segs=6, smooth=True, cap=False)
    ball(b, 'second', (0, 0.56, -0.56), 0.1, seg=8, rings=6)
    for sx in (-1, 1): lock(b, 'main', [(0.0, 0.56, -0.56), (sx * 0.14, 0.4, -0.7), (sx * 0.26, 0.18, -0.72)], 0.08, 0.03, tip=0.3, segs=4)


@piece('hat_beanie', 'head')
def _(b):
    hat_grad(b, 0.3, 1.2)
    b.lathe([(0.0, hy(1.04)), (0.25, hy(1.01)), (0.5, hy(0.9)), (0.62, hy(0.74)), (0.64, hy(0.56))], 'main', segs=24, smooth=True)
    b.lathe([(0.64, hy(0.44)), (0.68, hy(0.46)), (0.68, hy(0.68)), (0.64, hy(0.68))], 'second', segs=28, closed=True, lobes=14, amp=0.02, smooth=True)
    ball(b, 'second', (0, 1.08, 0.0), 0.17, seg=10, rings=7)


@piece('hat_flat_cap', 'head')
def _(b):
    hat_grad(b, 0.3, 1.0)
    b.lathe([(0.0, hy(0.92)), (0.3, hy(0.91)), (0.56, hy(0.84)), (0.66, hy(0.72)), (0.64, hy(0.58))], 'main', segs=24, smooth=True)
    b.ball(V(0.0, hy(0.6), 0.6), 0.34, 'second', sq=(1.2, 0.12, 1.0), seg=12, rings=6, rot=Rx(-0.15))
    ball(b, 'second', (0, 0.93, 0.0), 0.05, seg=6, rings=5)


# ================================================================= CLOTHES (chest bone; character coordinates, y from the feet)
def cloth_grad(b, y0=0.1, y1=1.3, lo=(0.62, 0.6, 0.66)):
    for m in ('main', 'second', 'cloth_white', 'cream', 'leather'):
        b.grads[m] = g_up(lo, (1, 1, 1), y0, y1, 0.55)
    b.dgrad = g_up(lo, (1, 1, 1), y0, y1, 0.55)


def prof_pts(prof, n):
    """smooth (r, y) profile with n+1 samples"""
    sp = spline([V(r, y, 0) for r, y in prof], 8)
    out = []
    L = [0.0]
    for i in range(1, len(sp)): L.append(L[-1] + (sp[i] - sp[i - 1]).length)
    for k in range(n + 1):
        t = L[-1] * k / n
        i = 1
        while i < len(L) - 1 and L[i] < t: i += 1
        f = (t - L[i - 1]) / max(L[i] - L[i - 1], 1e-6)
        q = sp[i - 1].lerp(sp[i], f)
        out.append((q.x, q.y))
    return out


def garment(b, mat, prof, nu=24, nv=9, open_deg=0, lobes=0, dip=0.0, zs=0.88, zoff=0.0, trim=None, trim_rows=1, flip=True, smooth_=True, push=0.0):
    """revolved cloth shell around the torso: profile (r, y) top -> bottom, elliptical (z scaled by zs), optional front opening (a wedge at theta 0),
    scalloped / pointed hem (lobes, dip) and a trim material on the last rows"""
    pp = prof_pts(prof, nv)
    th0 = math.radians(open_deg) / 2
    closed = open_deg == 0

    def fn(u, v):
        th = th0 + (2 * PI - 2 * th0) * u if not closed else 2 * PI * u
        r, y = pp[min(int(round(v * nv)), nv)]
        r += push
        if lobes and v > 0.7:
            w = smooth((v - 0.7) / 0.3)
            y -= dip * w * (0.5 + 0.5 * math.cos(lobes * th))
            r *= 1 + 0.03 * w * math.cos(lobes * th)
        return V(r * math.sin(th), y, zs * r * math.cos(th) + zoff)
    matfn = (lambda i, j: trim if j >= nv - trim_rows else mat) if trim else None
    b.surf(fn, nu, nv, mat, close_u=closed, smooth=smooth_, flip=flip, matfn=matfn)


def ring_at(b, mat, y0, y1, r0, r1, segs=24, zs=0.88, lobes=0, amp=0.0, thick=0.03, smooth_=True):
    """closed hoop around the torso (elliptical)"""
    pts = [(r0, y0), (r1, y1), (r1 - thick, y1), (r0 - thick, y0)]
    b.lathe(pts, mat, segs=segs, closed=True, M=Sc(1, 1, zs), lobes=lobes, amp=amp, smooth=smooth_)


@piece('tunic', 'chest')
def _(b):
    cloth_grad(b)
    garment(b, 'main', [(0.27, 1.27), (0.36, 1.2), (0.38, 1.0), (0.38, 0.8), (0.47, 0.62), (0.58, 0.46)], nu=24, nv=9, lobes=6, dip=0.07, trim='second', trim_rows=1)
    ring_at(b, 'second', 1.2, 1.3, 0.3, 0.34, lobes=0)
    ring_at(b, 'leather', 0.74, 0.84, 0.395, 0.395, thick=0.0)
    b.box(V(0, 0.79, 0.37), (0.13, 0.12, 0.04), 'gold')
    b.box(V(0, 0.79, 0.385), (0.07, 0.06, 0.03), 'leather')


@piece('smock', 'chest')
def _(b):
    cloth_grad(b)
    garment(b, 'main', [(0.28, 1.27), (0.39, 1.2), (0.41, 1.0), (0.44, 0.78), (0.52, 0.56), (0.58, 0.38)], nu=24, nv=9, lobes=0, trim='second', trim_rows=1)
    ring_at(b, 'cream', 1.22, 1.3, 0.3, 0.35, thick=0.02)
    for k in range(3):       # laced collar
        b.box(V(0, 1.18 - 0.07 * k, 0.28), (0.1, 0.018, 0.03), 'cream')
    ring_at(b, 'second', 0.8, 0.88, 0.45, 0.45, thick=0.0) if False else None


@piece('vest', 'chest')
def _(b):
    cloth_grad(b)
    garment(b, 'main', [(0.3, 1.22), (0.4, 1.15), (0.42, 1.0), (0.41, 0.84), (0.46, 0.7)], nu=22, nv=7, open_deg=62, lobes=0, trim='leather', trim_rows=1, zs=0.9, push=0.02)
    for k in range(3): b.ball(V(0.0, 1.05 - 0.14 * k, 0.4), 0.032, 'gold', seg=6, rings=5)


@piece('dress', 'chest')
def _(b):
    cloth_grad(b, 0.1, 1.3)
    garment(b, 'main', [(0.27, 1.26), (0.36, 1.19), (0.35, 1.0), (0.31, 0.84), (0.4, 0.74), (0.56, 0.54), (0.72, 0.32), (0.8, 0.17)], nu=28, nv=11, lobes=14, dip=0.045, trim='second', trim_rows=2, zs=0.88)
    ring_at(b, 'second', 0.8, 0.88, 0.335, 0.335, thick=0.0)
    ring_at(b, 'cream', 1.2, 1.25, 0.3, 0.4, thick=0.02, segs=28)
    for sx in (-1, 1): b.ball(V(sx * 0.37, 1.15, 0.0), 0.17, 'main', sq=(1, 0.9, 1), seg=10, rings=7)
    b.ball(V(0, 0.84, 0.31), 0.06, 'second', sq=(1.6, 0.8, 0.8), seg=8, rings=6)


@piece('apron', 'chest')
def _(b):
    cloth_grad(b, 0.2, 1.2)
    # bib + skirt panel hugging the front of the torso
    def rad(y): return 0.37 + 0.2 * smooth((0.8 - y) / 0.5) + 0.05
    def fn(u, v):
        y = lerp(1.12, 0.26, v)
        w = lerp(0.5, 1.0, smooth((1.0 - (y - 0.78) / 0.34))) if y > 0.78 else lerp(1.0, 1.3, smooth((0.78 - y) / 0.5))
        th = (2 * u - 1) * w * (0.62 if y > 0.78 else 1.0)
        r = rad(y)
        return V(r * math.sin(th), y, 0.88 * r * math.cos(th) + 0.01)
    b.surf(fn, 12, 11, 'second', smooth=True, flip=True, matfn=lambda i, j: 'main' if j >= 10 else 'second')
    b.box(V(0, 0.54, 0.45), (0.2, 0.17, 0.035), 'main')       # pocket
    for sx in (-1, 1):
        lock(b, 'second', [(sx * 0.13, 1.1, 0.34), (sx * 0.2, 1.22, 0.2), (sx * 0.24, 1.27, 0.0)], 0.028, 0.028, tip=0.0, segs=4, ch=True)
    lock(b, 'second', [(-0.4, 0.78, 0.1), (0.0, 0.8, 0.5), (0.4, 0.78, 0.1)], 0.03, 0.03, tip=0.0, segs=4, sub=3, ch=True)    # waist ties


@piece('robe_long', 'chest')
def _(b):
    cloth_grad(b, 0.05, 1.3)
    garment(b, 'main', [(0.28, 1.27), (0.39, 1.2), (0.41, 1.0), (0.44, 0.8), (0.58, 0.5), (0.74, 0.25), (0.84, 0.06)], nu=28, nv=11, lobes=12, dip=0.03, trim='second', trim_rows=1)
    # stole down the front + collar + sash
    def stole(u, v):
        y = lerp(1.24, 0.07, v)
        pp = prof_pts([(0.28, 1.27), (0.39, 1.2), (0.41, 1.0), (0.44, 0.8), (0.58, 0.5), (0.74, 0.25), (0.84, 0.06)], 20)
        r = min(pp, key=lambda q: abs(q[1] - y))[0] + 0.025
        x = (2 * u - 1) * 0.085
        return V(x, y, 0.88 * math.sqrt(max(r * r - x * x, 0.0)))
    b.surf(stole, 2, 14, 'second', smooth=True, flip=True)
    ring_at(b, 'second', 1.2, 1.3, 0.3, 0.36, thick=0.02)
    ring_at(b, 'gold', 0.78, 0.9, 0.45, 0.45, thick=0.0)
    b.ball(V(0, 0.84, 0.4), 0.07, 'gold', sq=(1, 1, 0.5), seg=8, rings=6)


@piece('cape_long', 'chest')
def _(b):
    cloth_grad(b, 0.05, 1.3, lo=(0.55, 0.5, 0.58))
    def cape(u, v):
        x = lerp(-1, 1, u) * lerp(0.34, 0.78, smooth(v)) * (1 + 0.04 * math.sin(u * 22 + v * 3) * v)
        y = lerp(1.26, 0.1, v) + 0.03 * abs(math.sin(u * 8.5 * PI)) * (v > 0.9) * -1
        z = -0.28 - 0.3 * smooth(v) * (1 - 0.35 * (2 * u - 1) ** 2) - 0.03 * math.sin(u * 15) * v
        return V(x, y, z)
    b.surf(cape, 18, 10, 'main', smooth=True, flip=False, matfn=lambda i, j: 'second' if j >= 9 else 'main')
    ring_at(b, 'cloth_white', 1.18, 1.3, 0.3, 0.42, thick=0.02, lobes=12, amp=0.07, segs=28)
    for sx in (-1, 1): b.ball(V(sx * 0.28, 1.17, 0.26), 0.05, 'gold', seg=7, rings=5)


@piece('cape_short', 'chest')
def _(b):
    cloth_grad(b, 0.5, 1.3)
    garment(b, 'main', [(0.3, 1.25), (0.48, 1.2), (0.58, 1.02), (0.64, 0.84)], nu=26, nv=7, open_deg=70, lobes=10, dip=0.05, trim='second', trim_rows=1, zs=0.92, zoff=-0.04)
    ring_at(b, 'second', 1.2, 1.3, 0.3, 0.36, thick=0.02)
    for sx in (-1, 1): b.ball(V(sx * 0.2, 1.2, 0.3), 0.05, 'gold', seg=7, rings=5)


@piece('scarf', 'chest')
def _(b):
    cloth_grad(b, 0.5, 1.3)
    ring_at(b, 'main', 1.12, 1.3, 0.34, 0.31, thick=0.0, segs=20) if False else None
    pts = [V(0.3 * math.sin(a), 1.2 + 0.03 * math.cos(2 * a), 0.3 * 0.9 * math.cos(a)) for a in [math.radians(k) for k in range(0, 361, 30)]]
    b.tube(pts, [0.095] * len(pts), 'main', segs=8, smooth=True, cap=False)
    lock(b, 'main', [(0.18, 1.16, 0.28), (0.28, 0.96, 0.32), (0.3, 0.7, 0.32), (0.34, 0.5, 0.3)], 0.1, 0.07, tip=0.0, segs=6, sq=0.5, ch=True)
    b.ball(V(0.34, 0.5, 0.3), 0.075, 'second', sq=(1, 0.5, 0.6), seg=6, rings=5)


@piece('collar_ruff', 'chest')
def _(b):
    cloth_grad(b, 1.0, 1.3, lo=(0.8, 0.8, 0.86))
    b.lathe([(0.2, 1.3), (0.5, 1.27), (0.5, 1.2), (0.28, 1.18)], 'cloth_white', segs=36, closed=True, lobes=18, amp=0.1, smooth=True, M=Sc(1, 1, 0.9))


@piece('sash', 'chest')
def _(b):
    cloth_grad(b, 0.5, 1.3)
    pts = []
    for k in range(9):
        t = k / 8
        a = lerp(-2.0, 0.55, t)                # around the body from the left shoulder, over the chest, to the right hip
        y = lerp(1.2, 0.66, t)
        r = lerp(0.37, 0.43, t)
        pts.append(V(r * math.sin(a * -1) * 0.0 + (lerp(-0.3, 0.38, t)), y, 0.88 * math.sqrt(max(r * r - lerp(-0.3, 0.38, t) ** 2, 0.001)) + 0.02))
    b.tube(spline(pts, 2), [0.075] * (len(pts) * 2 - 1), 'second', segs=7, smooth=True, cap=True, sq=1.0)
    b.ball(V(0.38, 0.64, 0.32), 0.1, 'second', seg=8, rings=6)
    for sg in (-1, 1): lock(b, 'second', [(0.38, 0.64, 0.32), (0.4 + 0.06 * sg, 0.5, 0.3), (0.42 + 0.1 * sg, 0.34, 0.26)], 0.06, 0.04, tip=0.2, segs=4, ch=True)


@piece('tabard', 'chest')
def _(b):
    cloth_grad(b, 0.35, 1.3)
    def pan(sgn):
        def fn(u, v):
            y = lerp(1.24, 0.34, v)
            r = 0.38 + 0.12 * smooth((0.8 - y) / 0.5) + 0.045
            x = (2 * u - 1) * lerp(0.3, 0.36, v)
            return V(x, y, sgn * 0.88 * math.sqrt(max(r * r - x * x, 0.001)))
        return fn
    b.surf(pan(1), 6, 8, 'main', smooth=True, flip=True, matfn=lambda i, j: 'second' if (i in (0, 5) or j >= 7) else 'main')
    b.surf(pan(-1), 6, 8, 'main', smooth=True, flip=False, matfn=lambda i, j: 'second' if (i in (0, 5) or j >= 7) else 'main')
    b.ball(V(0, 0.95, 0.46), 0.1, 'gold', sq=(1, 1, 0.25), seg=10, rings=6)
    ring_at(b, 'leather', 0.62, 0.72, 0.42, 0.42, thick=0.0)
    b.box(V(0, 0.67, 0.4), (0.12, 0.1, 0.04), 'gold')


@piece('pauldrons', 'chest')
def _(b):
    b.grads['steel'] = g_up((0.55, 0.58, 0.68), (1, 1, 1), 0.9, 1.4, 0.5)
    b.grads['gold'] = g_up((0.72, 0.66, 0.5), (1, 1, 1), 0.9, 1.4, 0.5)
    for sx in (-1, 1):
        b.ball(V(sx * 0.4, 1.22, 0.0), 0.22, 'steel', sq=(1.0, 0.62, 1.0), seg=12, rings=7)
        b.lathe([(0.2, 1.18), (0.26, 1.16), (0.25, 1.11), (0.19, 1.13)], 'gold', segs=16, closed=True, pos=(sx * 0.4, 0, 0), smooth=True)
        b.ball(V(sx * 0.4, 1.31, 0.0), 0.05, 'gold', seg=6, rings=5)


@piece('pouch_belt', 'hips')
def _(b):
    b.grads['leather'] = g_up((0.6, 0.55, 0.5), (1, 1, 1), 0.3, 0.8, 0.5)
    b.dgrad = b.grads['leather']
    b.ball(V(-0.42, 0.52, 0.16), 0.13, 'leather', sq=(0.8, 1.0, 0.9), seg=10, rings=7)
    b.ball(V(-0.42, 0.6, 0.2), 0.12, 'leather', sq=(0.85, 0.45, 0.9), seg=8, rings=6)
    b.ball(V(-0.43, 0.58, 0.29), 0.035, 'gold', seg=6, rings=5)
    lock(b, 'leather', [(-0.4, 0.66, 0.0), (-0.42, 0.62, 0.2), (-0.38, 0.62, 0.4)], 0.025, 0.025, tip=0.0, segs=4, ch=True)


# ================================================================= PREVIEW (mannequins = recoloured KayKit parts; NOT exported)
# The same cell -> role tables live in render/npcLook.ts (game): the KayKit atlas is a palette of 8 x 8 cells (each swatch = 2 cells, bright
# over dark); a vertex's UV cell tells whether it is skin / hair / shirt / trousers ...  role colour x (cell brightness / role reference brightness).
KK_PARTS = ('Head', 'Body', 'ArmLeft', 'ArmRight', 'LegLeft', 'LegRight')
CELLS = {
    'Ranger': {'head': {'skin': [(0, 0), (0, 1)], 'hair': [(1, 0), (1, 1)]}, 'body': {'acc': [(0, 2), (0, 3)], 'shirt': [(5, 0), (5, 1), (6, 0), (6, 1)]},
               'arm': {'skin': [(0, 0), (0, 1)], 'shirt': [(6, 0), (6, 1)]}, 'leg': {'pants': [(3, 4), (3, 5)]}},
    'Mage': {'head': {'skin': [(0, 0), (0, 1)], 'hair': [(1, 0), (1, 1)]}, 'body': {'shirt': [(0, 2), (0, 3), (7, 2), (7, 3)]},
             'arm': {'shirt': [(0, 2), (0, 3)], 'skin': [(7, 5)]}, 'leg': {'pants': [(7, 2), (7, 3)]}},
    'Knight': {'head': {'skin': [(0, 0), (0, 1)], 'hair': [(1, 0), (1, 1)]}, 'body': {'armor': [(3, 0), (3, 1), (7, 0), (7, 1), (2, 2), (2, 3)], 'acc': [(0, 2), (0, 3)]},
               'arm': {'armor': [(3, 0), (3, 1), (7, 0)]}, 'leg': {'armor': [(3, 0), (3, 1), (7, 0)]}},
    'Barbarian': {'head': {'skin': [(0, 0), (0, 1)], 'hair': [(1, 0), (1, 1)]}, 'body': {'skin': [(0, 0), (0, 1)]}, 'arm': {'skin': [(0, 0), (0, 1)]}, 'leg': {'pants': [(3, 4), (3, 5)]}},
    'Rogue_Hooded': {'head': {'skin': [(0, 0), (0, 1)], 'shirt': [(1, 2), (1, 3)], 'hair': [(1, 0), (1, 1)]}, 'body': {'shirt': [(0, 2), (0, 3), (1, 2), (1, 3)]},
                     'arm': {'shirt': [(0, 2), (0, 3), (1, 2), (1, 3)], 'skin': [(0, 1)]}, 'leg': {}},
}
KK_FILES = {'Ranger': 'Ranger', 'Mage': 'Mage', 'Knight': 'Knight', 'Barbarian': 'Barbarian', 'Rogue_Hooded': 'Rogue_Hooded'}
KK_DIR = os.environ.get('NPC_KK_DIR', os.path.join(tempfile.gettempdir(), 'aether_kk'))


def kk_path(name):
    p = os.path.join(KK_DIR, name + '.glb')
    if not os.path.exists(p):
        os.makedirs(KK_DIR, exist_ok=True)       # the shipped KayKit glbs are meshopt compressed: Blender cannot read them, so decompress copies
        subprocess.check_call(['npx', '--yes', '@gltf-transform/cli', 'copy', os.path.join(OUT_DIR, name + '.glb'), p], cwd=ROOT)
    return p


def srgb_lin(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hex_lin(h): return tuple(srgb_lin(int(h[i:i + 2], 16) / 255) for i in (1, 3, 5))
def lum(c): return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


_KK = {}


def load_kk(name):
    """-> {part: (verts_world [Vector], polys [(vert idx...)], per-loop uv cells, per-polygon cell)} for the six body parts of a KayKit rig + atlas cells (linear rgb)"""
    if name in _KK: return _KK[name]
    before = set(bpy.data.objects); before_img = set(bpy.data.images)
    bpy.ops.import_scene.gltf(filepath=kk_path(KK_FILES[name]))
    new = [o for o in bpy.data.objects if o not in before]
    img = [i for i in bpy.data.images if i not in before_img][0]
    w, h = img.size
    px = list(img.pixels)
    cells = {}
    cw = w // 8
    for c in range(8):
        for r in range(8):
            x = c * cw + cw // 2; y = h - 1 - (r * cw + cw // 2)        # r from the top; pixels are bottom-up sRGB (byte image)
            o = (y * w + x) * 4
            cells[(c, r)] = tuple(srgb_lin(px[o + k]) for k in range(3))
    parts = {}
    dg = bpy.context.evaluated_depsgraph_get()
    for o in new:
        if o.type != 'MESH': continue
        part = o.name.split('_', 1)[1] if '_' in o.name else o.name
        if part not in KK_PARTS: continue
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev)
        me.transform(o.matrix_world)
        uvl = me.uv_layers.active.data
        polys = []
        for p in me.polygons:
            cu = sum(uvl[l].uv[0] for l in p.loop_indices) / p.loop_total
            cv = sum(uvl[l].uv[1] for l in p.loop_indices) / p.loop_total
            polys.append((int(cu * 8), int((1 - cv) * 8)))
        parts[part] = (me, polys)
    for o in new:
        if o.type in ('MESH', 'ARMATURE', 'EMPTY'):
            try: bpy.data.objects.remove(o, do_unlink=True)
            except Exception: pass
    _KK[name] = (parts, cells)
    return _KK[name]


def role_color(cells, base, ptype, cell, colours):
    roles = CELLS[base].get(ptype, {})
    for role, lst in roles.items():
        if cell in lst and role in colours:
            ref = cells[lst[0]]
            k = clamp(lum(cells[cell]) / max(lum(ref), 1e-4), 0.3, 1.05)
            rc = colours[role]
            return (rc[0] * k, rc[1] * k, rc[2] * k)
    return cells[cell]


_PVM = {}
def pv_mat(col, rough=0.8):
    """preview material: colour (linear rgb tuple) x vertex colour `Col`"""
    key = (round(col[0], 3), round(col[1], 3), round(col[2], 3)) if col else None
    if key in _PVM: return _PVM[key]
    m = bpy.data.materials.new('pv')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    mix.inputs['A'].default_value = (col[0], col[1], col[2], 1.0) if col else (1, 1, 1, 1)
    nt.links.new(vc.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    m.use_backface_culling = False
    _PVM[key] = m
    return m


def bake_part(me_src, polys, base, ptype, colours, cells, drop=()):
    """copy of a KayKit part mesh with recoloured vertex colours; polygons in `drop` roles (hair) removed"""
    me = me_src.copy()
    if ptype == 'arm':       # relax the T-pose: arms hang down (like the idle animation)
        sx = 1 if sum(v.co.x for v in me.vertices) > 0 else -1
        me.transform(T((sx * 0.212, 0, 1.107)) @ Matrix.Rotation(sx * math.radians(72), 4, 'Y') @ T((-sx * 0.212, 0, -1.107)))
    bm = bmesh.new(); bm.from_mesh(me)
    lay = bm.loops.layers.color.new('Col')
    kill = []
    roles = CELLS[base].get(ptype, {})
    for f in bm.faces:
        cell = polys[f.index]
        if any(cell in roles.get(r, []) for r in drop): kill.append(f); continue
        c = role_color(cells, base, ptype, cell, colours)
        for l in f.loops: l[lay] = (c[0], c[1], c[2], 1.0)
    if kill: bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(me); bm.free()
    me.materials.clear(); me.materials.append(pv_mat((1, 1, 1)))
    me.color_attributes.active_color = me.color_attributes['Col']
    return me


def make_man(base, face, colours):
    """-> list of static mesh datas [head, body, armL, armR, legL, legR] in character space (Blender coords)"""
    parts, cells = load_kk(base)
    fparts, fcells = load_kk(face)
    out = []
    hair_drop = ('hair',) if face != 'Rogue_Hooded' else ('hair',)
    hm, hp = fparts['Head']
    out.append(bake_part(hm, hp, face, 'head', colours, fcells, drop=('hair',)))
    for nm, pt in (('Body', 'body'), ('ArmLeft', 'arm'), ('ArmRight', 'arm'), ('LegLeft', 'leg'), ('LegRight', 'leg')):
        m, p = parts[nm]
        out.append(bake_part(m, p, base, pt, colours, cells))
    return out


def lin3(h): return hex_lin(h)


DEF_COL = {'skin': '#ffd2b2', 'shirt': '#e8dcc0', 'pants': '#8a6a4a', 'acc': '#4f7fe0', 'armor': '#c9d2e0', 'hair': '#6a4024'}


def man_colours(**kw):
    d = dict(DEF_COL); d.update(kw)
    return {k: lin3(v) for k, v in d.items()}


def place_man(meshes, gx, gz, yaw=0.0, scale=1.0, name='man', gy=0.0):
    objs = []
    for me in meshes:
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        o.location = G(gx, gy, gz); o.rotation_euler = (0, 0, -math.radians(yaw)); o.scale = (scale, scale, scale)
        objs.append(o)
    return objs


def place_piece(src, gx, gz, role_cols=None, yaw=0.0, scale=1.0, gy=0.0):
    """instance of an exported piece (root Empty + mesh) at the bone origin of a mannequin at (gx, gz); role_cols = {material: hex}"""
    bone = src['bone']
    root = bpy.data.objects.new(src.name + '_inst', None)
    bpy.context.scene.collection.objects.link(root)
    root.location = G(gx, gy + BONEY[bone] * scale, gz)
    root.rotation_euler = (0, 0, -math.radians(yaw)); root.scale = (scale, scale, scale)
    for ch in src.children:
        me = ch.data.copy()
        for i, nm in enumerate(ORDER):
            hexc = (role_cols or {}).get(nm, PAL[nm])
            me.materials[i] = pv_mat(hex_lin(hexc) if isinstance(hexc, str) else hexc)
        o = bpy.data.objects.new(src.name + '_inst_mesh', me)
        bpy.context.scene.collection.objects.link(o)
        o.parent = root
    return root


def clear_preview():
    for o in [o for o in bpy.data.objects if o.name.startswith(('man', 'ground_')) or '_inst' in o.name]:
        bpy.data.objects.remove(o)


# ================================================================= sheets
ROLE_PREVIEW = {'main': '#4f7fe0', 'second': '#f7c548', 'hair': '#7a4a28', 'skin': '#ffd2b2'}


def sheet(rows, path, ortho, ty, yaw=12, pitch=22, spacing=2.3, rowgap=2.7, base='Ranger', face='Ranger', floor='#dfe8d2', roles=None, man_kw=None, mane_yaw=0.0):
    """rows: lists of piece names (a cell may be 'a+b' for several pieces on one mannequin) laid out front to back"""
    clear_preview()
    nr = len(rows)
    K.rect('floor', 0, 0, 600, 600, floor, -(nr - 1) * rowgap - 0.02) if False else None
    men = {}
    for ri, row in enumerate(rows):
        gy = -ri * rowgap
        z = 0
        x = -(len(row) - 1) * spacing / 2
        for cell in row:
            cols = dict(ROLE_PREVIEW); cols.update(roles or {})
            ck = (base, face)
            if ck not in men: men[ck] = make_man(base, face, man_colours(**(man_kw or {})))
            place_man(men[ck], x, z, yaw=mane_yaw, gy=gy)
            for pn in cell.split('+'):
                if pn: place_piece(P[pn], x, z, cols, yaw=mane_yaw, gy=gy)
            x += spacing
    K.add_lights()
    K.make_camera(G(0, ty - (nr - 1) * rowgap / 2, 0), yaw, pitch, 150, ortho=ortho)
    K.render(path)


# ================================================================= main
P = {}


def build_all(names=None):
    for n in (names or PIECES):
        P[n] = build_piece(n)
    return P


def compress(raw, out):
    w = raw.replace('.raw.glb', '.weld.glb')
    subprocess.check_call(['npx', '--yes', '@gltf-transform/cli', 'weld', raw, w], cwd=ROOT)
    subprocess.check_call(['npx', '--yes', '@gltf-transform/cli', 'meshopt', w, out, '--level', 'medium'], cwd=ROOT)
    os.remove(w)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    K.MATS = make_materials()
    K.RAW_GLB = RAW
    build_all()
    print('--- triangle counts')
    for n, o in P.items(): print(f'{n:22s} {tri_count(o):6d}')
    K.export_glb(list(P.values()))
    out = os.path.join(OUT_DIR, 'npc_wear_v1.glb')
    if '--no-compress' not in sys.argv:
        compress(RAW, out)
        print('npc_wear_v1 raw', os.path.getsize(RAW) // 1024, 'KB -> compressed', os.path.getsize(out) // 1024, 'KB')
        os.remove(RAW)
    if '--no-render' in sys.argv: return
    os.makedirs(SHOTS, exist_ok=True)
    for r in P.values():
        for d in descendants(r): d.hide_render = True
    only = [a for a in sys.argv if a.startswith('--only=')]
    only = only[0][7:].split(',') if only else None
    want = lambda k: only is None or k in only
    cu = [a for a in sys.argv if a.startswith('--closeup=')]
    if cu:
        parts = cu[0][10:].split(',')
        names = parts[0].split('+')
        K.setup_render(1200, 900, 24)
        sheet([[n for n in names]], os.path.join(SHOTS, 'close_' + names[0] + '.png'), float(parts[3]) if len(parts) > 3 else 3.4,
              float(parts[4]) if len(parts) > 4 else 1.65, yaw=float(parts[1]) if len(parts) > 1 else 15, pitch=float(parts[2]) if len(parts) > 2 else 20,
              spacing=float(parts[5]) if len(parts) > 5 else 2.2)
        return
    for key, names, per in SHEETS:
        if not want(key): continue
        rows = [names[i:i + per] for i in range(0, len(names), per)]
        rg = {'clothes': 2.7, 'hats': 3.7}.get(key, 3.0)
        ty = {'clothes': 1.1}.get(key, 1.7)
        ortho = per * 2.3 + 0.4
        K.setup_render(2000, int(2000 * (rg * len(rows) + 0.4) / ortho), 20)
        for tag, yw in (('', 0), ('_back', 180)):
            sheet(rows, os.path.join(SHOTS, f'sheet_{key}{tag}.png'), ortho, ty, yaw=yw, pitch=18, rowgap=rg)
    if want('lineup'): lineup()


SHEETS = [('hair', [n for n in PIECES if n.startswith('hair_')], 6),
          ('beards', [n for n in PIECES if n.startswith(('beard_', 'mustache_', 'face_', 'glasses_', 'scalp_'))], 6),
          ('clothes', [n for n in PIECES if n in ('tunic', 'smock', 'vest', 'dress', 'apron', 'robe_long', 'cape_long', 'cape_short', 'scarf', 'collar_ruff', 'sash', 'tabard', 'pauldrons', 'pouch_belt')], 7),
          ('hats', [n for n in PIECES if n.startswith(('hat_', 'helm_', 'veil_', 'crown_', 'tiara', 'bandana', 'mitre'))], 6)]


# mirrors of a few entries of engine/npcLooks.ts (the game table) for the dressed-villager lineup render
MODEL = {'ARCHER': 'Ranger', 'WIZARD': 'Mage', 'KNIGHT': 'Knight', 'BARBARIAN': 'Barbarian', 'ROGUE': 'Rogue_Hooded'}
LINEUP = [
    dict(name='Mira', base='WIZARD', face='KNIGHT', skin='#ffdcc2', hair='#5d3a2e', shirt='#8a68d8', pants='#5a4a8a',
         wear=[('hair_long_straight',), ('face_blush',), ('dress', '#8a68d8', '#ffd36a'), ('hat_witch', '#6a4cc0', '#ffd36a')]),
    dict(name='Elder Tobin', base='BARBARIAN', face='WIZARD', skin='#fbcfa8', hair='#ebe8e2', shirt='#b99a68', pants='#7a6a50',
         wear=[('hair_bald_fringe',), ('beard_full',), ('robe_long', '#b99a68', '#e6d3a0')]),
    dict(name='Brenna', base='ARCHER', face='KNIGHT', skin='#ffdcc2', hair='#8d4a22', shirt='#f3e6c8', pants='#7a5a3a',
         wear=[('hair_braid',), ('face_blush',), ('smock', '#f3e6c8', '#d9b56a'), ('apron', '#6bb868', '#f6ecd2'), ('hat_straw_farmer', '#f3d27a', '#e5483f')]),
    dict(name='Garrick', base='KNIGHT', face='ARCHER', skin='#e9ad80', hair='#7c746e', shirt='#4a6bc0', pants='#4a5a7a', armor='#c3d0e0', acc='#3d5fc0',
         wear=[('mustache_walrus',), ('tabard', '#3d5fc0', '#f7c548'), ('pauldrons',), ('helm_kettle', '#3d5fc0', '#f7c548')]),
    dict(name='Dorn', base='BARBARIAN', face='ARCHER', skin='#e9ad80', hair='#3a2a20', shirt='#8a5a3a', pants='#6a5038',
         wear=[('hair_short_tousled',), ('beard_full',), ('vest', '#8a5a3a', '#c9a46a'), ('pouch_belt',), ('bandana', '#e5483f', '#fff0d0')]),
    dict(name='Fenn', base='ARCHER', face='ARCHER', skin='#ffdcc2', hair='#e9c35c', shirt='#f1e6d2', pants='#4a6a9a',
         wear=[('hair_short_tousled',), ('beard_goatee',), ('tunic', '#d94f6a', '#f7c548'), ('hat_bard', '#3f9bd0', '#f7c548')]),
    dict(name='Queen Aelia', base='WIZARD', face='KNIGHT', skin='#ffdcc2', hair='#f0d68a', shirt='#f4ecd8', pants='#d8c8a8',
         wear=[('hair_long_straight',), ('face_blush',), ('cape_long', '#3a5fa8', '#f6f1e6'), ('dress', '#f6eedc', '#d8b45a'), ('tiara_queen',)]),
    dict(name='Captain Rhea', base='ARCHER', face='ARCHER', skin='#e9ad80', hair='#1f1f2a', shirt='#2f4a7f', pants='#2a3a5a',
         wear=[('hair_ponytail',), ('tunic', '#2f4a7f', '#f7c548'), ('sash', '#e5483f'), ('cape_short', '#2f4a7f', '#f7c548'), ('hat_tricorn', '#2a3f6a', '#f7c548')]),
]


def lineup():
    clear_preview()
    K.rect('floor', 0, 0, 600, 600, '#d9cfb4', -0.02)
    n = len(LINEUP)
    for k, L in enumerate(LINEUP):
        cols = {'skin': L['skin'], 'hair': L['hair'], 'shirt': L['shirt'], 'pants': L['pants'], 'acc': L.get('acc', '#ffffff'), 'armor': L.get('armor', '#ffffff')}
        meshes = make_man(MODEL[L['base']], MODEL[L['face']], {r: lin3(c) for r, c in cols.items()})
        x = (k - (n - 1) / 2) * 2.5
        place_man(meshes, x, 0)
        for w in L['wear']:
            rc = {'main': w[1] if len(w) > 1 else '#ffffff', 'second': w[2] if len(w) > 2 else '#ffffff', 'hair': L['hair'], 'skin': L['skin']}
            place_piece(P[w[0]], x, 0, rc)
    K.add_lights()
    K.setup_render(2400, 820, 32)
    K.make_camera(G(0, 1.55, 0), 0, 24, 150, ortho=n * 2.5 + 0.8)
    K.render(os.path.join(SHOTS, 'lineup.png'))


if __name__ == '__main__':
    main()
