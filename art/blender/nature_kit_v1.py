"""Aether Survivor - nature + animals + outskirts kit v1 (cute toy / Zelda: Echoes of Wisdom style).

Rebuild:   python3 art/blender/nature_kit_v1.py               (needs `pip install bpy`, Blender 5.x as a module)
           python3 art/blender/nature_kit_v1.py --no-render   (skip the preview renders)
           python3 art/blender/nature_kit_v1.py --only=nature,animals,outskirts,scene
Outputs:   public/models/town/nature_kit_v1.raw.glb (uncompressed), then compress:
             npx @gltf-transform/cli weld   nature_kit_v1.raw.glb nature_kit_v1.weld.glb
             npx @gltf-transform/cli meshopt nature_kit_v1.weld.glb nature_kit_v1.glb --level medium
           previews go to $NATUREKIT_SHOTS (default art/renders/naturekit/).

Same conventions as town_kit_v2.py: geometry is authored in GAME space (x right, y up, +z toward the viewer = front)
and mapped to Blender (x, -z, y) just before the mesh is created, so the glTF export (+Y up) lands in game space.
Static pieces are ONE mesh object at the origin (origin = ground centre). Animals are an Empty root (named like the
animal) with child meshes `<animal>_body|head|legFL|legFR|legBL|legBR|tail|wingL|wingR`; each child's origin is its
JOINT (so the game just rotates the node). Same 12 v2 material names/colours + leaf_light + barn_red (14), no textures.
Unlike v2 the organic parts (balls) are smooth shaded, architecture is flat shaded, with chamfered (beveled) boxes.
"""
import bpy, bmesh, math, os, sys, random
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
RAW_GLB = os.environ.get('NATUREKIT_RAW', os.path.join(ROOT, 'public/models/town/nature_kit_v1.raw.glb'))
SHOTS = os.environ.get('NATUREKIT_SHOTS', os.path.join(ROOT, 'art/renders/naturekit'))

# ---------------------------------------------------------------- materials (v2 names/colours + 2 new)
PALETTE = {
    'stone': '#efe6d0', 'stone_dark': '#b4a78c', 'wood': '#92603a', 'timber': '#4a2c1a',
    'roof_blue': '#3c56a8', 'gold': '#e8b838', 'window_glow': '#ffd66b', 'flower_red': '#dc3d3d',
    'flower_pink': '#f27aa8', 'leaf': '#4e9a3a', 'awning_blue': '#5b8de0', 'iron': '#2e3036',
    'leaf_light': '#86cc5a', 'barn_red': '#a8452f',
}
ORDER = list(PALETTE)
MI = {k: i for i, k in enumerate(ORDER)}
MATS = []


def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    f = lambda v: v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (f(c[0]), f(c[1]), f(c[2]), 1.0)


def make_materials():
    out = []
    for k in ORDER:
        m = bpy.data.materials.new(k)
        m.use_nodes = True
        bsdf = m.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = lin(PALETTE[k])
        bsdf.inputs['Roughness'].default_value = 0.85
        bsdf.inputs['Metallic'].default_value = 0.0
        if k == 'window_glow':
            bsdf.inputs['Emission Color'].default_value = lin(PALETTE[k])
            bsdf.inputs['Emission Strength'].default_value = 3.0
        m.diffuse_color = lin(PALETTE[k])
        m.use_backface_culling = True
        out.append(m)
    return out


# ---------------------------------------------------------------- builder
T = Matrix.Translation
def Rx(a): return Matrix.Rotation(a, 4, 'X')
def Ry(a): return Matrix.Rotation(a, 4, 'Y')
def Rz(a): return Matrix.Rotation(a, 4, 'Z')
I4 = Matrix.Identity(4)
YV = Vector((0, 1, 0))


def G(x, y, z): return Vector((x, -z, y))


def dirrot(p0, p1):
    d = (Vector(p1) - Vector(p0))
    return YV.rotation_difference(d.normalized()).to_matrix().to_4x4(), d.length


