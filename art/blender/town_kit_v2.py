"""Aether Survivor - town kit v2 (fairy-tale kingdom style).

Rebuild:   python3 art/blender/town_kit_v2.py               (needs `pip install bpy`, Blender 5.x as a module)
           python3 art/blender/town_kit_v2.py --no-render   (skip the preview renders)
Outputs:   public/models/town/town_kit_v2.raw.glb  (uncompressed), then compress:
             npx gltf-transform weld  town_kit_v2.raw.glb town_kit_v2.weld.glb
             npx gltf-transform meshopt town_kit_v2.weld.glb town_kit_v2.glb --level medium
           previews go to $KITV2_SHOTS (default art/renders/kitv2/).

Authoring convention: geometry is written in GAME space (x right, y up, +z toward the viewer = front) and mapped to
Blender (x, -z, y) just before the mesh is created, so the glTF export (+Y up) lands exactly in game space.
Every piece is ONE mesh object at the origin (origin = ground centre), flat shaded, sharing 12 flat-colour materials.
"""
import bpy, bmesh, math, os, sys
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
RAW_GLB = os.environ.get('KITV2_RAW', os.path.join(ROOT, 'public/models/town/town_kit_v2.raw.glb'))
SHOTS = os.environ.get('KITV2_SHOTS', os.path.join(ROOT, 'art/renders/kitv2'))