class B:
    def __init__(s, name):
        s.name = name; s.bm = bmesh.new(); s.M = I4.copy(); s.stack = []

    def push(s, M): s.stack.append(s.M); s.M = s.M @ M
    def pop(s): s.M = s.stack.pop()

    def _fin(s, verts, mat, M, smooth=False):
        bmesh.ops.transform(s.bm, matrix=s.M @ M, verts=verts)
        mi = MI[mat]
        for v in verts:
            for f in v.link_faces:
                f.material_index = mi; f.smooth = smooth

    # ---- primitives
    def ball(s, pos, r, mat, sq=(1, 1, 1), seg=10, rings=7, smooth=True, rot=None):
        v = bmesh.ops.create_uvsphere(s.bm, u_segments=seg, v_segments=rings, radius=1.0)['verts']
        s._fin(v, mat, T(pos) @ (rot or I4) @ Matrix.Diagonal((r * sq[0], r * sq[1], r * sq[2], 1)) @ Rx(math.pi / 2), smooth)

    def box(s, pos, size, mat, rot=None):
        v = bmesh.ops.create_cube(s.bm, size=1.0)['verts']
        s._fin(v, mat, T(pos) @ (rot or I4) @ Matrix.Diagonal((size[0], size[1], size[2], 1)))

    def rbox(s, pos, size, mat, r=0.08, rot=None, seg=1, smooth=False):
        """chamfered / rounded box (all edges beveled)"""
        bm = s.bm
        before = set(bm.verts)
        v = bmesh.ops.create_cube(bm, size=1.0)['verts']
        bmesh.ops.transform(bm, matrix=Matrix.Diagonal((size[0], size[1], size[2], 1)), verts=v)
        edges = list({e for vv in v for e in vv.link_edges})
        r = min(r, 0.49 * min(size))
        bmesh.ops.bevel(bm, geom=edges, offset=r, offset_type='OFFSET', segments=seg, profile=0.5, affect='EDGES')
        nv = [x for x in bm.verts if x not in before]
        s._fin(nv, mat, T(pos) @ (rot or I4), smooth)

    def bx(s, x0, x1, y0, y1, z0, z1, mat, r=0.08, rot=None):
        s.rbox(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (x1 - x0, y1 - y0, z1 - z0), mat, r, rot)

    def cyl(s, pos, r1, r2, h, segs, mat, axis='y', rot=None, smooth=False):
        """frustum; radii are APOTHEMS. r1/r2 = 0 -> cone. flat faces align to +-z / +-x"""
        c = math.cos(math.pi / segs)
        sd = 360.0 / segs
        delta = math.radians((270 - sd / 2) % sd)
        v = bmesh.ops.create_cone(s.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1 / c,
                                  radius2=r2 / c, depth=h)['verts']
        if r1 == 0 or r2 == 0:
            bmesh.ops.remove_doubles(s.bm, verts=v, dist=1e-4)
            v = [x for x in v if x.is_valid]
        ax = {'y': Rx(-math.pi / 2), 'z': I4, 'x': Ry(math.pi / 2)}[axis]
        s._fin(v, mat, T(pos) @ (rot or I4) @ ax @ Rz(delta), smooth)

    def limb(s, p0, p1, r0, r1, mat, segs=8):
        """frustum between two points (r0 at p0, r1 at p1)"""
        rot, L = dirrot(p0, p1)
        mid = (Vector(p0) + Vector(p1)) / 2
        s.cyl(tuple(mid), r0, r1, L, segs, mat, rot=rot)

    def strut(s, p0, p1, tx, tz, mat, r=0.05):
        rot, L = dirrot(p0, p1)
        mid = (Vector(p0) + Vector(p1)) / 2
        s.rbox(tuple(mid), (tx, L, tz), mat, r, rot=rot)

    def lathe(s, pts, mat, segs=10, pos=(0, 0, 0), M=None, smooth=False, closed=False):
        """revolve a (radius, y) profile around the y axis. Profile must be closed: start/end on the axis
        (r == 0) or closed=True (ring / torus)."""
        bm = s.bm
        angs = [2 * math.pi * k / segs for k in range(segs)]
        rings = []
        for r, y in pts:
            if r <= 1e-6: rings.append([bm.verts.new((0, y, 0))])
            else: rings.append([bm.verts.new((r * math.cos(a), y, r * math.sin(a))) for a in angs])
        allv = [v for rg in rings for v in rg]
        n = len(rings)
        for i in range(n if closed else n - 1):
            a, b2 = rings[i], rings[(i + 1) % n]
            for k in range(segs):
                k2 = (k + 1) % segs
                if len(a) == 1: bm.faces.new((a[0], b2[k2], b2[k]))
                elif len(b2) == 1: bm.faces.new((a[k], a[k2], b2[0]))
                else: bm.faces.new((a[k], a[k2], b2[k2], b2[k]))
        s._fin(allv, mat, T(pos) @ (M or I4), smooth)

    def prism(s, pts, z0, z1, mat):
        a = [s.bm.verts.new((x, y, z0)) for x, y in pts]
        b2 = [s.bm.verts.new((x, y, z1)) for x, y in pts]
        n = len(pts)
        s.bm.faces.new(a); s.bm.faces.new(b2)
        for i in range(n):
            j = (i + 1) % n
            s.bm.faces.new((a[i], a[j], b2[j], b2[i]))
        s._fin(a + b2, mat, I4)

    def arch(s, cx, cy, r, z0, z1, mat, n=8):
        pts = [(cx + r * math.cos(math.pi * k / n), cy + r * math.sin(math.pi * k / n)) for k in range(n + 1)]
        s.prism(pts, z0, z1, mat)

    def finish(s, parent=None, pivot=(0, 0, 0), joint=True):
        bm = s.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bmesh.ops.transform(bm, matrix=T((-pivot[0], -pivot[1], -pivot[2])), verts=bm.verts)
        bmesh.ops.transform(bm, matrix=Rx(math.pi / 2), verts=bm.verts)      # game (x,y,z) -> blender (x,-z,y)
        me = bpy.data.meshes.new(s.name)
        bm.to_mesh(me); bm.free()
        for m in MATS: me.materials.append(m)
        if parent is not None and joint:
            # joint node (Empty, named like the part, origin = the joint) wrapping the mesh node `<name>_mesh`.
            # The game rotates the JOINT node; the wrapper also survives gltf-transform meshopt quantization,
            # which otherwise moves the origin of the node that directly holds a mesh to its bbox centre.
            jn = bpy.data.objects.new(s.name, None)
            bpy.context.scene.collection.objects.link(jn)
            jn.location = G(*pivot); jn.parent = parent
            ob = bpy.data.objects.new(s.name + '_mesh', me)
            bpy.context.scene.collection.objects.link(ob)
            ob.parent = jn
            return jn
        ob = bpy.data.objects.new(s.name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = G(*pivot)
        if parent: ob.parent = parent
        return ob


def empty(name):
    o = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(o)
    return o


S, SD, W, TM, RB, GD, GL = 'stone', 'stone_dark', 'wood', 'timber', 'roof_blue', 'gold', 'window_glow'
FR, FP, L, AB, IR, LL, BR = 'flower_red', 'flower_pink', 'leaf', 'awning_blue', 'iron', 'leaf_light', 'barn_red'

# ================================================================= TREES + PLANTS
def trunk(b, h, r0=0.42, r1=0.3, segs=8):
    b.cyl((0, h / 2, 0), r0, r1, h, segs, W)
    for a in (0.3, 2.3, 4.2):
        b.ball((math.cos(a) * r0 * 0.95, 0.12, math.sin(a) * r0 * 0.95), 0.26, W, sq=(1, 0.6, 1), seg=6, rings=4)


def tree_round(name, th, balls, tr=(0.42, 0.3)):
    b = B(name)
    trunk(b, th, *tr)
    for x, y, z, r, m in balls:
        b.ball((x, y, z), r, m, sq=(1, 0.92, 1), seg=10, rings=6)
    return b.finish()


def build_trees():
    P = {}
    P['tree_round_a'] = tree_round('tree_round_a', 1.9, [
        (0, 3.75, 0, 1.55, LL), (-1.2, 3.1, 0.3, 1.0, L), (1.25, 3.2, -0.2, 1.05, L), (0.1, 3.0, 1.1, 0.95, L),
        (0.35, 5.0, 0, 0.85, LL), (-0.7, 4.5, -0.8, 0.8, LL)])
    P['tree_round_b'] = tree_round('tree_round_b', 1.7, [
        (0, 3.6, 0, 1.25, L), (0.15, 4.75, 0.05, 0.95, LL), (-0.95, 3.2, 0.25, 0.85, LL), (0.95, 3.3, -0.1, 0.85, L),
        (0, 3.1, 0.95, 0.75, LL)], tr=(0.34, 0.24))
    P['tree_round_c'] = tree_round('tree_round_c', 1.3, [
        (0, 2.9, 0, 1.45, L), (-1.45, 2.55, 0.2, 1.0, LL), (1.5, 2.6, 0, 1.05, LL), (0.2, 2.6, 1.4, 0.95, LL),
        (-0.3, 2.6, -1.4, 1.0, L), (0.2, 3.95, 0.1, 1.0, LL)], tr=(0.5, 0.38))
    return P


def pine(name, tiers, th=1.2):
    b = B(name)
    b.cyl((0, th / 2, 0), 0.38, 0.3, th, 8, W)
    for a in (0.3, 2.3, 4.2):
        b.ball((math.cos(a) * 0.36, 0.12, math.sin(a) * 0.36), 0.26, W, sq=(1, 0.6, 1), seg=6, rings=4)
    for y0, R, h, m in tiers:
        pts = [(0, y0), (R * 0.9, y0), (R, y0 + h * 0.16), (R * 0.66, y0 + h * 0.5), (R * 0.34, y0 + h * 0.78), (0, y0 + h)]
        b.lathe(pts, m, segs=10)
    return b.finish()


def palm(name, lean, nleaf, hgt=4.6, flip=1):
    b = B(name)
    N = 6
    pts = []
    for i in range(N + 1):
        t = i / N
        pts.append((flip * lean * t * t, hgt * t, 0.0))
    for i in range(N):
        p0, p1 = Vector(pts[i]), Vector(pts[i + 1])
        rot, Ld = dirrot(p0, p1)
        mid = (p0 + p1) / 2
        rr = 0.34 - 0.13 * (i / N)
        b.ball(tuple(mid), 1.0, W if i % 2 == 0 else SD, sq=(rr * 1.05, Ld * 0.58, rr * 1.05), seg=8, rings=4, rot=rot)
    crown = Vector(pts[-1])
    b.ball(tuple(crown + Vector((0, 0.1, 0))), 0.42, LL, seg=7, rings=5)
    rnd = random.Random(7 + nleaf)
    for k in range(nleaf):
        yaw = 2 * math.pi * k / nleaf + rnd.uniform(-0.12, 0.12)
        droop = 0.5 + 0.35 * (k % 2) + rnd.uniform(-0.05, 0.05)
        rot = Ry(yaw) @ Rx(droop)
        cen = crown + (Ry(yaw) @ Rx(droop)).to_3x3() @ Vector((0, 0, 1.45)) + Vector((0, 0.15, 0))
        b.ball(tuple(cen), 1.0, L if k % 2 == 0 else LL, sq=(0.62, 0.12, 1.5), seg=8, rings=4, rot=rot)
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.5
        b.ball(tuple(crown + Vector((math.cos(a) * 0.33, -0.28, math.sin(a) * 0.33))), 0.2, TM, seg=7, rings=4)
    return b.finish()


def build_plants():
    P = {}
    P['bush_round'] = None
    b = B('bush_round')
    for x, y, z, r, m in [(0, .75, 0, .9, L), (.65, .55, .45, .62, LL), (-.7, .55, .3, .6, L), (.1, .52, -.7, .6, LL), (0, 1.25, .05, .6, LL)]:
        b.ball((x, y, z), r, m, seg=9, rings=6)
    P['bush_round'] = b.finish()

    b = B('bush_flower')
    balls = [(0, .75, 0, .9, L), (.65, .55, .45, .62, LL), (-.7, .55, .3, .6, L), (.1, .52, -.7, .6, LL)]
    for x, y, z, r, m in balls: b.ball((x, y, z), r, m, seg=9, rings=6)
    cols = [FR, FP, GD, S, FP, FR, GD, S, FR]
    dirs = [(.2, .9, .4), (-.5, .7, .6), (.7, .6, .35), (-.3, .95, -.1), (.55, .2, .85), (-.85, .3, .3), (.1, .5, 1.0), (.9, .2, -.2), (0, .8, -.8)]
    cs = [balls[0], balls[2], balls[1], balls[0], balls[1], balls[2], balls[0], balls[1], balls[3]]
    for i, (d, c) in enumerate(zip(dirs, cs)):
        v = Vector(d).normalized() * c[3] * 0.97 + Vector(c[:3])
        b.ball(tuple(v), 0.15, cols[i], seg=6, rings=4)
        b.ball(tuple(v + Vector(d).normalized() * 0.1), 0.06, GD if cols[i] != GD else FR, seg=5, rings=3)
    P['bush_flower'] = b.finish()

    b = B('hedge_block')
    b.rbox((0, 0.5, 0), (2.0, 1.0, 0.95), L, r=0.3, seg=2, smooth=True)
    for x in (-0.6, 0.0, 0.6):
        b.ball((x, 1.02, 0.0), 0.4, LL, sq=(1.1, 0.8, 1.0), seg=8, rings=5)
    P['hedge_block'] = b.finish()

    b = B('flower_patch')
    b.ball((0, 0.05, 0), 0.9, LL, sq=(1, 0.18, 1), seg=10, rings=5)
    rnd = random.Random(3)
    cols = [FR, FP, GD, AB, S, FR, FP, GD]
    for i in range(8):
        a = 2 * math.pi * i / 8 + rnd.uniform(-0.2, 0.2)
        rr = rnd.uniform(0.15, 0.62)
        x, z = math.cos(a) * rr, math.sin(a) * rr
        h = rnd.uniform(0.35, 0.6)
        b.limb((x, 0.05, z), (x, 0.05 + h, z), 0.035, 0.03, L, segs=4)
        b.ball((x, 0.05 + h + 0.04, z), 0.15, cols[i], sq=(1, 0.8, 1), seg=7, rings=5)
        b.ball((x, 0.05 + h + 0.11, z), 0.06, GD if cols[i] != GD else FR, seg=5, rings=3)
        b.ball((x + 0.12, 0.2, z), 0.12, L, sq=(1, .35, .5), seg=5, rings=3)
    P['flower_patch'] = b.finish()

    b = B('grass_tuft')
    rnd = random.Random(11)
    for i in range(9):
        a = 2 * math.pi * i / 9 + rnd.uniform(-0.2, 0.2)
        rr = rnd.uniform(0.0, 0.28)
        x, z = math.cos(a) * rr, math.sin(a) * rr
        h = rnd.uniform(0.55, 0.95)
        lean = rnd.uniform(0.15, 0.4)
        tip = (x + math.cos(a) * lean, h, z + math.sin(a) * lean)
        b.limb((x, 0, z), tip, 0.12, 0.0, L if i % 2 else LL, segs=4)
    P['grass_tuft'] = b.finish()

    b = B('mushroom_cluster')
    for x, z, R, hh, cm in [(0, 0, .5, .55, FR), (.65, .35, .32, .38, FP), (-.45, .5, .26, .3, FR)]:
        b.cyl((x, hh / 2, z), R * .42, R * .3, hh, 8, S)
        prof = [(0, 0)] + [(R * math.cos(a), hh - .02 + .62 * R * math.sin(a)) for a in [0, .3, .6, .9, 1.2, math.pi / 2]]
        prof = [(0, hh - 0.04)] + [(R * math.cos(a), hh - 0.04 + 0.6 * R * math.sin(a)) for a in (0, .35, .7, 1.05, 1.35)] + [(0, hh - 0.04 + 0.62 * R)]
        b.lathe(prof, cm, segs=9, pos=(x, 0, z), smooth=True)
        for k in range(4):
            a = k * 1.6 + 0.4
            rr = R * 0.55
            b.ball((x + math.cos(a) * rr, hh - 0.04 + 0.6 * R * 0.78, z + math.sin(a) * rr), R * 0.14, S, sq=(1, 0.5, 1), seg=5, rings=3)
    P['mushroom_cluster'] = b.finish()

    b = B('rock_round_a')
    b.ball((0, 0.7, 0), 1.0, SD, sq=(1.25, 0.8, 1.05), seg=9, rings=6)
    b.ball((1.15, 0.38, 0.5), 0.55, SD, sq=(1, 0.75, 1), seg=8, rings=5)
    b.ball((-0.9, 0.3, 0.85), 0.4, SD, sq=(1, 0.75, 1), seg=7, rings=5)
    b.ball((-0.1, 1.28, -0.05), 0.55, LL, sq=(1.1, 0.28, 1.0), seg=8, rings=4)
    P['rock_round_a'] = b.finish()
    b = B('rock_round_b')
    b.ball((0, 0.55, 0), 0.8, SD, sq=(1.3, 0.8, 1.0), seg=9, rings=6, rot=Ry(0.5))
    b.ball((0.75, 0.3, -0.35), 0.42, SD, sq=(1.1, 0.75, 1), seg=7, rings=5)
    b.ball((-0.2, 0.28, 0.85), 0.35, SD, sq=(1, 0.75, 1), seg=7, rings=4)
    b.ball((0.6, 0.35, 0.65), 0.3, S, sq=(1, 0.7, 1), seg=6, rings=4)
    P['rock_round_b'] = b.finish()
    return P


# ================================================================= PARK
def build_park():
    P = {}
    b = B('park_bench')
    b.rbox((0, 0.55, 0.02), (1.9, 0.14, 0.62), W, 0.06)
    b.rbox((0, 0.97, -0.3), (1.9, 0.42, 0.1), W, 0.05, rot=Rx(0.14))
    for sx in (-0.82, 0.82):
        b.rbox((sx, 0.27, 0.0), (0.16, 0.56, 0.52), TM, 0.05)
        b.rbox((sx, 0.76, 0.0), (0.16, 0.12, 0.6), TM, 0.05)
        b.rbox((sx, 0.8, -0.3), (0.16, 0.85, 0.12), TM, 0.05, rot=Rx(0.14))
    b.rbox((0, 0.7, 0.3), (1.9, 0.06, 0.04), TM, 0.01)    # board gap line is cosmetic only
    P['park_bench'] = b.finish()

    b = B('park_fountain')
    b.lathe([(0, 0), (1.95, 0), (2.05, .25), (2.05, .65), (1.9, .82), (1.65, .82), (1.55, .62), (0, .62)], SD, segs=12)
    b.cyl((0, 0.58, 0), 1.5, 1.5, 0.14, 12, AB)
    b.lathe([(0, .6), (.55, .6), (.34, 1.0), (.27, 1.5), (0, 1.5)], S, segs=10)
    b.lathe([(0, 1.45), (.35, 1.5), (.95, 1.95), (1.0, 2.1), (.82, 2.1), (.56, 1.86), (0, 1.86)], S, segs=12)
    b.cyl((0, 1.98, 0), .6, .6, .1, 10, AB)
    b.ball((0, 2.4, 0), .3, AB, sq=(1, 1.4, 1), seg=8, rings=6)
    b.ball((0, 2.82, 0), .13, AB, seg=6, rings=4)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        b.ball((math.cos(a) * 1.78, 0.95, math.sin(a) * 1.78), 0.28, S, sq=(1, .8, 1), seg=7, rings=5)
    P['park_fountain'] = b.finish()

    b = B('stone_path_tile')
    b.lathe([(0, 0), (.58, 0), (.62, .1), (.55, .2), (.35, .24), (0, .24)], S, segs=9, smooth=False)
    b.ball((.1, .22, -.05), .16, SD, sq=(1, .3, 1), seg=6, rings=4)
    P['stone_path_tile'] = b.finish()

    b = B('fence_wood')
    for x in (-1.0, 1.0):
        b.rbox((x, 0.55, 0), (0.24, 1.1, 0.24), W, 0.07)
        b.ball((x, 1.12, 0), 0.17, W, sq=(1, 0.7, 1), seg=7, rings=5)
    for y in (0.35, 0.78):
        b.rbox((0, y, -0.1), (2.0, 0.15, 0.1), W, 0.04)
    for i in range(5):
        x = -0.72 + i * 0.36
        b.rbox((x, 0.5, 0.04), (0.24, 0.95, 0.1), S, 0.05)
        b.ball((x, 0.97, 0.04), 0.125, S, sq=(1, .75, .45), seg=7, rings=5)
    P['fence_wood'] = b.finish()

    b = B('gazebo')
    b.cyl((0, 0.17, 0), 2.9, 2.9, 0.35, 12, SD)
    b.cyl((0, 0.38, 0), 2.7, 2.7, 0.08, 12, W)
    n = 6
    for k in range(n):
        a = math.pi / n + 2 * math.pi * k / n
        x, z = math.sin(a) * 2.35, math.cos(a) * 2.35
        b.cyl((x, 1.6, z), .15, .15, 2.4, 8, S)
        b.ball((x, 0.5, z), 0.24, SD, sq=(1, .7, 1), seg=7, rings=4)
        a2 = a + 2 * math.pi / n
        if k != n - 1 and not (abs(math.sin(a)) < 0.6 and math.cos(a) > 0 and abs(math.sin(a2)) < 0.6 and math.cos(a2) > 0):
            x2, z2 = math.sin(a2) * 2.35, math.cos(a2) * 2.35
            mx, mz = (x + x2) / 2, (z + z2) / 2
            ang = math.atan2(x2 - x, z2 - z)
            ln = math.hypot(x2 - x, z2 - z) - 0.25
            b.rbox((mx, 1.0, mz), (0.1, 0.12, ln), W, 0.03, rot=Ry(ang))
            b.rbox((mx, 0.62, mz), (0.1, 0.1, ln), W, 0.03, rot=Ry(ang))
    b.lathe([(2.1, 2.75), (2.85, 2.75), (2.85, 3.05), (2.1, 3.05)], SD, segs=12, closed=True)
    b.lathe([(0, 3.0), (3.4, 3.0), (3.4, 3.22), (2.6, 3.5), (1.6, 3.95), (.6, 4.55), (0, 4.9)], RB, segs=12)
    b.ball((0, 5.0, 0), 0.24, GD, seg=8, rings=5)
    b.rbox((0, .12, 3.15), (2.0, .25, .8), S, .06)
    b.rbox((0, .06, 3.75), (2.4, .12, .5), SD, .04)
    P['gazebo'] = b.finish()

    b = B('well')
    b.lathe([(0, 0), (1.25, 0), (1.25, .95), (1.12, 1.1), (.9, 1.1), (.8, .95), (.8, .3), (0, .3)], S, segs=10)
    b.lathe([(.86, 1.08), (1.22, 1.08), (1.22, 1.2), (.86, 1.2)], SD, segs=10, closed=True)
    b.lathe([(1.2, .35), (1.3, .35), (1.3, .5), (1.2, .5)], SD, segs=10, closed=True)
    b.cyl((0, .68, 0), .74, .74, .08, 10, AB)
    for sx in (-1.12, 1.12):
        b.rbox((sx, 2.05, 0), (.2, 1.95, .2), W, .06)
    b.rbox((0, 2.9, 0), (2.5, .2, .24), TM, .05)
    b.cyl((0, 2.3, 0), .09, .09, 2.2, 6, TM, axis='x')
    b.limb((0, 2.3, 0), (0, 1.55, 0), .03, .03, TM, segs=4)
    b.cyl((0, 1.38, 0), .22, .17, .3, 8, W)
    b.push(Ry(math.pi / 2))
    b.pop()
    half, rise, ov, th = 1.1, 0.95, 0.35, 0.16
    ang = math.atan2(rise, half)
    for sd in (-1, 1):
        Ev = Vector((sd * (half + ov), 2.95 + 0.0 - rise * ov / half, 0))
        Rv = Vector((0, 2.95 + rise, 0))
        u = (Rv - Ev).normalized(); nr = Vector((sd * rise, half)).normalized()
        Lg = (Rv - Ev).length
        c = (Ev + Rv) / 2 + Vector((nr.x, nr.y, 0)) * (th / 2 + 0.03)
        b.rbox((c.x, c.y, 0), (Lg + 0.08, th, 1.55), RB, 0.05, rot=Rz(math.atan2(u.y, u.x)))
    b.rbox((0, 2.95 + rise + 0.2, 0), (0.3, 0.2, 1.6), SD, .05)
    P['well'] = b.finish()

    b = B('signpost')
    b.rbox((0, 1.2, 0), (0.24, 2.4, 0.24), W, 0.07)
    b.ball((0, 2.45, 0), 0.19, W, sq=(1, .8, 1), seg=7, rings=5)
    b.ball((0, 0.1, 0), 0.45, LL, sq=(1.2, .45, 1.2), seg=8, rings=4)
    for y, sd, yaw in ((2.0, 1, 0.12), (1.5, -1, -0.1)):
        b.push(T((0, y, 0.0)) @ Ry(yaw))
        b.rbox((sd * 0.6, 0, 0.17), (1.3, 0.42, 0.1), S, 0.05)
        b.rbox((sd * 1.28, 0, 0.17), (0.4, 0.4, 0.1), S, 0.04, rot=Rz(math.pi / 4))
        for k, ln in enumerate((0.7, 0.45)):
            b.box((sd * (0.35 + ln / 2 - 0.1), 0.07 - k * 0.14, 0.235), (ln, 0.07, 0.03), TM)
        b.pop()
    P['signpost'] = b.finish()
    return P


# ================================================================= ANIMALS
def eye(b, x, y, z, r=0.06):
    b.ball((x, y, z), r, IR, seg=5, rings=3)


def leg(b, x, ytop, z, r, h, m, hoof=None):
    """rounded ellipsoid leg hanging from the hip (ytop) to the ground; optional hoof ball"""
    b.ball((x, ytop - h / 2 + 0.02, z), 1.0, m, sq=(r, h / 2 + 0.02, r), seg=7, rings=4)
    if hoof:
        b.ball((x, 0.09, z + 0.025), 1.0, hoof, sq=(r * 1.05, 0.11, r * 1.25), seg=6, rings=4)


def animal(name, parts):
    root = empty(name)
    for suf, b, piv in parts:
        b.name = f'{name}_{suf}'
        b.finish(root, piv)
    return root


def build_cow():
    body = B('b'); b = body
    b.ball((0, 1.1, 0), 1, S, sq=(.76, .7, 1.0), seg=10, rings=7)
    for pos, sq in (((.7, 1.3, .35), (.3, 1, 1)), ((-.7, 1.0, -.3), (.3, 1, 1.1)), ((.1, 1.77, -.3), (1, .3, 1)), ((-.5, 1.62, .45), (1, .3, 1))):
        b.ball(pos, .34, IR, sq=sq, seg=6, rings=4)
    b.ball((0, .5, -.35), .27, FP, sq=(.9, .65, .8), seg=7, rings=4)
    head = B('h'); h = head
    h.ball((0, 1.45, 1.2), .5, S, sq=(1, .95, 1), seg=9, rings=6)
    h.ball((0, 1.27, 1.68), .4, FP, sq=(.85, .6, .6), seg=8, rings=5)
    for sx in (-1, 1):
        eye(h, sx * .3, 1.6, 1.58)
        h.ball((sx * .13, 1.3, 1.95), .05, IR, seg=5, rings=3)
        h.ball((sx * .6, 1.68, 1.1), .26, S, sq=(.8, .3, .5), seg=6, rings=4, rot=Rz(sx * .5))
        h.limb((sx * .28, 1.88, 1.18), (sx * .4, 2.16, 1.2), .1, .02, GD, segs=5)
    h.ball((0, 1.9, 1.15), .2, IR, sq=(1.2, .6, 1), seg=6, rings=4)
    parts = [('body', body, (0, 1.1, 0)), ('head', head, (0, 1.4, .85))]
    for nm, x, z in (('legFL', .4, .55), ('legFR', -.4, .55), ('legBL', .4, -.55), ('legBR', -.4, -.55)):
        lb = B('l'); leg(lb, x, .85, z, .19, .85, S, IR)
        parts.append((nm, lb, (x, .85, z)))
    tl = B('t')
    tl.limb((0, 1.45, -.98), (0, .85, -1.1), .06, .05, S, segs=6)
    tl.ball((0, .78, -1.1), .14, IR, sq=(1, 1.3, 1), seg=6, rings=4)
    parts.append(('tail', tl, (0, 1.45, -.98)))
    return animal('cow', parts)


def build_sheep():
    body = B('b'); b = body
    b.ball((0, 1.0, 0), 1, S, sq=(.72, .68, .95), seg=9, rings=6)
    for x, y, z, r in [(.55, 1.2, .5, .5), (-.55, 1.2, .5, .5), (.6, 1.15, -.35, .5), (-.6, 1.15, -.35, .5), (0, 1.55, .15, .58),
                       (0, 1.35, -.75, .5), (.45, .72, .1, .45), (-.45, .72, .1, .45)]:
        b.ball((x, y, z), r, S, seg=8, rings=5)
    head = B('h'); h = head
    h.ball((0, 1.15, 1.02), .38, TM, sq=(.85, .95, .95), seg=8, rings=6)
    h.ball((0, 1.55, .95), .3, S, seg=7, rings=5)
    for sx in (-1, 1):
        h.ball((sx * .1 * 3.2, 1.22, 1.28), .09, S, seg=6, rings=4)
        h.ball((sx * .32, 1.22, 1.3 - .0), .035, IR, seg=4, rings=3)
        h.ball((sx * .45, 1.17, .95), .22, TM, sq=(.9, .25, .45), seg=6, rings=4, rot=Rz(sx * -.45))
    h.ball((0, 1.02, 1.36), .07, IR, seg=5, rings=3)
    parts = [('body', body, (0, 1.0, 0)), ('head', head, (0, 1.15, .75))]
    for nm, x, z in (('legFL', .3, .42), ('legFR', -.3, .42), ('legBL', .3, -.4), ('legBR', -.3, -.4)):
        lb = B('l'); leg(lb, x, .65, z, .11, .65, TM)
        parts.append((nm, lb, (x, .65, z)))
    tl = B('t'); tl.ball((0, 1.05, -1.05), .22, S, seg=7, rings=5)
    parts.append(('tail', tl, (0, 1.05, -.9)))
    return animal('sheep', parts)


def build_pig():
    body = B('b'); b = body
    b.ball((0, .85, 0), 1, FP, sq=(.68, .6, .88), seg=10, rings=7)
    head = B('h'); h = head
    h.ball((0, .95, .98), .46, FP, sq=(1, .95, .95), seg=9, rings=6)
    h.cyl((0, .86, 1.37), .22, .21, .24, 9, S, axis='z')
    for sx in (-1, 1):
        h.ball((sx * .07, .88, 1.5), .045, FR, seg=5, rings=3)
        eye(h, sx * .27, 1.08, 1.33, .06)
        h.ball((sx * .32, 1.38, .9), .22, FP, sq=(.7, .3, .75), seg=6, rings=4, rot=Rz(sx * -.7))
    parts = [('body', body, (0, .85, 0)), ('head', head, (0, .95, .72))]
    for nm, x, z in (('legFL', .3, .48), ('legFR', -.3, .48), ('legBL', .3, -.5), ('legBR', -.3, -.5)):
        lb = B('l'); lb.cyl((x, .26, z), .13, .15, .52, 7, FP); lb.cyl((x, .05, z + .02), .15, .15, .1, 7, S)
        parts.append((nm, lb, (x, .52, z)))
    tl = B('t')
    tl.ball((0, .95, -.88), .08, FP, seg=5, rings=4); tl.ball((.04, 1.08, -.95), .07, FP, seg=5, rings=4)
    tl.ball((-.02, 1.18, -.9), .06, FP, seg=5, rings=4)
    parts.append(('tail', tl, (0, .95, -.82)))
    return animal('pig', parts)


def build_chicken():
    body = B('b'); b = body
    b.ball((0, .68, 0), 1, S, sq=(.5, .52, .54), seg=10, rings=7)
    head = B('h'); h = head
    h.ball((0, 1.22, .38), .27, S, seg=8, rings=6)
    h.cyl((0, 1.18, .71), .1, 0, .22, 5, GD, axis='z')
    for z, y, r in ((.34, 1.52, .1), (.43, 1.5, .08), (.25, 1.5, .08)):
        h.ball((0, y, z), r, FR, seg=6, rings=4)
    h.ball((0, 1.0, .58), .07, FR, sq=(.8, 1.2, .8), seg=5, rings=4)
    for sx in (-1, 1): eye(h, sx * .16, 1.27, .58, .045)
    parts = [('body', body, (0, .68, 0)), ('head', head, (0, 1.0, .35))]
    for sx, nm in ((-1, 'wingL'), (1, 'wingR')):
        w = B('w'); w.ball((sx * .5, .72, -.02), .5, SD, sq=(.13, .5, .72), seg=7, rings=5, rot=Rz(sx * -.18))
        parts.append((nm, w, (sx * .45, .9, 0)))
    for sx, nm in ((-1, 'legL'), (1, 'legR')):
        lg = B('l'); lg.limb((sx * .2, .3, .02), (sx * .2, .03, .02), .05, .04, GD, segs=5)
        lg.rbox((sx * .2, .03, .1), (.22, .06, .3), GD, .02)
        parts.append((nm, lg, (sx * .2, .3, 0)))
    tl = B('t')
    for a, y in ((-.4, 1.0), (0, 1.1), (.4, 1.0)):
        tl.ball((a * .4, y, -.55), .3, S if a == 0 else SD, sq=(.35, 1, .55), seg=6, rings=4, rot=Rz(a * .5) @ Rx(-.3))
    parts.append(('tail', tl, (0, .8, -.45)))
    return animal('chicken', parts)


def build_horse():
    body = B('b'); b = body
    b.ball((0, 1.35, 0), 1, W, sq=(.58, .6, 1.05), seg=9, rings=6)
    head = B('h'); h = head
    h.ball((0, 1.85, .98), .34, W, sq=(.85, 1.6, .85), seg=7, rings=5, rot=Rx(.55))
    h.ball((0, 2.2, 1.4), .4, W, sq=(.85, .85, 1.0), seg=7, rings=5)
    h.ball((0, 2.05, 1.8), .31, S, sq=(.75, .72, .8), seg=7, rings=5)
    for sx in (-1, 1):
        eye(h, sx * .3, 2.3, 1.55, .06)
        h.ball((sx * .1, 2.0, 2.1), .04, IR, seg=4, rings=3)
        h.limb((sx * .17, 2.5, 1.2), (sx * .2, 2.85, 1.15), .1, .02, W, segs=5)
    for y, z, r in ((2.5, 1.2, .18), (2.3, .95, .2), (2.05, .72, .2), (1.78, .56, .2)):
        h.ball((0, y, z), r, TM, seg=6, rings=4)
    h.ball((0, 2.55, 1.5), .15, TM, sq=(.9, 1.2, .9), seg=6, rings=4)
    parts = [('body', body, (0, 1.35, 0)), ('head', head, (0, 1.7, .75))]
    for nm, x, z in (('legFL', .38, .68), ('legFR', -.38, .68), ('legBL', .38, -.68), ('legBR', -.38, -.68)):
        lb = B('l'); leg(lb, x, 1.0, z, .17, 1.0, W, TM)
        lb.cyl((x, .24, z), .15, .15, .12, 7, S)
        parts.append((nm, lb, (x, 1.0, z)))
    tl = B('t')
    tl.ball((0, 1.2, -1.22), .28, TM, sq=(.8, 2.0, .8), seg=7, rings=5, rot=Rx(-.2))
    parts.append(('tail', tl, (0, 1.6, -1.0)))
    sd = B('s')
    sd.box((0, 1.88, 0.05), (1.15, .1, .85), S)
    sd.rbox((0, 1.97, 0.02), (.86, .15, .7), BR, .07)
    sd.ball((0, 2.07, .38), .13, BR, seg=6, rings=4)
    sd.box((0, 2.04, -.32), (.8, .22, .1), BR)
    for sx in (-1, 1):
        sd.limb((sx * .55, 1.88, .05), (sx * .62, 1.3, .05), .03, .03, TM, segs=4)
        sd.box((sx * .62, 1.25, .05), (.18, .05, .22), GD)
    parts.append(('saddle', sd, (0, 1.35, 0)))
    return animal('horse', parts)


def build_cat():
    body = B('b'); b = body
    b.ball((0, .48, 0), 1, W, sq=(.32, .3, .52), seg=9, rings=6)
    for z in (.18, -.05, -.28):
        b.ball((0, .74, z), .17, TM, sq=(.9, .22, .5), seg=5, rings=3)
    head = B('h'); h = head
    h.ball((0, .9, .52), .3, W, sq=(1.12, .95, .92), seg=9, rings=6)
    h.ball((0, .8, .78), .13, S, sq=(1, .75, .8), seg=6, rings=4)
    h.ball((0, .85, .88), .04, FP, seg=4, rings=3)
    for sx in (-1, 1):
        h.cyl((sx * .19, 1.16, .5), .11, 0, .22, 4, W, rot=Rz(sx * -.25))
        eye(h, sx * .13, .96, .78, .05)
    parts = [('body', body, (0, .48, 0)), ('head', head, (0, .75, .42))]
    for nm, x, z in (('legFL', .17, .3), ('legFR', -.17, .3), ('legBL', .17, -.3), ('legBR', -.17, -.3)):
        lb = B('l'); lb.cyl((x, .17, z), .07, .085, .34, 6, W); lb.ball((x, .07, z + .03), .1, S, sq=(1, .7, 1.2), seg=6, rings=4)
        parts.append((nm, lb, (x, .34, z)))
    tl = B('t')
    pts = [(0, .52, -.5), (0, .6, -.75), (0, .9, -.9), (0, 1.25, -.88)]
    for i in range(3): tl.limb(pts[i], pts[i + 1], .06, .05, W, segs=5)
    tl.ball(pts[3], .07, S, seg=5, rings=4)
    parts.append(('tail', tl, (0, .52, -.5)))
    return animal('cat', parts)


def build_dog():
    body = B('b'); b = body
    b.ball((0, .6, 0), 1, S, sq=(.37, .35, .62), seg=9, rings=6)
    b.ball((.15, .9, -.1), .3, W, sq=(1, .4, 1.3), seg=6, rings=4)
    head = B('h'); h = head
    h.ball((0, .98, .62), .32, S, seg=9, rings=6)
    h.ball((0, .88, .95), .2, S, sq=(.9, .75, 1), seg=7, rings=5)
    h.ball((0, .93, 1.14), .07, IR, seg=5, rings=4)
    h.ball((0, .76, 1.0), .06, FP, sq=(1, .5, 1.4), seg=5, rings=3)
    for sx in (-1, 1):
        eye(h, sx * .15, 1.07, .9, .05)
        h.ball((sx * .33, .98, .6), .2, W, sq=(.35, 1, .6), seg=6, rings=4, rot=Rz(sx * -.35))
    h.ball((.14, 1.1, .85), .1, W, sq=(1, 1, .7), seg=5, rings=3)
    parts = [('body', body, (0, .6, 0)), ('head', head, (0, .85, .5))]
    for nm, x, z in (('legFL', .2, .38), ('legFR', -.2, .38), ('legBL', .2, -.38), ('legBR', -.2, -.38)):
        lb = B('l'); lb.cyl((x, .2, z), .09, .1, .4, 6, S); lb.ball((x, .07, z + .03), .12, S, sq=(1, .65, 1.2), seg=6, rings=4)
        parts.append((nm, lb, (x, .42, z)))
    tl = B('t')
    tl.limb((0, .7, -.6), (0, 1.0, -.82), .08, .05, W, segs=5)
    tl.ball((0, 1.02, -.84), .07, W, seg=5, rings=4)
    parts.append(('tail', tl, (0, .7, -.6)))
    return animal('dog', parts)


def build_duck():
    body = B('b'); b = body
    b.ball((0, .52, 0), 1, S, sq=(.4, .38, .55), seg=9, rings=6)
    head = B('h'); h = head
    h.ball((0, .98, .4), .27, L, seg=8, rings=6)
    h.ball((0, .88, .66), .17, GD, sq=(.95, .38, 1.1), seg=7, rings=4)
    for sx in (-1, 1): eye(h, sx * .16, 1.06, .56, .045)
    parts = [('body', body, (0, .52, 0)), ('head', head, (0, .8, .3))]
    for sx, nm in ((-1, 'wingL'), (1, 'wingR')):
        w = B('w'); w.ball((sx * .4, .58, -.05), .5, W, sq=(.15, .5, .78), seg=7, rings=5, rot=Rz(sx * -.15))
        parts.append((nm, w, (sx * .36, .75, .0)))
    for sx, nm in ((-1, 'legL'), (1, 'legR')):
        lg = B('l'); lg.limb((sx * .16, .2, .02), (sx * .16, .03, .02), .045, .04, GD, segs=5)
        lg.ball((sx * .16, .03, .1), .12, GD, sq=(1, .22, 1.3), seg=6, rings=4)
        parts.append((nm, lg, (sx * .16, .2, .0)))
    tl = B('t'); tl.ball((0, .7, -.62), .22, S, sq=(.7, .8, 1.1), seg=6, rings=5, rot=Rx(-.6))
    parts.append(('tail', tl, (0, .6, -.5)))
    return animal('duck', parts)


# ================================================================= OUTSKIRTS
def win(b, x, y, w=.8, h=.9, back=0.03, sill=True, frame=W):
    b.push(T((x, y, 0)))
    b.rbox((0, 0, .04 - back / 2), (w + .26, h + .26, .1 + back), frame, .04)
    b.rbox((0, 0, .1), (w, h, .06), GL, .02)
    b.rbox((0, 0, .135), (.07, h, .05), frame, .015)
    b.rbox((0, 0, .14), (w, .07, .05), frame, .015)
    if sill: b.rbox((0, -h / 2 - .17, .12), (w + .4, .12, .3), SD, .04)
    b.pop()


def door(b, x, w=1.2, h=2.1, mat=W, depth=0.25, steps=True, frame=SD):
    b.push(T((x, 0, 0)))
    hr = h - w / 2
    R = w / 2 + .18
    b.rbox((0, hr / 2, .08 - depth / 2), (w + .36, hr, .16 + depth), frame, .04)
    b.arch(0, hr, R, -depth, .16, frame)
    b.rbox((0, hr / 2, .13 - depth / 2 * 0), (w, hr, .12), mat, .03)
    b.arch(0, hr, w / 2, .02, .19, mat)
    b.ball((w / 4, 1.0, .22), .07, GD, seg=6, rings=4)
    if steps:
        b.rbox((0, .1, .55), (w + 1.0, .2, .8), S, .05)
    b.pop()


def gable(b, w, d, y0, rise, ov, mat, wall=None, th=.22, ovz=None, ridge=SD):
    """gable roof, ridge along z, centred; eaves at y0 (wall top). wall -> add the triangular gable-end prism."""
    ovz = ov if ovz is None else ovz
    half = w / 2
    if wall:
        b.prism([(-half, y0 - .05), (half, y0 - .05), (0, y0 + rise)], -d / 2, d / 2, wall)
    for sd in (-1, 1):
        Ev = Vector((sd * (half + ov), y0 - rise * ov / half, 0))
        Rv = Vector((0, y0 + rise, 0))
        u = (Rv - Ev).normalized(); nr = Vector((sd * rise, half)).normalized()
        Lg = (Rv - Ev).length
        c = (Ev + Rv) / 2 + Vector((nr.x, nr.y, 0)) * (th / 2 + .03)
        b.rbox((c.x, c.y, 0), (Lg + .1, th, d + 2 * ovz), mat, .07, rot=Rz(math.atan2(u.y, u.x)))
    if ridge:
        b.rbox((0, y0 + rise + .12, 0), (.42, .26, d + 2 * ovz + .06), ridge, .08)


def chimney(b, x, z, y, h=1.6, s=.7):
    b.rbox((x, y + h / 2, z), (s, h, s), S, .08)
    b.rbox((x, y + h + .08, z), (s + .22, .2, s + .22), SD, .06)


def plinth(b, W_, D_, h=.4, mat=SD):
    b.rbox((0, h / 2, 0), (W_ + .3, h, D_ + .3), mat, .08)


def build_barn():
    b = B('barn')
    Wd, Dd, h, rise = 7.0, 9.0, 3.2, 2.5
    plinth(b, Wd, Dd, .35)
    b.rbox((0, .35 + (h - .35) / 2, 0), (Wd, h - .35, Dd), BR, .12)
    gable(b, Wd, Dd, h, rise, .55, TM, wall=BR, th=.26, ovz=.7)
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.rbox((sx * (Wd / 2), (h + .35) / 2, sz * (Dd / 2)), (.3, h - .3, .3), S, .06)
    b.push(T((0, 0, Dd / 2)))
    dw = 3.4
    b.rbox((0, 1.7, .08), (dw + .5, 3.5, .2), S, .08)
    for sx in (-1, 1):
        b.rbox((sx * dw / 4, 1.62, .18), (dw / 2 - .08, 3.2, .16), W, .06)
    for sx in (-1, 1):
        b.strut((sx * (dw / 2 - .15), .15, .3), (sx * .15, 3.05, .3), .22, .06, S, .03)
    for sx in (-1, 1):
        b.strut((sx * .12, 3.0, .31), (sx * (dw / 2 - .15), .2, .31), .2, .05, S, .03)
    for sx in (-1, 1): b.ball((sx * .2, 1.5, .3), .1, GD, seg=6, rings=4)
    win(b, 0, h + 1.35, .8, .8, frame=S)
    b.pop()
    for sz in (-2.6, 0, 2.6):
        for sx in (-1, 1):
            b.push(Ry(sx * math.pi / 2) @ T((0, 0, Wd / 2)))
            win(b, sz, 2.0, .7, .7, frame=S)
            b.pop()
    return b.finish()


def build_farmhouse():
    b = B('farmhouse')
    Wd, Dd, h, rise = 6.0, 5.2, 3.0, 2.5
    plinth(b, Wd, Dd, .45)
    b.rbox((0, .45 + (h - .45) / 2, 0), (Wd, h - .45, Dd), S, .12)
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.rbox((sx * Wd / 2, (h + .45) / 2, sz * Dd / 2), (.34, h - .4, .34), TM, .06)
    b.rbox((0, h - .12, Dd / 2 + .02), (Wd + .1, .24, .1), TM, .04)
    gable(b, Wd, Dd, h, rise, .55, RB, wall=S, ovz=.55)
    chimney(b, -1.6, -.6, h + 1.0 - .2, 1.9)
    b.push(T((0, 0, Dd / 2)))
    door(b, -1.1)
    win(b, 1.5, 1.8, .9, 1.0)
    win(b, 0, h + 1.1, .6, .7, frame=W)
    b.pop()
    for sx in (-1, 1):
        b.push(Ry(sx * math.pi / 2) @ T((0, 0, Wd / 2)))
        win(b, -1.0, 1.8, .8, .9)
        win(b, 1.1, 1.8, .8, .9)
        b.pop()
    b.push(Ry(math.pi) @ T((0, 0, Dd / 2)))
    win(b, -1.2, 1.8, .9, .9); win(b, 1.2, 1.8, .9, .9)
    b.pop()
    # flower box
    b.push(T((1.5, 0, Dd / 2)))
    b.rbox((0, 1.0, .35), (1.3, .3, .3), W, .05)
    for i in range(5):
        b.ball((-.5 + i * .25, 1.28, .35), .1, [FR, FP, GD, FP, FR][i], seg=6, rings=4)
    b.pop()
    return b.finish()


def build_windmill():
    b = B('windmill')
    b.cyl((0, .3, 0), 2.85, 2.85, .6, 12, SD)
    b.lathe([(0, .55), (2.55, .55), (1.78, 6.2), (0, 6.2)], S, segs=12)
    for y in (2.2, 4.0):
        r = 2.55 - (2.55 - 1.78) * (y - .55) / 5.65 + .1
        b.cyl((0, y, 0), r + .02, r - .02, .22, 12, SD)
    b.lathe([(0, 6.0), (2.2, 6.0), (2.25, 6.3), (1.75, 6.95), (1.0, 7.55), (0, 7.9)], RB, segs=12, smooth=False)
    b.ball((0, 7.95, 0), .22, GD, seg=7, rings=5)
    b.push(T((0, 0, 2.4)))
    door(b, 0, 1.3, 2.0, depth=.6)
    b.pop()
    for a, y in ((math.pi / 2, 3.4), (-math.pi / 2, 3.4), (math.pi, 3.4), (math.pi * .3, 5.0), (-math.pi * .3, 5.0)):
        r = 2.55 - (2.55 - 1.78) * (y - .55) / 5.65
        b.push(Ry(a) @ T((0, 0, r - .02)) @ Rx(math.radians(-7)))
        win(b, 0, y, .55, .8, back=.3)
        b.pop()
    b.cyl((0, 6.9, 1.35), .26, .26, 1.3, 7, W, axis='z')
    b.ball((0, 6.9, 2.0), .3, GD, seg=7, rings=5)
    root = b.finish()
    bl = B('windmill_blades')
    bl.push(T((0, 6.9, 2.15)))      # author at the hub (absolute), finish() re-centres on the pivot
    bl.ball((0, 0, .02), .38, GD, seg=7, rings=5)
    bl.box((0, 0, 0), (9.0, .22, .2), W, rot=Rz(math.pi / 4))
    bl.box((0, 0, .015), (.22, 9.0, .24), W, rot=Rz(math.pi / 4))
    for k in range(4):
        ang = math.pi / 4 + k * math.pi / 2
        d = Vector((math.cos(ang), math.sin(ang), 0)); pp = Vector((-d.y, d.x, 0))
        c = d * 2.75 + pp * .78
        bl.push(T((c.x, c.y, .0)) @ Rz(ang - math.pi / 2))
        bl.rbox((0, 0, .0), (1.4, 3.3, .1), S, .05)
        bl.box((0, 0, .06), (1.4, .1, .06), W)
        bl.box((0, -.9, .06), (1.4, .1, .06), W)
        bl.box((0, .9, .06), (1.4, .1, .06), W)
        bl.box((0, 0, .06), (.1, 3.3, .06), W)
        bl.pop()
    bl.pop()
    bl.finish(root, (0, 6.9, 2.15))
    return root


def build_stable():
    b = B('stable')
    Wd, Dd, h, rise = 9.0, 4.6, 2.8, 1.6
    b.rbox((0, .08, 0), (Wd + .3, .16, Dd + .3), SD, .05)
    b.rbox((0, 1.5, -Dd / 2 + .12), (Wd, 2.8, .24), W, .08)
    for sx in (-1, 1):
        b.rbox((sx * (Wd / 2 - .12), 1.5, 0), (.24, 2.8, Dd), W, .08)
    b.push(Ry(math.pi / 2))
    gable(b, Dd, Wd, h, rise, .55, RB, wall=W, ovz=.45)
    b.pop()
    for i, x in enumerate((-4.4, -1.5, 1.5, 4.4)):
        b.cyl((x, 1.4, Dd / 2 - .15), .14, .14, 2.8, 8, TM)
        b.ball((x, .15, Dd / 2 - .15), .26, SD, sq=(1, .6, 1), seg=7, rings=4)
    b.rbox((0, h - .15, Dd / 2 - .15), (Wd - .2, .3, .3), TM, .06)
    for x in (-1.5, 1.5):
        b.rbox((x, .7, -.2), (.16, 1.4, 3.6), W, .05)
        b.rbox((x, 1.5, -.2), (.2, .16, 3.6), TM, .04)
    for i, cx in enumerate((-3.0, 0.0, 3.0)):
        b.ball((cx - .5, .38, -1.2), .6, GD, sq=(1.3, .7, 1), seg=8, rings=5)
        b.ball((cx + .6, .3, -1.35), .45, GD, sq=(1.1, .7, 1), seg=7, rings=5)
        b.rbox((cx, .55, 1.1), (1.5, .3, .5), W, .06)
        b.rbox((cx, .73, 1.1), (1.2, .06, .3), AB, .02)
        b.push(T((cx, 0, -Dd / 2 + .24)))
        win(b, 0, 1.7, .7, .6, frame=S, sill=False)
        b.pop()
    b.push(T((0, 0, Dd / 2 + .02)))
    b.rbox((0, 2.1, .1), (1.8, .5, .1), S, .05)
    b.pop()
    return b.finish()


def build_coop():
    b = B('chicken_coop')
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.rbox((sx * .8, .3, sz * .55), (.2, .6, .2), TM, .05)
    b.rbox((0, .7, 0), (2.0, .2, 1.5), W, .06)
    b.rbox((0, 1.3, 0), (1.8, 1.0, 1.3), BR, .1)
    gable(b, 1.8, 1.3, 1.8, .8, .3, RB, wall=BR, th=.14, ovz=.35, ridge=None)
    b.push(T((0, 0, .65)))
    b.cyl((-.3, 1.3, .06), .27, .27, .06, 8, IR, axis='z')
    b.cyl((-.3, 1.3, .1), .34, .34, .06, 8, SD, axis='z')
    b.rbox((.5, 1.0, .08), (.5, .6, .08), S, .04)
    win(b, .5, 1.45, .35, .35, frame=W, sill=False)
    b.pop()
    b.strut((-.3, .7, .95), (-.3, .1, 1.9), .5, .08, W, .03)
    for t in (.3, .55, .8):
        zz = .95 + (1.9 - .95) * t * 1.0; yy = .7 - .6 * t
        b.box((-.3, yy + .05, zz), (.5, .05, .08), TM)
    b.rbox((1.35, 1.3, 0), (.7, .45, 1.0), W, .06)
    b.rbox((1.35, 1.6, 0), (.8, .1, 1.1), RB, .04, rot=Rz(-.1))
    b.ball((1.35, 1.52, .53), .17, GD, sq=(1, .8, 1), seg=6, rings=4)
    return b.finish()


def build_tent():
    b = B('mining_camp_tent')
    b.rbox((0, .04, 0), (3.8, .08, 4.4), SD, .02)
    b.prism([(-1.8, .08), (1.8, .08), (0, 2.5)], -2.0, 2.0, S)
    b.prism([(-.75, .06), (.75, .06), (0, 1.85)], 1.9, 2.07, IR)
    for sx in (-1, 1):
        b.prism([(sx * .78, .06), (sx * 1.55, .06), (sx * .42, 1.45)][::sx], 1.92, 2.09, AB)
    b.rbox((0, 2.55, 0), (.22, .22, 4.8), TM, .06)
    for sz in (-1, 1): b.ball((0, 2.55, sz * 2.45), .2, GD, seg=6, rings=4)
    for sx in (-1, 1):
        b.strut((sx * 1.9, 0, 2.3), (0, 2.7, 2.3), .14, .14, W, .04)
    b.rbox((2.4, .4, 1.2), (.9, .8, .9), W, .08, rot=Ry(.3))
    b.cyl((-2.4, .45, 1.2), .4, .4, .9, 8, W)
    b.cyl((-2.4, .6, 1.2), .42, .42, .1, 8, IR)
    b.cyl((-2.4, .3, 1.2), .42, .42, .1, 8, IR)
    b.strut((2.9, 0.1, 2.5), (2.3, 1.7, 2.1), .13, .13, W, .04)
    b.rbox((2.15, 1.75, 2.0), (.8, .14, .14), IR, .04, rot=Rz(.1))
    b.limb((0, 2.7, 2.3), (0, 2.3, 2.3), .03, .03, IR, segs=4)
    b.rbox((0, 2.1, 2.3), (.3, .4, .3), IR, .06)
    b.ball((0, 2.1, 2.3), .12, GD, seg=6, rings=4)
    return b.finish()


def build_mine():
    b = B('mine_entrance')
    b.rbox((0, 1.9, -.5), (7.2, 3.8, 3.6), SD, .5, seg=2, smooth=True)
    b.ball((-1.9, 3.6, -1.0), 1.6, SD, sq=(1.1, .9, 1), seg=8, rings=6)
    b.ball((2.0, 3.5, -.8), 1.5, SD, sq=(1.1, .9, 1), seg=8, rings=6)
    b.ball((-.2, 4.1, -.6), 1.6, LL, sq=(1.9, .45, 1.2), seg=9, rings=5)
    b.ball((-2.7, 3.5, .2), .6, L, sq=(1, .6, 1), seg=6, rings=4)
    b.ball((2.9, 3.6, .1), .6, L, sq=(1, .6, 1), seg=6, rings=4)
    zf = 1.31
    b.arch(0, 1.9, 1.5, zf, zf + .1, IR)
    b.bx(-1.5, 1.5, 0, 1.9, zf, zf + .1, IR, r=.01)
    b.rbox((0, .08, 2.6), (2.6, .08, 4.3), TM, .03)
    for sx in (-1, 1):
        b.rbox((sx * .55, .22, 2.4), (.14, .12, 6.0), IR, .03)
        b.rbox((sx * 1.7, 1.55, zf + .5), (.5, 3.1, .5), W, .1)
    b.rbox((0, 3.2, zf + .5), (4.2, .5, .6), W, .1)
    for sx in (-1, 1):
        b.strut((sx * 1.6, 2.6, zf + .5), (sx * 1.0, 3.1, zf + .5), .22, .3, W, .05)
    for z in (1.6, 2.4, 3.2, 4.0, 4.8):
        b.rbox((0, .1, z), (1.9, .12, .26), W, .04)
    b.limb((0, 3.0, zf + .5), (0, 2.5, zf + .5), .03, .03, IR, segs=4)
    b.rbox((0, 2.3, zf + .5), (.34, .4, .34), IR, .06)
    b.ball((0, 2.3, zf + .5), .13, GD, seg=6, rings=4)
    for k, (x, z, r) in enumerate([(-2.6, 2.3, .5), (3.0, 1.9, .6), (2.4, 3.1, .35)]):
        b.ball((x, r * .6, z), r, SD, sq=(1, .75, 1), seg=7, rings=5)
    # ore cart
    b.push(T((1.25, 0, 3.8)))
    b.rbox((0, .62, 0), (1.0, .55, 1.3), W, .08)
    b.ball((0, .9, 0), .5, GD, sq=(.9, .5, 1.2), seg=7, rings=4)
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.cyl((sx * .55, .3, sz * .45), .17, .17, .1, 8, IR, axis='x')
    b.pop()
    return b.finish()


def build_brewer():
    b = B('brewer_hut')
    b.cyl((0, .2, 0), 2.45, 2.45, .4, 10, SD)
    b.cyl((0, 1.4, 0), 2.2, 2.2, 2.0, 10, S)
    for y in (.75, 2.0):
        b.cyl((0, y, 0), 2.28, 2.28, .2, 10, TM)
    b.lathe([(0, 2.4), (2.9, 2.4), (2.95, 2.65), (2.3, 3.1), (1.4, 3.8), (.6, 4.5), (0, 4.95)], BR, segs=10, smooth=False)
    b.ball((0, 5.0, 0), .2, GD, seg=7, rings=5)
    chimney(b, 1.1, -.9, 3.2, 1.6, .6)
    b.push(T((0, 0, 2.15)))
    door(b, 0, 1.15, 1.95, depth=.5, steps=False)
    b.pop()
    for a in (.9, -.9, 2.2, 3.4):
        b.push(Ry(a) @ T((0, 0, 2.12)))
        win(b, 0, 1.55, .55, .6, back=.5)
        b.pop()
    # bottles + table outside
    b.push(T((2.5, 0, 1.9)) @ Ry(-.5))
    b.rbox((0, .7, 0), (1.5, .12, .7), W, .05)
    for sx in (-.6, .6):
        b.rbox((sx, .33, 0), (.14, .66, .6), TM, .04)
    for k, (x, m) in enumerate(((-.5, L), (-.2, AB), (.1, FR), (.4, L), (.6, GD))):
        bottle(b, x, .76, .0, m, .4 + .06 * (k % 2))
    b.pop()
    b.push(T((-2.4, 0, 1.5)))
    for k, (x, z, m) in enumerate(((0, 0, L), (.8, .25, AB), (.4, .8, FR))):
        bottle(b, x, 0.0, z, m, .8, .22)
    b.pop()
    b.cyl((-1.5, .5, 2.7), .42, .42, 1.0, 8, W)
    b.cyl((-1.5, .75, 2.7), .44, .44, .09, 8, IR)
    b.cyl((-1.5, .25, 2.7), .44, .44, .09, 8, IR)
    return b.finish()


def bottle(b, x, y, z, m, h=.4, r=.12):
    b.lathe([(0, 0), (r, 0), (r * 1.05, h * .5), (r * .5, h * .72), (r * .32, h * .95), (r * .4, h), (0, h)], m, segs=8, pos=(x, y, z), smooth=True)
    b.ball((x, y + h + .03, z), r * .32, W, seg=5, rings=3)


def build_tower():
    b = B('endless_tower')
    b.cyl((0, .45, 0), 3.9, 3.9, .9, 12, SD)
    b.cyl((0, 1.0, 0), 3.5, 3.5, .25, 12, S)
    b.lathe([(0, 1.0), (3.1, 1.0), (2.55, 19.0), (0, 19.0)], S, segs=12)
    for y in (4.5, 9.5, 14.5):
        r = 3.1 - (3.1 - 2.55) * (y - 1) / 18 + .1
        b.cyl((0, y, 0), r + .02, r - .02, .5, 12, SD)
    b.cyl((0, 19.3, 0), 3.5, 2.7, .7, 12, SD)
    b.cyl((0, 19.8, 0), 3.65, 3.65, .35, 12, S)
    # crenellations
    for k in range(12):
        a = 2 * math.pi * (k + .5) / 12
        b.rbox((math.sin(a) * 3.3, 20.45, math.cos(a) * 3.3), (.75, .9, .6), S, .1, rot=Ry(a))
    b.cyl((0, 20.5, 0), 2.7, 2.7, 1.2, 12, S)
    b.lathe([(0, 20.8), (3.35, 20.8), (3.3, 21.0), (2.5, 21.7), (1.6, 23.0), (.9, 24.4), (0, 26.2)], RB, segs=12)
    b.ball((0, 26.2, 0), .32, GD, seg=7, rings=5)
    b.cyl((0, 26.9, 0), .05, .05, 1.2, 4, TM)
    b.prism([(0, 27.3), (1.3, 26.95), (0, 26.6)], -.03, .03, FR)
    for y, k in ((4, 0), (8, 3), (12, 6), (16, 9)):
        a = k * math.pi / 6 + .0
        r = 3.1 - (3.1 - 2.55) * (y - 1) / 18
        b.push(Ry(a) @ T((0, 0, r - .02)) @ Rx(math.radians(-1.8)))
        win(b, 0, y, .8, 1.5, back=.4)
        b.pop()
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        b.push(Ry(a) @ T((0, 0, 2.62)))
        win(b, 0, 20.3, .7, .75, back=.4, sill=False, frame=SD)
        b.pop()
    b.push(T((0, 0, 3.12)))
    door(b, 0, 1.7, 2.8, depth=.6, steps=False)
    b.pop()
    b.rbox((0, .25, 4.3), (3.6, .5, 1.5), S, .08)
    b.rbox((0, .1, 5.3), (4.4, .2, .9), SD, .05)
    for sx in (-1, 1):
        b.ball((sx * 2.1, .85, 3.5), .38, LL, sq=(1.1, .8, 1.1), seg=7, rings=5)
    return b.finish()


def build_dock():
    b = B('dock_segment')
    for i in range(8):
        b.rbox((0, .55, -1.75 + i * .5), (2.5, .14, .44), W, .04)
    for sx in (-.95, .95):
        b.rbox((sx, .36, 0), (.22, .22, 4.0), TM, .05)
    for sx in (-1.15, 1.15):
        for sz in (-1.75, 1.75):
            b.cyl((sx, -.2, sz), .17, .17, 2.4, 7, TM)
            b.ball((sx, 1.05, sz), .22, TM, sq=(1, .75, 1), seg=6, rings=4)
    b.rbox((0, .15, 0), (2.4, .18, .25), TM, .04)
    return b.finish()


def build_dock_post():
    b = B('dock_post')
    b.cyl((0, .5, 0), .24, .2, 1.8, 8, TM)
    b.ball((0, 1.42, 0), .27, TM, sq=(1, .75, 1), seg=7, rings=5)
    for y in (.95, 1.1):
        b.lathe([(.24 + .06 * math.cos(a), y + .06 * math.sin(a)) for a in [k * math.pi / 3 for k in range(6)]], S, segs=8, closed=True)
    return b.finish()


def build_boat():
    b = B('small_boat')
    M = Matrix.Diagonal((.8, 1, 1.5, 1))
    b.lathe([(0, 0), (.7, .06), (1.05, .45), (1.12, .75), (.98, .75), (.9, .5), (.62, .22), (0, .2)], W, segs=12, pos=(0, .15, 0), M=M)
    b.lathe([(.99, .66), (1.17, .66), (1.17, .84), (.99, .84)], AB, segs=12, pos=(0, .15, 0), M=M, closed=True)
    for z in (-.6, .6):
        b.rbox((0, .6, z), (1.6, .1, .4), TM, .04)
    b.ball((0, .55, 1.62), .2, GD, sq=(1, 1, .6), seg=6, rings=4)
    b.limb((-.6, .7, .7), (.65, 1.0, -.9), .045, .045, TM, segs=5)
    b.ball((.72, 1.03, -1.05), .17, W, sq=(.6, .25, 1.1), seg=6, rings=4)
    return b.finish()


def cabbage(b, x, z, s=1.0):
    b.ball((x, .22 * s, z), .27 * s, LL, sq=(1, .85, 1), seg=8, rings=5)
    for k in range(5):
        a = k * 2 * math.pi / 5
        b.ball((x + math.cos(a) * .22 * s, .17 * s, z + math.sin(a) * .22 * s), .2 * s, L, sq=(1, .5, 1), seg=6, rings=4, rot=Ry(-a))


def pumpkin(b, x, z, s=1.0):
    b.ball((x, .22 * s, z), .3 * s, GD, sq=(1.1, .78, 1.1), seg=8, rings=6)
    b.cyl((x, .5 * s, z), .05 * s, .07 * s, .14 * s, 5, L)
    b.ball((x + .1 * s, .56 * s, z), .06 * s, L, seg=5, rings=3)


def wheat(b, x, z, s=1.0):
    rnd = random.Random(int(x * 10 + z * 7) & 255)
    for k in range(6):
        a = 2 * math.pi * k / 6 + .3
        rr = .12 * s
        px, pz = x + math.cos(a) * rr, z + math.sin(a) * rr
        tip = (px + math.cos(a) * .08 * s, .62 * s, pz + math.sin(a) * .08 * s)
        b.limb((px, 0, pz), tip, .04 * s, .025 * s, LL, segs=4)
        b.ball((tip[0], tip[1] + .1 * s, tip[2]), .09 * s, GD, sq=(1, 2.0, 1), seg=6, rings=4)


def build_crops():
    P = {}
    b = B('crop_wheat'); wheat(b, 0, 0, 1.3); P['crop_wheat'] = b.finish()
    b = B('crop_cabbage'); cabbage(b, 0, 0, 1.4); P['crop_cabbage'] = b.finish()
    b = B('crop_pumpkin'); pumpkin(b, 0, 0, 1.4); P['crop_pumpkin'] = b.finish()
    b = B('crop_row')
    b.rbox((0, .1, 0), (4.4, .2, 1.3), W, .08)
    b.rbox((0, .22, 0), (4.0, .1, 1.0), TM, .04)
    seq = ['w', 'w', 'c', 'c', 'p', 'p']
    for i, k in enumerate(seq):
        x = -1.75 + i * .7
        for z in (-.25, .25):
            zz = z + (.1 if (i % 2) else -.1)
            f = {'w': wheat, 'c': cabbage, 'p': pumpkin}[k]
            b.push(T((0, .2, 0)))
            f(b, x + (.0 if z > 0 else .12), zz, .8)
            b.pop()
    P['crop_row'] = b.finish()
    return P


def build_cart():
    b = B('market_cart')
    b.rbox((0, .85, 0), (2.1, .12, 1.6), W, .05)
    for sz in (-1, 1): b.rbox((0, 1.1, sz * .75), (2.1, .4, .1), W, .04)
    for sx in (-1, 1): b.rbox((sx * 1.0, 1.1, 0), (.1, .4, 1.6), W, .04)
    for sx in (-1, 1):
        b.push(T((sx * 1.12, .62, .1)))
        b.lathe([(.5, -.07), (.64, -.07), (.64, .07), (.5, .07)], W, segs=10, M=Rz(math.pi / 2), closed=True)
        b.cyl((0, 0, 0), .13, .13, .26, 6, TM, axis='x')
        for k in range(3):
            b.box((0, 0, 0), (.06, 1.08 + 0.0, .06), TM, rot=Rx(k * math.pi / 3 + .3))
        b.pop()
    b.limb((-.45, .9, .8), (-.45, .28, 2.6), .07, .07, W, segs=6)
    b.limb((.45, .9, .8), (.45, .28, 2.6), .07, .07, W, segs=6)
    b.rbox((0, .3, 2.6), (1.1, .1, .1), W, .03)
    for sx in (-1, 1):
        b.rbox((sx * 1.0, 1.85, .72), (.1, 1.5, .1), TM, .03)
        b.rbox((sx * 1.0, 2.1, -.72), (.1, 2.0, .1), TM, .03)
    for i in range(8):
        x = -.98 + i * .28 + .0
        b.rbox((x, 2.88, .0), (.27, .09, 1.95), AB if i % 2 == 0 else S, .03, rot=Rx(.2))
    for i in range(8):
        x = -.98 + i * .28
        b.rbox((x, 2.55, .95 + .17), (.27, .26, .06), AB if i % 2 == 0 else S, .02)
    for k, (x, z) in enumerate([(-.7, -.4), (-.35, .3), (.0, -.45), (.4, .35), (.7, -.2), (-.65, .35), (.1, .0)]):
        b.ball((x, 1.2, z), .19, FR if k % 2 == 0 else GD, seg=7, rings=5)
    b.push(T((.0, 1.05, .45)))
    cabbage(b, -.3, .0, .8); cabbage(b, .7, .05, .8)
    b.pop()
    return b.finish()


def build_haystack():
    b = B('haystack')
    b.lathe([(0, 0), (1.55, 0), (1.7, .55), (1.5, 1.45), (.95, 2.05), (0, 2.45)], GD, segs=10, smooth=True)
    for y in (.7, 1.45):
        r = 1.72 if y < 1 else 1.52
    for k in range(3):
        a = k * 2.1 + .5
        b.ball((math.cos(a) * 1.9, .15, math.sin(a) * 1.9), .35, GD, sq=(1.3, .6, 1), seg=7, rings=4)
    b.limb((1.9, 0, 1.3), (1.45, 1.9, 1.0), .05, .05, W, segs=5)
    for dz in (-.14, 0, .14):
        b.limb((1.34 + dz * .5, 1.9, 1.0 + dz), (1.2 + dz * .5, 2.35, .85 + dz), .03, .015, IR, segs=4)
    return b.finish()


def build_outskirts():
    P = {}
    P['barn'] = build_barn()
    P['farmhouse'] = build_farmhouse()
    P['windmill'] = build_windmill()
    P['stable'] = build_stable()
    P['chicken_coop'] = build_coop()
    P['mining_camp_tent'] = build_tent()
    P['mine_entrance'] = build_mine()
    P['brewer_hut'] = build_brewer()
    P['endless_tower'] = build_tower()
    P['dock_segment'] = build_dock()
    P['dock_post'] = build_dock_post()
    P['small_boat'] = build_boat()
    P['market_cart'] = build_cart()
    P['haystack'] = build_haystack()
    P.update(build_crops())
    return P


def build_all():
    P = {}
    P.update(build_trees())
    P['tree_pine_a'] = pine('tree_pine_a', [(1.0, 1.95, 1.9, L), (2.35, 1.55, 1.75, L), (3.55, 1.15, 1.55, LL), (4.55, .75, 1.45, LL)])
    P['tree_pine_b'] = pine('tree_pine_b', [(.9, 1.9, 1.7, LL), (2.1, 1.45, 1.55, L), (3.2, 1.0, 1.5, LL)], th=1.1)
    P['palm_a'] = palm('palm_a', 1.1, 7)
    P['palm_b'] = palm('palm_b', 1.5, 8, hgt=4.0, flip=-1)
    P.update(build_plants())
    P.update(build_park())
    for fn in (build_cow, build_sheep, build_pig, build_chicken, build_horse, build_cat, build_dog, build_duck):
        r = fn(); P[r.name] = r
    P.update(build_outskirts())
    return P


# ================================================================= export + preview
def descendants(o):
    out = [o]
    for c in o.children: out += descendants(c)
    return out


def tri_count(ob):
    return sum(sum(len(p.vertices) - 2 for p in d.data.polygons) for d in descendants(ob) if d.type == 'MESH')


def export_glb(roots):
    bpy.ops.object.select_all(action='DESELECT')
    for r in roots:
        for d in descendants(r): d.select_set(True)
    bpy.context.view_layer.objects.active = roots[0]
    bpy.ops.export_scene.gltf(filepath=RAW_GLB, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=True, export_materials='EXPORT', export_cameras=False,
                              export_lights=False, export_image_format='NONE')


def setup_render(w, h, samples=24):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 3
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'Standard'
    if not sc.world: sc.world = bpy.data.worlds.new('w')
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.7, 0.78, 0.9, 1)
    bg.inputs['Strength'].default_value = 0.85


def add_lights():
    for o in [o for o in bpy.data.objects if o.type == 'LIGHT']: bpy.data.objects.remove(o)
    ld = bpy.data.lights.new('sun', 'SUN')
    ld.energy = 2.6; ld.color = (1.0, 0.92, 0.78); ld.angle = math.radians(5)
    so = bpy.data.objects.new('sun', ld); bpy.context.scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(52), math.radians(8), math.radians(-35))
    fl = bpy.data.lights.new('fill', 'SUN')
    fl.energy = 0.8; fl.color = (0.75, 0.85, 1.0)
    fo = bpy.data.objects.new('fill', fl); bpy.context.scene.collection.objects.link(fo)
    fo.rotation_euler = (math.radians(60), 0, math.radians(140))


def make_camera(target, yaw_deg, pitch_deg, dist, ortho=None, fov=26.0):
    for o in [o for o in bpy.data.objects if o.type == 'CAMERA']: bpy.data.objects.remove(o)
    cd = bpy.data.cameras.new('cam')
    if ortho: cd.type = 'ORTHO'; cd.ortho_scale = ortho
    else: cd.angle = math.radians(fov)
    cd.clip_end = 1000
    co = bpy.data.objects.new('cam', cd); bpy.context.scene.collection.objects.link(co)
    co.rotation_euler = (math.radians(90 - pitch_deg), 0, math.radians(yaw_deg))
    co.location = Vector(target) - co.rotation_euler.to_matrix() @ Vector((0, 0, -1)) * dist
    bpy.context.scene.camera = co