# ---------------------------------------------------------------- materials (shared, flat colours)
PALETTE = {
    'stone': '#efe6d0', 'stone_dark': '#b4a78c', 'wood': '#92603a', 'timber': '#4a2c1a',
    'roof_blue': '#3c56a8', 'gold': '#e8b838', 'window_glow': '#ffd66b', 'flower_red': '#dc3d3d',
    'flower_pink': '#f27aa8', 'leaf': '#4e9a3a', 'awning_blue': '#5b8de0', 'iron': '#2e3036',
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


class B:
    def __init__(s, name):
        s.name = name; s.bm = bmesh.new(); s.M = I4.copy(); s.stack = []

    def push(s, M): s.stack.append(s.M); s.M = s.M @ M
    def pop(s): s.M = s.stack.pop()

    def _fin(s, verts, mat, M):
        bmesh.ops.transform(s.bm, matrix=s.M @ M, verts=verts)
        mi = MI[mat]
        for v in verts:
            for f in v.link_faces: f.material_index = mi

    def box(s, pos, size, mat, rot=None):
        v = bmesh.ops.create_cube(s.bm, size=1.0)['verts']
        s._fin(v, mat, T(pos) @ (rot or I4) @ Matrix.Diagonal((size[0], size[1], size[2], 1)))

    def bx(s, x0, x1, y0, y1, z0, z1, mat, rot=None):
        s.box(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (x1 - x0, y1 - y0, z1 - z0), mat, rot)

    def cyl(s, pos, r1, r2, h, segs, mat, axis='y', rot=None):
        """frustum; radii are APOTHEMS (flat-face distance). r1/r2 = 0 -> cone/pyramid. flat faces align to +-z / +-x"""
        c = math.cos(math.pi / segs)
        sd = 360.0 / segs
        delta = math.radians((270 - sd / 2) % sd)
        v = bmesh.ops.create_cone(s.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1 / c,
                                  radius2=r2 / c, depth=h)['verts']
        if r1 == 0 or r2 == 0:
            bmesh.ops.remove_doubles(s.bm, verts=v, dist=1e-4)
            v = [x for x in v if x.is_valid]
        ax = {'y': Rx(-math.pi / 2), 'z': I4, 'x': Ry(math.pi / 2)}[axis]
        s._fin(v, mat, T(pos) @ (rot or I4) @ ax @ Rz(delta))

    def prism(s, pts, z0, z1, mat):
        """extrude a convex 2D polygon (x,y) between z0..z1"""
        a = [s.bm.verts.new((x, y, z0)) for x, y in pts]
        b2 = [s.bm.verts.new((x, y, z1)) for x, y in pts]
        n = len(pts)
        s.bm.faces.new(a); s.bm.faces.new(b2)
        for i in range(n):
            j = (i + 1) % n
            s.bm.faces.new((a[i], a[j], b2[j], b2[i]))
        s._fin(a + b2, mat, I4)

    def arch(s, cx, cy, r, z0, z1, mat, n=8):
        """half-disc (flat bottom at cy) extruded z0..z1 - used for arched tops (no coplanar overlaps)"""
        pts = [(cx + r * math.cos(math.pi * k / n), cy + r * math.sin(math.pi * k / n)) for k in range(n + 1)]
        s.prism(pts, z0, z1, mat)

    def beam(s, p0, p1, t, dz, z, mat):
        """a timber between two 2D points on a face (thickness t, depth dz) at z"""
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]
        s.box(((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, z), (math.hypot(dx, dy), t, dz), mat, Rz(math.atan2(dy, dx)))

    def finish(s):
        bm = s.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bmesh.ops.transform(bm, matrix=Rx(math.pi / 2), verts=bm.verts)   # game (x,y,z) -> blender (x,-z,y)
        me = bpy.data.meshes.new(s.name)
        bm.to_mesh(me); bm.free()
        for m in MATS: me.materials.append(m)
        for p in me.polygons: p.use_smooth = False
        ob = bpy.data.objects.new(s.name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


# ---------------------------------------------------------------- shared details
def finial(b, x, y, z, s=1.0):
    b.box((x, y + 0.12 * s, z), (0.26 * s, 0.26 * s, 0.26 * s), 'gold', Ry(math.pi / 4) @ Rx(math.pi / 4))
    b.cyl((x, y + 0.26 * s + 0.4 * s, z), 0.1 * s, 0, 0.8 * s, 4, 'gold')


def gable_roof(b, w, d, y0, rise, ov=0.45, ovz=0.45, seg=2.1, thick=0.14, ridge=True, fin=True, rowh=0.7):
    """steep shingled gable, ridge along z, centred. eaves at y0 (wall top), ridge y0+rise."""
    half = w / 2
    ex = half + ov
    ey = y0 - rise * ov / half
    dx, dy = ex, (y0 + rise) - ey
    L = math.hypot(dx, dy)
    Dz = d + 2 * ovz
    n = max(3, round(L / rowh))
    rl = L / n
    for s in (-1, 1):
        u = Vector((-s * dx / L, dy / L, 0)); nr = Vector((s * dy / L, dx / L, 0))
        E = Vector((s * ex, ey, 0))
        basis = Matrix(((u.x, nr.x, 0, 0), (u.y, nr.y, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)))
        b.box(tuple(E + u * L / 2 + nr * 0.05), (L, 0.1, Dz), 'roof_blue', basis)       # solid underlay
        for k in range(n):                                                               # offset shingle rows
            c = E + u * ((k + 0.5) * rl) + nr * (0.1 + thick / 2 - 0.015)
            a = -Dz / 2 - ((seg / 2) if (k % 2) else 0.0)
            while a < Dz / 2 - 0.1:
                z0 = max(a + 0.03, -Dz / 2); z1 = min(a + seg - 0.03, Dz / 2)
                if z1 - z0 > 0.2:
                    b.box((c.x, c.y, (z0 + z1) / 2), (rl * 1.42, thick, z1 - z0), 'roof_blue',
                          basis @ Rz(math.radians(-9)))
                a += seg
    if ridge:
        b.box((0, y0 + rise + 0.07, 0), (0.42, 0.34, Dz + 0.04), 'gold')
    if fin:
        for z in (-Dz / 2 + 0.05, Dz / 2 - 0.05):
            finial(b, 0, y0 + rise + 0.2, z, 1.0)


def spire(b, x, z, y0, rb, h, segs, courses, over=0.14, fin=True, fs=1.0):
    """stacked overlapping shingle courses forming a cone/pyramid; rb = base apothem"""
    ch = h / courses
    for i in range(courses):
        t0, t1 = i / courses, (i + 1) / courses
        r0 = rb * (1 - t0) + over
        r1 = 0 if i == courses - 1 else rb * (1 - t1) + over * 0.3
        b.cyl((x, y0 + ch * (i + 0.5), z), r0, r1, ch * 1.02, segs, 'roof_blue')
    if fin:
        finial(b, x, y0 + h - 0.15, z, fs)


def gable_wall(b, w, d, y0, rise):
    b.prism([(-w / 2, y0), (w / 2, y0), (0, y0 + rise)], -d / 2, d / 2, 'stone')


def gable_frame(b, w, y0, rise, z):
    """dark timber frame on a gable-end face (local z = face plane)"""
    half = w / 2
    t, dz = 0.16, 0.1
    zz = z + dz / 2 - 0.02
    b.beam((-half + 0.05, y0 + 0.1), (half - 0.05, y0 + 0.1), t + 0.04, dz, zz, 'timber')
    b.beam((0, y0 + 0.1), (0, y0 + rise * 0.78), t, dz, zz, 'timber')
    yy = lambda x: y0 + rise * (1 - abs(x) / half) - 0.42
    for s in (-1, 1):
        b.beam((0, yy(0)), (s * (half - 0.35), yy(half - 0.35)), t, dz, zz, 'timber')
        b.beam((0, y0 + rise * 0.42), (s * half * 0.5, y0 + 0.1), t * 0.85, dz, zz, 'timber')


def frame_face(b, W, y0, y1, posts, braces=True):
    """half-timber face on the local z=0 plane (outward +z)"""
    t, dz = 0.17, 0.1
    zz = dz / 2 - 0.02
    b.box((0, y0 + 0.12, zz), (W + 0.02, 0.24, dz + 0.04), 'timber')
    b.box((0, y1 - 0.12, zz), (W + 0.02, 0.24, dz + 0.04), 'timber')
    for x in posts:
        b.box((x, (y0 + y1) / 2, zz), (t, y1 - y0, dz), 'timber')
    if braces and len(posts) >= 2:
        for x, s in ((posts[0], 1), (posts[-1], -1)):
            b.beam((x, y1 - 0.24 - 0.85), (x + s * 0.85, y1 - 0.24), 0.14, dz, zz, 'timber')


def courses(b, W, D, y0, y1, step=0.9, sides=(1, 1, 1, 1)):
    """thin mortar bands -> reads as block rows"""
    y = y0 + step
    while y < y1 - 0.25:
        if sides[0]: b.box((0, y, D / 2), (W + 0.04, 0.07, 0.06), 'stone_dark')
        if sides[1]: b.box((0, y, -D / 2), (W + 0.04, 0.07, 0.06), 'stone_dark')
        if sides[2]: b.box((W / 2, y, 0), (0.06, 0.07, D + 0.04), 'stone_dark')
        if sides[3]: b.box((-W / 2, y, 0), (0.06, 0.07, D + 0.04), 'stone_dark')
        y += step


def quoins(b, W, D, y0, y1, row=0.9, p=0.07):
    """chunky alternating corner blocks that stand proud of the wall"""
    n = max(2, round((y1 - y0) / row))
    rh = (y1 - y0) / n
    for sx in (-1, 1):
        for sz in (-1, 1):
            for j in range(n):
                a, c = (0.82, 0.5) if j % 2 == 0 else (0.5, 0.82)
                yc = y0 + rh * (j + 0.5)
                b.box((sx * (W / 2 - a / 2 + p / 2), yc, sz * (D / 2 + p / 2)), (a + p, rh - 0.05, p * 2), 'stone')
                b.box((sx * (W / 2 + p / 2), yc, sz * (D / 2 - c / 2 + p / 2)), (p * 2, rh - 0.05, c + p), 'stone')


def stone_body(b, W, D, y0, y1, plinth=True, quoin=True, course=True, row=0.9):
    if plinth:
        b.bx(-W / 2 - 0.16, W / 2 + 0.16, 0, 0.5, -D / 2 - 0.16, D / 2 + 0.16, 'stone_dark')
        b.bx(-W / 2 - 0.08, W / 2 + 0.08, 0.5, 0.62, -D / 2 - 0.08, D / 2 + 0.08, 'stone')
    b.bx(-W / 2, W / 2, y0, y1, -D / 2, D / 2, 'stone')
    if course: courses(b, W, D, y0 + 0.4 if plinth else y0, y1, row)
    if quoin: quoins(b, W, D, 0.62 if plinth else y0, y1, row)


def window(b, x, y, w=0.9, h=1.1, flowers=True):
    b.push(T((x, y, 0)))
    b.box((0, 0, 0.04), (w + 0.22, h + 0.22, 0.1), 'wood')
    b.box((0, 0, 0.1), (w, h, 0.06), 'window_glow')
    b.box((0, 0, 0.13), (0.07, h, 0.05), 'wood')
    b.box((0, 0, 0.135), (w, 0.07, 0.06), 'wood')
    b.box((0, -h / 2 - 0.16, 0.12), (w + 0.4, 0.1, 0.3), 'stone_dark')
    if flowers:
        b.box((0, -h / 2 - 0.4, 0.2), (w + 0.2, 0.3, 0.3), 'wood')
        b.box((0, -h / 2 - 0.22, 0.2), (w + 0.1, 0.1, 0.24), 'leaf')
        n = max(3, int((w + 0.2) / 0.2))
        for i in range(n):
            xx = -(w + 0.2) / 2 + 0.14 + i * (w + 0.2 - 0.28) / (n - 1)
            b.cyl((xx, -h / 2 - 0.12, 0.2 + (0.05 if i % 2 else -0.04)), 0.09, 0, 0.2, 5,
                  'flower_red' if i % 2 else 'flower_pink')
    b.pop()


def arch_window(b, x, y0, w=0.8, h=1.7):
    b.push(T((x, y0, 0)))
    hr = h - w / 2
    b.box((0, hr / 2, 0.04), (w + 0.28, hr, 0.1), 'stone_dark')
    b.arch(0, hr, (w + 0.28) / 2, -0.01, 0.09, 'stone_dark')
    b.box((0, hr / 2, 0.1), (w, hr, 0.06), 'window_glow')
    b.arch(0, hr, w / 2, 0.07, 0.13, 'window_glow')
    b.box((0, h / 2 - 0.1, 0.13), (0.07, h - 0.1, 0.05), 'wood')
    b.pop()


def door(b, x, w=1.15, h=2.05, steps=True):
    """arched wooden door standing proud of the plinth, with stone steps"""
    b.push(T((x, 0, 0)))
    hr = h - w / 2
    R = w / 2 + 0.2
    b.box((0, hr / 2, 0.1), (w + 0.4, hr, 0.2), 'stone_dark')
    b.arch(0, hr, R, 0.0, 0.2, 'stone_dark')
    b.box((0, hr / 2, 0.16), (w, hr, 0.12), 'wood')
    b.arch(0, hr, w / 2, 0.1, 0.22, 'wood')
    for sx in (-w / 6, w / 6):
        b.box((sx, hr / 2 + 0.2, 0.225), (0.05, hr - 0.2, 0.03), 'timber')
    b.box((0, hr + 0.15, 0.225), (0.05, 0.4, 0.03), 'timber')
    b.box((w / 4, 1.0, 0.25), (0.12, 0.12, 0.06), 'gold')
    if steps:
        b.bx(-w / 2 - 0.5, w / 2 + 0.5, 0, 0.34, 0.2, 0.85, 'stone')
        b.bx(-w / 2 - 0.5, w / 2 + 0.5, 0.34, 0.4, 0.2, 0.85, 'stone_dark')
        b.bx(-w / 2 - 0.8, w / 2 + 0.8, 0, 0.17, 0.85, 1.4, 'stone')
    b.pop()


def chimney(b, x, z, y, h=1.9, s=0.8):
    b.bx(x - s / 2, x + s / 2, y, y + h, z - s / 2, z + s / 2, 'stone')
    for yy in (y + h * 0.4, y + h * 0.75):
        b.box((x, yy, z), (s + 0.05, 0.07, s + 0.05), 'stone_dark')
    b.bx(x - s / 2 - 0.1, x + s / 2 + 0.1, y + h, y + h + 0.2, z - s / 2 - 0.1, z + s / 2 + 0.1, 'stone_dark')
    b.bx(x - s / 2 + 0.1, x + s / 2 - 0.1, y + h + 0.2, y + h + 0.24, z - s / 2 + 0.1, z + s / 2 - 0.1, 'iron')


def dormer(b, side, xf, w2, rise, y0, bodyh=1.8, wid=1.7, dep=1.5):
    """dormer on a side slope; front face at x = side*xf, facing +-x"""
    yf = y0 + rise * (1 - xf / (w2 / 2))
    ybot = yf - 0.35
    b.push(T((side * xf, 0, 0)) @ Ry(side * math.pi / 2))
    b.bx(-wid / 2, wid / 2, ybot, ybot + bodyh, -dep, 0, 'stone')
    window(b, 0, ybot + bodyh / 2 + 0.1, 0.62, 0.7, flowers=False)
    b.push(T((0, 0, -dep / 2 + 0.1)))
    gable_roof(b, wid + 0.2, dep - 0.2, ybot + bodyh, 0.75, ov=0.2, ovz=0.25, seg=1.2, thick=0.1, rowh=0.4, fin=False)
    b.pop()
    finial(b, 0, ybot + bodyh + 0.75 + 0.2, 0.0, 0.7)
    b.pop()


# ---------------------------------------------------------------- generic cottage
def house(name, w, d, h1, h2, rise, doors=(-0.9,), win_front=(), win_up=(), win_side=(), dormers=(), chim=None,
          jet=0.28, attic=True, extra=None, post_front=None):
    b = B(name)
    stone_body(b, w, d, 0, h1)
    ye = h1
    W2, D2 = w, d
    if h2:
        W2, D2 = w + 2 * jet, d + 2 * jet
        b.bx(-W2 / 2 - 0.04, W2 / 2 + 0.04, h1 - 0.02, h1 + 0.28, -D2 / 2 - 0.04, D2 / 2 + 0.04, 'timber')
        b.bx(-W2 / 2, W2 / 2, h1 + 0.28, h1 + h2, -D2 / 2, D2 / 2, 'stone')
        for sx in (-1, 1):
            for sz in (-1, 1):   # corbels under the jetty
                b.bx(sx * (w / 2 - 0.1) - 0.15, sx * (w / 2 - 0.1) + 0.15, h1 - 0.45, h1 - 0.02,
                     sz * (d / 2 + jet / 2) - 0.15, sz * (d / 2 + jet / 2) + 0.15, 'timber')
        ye = h1 + h2
        yb = h1 + 0.28
        pf = post_front if post_front is not None else [-W2 / 2 + 0.1, 0, W2 / 2 - 0.1]
        ps = [-D2 / 2 + 0.1, 0, D2 / 2 - 0.1]
        for ang, dist, wd, posts in ((0, D2 / 2, W2, pf), (math.pi, D2 / 2, W2, pf),
                                     (math.pi / 2, W2 / 2, D2, ps), (-math.pi / 2, W2 / 2, D2, ps)):
            b.push(Ry(ang) @ T((0, 0, dist)))
            frame_face(b, wd, yb, ye, posts)
            b.pop()
        for sx in (-1, 1):
            for sz in (-1, 1):
                b.box((sx * (W2 / 2 - 0.04), (yb + ye) / 2, sz * (D2 / 2 - 0.04)), (0.28, ye - yb, 0.28), 'timber')
    gable_wall(b, W2, D2, ye, rise)
    gable_frame(b, W2, ye, rise, D2 / 2)
    b.push(Ry(math.pi)); gable_frame(b, W2, ye, rise, D2 / 2); b.pop()
    if attic:
        b.push(T((0, ye + rise * 0.36, D2 / 2)))
        window(b, 0, 0, 0.55, 0.65, flowers=False)
        b.pop()
    gable_roof(b, W2, D2, ye, rise)
    up_y = h1 + 0.28 + (h2 - 0.28) * 0.5 + 0.1
    b.push(T((0, 0, d / 2)))
    for x in doors: door(b, x)
    for x in win_front: window(b, x, h1 * 0.55 + 0.2)
    b.pop()
    if h2:
        for ang in (0, math.pi):
            b.push(Ry(ang) @ T((0, 0, D2 / 2)))
            for x in win_up: window(b, x, up_y)
            b.pop()
    for ang in (math.pi / 2, -math.pi / 2):
        b.push(Ry(ang) @ T((0, 0, W2 / 2 if h2 else w / 2)))
        for x in win_side:
            window(b, x, h1 * 0.55 + 0.2)
            if h2: window(b, x, up_y, flowers=False)
        b.pop()
    b.push(Ry(math.pi) @ T((0, 0, d / 2)))
    for x in win_front: window(b, x, h1 * 0.55 + 0.2)
    b.pop()
    for sd, xf in dormers: dormer(b, sd, xf, W2, rise, ye)
    if chim:
        cx, cz = chim
        chimney(b, cx, cz, ye + rise * (1 - abs(cx) / (W2 / 2)) - 0.8, 2.0)
    if extra: extra(b)
    return b.finish()


def round_tower(b, x, z, r, h, roof_h, wins=(0,), segs=10, cone_over=0.3, cour=6):
    b.cyl((x, 0.3, z), r + 0.3, r + 0.22, 0.6, segs, 'stone_dark')
    b.cyl((x, 0.65, z), r + 0.12, r + 0.12, 0.1, segs, 'stone')
    b.cyl((x, h / 2 + 0.3, z), r, r, h - 0.6, segs, 'stone')
    yy = 1.4
    while yy < h - 0.7:
        b.cyl((x, yy, z), r + 0.03, r + 0.03, 0.07, segs, 'stone_dark')
        yy += 1.0
    b.cyl((x, h - 0.25, z), r + 0.22, r + 0.1, 0.5, segs, 'stone_dark')
    sd = 2 * math.pi / segs
    for a in wins:
        b.push(T((x, 0, z)) @ Ry(a * sd) @ T((0, 0, r)))
        window(b, 0, h * 0.58, 0.55, 0.8, flowers=False)
        b.pop()
    spire(b, x, z, h, r + cone_over, roof_h, segs, cour, over=0.16, fs=1.1)


def fleur(b, cx, cy, z, s=1.0, dz=0.05):
    """simple original gold fleur: centre petal, two swept side petals, band and tail (extruded polygons)"""
    kite = [(0, 0.5), (0.14, 0.18), (0, -0.22), (-0.14, 0.18)]
    def tr(pts, a=0.0, ox=0.0, oy=0.0):
        return [((px * math.cos(a) - py * math.sin(a)) * s + ox, (px * math.sin(a) + py * math.cos(a)) * s + oy)
                for px, py in pts]
    b.prism(tr(kite, 0, cx, cy + 0.12 * s), z, z + dz, 'gold')
    for sg in (-1, 1):
        b.prism(tr(kite, sg * math.radians(-52), cx + sg * 0.2 * s, cy), z, z + dz, 'gold')
        b.box((cx + sg * 0.34 * s, cy - 0.18 * s, z + dz / 2), (0.1 * s, 0.1 * s, dz), 'gold', Rz(math.pi / 4))
    b.box((cx, cy - 0.12 * s, z + dz / 2), (0.62 * s, 0.1 * s, dz), 'gold')
    b.prism(tr([(0, -0.1), (0.1, -0.22), (0, -0.4), (-0.1, -0.22)], 0, cx, cy - 0.12 * s), z, z + dz, 'gold')


def merlons(b, x0, x1, z, th, y, n):
    step = (x1 - x0) / n
    for i in range(n):
        b.box((x0 + step * (i + 0.5), y + 0.4, z), (step * 0.55, 0.8, th), 'stone')


# ================================================================= PIECES
def build_tavern():
    b = B('tavern')
    W, D, h1, h2, jet = 9.0, 6.0, 3.1, 2.7, 0.28
    W2, D2 = W + 2 * jet, D + 2 * jet
    stone_body(b, W, D, 0, h1)
    ye, yb = h1 + h2, h1 + 0.28
    b.bx(-W2 / 2 - 0.04, W2 / 2 + 0.04, h1 - 0.02, yb, -D2 / 2 - 0.04, D2 / 2 + 0.04, 'timber')
    b.bx(-W2 / 2, W2 / 2, yb, ye, -D2 / 2, D2 / 2, 'stone')
    pw = [-W2 / 2 + 0.1, -3.0, 0.0, 3.0, W2 / 2 - 0.1]
    pd = [-D2 / 2 + 0.1, 0.0, D2 / 2 - 0.1]
    for ang, dist, wd, posts in ((0, D2 / 2, W2, pw), (math.pi, D2 / 2, W2, pw),
                                 (math.pi / 2, W2 / 2, D2, pd), (-math.pi / 2, W2 / 2, D2, pd)):
        b.push(Ry(ang) @ T((0, 0, dist)))
        frame_face(b, wd, yb, ye, posts)
        b.pop()
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.box((sx * (W2 / 2 - 0.04), (yb + ye) / 2, sz * (D2 / 2 - 0.04)), (0.28, ye - yb, 0.28), 'timber')
    rise = 3.1
    b.push(Ry(math.pi / 2))                      # main ridge runs along x
    gable_wall(b, D2, W2, ye, rise)
    gable_frame(b, D2, ye, rise, W2 / 2)
    b.push(Ry(math.pi)); gable_frame(b, D2, ye, rise, W2 / 2); b.pop()
    gable_roof(b, D2, W2, ye, rise, seg=2.4)
    b.pop()
    # front cross-gable wing, 2 storeys
    ww, pr, wj = 4.4, 1.5, 0.2
    wz0, wz1 = D / 2 - 0.3, D / 2 + pr
    b.bx(-ww / 2 - 0.16, ww / 2 + 0.16, 0, 0.5, wz0, wz1 + 0.16, 'stone_dark')
    b.bx(-ww / 2, ww / 2, 0.5, h1, wz0, wz1, 'stone')
    courses(b, ww, wz1 - wz0, 0.4, h1, 0.9, sides=(0, 0, 0, 0))
    b.bx(-ww / 2 - wj - 0.04, ww / 2 + wj + 0.04, h1 - 0.02, yb, wz0, wz1 + wj + 0.04, 'timber')
    b.bx(-ww / 2 - wj, ww / 2 + wj, yb, ye, wz0, wz1 + wj, 'stone')
    zf = wz1 + wj
    cw = ww + 2 * wj
    b.push(T((0, 0, zf)))
    frame_face(b, cw, yb, ye, [-cw / 2 + 0.1, 0.0, cw / 2 - 0.1])
    b.pop()
    for sx in (-1, 1):
        b.box((sx * (cw / 2 - 0.04), (yb + ye) / 2, zf - 0.04), (0.28, ye - yb, 0.28), 'timber')
    ch = rise * (cw / 2) / (D2 / 2)             # same slope as main roof
    dd = zf + 2.5
    b.push(T((0, 0, zf - dd / 2)))
    gable_wall(b, cw, dd, ye, ch)
    gable_roof(b, cw, dd, ye, ch, ov=0.35, ovz=0.45, fin=False)
    b.pop()
    finial(b, 0, ye + ch + 0.2, zf + 0.4, 1.0)
    b.push(T((0, 0, zf)))
    gable_frame(b, cw, ye, ch, 0.0)
    b.push(T((0, ye + ch * 0.36, 0)))
    window(b, 0, 0, 0.6, 0.7, flowers=False)
    b.pop(); b.pop()
    b.push(T((0, 0, wz1)))
    door(b, 0.0, w=1.4, h=2.2)
    window(b, -1.55, 1.9); window(b, 1.55, 1.9)
    b.pop()
    b.push(T((0, 0, zf)))
    window(b, 0, yb + (h2 - 0.28) / 2 + 0.1, 1.0, 1.1)
    b.pop()
    b.push(T((0, 0, D2 / 2)))
    for x in (-3.4, -2.0, 3.0): window(b, x, yb + (h2 - 0.28) / 2 + 0.1)
    b.pop()
    b.push(T((0, 0, D / 2)))
    for x in (-3.4, -2.0, 3.0): window(b, x, 1.9)
    b.pop()
    for ang in (math.pi, math.pi / 2, -math.pi / 2):
        xs = (-2.0, 2.0) if ang == math.pi else (0.0,)
        b.push(Ry(ang) @ T((0, 0, (D2 if ang == math.pi else W2) / 2)))
        for x in xs: window(b, x, yb + (h2 - 0.28) / 2 + 0.1, flowers=False)
        b.pop()
        b.push(Ry(ang) @ T((0, 0, (D if ang == math.pi else W) / 2)))
        for x in xs: window(b, x, 1.9, flowers=False)
        b.pop()
    chimney(b, 3.2, -1.2, ye + rise * (1 - 1.2 / (D2 / 2)) - 0.8, 2.4, 0.95)
    # hanging sign bracket on the front wall, right of the wing
    b.push(T((3.4, 0, D2 / 2)))
    y = 4.6
    b.bx(-0.07, 0.07, y - 0.05, y + 0.05, 0.0, 1.9, 'iron')
    b.beam((0.0, y - 0.75), (0.95, y - 0.02), 0.09, 0.09, 0.0, 'iron')
    b.box((1.9, y + 0.06, 0.0), (0.16, 0.16, 0.16), 'gold', Ry(math.pi / 4))
    b.cyl((1.9, y + 0.3, 0.0), 0.08, 0, 0.35, 4, 'gold')
    b.box((1.25, y - 0.2, 0.0), (0.04, 0.4, 0.04), 'iron'); b.box((1.8, y - 0.2, 0.0), (0.04, 0.4, 0.04), 'iron')
    b.bx(1.05, 1.95, y - 0.95, y - 0.4, -0.05, 0.05, 'wood')
    b.bx(1.05, 1.95, y - 0.45, y - 0.4, -0.07, 0.07, 'gold')
    b.bx(1.05, 1.95, y - 0.95, y - 0.9, -0.07, 0.07, 'gold')
    b.bx(1.38, 1.62, y - 0.85, y - 0.52, 0.04, 0.09, 'gold')      # mug emblem
    b.bx(1.62, 1.72, y - 0.78, y - 0.6, 0.04, 0.09, 'gold')
    b.pop()
    return b.finish()


def build_chapel():
    b = B('chapel')
    W, D, h1, rise = 5.6, 9.0, 4.6, 4.3
    stone_body(b, W, D, 0, h1, row=1.0)
    gable_wall(b, W, D, h1, rise)
    tx, tz, tw = -4.15, 1.6, 3.0              # bell tower beside the nave
    b.push(T((tx, 0, tz)))
    stone_body(b, tw, tw, 0, 6.6, row=1.0)
    b.bx(-tw / 2 - 0.15, tw / 2 + 0.15, 6.6, 6.85, -tw / 2 - 0.15, tw / 2 + 0.15, 'stone_dark')
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.box((sx * (tw / 2 - 0.2), 7.75, sz * (tw / 2 - 0.2)), (0.4, 1.8, 0.4), 'stone')
    b.bx(-tw / 2 + 0.35, tw / 2 - 0.35, 6.85, 7.0, -tw / 2 + 0.35, tw / 2 - 0.35, 'timber')
    b.bx(-tw / 2 + 0.35, tw / 2 - 0.35, 8.35, 8.5, -tw / 2 + 0.35, tw / 2 - 0.35, 'timber')
    b.box((0, 8.2, 0), (0.14, 0.3, 0.14), 'iron'); b.box((0, 8.2, 0), (tw - 0.9, 0.14, 0.14), 'timber')
    b.cyl((0, 7.55, 0), 0.5, 0.25, 0.95, 8, 'gold')
    b.bx(-tw / 2 - 0.15, tw / 2 + 0.15, 8.6, 8.85, -tw / 2 - 0.15, tw / 2 + 0.15, 'stone_dark')
    spire(b, 0, 0, 8.85, tw / 2 + 0.25, 4.0, 4, 6, over=0.2, fs=1.3)
    for ang in (0, math.pi / 2, math.pi, -math.pi / 2):
        b.push(Ry(ang) @ T((0, 0, tw / 2)))
        window(b, 0, 3.9, 0.5, 0.8, flowers=False)
        b.pop()
    b.pop()
    gable_frame(b, W, h1, rise, D / 2)
    b.push(Ry(math.pi)); gable_frame(b, W, h1, rise, D / 2); b.pop()
    b.push(T((0, h1 + rise * 0.34, D / 2)))    # rose window
    b.cyl((0, 0, 0.06), 1.05, 1.05, 0.14, 12, 'stone_dark', axis='z')
    b.cyl((0, 0, 0.14), 0.82, 0.82, 0.08, 12, 'window_glow', axis='z')
    for k in range(4):
        b.box((0, 0, 0.19), (1.65, 0.1, 0.05), 'wood', Rz(k * math.pi / 4))
    b.cyl((0, 0, 0.2), 0.18, 0.18, 0.06, 8, 'gold', axis='z')
    b.pop()
    gable_roof(b, W, D, h1, rise, seg=2.4)
    b.push(T((0, 0, D / 2)))
    door(b, 0.0, w=1.5, h=2.7)
    window(b, -1.95, 2.6, 0.55, 1.0, flowers=False); window(b, 1.95, 2.6, 0.55, 1.0, flowers=False)
    b.pop()
    for ang in (math.pi / 2, -math.pi / 2):
        b.push(Ry(ang) @ T((0, 0, W / 2)))
        for x in (-2.5, 0.0, 2.5): arch_window(b, x, 1.6, 0.8, 2.2)
        b.pop()
    for z in (-3.0, 0.0, 3.0):                  # buttresses on the right side
        b.bx(W / 2, W / 2 + 0.4, 0, 3.4, z - 0.2, z + 0.2, 'stone')
        b.bx(W / 2, W / 2 + 0.5, 3.4, 3.7, z - 0.25, z + 0.25, 'stone_dark')
    return b.finish()


def build_keep():
    b = B('castle_keep')
    W, D, h1, rise = 14.0, 9.0, 8.0, 4.8
    stone_body(b, W, D, 0, h1, row=1.1)
    gable_wall(b, W - 0.2, D, h1, rise)
    gable_frame(b, W - 0.2, h1, rise, D / 2)
    b.push(Ry(math.pi)); gable_frame(b, W - 0.2, h1, rise, D / 2); b.pop()
    gable_roof(b, W - 0.2, D, h1, rise, ov=0.6, ovz=0.6, seg=2.0, rowh=0.8, thick=0.2)
    for sx in (-1, 1):
        for sz in (-1, 1):
            round_tower(b, sx * 7.7, sz * 4.5, 2.5, 11.5, 5.6, wins=(0,) if sz > 0 else (), cone_over=0.45, cour=7)
    b.push(T((0, 0, D / 2)))
    door(b, 0.0, w=2.4, h=3.6)
    for x in (-3.6, 3.6): window(b, x, 3.4, 0.9, 1.3)
    for x in (-5.2, -2.6, 2.6, 5.2): arch_window(b, x, 5.3, 0.8, 1.9)
    b.bx(-1.3, 1.3, 5.2, 5.4, 0.0, 0.8, 'stone_dark')
    window(b, 0, 6.5, 1.0, 1.5, flowers=False)
    b.pop()
    for x in (-1.9, 1.9):
        b.push(T((x, 0, D / 2 + 0.2)))
        b.bx(-0.45, 0.45, 3.5, 6.2, 0.0, 0.08, 'roof_blue')
        b.prism([(-0.45, 3.5), (0.45, 3.5), (0.0, 3.0)], 0.0, 0.08, 'roof_blue')
        fleur(b, 0, 5.0, 0.08, 1.15)
        b.pop()
    for ang in (math.pi / 2, -math.pi / 2):
        b.push(Ry(ang) @ T((0, 0, W / 2)))
        for x in (-2.0, 2.0):
            window(b, x, 3.6, 0.9, 1.3, flowers=False)
            arch_window(b, x, 5.4, 0.8, 1.9)
        b.pop()
    chimney(b, 4.0, -1.5, h1 + rise * (1 - 4.0 / 7.0) - 0.9, 2.6, 1.1)
    return b.finish()


def build_wall():
    b = B('castle_wall_segment')
    L, th, h = 6.0, 1.6, 4.4
    b.bx(-L / 2, L / 2, 0, 0.7, -th / 2 - 0.2, th / 2 + 0.2, 'stone_dark')
    b.bx(-L / 2, L / 2, 0.7, h, -th / 2, th / 2, 'stone')
    y = 1.5
    while y < h - 0.3:
        b.box((0, y, th / 2), (L, 0.07, 0.06), 'stone_dark'); b.box((0, y, -th / 2), (L, 0.07, 0.06), 'stone_dark')
        y += 0.9
    b.bx(-L / 2, L / 2, h, h + 0.25, -th / 2 - 0.2, th / 2 + 0.2, 'stone_dark')
    for z in (th / 2 - 0.2, -th / 2 + 0.2):
        merlons(b, -L / 2, L / 2, z, 0.4, h + 0.25, 4)
    for z in (th / 2, -th / 2):
        b.bx(-0.12, 0.12, 2.3, 3.4, z - 0.04, z + 0.04, 'iron')
    b.bx(-L / 2, L / 2, h - 0.5, h - 0.3, -th / 2 - 0.05, th / 2 + 0.05, 'roof_blue')
    return b.finish()


def build_gatehouse():
    b = B('castle_gatehouse')
    D, gw, gh = 3.2, 3.4, 3.7
    for sx in (-1, 1):
        b.push(T((sx * 3.3, 0, 0)))
        stone_body(b, 3.4, D, 0, 6.2, row=1.0)
        b.bx(-1.9, 1.9, 6.2, 6.5, -D / 2 - 0.2, D / 2 + 0.2, 'stone_dark')
        spire(b, 0, 0, 6.5, 1.9, 4.0, 4, 6, over=0.18, fs=1.2)
        for ang in (0, math.pi):
            b.push(Ry(ang) @ T((0, 0, D / 2)))
            window(b, 0, 4.4, 0.6, 0.9, flowers=False)
            b.pop()
        b.pop()
    b.bx(-gw / 2, gw / 2, gh, 5.0, -D / 2 + 0.2, D / 2 - 0.2, 'stone')
    b.bx(-gw / 2 - 0.1, gw / 2 + 0.1, 5.0, 5.25, -D / 2 - 0.15, D / 2 + 0.15, 'stone_dark')
    merlons(b, -gw / 2 - 0.1, gw / 2 + 0.1, D / 2 - 0.05, 0.4, 5.25, 3)
    merlons(b, -gw / 2 - 0.1, gw / 2 + 0.1, -D / 2 + 0.05, 0.4, 5.25, 3)
    for z in (D / 2 - 0.2, -D / 2 + 0.2):
        b.bx(-gw / 2 - 0.25, -gw / 2, 0, gh - 0.9, z - 0.12, z + 0.12, 'stone_dark')
        b.bx(gw / 2, gw / 2 + 0.25, 0, gh - 0.9, z - 0.12, z + 0.12, 'stone_dark')
        b.arch(0, gh - 0.9, gw / 2 + 0.25, z - 0.12, z + 0.12, 'stone_dark', 12)
    b.bx(-gw / 2, gw / 2, 0, gh - 0.9, -D / 2 + 0.3, D / 2 - 0.3, 'iron')
    b.arch(0, gh - 0.9, gw / 2, -D / 2 + 0.3, D / 2 - 0.3, 'iron', 12)
    z = D / 2 - 0.35                              # portcullis
    for i in range(5): b.box((-1.4 + i * 0.7, 1.9, z), (0.1, 3.4, 0.08), 'timber')
    for yy in (0.8, 1.7, 2.6): b.box((0, yy, z), (gw - 0.1, 0.1, 0.08), 'timber')
    b.bx(-gw / 2 - 0.4, gw / 2 + 0.4, 0, 0.3, D / 2 - 0.2, D / 2 + 1.0, 'stone')
    b.bx(-gw / 2 - 0.9, gw / 2 + 0.9, 0, 0.15, D / 2 + 1.0, D / 2 + 1.5, 'stone')
    b.push(T((0, 0, D / 2 - 0.1)))
    b.bx(-0.55, 0.55, 4.0, 4.9, 0.0, 0.1, 'roof_blue')
    fleur(b, 0, 4.5, 0.1, 0.85)
    b.pop()
    return b.finish()


def build_lamp():
    b = B('lamp_post')
    b.cyl((0, 0.2, 0), 0.42, 0.34, 0.4, 8, 'stone_dark')
    b.cyl((0, 0.55, 0), 0.2, 0.15, 0.35, 8, 'iron')
    b.cyl((0, 1.9, 0), 0.09, 0.09, 2.8, 6, 'iron')
    b.cyl((0, 1.0, 0), 0.15, 0.15, 0.1, 6, 'iron')
    b.cyl((0, 3.3, 0), 0.14, 0.14, 0.1, 6, 'iron')
    b.bx(-0.3, 0.3, 3.4, 3.5, -0.3, 0.3, 'iron')
    b.bx(-0.24, 0.24, 3.5, 4.1, -0.24, 0.24, 'window_glow')
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.box((sx * 0.26, 3.8, sz * 0.26), (0.07, 0.7, 0.07), 'iron')
    b.cyl((0, 4.3, 0), 0.4, 0, 0.45, 4, 'gold')
    b.box((0, 4.62, 0), (0.12, 0.12, 0.12), 'gold', Ry(0.8))
    for sg in (-1, 1):
        b.beam((0, 2.2), (sg * 0.35, 2.6), 0.06, 0.06, 0.0, 'iron')
        b.beam((sg * 0.35, 2.6), (sg * 0.4, 3.0), 0.06, 0.06, 0.0, 'iron')
    return b.finish()


def build_banner():
    b = B('banner')
    b.bx(-0.3, 0.3, 0, 0.3, -0.3, 0.3, 'stone_dark')
    b.cyl((0, 2.3, 0), 0.07, 0.07, 4.0, 6, 'timber')
    b.cyl((0, 4.35, 0), 0.1, 0, 0.45, 4, 'gold')
    b.box((0, 4.2, 0), (0.18, 0.18, 0.18), 'gold', Ry(0.8))
    b.box((0, 3.95, 0.0), (1.55, 0.1, 0.1), 'timber')
    for sx in (-0.78, 0.78):
        b.box((sx, 3.95, 0.0), (0.16, 0.16, 0.16), 'gold', Ry(0.8))
    b.prism([(-0.62, 3.9), (0.62, 3.9), (0.62, 1.35), (0.0, 1.85), (-0.62, 1.35)], 0.06, 0.12, 'roof_blue')
    b.bx(-0.62, 0.62, 3.72, 3.9, 0.115, 0.14, 'gold')
    b.prism([(-0.62, 1.35), (0.0, 1.85), (0.0, 1.97), (-0.62, 1.5)], 0.115, 0.14, 'gold')     # trim along the tail
    b.prism([(0.0, 1.85), (0.62, 1.35), (0.62, 1.5), (0.0, 1.97)], 0.115, 0.14, 'gold')
    b.bx(-0.62, -0.52, 1.5, 3.9, 0.115, 0.14, 'gold'); b.bx(0.52, 0.62, 1.5, 3.9, 0.115, 0.14, 'gold')
    fleur(b, 0, 2.95, 0.14, 1.2)
    return b.finish()


def build_planter():
    b = B('flower_planter')
    b.bx(-0.85, 0.85, 0, 0.12, -0.45, 0.45, 'stone_dark')
    b.bx(-0.75, 0.75, 0.12, 0.62, -0.35, 0.35, 'stone')
    b.bx(-0.82, 0.82, 0.55, 0.7, -0.42, 0.42, 'stone_dark')
    b.bx(-0.68, 0.68, 0.7, 0.78, -0.28, 0.28, 'leaf')
    for i in range(7):
        for j, z in enumerate((-0.12, 0.13)):
            xx = -0.58 + i * 0.193 + (0.09 if j else 0)
            b.box((xx, 0.86, z), (0.05, 0.16, 0.05), 'leaf')
            b.cyl((xx, 1.0 + 0.04 * ((i + j) % 2), z), 0.1, 0, 0.18, 5, ['flower_red', 'flower_pink'][(i + j) % 2])
    return b.finish()


def build_market():
    b = B('market_stall')
    W, D = 3.0, 1.9
    for sx in (-1, 1):
        b.bx(sx * (W / 2 - 0.1) - 0.07, sx * (W / 2 - 0.1) + 0.07, 0, 2.55, D / 2 - 0.17, D / 2 - 0.03, 'wood')
        b.bx(sx * (W / 2 - 0.1) - 0.07, sx * (W / 2 - 0.1) + 0.07, 0, 3.0, -D / 2 + 0.03, -D / 2 + 0.17, 'wood')
    b.bx(-W / 2 + 0.2, W / 2 - 0.2, 0, 0.95, 0.15, D / 2 - 0.2, 'wood')
    b.bx(-W / 2 + 0.1, W / 2 - 0.1, 0.95, 1.05, 0.05, D / 2 - 0.05, 'stone')
    b.bx(-W / 2 + 0.2, W / 2 - 0.2, 0.3, 0.38, D / 2 - 0.21, D / 2 - 0.19, 'timber')
    b.bx(-W / 2 + 0.1, W / 2 - 0.1, 0.9, 2.6, -D / 2 + 0.17, -D / 2 + 0.23, 'wood')
    b.box((0, 2.84, 0.0), (W + 0.5, 0.12, D + 0.5), 'stone', Rx(math.radians(11)))   # cream canopy, slopes to front
    n = 6
    sw = (W + 0.5) / n
    for i in range(n):
        x = -(W + 0.5) / 2 + sw * (i + 0.5)
        b.prism([(x - sw / 2 + 0.02, 2.78), (x + sw / 2 - 0.02, 2.78), (x, 2.48)], D / 2 + 0.2, D / 2 + 0.3,
                'awning_blue' if i % 2 == 0 else 'stone')
    b.bx(-(W + 0.5) / 2, (W + 0.5) / 2, 2.7, 2.82, D / 2 + 0.18, D / 2 + 0.3, 'awning_blue')
    for sx in (-1, 1): finial(b, sx * (W / 2 - 0.1), 3.0, -D / 2 + 0.1, 0.7)
    for i, x in enumerate((-1.0, -0.2, 0.7, 1.15)):
        b.bx(x - 0.2, x + 0.2, 1.05, 1.3, 0.45, 0.85, 'wood')
        b.cyl((x, 1.42, 0.65), 0.15, 0.08, 0.18, 6, ['flower_red', 'leaf', 'flower_pink', 'flower_red'][i])
    b.box((-0.1, 1.2, 0.3), (0.3, 0.3, 0.3), 'gold', Ry(0.6))
    return b.finish()


def build_barrel():
    b = B('barrel')
    b.cyl((0, 0.2, 0), 0.4, 0.5, 0.4, 10, 'wood')
    b.cyl((0, 0.6, 0), 0.5, 0.4, 0.4, 10, 'wood')
    b.cyl((0, 0.99, 0), 0.4, 0.37, 0.05, 10, 'timber')
    for y, r in ((0.1, 0.43), (0.38, 0.5), (0.62, 0.5), (0.9, 0.43)):
        b.cyl((0, y, 0), r + 0.02, r + 0.02, 0.07, 10, 'iron')
    return b.finish()


def build_crate():
    b = B('crate')
    s, t = 0.9, 0.1
    b.bx(-s / 2, s / 2, 0.0, s, -s / 2, s / 2, 'wood')
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.box((sx * (s / 2 - t / 2 + 0.02), s / 2, sz * (s / 2 - t / 2 + 0.02)), (t, s + 0.04, t), 'timber')
    for ang in (0, math.pi / 2, math.pi, -math.pi / 2):
        b.push(Ry(ang) @ T((0, 0, s / 2)))
        for y in (0.07, s - 0.07): b.box((0, y, 0.01), (s - 0.1, 0.09, 0.04), 'timber')
        b.beam((-s / 2 + 0.1, 0.12), (s / 2 - 0.1, s - 0.12), 0.08, 0.04, 0.01, 'timber')
        b.pop()
    return b.finish()


def build_fountain():
    b = B('fountain_small')
    b.cyl((0, 0.15, 0), 1.75, 1.75, 0.3, 8, 'stone_dark')
    b.cyl((0, 0.55, 0), 1.6, 1.5, 0.5, 8, 'stone')
    b.cyl((0, 0.85, 0), 1.7, 1.7, 0.12, 8, 'stone_dark')
    b.cyl((0, 0.8, 0), 1.45, 1.45, 0.06, 8, 'awning_blue')
    b.cyl((0, 1.3, 0), 0.3, 0.22, 1.0, 8, 'stone')
    b.cyl((0, 1.85, 0), 0.8, 0.4, 0.22, 8, 'stone_dark')
    b.cyl((0, 1.98, 0), 0.7, 0.7, 0.04, 8, 'awning_blue')
    b.cyl((0, 2.2, 0), 0.14, 0.1, 0.4, 8, 'stone')
    b.cyl((0, 2.55, 0), 0.38, 0.14, 0.22, 8, 'stone_dark')
    b.cyl((0, 2.68, 0), 0.3, 0.3, 0.04, 8, 'awning_blue')
    b.cyl((0, 2.95, 0), 0.07, 0.04, 0.5, 6, 'awning_blue')
    finial(b, 0, 3.15, 0, 0.7)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        b.box((math.cos(a) * 1.55, 1.0, math.sin(a) * 1.55), (0.3, 0.3, 0.3), 'stone', Ry(a))
    return b.finish()


def build_all():
    P = {}
    P['house_small'] = house('house_small', 5.0, 4.6, 3.1, 0, 3.0, doors=(-0.95,), win_front=(1.25,), win_side=(0.0,),
                             chim=(1.2, -0.6))
    P['house_two_storey'] = house('house_two_storey', 5.4, 4.8, 3.0, 2.6, 2.7, doors=(-1.1,), win_front=(1.3,),
                                  win_up=(-1.2, 1.2), win_side=(0.0,), dormers=((1, 1.6),), chim=(-1.4, -0.5),
                                  post_front=[-3.0, 0.0, 3.0])
    P['house_gabled_narrow'] = house('house_gabled_narrow', 3.8, 6.2, 3.0, 2.3, 2.7, doors=(0.0,),
                                     win_up=(0.0,), win_side=(-1.0, 1.4), chim=(0.0, -1.2), jet=0.25,
                                     post_front=[-2.0, 2.0])

    def tower_extra(b): round_tower(b, -2.55, 1.35, 1.45, 6.0, 3.2, wins=(0, 1, -1), cour=5)
    P['house_tower'] = house('house_tower', 5.2, 4.4, 3.0, 0, 2.6, doors=(1.0,), win_side=(0.5,), chim=(1.0, -0.8),
                             extra=tower_extra, attic=False)

    def shop_extra(b):
        zf, n, W = 4.8 / 2, 10, 6.4
        sw = W / n
        for i in range(n):                         # blue/white striped awning across the front
            mat = 'awning_blue' if i % 2 == 0 else 'stone'
            x = -W / 2 + sw * (i + 0.5)
            b.box((x, 2.75, zf + 0.9), (sw, 0.1, 1.9), mat, Rx(math.radians(22)))
            b.box((x, 2.14, zf + 1.78), (sw, 0.4, 0.1), mat)
            b.prism([(x - sw / 2 + 0.02, 1.95), (x + sw / 2 - 0.02, 1.95), (x, 1.7)], zf + 1.73, zf + 1.83, mat)
        for sx in (-W / 2 + 0.1, W / 2 - 0.1):
            b.bx(sx - 0.07, sx + 0.07, 0, 2.2, zf + 1.7, zf + 1.84, 'wood')
        b.bx(-2.4, 2.4, 0.0, 1.05, zf + 1.0, zf + 1.6, 'wood')
        b.bx(-2.5, 2.5, 1.05, 1.15, zf + 0.92, zf + 1.68, 'stone')
        for i, x in enumerate((-1.9, -1.1, 1.0, 1.8)):
            b.bx(x - 0.25, x + 0.25, 1.15, 1.5, zf + 1.15, zf + 1.55, 'wood')
            b.cyl((x, 1.62, zf + 1.35), 0.17, 0.12, 0.2, 6, ['flower_red', 'flower_pink', 'flower_red', 'leaf'][i])
        b.cyl((0.0, 1.35, zf + 1.3), 0.3, 0.3, 0.4, 8, 'wood')
        b.box((0.0, 1.62, zf + 1.3), (0.55, 0.1, 0.55), 'gold')
    P['shop_stall_house'] = house('shop_stall_house', 6.0, 4.8, 3.4, 0, 2.9, doors=(-2.0,), win_side=(0.0,),
                                  chim=(1.6, -0.5), extra=shop_extra)
    P['tavern'] = build_tavern()
    P['chapel'] = build_chapel()
    P['castle_keep'] = build_keep()
    P['castle_wall_segment'] = build_wall()
    P['castle_gatehouse'] = build_gatehouse()
    P['lamp_post'] = build_lamp()
    P['banner'] = build_banner()
    P['flower_planter'] = build_planter()
    P['market_stall'] = build_market()
    P['barrel'] = build_barrel()
    P['crate'] = build_crate()
    P['fountain_small'] = build_fountain()
    return P


# ================================================================= export + preview
def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def export_glb(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
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
    bg.inputs['Color'].default_value = (0.7, 0.7, 0.7, 1)
    bg.inputs['Strength'].default_value = 0.8


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


def G(x, y, z): return Vector((x, -z, y))


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


def place(src, gx, gz, yaw=0.0):
    o = src.copy(); o.name = src.name + '_inst'
    o.hide_render = False; o.hide_viewport = False
    bpy.context.scene.collection.objects.link(o)
    o.location = G(gx, 0, gz)
    o.rotation_euler = (0, 0, -math.radians(yaw))
    return o


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


def clear_instances():
    for o in [o for o in bpy.data.objects if o.name.endswith('_inst') or o.name.startswith('ground_')]:
        bpy.data.objects.remove(o)


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def sheet(P, names, path, spacing, ortho_w, yaw=28, pitch=26, target_y=3.0, target_x=0.0, target_z=0.0):
    clear_instances()
    rect('floor', 0, 0, 400, 400, '#d4d4d4', -0.02)
    x = -(len(names) - 1) * spacing / 2
    for n in names:
        place(P[n], x, 0, 0); x += spacing
    add_lights()
    make_camera(G(target_x, target_y, target_z), yaw, pitch, 120, ortho=ortho_w)
    render(path)


def town_scene(P, path):
    clear_instances()
    rect('grass', 0, 0, 300, 300, '#86b465', -0.03)
    stone = '#cfc6ae'
    rect('road', 0, 4, 7, 50, stone, 0.0)
    rect('cross', 0, 6, 46, 5, stone, 0.01)
    rect('plaza', 0, -2, 10, 10, '#e5dcc3', 0.02)
    place(P['castle_keep'], 0, -29, 0)
    place(P['castle_gatehouse'], 0, -17, 0)
    for x in (-8.4, -14.4, -20.4, 8.4, 14.4, 20.4): place(P['castle_wall_segment'], x, -17, 0)
    place(P['house_two_storey'], -9.5, 4, 0)
    place(P['house_small'], -9.5, 14, 0)
    place(P['house_tower'], 9.5, 4, 0)
    place(P['shop_stall_house'], 9.5, 14, 0)
    place(P['tavern'], -21, 5, 90)
    place(P['chapel'], 20, 5, -90)
    place(P['house_gabled_narrow'], -3.5, 17, 0)
    place(P['fountain_small'], 0, -2, 0)
    for z in (1, 9, 17):
        place(P['lamp_post'], -4.6, z, 0); place(P['lamp_post'], 4.6, z, 0)
    for x in (-3.5, 3.5): place(P['banner'], x, -12.5, 0)
    for x, z in ((-5.2, 5.5), (5.2, 5.5), (-2.4, 12), (2.4, 12)): place(P['flower_planter'], x, z, 0)
    place(P['market_stall'], 6.2, 9.0, -90)
    place(P['barrel'], -5.6, 9.2, 0); place(P['barrel'], -6.3, 9.7, 0)
    place(P['crate'], -5.6, 10.5, 20); place(P['crate'], 7.9, 11.4, 10)
    add_lights()
    make_camera(G(0, 2.0, -5), 35, 40, 160, fov=30)
    render(path)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    global MATS
    MATS = make_materials()
    P = build_all()
    print('--- triangle counts')
    for n, o in P.items():
        print(f'{n:22s} {tri_count(o):6d}  dims(game) w={o.dimensions.x:.1f} h={o.dimensions.z:.1f} d={o.dimensions.y:.1f}')
    export_glb(list(P.values()))
    print('exported', RAW_GLB)
    if '--no-render' in sys.argv: return
    os.makedirs(SHOTS, exist_ok=True)
    for o in P.values(): o.hide_render = True
    houses = ['house_small', 'house_two_storey', 'house_gabled_narrow', 'house_tower', 'shop_stall_house', 'tavern', 'chapel']
    only = [a for a in sys.argv if a.startswith('--only=')]
    only = only[0][7:].split(',') if only else None
    want = lambda k: only is None or k in only
    cu = [a for a in sys.argv if a.startswith('--closeup=')]
    if cu:   # debug: python3 town_kit_v2.py --closeup=tavern[,yaw,pitch,ortho_scale]
        parts = cu[0][10:].split(',')
        setup_render(900, 760, 16)
        sheet(P, [parts[0]], os.path.join(SHOTS, 'close_' + parts[0] + '.png'), 10, float(parts[3]) if len(parts) > 3 else 16,
              yaw=float(parts[1]) if len(parts) > 1 else 28, pitch=float(parts[2]) if len(parts) > 2 else 24,
              target_y=float(parts[4]) if len(parts) > 4 else P[parts[0]].dimensions.z / 2,
              target_x=float(parts[5]) if len(parts) > 5 else 0.0, target_z=float(parts[6]) if len(parts) > 6 else 0.0)
        return
    if want('sheet'):
        setup_render(1600, 600); sheet(P, houses, os.path.join(SHOTS, "sheet.png"), 10.5, 78, yaw=22, pitch=24)
    if want('castle'):
        setup_render(1280, 640); sheet(P, ['castle_keep', 'castle_gatehouse', 'castle_wall_segment'],
                                       os.path.join(SHOTS, 'sheet_castle.png'), 17, 60, yaw=24, pitch=24, target_y=6.5)
    if want('props'):
        setup_render(1280, 480); sheet(P, ['lamp_post', 'banner', 'flower_planter', 'market_stall', 'barrel', 'crate',
                                           'fountain_small'], os.path.join(SHOTS, 'sheet_props.png'), 4.2, 28,
                                       yaw=25, pitch=22, target_y=1.8)
    if want('town'):
        setup_render(1280, 800); town_scene(P, os.path.join(SHOTS, 'town_scene.png'))


if __name__ == '__main__':
    main()