def place(src, gx, gz, yaw=0.0, scale=1.0, gy=0.0):
    def cp(o, parent=None):
        c = o.copy(); c.name = o.name + '_inst'
        c.hide_render = False; c.hide_viewport = False
        bpy.context.scene.collection.objects.link(c)
        if parent is not None: c.parent = parent
        for ch in o.children: cp(ch, c)
        return c
    r = cp(src)
    r.location = G(gx, gy, gz)
    r.rotation_euler = (0, 0, -math.radians(yaw))
    r.scale = (scale, scale, scale)
    return r


def flat(name, pts, col, y):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x, -z, y) for x, z in pts], [], [(0, 3, 2, 1)])
    o = bpy.data.objects.new('ground_' + name, me); bpy.context.scene.collection.objects.link(o)
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = lin(col)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
    me.materials.append(m)


def rect(name, cx, cz, w, d, col, y=0.0):
    flat(name, [(cx - w / 2, cz - d / 2), (cx + w / 2, cz - d / 2), (cx + w / 2, cz + d / 2), (cx - w / 2, cz + d / 2)], col, y)


def disc(name, cx, cz, r, col, y=0.0, n=28):
    me = bpy.data.meshes.new(name)
    vs = [(cx + r * math.cos(2 * math.pi * k / n), -(cz + r * math.sin(2 * math.pi * k / n)), y) for k in range(n)]
    me.from_pydata(vs, [], [tuple(range(n))])
    o = bpy.data.objects.new('ground_' + name, me); bpy.context.scene.collection.objects.link(o)
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = lin(col)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
    me.materials.append(m)
    for p in me.polygons: p.normal  # noqa
    me.update()
    return o


def clear_instances():
    for o in [o for o in bpy.data.objects if o.name.endswith('_inst') or o.name.startswith('ground_')]:
        bpy.data.objects.remove(o)


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def sheet_rows(P, rows, path, ortho_w, yaw=14, pitch=30, target=(0, 2.0, 0), floor='#d9dccf'):
    """rows = [(names, spacing, z), ...] laid out left->right, each row centred, rows going into the distance (-z)"""
    clear_instances()
    rect('floor', 0, 0, 500, 500, floor, -0.02)
    for names, sp, z in rows:
        x = -(len(names) - 1) * sp / 2
        for n in names:
            place(P[n], x, z, 0); x += sp
    add_lights()
    make_camera(G(*target), yaw, pitch, 150, ortho=ortho_w)
    render(path)


def scene_vignette(P, path):
    clear_instances()
    rect('grass', 0, 0, 400, 400, '#8fc866', -0.03)
    # pond + dock (front left)
    disc('pond', -16, 18.5, 6.6, '#5b8de0', 0.0)
    place(P['dock_segment'], -11.2, 18.5, 90, gy=0.0)
    place(P['dock_post'], -9.0, 16.8, 0)
    place(P['small_boat'], -16.5, 19.5, 70, gy=0.05)
    # dirt path + stones
    for k in range(7):
        place(P['stone_path_tile'], -1.5 + k * 1.2 * 0.0 + (0.3 if k % 2 else -0.3), 17 - k * 1.5 - 0.0, k * 25)
    # back row: farm
    place(P['barn'], -17, -10, 0)
    place(P['farmhouse'], -4.5, -10.5, 0)
    place(P['windmill'], 18, -10, 0)
    place(P['haystack'], -9.8, -6.0, 20)
    place(P['chicken_coop'], 3.2, -6.0, 0)
    for i, z in enumerate((-2.0, 0.2, 2.4)):
        place(P['crop_row'], 15, z, 0)
        place(P['crop_row'], 19.5, z, 0)
    place(P['market_cart'], 9.2, -5.4, -25)
    # pasture, fenced (left)
    px0, px1, pz0, pz1 = -20, -6, -1.8, 7.6
    n = int((px1 - px0) / 2)
    for i in range(n):
        x = px0 + 1 + i * 2
        place(P['fence_wood'], x, pz1, 0)
        place(P['fence_wood'], x, pz0, 0)
    nz = int((pz1 - pz0) / 2)
    for i in range(nz + 1):
        z = pz0 + 1 + i * 2
        if z < pz1 - 0.5:
            place(P['fence_wood'], px0, z, 90)
            place(P['fence_wood'], px1, z, 90)
    place(P['cow'], -16.5, 2.5, 25)
    place(P['sheep'], -12.5, 1.0, -35)
    place(P['sheep'], -10.5, 4.5, 160)
    place(P['pig'], -8.5, 3.0, -75)
    place(P['horse'], -15, 5.2, 115)
    place(P['grass_tuft'], -18.5, 6.4, 0); place(P['grass_tuft'], -9.0, -0.5, 40)
    place(P['chicken'], 0.0, -3.9, 20); place(P['chicken'], 2.0, -3.0, -50); place(P['duck'], -14.0, 16.4, 30)
    place(P['cat'], -6.4, -6.2, 30)
    # park (front right)
    place(P['park_fountain'], 3.4, 8.8, 0)
    place(P['gazebo'], 15.5, 8.5, 0)
    place(P['well'], -3.4, 3.4, 20)
    place(P['signpost'], 0.2, 3.6, 5)
    place(P['park_bench'], 9.0, 11.0, 0); place(P['park_bench'], 3.4, 14.8, 0)
    place(P['bush_flower'], 9.0, 13.0, 0); place(P['hedge_block'], 5.6, 4.2, 0); place(P['hedge_block'], 7.6, 4.2, 0)
    place(P['flower_patch'], 8.2, 8.0, 0); place(P['flower_patch'], -1.4, 11.5, 40); place(P['flower_patch'], 21.0, 12.8, 0)
    place(P['bush_round'], 12.4, 4.4, 0); place(P['bush_round'], 20, 4.8, 0)
    place(P['mushroom_cluster'], 22.5, 6.2, 0)
    place(P['rock_round_a'], -22.5, -4, 0); place(P['rock_round_b'], 22.8, 1, 90)
    # trees
    place(P['tree_round_a'], -24, 3.5, 0); place(P['tree_round_b'], 24.5, 9.5, 0); place(P['tree_round_c'], 8.0, 17.5, 0)
    place(P['tree_pine_a'], -22.5, -9, 0); place(P['tree_pine_b'], 22.5, -3, 0); place(P['tree_pine_a'], 26, -9, 0, scale=.9)
    place(P['palm_a'], -6.3, 14.5, 0); place(P['palm_b'], -22.5, 15.0, 0)
    place(P['mine_entrance'], 4, -19, 0)
    place(P['endless_tower'], -26, -18, 0)
    add_lights()
    make_camera(G(0, 0.0, 4.0), 0, 50, 140, fov=26)
    render(path)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    global MATS
    MATS = make_materials()
    P = build_all()
    print('--- triangle counts (incl. children)')
    for n, o in P.items():
        bb = [Vector(c) for d in descendants(o) if d.type == 'MESH' for c in d.bound_box]
        print(f'{n:20s} {tri_count(o):6d}')
    export_glb(list(P.values()))
    print('exported', RAW_GLB, 'pieces:', len(P))
    if '--no-render' in sys.argv: return
    os.makedirs(SHOTS, exist_ok=True)
    for r in P.values():
        for d in descendants(r): d.hide_render = True
    only = [a for a in sys.argv if a.startswith('--only=')]
    only = only[0][7:].split(',') if only else None
    want = lambda k: only is None or k in only
    cu = [a for a in sys.argv if a.startswith('--closeup=')]
    if cu:   # debug: --closeup=barn[,yaw,pitch,ortho_scale,target_y]
        parts = cu[0][10:].split(',')
        names = parts[0].split('+')
        setup_render(900, 700, 16)
        sheet_rows(P, [(names, 8.0, 0)], os.path.join(SHOTS, 'close_' + parts[0] + '.png'),
                   float(parts[3]) if len(parts) > 3 else 14, yaw=float(parts[1]) if len(parts) > 1 else 25,
                   pitch=float(parts[2]) if len(parts) > 2 else 25, target=(0, float(parts[4]) if len(parts) > 4 else 1.5, 0))
        return
    if want('nature'):
        setup_render(1600, 1000, 20)
        sheet_rows(P, [
            (['tree_round_a', 'tree_round_b', 'tree_round_c', 'tree_pine_a', 'tree_pine_b', 'palm_a', 'palm_b'], 5.6, -3),
            (['bush_round', 'bush_flower', 'hedge_block', 'flower_patch', 'grass_tuft', 'mushroom_cluster', 'rock_round_a', 'rock_round_b'], 4.2, 6.5),
            (['park_bench', 'park_fountain', 'stone_path_tile', 'fence_wood', 'gazebo', 'well', 'signpost'], 5.8, 15),
        ], os.path.join(SHOTS, 'sheet_nature.png'), 40, yaw=8, pitch=34, target=(0, 1.0, 6))
    if want('animals'):
        setup_render(1280, 720, 24)
        sheet_rows(P, [(['cow', 'sheep', 'pig', 'horse'], 4.2, -1.2), (['chicken', 'cat', 'dog', 'duck'], 4.2, 4.0)],
                   os.path.join(SHOTS, 'sheet_animals.png'), 19, yaw=-28, pitch=24, target=(0, 1.0, 1.4))
    if want('outskirts'):
        setup_render(1600, 1000, 20)
        sheet_rows(P, [
            (['barn', 'farmhouse', 'windmill', 'stable'], 11.5, -12),
            (['brewer_hut', 'endless_tower', 'mine_entrance', 'mining_camp_tent', 'chicken_coop'], 9.5, 0),
            (['dock_segment', 'dock_post', 'small_boat', 'market_cart', 'haystack', 'crop_wheat', 'crop_cabbage', 'crop_pumpkin', 'crop_row'], 5.2, 11),
        ], os.path.join(SHOTS, 'sheet_outskirts.png'), 62, yaw=10, pitch=30, target=(0, 6.0, 0))
    if want('scene'):
        setup_render(1280, 720, 24)
        scene_vignette(P, os.path.join(SHOTS, 'scene.png'))


if __name__ == '__main__':
    main()
