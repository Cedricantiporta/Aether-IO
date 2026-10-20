"""Aether Survivor - kit v3 (trees, town pieces, houses, props; cute toy / Zelda: Echoes of Wisdom style).

Rebuild:   python3 art/blender/kit_v3.py                (needs `pip install bpy`, Blender 5.x as a module)
           python3 art/blender/kit_v3.py --no-render    (skip the preview renders)
           python3 art/blender/kit_v3.py --only=trees,town,props,scene     (which renders to make)
           python3 art/blender/kit_v3.py --closeup=tree_oak_big[+name2][,yaw,pitch,ortho,y]
Outputs:   public/models/town/kit_v3.raw.glb (uncompressed), then compress:
             npx @gltf-transform/cli weld   kit_v3.raw.glb kit_v3.weld.glb
             npx @gltf-transform/cli meshopt kit_v3.weld.glb kit_v3.glb --level medium
           previews go to $KITV3_SHOTS (default art/renders/kitv3/): sheet_trees/town/props.png + scene.png.

Conventions (same as town_kit_v2 / nature_kit_v1): geometry is authored in GAME space (x right, y up, +z toward the
viewer = front) and mapped to Blender (x, -z, y) before the mesh is made, so the glTF export (+Y up) is game space.
Every piece = an Empty root named like the piece with ONE child mesh `<piece>_mesh` (origin = ground centre, +Z front).
The Empty wrapper survives `meshopt` quantization (it moves the origin of a node that directly holds a mesh).
18 shared flat-colour materials, no textures.  NEW in v3: every mesh carries a vertex-colour layer (glTF COLOR_0, linear
RGB in 0..1) that MULTIPLIES the material colour: canopies / walls / roofs get dark-base -> light-top gradients.
The material colour is therefore the LIGHTEST tone; the game loader must multiply COLOR_0 into its own vertex colours.
"""
import bpy, bmesh, math, os, sys, random, zlib
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
RAW_GLB = os.environ.get('KITV3_RAW', os.path.join(ROOT, 'public/models/town/kit_v3.raw.glb'))
SHOTS = os.environ.get('KITV3_SHOTS', os.path.join(ROOT, 'art/renders/kitv3'))

# ---------------------------------------------------------------- materials (18 shared flat colours)
PALETTE = {
    'stone': '#efe6d0', 'stone_dark': '#b4a78c', 'wood': '#92603a', 'timber': '#4a2c1a',
    'roof_blue': '#3c56a8', 'gold': '#e8b838', 'window_glow': '#ffd66b', 'flower_red': '#dc3d3d',
    'flower_pink': '#f27aa8', 'leaf': '#4e9a3a', 'awning_blue': '#5b8de0', 'iron': '#2e3036',
    'leaf_light': '#86cc5a', 'barn_red': '#a8452f',
    'cream_white': '#fffaf0', 'rune_glow': '#7ee6ff', 'awning_green': '#4fae6a', 'awning_red': '#e0524a',
}
ORDER = list(PALETTE)
MI = {k: i for i, k in enumerate(ORDER)}
EMISSIVE = ('window_glow', 'rune_glow')
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
        if k in EMISSIVE:
            bsdf.inputs['Emission Color'].default_value = lin(PALETTE[k])
            bsdf.inputs['Emission Strength'].default_value = 3.0
        m.diffuse_color = lin(PALETTE[k])
        m.use_backface_culling = True
        out.append(m)
    return out


def preview_materials():
    """AFTER export: multiply the vertex colour layer into every base colour so Cycles shows the gradients."""
    for m in MATS:
        nt = m.node_tree
        bsdf = nt.nodes['Principled BSDF']
        col = nt.nodes.new('ShaderNodeVertexColor'); col.layer_name = 'Col'
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs['A'].default_value = bsdf.inputs['Base Color'].default_value
        nt.links.new(col.outputs['Color'], mix.inputs['B'])
        nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
        nt.links.new(col.outputs['Alpha'], bsdf.inputs['Alpha'])
        if m.name in EMISSIVE: bsdf.inputs['Emission Strength'].default_value = 1.6 if m.name == 'window_glow' else 1.0


# ---------------------------------------------------------------- math helpers
T = Matrix.Translation
def Rx(a): return Matrix.Rotation(a, 4, 'X')
def Ry(a): return Matrix.Rotation(a, 4, 'Y')
def Rz(a): return Matrix.Rotation(a, 4, 'Z')
def Sc(x, y, z): return Matrix.Diagonal((x, y, z, 1))
I4 = Matrix.Identity(4)
YV = Vector((0, 1, 0))
def V(*a): return Vector(a[0] if len(a) == 1 else a)


def G(x, y, z): return Vector((x, -z, y))
def clamp(x, a=0.0, b=1.0): return a if x < a else (b if x > b else x)
def lerp(a, b, t): return a + (b - a) * t
def mixc(c0, c1, t): return (lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t), 1.0)
def smooth(t): t = clamp(t); return t * t * (3 - 2 * t)


def nz(x, y, z, s=0.0):
    """cheap smooth 3D noise in about [-1, 1]"""
    return (math.sin(x * 1.7 + s * 1.3) * math.cos(y * 2.1 + z * 1.1 + s) + 0.6 * math.sin(z * 2.3 + x * 0.7 + s * 2.1)
            + 0.5 * math.cos(y * 1.9 - x * 1.4 + s * 0.7)) / 2.1


def dirrot(p0, p1):
    d = (Vector(p1) - Vector(p0))
    return YV.rotation_difference(d.normalized()).to_matrix().to_4x4(), d.length


def spline(pts, n=3):
    """Catmull-Rom through pts, n sub-points per segment"""
    P = [Vector(p) for p in pts]
    out = []
    for i in range(len(P) - 1):
        p0 = P[max(i - 1, 0)]; p1 = P[i]; p2 = P[i + 1]; p3 = P[min(i + 2, len(P) - 1)]
        for k in range(n):
            t = k / n; t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-1])
    return out


# ---------------------------------------------------------------- gradients (vertex colour multipliers; game space)
def g_lin(y0, y1, c0, c1):
    """vertical gradient c0 at y0 -> c1 at y1 (multipliers of the material colour)"""
    def f(co, n): return mixc(c0, c1, clamp((co.y - y0) / (y1 - y0)))
    return f


def g_canopy(ymin, ymax, dark=(0.36, 0.58, 0.55), light=(1.0, 1.0, 0.78), k=0.5):
    """dark teal-ish underside -> sun-kissed top: height of the whole canopy + how much the face points up"""
    def f(co, n):
        t = clamp((co.y - ymin) / (ymax - ymin))
        u = clamp(0.5 + 0.5 * n.y)
        return mixc(dark, light, smooth(k * t + (1 - k) * u))
    return f


def g_ao(h=1.2, base=(0.74, 0.7, 0.68), top=(1, 1, 1)):
    return g_lin(0.0, h, base, top)


# ---------------------------------------------------------------- builder
class B:
    def __init__(s, name, jit=0.0):
        s.name = name; s.bm = bmesh.new(); s.M = I4.copy(); s.stack = []
        s.rng = random.Random(zlib.crc32(name.encode()))
        s.jit = jit            # default hand-made irregularity (metres) for box/rbox
        s.grads = {}           # material name -> fn(co, normal) -> rgba multiplier

    def push(s, M): s.stack.append(s.M); s.M = s.M @ M
    def pop(s): s.M = s.stack.pop()

    def _fin(s, verts, mat, M, smooth=False, tag=False):
        bmesh.ops.transform(s.bm, matrix=s.M @ M, verts=verts)
        mi = MI[mat]
        for v in verts:
            for f in v.link_faces:
                f.material_index = mi; f.smooth = smooth
                if tag: f.tag = True

    def _j(s, pos, rot, j):
        j = s.jit if j is None else j
        if not j: return pos, rot
        r = s.rng
        pos = (pos[0] + r.uniform(-j, j), pos[1] + r.uniform(-j, j) * 0.5, pos[2] + r.uniform(-j, j))
        k = j * 1.1
        return pos, (rot or I4) @ Rx(r.uniform(-k, k)) @ Ry(r.uniform(-k, k)) @ Rz(r.uniform(-k, k))

    # ---- primitives
    def ball(s, pos, r, mat, sq=(1, 1, 1), seg=10, rings=7, smooth=True, rot=None):
        v = bmesh.ops.create_uvsphere(s.bm, u_segments=seg, v_segments=rings, radius=1.0)['verts']
        s._fin(v, mat, T(pos) @ (rot or I4) @ Sc(r * sq[0], r * sq[1], r * sq[2]) @ Rx(math.pi / 2), smooth)

    def blob(s, pos, r, mat, sq=(1, 1, 1), seg=10, rings=6, amp=0.12, freq=1.5, seed=0.0, ico=0, rot=None):
        """soft lumpy sphere (noise displaced, smooth shaded): the building block of canopies and rocks"""
        if ico: v = bmesh.ops.create_icosphere(s.bm, subdivisions=ico, radius=1.0)['verts']
        else: v = bmesh.ops.create_uvsphere(s.bm, u_segments=seg, v_segments=rings, radius=1.0)['verts']
        for x in v:
            p = x.co.normalized()
            k = 1.0 + amp * nz(p.x * freq, p.y * freq, p.z * freq, seed) + amp * 0.45 * nz(p.x * freq * 2.3, p.y * freq * 2.3, p.z * freq * 2.3, seed + 5)
            x.co = p * k
        s._fin(v, mat, T(pos) @ (rot or I4) @ Sc(r * sq[0], r * sq[1], r * sq[2]) @ Rx(math.pi / 2), True)

    def box(s, pos, size, mat, rot=None, j=None):
        pos, rot = s._j(pos, rot, j)
        v = bmesh.ops.create_cube(s.bm, size=1.0)['verts']
        s._fin(v, mat, T(pos) @ (rot or I4) @ Sc(size[0], size[1], size[2]))

    def rbox(s, pos, size, mat, r=0.08, rot=None, seg=1, smooth=False, j=None):
        """chamfered / rounded box (all edges beveled)"""
        pos, rot = s._j(pos, rot, j)
        bm = s.bm
        before = set(bm.verts)
        v = bmesh.ops.create_cube(bm, size=1.0)['verts']
        bmesh.ops.transform(bm, matrix=Sc(size[0], size[1], size[2]), verts=v)
        edges = list({e for vv in v for e in vv.link_edges})
        r = min(r, 0.49 * min(size))
        bmesh.ops.bevel(bm, geom=edges, offset=r, offset_type='OFFSET', segments=seg, profile=0.5, affect='EDGES')
        nv = [x for x in bm.verts if x not in before]
        s._fin(nv, mat, T(pos) @ (rot or I4), smooth)

    def bx(s, x0, x1, y0, y1, z0, z1, mat, r=0.08, rot=None, j=None):
        s.rbox(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (x1 - x0, y1 - y0, z1 - z0), mat, r, rot, j=j)

    def cyl(s, pos, r1, r2, h, segs, mat, axis='y', rot=None, smooth=False, caps=True):
        """frustum; radii are APOTHEMS. r1/r2 = 0 -> cone. flat faces align to +-z / +-x"""
        c = math.cos(math.pi / segs)
        sd = 360.0 / segs
        delta = math.radians((270 - sd / 2) % sd)
        v = bmesh.ops.create_cone(s.bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=r1 / c,
                                  radius2=r2 / c, depth=h)['verts']
        if r1 == 0 or r2 == 0:
            bmesh.ops.remove_doubles(s.bm, verts=v, dist=1e-4)
            v = [x for x in v if x.is_valid]
        ax = {'y': Rx(-math.pi / 2), 'z': I4, 'x': Ry(math.pi / 2)}[axis]
        s._fin(v, mat, T(pos) @ (rot or I4) @ ax @ Rz(delta), smooth)

    def limb(s, p0, p1, r0, r1, mat, segs=8, smooth=False):
        rot, L = dirrot(p0, p1)
        mid = (Vector(p0) + Vector(p1)) / 2
        s.cyl(tuple(mid), r0, r1, L, segs, mat, rot=rot, smooth=smooth)

    def strut(s, p0, p1, tx, tz, mat, r=0.04, j=None):
        rot, L = dirrot(p0, p1)
        mid = (Vector(p0) + Vector(p1)) / 2
        s.rbox(tuple(mid), (tx, L, tz), mat, r, rot=rot, j=j)

    def beam(s, p0, p1, t, dz, z, mat, j=None):
        """a timber between two 2D points on a face (thickness t, depth dz) at z"""
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]
        s.box(((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, z), (math.hypot(dx, dy), t, dz), mat, Rz(math.atan2(dy, dx)), j=j)

    def lathe(s, pts, mat, segs=10, pos=(0, 0, 0), M=None, smooth=False, closed=False, lobes=0, amp=0.0, phase=0.0):
        """revolve a (radius, y) profile around y. Profile closed: start/end on the axis (r == 0) or closed=True.
        lobes/amp scallop the radius around the circumference (droopy pine skirts, flower petals)."""
        bm = s.bm
        angs = [2 * math.pi * k / segs for k in range(segs)]
        rings = []
        for r, y in pts:
            if r <= 1e-6: rings.append([bm.verts.new((0, y, 0))])
            else:
                rings.append([bm.verts.new((r * (1 + amp * math.cos(lobes * a + phase)) * math.cos(a), y,
                                            r * (1 + amp * math.cos(lobes * a + phase)) * math.sin(a))) for a in angs])
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

    def tube(s, pts, radii, mat, segs=8, smooth=True, cap=True, sq=1.0):
        """swept tube along a polyline (parallel-transport frames); radii per point (list or callable(t))"""
        P = [Vector(p) for p in pts]
        n = len(P)
        rs = [radii(i / (n - 1)) for i in range(n)] if callable(radii) else list(radii)
        tang = [((P[min(i + 1, n - 1)] - P[max(i - 1, 0)])).normalized() for i in range(n)]
        ref = Vector((0, 0, 1)) if abs(tang[0].z) < 0.9 else Vector((1, 0, 0))
        nx = tang[0].cross(ref).normalized()
        rings = []
        for i in range(n):
            if i:
                nx = nx - tang[i] * nx.dot(tang[i])
                if nx.length < 1e-5: nx = tang[i].cross(Vector((0, 0, 1))).normalized()
                nx.normalize()
            ny = tang[i].cross(nx).normalized()
            rings.append([s.bm.verts.new(P[i] + nx * (math.cos(2 * math.pi * k / segs) * rs[i] * sq) + ny * (math.sin(2 * math.pi * k / segs) * rs[i]))
                          for k in range(segs)])
        allv = [v for r in rings for v in r]
        for i in range(n - 1):
            for k in range(segs):
                k2 = (k + 1) % segs
                s.bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
        if cap:
            s.bm.faces.new(rings[0]); s.bm.faces.new(rings[-1][::-1])
        s._fin(allv, mat, I4, smooth)

    def surf(s, fn, nu, nv, mat, close_u=False, smooth=False, matfn=None, flip=False):
        """parametric surface fn(u, v) -> game-space point, u,v in 0..1. Normal = dP/du x dP/dv (flip to reverse).
        Faces keep this orientation (not auto-recalculated). matfn(i, j) -> material name per cell."""
        bm = s.bm
        cols = nu if close_u else nu + 1
        grid = [[bm.verts.new(fn(i / nu, j / nv)) for j in range(nv + 1)] for i in range(cols)]
        allv = [v for g in grid for v in g]
        for i in range(nu):
            i2 = (i + 1) % cols
            for j in range(nv):
                q = [grid[i][j], grid[i2][j], grid[i2][j + 1], grid[i][j + 1]]
                if flip: q = q[::-1]
                try: f = bm.faces.new(q)
                except ValueError: continue
                f.tag = True
                f.material_index = MI[matfn(i, j) if matfn else mat]; f.smooth = smooth
        bmesh.ops.remove_doubles(bm, verts=allv, dist=1e-5)

    def cloth(s, fn, nu, nv, mat, th=0.05, matfn=None, smooth=False):
        """closed thin solid sheet (both sides visible): top surface fn, bottom offset by th along the normal"""
        bm = s.bm
        def nrm(u, v):
            e = 1e-3
            du = fn(min(u + e, 1), v) - fn(max(u - e, 0), v); dv = fn(u, min(v + e, 1)) - fn(u, max(v - e, 0))
            n = du.cross(dv)
            return n.normalized() if n.length > 1e-9 else Vector((0, 0, 1))
        top = [[bm.verts.new(fn(i / nu, j / nv) + nrm(i / nu, j / nv) * th / 2) for j in range(nv + 1)] for i in range(nu + 1)]
        bot = [[bm.verts.new(fn(i / nu, j / nv) - nrm(i / nu, j / nv) * th / 2) for j in range(nv + 1)] for i in range(nu + 1)]
        allv = [v for g in top + bot for v in g]
        new = []
        for i in range(nu):
            for j in range(nv):
                m = matfn(i, j) if matfn else mat
                for q in ([top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]],
                          [bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j], bot[i][j]]):
                    f = bm.faces.new(q); f.material_index = MI[m]; f.smooth = smooth; new.append(f)
        m0 = MI[mat]
        for i in range(nu):
            for q in ([top[i][0], bot[i][0], bot[i + 1][0], top[i + 1][0]], [top[i + 1][nv], bot[i + 1][nv], bot[i][nv], top[i][nv]]):
                f = bm.faces.new(q); f.material_index = MI[matfn(i, 0) if matfn else mat]; f.smooth = False
        for j in range(nv):
            for q in ([top[0][j + 1], bot[0][j + 1], bot[0][j], top[0][j]], [top[nu][j], bot[nu][j], bot[nu][j + 1], top[nu][j + 1]]):
                f = bm.faces.new(q); f.material_index = MI[matfn(0, j) if matfn else mat]; f.smooth = False
        bmesh.ops.remove_doubles(bm, verts=allv, dist=1e-5)

    def finish(s, name=None):
        """-> Empty root named like the piece, with one child mesh `<piece>_mesh` (origin = ground centre)"""
        bm = s.bm
        bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if not f.tag])
        bm.normal_update()
        layer = bm.loops.layers.color.new('Col')
        for f in bm.faces:
            fn = s.grads.get(ORDER[f.material_index])
            for l in f.loops:
                l[layer] = fn(l.vert.co, l.vert.normal if f.smooth else f.normal) if fn else (1.0, 1.0, 1.0, 1.0)
        bmesh.ops.transform(bm, matrix=Rx(math.pi / 2), verts=bm.verts)      # game (x,y,z) -> blender (x,-z,y)
        me = bpy.data.meshes.new(s.name)
        bm.to_mesh(me); bm.free()
        me.color_attributes.active_color = me.color_attributes['Col']; me.color_attributes.render_color_index = me.color_attributes.active_color_index
        for m in MATS: me.materials.append(m)
        root = bpy.data.objects.new(s.name, None)
        bpy.context.scene.collection.objects.link(root)
        ob = bpy.data.objects.new(s.name + '_mesh', me)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = root
        return root


S, SD, W, TM, RB, GD, GL = 'stone', 'stone_dark', 'wood', 'timber', 'roof_blue', 'gold', 'window_glow'
FR, FP, L, AB, IR, LL, BR = 'flower_red', 'flower_pink', 'leaf', 'awning_blue', 'iron', 'leaf_light', 'barn_red'
CW, RG, AG, AR = 'cream_white', 'rune_glow', 'awning_green', 'awning_red'


# ================================================================= TREES + PLANTS
def trunk(b, pts, r0, r1, flare=0.45, mat=W, segs=8, sub=3, roots=3, root_mat=None, ph=0.3):
    """curvy trunk with a root flare + a few root lumps"""
    sp = spline(pts, sub)
    n = len(sp)
    def rad(t): return lerp(r0, r1, t) + flare * r0 * max(0.0, 1 - t / 0.16) ** 2
    b.tube(sp, rad, mat, segs=segs)
    for k in range(roots):
        a = ph + k * 2 * math.pi / roots + b.rng.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), 0, math.sin(a)))
        c = Vector(pts[0]) + d * r0 * 1.15 + Vector((0, 0.1, 0))
        rot = Ry(-a) @ Rz(0.35)
        b.ball(tuple(c), 1.0, root_mat or mat, sq=(r0 * 1.0, r0 * 0.38, r0 * 0.42), seg=6, rings=4, rot=rot)


def branch(b, p0, p1, r0=0.1, r1=0.05, mat=W, bend=0.15):
    p0, p1 = Vector(p0), Vector(p1)
    mid = (p0 + p1) / 2 + Vector((0, bend, 0))
    b.tube([p0, mid, p1], [r0, (r0 + r1) / 2, r1], mat, segs=6)


def canopy(b, blobs, ymin, ymax, seed=0.0, dark=(0.36, 0.58, 0.55), light=(1.0, 1.0, 0.78), mats=(L, LL), k=0.5, amp=0.11, puffs=0):
    """blobs: (x, y, z, r, matIndex, res[, sq]); res 'L' = icosphere, 'M' mid, 'S' small. Two greens + one gradient."""
    for m in mats: b.grads[m] = g_canopy(ymin, ymax, dark, light, k)
    res = {'M': (12, 7), 'S': (8, 5)}
    for i, bl in enumerate(blobs):
        x, y, z, r, mi, rs = bl[:6]
        sq = bl[6] if len(bl) > 6 else (1.0, 0.88, 1.0)
        rot = Ry(b.rng.uniform(0, 6.28)) @ Rx(b.rng.uniform(-0.6, 0.6))
        if rs == 'L': b.blob((x, y, z), r, mats[mi], sq=sq, ico=2, amp=amp, freq=1.5, seed=seed + i * 1.7, rot=rot)
        else: b.blob((x, y, z), r, mats[mi], sq=sq, seg=res[rs][0], rings=res[rs][1], amp=amp, freq=1.5, seed=seed + i * 1.7, rot=rot)
    # small leaf puffs on the sunny side of the bigger clumps: breaks the big flat tops into clumped leaves
    big = [bl for bl in blobs if bl[5] != 'S']
    for i in range(puffs):
        bl = big[i % len(big)]
        a = b.rng.uniform(0, 6.28); ey = b.rng.uniform(0.25, 0.95); h = math.sqrt(1 - ey * ey)
        d = Vector((math.cos(a) * h, ey, math.sin(a) * h))
        c = Vector(bl[:3]) + Vector((d.x * bl[3], d.y * bl[3] * 0.9, d.z * bl[3])) * 0.93
        b.blob(tuple(c), bl[3] * b.rng.uniform(0.3, 0.4), mats[1 - bl[4]] if len(mats) > 1 else mats[0], seg=7, rings=4, amp=0.1, seed=seed + 40 + i)


def build_trees():
    P = {}
    # ---- big oak: wide soft dome of overlapping clumps, curvy trunk, two branches peeking out
    b = B('tree_oak_big')
    trunk(b, [(0, -0.05, 0), (0.12, 1.2, 0.05), (-0.1, 2.5, 0), (0.05, 3.5, 0.04)], 0.5, 0.3, flare=0.5, sub=2)
    branch(b, (0.05, 2.7, 0), (-1.75, 3.7, 0.5), 0.17, 0.08); branch(b, (0.0, 2.9, 0.02), (1.9, 3.5, -0.3), 0.16, 0.08)
    canopy(b, [
        (0.0, 4.9, 0.0, 2.3, 1, 'L', (1.0, 0.9, 1.0)), (-2.1, 4.0, 0.2, 1.55, 0, 'M'), (2.15, 4.1, -0.1, 1.5, 0, 'M'),
        (0.3, 3.9, 1.9, 1.35, 0, 'M'), (-0.2, 6.0, 0.1, 1.2, 1, 'M'), (1.3, 5.7, 1.1, 1.0, 1, 'S'),
        (-1.3, 5.5, -1.0, 1.05, 0, 'S')], 2.6, 7.2, puffs=6, seed=1)
    P['tree_oak_big'] = b.finish()

    b = B('tree_oak_small')
    trunk(b, [(0, -0.05, 0), (0.08, 0.9, 0.02), (-0.06, 1.7, 0), (0.03, 2.3, 0)], 0.34, 0.2, flare=0.5, roots=3, sub=2)
    branch(b, (0.0, 1.9, 0), (-1.1, 2.55, 0.3), 0.11, 0.05)
    canopy(b, [
        (0.0, 3.2, 0.0, 1.65, 1, 'L', (1.0, 0.9, 1.0)), (-1.35, 2.7, 0.15, 1.05, 0, 'M'), (1.4, 2.75, -0.1, 1.0, 0, 'M'),
        (0.15, 2.65, 1.2, 0.95, 0, 'M'), (0.3, 4.1, 0.2, 0.85, 1, 'M'), (-0.8, 3.7, 0.8, 0.7, 1, 'S')], 1.8, 4.9, puffs=4, seed=4)
    P['tree_oak_small'] = b.finish()

    # ---- birch: white trunk with dark marks, tall airy canopy of stacked clumps
    b = B('tree_birch')
    trunk(b, [(0, -0.05, 0), (0.1, 1.1, 0.04), (-0.08, 2.3, 0), (0.1, 3.4, 0.03)], 0.3, 0.18, flare=0.45, mat=CW, roots=3, sub=2)
    for i, (y, a) in enumerate([(0.8, 0.4), (1.4, 2.1), (2.0, 3.7), (2.6, 5.3), (3.1, 1.2)]):
        c = Vector((0.04 * math.sin(y), y, 0)); r = lerp(0.3, 0.19, y / 3.4) + 0.02
        b.box((c.x + math.cos(a) * r, y, math.sin(a) * r), (0.12, 0.08, 0.05), TM, Ry(-a) @ Rz(0.2 * (-1) ** i), j=0)
        b.box((c.x + math.cos(a + 2.5) * r, y + 0.2, math.sin(a + 2.5) * r), (0.08, 0.06, 0.05), TM, Ry(-a - 2.5), j=0)
    b.grads[CW] = g_lin(0.0, 2.0, (0.8, 0.8, 0.85), (1, 1, 1))
    branch(b, (0.0, 2.8, 0), (-1.0, 3.8, 0.2), 0.08, 0.04, mat=CW); branch(b, (0.05, 3.0, 0), (1.05, 3.95, -0.2), 0.08, 0.04, mat=CW)
    canopy(b, [
        (0.0, 4.6, 0.0, 1.6, 1, 'L', (0.95, 1.08, 0.95)), (-1.0, 3.9, 0.2, 0.95, 0, 'M'), (1.05, 4.0, -0.1, 0.95, 0, 'M'),
        (0.1, 5.9, 0.05, 1.05, 1, 'M'), (-0.5, 5.3, 0.9, 0.8, 1, 'S'), (0.55, 5.2, -0.95, 0.8, 0, 'S')],
        2.9, 6.8, puffs=4, seed=8, dark=(0.42, 0.66, 0.5), light=(1.0, 1.0, 0.7))
    P['tree_birch'] = b.finish()

    # ---- fruit tree: round, lush, red apples
    b = B('tree_fruit')
    trunk(b, [(0, -0.05, 0), (0.1, 0.9, 0.03), (-0.07, 1.8, 0), (0.03, 2.5, 0)], 0.38, 0.23, flare=0.5, sub=2)
    branch(b, (0.0, 2.1, 0), (1.25, 2.85, 0.4), 0.12, 0.06)
    canopy(b, [(0.0, 3.5, 0.0, 1.75, 1, 'L', (1.0, 0.9, 1.0)), (-1.4, 3.0, 0.2, 1.1, 0, 'M'), (1.45, 3.05, -0.1, 1.1, 0, 'M'),
               (0.2, 2.95, 1.35, 1.0, 0, 'S'), (0.3, 4.4, 0.2, 0.95, 1, 'M'), (-0.9, 4.0, 0.8, 0.75, 1, 'S')], 2.0, 5.2, puffs=5, seed=11)
    for k, (a, y, rr) in enumerate([(0.3, 3.3, 1.7), (1.4, 2.5, 1.5), (2.6, 3.7, 1.6), (3.6, 2.7, 1.55), (4.5, 3.4, 1.7),
                                    (5.5, 2.45, 1.5), (0.9, 4.2, 1.15)]):
        px, pz = math.cos(a) * rr * 0.93, math.sin(a) * rr * 0.93
        b.ball((px, y, pz), 0.2, FR, seg=7, rings=5)
        b.ball((px + math.cos(a) * 0.16, y + 0.21, pz + math.sin(a) * 0.16), 0.06, LL, seg=4, rings=3)
    b.grads[FR] = g_lin(2.3, 4.5, (0.75, 0.6, 0.6), (1, 1, 1))
    P['tree_fruit'] = b.finish()

    # ---- blossom: pink canopy, a few leaf accents
    b = B('tree_blossom')
    trunk(b, [(0, -0.05, 0), (-0.15, 1.0, 0.05), (0.12, 2.0, 0), (0.0, 2.9, 0.03)], 0.36, 0.2, flare=0.5, mat=TM, sub=2)
    branch(b, (0.0, 2.3, 0), (-1.3, 3.1, 0.3), 0.11, 0.05, mat=TM); branch(b, (0.0, 2.6, 0), (1.3, 3.3, -0.2), 0.1, 0.05, mat=TM)
    canopy(b, [
        (0.0, 3.9, 0.0, 1.9, 1, 'L', (1.0, 0.9, 1.0)), (-1.6, 3.3, 0.2, 1.2, 0, 'M'), (1.65, 3.4, -0.1, 1.2, 0, 'M'),
        (0.2, 3.2, 1.6, 1.05, 0, 'M'), (-0.5, 5.0, 0.1, 1.0, 1, 'M'), (0.9, 4.9, 0.6, 0.85, 1, 'S')],
        2.3, 5.8, puffs=4, seed=14, dark=(0.66, 0.42, 0.58), light=(1.0, 0.97, 1.0), mats=(FP, FP))
    for k, (a, y, rr) in enumerate([(0.5, 4.2, 1.9), (2.0, 3.0, 1.55), (3.4, 3.6, 2.0), (4.6, 4.5, 1.25), (5.7, 3.1, 1.7)]):
        b.ball((math.cos(a) * rr * 0.95, y, math.sin(a) * rr * 0.95), 0.2, LL if k % 2 else CW, seg=5, rings=3)
    b.grads[LL] = g_canopy(2.3, 5.8)
    b.grads[CW] = g_lin(2.8, 4.6, (0.85, 0.8, 0.88), (1, 1, 1))
    P['tree_blossom'] = b.finish()

    # ---- weeping willow: dome + hanging curtains of leaf strands
    b = B('tree_willow')
    trunk(b, [(0, -0.05, 0), (0.2, 1.1, 0.05), (-0.1, 2.2, 0), (0.15, 3.1, 0.03)], 0.5, 0.28, flare=0.55, sub=2)
    branch(b, (0.1, 2.8, 0), (-1.7, 3.8, 0.4), 0.16, 0.07); branch(b, (0.1, 2.9, 0), (1.8, 3.7, -0.3), 0.15, 0.07)
    canopy(b, [(0.0, 4.5, 0.0, 2.1, 1, 'L', (1.0, 0.85, 1.0)), (-1.4, 4.2, 0.3, 1.2, 0, 'M'), (1.45, 4.25, -0.2, 1.2, 0, 'M'),
               (0.1, 5.5, 0.1, 1.0, 1, 'M')], 2.4, 6.5, puffs=3, seed=17, dark=(0.45, 0.66, 0.54), light=(0.95, 1.0, 0.76))
    n = 15
    for i in range(n):
        a = 2 * math.pi * i / n + b.rng.uniform(-0.15, 0.15)
        rr = 2.0 + b.rng.uniform(-0.1, 0.3)
        ln = b.rng.uniform(2.6, 3.4) if i % 3 else b.rng.uniform(1.6, 2.2)
        top = 4.15 + b.rng.uniform(-0.2, 0.2)
        d = Vector((math.cos(a), 0, math.sin(a)))
        p0 = d * (rr * 0.85) + Vector((0, top, 0))
        p1 = d * (rr * 1.08) + Vector((0, top - ln * 0.45, 0))
        p2 = d * (rr * 1.14) + Vector((0, top - ln, 0))
        b.tube([p0, p1, p2], [0.3, 0.26, 0.06], L if i % 2 else LL, segs=5, sq=1.3, cap=False)
    P['tree_willow'] = b.finish()
    return P


def pine_tier(b, y0, R, h, droop, mat, lobes=7, ph=0.0):
    pts = [(0, y0 + h), (R * 0.32, y0 + h * 0.62), (R * 0.72, y0 + h * 0.2), (R, y0 + droop),
           (R * 0.62, y0 + droop * 0.5 + h * 0.06), (R * 0.28, y0 + h * 0.1), (0, y0 + h * 0.05)]
    b.lathe(pts[::-1], mat, segs=16, smooth=True, lobes=lobes, amp=0.1, phase=ph)


def build_pines():
    P = {}
    def pine(name, tiers, th, seed):
        b = B(name)
        trunk(b, [(0, -0.05, 0), (0.04, th * 0.5, 0), (0, th, 0)], 0.34, 0.24, flare=0.35, roots=3)
        top = tiers[-1][0] + tiers[-1][2]
        b.grads[L] = g_canopy(tiers[0][0], top, dark=(0.3, 0.52, 0.5), light=(0.95, 1.0, 0.8), k=0.65)
        b.grads[LL] = g_canopy(tiers[0][0], top, dark=(0.3, 0.52, 0.5), light=(1.0, 1.0, 0.82), k=0.65)
        for i, (y0, R, h, dr, m) in enumerate(tiers):
            pine_tier(b, y0, R, h, dr, m, lobes=6 + i % 3, ph=i * 0.9)
        b.ball((0, top + 0.12, 0), 0.22, LL, sq=(0.7, 1.4, 0.7), seg=6, rings=4)
        return b.finish()
    P['tree_pine_layered_a'] = pine('tree_pine_layered_a', [
        (1.4, 2.3, 1.5, -0.15, L), (2.4, 1.85, 1.4, -0.1, LL), (3.4, 1.4, 1.3, -0.05, L), (4.35, 0.95, 1.25, 0.0, LL),
        (5.2, 0.55, 1.1, 0.0, L)], 1.7, 3)
    P['tree_pine_layered_b'] = pine('tree_pine_layered_b', [
        (1.2, 1.7, 1.2, -0.12, LL), (2.0, 1.4, 1.1, -0.08, L), (2.8, 1.1, 1.0, -0.04, LL), (3.55, 0.8, 0.95, 0.0, L)], 1.4, 5)
    return P


def frond(b, base, yaw, length, width, lift, droop, mat, nseg=6):
    """a glossy palm leaf: lens-shaped closed ribbon that arcs up then droops"""
    d = Vector((math.cos(yaw), 0, math.sin(yaw)))
    side = Vector((-d.z, 0, d.x))
    base = Vector(base)
    def c(t): return base + d * (length * t) + Vector((0, lift * t - droop * t * t, 0))
    def fn(u, v):
        p = c(u)
        w = width * math.sin(math.pi * clamp(0.12 + 0.88 * u)) ** 0.8 * (1 - 0.1 * u)
        e = 0.03 * math.sin(math.pi * u)
        return p + side * (w * (v - 0.5) * 2) + Vector((0, e - abs(v - 0.5) * 0.18 * w * 2, 0))
    b.cloth(fn, nseg, 2, mat, th=0.05, smooth=True)


def build_palm_bush():
    P = {}
    b = B('palm_v3')
    N = 9; H = 5.2; lean = 1.1
    pts = [(lean * (i / N) ** 2, H * i / N, 0.05 * math.sin(i)) for i in range(N + 1)]
    for i in range(N):
        p0, p1 = Vector(pts[i]), Vector(pts[i + 1])
        rr = 0.3 - 0.11 * (i / N)
        mid = (p0 + p1) / 2
        rot, Ld = dirrot(p0, p1)
        b.ball(tuple(mid), 1.0, W if i % 2 == 0 else SD, sq=(rr * 1.12, Ld * 0.56, rr * 1.12), seg=8, rings=4, rot=rot)
    b.grads[W] = g_lin(0, H, (0.7, 0.62, 0.55), (1, 1, 1))
    b.grads[SD] = g_lin(0, H, (0.7, 0.65, 0.6), (1, 1, 1))
    crown = Vector(pts[-1])
    b.ball(tuple(crown + Vector((0, 0.1, 0))), 0.36, LL, seg=7, rings=5)
    n = 9
    for k in range(n):
        yaw = 2 * math.pi * k / n + b.rng.uniform(-0.12, 0.12)
        frond(b, crown + Vector((0, 0.15, 0)), yaw, 2.5 + 0.25 * (k % 2), 0.4, 0.9 + 0.45 * (k % 2), 2.3 - 0.5 * (k % 2),
              L if k % 2 == 0 else LL)
    b.grads[L] = g_lin(H - 0.2, H + 1.2, (0.55, 0.75, 0.62), (1, 1, 0.85))
    b.grads[LL] = g_lin(H - 0.2, H + 1.5, (0.62, 0.8, 0.65), (1, 1, 0.9))
    for k in range(4):
        a = 2 * math.pi * k / 4 + 0.5
        b.ball(tuple(crown + Vector((math.cos(a) * 0.36, -0.4, math.sin(a) * 0.36))), 0.25, TM, seg=7, rings=5)
        b.ball(tuple(crown + Vector((math.cos(a) * 0.36, -0.4, math.sin(a) * 0.36)) + Vector((0, 0.22, 0))), 0.09, LL, seg=5, rings=3)
    P['palm_v3'] = b.finish()

    b = B('bush_cluster')
    cs = [(0, 0.8, 0, 0.95, 1, 'M'), (0.95, 0.6, 0.5, 0.7, 0, 'M'), (-0.95, 0.6, 0.35, 0.7, 0, 'M'), (0.15, 0.55, -0.9, 0.7, 0, 'M'),
          (0.1, 1.45, 0.05, 0.62, 1, 'S'), (-0.2, 0.5, 1.05, 0.55, 0, 'S'), (1.05, 0.5, -0.5, 0.5, 1, 'S')]
    canopy(b, cs, 0.0, 2.0, seed=21, dark=(0.42, 0.62, 0.56), k=0.45)
    for k, (a, y, rr) in enumerate([(0.5, 0.95, 1.0), (1.9, 0.8, 0.9), (3.2, 1.0, 1.0), (4.4, 0.7, 0.95), (5.5, 0.9, 1.0), (0.1, 1.5, 0.45)]):
        b.ball((math.cos(a) * rr * 0.95, y, math.sin(a) * rr * 0.95), 0.12, [FP, CW, FR][k % 3], seg=5, rings=3)
    P['bush_cluster'] = b.finish()
    return P


# ================================================================= HOUSE PARTS (local frame: front face = +z)
WALL_G = g_ao(1.8, base=(0.7, 0.68, 0.68))
ROOF_G = g_lin(2.0, 8.5, (0.74, 0.76, 0.9), (1.0, 1.0, 1.0))


def house_grads(b):
    b.grads[S] = WALL_G
    b.grads[SD] = g_ao(1.0, base=(0.75, 0.72, 0.7))
    for m in (RB, BR, AG): b.grads[m] = ROOF_G
    b.grads[W] = g_lin(0.0, 3.0, (0.8, 0.78, 0.76), (1, 1, 1))


def finial(b, x, y, z, s=1.0):
    b.rbox((x, y + 0.12 * s, z), (0.26 * s, 0.26 * s, 0.26 * s), GD, r=0.05 * s, rot=Ry(math.pi / 4) @ Rx(math.pi / 4), j=0)
    b.cyl((x, y + 0.26 * s + 0.4 * s, z), 0.1 * s, 0, 0.8 * s, 6, GD)


def gable_roof(b, w, d, y0, rise, roof=RB, ov=0.5, ovz=0.5, seg=1.7, thick=0.15, rowh=0.72, fin=True, ridge=True):
    """steep shingled gable, ridge along z, centred. Offset shingle rows, tiny random tilt/offset per shingle,
    gold ridge + eave + barge trim. eaves at y0 (wall top), ridge at y0 + rise."""
    half = w / 2
    ex = half + ov
    ey = y0 - rise * ov / half
    dx, dy = ex, (y0 + rise) - ey
    L = math.hypot(dx, dy)
    Dz = d + 2 * ovz
    n = max(3, round(L / rowh))
    rl = L / n
    for sd in (-1, 1):
        u = Vector((-sd * dx / L, dy / L, 0)); nr = Vector((sd * dy / L, dx / L, 0))
        E = Vector((sd * ex, ey, 0))
        basis = Matrix(((u.x, nr.x, 0, 0), (u.y, nr.y, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)))
        b.box(tuple(E + u * L / 2 + nr * 0.05), (L, 0.1, Dz), roof, basis, j=0)          # solid underlay
        for k in range(n):
            c = E + u * ((k + 0.5) * rl) + nr * (0.1 + thick / 2 - 0.015)
            a = -Dz / 2 - ((seg / 2) if (k % 2) else 0.0)
            while a < Dz / 2 - 0.1:
                z0 = max(a + 0.03, -Dz / 2); z1 = min(a + seg - 0.03, Dz / 2)
                if z1 - z0 > 0.25:
                    b.box((c.x, c.y, (z0 + z1) / 2), (rl * 1.42, thick, z1 - z0), roof, basis @ Rz(math.radians(-9)), j=0.02)
                a += seg
        b.box(tuple(E + u * 0.02 + nr * 0.17), (0.2, 0.2, Dz + 0.08), GD, basis, j=0)         # gold eave trim
        for zz in (-Dz / 2, Dz / 2):                                                           # gold barge boards
            b.box(tuple(E + u * L / 2 + nr * 0.2 + Vector((0, 0, zz))), (L, 0.15, 0.14), GD, basis, j=0)
    if ridge: b.rbox((0, y0 + rise + 0.07, 0), (0.46, 0.36, Dz + 0.06), GD, r=0.08, j=0)
    if fin:
        for z in (-Dz / 2 + 0.05, Dz / 2 - 0.05): finial(b, 0, y0 + rise + 0.2, z, 1.0)


def spire(b, x, z, y0, rb, h, segs, courses, mat=RB, over=0.14, fin=True, fs=1.0):
    """stacked overlapping shingle courses forming a cone/pyramid; rb = base apothem"""
    ch = h / courses
    for i in range(courses):
        t0, t1 = i / courses, (i + 1) / courses
        r0 = rb * (1 - t0) + over
        r1 = 0 if i == courses - 1 else rb * (1 - t1) + over * 0.3
        b.cyl((x, y0 + ch * (i + 0.5), z), r0, r1, ch * 1.02, segs, mat)
    if fin: finial(b, x, y0 + h - 0.15, z, fs)


def stone_walls(b, W, D, y0, y1, plinth=True, quoins=True, bricks=True):
    if plinth:
        b.bx(-W / 2 - 0.16, W / 2 + 0.16, 0, 0.5, -D / 2 - 0.16, D / 2 + 0.16, SD, r=0.1)
        b.bx(-W / 2 - 0.08, W / 2 + 0.08, 0.5, 0.64, -D / 2 - 0.08, D / 2 + 0.08, S, r=0.05)
        if bricks:     # hand-laid blocks on the plinth: each one a hair off
            for sx, wl in ((1, D), (-1, D)):
                n = max(2, int(wl / 1.2)); bl = (wl - 0.2) / n
                for i in range(n):
                    b.box((sx * (W / 2 + 0.17), 0.26, -wl / 2 + 0.1 + bl * (i + 0.5)), (0.08, 0.36, bl - 0.07), SD, j=0.012)
            n = max(2, int(W / 1.2)); bl = (W - 0.2) / n
            for i in range(n):
                b.box((-W / 2 + 0.1 + bl * (i + 0.5), 0.26, D / 2 + 0.17), (bl - 0.07, 0.36, 0.08), SD, j=0.012)
    b.bx(-W / 2, W / 2, y0, y1, -D / 2, D / 2, S, r=0.1)
    if quoins:         # chunky alternating corner blocks on the front corners
        n = max(2, round((y1 - 0.64) / 0.85)); rh = (y1 - 0.64) / n
        for sx in (-1, 1):
            for j in range(n):
                a, c = (0.78, 0.45) if j % 2 == 0 else (0.45, 0.78)
                yc = 0.64 + rh * (j + 0.5)
                b.box((sx * (W / 2 - a / 2 + 0.04), yc, D / 2 + 0.04), (a + 0.08, rh - 0.05, 0.14), S, j=0.012)
                b.box((sx * (W / 2 + 0.04), yc, D / 2 - c / 2 + 0.04), (0.14, rh - 0.05, c + 0.08), S, j=0.012)


def win(b, x, y, w=0.9, h=1.2, shutters=AB, fbox=True, round_top=False, flowers=(FR, FP), sill=True):
    """window on the z=0 plane facing +z: frame, glowing glass, mullions, shutters, sill, flower box"""
    b.push(T((x, y, 0)))
    b.box((0, 0, 0.04), (w + 0.26, h + 0.26, 0.1), W, j=0.008)
    b.box((0, 0, 0.1), (w, h, 0.06), GL)
    b.box((0, 0, 0.14), (0.07, h, 0.05), W, j=0)
    b.box((0, 0, 0.145), (w, 0.07, 0.05), W, j=0)
    if sill: b.box((0, -h / 2 - 0.15, 0.12), (w + 0.42, 0.12, 0.3), SD, j=0.008)
    if shutters:
        for sx in (-1, 1):
            b.box((sx * (w / 2 + 0.13 + w * 0.22), 0, 0.07), (w * 0.44, h + 0.2, 0.07), shutters, j=0.012)
    if fbox:
        b.box((0, -h / 2 - 0.4, 0.2), (w + 0.2, 0.28, 0.3), W, j=0.01)
        b.box((0, -h / 2 - 0.22, 0.2), (w + 0.1, 0.12, 0.26), L, j=0)
        n = max(3, int((w + 0.2) / 0.22))
        for i in range(n):
            xx = -(w + 0.2) / 2 + 0.14 + i * (w + 0.2 - 0.28) / (n - 1)
            b.cyl((xx, -h / 2 - 0.12, 0.2 + (0.05 if i % 2 else -0.04)), 0.1, 0, 0.22, 5, flowers[i % len(flowers)], caps=False)
    b.pop()


def door(b, x, w=1.15, h=2.05, steps=True, mat=W):
    """arched wooden door standing proud of the plinth, with stone steps"""
    b.push(T((x, 0, 0)))
    hr = h - w / 2
    R = w / 2 + 0.2
    b.box((0, hr / 2, 0.1), (w + 0.4, hr, 0.2), SD, j=0)
    b.arch(0, hr, R, 0.0, 0.2, SD, 8)
    b.box((0, hr / 2, 0.16), (w, hr, 0.12), mat, j=0)
    b.arch(0, hr, w / 2, 0.1, 0.22, mat, 8)
    for sx in (-w / 6, w / 6): b.box((sx, hr / 2 + 0.2, 0.225), (0.05, hr - 0.2, 0.03), TM, j=0)
    b.box((0, hr + 0.15, 0.225), (0.05, 0.4, 0.03), TM, j=0)
    b.box((w / 4, 1.0, 0.25), (0.12, 0.12, 0.06), GD, j=0)
    if steps:
        b.bx(-w / 2 - 0.5, w / 2 + 0.5, 0, 0.34, 0.2, 0.85, S, r=0.07)
        b.bx(-w / 2 - 0.8, w / 2 + 0.8, 0, 0.17, 0.85, 1.4, S, r=0.06)
    b.pop()


def chimney(b, x, z, y, h=1.9, s=0.8):
    b.bx(x - s / 2, x + s / 2, y, y + h, z - s / 2, z + s / 2, S, r=0.07)
    for yy in (y + h * 0.4, y + h * 0.75): b.box((x, yy, z), (s + 0.06, 0.08, s + 0.06), SD, j=0.01)
    b.bx(x - s / 2 - 0.1, x + s / 2 + 0.1, y + h, y + h + 0.2, z - s / 2 - 0.1, z + s / 2 + 0.1, SD, r=0.05)
    b.bx(x - s / 2 + 0.1, x + s / 2 - 0.1, y + h + 0.2, y + h + 0.25, z - s / 2 + 0.1, z + s / 2 - 0.1, IR, r=0.02)


def gable_front(b, w, y0, rise, z, ov_window=True):
    """timber frame + round attic window on the gable triangle at plane z"""
    half = w / 2
    zz = z + 0.04
    b.box((0, y0 + 0.1, zz), (w - 0.1, 0.2, 0.1), TM, j=0)
    b.box((0, y0 + rise * 0.45, zz), (0.16, rise * 0.9, 0.1), TM, j=0)
    for sd in (-1, 1):
        b.beam((sd * 0.1, y0 + rise * 0.5), (sd * half * 0.78, y0 + 0.2), 0.14, 0.1, zz, TM)
    if ov_window and rise > 1.8:
        b.cyl((0, y0 + rise * 0.42, z + 0.05), 0.42, 0.42, 0.1, 8, W, axis='z')
        b.cyl((0, y0 + rise * 0.42, z + 0.1), 0.3, 0.3, 0.08, 8, GL, axis='z')
        b.box((0, y0 + rise * 0.42, z + 0.15), (0.06, 0.6, 0.05), W, j=0); b.box((0, y0 + rise * 0.42, z + 0.15), (0.6, 0.06, 0.05), W, j=0)


def gable_house(b, cx, cz, w, d, h1, h2, rise, yaw=0.0, roof=RB, doorx=None, win1=(), win2=(), side1=(), side2=(),
                shut=AB, fbox=True, chim=None, jet=0.22, doorw=1.1, flowers=(FR, FP), win_h=1.2, win_w=0.9,
                door_steps=True, attic=True, ov=0.5, fin=True, sides=(-1, 1), bricks=True, quoins=True, seg=1.7, rowh=0.72):
    """one gabled block, gable end faces +z (local), ridge along z. Positions are for the first (ground) floor
    windows in win1 (x), upper floor win2, side windows side1/side2 (z positions)."""
    b.push(T((cx, 0, cz)) @ Ry(yaw))
    stone_walls(b, w, d, 0.64, h1, quoins=quoins, bricks=bricks)
    ye = h1
    W2, D2 = w, d
    if h2:
        W2, D2 = w + 2 * jet, d + 2 * jet
        b.bx(-W2 / 2 - 0.04, W2 / 2 + 0.04, h1 - 0.02, h1 + 0.3, -D2 / 2 - 0.04, D2 / 2 + 0.04, TM, r=0.06)
        b.bx(-W2 / 2, W2 / 2, h1 + 0.3, h1 + h2, -D2 / 2, D2 / 2, S, r=0.1)
        for sx in (-1, 1):
            for sz in (-1, 1):
                b.box((sx * (w / 2 - 0.12), h1 - 0.26, sz * (d / 2 + jet / 2)), (0.3, 0.48, 0.3), TM, j=0.006)
        for sx in (-1, 1):   # timber corner posts of the upper floor
            b.box((sx * (W2 / 2 - 0.03), h1 + 0.3 + h2 / 2 - 0.15, D2 / 2 - 0.03), (0.2, h2 - 0.3, 0.2), TM, j=0)
        ye = h1 + h2
    zf = D2 / 2
    b.bx(-W2 / 2 - 0.12, W2 / 2 + 0.12, ye - 0.02, ye + 0.16, -D2 / 2 - 0.12, D2 / 2 + 0.12, SD, r=0.05)   # eave course
    b.prism([(-W2 / 2, ye), (W2 / 2, ye), (0, ye + rise)], -D2 / 2, D2 / 2, S)
    gable_front(b, W2, ye, rise, zf, attic)
    gable_roof(b, W2, D2, ye + 0.14, rise - 0.1, roof, ov=ov, ovz=0.5, fin=fin, seg=seg, rowh=rowh)
    if doorx is not None:
        b.push(T((0, 0, D / 2 if False else d / 2)))
        door(b, doorx, doorw, steps=door_steps)
        b.pop()
    for x in win1:
        b.push(T((0, 0, d / 2))); win(b, x, 1.85 if h1 > 3 else 1.7, win_w, win_h, shutters=shut, fbox=fbox, flowers=flowers); b.pop()
    for x in win2:
        b.push(T((0, 0, zf))); win(b, x, h1 + h2 * 0.55 + 0.1, win_w, win_h, shutters=shut, fbox=fbox, flowers=flowers); b.pop()
    for sx in sides:
        for zc in side1:
            b.push(T((sx * W2 / 2 if False else sx * w / 2, 0, 0)) @ Ry(sx * math.pi / 2)); win(b, -sx * zc, 1.7, 0.8, 1.1, shutters=shut, fbox=fbox, flowers=flowers); b.pop()
        for zc in side2:
            b.push(T((sx * W2 / 2, 0, 0)) @ Ry(sx * math.pi / 2)); win(b, -sx * zc, h1 + h2 * 0.55 + 0.1, 0.8, 1.1, shutters=shut, fbox=fbox, flowers=flowers); b.pop()
    if chim: chimney(b, chim[0], chim[1], ye + rise * (1 - abs(chim[0]) / (W2 / 2)) - 0.7, h=2.0, s=0.8)
    b.pop()


FL4 = (FR, FP, GD, CW)


def build_houses():
    P = {}
    # ---- L-shaped two-storey house: gable wing facing front + a ridge-along-x wing behind/right
    b = B('house_corner_L'); house_grads(b)
    gable_house(b, -3.7, 0.0, 5.6, 7.5, 2.7, 2.4, 3.2, doorx=0.0, win1=(-1.5, 1.5), win2=(-1.3, 1.3), side1=(0.0,), side2=(),
                chim=(1.0, -2.0), win_h=1.15)
    gable_house(b, 2.05, -1.0, 5.0, 8.9, 2.7, 2.2, 2.5, yaw=math.pi / 2, roof=BR, shut=AG, win1=(), win2=(), side1=(-1.2,), side2=(-0.8, 1.6), sides=(-1,),
                door_steps=False, flowers=(FP, GD, CW), fin=False, attic=False, ov=0.45, bricks=False, quoins=False, seg=2.3, rowh=0.8)
    b.push(T((0, 0, 1.5)))                         # door + steps on the front wall of the right wing
    door(b, 4.2, 1.1, steps=True, mat=W)
    b.pop()
    P['house_corner_L'] = b.finish()

    # ---- three narrow joined townhouses
    b = B('house_row_3'); house_grads(b)
    specs = [(-3.5, 2.6, 2.2, 2.6, RB, AB, FL4), (0.0, 2.6, 2.9, 3.1, BR, AG, (FP, GD, CW)), (3.5, 2.6, 1.7, 2.4, AG, AB, (FR, CW, GD))]
    for i, (cx, h1, h2, rise, roof, sh, fl) in enumerate(specs):
        left = i % 2 == 0
        gable_house(b, cx, 0, 3.4, 5.4, h1, h2, rise, roof=roof, doorx=-0.75 if left else 0.75, doorw=0.95, win1=(0.8,) if left else (-0.8,),
                    win2=(0.0,) if h2 > 2 else (0.0,), side1=(), side2=(), shut=sh, flowers=fl, jet=0.08, win_w=0.8, win_h=1.1,
                    chim=(0.6, -1.0) if i != 1 else None, ov=0.12, fin=(i == 1), attic=(i == 1), bricks=False, quoins=(i != 1), seg=2.3, rowh=0.8)
    P['house_row_3'] = b.finish()

    # ---- bakery: arched shop window, striped awning, sign bracket, tall chimney
    b = B('house_bakery'); house_grads(b)
    gable_house(b, 0, 0, 6.2, 6.0, 3.0, 2.2, 3.0, doorx=-2.0, win1=(), win2=(-1.9, 0.0, 1.9), side1=(0.3,), side2=(0.3,),
                chim=(1.8, -1.6), flowers=(FR, FP, GD), win_h=1.15)
    b.push(T((1.35, 0, 3.0)))
    hw, hh = 2.5, 2.1
    b.box((0, hh / 2 + 0.2, 0.08), (hw + 0.5, hh + 0.4, 0.16), W, j=0)
    b.box((0, hh / 2 + 0.5, 0.15), (hw, hh - 0.2, 0.1), GL)
    for xx in (-hw / 4, hw / 4): b.box((xx, hh / 2 + 0.5, 0.2), (0.07, hh - 0.2, 0.06), W, j=0)
    b.box((0, hh / 2 + 0.55, 0.2), (hw, 0.07, 0.06), W, j=0)
    b.box((0, 1.0, 0.32), (hw + 0.6, 0.14, 0.7), SD, j=0.008)           # counter sill
    for i, (x, c) in enumerate([(-0.9, GD), (-0.3, W), (0.3, GD), (0.9, W)]):     # loaves on the sill
        b.ball((x, 1.2, 0.34), 1.0, c, sq=(0.24, 0.12, 0.13), seg=7, rings=4)
    nst = 7                                                          # striped awning
    for i in range(nst):
        xx = -(hw + 0.5) / 2 + (i + 0.5) * (hw + 0.5) / nst
        m = AR if i % 2 == 0 else CW
        b.box((xx, 2.82, 0.62), ((hw + 0.5) / nst - 0.01, 0.07, 1.25), m, Rx(0.36), j=0.004)
        b.box((xx, 2.5, 1.2), ((hw + 0.5) / nst - 0.01, 0.2, 0.07), m, j=0.004)
    b.pop()
    b.push(T((3.1, 0, 3.0)))                                         # sign bracket on the front corner
    b.box((0.55, 4.05, 0.2), (1.1, 0.08, 0.08), IR, j=0)
    b.strut((0.0, 3.5, 0.2), (0.6, 4.05, 0.2), 0.07, 0.07, IR, r=0.02, j=0)
    b.rbox((0.7, 3.55, 0.2), (0.85, 0.7, 0.1), W, r=0.05, j=0)
    b.rbox((0.7, 3.55, 0.27), (0.65, 0.5, 0.04), GD, r=0.03, j=0)
    b.ball((0.7, 3.55, 0.31), 1.0, W, sq=(0.2, 0.1, 0.05), seg=7, rings=4)
    b.cyl((0.25, 3.92, 0.2), 0.02, 0.02, 0.2, 4, IR); b.cyl((1.15, 3.92, 0.2), 0.02, 0.02, 0.2, 4, IR)
    b.pop()
    for x, z in ((-3.8, 3.9), (-3.3, 4.3)):                           # flour sacks / barrels
        b.cyl((x, 0.4, z), 0.34, 0.3, 0.8, 8, W, smooth=False); b.cyl((x, 0.82, z), 0.34, 0.34, 0.06, 8, TM)
    P['house_bakery'] = b.finish()

    # ---- flower-box cottage: every window boxed, hanging baskets, vines, trellis, pots
    b = B('house_flowerbox'); house_grads(b)
    gable_house(b, 0, 0, 5.4, 5.4, 2.7, 2.1, 2.8, doorx=0.0, win1=(-1.7, 1.7), win2=(-1.5, 0.0, 1.5), side1=(0.0,), side2=(0.0,),
                chim=(1.6, -1.2), flowers=FL4, shut=FP if False else AG, win_h=1.15, door_steps=True)
    zf = 2.7
    b.grads[L] = g_canopy(0.5, 5.0, (0.45, 0.62, 0.5), (1, 1, 0.85)); b.grads[LL] = g_canopy(0.5, 5.0, (0.5, 0.7, 0.55), (1, 1, 0.9))
    for sx in (-1, 1):                                                # climbing vines up both front corners
        for k, y in enumerate((0.9, 1.7, 2.5, 3.3, 4.1)):
            xx = sx * (2.55 - 0.05 * (k % 2)); zz = zf + 0.16 + 0.02 * (k % 2)
            b.blob((xx, y, zz), 0.34, LL if k % 2 else L, sq=(1.0, 1.1, 0.5), seg=7, rings=4, amp=0.15, seed=sx + k)
            b.ball((xx + 0.12 * sx, y + 0.12, zz + 0.12), 0.1, FL4[(k + (sx > 0)) % 4], seg=5, rings=3)
    b.push(T((0, 0, zf)))                                             # trellis arch over the door
    for sx in (-1, 1): b.box((sx * 0.75, 1.2, 0.5), (0.07, 2.4, 0.07), W, j=0)
    pts = [(0.75 * math.cos(math.pi * (1 - k / 6)), 2.3 + 0.55 * math.sin(math.pi * (1 - k / 6)), 0.5) for k in range(7)]
    b.tube(pts, [0.04] * 7, W, segs=5, cap=True, smooth=False)
    for k, p in enumerate(pts[::1]): b.ball(p, 0.11, [FP, FR, GD][k % 3], seg=5, rings=3)
    for sx in (-1, 1):                                                # hanging baskets
        b.cyl((sx * 1.35, 2.75, 0.45), 0.2, 0.12, 0.2, 7, W, smooth=False)
        b.ball((sx * 1.35, 2.92, 0.45), 0.2, LL, sq=(1, 0.7, 1), seg=7, rings=4)
        b.ball((sx * 1.3, 3.0, 0.5), 0.09, FR if sx > 0 else FP, seg=5, rings=3); b.ball((sx * 1.42, 2.98, 0.4), 0.09, GD, seg=5, rings=3)
        b.box((sx * 1.35, 3.4, 0.45), (0.025, 0.7, 0.025), IR, j=0)
        b.box((sx * 1.35, 3.74, 0.35), (0.05, 0.05, 0.22), IR, j=0)
    for sx in (-1, 1):                                                # flower pots next to the steps
        b.cyl((sx * 1.7, 0.2, 1.25), 0.28, 0.2, 0.4, 8, TM if False else W)
        b.ball((sx * 1.7, 0.5, 1.25), 0.26, L, sq=(1, 0.8, 1), seg=7, rings=4)
        for k in range(3): b.ball((sx * 1.7 + (k - 1) * 0.14, 0.7 + 0.04 * k, 1.25 + 0.05 * ((k + 1) % 2)), 0.1, FL4[(k + (sx > 0) * 2) % 4], seg=5, rings=3)
    b.pop()
    P['house_flowerbox'] = b.finish()
    return P


# ================================================================= TOWN PIECES
def build_town():
    P = {}

    # ---- round wall tower: cream stone drum, blue shingle cone, gold finial (matches castle_wall_segment)
    b = B('wall_tower_round'); house_grads(b)
    R = 2.3
    b.cyl((0, 0.35, 0), R + 0.3, R + 0.22, 0.7, 12, SD)
    for k in range(12):                                         # hand-laid plinth blocks
        a = 2 * math.pi * k / 12
        b.box((math.sin(a) * (R + 0.32), 0.35, math.cos(a) * (R + 0.32)), (0.95, 0.42, 0.16), SD, Ry(a), j=0.012)
    b.cyl((0, 3.75, 0), R, R - 0.14, 6.1, 12, S)
    for i, y in enumerate((1.5, 2.4, 3.3, 4.2, 5.1, 6.0)):
        b.cyl((0, y, 0), R - 0.14 * (y - 0.7) / 6.1 + 0.04, R - 0.14 * (y - 0.7) / 6.1 + 0.04, 0.07, 12, SD, rot=Ry(b.rng.uniform(0, 0.5)), caps=False)
    for ang, y in ((0.0, 4.4), (math.pi / 2, 3.0), (math.pi, 4.4), (-math.pi / 2, 3.0), (math.pi / 4, 2.2), (-math.pi / 4, 5.2), (3 * math.pi / 4, 5.2), (-3 * math.pi / 4, 2.2)):
        b.push(Ry(ang) @ T((0, 0, R - 0.1)))
        if ang == 0.0: win(b, 0, y, 0.7, 1.0, shutters=AB, fbox=True)
        else:
            b.box((0, y, 0.04), (0.42, 1.05, 0.1), SD, j=0.008); b.box((0, y, 0.09), (0.16, 0.8, 0.06), IR, j=0)
        b.pop()
    b.push(T((0, 0, R + 0.1))); door(b, 0, 1.15, 2.05); b.pop()
    b.cyl((0, 6.95, 0), R + 0.5, R + 0.35, 0.5, 12, SD)
    for k in range(12):                                         # corbel blocks under the parapet
        a = 2 * math.pi * k / 12 + math.pi / 12
        b.box((math.sin(a) * (R + 0.08), 6.55, math.cos(a) * (R + 0.08)), (0.4, 0.45, 0.3), SD, Ry(a), j=0.01)
    b.cyl((0, 7.28, 0), R + 0.62, R + 0.62, 0.14, 12, GD)
    spire(b, 0, 0, 7.35, R + 0.55, 4.6, 12, 7, over=0.16, fs=1.3)
    b.cyl((0, 7.28, 0), R + 0.62, R + 0.62, 0.14, 12, GD)
    b.box((0.55, 12.0, 0), (1.05, 0.06, 0.06), GD, j=0)
    b.prism([(0.05, 12.4), (1.1, 12.2), (0.05, 11.95)], -0.03, 0.03, AB)
    P['wall_tower_round'] = b.finish()

    # ---- adventure portal: big stone ring with glowing runes, glow disc, steps
    b = B('adventure_portal'); house_grads(b)
    CY, RI, RO = 3.15, 2.45, 3.5
    b.bx(-4.6, 4.6, 0, 0.6, -1.4, 1.4, SD, r=0.14)
    nblk = 16
    for k in range(nblk):
        th = 2 * math.pi * k / nblk
        rm = (RI + RO) / 2
        arcl = 2 * math.pi * rm / nblk
        m = GD if (k == nblk // 4) else (SD if k % 4 == 2 else S)
        b.rbox((rm * math.cos(th), CY + rm * math.sin(th), 0.0), (RO - RI + (0.3 if m == GD else 0.0), arcl - 0.07, 1.25 + (0.15 if m == GD else 0.0)), m, r=0.1, rot=Rz(th), j=0.012)
        if k % 2 == 1 and m != GD:                               # glowing rune on the front face
            b.push(T((rm * math.cos(th), CY + rm * math.sin(th), 0.64)) @ Rz(th - math.pi / 2))
            rr = b.rng.randint(0, 3)
            b.box((0, 0, 0.0), (0.09, 0.5, 0.05), RG, j=0)
            if rr == 0: b.box((0.14, 0.12, 0), (0.28, 0.08, 0.05), RG, j=0)
            elif rr == 1: b.box((0, 0.0, 0), (0.4, 0.08, 0.05), RG, Rz(0.7), j=0)
            elif rr == 2: b.box((-0.12, -0.12, 0), (0.24, 0.08, 0.05), RG, j=0); b.box((0.12, 0.14, 0), (0.24, 0.08, 0.05), RG, j=0)
            else: b.box((0.0, 0.0, 0), (0.36, 0.08, 0.05), RG, Rz(-0.7), j=0)
            b.pop()
    b.ball((0, CY + RO + 0.35, 0), 0.34, GD, seg=8, rings=6)
    for sx in (-1, 1):
        b.rbox((sx * 3.9, 1.0, 0.0), (0.9, 0.8, 1.0), SD, r=0.1)
        b.ball((sx * 3.9, 1.65, 0.0), 0.34, RG, seg=8, rings=6)
    b.cyl((0, CY, 0.0), RI + 0.04, RI + 0.04, 0.12, 20, RG, axis='z')                # glow disc
    b.cyl((0, CY, 0.08), RI * 0.6, RI * 0.6, 0.12, 14, CW, axis='z')
    b.cyl((0, CY, 0.14), RI * 0.32, RI * 0.32, 0.1, 10, RG, axis='z')
    for i, (hy, zz) in enumerate(((0.45, 1.4), (0.3, 2.2), (0.15, 3.0))):             # three wide steps
        b.bx(-3.8 + i * 0.5, 3.8 - i * 0.5, 0.0, hy + 0.12, zz - 0.4, zz + 0.4, S if i % 2 == 0 else SD, r=0.08)
    P['adventure_portal'] = b.finish()

    P.update(build_ship())
    P.update(build_bridges())

    # ---- stairs_stone: 3 m wide flight, descending toward +z
    b = B('stairs_stone'); house_grads(b)
    n, rise, run = 8, 0.3, 0.46
    for i in range(n):
        z = -n * run / 2 + (i + 0.5) * run
        h = (n - i) * rise
        b.rbox((0, h / 2, z), (3.0, h, run + 0.02), S if i % 2 == 0 else SD, r=0.07, j=0.01)
        for sx in (-1, 1): b.box((sx * 1.75, h / 2 + 0.2, z), (0.5, h + 0.4, run + 0.02), SD, j=0.01)
    for sx in (-1, 1):
        b.ball((sx * 1.75, 0.5, n * run / 2 + 0.05), 0.34, S, seg=8, rings=6)
        b.cyl((sx * 1.75, 0.2, n * run / 2 + 0.05), 0.3, 0.3, 0.4, 8, SD)
        b.ball((sx * 1.75, n * rise + 0.55, -n * run / 2 + 0.2), 0.3, GD, seg=7, rings=5)
        b.box((sx * 1.75, n * rise + 0.25, -n * run / 2 + 0.2), (0.5, 0.2, 0.5), SD, j=0.01)
    P['stairs_stone'] = b.finish()

    # ---- statue_hero: knight on a plinth, sword raised, shield, blue cape
    b = B('statue_hero'); house_grads(b)
    b.rbox((0, 0.2, 0), (2.5, 0.4, 2.5), SD, r=0.1)
    b.rbox((0, 0.85, 0), (1.9, 0.9, 1.9), S, r=0.1)
    b.rbox((0, 0.85, 0.97), (0.9, 0.5, 0.06), GD, r=0.04, j=0)
    b.rbox((0, 1.43, 0), (2.2, 0.26, 2.2), SD, r=0.08)
    y0 = 1.56
    st = SD
    b.grads[SD] = g_lin(0, 5.5, (0.78, 0.74, 0.7), (1, 1, 1))
    for sx in (-1, 1):
        b.ball((sx * 0.3, y0 + 0.2, 0.1), 0.3, st, sq=(1, 0.65, 1.4), seg=8, rings=5)
        b.limb((sx * 0.27, y0 + 0.3, 0), (sx * 0.25, y0 + 1.25, 0), 0.25, 0.2, st, segs=8, smooth=True)
    b.cyl((0, y0 + 1.45, 0), 0.62, 0.5, 0.55, 8, S, smooth=False)
    b.cyl((0, y0 + 1.72, 0), 0.55, 0.55, 0.12, 8, GD)
    b.ball((0, y0 + 2.15, 0), 0.62, st, sq=(1.0, 0.95, 0.72), seg=10, rings=7)
    b.ball((0, y0 + 2.25, 0.3), 0.3, GD, sq=(0.5, 0.5, 0.2), seg=6, rings=4)
    b.ball((0, y0 + 3.0, 0.02), 0.5, st, seg=10, rings=7)
    b.box((0, y0 + 3.02, 0.46), (0.52, 0.08, 0.1), IR, j=0)
    b.ball((0, y0 + 3.52, -0.15), 1.0, GD, sq=(0.1, 0.34, 0.45), seg=6, rings=4, rot=Rx(0.35))
    b.cyl((0, y0 + 2.75, 0), 0.56, 0.56, 0.1, 8, GD)
    for sx in (-1, 1): b.ball((sx * 0.8, y0 + 2.6, 0), 0.32, st, seg=8, rings=6)
    b.limb((0.8, y0 + 2.6, 0), (1.15, y0 + 3.45, 0.1), 0.2, 0.17, st, segs=8, smooth=True)       # raised sword arm
    b.ball((1.15, y0 + 3.5, 0.1), 0.2, st, seg=7, rings=5)
    b.rbox((1.15, y0 + 3.7, 0.1), (0.14, 1.5, 0.05), S, r=0.02, j=0)                              # blade
    b.rbox((1.15, y0 + 3.62, 0.1), (0.6, 0.12, 0.12), GD, r=0.04, j=0)
    b.ball((1.15, y0 + 3.48, 0.1), 0.1, GD, seg=6, rings=4)
    b.cyl((1.15, y0 + 4.5, 0.1), 0.07, 0, 0.3, 4, S)
    b.limb((-0.8, y0 + 2.6, 0), (-0.85, y0 + 1.95, 0.35), 0.19, 0.17, st, segs=8, smooth=True)    # shield arm
    b.push(T((-0.98, y0 + 1.95, 0.52)) @ Ry(0.35))
    b.prism([(-0.5, 0.6), (0.5, 0.6), (0.5, -0.1), (0.0, -0.75), (-0.5, -0.1)], 0.0, 0.14, GD)
    b.prism([(-0.4, 0.5), (0.4, 0.5), (0.4, -0.06), (0.0, -0.6), (-0.4, -0.06)], 0.14, 0.2, AB)
    b.prism([(0.0, 0.3), (0.12, 0.0), (0.0, -0.3), (-0.12, 0.0)], 0.2, 0.25, GD)
    b.pop()
    def cape(u, v): return V((lerp(-0.72, 0.72, u) * (1 + 0.08 * v), y0 + 2.7 - 2.1 * v, -0.42 - 0.2 * v - 0.05 * math.sin(u * 9 + v * 2)))
    b.cloth(cape, 5, 5, AB, th=0.08)
    P['statue_hero'] = b.finish()

    # ---- hedge_arch: two bushy pillars and a clipped arch on stone footings
    b = B('hedge_arch'); house_grads(b)
    for m in (L, LL): b.grads[m] = g_canopy(0.3, 4.6, (0.42, 0.62, 0.55), (0.95, 1.0, 0.8))
    for sx in (-1, 1):
        b.rbox((sx * 1.85, 0.2, 0), (1.6, 0.4, 1.4), SD, r=0.1)
        for k, (y, r) in enumerate(((0.95, 0.88), (1.8, 0.82), (2.6, 0.78))):
            b.blob((sx * 1.85, y, 0), r, L if k % 2 == 0 else LL, sq=(1.0, 0.95, 0.95), seg=8, rings=5, amp=0.12, seed=sx * 3 + k)
    for k in range(7):
        th = math.pi * k / 6
        b.blob((1.85 * math.cos(th), 3.05 + 1.15 * math.sin(th), 0), 0.72, L if k % 2 == 0 else LL, seg=8, rings=5, amp=0.12, seed=9 + k)
    for k, (x, y) in enumerate(((-2.3, 1.2), (2.35, 2.0), (-1.7, 3.6), (1.9, 3.7), (0.0, 4.35), (2.3, 1.0))):
        b.ball((x, y, 0.55 if abs(x) > 1 else 0.6), 0.14, [FP, FR, GD, CW][k % 4], seg=5, rings=3)
    P['hedge_arch'] = b.finish()
    return P


# ================================================================= SHIP + BRIDGES
def build_ship():
    P = {}
    b = B('ship_big'); house_grads(b)
    Z0, Z1 = -6.5, 5.6
    def hw(t): return max(0.05, 1.95 + 0.2 * (t / 0.3) if t < 0.3 else 2.15 * (1 - ((t - 0.3) / 0.7) ** 2) ** 0.6)
    def yt(t): return 1.0 + 0.5 * (1 - t) ** 3 + 0.8 * t ** 3
    def yb(t): return -0.85 + 0.9 * t ** 3.5 + 0.35 * (1 - t) ** 3
    zs = lambda t: lerp(Z0, Z1, t)
    N = 14
    prof = [(1.0, 1.0), (0.97, 0.72), (0.86, 0.45), (0.6, 0.18), (0.0, 0.0)]
    rings = []
    for i in range(N + 1):
        t = i / N; h = hw(t); y0, y1 = yb(t), yt(t); z = zs(t)
        half = [V((h * fx, y0 + (y1 - y0) * fy, z)) for fx, fy in prof]
        pts = half + [V((-p.x, p.y, p.z)) for p in half[:-1][::-1]]
        rings.append([b.bm.verts.new(p) for p in pts])
    bandmat = [AB, W, W, TM, TM, W, W, AB]
    for i in range(N):
        for j in range(8):
            f = b.bm.faces.new((rings[i][j], rings[i][j + 1], rings[i + 1][j + 1], rings[i + 1][j]))
            f.material_index = MI[bandmat[j]]; f.smooth = True
    f = b.bm.faces.new(rings[0][::-1]); f.material_index = MI[W]
    deck = [rings[i][0] for i in range(N + 1)] + [rings[i][8] for i in range(N, -1, -1)]
    f = b.bm.faces.new(deck); f.material_index = MI[W]
    b.grads[W] = g_lin(-0.8, 2.5, (0.72, 0.68, 0.64), (1, 1, 1))
    b.grads[AB] = g_lin(0, 12, (0.8, 0.85, 0.9), (1, 1, 1))
    for sd in (-1, 1):   # gold gunwale trim
        b.tube([V((sd * hw(i / N) * 1.0, yt(i / N) + 0.04, zs(i / N))) for i in range(N + 1)], [0.07] * (N + 1), GD, segs=4, cap=False, smooth=False)
    dy = lambda z: yt((z - Z0) / (Z1 - Z0))
    # stern cabin
    cz = Z0 + 1.7
    y0 = dy(cz) - 0.1
    b.rbox((0, y0 + 0.85, cz), (3.4, 1.7, 3.1), W, r=0.1)
    b.rbox((0, y0 + 1.8, cz), (3.8, 0.22, 3.5), AB, r=0.08)
    b.rbox((0, y0 + 1.7, cz), (3.9, 0.12, 3.6), GD, r=0.05)
    for x in (-0.95, 0, 0.95):
        b.box((x, y0 + 1.0, cz - 1.58), (0.6, 0.6, 0.08), GL); b.box((x, y0 + 1.0, cz - 1.62), (0.7, 0.7, 0.06), TM)
    for sd in (-1, 1):
        for zz in (-0.6, 0.6): b.box((sd * 1.72, y0 + 1.0, cz + zz), (0.08, 0.55, 0.55), GL)
    b.rbox((0, y0 + 0.65, cz + 1.57), (0.8, 1.2, 0.1), TM, r=0.04)
    b.box((0, y0 + 2.2, cz - 1.5), (0.5, 0.45, 0.5), GD, j=0)
    b.ball((0, y0 + 2.2, cz - 1.5), 0.22, GL, seg=6, rings=4)
    # rails midships
    for sd in (-1, 1):
        ps = []
        for t in (0.34, 0.46, 0.58, 0.70, 0.80):
            ps.append(V((sd * hw(t) * 0.96, yt(t) + 0.55, zs(t))))
            b.box((sd * hw(t) * 0.96, yt(t) + 0.28, zs(t)), (0.13, 0.56, 0.13), W, j=0)
        for p, q in zip(ps[:-1], ps[1:]): b.strut(tuple(p), tuple(q), 0.1, 0.1, W, r=0.03, j=0)
    # cannon ports
    for sd in (-1, 1):
        for t in (0.3, 0.42, 0.6):
            b.box((sd * hw(t) * 0.97, yt(t) - 0.55, zs(t)), (0.16, 0.36, 0.5), IR, j=0)
    # masts + crow's nest
    zm, zf = -0.8, 2.7
    b.limb((0, dy(zm) - 0.2, zm), (0, 11.2, zm), 0.2, 0.13, W, segs=8, smooth=True)
    b.limb((0, dy(zf) - 0.2, zf), (0, 8.9, zf), 0.17, 0.11, W, segs=8, smooth=True)
    b.cyl((0, 9.55, zm), 0.6, 0.5, 0.42, 8, W); b.cyl((0, 9.82, zm), 0.66, 0.66, 0.1, 8, GD)
    b.limb((0, dy(Z1) - 0.1, 4.6), (0, 3.1, 7.5), 0.16, 0.08, W, segs=6, smooth=True)
    b.ball((0, 3.15, 7.55), 0.2, GD, seg=7, rings=5)
    # sails: (mast z, y0, y1, width, rows)
    def sail(zc, ya, yb_, w, rows, bulge=0.95):
        def fn(u, v): return V((w * (u - 0.5), lerp(ya, yb_, v), zc + 0.3 + bulge * math.sin(math.pi * u) ** 0.8 * math.sin(math.pi * v) ** 0.7))
        b.cloth(fn, 6, len(rows), CW, th=0.07, matfn=lambda i, j: rows[j])
        for y in (ya, yb_): b.rbox((0, y, zc + 0.3), (w + 0.7, 0.16, 0.16), W, r=0.05, j=0)
    sail(zm, 4.5, 7.6, 6.0, [CW, CW, AB, AB, CW, CW])
    sail(zm, 8.0, 10.4, 4.4, [AB, AB, CW, CW, AB, AB])
    sail(zf, 4.4, 7.0, 4.4, [CW, CW, CW, AB, AB, AB], bulge=0.8)
    A_, B_, C_ = V((0, 8.6, zf + 0.15)), V((0, 3.2, 7.3)), V((0, 1.9, 4.2))
    def jib(u, v): return (A_ * (1 - u) + B_ * u) * (1 - v) + C_ * v + V((0.35 * math.sin(math.pi * u) * math.sin(math.pi * v), 0, 0))
    b.cloth(jib, 5, 4, CW, th=0.06, matfn=lambda i, j: AB if j == 3 else CW)
    # rigging
    for p, q in (((0, 11.0, zm), (0, 8.8, zf)), ((0, 8.8, zf), (0, 3.2, 7.4)), ((0, 10.9, zm), (0, 2.6, Z0 + 0.3))):
        b.strut(p, q, 0.05, 0.05, TM, r=0.015, j=0)
    for sd in (-1, 1):
        for zz, ztop in ((zm - 0.4, 6.8), (zm + 0.5, 6.8), (zf - 0.3, 5.5), (zf + 0.4, 5.5)):
            b.strut((0, ztop + 0.8, zm if ztop == 6.8 else zf), (sd * (hw((zz - Z0) / (Z1 - Z0)) * 0.95), 1.6, zz), 0.045, 0.045, TM, r=0.012, j=0)
    # pennants
    b.prism([(0.0, 11.55), (1.5, 11.35), (0.0, 11.1)], -0.03, 0.03, GD)
    b.prism([(0.0, 9.3), (1.2, 9.15), (0.0, 8.95)], zf - 0.03 + 0.0, zf + 0.03, FR) if False else None
    b.cyl((0, 11.28, zm), 0.1, 0.1, 0.12, 6, GD); b.ball((0, 11.38, zm), 0.14, GD, seg=6, rings=4)
    b.rbox((0, 0.2, Z0 - 0.18), (0.16, 1.7, 0.7), W, r=0.04)     # rudder
    P['ship_big'] = b.finish()
    return P


def build_bridges():
    P = {}
    b = B('bridge_stone_arch'); house_grads(b)
    A_, B_ = 2.5, 1.15
    def ytop(x): return 0.6 + 1.3 * (1 - (x / 5.0) ** 2)
    def slope(x): return math.atan(-2.6 * x / 25.0)
    nv = 13
    for k in range(nv):
        th = math.pi * (k + 0.5) / nv
        ra, rb = A_ + 0.28, B_ + 0.28
        cx, cy = ra * math.cos(th), rb * math.sin(th)
        nr = V((math.cos(th) / ra, math.sin(th) / rb)).normalized()
        arc = (math.pi / nv) * math.hypot(ra * math.sin(th), rb * math.cos(th))
        b.rbox((cx, cy, 0), (0.56, arc * 0.96, 3.5), S if k % 2 == 0 else SD, r=0.07, rot=Rz(math.atan2(nr.y, nr.x)), j=0.01)
    for i in range(20):
        x = -4.75 + i * 0.5
        out = (B_ + 0.56) * math.sqrt(max(0.0, 1 - (x / (A_ + 0.56)) ** 2)) if abs(x) < A_ + 0.56 else -0.3
        top = ytop(x) - 0.24
        if top - out > 0.05: b.box((x, (top + out) / 2, 0), (0.52, top - out, 3.1), S if i % 2 else SD, j=0.006)
        b.box((x, ytop(x) - 0.15, 0), (0.54, 0.3, 3.1), SD, Rz(slope(x)), j=0.006)
    for sz in (-1, 1):
        for i in range(14):
            x = -4.55 + i * 0.7
            b.box((x, ytop(x) + 0.31, sz * 1.42), (0.73, 0.64, 0.44), S, Rz(slope(x)), j=0.01)
        for sx in (-1, 1):
            b.rbox((sx * 5.05, 0.95, sz * 1.5), (0.8, 1.7, 0.8), S, r=0.1)
            b.ball((sx * 5.05, 1.95, sz * 1.5), 0.3, GD, seg=7, rings=5)
    P['bridge_stone_arch'] = b.finish()

    b = B('bridge_wood_small'); house_grads(b)
    def yw(x): return 0.45 + 0.35 * (1 - (x / 2.6) ** 2)
    def sw(x): return math.atan(-0.7 * x / 6.76)
    for i in range(15):
        x = -2.38 + i * 0.34
        b.box((x, yw(x) + 0.05, 0), (0.31, 0.1, 1.75), W, Rz(sw(x)), j=0.012)
    for sz in (-1, 1):
        pts = [V((x, yw(x) - 0.12, sz * 0.7)) for x in (-2.6, -1.7, -0.85, 0, 0.85, 1.7, 2.6)]
        for p, q in zip(pts[:-1], pts[1:]): b.strut(tuple(p), tuple(q), 0.2, 0.2, TM, r=0.04, j=0.006)
        ps = []
        for x in (-2.4, 0.0, 2.4):
            b.box((x, yw(x) + 0.6, sz * 0.85), (0.15, 1.0, 0.15), TM, j=0.008)
            b.ball((x, yw(x) + 1.14, sz * 0.85), 0.12, W, seg=6, rings=4)
            ps.append(V((x, yw(x) + 0.98, sz * 0.85)))
        for p, q in zip(ps[:-1], ps[1:]): b.strut(tuple(p), tuple(q), 0.09, 0.09, W, r=0.03, j=0)
    for sx in (-1, 1): b.rbox((sx * 2.8, 0.2, 0), (0.9, 0.5, 2.2), SD, r=0.1)
    P['bridge_wood_small'] = b.finish()
    return P


# ================================================================= PROPS
def fh(b, x, y, z, c, s=1.0):
    """flower head: a little cup"""
    b.cyl((x, y, z), 0.1 * s, 0, 0.2 * s, 5, c, caps=False)


def tuft(b, x, y, z, s=1.0, n=3):
    for k in range(n):
        a = k * 2.1 + x * 3
        b.limb((x, y, z), (x + math.cos(a) * 0.12 * s, y + 0.3 * s, z + math.sin(a) * 0.12 * s), 0.04 * s, 0.0, LL, segs=4)


def build_props():
    P = {}
    # ---- beach umbrella
    b = B('beach_umbrella'); house_grads(b)
    b.limb((0, 0.0, 0), (0.12, 2.65, 0), 0.07, 0.05, W, segs=6)
    def dome(off, flip):
        def fn(u, v):
            a = 2 * math.pi * u; r = 1.75 * v * (1 + 0.035 * math.cos(16 * a) * v)
            return V((r * math.cos(a) + 0.12, 2.55 + 0.55 * (1 - v * v) - off, r * math.sin(a)))
        b.surf(fn, 8, 3, AR, close_u=True, matfn=lambda i, j: AR if i % 2 == 0 else CW, smooth=False, flip=flip)
    dome(0.0, False); dome(0.07, True)
    b.ball((0.12, 3.17, 0), 0.1, GD, seg=6, rings=4)
    b.rbox((0, 0.1, 0), (0.5, 0.2, 0.5), SD, r=0.07)
    b.grads[AR] = g_lin(2.4, 3.2, (0.85, 0.8, 0.8), (1, 1, 1))
    P['beach_umbrella'] = b.finish()

    # ---- beach crates + rope coil
    b = B('beach_crates'); house_grads(b)
    def crate(x, y, z, s, yaw):
        b.push(T((x, y, z)) @ Ry(yaw))
        b.rbox((0, s / 2, 0), (s, s, s), W, r=0.06, j=0.01)
        for sx in (-1, 1):
            for sz in (-1, 1): b.box((sx * s / 2, s / 2, sz * s / 2), (0.1, s + 0.02, 0.1), TM, j=0)
        b.box((0, s / 2, s / 2 + 0.02), (s * 0.92, 0.09, 0.05), TM, Rz(0.0), j=0)
        b.box((0, s * 0.2, s / 2 + 0.02), (s * 0.92, 0.09, 0.05), TM, j=0)
        b.box((s / 2 + 0.02, s / 2, 0), (0.05, 0.09, s * 0.92), TM, j=0)
        b.pop()
    crate(-0.55, 0, 0, 1.0, 0.1); crate(0.6, 0, 0.1, 0.9, -0.2); crate(-0.35, 1.0, 0.05, 0.8, 0.45)
    b.lathe([(0.34, 0.0), (0.46, 0.04), (0.46, 0.14), (0.34, 0.18), (0.2, 0.14), (0.2, 0.04)], CW if False else W, segs=10, pos=(1.3, 0.0, 1.2), smooth=True, closed=True)
    b.ball((0.9, 1.0, 0.6), 1.0, AB, sq=(0.3, 0.12, 0.12), seg=7, rings=4, rot=Rz(0.3))
    P['beach_crates'] = b.finish()

    # ---- fishing net rack with floats
    b = B('fishing_net_rack'); house_grads(b)
    for sx in (-1, 1):
        for sz in (-1, 1): b.limb((sx * 1.9 + sx * 0.0, 0, sz * 0.55), (sx * 1.9, 2.45, 0), 0.1, 0.08, W, segs=6)
        b.ball((sx * 1.9, 2.5, 0), 0.13, GD, seg=6, rings=4)
    b.limb((-2.0, 2.35, 0), (2.0, 2.35, 0), 0.09, 0.09, W, axis='x') if False else b.strut((-2.0, 2.35, 0), (2.0, 2.35, 0), 0.16, 0.16, W, r=0.05)
    def net(u, v): return V((-1.75 + 3.5 * u, 2.3 - 1.6 * v * (0.85 + 0.15 * math.sin(u * 5)) - 0.12 * math.sin(math.pi * u) * v, 0.06 * math.sin(u * 9 + v * 3) * v))
    b.cloth(net, 10, 4, SD, th=0.05)
    b.grads[SD] = g_lin(0.6, 2.4, (0.8, 0.78, 0.74), (1, 1, 1))
    for k in range(5):
        u = (k + 0.5) / 5
        b.ball((-1.75 + 3.5 * u, 2.3 - 1.6 * 0.97 * (0.85 + 0.15 * math.sin(u * 5)) - 0.12 * math.sin(math.pi * u) * 0.97, 0.12), 0.14, FR if k % 2 == 0 else CW, seg=6, rings=4)
    b.rbox((2.3, 0.2, 0.9), (0.7, 0.4, 0.5), W, r=0.05, j=0.01)
    b.ball((2.3, 0.45, 0.9), 1.0, AB, sq=(0.3, 0.1, 0.12), seg=6, rings=4)
    P['fishing_net_rack'] = b.finish()

    # ---- campfire
    b = B('campfire'); house_grads(b)
    for k in range(8):
        a = 2 * math.pi * k / 8
        b.ball((math.cos(a) * 0.78, 0.15, math.sin(a) * 0.78), 0.26, SD, sq=(1, 0.7, 1), seg=7, rings=4, rot=Ry(a))
    b.cyl((0, 0.04, 0), 0.62, 0.62, 0.08, 8, TM)
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.3
        b.limb((math.cos(a) * 0.55, 0.14, math.sin(a) * 0.55), (math.cos(a) * 0.08, 0.85, math.sin(a) * 0.08), 0.1, 0.07, W, segs=6)
    b.limb((-0.4, 0.15, -0.3), (0.4, 0.25, 0.3), 0.1, 0.1, TM, segs=6)
    for (r, h, m, yo) in ((0.34, 1.05, FR, 0.18), (0.24, 0.8, GD, 0.2), (0.13, 0.5, GL, 0.22)):
        b.lathe([(0, yo), (r * 0.9, yo + 0.04), (r, yo + h * 0.3), (r * 0.62, yo + h * 0.66), (0, yo + h)], m, segs=6, smooth=True)
    b.limb((-1.7, 0.22, 0.9), (-0.7, 0.22, 1.5), 0.22, 0.22, W, segs=7)
    b.limb((1.5, 0.22, 1.2), (1.9, 0.22, -0.4), 0.2, 0.2, W, segs=7)
    P['campfire'] = b.finish()

    # ---- flower beds
    b = B('flower_bed_round'); house_grads(b)
    b.lathe([(1.15, 0.0), (1.62, 0.0), (1.72, 0.12), (1.72, 0.38), (1.6, 0.5), (1.22, 0.5), (1.12, 0.38), (1.12, 0.12)], S, segs=16, smooth=False, closed=True)
    b.grads[LL] = g_lin(0.3, 1.2, (0.55, 0.75, 0.6), (1, 1, 0.9))
    b.ball((0, 0.28, 0), 1.2, TM, sq=(1, 0.3, 1), seg=12, rings=4)
    b.ball((0, 0.5, 0), 1.18, LL, sq=(1, 0.3, 1), seg=12, rings=5)
    cols = (FR, FP, GD, CW)
    for ring, r, n in ((0, 0.95, 14), (1, 0.55, 8), (2, 0.2, 4)):
        for k in range(n):
            a = 2 * math.pi * k / n + ring * 0.4
            fh(b, math.cos(a) * r, 0.7 + 0.1 * ring + 0.05 * (k % 2), math.sin(a) * r, cols[(k + ring) % 4], 1.1 + 0.1 * ring)
    b.cyl((0, 0.65, 0), 0.025, 0.025, 0.6, 4, L)
    b.ball((0, 1.1, 0), 0.2, FP, seg=7, rings=5)
    P['flower_bed_round'] = b.finish()

    b = B('flower_bed_long'); house_grads(b)
    b.rbox((0, 0.25, 0.65), (4.8, 0.5, 0.42), S, r=0.1, j=0.008); b.rbox((0, 0.25, -0.65), (4.8, 0.5, 0.42), S, r=0.1, j=0.008)
    for sx in (-1, 1): b.rbox((sx * 2.19, 0.25, 0), (0.42, 0.5, 1.3), S, r=0.1, j=0.008)
    b.grads[LL] = g_lin(0.3, 1.2, (0.55, 0.75, 0.6), (1, 1, 0.9))
    b.rbox((0, 0.3, 0), (4.0, 0.34, 0.95), TM, r=0.06)
    b.blob((0, 0.52, 0), 1.0, LL, sq=(2.0, 0.22, 0.5), seg=12, rings=5, amp=0.05)
    for row, z in enumerate((-0.28, 0.0, 0.28)):
        for k in range(10):
            x = -1.85 + 3.7 * k / 9 + (0.17 if row == 1 else 0)
            fh(b, x, 0.7 + 0.08 * ((k + row) % 2), z, cols[(k + row * 2) % 4], 1.15)
    P['flower_bed_long'] = b.finish()

    # ---- laundry line
    b = B('laundry_line'); house_grads(b)
    for sx in (-1, 1):
        b.limb((sx * 2.0, 0, 0), (sx * 2.0, 2.9, 0), 0.1, 0.07, W, segs=6)
        b.ball((sx * 2.0, 2.95, 0), 0.13, GD, seg=6, rings=4)
        b.rbox((sx * 2.0, 0.12, 0), (0.5, 0.24, 0.5), SD, r=0.06)
    ln = lambda x: 2.7 - 0.28 * (1 - (x / 2.0) ** 2)
    b.tube([V((x, ln(x), 0)) for x in (-2.0, -1.2, -0.4, 0.4, 1.2, 2.0)], [0.02] * 6, TM, segs=4, cap=False, smooth=False)
    for x, w, h, m, ph in ((-1.45, 0.7, 0.8, CW, 0.0), (-0.55, 0.55, 0.6, AB, 1.0), (0.4, 0.95, 1.1, CW, 2.0), (1.3, 0.5, 0.65, FP, 3.0)):
        def cl(u, v, x=x, w=w, h=h, ph=ph): return V((x + w * (u - 0.5), ln(x) - 0.04 - h * v, 0.08 * math.sin(u * 7 + ph + v * 2) * (0.3 + v)))
        b.cloth(cl, 3, 3, m, th=0.04)
    for k in range(2): b.ball((-0.2 + 1.5 * k, 0.13, 0.3), 0.16, W, sq=(1.2, 0.8, 1.0), seg=6, rings=4)
    P['laundry_line'] = b.finish()

    # ---- notice board
    b = B('notice_board'); house_grads(b)
    for sx in (-1, 1): b.limb((sx * 0.95, 0, 0), (sx * 0.95, 2.4, 0), 0.1, 0.09, W, segs=6)
    b.rbox((0, 1.6, 0.0), (2.2, 1.35, 0.14), W, r=0.06, j=0.004)
    b.rbox((0, 1.6, 0.09), (1.95, 1.1, 0.05), TM, r=0.03, j=0)
    for x, y, w, h, a in ((-0.6, 1.8, 0.55, 0.7, 0.08), (0.05, 1.75, 0.5, 0.6, -0.06), (0.65, 1.7, 0.45, 0.55, 0.1), (-0.3, 1.3, 0.5, 0.4, -0.1), (0.4, 1.28, 0.55, 0.38, 0.05)):
        b.box((x, y, 0.13), (w, h, 0.02), CW, Rz(a), j=0.004)
        b.ball((x, y + h / 2 - 0.06, 0.15), 0.04, FR, seg=4, rings=3)
    b.prism([(-1.35, 2.35), (1.35, 2.35), (0, 3.0)], -0.3, 0.3, RB)
    b.rbox((0, 3.0, 0), (0.18, 0.12, 0.72), GD, r=0.03)
    b.cyl((1.1, 1.0, 0.35), 0.17, 0.12, 0.2, 7, W)
    P['notice_board'] = b.finish()

    # ---- double lamp post
    b = B('lamp_post_double'); house_grads(b)
    b.cyl((0, 0.2, 0), 0.42, 0.34, 0.4, 8, SD)
    b.cyl((0, 0.55, 0), 0.2, 0.15, 0.35, 8, IR)
    b.cyl((0, 1.95, 0), 0.09, 0.09, 2.9, 6, IR)
    b.cyl((0, 1.0, 0), 0.15, 0.15, 0.1, 6, IR)
    b.box((0, 3.4, 0), (2.1, 0.09, 0.09), IR, j=0)
    for sx in (-1, 1):
        b.strut((0, 2.7, 0), (sx * 0.75, 3.38, 0), 0.07, 0.07, IR, r=0.02, j=0)
        b.ball((sx * 1.05, 3.4, 0), 0.1, IR, seg=6, rings=4)
        b.push(T((sx * 1.0, 0, 0)))
        b.bx(-0.26, 0.26, 2.78, 2.9, -0.26, 0.26, IR, r=0.03)
        b.bx(-0.2, 0.2, 2.9, 3.3, -0.2, 0.2, GL, r=0.04)
        for ax in (-1, 1):
            for az in (-1, 1): b.box((ax * 0.21, 3.1, az * 0.21), (0.06, 0.5, 0.06), IR, j=0)
        b.cyl((0, 3.55, 0), 0.34, 0, 0.35, 4, GD)
        b.ball((0, 3.78, 0), 0.08, GD, seg=5, rings=3)
        b.pop()
    b.ball((0, 3.5, 0), 0.14, GD, seg=6, rings=4)
    P['lamp_post_double'] = b.finish()

    # ---- banner pole
    b = B('banner_pole'); house_grads(b)
    b.rbox((0, 0.18, 0), (0.7, 0.36, 0.7), SD, r=0.08)
    b.limb((0, 0, 0), (0, 5.2, 0), 0.1, 0.07, TM, segs=6)
    b.ball((0, 5.28, 0), 0.17, GD, seg=7, rings=5)
    b.strut((-0.85, 4.65, 0), (0.85, 4.65, 0), 0.1, 0.1, TM, r=0.03, j=0)
    for sx in (-1, 1): b.ball((sx * 0.9, 4.65, 0), 0.11, GD, seg=6, rings=4)
    def bn(u, v): return V((0.78 * (u - 0.5) * 2 * (1 - 0.1 * v), 4.6 - 2.4 * v - 0.2 * v * abs(u - 0.5) * 2 * 0, 0.14 + 0.07 * math.sin(v * 5 + u * 2)))
    b.cloth(lambda u, v: bn(u, v) + V(0, 0, 0.0), 4, 6, RB, th=0.06)
    b.cloth(lambda u, v: V(0.88 * (u - 0.5) * 2 * (1 - 0.1 * v), 4.62 - 2.46 * v, 0.1 + 0.07 * math.sin(v * 5 + u * 2)), 4, 6, GD, th=0.04)
    b.prism([(0, 4.1), (0.28, 3.65), (0, 3.2), (-0.28, 3.65)], 0.23, 0.27, GD)
    P['banner_pole'] = b.finish()

    P.update(build_market())
    P.update(build_nature_bits())
    return P


def market_tent(name, stripe, goods):
    b = B(name); house_grads(b)
    b.grads[stripe] = g_lin(0.5, 3.7, (0.8, 0.78, 0.78), (1, 1, 1))
    E = 2.0; ye = 2.45; ya = 3.6
    for k in range(4):
        b.push(Ry(k * math.pi / 2))
        A_ = V((0, ya, 0)); e0, e1 = V((-E, ye, E)), V((E, ye, E))
        fn = lambda u, v: A_ * (1 - v) + (e0 * (1 - u) + e1 * u) * v
        mf = lambda i, j: stripe if i % 2 == 0 else CW
        b.surf(fn, 6, 1, stripe, matfn=mf, flip=False)
        fn2 = lambda u, v: A_ * (1 - v) + (e0 * (1 - u) + e1 * u) * v - V(0, 0.1, 0)
        b.surf(fn2, 6, 1, stripe, matfn=mf, flip=True)
        if k != 2:
            for i in range(6):
                x = -E + (i + 0.5) * 2 * E / 6
                b.box((x, ye - 0.2, E + 0.02), (2 * E / 6 - 0.02, 0.4, 0.05), stripe if i % 2 == 0 else CW, j=0.004)
        b.pop()
    b.ball((0, ya + 0.12, 0), 0.14, GD, seg=6, rings=4)
    b.cyl((0, ya + 0.3, 0), 0.03, 0, 0.3, 4, GD)
    for sx in (-1, 1):
        for sz in (-1, 1): b.limb((sx * (E - 0.1), 0, sz * (E - 0.1)), (sx * (E - 0.1), ye, sz * (E - 0.1)), 0.07, 0.07, W, segs=6)
    for i in range(6):
        b.box((-E + (i + 0.5) * 2 * E / 6, 1.2, -E + 0.1), (2 * E / 6 - 0.02, 2.3, 0.06), stripe if i % 2 == 0 else CW, j=0.004)
    b.rbox((0, 0.46, 1.3), (3.3, 0.9, 0.8), W, r=0.07, j=0.004)
    b.rbox((0, 0.96, 1.3), (3.5, 0.12, 1.0), TM, r=0.05)
    goods(b)
    return b.finish()


def build_market():
    P = {}
    def fruit(b):
        for k, (x, c) in enumerate([(-1.05, FR), (-0.8, FR), (-0.9, GD), (-0.65, FR), (0.65, GD), (0.9, LL), (1.1, GD), (0.85, FR)]):
            b.ball((x, 1.14 + 0.1 * (k % 2), 1.3 + 0.12 * ((k * 3) % 3 - 1)), 0.13, c, seg=5, rings=4)
        b.rbox((-0.9, 1.1, 1.3), (0.8, 0.14, 0.5), W, r=0.03); b.rbox((0.85, 1.1, 1.3), (0.8, 0.14, 0.5), W, r=0.03)
        b.box((0.0, 1.35, 1.3), (0.2, 0.5, 0.2), W, j=0)
    def greens(b):
        for k, (x, c) in enumerate([(-1.05, FP), (-0.75, GD), (-0.9, CW), (-0.65, FP), (0.7, LL), (0.95, LL), (1.1, FR), (0.85, GD)]):
            fh(b, x, 1.08 + 0.08 * (k % 2), 1.3 + 0.12 * ((k * 3) % 3 - 1), c, 1.3) if k < 4 or k > 6 else b.ball((x, 1.18, 1.3), 0.17, c, seg=5, rings=4)
        b.rbox((-0.9, 1.1, 1.3), (0.8, 0.14, 0.5), W, r=0.03); b.rbox((0.85, 1.1, 1.3), (0.8, 0.14, 0.5), W, r=0.03)
        b.cyl((0.0, 1.13, 1.3), 0.2, 0.2, 0.3, 7, AB, smooth=False)
        for k in range(3): fh(b, (k - 1) * 0.1, 1.38, 1.3, [FP, FR, CW][k], 1.1)
    P['market_tent_red'] = market_tent('market_tent_red', AR, fruit)
    P['market_tent_green'] = market_tent('market_tent_green', AG, greens)

    b = B('fruit_crate'); house_grads(b)
    b.rbox((0, 0.3, 0), (1.15, 0.6, 0.8), W, r=0.06, j=0.008)
    for sx in (-1, 1):
        for sz in (-1, 1): b.box((sx * 0.57, 0.3, sz * 0.4), (0.1, 0.62, 0.1), TM, j=0)
    b.box((0, 0.42, 0.42), (1.05, 0.08, 0.05), TM, j=0); b.box((0, 0.18, 0.42), (1.05, 0.08, 0.05), TM, j=0)
    for k, (x, z, c) in enumerate([(-0.4, -0.15, FR), (-0.1, -0.2, FR), (0.2, -0.15, GD), (0.45, -0.1, FR), (-0.4, 0.18, GD), (-0.12, 0.15, FR), (0.2, 0.2, LL), (0.46, 0.17, FR), (-0.2, 0.0, GD), (0.15, 0.02, FR)]):
        b.ball((x, 0.63 + 0.07 * (k % 3), z), 0.15, c, seg=6, rings=4)
    P['fruit_crate'] = b.finish()

    b = B('flower_cart'); house_grads(b)
    b.rbox((0, 0.85, 0), (2.0, 0.5, 1.05), W, r=0.07, j=0.004)
    b.rbox((0, 1.12, 0), (2.1, 0.08, 1.15), TM, r=0.04)
    for sz in (-1, 1):
        b.push(T((0, 0.5, sz * 0.62)))
        b.lathe([(0.42, -0.05), (0.52, -0.05), (0.52, 0.05), (0.42, 0.05)], TM, segs=8, M=Rx(math.pi / 2), smooth=False, closed=True)
        b.cyl((0, 0, 0), 0.1, 0.1, 0.14, 6, GD, axis='z')
        b.box((0, 0, 0), (0.9, 0.07, 0.06), W, j=0); b.box((0, 0, 0), (0.07, 0.9, 0.06), W, j=0)
        b.pop()
    for sz in (-1, 1): b.strut((0.9, 0.9, sz * 0.4), (2.3, 0.55, sz * 0.38), 0.1, 0.1, W, r=0.03, j=0)
    b.limb((2.3, 0.55, -0.4), (2.3, 0.55, 0.4), 0.06, 0.06, W, segs=5)
    for k, (x, c, m) in enumerate([(-0.55, AB, FR), (0.1, W, FP), (0.65, AB, GD)]):
        b.cyl((x, 1.34, 0.05 * (k - 1)), 0.26, 0.2, 0.4, 7, c, smooth=False)
        b.ball((x, 1.58, 0.05 * (k - 1)), 0.27, LL, sq=(1, 0.6, 1), seg=6, rings=4)
        for j in range(4): fh(b, x + math.cos(j * 1.6 + k) * 0.14, 1.66, math.sin(j * 1.6 + k) * 0.14, [m, FP, CW, FR][j], 1.2)
    b.rbox((-0.85, 1.28, 0.2), (0.3, 0.3, 0.3), W, r=0.04, j=0.01)
    P['flower_cart'] = b.finish()
    return P


def build_nature_bits():
    P = {}
    # ---- cliff_rock_large: mossy cliff chunk for terrain edges
    b = B('cliff_rock_large')
    b.grads[SD] = lambda co, n: mixc((0.52, 0.5, 0.52), (1.0, 1.0, 0.96), smooth(0.55 * clamp(co.y / 5.0) + 0.45 * clamp(0.5 + 0.5 * n.y)))
    b.grads[S] = b.grads[SD]
    for m in (L, LL): b.grads[m] = g_canopy(1.0, 5.8, (0.5, 0.7, 0.55), (1.0, 1.0, 0.8), 0.4)
    rocks = [(0.0, 1.9, 0.0, 2.5, (1.25, 0.95, 1.0), SD), (-2.3, 1.2, 0.4, 1.7, (1.0, 0.85, 1.0), S), (2.4, 1.3, -0.2, 1.8, (1.0, 0.85, 1.1), SD),
             (0.4, 3.4, -0.3, 1.6, (1.1, 0.95, 1.0), S), (-0.9, 0.9, 1.9, 1.3, (1.1, 0.7, 1.0), SD), (1.7, 0.8, 1.7, 1.1, (1.0, 0.7, 1.0), S),
             (-1.5, 2.8, -0.9, 1.3, (1.0, 0.9, 1.0), SD)]
    for i, (x, y, z, r, sq, m) in enumerate(rocks):
        b.blob((x, y, z), r, m, sq=sq, seg=10, rings=7, amp=0.16, freq=1.3, seed=i * 2.3 + 1,
               rot=Ry(b.rng.uniform(0, 6)))
    for i, (x, y, z, r, mm) in enumerate([(0.3, 4.55, -0.3, 1.1, L), (-0.2, 3.55, 0.5, 0.9, LL), (2.3, 2.1, -0.1, 0.9, LL), (-2.3, 1.95, 0.3, 0.8, L), (-1.4, 3.65, -0.9, 0.8, L), (0.2, 0.95, 2.5, 0.6, LL)]):
        b.blob((x, y, z), r, mm, sq=(1.2, 0.45, 1.1), seg=8, rings=5, amp=0.14, seed=30 + i)
    for k, (x, y, z, c) in enumerate([(0.8, 4.8, 0.3, FP), (-0.3, 3.8, 1.0, CW), (2.5, 2.3, 0.4, GD), (-2.0, 2.2, 0.7, FP)]):
        b.ball((x, y, z), 0.12, c, seg=5, rings=3)
    P['cliff_rock_large'] = b.finish()

    b = B('rock_cluster_small')
    b.grads[SD] = lambda co, n: mixc((0.55, 0.52, 0.54), (1, 1, 0.96), smooth(0.5 * clamp(co.y / 1.0) + 0.5 * clamp(0.5 + 0.5 * n.y)))
    b.grads[S] = b.grads[SD]
    b.blob((0, 0.42, 0), 0.7, SD, sq=(1.1, 0.75, 1.0), seg=9, rings=6, amp=0.16, seed=3)
    b.blob((0.8, 0.28, 0.3), 0.45, S, sq=(1.0, 0.8, 1.0), seg=8, rings=5, amp=0.16, seed=7)
    b.blob((-0.6, 0.22, 0.55), 0.34, SD, sq=(1.0, 0.8, 1.0), seg=8, rings=5, amp=0.16, seed=11)
    b.grads[LL] = g_lin(0.0, 0.8, (0.7, 0.85, 0.7), (1, 1, 0.9))
    b.blob((0.05, 0.78, 0), 0.34, LL, sq=(1.2, 0.4, 1.1), seg=7, rings=4, amp=0.12, seed=2)
    tuft(b, -0.2, 0.05, 0.85, 1.2); tuft(b, 0.95, 0.04, -0.2, 1.0)
    P['rock_cluster_small'] = b.finish()

    # ---- reed cluster
    b = B('reed_cluster')
    b.grads[L] = g_lin(0, 2.0, (0.6, 0.78, 0.6), (1, 1, 0.9)); b.grads[LL] = g_lin(0, 2.0, (0.65, 0.82, 0.62), (1, 1, 0.9))
    rr = random.Random(5)
    for k in range(11):
        a = 2 * math.pi * k / 11 + rr.uniform(-0.3, 0.3); d = rr.uniform(0.1, 0.5)
        x0, z0 = math.cos(a) * d, math.sin(a) * d
        hgt = rr.uniform(1.5, 2.3); lean = rr.uniform(0.1, 0.4)
        top = V((x0 + math.cos(a) * lean, hgt, z0 + math.sin(a) * lean))
        b.tube([V((x0, -0.05, z0)), V((x0 + math.cos(a) * lean * 0.3, hgt * 0.55, z0 + math.sin(a) * lean * 0.3)), top], [0.04, 0.032, 0.015], L if k % 2 else LL, segs=4, cap=False, smooth=False)
        if k % 3 == 0:
            b.ball(tuple(top + V((0, -0.2, 0))), 1.0, TM, sq=(0.07, 0.26, 0.07), seg=6, rings=4)
    for k in range(7):
        a = 2 * math.pi * k / 7 + 0.4
        d = V((math.cos(a), 0, math.sin(a)))
        p0 = d * 0.25 + V((0, -0.05, 0)); p1 = d * 0.55 + V((0, 0.9, 0)); p2 = d * 1.0 + V((0, 1.25 - 0.2 * (k % 2), 0))
        b.tube([p0, p1, p2], [0.07, 0.06, 0.02], LL if k % 2 else L, segs=4, sq=2.2, cap=False, smooth=False)
    P['reed_cluster'] = b.finish()

    # ---- lily pads
    b = B('lily_pads')
    b.grads[L] = g_lin(0.0, 0.1, (0.8, 0.9, 0.8), (1, 1, 1))
    def pad(x, z, r, a0, mat):
        n = 9
        th = [a0 + 0.32 + (2 * math.pi - 0.64) * i / (n - 1) for i in range(n)]
        c0 = b.bm.verts.new((x, 0.06, z)); c1 = b.bm.verts.new((x, 0.03, z))
        t0 = [b.bm.verts.new((x + r * math.cos(t), 0.05, z + r * math.sin(t))) for t in th]
        t1 = [b.bm.verts.new((x + r * math.cos(t), 0.02, z + r * math.sin(t))) for t in th]
        fs = []
        for i in range(n - 1):
            fs += [b.bm.faces.new((c0, t0[i + 1], t0[i])), b.bm.faces.new((c1, t1[i], t1[i + 1])),
                   b.bm.faces.new((t0[i], t0[i + 1], t1[i + 1], t1[i]))]
        fs += [b.bm.faces.new((c0, t0[0], t1[0], c1)), b.bm.faces.new((c0, c1, t1[-1], t0[-1]))]
        for f in fs: f.material_index = MI[mat]; f.smooth = False; f.tag = True
    for k, (x, z, r, a) in enumerate([(0, 0, 0.62, 0.3), (0.95, 0.35, 0.5, 2.2), (-0.8, 0.5, 0.48, 4.0), (0.35, -0.85, 0.55, 5.2), (-0.5, -0.7, 0.4, 1.0), (1.3, -0.5, 0.38, 3.3)]):
        pad(x, z, r, a, L if k % 2 else LL)
    for fx, fz, c in ((0.5, 0.2, FP), (-0.65, -0.55, CW)):
        for j in range(6):
            a = j * math.pi / 3
            b.cyl((fx + math.cos(a) * 0.1, 0.17, fz + math.sin(a) * 0.1), 0.07, 0, 0.26, 4, c, caps=False, rot=T((0, 0, 0)))
        b.ball((fx, 0.12, fz), 0.07, GD, seg=5, rings=3)
    P['lily_pads'] = b.finish()
    return P


# ================================================================= SHOP-FLAVOUR PROPS
def awning(name, col, w=3.0):
    b = B(name); house_grads(b)
    n = 7
    for i in range(n):
        x = -w / 2 + (i + 0.5) * w / n
        m = col if i % 2 == 0 else CW
        b.box((x, 0.9, 0.6), (w / n - 0.01, 0.07, 1.35), m, Rx(0.4), j=0.004)
        b.box((x, 0.38, 1.2), (w / n - 0.01, 0.22, 0.07), m, j=0.004)
        b.ball((x, 0.26, 1.2), 0.0001, m, seg=3, rings=2) if False else None
    for sx in (-1, 1): b.strut((sx * (w / 2 - 0.1), 0.2, 1.15), (sx * (w / 2 - 0.1), 1.2, 0.05), 0.06, 0.06, IR, r=0.02, j=0)
    b.box((0, 1.2, 0.04), (w + 0.1, 0.12, 0.1), W, j=0)
    return b.finish()


def potted(name, kind):
    b = B(name); house_grads(b)
    b.cyl((0, 0.3, 0), 0.34, 0.24, 0.6, 8, BR if kind == 'a' else AB)
    b.cyl((0, 0.62, 0), 0.38, 0.38, 0.1, 8, GD if kind == 'a' else CW)
    b.grads[L] = g_lin(0.6, 1.6, (0.55, 0.75, 0.6), (1, 1, 0.85)); b.grads[LL] = b.grads[L]
    if kind == 'a':       # round bush with flowers
        b.blob((0, 1.0, 0), 0.5, L, seg=9, rings=6, amp=0.1, seed=1); b.blob((0.2, 1.3, 0.1), 0.32, LL, seg=8, rings=5, seed=2)
        for k, c in enumerate((FR, FP, GD, CW, FR)):
            a = k * 1.3; fh(b, math.cos(a) * 0.4, 1.0 + 0.12 * k % 3 * 0.3 + 0.1, math.sin(a) * 0.4, c, 1.1)
    else:                 # spiky plant: leaf blades
        for k in range(9):
            a = 2 * math.pi * k / 9; d = V((math.cos(a), 0, math.sin(a)))
            b.tube([d * 0.05 + V((0, 0.6, 0)), d * 0.3 + V((0, 1.05, 0)), d * 0.62 + V((0, 1.2 - 0.25 * (k % 2), 0))], [0.1, 0.08, 0.01], LL if k % 2 else L, segs=4, sq=1.8, cap=False, smooth=False)
        fh(b, 0, 1.45, 0, FP, 1.6)
    return b.finish()


def build_shops():
    P = {}
    # ---- blacksmith
    b = B('anvil_big'); house_grads(b)
    b.grads[IR] = g_lin(0, 1.5, (0.8, 0.8, 0.85), (1.6, 1.6, 1.7) if False else (1, 1, 1))
    b.cyl((0, 0.3, 0), 0.5, 0.42, 0.6, 8, W); b.cyl((0, 0.62, 0), 0.52, 0.52, 0.08, 8, TM)
    b.rbox((0, 0.85, 0), (0.7, 0.4, 1.25), IR, r=0.08)
    b.rbox((0, 1.15, 0), (0.95, 0.22, 1.5), IR, r=0.07)
    b.rbox((0, 1.05, 0.95), (0.4, 0.2, 0.55), IR, r=0.06)
    b.cyl((0, 1.15, -1.0), 0.14, 0.04, 0.5, 6, IR, rot=Rx(math.pi / 2))
    b.limb((0.5, 1.3, 0.1), (0.9, 1.3, 0.6), 0.04, 0.04, W, segs=5); b.rbox((0.5, 1.3, 0.05), (0.3, 0.2, 0.2), IR, r=0.04)
    P['anvil_big'] = b.finish()

    b = B('forge_furnace'); house_grads(b)
    b.rbox((0, 0.55, 0), (2.4, 1.1, 1.6), SD, r=0.12)
    b.rbox((0, 1.5, -0.2), (1.8, 0.9, 1.2), S, r=0.1)
    b.rbox((0, 0.55, 0.82), (1.1, 0.7, 0.1), GL, r=0.04)
    b.box((0, 0.55, 0.9), (1.3, 0.12, 0.08), IR, j=0); b.box((0, 0.95, 0.9), (1.3, 0.12, 0.08), IR, j=0)
    for sx in (-1, 1): b.box((sx * 0.65, 0.55, 0.9), (0.12, 0.9, 0.08), IR, j=0)
    b.rbox((0, 1.15, 0.0), (2.6, 0.12, 1.8), IR, r=0.04)
    b.cyl((0, 2.5, -0.35), 0.4, 0.3, 1.7, 8, SD, smooth=False); b.cyl((0, 3.45, -0.35), 0.5, 0.5, 0.25, 8, S)
    b.rbox((0, 1.05, 0.6), (1.0, 0.1, 0.5), RG if False else GL, r=0.03)
    b.box((1.45, 0.9, 0.2), (0.25, 0.9, 0.7), W, j=0.01)
    P['forge_furnace'] = b.finish()

    b = B('weapon_rack'); house_grads(b)
    for sx in (-1, 1): b.limb((sx * 1.2, 0, 0), (sx * 1.2, 2.2, 0), 0.1, 0.09, W, segs=6); b.ball((sx * 1.2, 2.28, 0), 0.13, GD, seg=6, rings=4)
    b.rbox((0, 1.95, 0), (2.6, 0.14, 0.18), W, r=0.04); b.rbox((0, 0.7, 0), (2.6, 0.14, 0.18), W, r=0.04); b.rbox((0, 0.12, 0), (2.9, 0.24, 0.7), W, r=0.05)
    for k, x in enumerate((-0.85, -0.3, 0.3, 0.85)):
        b.rbox((x, 1.35, 0.1), (0.1, 1.35 + 0.3 * (k % 2), 0.04), S, r=0.015, j=0.01); b.rbox((x, 0.82, 0.1), (0.4, 0.1, 0.08), GD, r=0.03, j=0)
        b.cyl((x, 0.72, 0.1), 0.05, 0.05, 0.25, 5, W)
    b.ball((1.0, 0.35, 0.28), 0.18, AB, sq=(1, 1, 0.4), seg=6, rings=4)
    P['weapon_rack'] = b.finish()

    b = B('grindstone'); house_grads(b)
    for sx in (-1, 1): b.strut((sx * 0.55, 0.0, 0.45), (sx * 0.4, 0.8, 0.0), 0.1, 0.1, W, r=0.03, j=0); b.strut((sx * 0.55, 0.0, -0.45), (sx * 0.4, 0.8, 0.0), 0.1, 0.1, W, r=0.03, j=0)
    b.cyl((0, 0.85, 0), 0.62, 0.62, 0.32, 12, SD, axis='x'); b.cyl((0, 0.85, 0), 0.1, 0.1, 1.0, 6, IR, axis='x')
    b.limb((0.6, 0.85, 0), (0.85, 0.5, 0.45), 0.04, 0.04, IR, segs=4); b.ball((0.85, 0.5, 0.5), 0.1, W, seg=6, rings=4)
    b.rbox((0, 0.32, 0.5), (0.9, 0.1, 0.5), W, r=0.03)
    P['grindstone'] = b.finish()

    # ---- pets
    b = B('doghouse'); house_grads(b)
    b.rbox((0, 0.55, 0), (1.5, 1.1, 1.5), W, r=0.08, j=0.005)
    b.prism([(-0.85, 1.05), (0.85, 1.05), (0, 1.75)], -0.95, 0.95, RB)
    b.prism([(-0.7, 1.05), (0.7, 1.05), (0, 1.55)], 0.74, 0.8, W)
    b.arch(0, 0.45, 0.4, 0.74, 0.79, TM); b.box((0, 0.225, 0.77), (0.8, 0.45, 0.05), TM, j=0)
    b.box((0, 1.45, 0), (0.12, 0.12, 2.0), GD, Rz(0.0), j=0)
    b.ball((0.1, 1.1, 1.05), 0.0001, W, seg=3, rings=2) if False else None
    b.rbox((0, 0.06, 1.2), (0.7, 0.12, 0.45), AB, r=0.05); b.ball((0.35, 0.3, 1.5), 0.18, FR, seg=6, rings=4)
    b.ball((-0.5, 0.15, 1.5), 0.12, GD, seg=6, rings=4)
    P['doghouse'] = b.finish()

    b = B('pet_pen_fence'); house_grads(b)
    for k in range(5):
        x = -2.0 + k
        b.rbox((x, 0.5, 0), (0.18, 1.0, 0.18), W, r=0.04, j=0.008); b.ball((x, 1.07, 0), 0.13, GD if k % 2 == 0 else W, seg=6, rings=4)
    for y in (0.35, 0.75): b.rbox((0, y, 0), (4.0, 0.12, 0.1), W, r=0.03, j=0.006)
    for k in range(8):
        x = -1.75 + k * 0.5 if False else -1.75 + k * 0.5
        b.rbox((x, 0.55, -0.02), (0.07, 0.8, 0.07), TM, r=0.02, j=0.006)
    b.bx(-2.15, 2.15, 1.05, 1.1, -0.06, 0.06, W, r=0.01) if False else None
    P['pet_pen_fence'] = b.finish()

    b = B('bird_cage'); house_grads(b)
    b.limb((0, 0, 0), (0, 2.2, 0), 0.07, 0.06, IR, segs=6); b.cyl((0, 0.1, 0), 0.3, 0.25, 0.2, 8, SD)
    b.strut((0, 2.0, 0), (0.7, 2.4, 0), 0.06, 0.06, IR, r=0.02, j=0)
    b.cyl((0.7, 1.55, 0), 0.3, 0.3, 0.1, 10, GD)
    for k in range(10):
        a = 2 * math.pi * k / 10
        b.limb((0.7 + math.cos(a) * 0.3, 1.58, math.sin(a) * 0.3), (0.7 + math.cos(a) * 0.2, 2.25, math.sin(a) * 0.2), 0.012, 0.012, GD, segs=4)
    b.ball((0.7, 2.3, 0), 0.22, GD, sq=(1, 0.7, 1), seg=8, rings=5); b.ball((0.7, 2.5, 0), 0.07, GD, seg=5, rings=3)
    b.cyl((0.7, 1.9, 0), 0.015, 0.015, 0.6, 4, GD, axis='x')
    b.ball((0.7, 1.82, 0), 0.14, AB, sq=(1.1, 1, 0.9), seg=7, rings=5); b.ball((0.7, 1.96, 0.1), 0.09, AB, seg=6, rings=4)
    b.cyl((0.8, 1.9, 0.12), 0.0, 0.03, 0.0001, 3, GD) if False else None
    P['bird_cage'] = b.finish()

    # ---- fortune: purple + gold round tent with a crystal ball
    b = B('fortune_tent')
    PUR = lambda co, n: (0.62, 0.34, 0.82, 1.0)
    PUR2 = lambda co, n: (0.45, 0.22, 0.65, 1.0)
    b.grads[CW] = lambda co, n: mixc((0.45, 0.22, 0.65), (0.72, 0.45, 0.92), clamp(co.y / 4.2))
    b.grads[AB] = lambda co, n: (0.35, 0.2, 0.6, 1.0)
    b.cyl((0, 0.08, 0), 2.35, 2.35, 0.16, 12, SD)
    n = 12
    def wall(u, v):
        a = 2 * math.pi * (u * (n - 1.2) / n + 0.6 / n) + math.pi / 2 + 0.5
        return V((2.0 * math.cos(a), 0.15 + 1.9 * v, 2.0 * math.sin(a)))
    ba = 0.55  # opening on +z
    for k in range(n):
        a0 = 2 * math.pi * k / n; a1 = 2 * math.pi * (k + 1) / n
        if abs(((a0 + a1) / 2 - math.pi / 2 + math.pi) % (2 * math.pi) - math.pi) < 0.6: continue     # front opening
        def seg(u, v, a0=a0, a1=a1):
            a = lerp(a0, a1, u); r = 2.0 - 0.22 * math.sin(math.pi * v) * -1
            return V((r * math.cos(a), 0.15 + 2.0 * v, r * math.sin(a)))
        b.surf(seg, 1, 2, CW, matfn=lambda i, j, k=k: CW if k % 2 == 0 else AB, flip=True, smooth=False)
        b.surf(lambda u, v, seg=seg: seg(u, v) * 0.96 + V(0, 0, 0), 1, 2, CW, matfn=lambda i, j, k=k: CW if k % 2 == 0 else AB, flip=False)
    for k in range(n):
        a0 = 2 * math.pi * k / n; a1 = 2 * math.pi * (k + 1) / n
        def roof(u, v, a0=a0, a1=a1):
            a = lerp(a0, a1, u); r = 2.25 * (1 - v) + 0.0
            return V((r * math.cos(a), 2.15 + 1.9 * v ** 0.9, r * math.sin(a)))
        mf = lambda i, j, k=k: CW if k % 2 == 0 else AB
        b.surf(roof, 1, 2, CW, matfn=mf, flip=True); b.surf(lambda u, v, roof=roof: roof(u, v) - V(0, 0.06, 0), 1, 2, CW, matfn=mf, flip=False)
    b.ball((0, 4.15, 0), 0.2, GD, seg=7, rings=5); b.cyl((0, 4.45, 0), 0.04, 0, 0.45, 4, GD)
    b.cyl((0, 2.2, 0), 2.28, 2.2, 0.12, 12, GD, caps=False)
    for k in range(n):
        a = 2 * math.pi * (k + 0.5) / n
        if abs(((a - math.pi / 2) + math.pi) % (2 * math.pi) - math.pi) < 0.9: continue
        b.ball((2.25 * math.cos(a), 2.1, 2.25 * math.sin(a)), 0.11, GD, seg=5, rings=3)
    for sx in (-1, 1): b.limb((sx * 1.1, 0.1, 1.95), (sx * 1.2, 2.1, 1.9), 0.09, 0.09, GD, segs=6)
    b.rbox((0, 0.55, 0.3), (1.2, 0.1, 1.2), GD, r=0.04); b.cyl((0, 0.3, 0.3), 0.4, 0.5, 0.5, 8, AB)
    b.ball((0, 0.86, 0.3), 0.3, RG, seg=10, rings=7); b.cyl((0, 0.58, 0.3), 0.2, 0.26, 0.1, 8, GD)
    b.ball((-0.5, 0.78, 0.5), 0.1, GL, seg=5, rings=3)
    b.cyl((0, 0.3, -1.4), 0.25, 0.25, 0.1, 8, GD)
    P['fortune_tent'] = b.finish()

    b = B('hanging_lantern'); house_grads(b)
    b.box((0, 2.0, 0), (0.06, 1.0, 0.06), IR, j=0); b.ball((0, 2.55, 0), 0.07, GD, seg=5, rings=3)
    b.cyl((0, 1.45, 0), 0.22, 0.22, 0.1, 6, IR); b.cyl((0, 1.0, 0), 0.2, 0.2, 0.55, 6, GL, smooth=False)
    for k in range(6):
        a = k * math.pi / 3 + math.pi / 6; b.limb((math.cos(a) * 0.22, 0.73, math.sin(a) * 0.22), (math.cos(a) * 0.22, 1.28, math.sin(a) * 0.22), 0.025, 0.025, IR, segs=4)
    b.cyl((0, 0.7, 0), 0.22, 0.14, 0.1, 6, IR); b.cyl((0, 1.62, 0), 0.34, 0.0, 0.22, 6, GD); b.ball((0, 1.8, 0), 0.06, GD, seg=5, rings=3)
    b.ball((0, 0.55, 0), 0.07, GD, seg=5, rings=3)
    P['hanging_lantern'] = b.finish()

    # ---- potions
    b = B('herb_garden_box'); house_grads(b)
    b.rbox((0, 0.3, 0), (2.4, 0.6, 1.1), W, r=0.07, j=0.006)
    for sx in (-1, 1): b.box((sx * 1.1, 0.3, 0.57), (0.12, 0.62, 0.05), TM, j=0)
    b.box((0, 0.58, 0), (2.2, 0.06, 0.95), TM, j=0)
    b.grads[L] = g_lin(0.5, 1.4, (0.55, 0.75, 0.6), (1, 1, 0.85)); b.grads[LL] = b.grads[L]
    for k in range(6):
        x = -0.95 + k * 0.38; z = 0.2 * (-1) ** k
        b.blob((x, 0.85, z), 0.28 + 0.04 * (k % 3), L if k % 2 else LL, sq=(1, 1.1, 1), seg=7, rings=5, amp=0.14, seed=k)
    for k, c in enumerate((FP, CW, FP, GD)):
        fh(b, -0.8 + k * 0.55, 1.15, 0.28 * (-1) ** k, c, 1.1)
    b.cyl((1.0, 0.95, 0.6), 0.0, 0.03, 0.0001, 3, W) if False else None
    b.box((-1.0, 1.0, 0.6), (0.4, 0.22, 0.04), CW, Rx(-0.2), j=0.004)
    b.box((-1.0, 0.75, 0.6), (0.04, 0.35, 0.04), W, j=0)
    P['herb_garden_box'] = b.finish()

    b = B('potion_shelf_cart'); house_grads(b)
    b.rbox((0, 0.8, 0), (2.2, 0.16, 1.1), W, r=0.05, j=0.004); b.rbox((0, 0.4, 0), (2.0, 0.5, 0.9), W, r=0.06)
    for sz in (-1, 1):
        b.lathe([(0.4, -0.05), (0.5, -0.05), (0.5, 0.05), (0.4, 0.05)], TM, segs=8, pos=(0, 0.5, sz * 0.58), M=Rx(math.pi / 2), closed=True)
        b.cyl((0, 0.5, sz * 0.58), 0.1, 0.1, 0.14, 6, GD, axis='z')
    for sx in (-1, 1): b.limb((sx * 1.0, 0.8, -0.45), (sx * 1.0, 2.4, -0.45), 0.07, 0.07, W, segs=5)
    for y in (1.35, 1.9): b.rbox((0, y, -0.4), (2.1, 0.08, 0.5), W, r=0.03)
    b.box((0, 2.25, -0.4), (2.2, 0.08, 0.6), AB, j=0)
    b.rbox((0, 2.45, -0.4), (2.3, 0.14, 0.8), AB, r=0.04)
    cols = (FR, AB, LL, FP, GD, RG)
    for row, y in enumerate((0.88, 1.43, 1.98)):
        for k in range(4):
            x = -0.8 + k * 0.4; c = cols[(k + row * 2) % 6]
            b.ball((x, y + 0.18, -0.4 + (0.1 if row == 0 else 0)), 0.16, c, sq=(1, 1.0, 1), seg=6, rings=4)
            b.cyl((x, y + 0.4, -0.4 + (0.1 if row == 0 else 0)), 0.05, 0.05, 0.12, 4, W, caps=False)
    b.strut((1.0, 0.85, 0.35), (2.3, 0.55, 0.3), 0.1, 0.1, W, r=0.03, j=0); b.strut((1.0, 0.85, -0.2), (2.3, 0.55, -0.2), 0.1, 0.1, W, r=0.03, j=0)
    P['potion_shelf_cart'] = b.finish()

    b = B('cauldron'); house_grads(b)
    for k in range(3):
        a = k * 2.1 + 0.5; b.limb((math.cos(a) * 0.55, 0.02, math.sin(a) * 0.55), (math.cos(a) * 0.45, 0.4, math.sin(a) * 0.45), 0.08, 0.1, IR, segs=5)
    b.lathe([(0, 0.3), (0.55, 0.35), (0.85, 0.7), (0.95, 1.05), (0.82, 1.25), (0.76, 1.2), (0.84, 1.02), (0.76, 0.75), (0, 0.5)][::-1][::-1], IR, segs=12, smooth=True) if False else b.lathe([(0, 0.28), (0.5, 0.3), (0.85, 0.65), (0.95, 1.0), (0.98, 1.2), (0.8, 1.2), (0, 1.1)], IR, segs=12, smooth=True)
    b.lathe([(0, 1.12), (0.82, 1.14), (0.84, 1.2), (0.0, 1.2)], LL, segs=12, smooth=False)
    b.ball((0.3, 1.26, 0.2), 0.16, LL, sq=(1, 0.6, 1), seg=6, rings=4); b.ball((-0.3, 1.25, -0.3), 0.12, GL, sq=(1, 0.6, 1), seg=6, rings=4)
    b.lathe([(0.98, 1.1), (1.06, 1.15), (1.06, 1.28), (0.98, 1.3), (0.9, 1.2)], IR, segs=12, smooth=True, closed=True)
    for sx in (-1, 1): b.ball((sx * 1.05, 0.95, 0), 0.1, IR, seg=6, rings=4)
    b.limb((-0.8, 0.0, 1.0), (-0.1, 1.4, 0.2), 0.05, 0.05, W, segs=5)
    for k in range(3):
        a = k * 2.1 + 1; b.limb((math.cos(a) * 0.9, 0.05, math.sin(a) * 0.9), (math.cos(a) * 0.8, 0.5, math.sin(a) * 0.8), 0.06, 0.1, W, segs=5)
    P['cauldron'] = b.finish()

    # ---- armory
    b = B('shield_rack'); house_grads(b)
    for sx in (-1, 1): b.limb((sx * 1.5, 0, 0), (sx * 1.5, 1.7, 0), 0.1, 0.09, W, segs=6); b.ball((sx * 1.5, 1.78, 0), 0.13, GD, seg=6, rings=4)
    b.rbox((0, 1.6, 0), (3.2, 0.12, 0.16), W, r=0.04); b.rbox((0, 0.12, 0), (3.4, 0.24, 0.7), W, r=0.05)
    b.rbox((0, 0.35, 0.08), (3.0, 0.1, 0.12), W, r=0.03)
    for k, (x, c) in enumerate(((-1.0, RB), (0.0, FR), (1.0, AB))):
        b.push(T((x, 0.95, 0.15)))
        b.prism([(-0.42, 0.5), (0.42, 0.5), (0.42, -0.05), (0.0, -0.55), (-0.42, -0.05)], 0.0, 0.1, GD)
        b.prism([(-0.34, 0.42), (0.34, 0.42), (0.34, -0.02), (0.0, -0.46), (-0.34, -0.02)], 0.1, 0.15, c)
        b.prism([(0, 0.25), (0.1, 0), (0, -0.25), (-0.1, 0)], 0.15, 0.19, GD)
        b.pop()
    P['shield_rack'] = b.finish()

    b = B('armor_stand'); house_grads(b)
    b.cyl((0, 0.1, 0), 0.6, 0.6, 0.2, 8, W); b.limb((0, 0.2, 0), (0, 1.5, 0), 0.07, 0.07, W, segs=6)
    for sx in (-1, 1): b.ball((sx * 0.25, 0.7, 0), 0.19, IR, sq=(1, 1.7, 1), seg=7, rings=5)
    b.ball((0, 1.5, 0), 1.0, S, sq=(0.5, 0.6, 0.38), seg=9, rings=6); b.rbox((0, 1.2, 0), (0.78, 0.16, 0.5), GD, r=0.05)
    b.cyl((0, 1.0, 0), 0.38, 0.5, 0.4, 8, RB)
    for sx in (-1, 1): b.ball((sx * 0.62, 1.9, 0), 0.26, S, seg=7, rings=5); b.limb((sx * 0.62, 1.85, 0), (sx * 0.72, 1.3, 0.15), 0.12, 0.1, S, segs=6)
    b.ball((0, 2.35, 0), 0.34, S, seg=9, rings=6); b.box((0, 2.35, 0.3), (0.4, 0.07, 0.08), IR, j=0)
    b.ball((0, 2.82, -0.05), 1.0, FR, sq=(0.08, 0.28, 0.3), seg=6, rings=4)
    b.rbox((-0.9, 1.1, 0.3), (0.12, 1.7, 0.05), S, r=0.02, rot=Rz(0.1)); b.rbox((-0.9, 0.6, 0.3), (0.4, 0.1, 0.08), GD, r=0.03, rot=Rz(0.1))
    P['armor_stand'] = b.finish()

    b = B('banner_pole_red'); house_grads(b)
    b.rbox((0, 0.18, 0), (0.7, 0.36, 0.7), SD, r=0.08); b.limb((0, 0, 0), (0, 5.2, 0), 0.1, 0.07, TM, segs=6)
    b.ball((0, 5.28, 0), 0.17, GD, seg=7, rings=5); b.strut((-0.85, 4.65, 0), (0.85, 4.65, 0), 0.1, 0.1, TM, r=0.03, j=0)
    for sx in (-1, 1): b.ball((sx * 0.9, 4.65, 0), 0.11, GD, seg=6, rings=4)
    b.cloth(lambda u, v: V(0.78 * (u - 0.5) * 2 * (1 - 0.1 * v), 4.6 - 2.4 * v, 0.14 + 0.07 * math.sin(v * 5 + u * 2)), 4, 6, FR, th=0.06)
    b.cloth(lambda u, v: V(0.88 * (u - 0.5) * 2 * (1 - 0.1 * v), 4.62 - 2.46 * v, 0.1 + 0.07 * math.sin(v * 5 + u * 2)), 4, 6, GD, th=0.04)
    b.prism([(-0.3, 4.0), (0.3, 4.0), (0.0, 2.8)], 0.23, 0.27, GD)
    b.prism([(-0.5, 4.3), (-0.3, 4.0), (0.0, 4.15)], 0.23, 0.27, GD) if False else None
    P['banner_pole_red'] = b.finish()

    # ---- warehouse
    b = B('crate_stack_big'); house_grads(b)
    def crate(x, y, z, s, yaw):
        b.push(T((x, y, z)) @ Ry(yaw))
        b.rbox((0, s / 2, 0), (s, s, s), W, r=0.07, j=0.01)
        for sx in (-1, 1):
            for sz in (-1, 1): b.box((sx * s / 2, s / 2, sz * s / 2), (0.12, s + 0.02, 0.12), TM, j=0)
        for yy in (0.18, s - 0.18): b.box((0, yy, s / 2 + 0.02), (s * 0.9, 0.1, 0.05), TM, j=0)
        b.strut((-s * 0.4, 0.2, s / 2 + 0.03), (s * 0.4, s - 0.2, s / 2 + 0.03), 0.09, 0.04, TM, r=0.01, j=0)
        b.pop()
    crate(-0.9, 0, 0, 1.4, 0.05); crate(0.7, 0, 0.1, 1.3, -0.1); crate(-0.1, 1.4, 0.0, 1.2, 0.3); crate(1.0, 1.3, 0.2, 0.9, -0.4); crate(-1.2, 1.4, 0.2, 0.85, 0.7)
    b.cyl((1.9, 0.5, 0.9), 0.4, 0.4, 1.0, 8, W); b.cyl((1.9, 0.25, 0.9), 0.42, 0.42, 0.08, 8, TM); b.cyl((1.9, 0.75, 0.9), 0.42, 0.42, 0.08, 8, TM)
    P['crate_stack_big'] = b.finish()

    b = B('cart_hay'); house_grads(b)
    b.rbox((0, 0.85, 0), (2.4, 0.2, 1.4), W, r=0.05, j=0.004)
    for sz in (-1, 1):
        b.rbox((0, 1.2, sz * 0.7), (2.4, 0.5, 0.1), W, r=0.03, j=0.004)
        b.lathe([(0.55, -0.06), (0.67, -0.06), (0.67, 0.06), (0.55, 0.06)], TM, segs=10, pos=(0, 0.62, sz * 0.82), M=Rx(math.pi / 2), closed=True)
        b.cyl((0, 0.62, sz * 0.82), 0.12, 0.12, 0.16, 6, GD, axis='z')
        b.box((0, 0.62, sz * 0.82), (1.1, 0.08, 0.06), W, j=0); b.box((0, 0.62, sz * 0.82), (0.08, 1.1, 0.06), W, j=0)
    for sx in (-1, 1): b.rbox((sx * 1.15, 1.2, 0), (0.1, 0.5, 1.4), W, r=0.03)
    for sz in (-1, 1): b.strut((1.1, 0.9, sz * 0.4), (2.9, 0.6, sz * 0.4), 0.12, 0.12, W, r=0.03, j=0)
    b.grads[GD] = g_lin(0.8, 2.4, (0.85, 0.8, 0.7), (1, 1, 1))
    b.blob((0, 1.6, 0), 1.0, GD, sq=(1.15, 0.7, 0.72), seg=10, rings=6, amp=0.1, seed=4)
    b.blob((-0.5, 1.95, 0.1), 0.5, GD, sq=(1.1, 0.7, 0.9), seg=8, rings=5, amp=0.12, seed=8)
    for k in range(3): b.limb((0.3 + 0.2 * k, 2.1, 0.3), (0.8 + 0.2 * k, 2.4, 0.2 + 0.2 * k), 0.025, 0.0, GD, segs=4)
    b.limb((1.6, 2.3, 0.2), (1.6, 1.1, 0.2), 0.04, 0.04, W, segs=4); b.rbox((1.6, 1.0, 0.2), (0.3, 0.12, 0.2), IR, r=0.03)
    P['cart_hay'] = b.finish()

    # ---- tech tower: small round tower, glowing aether lamp
    b = B('tech_tower_small'); house_grads(b)
    R_ = 1.7
    b.cyl((0, 0.3, 0), R_ + 0.25, R_ + 0.18, 0.6, 10, SD)
    b.cyl((0, 2.8, 0), R_, R_ - 0.15, 4.4, 10, S)
    for y in (1.3, 2.2, 3.1, 3.9): b.cyl((0, y, 0), R_ - 0.03 - 0.03 * y / 2, R_ - 0.03 - 0.03 * y / 2, 0.08, 10, SD, rot=Ry(b.rng.uniform(0, 0.4)), caps=False)
    b.push(T((0, 0, R_ - 0.05))); door(b, 0, 1.0, 1.9, steps=True); b.pop()
    for a, y in ((0.0, 3.2), (math.pi / 2, 2.0), (-math.pi / 2, 2.6), (math.pi, 3.4)):
        b.push(Ry(a) @ T((0, 0, R_ - 0.08)))
        b.box((0, y, 0.05), (0.62, 0.62, 0.1), SD, j=0.008); b.cyl((0, y, 0.1), 0.24, 0.24, 0.08, 8, RG, axis='z')
        b.pop()
    b.cyl((0, 5.15, 0), R_ + 0.45, R_ + 0.3, 0.45, 10, SD)
    b.cyl((0, 5.5, 0), R_ + 0.5, R_ + 0.5, 0.12, 10, SD)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        b.limb((math.cos(a) * 1.0, 5.55, math.sin(a) * 1.0), (math.cos(a) * 0.55, 6.75, math.sin(a) * 0.55), 0.09, 0.07, GD, segs=5)
    b.ball((0, 6.2, 0), 0.62, RG, seg=10, rings=7)
    b.ball((0, 6.2, 0), 0.35, CW, seg=8, rings=5)
    b.cyl((0, 5.75, 0), 0.4, 0.5, 0.25, 8, GD)
    b.lathe([(0.7, 6.95), (0.55, 7.05), (0.35, 7.45), (0.0, 7.6)][::-1], GD, segs=8, smooth=False) if False else b.cyl((0, 7.0, 0), 0.5, 0.0, 0.5, 8, GD)
    b.ball((0, 7.35, 0), 0.1, GD, seg=5, rings=3)
    for k in range(3):
        a = k * 2.1; b.ball((math.cos(a) * 1.5, 0.15, math.sin(a) * 1.5 + 0.8), 0.1, RG, seg=5, rings=3) if False else None
    P['tech_tower_small'] = b.finish()

    # ---- generic stick-on pieces
    b = B('window_flowerbox'); house_grads(b)
    b.rbox((0, 0.18, 0.2), (1.5, 0.34, 0.36), W, r=0.05, j=0.005)
    b.box((0, 0.1, 0.02), (1.3, 0.1, 0.06), TM, j=0)
    for sx in (-1, 1): b.strut((sx * 0.6, 0.0, 0.03), (sx * 0.6, 0.15, 0.3), 0.06, 0.05, IR, r=0.015, j=0)
    b.grads[L] = g_lin(0.2, 0.8, (0.6, 0.78, 0.6), (1, 1, 0.9))
    b.blob((0, 0.42, 0.2), 0.7, L, sq=(1.0, 0.25, 0.24), seg=10, rings=5, amp=0.06)
    for k in range(7): fh(b, -0.62 + k * 0.205, 0.56 + 0.05 * (k % 2), 0.2 + 0.04 * (-1) ** k, (FR, FP, GD, CW)[k % 4], 1.15)
    P['window_flowerbox'] = b.finish()

    b = B('shop_sign_hanging'); house_grads(b)
    b.rbox((0.75, 1.0, 0.1), (1.7, 0.16, 0.16), W, r=0.04, j=0)
    b.strut((0.1, 0.25, 0.1), (1.0, 0.95, 0.1), 0.1, 0.1, W, r=0.03, j=0)
    b.cyl((1.5, 0.0, 0.1), 0.0, 0.0001, 0.0001, 3, W) if False else None
    b.ball((1.62, 1.0, 0.1), 0.13, GD, seg=6, rings=4)
    for x in (0.55, 1.4): b.box((x, 0.75, 0.1), (0.04, 0.5, 0.04), IR, j=0)
    b.rbox((0.98, 0.2, 0.1), (1.25, 0.9, 0.12), W, r=0.06, j=0)
    b.rbox((0.98, 0.2, 0.17), (1.05, 0.7, 0.04), CW, r=0.03)
    b.rbox((0.98, -0.8, 0.205), (1.0, 0.65, 0.02), GD, r=0.01) if False else None
    for x in (0.55, 1.41): b.ball((x, 0.63, 0.1), 0.05, GD, seg=5, rings=3)
    P['shop_sign_hanging'] = b.finish()

    P['potted_plant_a'] = potted('potted_plant_a', 'a')
    P['potted_plant_b'] = potted('potted_plant_b', 'b')
    P['awning_red'] = awning('awning_red', AR)
    P['awning_green'] = awning('awning_green', AG)
    return P


# ================================================================= INTERIOR PIECES (front +z = into the room)
def clip_poly(pts, lo, hi):
    """Sutherland-Hodgman clip of a convex polygon to the square [lo, hi]^2"""
    def clip(P, inside, inter):
        out = []
        for i in range(len(P)):
            a, b_ = P[i], P[(i + 1) % len(P)]
            ia, ib = inside(a), inside(b_)
            if ia: out.append(a)
            if ia != ib: out.append(inter(a, b_))
        return out
    for ax in (0, 1):
        for sgn, lim in ((1, hi), (-1, lo)):
            ins = lambda p, ax=ax, sgn=sgn, lim=lim: (p[ax] - lim) * sgn <= 1e-9
            def inter(a, b_, ax=ax, lim=lim):
                t = (lim - a[ax]) / (b_[ax] - a[ax]); return (lerp(a[0], b_[0], t), lerp(a[1], b_[1], t))
            if pts: pts = clip(pts, ins, inter)
    return pts


def arched_wall(b, W, H, T, ow, oy0, oh, pointed=False):
    r = ow / 2; top = oy0 + oh; ys = top - r
    b.bx(-W / 2, -r, 0, H, -T / 2, T / 2, S, r=0.08); b.bx(r, W / 2, 0, H, -T / 2, T / 2, S, r=0.08)
    if oy0 > 0.01: b.bx(-r, r, 0, oy0, -T / 2, T / 2, S, r=0.06)
    b.bx(-r, r, top, H, -T / 2, T / 2, S, r=0.06)
    for sd in (-1, 1):
        arc = [(sd * r * math.cos(t), ys + r * math.sin(t)) for t in [math.pi / 2 * k / 6 for k in range(0, 6)]]
        pts = [(0, top), (sd * r, top), (sd * r, ys)] + arc[1:]
        if sd == -1: pts = pts[::-1]
        b.prism(pts, -T / 2, T / 2, S)
    nv = 9
    for k in range(nv):
        th = math.pi * (k + 0.5) / nv; rm = r + 0.17
        b.rbox((rm * math.cos(th), ys + rm * math.sin(th), T / 2 - 0.02), (0.34, math.pi * rm / nv * 0.93, 0.26), SD if k % 2 else S, r=0.05, rot=Rz(th), j=0.008)
    if oy0 > 0.01: b.rbox((0, oy0 - 0.06, T / 2 + 0.05), (ow + 0.5, 0.14, 0.34), SD, r=0.05)
    return r, ys


def wall_trim(b, W, H, T, gap=None):
    """plinth band + cornice + hand-laid course lines, split around an opening if gap=(x0, x1)"""
    segs = [(-W / 2, W / 2)] if gap is None else [(-W / 2, gap[0]), (gap[1], W / 2)]
    for a, c in segs:
        b.bx(a - 0.02, c + 0.02, 0, 0.45, -T / 2 - 0.08, T / 2 + 0.08, SD, r=0.07)
    b.bx(-W / 2 - 0.04, W / 2 + 0.04, H - 0.4, H, -T / 2 - 0.12, T / 2 + 0.12, SD, r=0.07)
    b.bx(-W / 2 - 0.06, W / 2 + 0.06, H - 0.52, H - 0.42, -T / 2 - 0.16, T / 2 + 0.16, GD, r=0.03, j=0)
    y = 1.4
    while y < H - 0.7:
        for a, c in segs:
            if gap is None or True:
                x0, x1 = a + 0.1, c - 0.1
                if x1 - x0 > 0.3: b.box(((x0 + x1) / 2, y, T / 2 + 0.01), (x1 - x0, 0.06, 0.05), SD, j=0.012)
        y += 0.95


def build_interiors():
    P = {}
    # ---------- floors (4x4, top at y 0)
    b = B('floor_tile_castle'); house_grads(b)
    b.rbox((0, -0.15, 0), (4.0, 0.3, 4.0), S, r=0.07)
    b.grads[SD] = g_lin(-0.3, 0.1, (0.85, 0.85, 0.9), (0.92, 0.92, 0.98))
    d = 4.0 / 6
    # dark diamonds: tile lattice (i, j) both even/odd mix -> checker of diamonds
    n = 0
    for i in range(-6, 7):
        for j in range(-6, 7):
            if (i + j) % 2: continue
            if ((i + j) // 2 + (i - j) // 2) % 2: continue
            cx, cz = i * d / 2, j * d / 2
            h = d / 2 * 0.9 * 1.0
            poly = clip_poly([(cx + h * 1.0, cz), (cx, cz + h), (cx - h, cz), (cx, cz - h)], -1.97, 1.97)
            if len(poly) < 3: continue
            # prism extrudes along z in xy plane; build manually in xz with height
            vs0 = [b.bm.verts.new((p[0], 0.0, p[1])) for p in poly]; vs1 = [b.bm.verts.new((p[0], 0.045, p[1])) for p in poly]
            k = len(poly)
            fs = [b.bm.faces.new(vs0[::-1]), b.bm.faces.new(vs1)] + [b.bm.faces.new((vs0[a_], vs0[(a_ + 1) % k], vs1[(a_ + 1) % k], vs1[a_])) for a_ in range(k)]
            for f in fs: f.material_index = MI[SD]
    P['floor_tile_castle'] = b.finish()

    b = B('floor_wood_planks'); house_grads(b)
    b.grads[W] = g_lin(-0.2, 0.1, (0.8, 0.78, 0.76), (1, 1, 1))
    b.rbox((0, -0.15, 0), (4.0, 0.3, 4.0), TM, r=0.05)
    for k in range(8):
        z = -1.75 + k * 0.5
        cut = [-0.6, 0.9, -1.1, 0.2, 1.1, -0.3, 0.7, -0.9][k]
        for a_, c_ in ((-2.0, cut), (cut, 2.0)):
            b.box(((a_ + c_) / 2, 0.0, z), (c_ - a_ - 0.03, 0.08 + 0.01 * (k % 3), 0.46), W, j=0.01)
    for k in range(8):
        cut = [-0.6, 0.9, -1.1, 0.2, 1.1, -0.3, 0.7, -0.9][k]
        for x in (cut - 0.2, cut + 0.2): b.box((x, 0.06, -1.75 + k * 0.5), (0.04, 0.02, 0.04), IR, j=0)
    P['floor_wood_planks'] = b.finish()

    b = B('floor_stone_cave')
    b.grads[SD] = lambda co, n: mixc((0.7, 0.66, 0.66), (1, 1, 0.98), clamp(0.5 + 0.5 * n.y))
    b.grads[S] = b.grads[SD]
    b.rbox((0, -0.15, 0), (4.0, 0.3, 4.0), SD, r=0.08)
    rr = random.Random(9)
    for i in range(3):
        for j in range(3):
            x = -1.33 + i * 1.33 + rr.uniform(-0.1, 0.1); z = -1.33 + j * 1.33 + rr.uniform(-0.1, 0.1)
            b.blob((x, 0.0, z), 0.62, SD if (i + j) % 2 else S, sq=(1.0, 0.12, 1.0), seg=8, rings=4, amp=0.12, seed=i * 3 + j)
    b.grads[LL] = g_lin(0, 0.2, (0.6, 0.8, 0.6), (1, 1, 0.9))
    for x, z in ((-1.5, 1.7), (1.6, -0.2), (0.2, 1.8)):
        b.blob((x, 0.03, z), 0.3, LL, sq=(1, 0.18, 0.8), seg=7, rings=4, amp=0.1, seed=x)
    for x, z in ((-0.5, -1.6), (1.0, 0.8), (-1.8, -0.1), (0.4, 0.3)):
        b.blob((x, 0.07, z), 0.12, SD, sq=(1, 0.7, 1), seg=6, rings=4, amp=0.15, seed=z)
    P['floor_stone_cave'] = b.finish()

    # ---------- walls (4 m sections, thickness 0.6, interior face +z)
    b = B('wall_castle_window'); house_grads(b)
    W_, H_, T_ = 4.0, 6.0, 0.6
    r, ys = arched_wall(b, W_, H_, T_, 1.8, 1.7, 3.7)
    wall_trim(b, W_, H_, T_, gap=None)
    b.arch(0, ys, r - 0.02, -0.12, 0.1, GL); b.box((0, (1.7 + ys) / 2, -0.01), (1.76, ys - 1.7, 0.2), GL)
    for x in (-0.45, 0.45): b.box((x, (1.7 + ys) / 2 + 0.4, 0.12), (0.07, ys - 1.7 + 0.9, 0.06), W, j=0)
    b.box((0, 2.9, 0.12), (1.8, 0.07, 0.06), W, j=0); b.box((0, ys - 0.2, 0.12), (1.8, 0.07, 0.06), W, j=0)
    P['wall_castle_window'] = b.finish()

    b = B('wall_castle_plain'); house_grads(b)
    b.bx(-2, 2, 0, 6, -0.3, 0.3, S, r=0.08)
    wall_trim(b, 4, 6, 0.6)
    for sx in (-1, 1):
        b.rbox((sx * 1.7, 2.9, 0.32), (0.5, 5.1, 0.16), S, r=0.05, j=0.006); b.rbox((sx * 1.7, 0.6, 0.36), (0.66, 0.3, 0.24), SD, r=0.05); b.rbox((sx * 1.7, 5.3, 0.36), (0.66, 0.3, 0.24), SD, r=0.05)
    b.rbox((0, 4.6, 0.31), (1.6, 0.14, 0.1), SD, r=0.03)
    P['wall_castle_plain'] = b.finish()

    b = B('wall_wood_house'); house_grads(b)
    b.grads[W] = g_lin(0, 3.2, (0.78, 0.75, 0.72), (1, 1, 1))
    b.rbox((0, 1.6, -0.1), (4.0, 3.2, 0.12), TM, r=0.03)
    for k in range(8):
        b.box((-1.75 + k * 0.5, 1.6 + 0.02 * (k % 3 - 1), 0.04), (0.47, 3.0, 0.14), W, j=0.012)
    for y in (0.22, 3.0): b.rbox((0, y, 0.14), (4.04, 0.28, 0.16), TM, r=0.04, j=0)
    b.rbox((0, 1.6, 0.14), (4.04, 0.16, 0.1), TM, r=0.03, j=0)
    for sx in (-1, 1): b.rbox((sx * 1.95, 1.6, 0.12), (0.2, 3.2, 0.2), TM, r=0.04, j=0)
    b.rbox((0, 0.55, 0.15), (4.0, 0.14, 0.12), GD, r=0.03, j=0) if False else None
    P['wall_wood_house'] = b.finish()

    b = B('wall_stone_chapel'); house_grads(b)
    W_, H_, T_ = 4.0, 5.6, 0.6
    r, ys = arched_wall(b, W_, H_, T_, 1.5, 1.6, 3.3)
    wall_trim(b, W_, H_, T_)
    stained(b, 1.46, 3.25, 1.6, 0.04)
    P['wall_stone_chapel'] = b.finish()

    b = B('pillar_castle'); house_grads(b)
    b.rbox((0, 0.2, 0), (1.5, 0.4, 1.5), SD, r=0.08); b.rbox((0, 0.55, 0), (1.15, 0.3, 1.15), S, r=0.06)
    b.cyl((0, 3.1, 0), 0.45, 0.4, 5.0, 10, S)
    for k in range(10):
        a = 2 * math.pi * k / 10
        b.box((math.sin(a) * 0.42, 3.1, math.cos(a) * 0.42), (0.07, 4.7, 0.07), SD, Ry(a), j=0)
    b.cyl((0, 5.7, 0), 0.52, 0.52, 0.16, 10, GD); b.cyl((0, 6.0, 0), 0.42, 0.7, 0.5, 10, S)
    b.rbox((0, 6.4, 0), (1.5, 0.3, 1.5), SD, r=0.08); b.cyl((0, 0.7, 0), 0.52, 0.52, 0.12, 10, GD)
    P['pillar_castle'] = b.finish()

    b = B('doorway_arch'); house_grads(b)
    r, ys = arched_wall(b, 4.0, 5.2, 0.6, 1.8, 0.0, 3.1)
    wall_trim(b, 4.0, 5.2, 0.6, gap=(-0.9, 0.9))
    b.rbox((0, 0.04, 0.0), (1.8, 0.08, 0.7), SD, r=0.03)
    b.arch(0, ys, r + 0.34, -0.1, 0.04, GD, 12) if False else None
    for sx in (-1, 1): b.rbox((sx * 0.98, 1.2, 0.34), (0.14, 2.4, 0.1), GD, r=0.03, j=0)
    P['doorway_arch'] = b.finish()

    # ---------- castle furniture
    b = B('throne'); house_grads(b)
    b.grads[GD] = g_lin(0, 3.2, (0.85, 0.8, 0.75), (1, 1, 1))
    b.rbox((0, 0.35, 0), (1.3, 0.7, 1.1), GD, r=0.08)
    b.rbox((0, 0.78, 0.05), (1.05, 0.24, 0.9), FR, r=0.1, smooth=False)
    b.rbox((0, 1.9, -0.45), (1.3, 2.4, 0.26), GD, r=0.08); b.arch(0, 3.1, 0.65, -0.58, -0.32, GD, 10)
    b.rbox((0, 1.85, -0.3), (0.95, 1.9, 0.12), FR, r=0.08)
    for sx in (-1, 1):
        b.rbox((sx * 0.7, 1.0, 0.0), (0.2, 0.5, 1.0), GD, r=0.06); b.ball((sx * 0.7, 1.3, 0.5), 0.14, GD, seg=7, rings=5)
        b.rbox((sx * 0.7, 3.4, -0.45), (0.2, 0.5, 0.26), GD, r=0.05); b.ball((sx * 0.7, 3.8, -0.45), 0.15, GD, seg=7, rings=5)
    b.ball((0, 3.85, -0.45), 0.2, GD, seg=7, rings=5); b.ball((0, 2.2, -0.31), 0.2, GL if False else GD, seg=6, rings=4)
    b.rbox((0, 0.06, 0.2), (1.5, 0.12, 1.4), FR, r=0.03)
    P['throne'] = b.finish()

    b = B('throne_dais_steps'); house_grads(b)
    for i, (w, d, h) in enumerate(((6.0, 5.0, 0.28), (5.0, 4.0, 0.56), (4.0, 3.0, 0.84))):
        zc = -2.5 + d / 2 + 0.0 * i - (0.0)
        b.rbox((0, h / 2, -2.5 + d / 2), (w, h, d), S if i % 2 == 0 else SD, r=0.07)
        b.rbox((0, h + 0.01, -2.5 + d - 0.04), (w - 0.1, 0.05, 0.1), GD, r=0.015, j=0)
    P['throne_dais_steps'] = b.finish()

    b = B('carpet_runner'); house_grads(b)
    b.grads[FR] = g_lin(0, 0.1, (0.85, 0.8, 0.8), (1, 1, 1))
    b.rbox((0, 0.03, 0), (1.0, 0.06, 4.0), FR, r=0.02, j=0)
    for sx in (-1, 1): b.rbox((sx * 0.43, 0.065, 0), (0.07, 0.03, 4.0), GD, r=0.01, j=0)
    for k in range(4):
        z = -1.5 + k
        b.prism([(0, 0.17), (0.17, 0), (0, -0.17), (-0.17, 0)], 0, 0, GD) if False else None
        vs0 = [b.bm.verts.new(p) for p in ((0, 0.062, z + 0.17), (0.17, 0.062, z), (0, 0.062, z - 0.17), (-0.17, 0.062, z))]
        vs1 = [b.bm.verts.new((p[0], 0.085, p[2])) for p in ((0, 0, z + 0.17), (0.17, 0, z), (0, 0, z - 0.17), (-0.17, 0, z))]
        fs = [b.bm.faces.new(vs0[::-1]), b.bm.faces.new(vs1)] + [b.bm.faces.new((vs0[a_], vs0[(a_ + 1) % 4], vs1[(a_ + 1) % 4], vs1[a_])) for a_ in range(4)]
        for f in fs: f.material_index = MI[GD]
    P['carpet_runner'] = b.finish()

    b = B('banner_wall_red'); house_grads(b)
    b.rbox((0, 3.35, 0.1), (1.9, 0.12, 0.12), GD, r=0.04, j=0)
    for sx in (-1, 1): b.ball((sx * 1.0, 3.35, 0.1), 0.12, GD, seg=6, rings=4)
    def bn(off, wd):
        def fn(u, v):
            bot = -0.2 - 0.5 * (1 - abs(2 * u - 1))
            return V((wd * (u - 0.5) * 2, lerp(3.3, 0.45 + bot * 0.0 + (1 - abs(2 * u - 1)) * 0.0 - 0.0, v) if False else 3.3 - v * (3.0 - 0.55 * (1 - abs(2 * u - 1))), 0.1 + off + 0.05 * math.sin(v * 6 + u * 2)))
        return fn
    b.cloth(bn(0.0, 0.8), 6, 6, FR, th=0.05)
    b.cloth(bn(-0.03, 0.9), 6, 6, GD, th=0.04)
    b.prism([(0, 2.5), (0.3, 2.05), (0, 1.6), (-0.3, 2.05)], 0.2, 0.24, GD)
    P['banner_wall_red'] = b.finish()

    b = B('painting_frame'); house_grads(b)
    b.rbox((0, 1.0, 0), (1.7, 2.1, 0.14), GD, r=0.08)
    b.rbox((0, 1.0, 0.07), (1.4, 1.8, 0.05), CW, r=0.03)
    b.box((0, 1.5, 0.1), (1.34, 0.8, 0.02), AB); b.box((0, 0.72, 0.1), (1.34, 0.74, 0.02), LL)
    b.blob((-0.3, 1.0, 0.11), 0.6, L, sq=(1.3, 0.5, 0.05), seg=8, rings=4, amp=0.05)
    b.ball((0.35, 1.7, 0.115), 0.17, GD, sq=(1, 1, 0.1), seg=8, rings=4)
    for k, c in enumerate((FR, FP, CW, GD)): fh(b, -0.35 + k * 0.25, 0.65, 0.14, c, 0.7)
    for sx in (-1, 1): b.ball((sx * 0.8, 2.0, 0.07), 0.1, GD, seg=6, rings=4)
    P['painting_frame'] = b.finish()

    b = B('light_shaft')
    b.grads[GL] = lambda co, n: (1.0, 0.96, 0.8, clamp(0.5 * (co.y / 4.5) ** 1.3))
    def beam(wx, wz):
        """slanted translucent plane from the window (z 0, y 4.5) down into the room (z 3.2, y 0)"""
        return lambda u, v: V(wx * (u - 0.5) * 2 * lerp(0.9, 1.25, v), lerp(4.5, 0.0, v), lerp(0.0, 3.2, v) + wz * (u - 0.5) * 2)
    for flip in (False, True):
        b.surf(beam(1.0, 0.0), 1, 5, GL, flip=flip)
        b.surf(beam(0.0, 0.6), 1, 5, GL, flip=flip)
    P['light_shaft'] = b.finish()

    # ---------- chapel
    b = B('pew'); house_grads(b)
    b.rbox((0, 0.55, 0), (3.0, 0.1, 0.62), W, r=0.04, j=0.004)
    b.rbox((0, 1.15, -0.32), (3.0, 0.9, 0.1), W, r=0.04, j=0.004); b.rbox((0, 1.62, -0.32), (3.0, 0.08, 0.16), TM, r=0.03)
    for sx in (-1, 1):
        b.rbox((sx * 1.5, 0.6, -0.05), (0.14, 1.2, 0.8), W, r=0.05); b.ball((sx * 1.5, 1.28, -0.2), 0.13, GD, seg=6, rings=4)
    b.rbox((0, 0.12, 0.5), (2.9, 0.2, 0.3), TM, r=0.04); b.rbox((0, 0.3, 0.5), (2.9, 0.1, 0.3), FR, r=0.04)
    P['pew'] = b.finish()

    b = B('altar'); house_grads(b)
    b.rbox((0, 0.15, 0), (2.8, 0.3, 1.4), SD, r=0.07); b.rbox((0, 0.65, 0), (2.4, 0.8, 1.0), S, r=0.08)
    b.rbox((0, 1.1, 0), (2.7, 0.14, 1.2), SD, r=0.05)
    b.box((0, 0.72, 0.52), (2.0, 0.55, 0.04), CW, j=0); b.box((0, 0.98, 0.52), (2.0, 0.07, 0.05), GD, j=0)
    b.cloth(lambda u, v: V(2.0 * (u - 0.5), 1.18 - 0.5 * v, 0.62 + 0.06 * math.sin(u * 14) * v), 8, 3, CW, th=0.04) if False else None
    b.rbox((0, 1.7, -0.1), (0.14, 1.0, 0.1), GD, r=0.03); b.rbox((0, 1.95, -0.1), (0.6, 0.14, 0.1), GD, r=0.03); b.rbox((0, 1.2, -0.1), (0.4, 0.1, 0.3), GD, r=0.03)
    for sx in (-1, 1):
        b.cyl((sx * 0.9, 1.4, 0.0), 0.1, 0.1, 0.4, 6, CW); b.cyl((sx * 0.9, 1.19, 0.0), 0.16, 0.16, 0.06, 6, GD); b.cyl((sx * 0.9, 1.7, 0.0), 0.0, 0.05, 0.0001, 3, GL) if False else b.limb((sx * 0.9, 1.6, 0), (sx * 0.9, 1.78, 0), 0.05, 0.0, GL, segs=5)
    P['altar'] = b.finish()

    b = B('candle_stand'); house_grads(b)
    b.cyl((0, 0.08, 0), 0.34, 0.3, 0.16, 8, GD); b.limb((0, 0, 0), (0, 1.5, 0), 0.07, 0.05, GD, segs=6)
    b.ball((0, 0.6, 0), 0.11, GD, seg=6, rings=4); b.ball((0, 1.1, 0), 0.1, GD, seg=6, rings=4)
    for k in range(3):
        a = k * 2 * math.pi / 3
        px, pz = math.cos(a) * 0.5, math.sin(a) * 0.5
        b.tube([V((0, 1.35, 0)), V((px * 0.7, 1.25, pz * 0.7)), V((px, 1.5, pz))], [0.035, 0.03, 0.03], GD, segs=4, cap=False, smooth=False)
        b.cyl((px, 1.55, pz), 0.1, 0.07, 0.1, 6, GD); b.cyl((px, 1.8, pz), 0.07, 0.07, 0.4, 6, CW); b.limb((px, 2.0, pz), (px, 2.18, pz), 0.05, 0.0, GL, segs=5)
    b.cyl((0, 1.8, 0), 0.07, 0.07, 0.5, 6, CW); b.limb((0, 2.05, 0), (0, 2.25, 0), 0.05, 0.0, GL, segs=5)
    P['candle_stand'] = b.finish()

    b = B('stained_glass_window')
    house_grads(b)
    b.rbox((0, 1.9, 0), (1.9, 3.8, 0.18), S, r=0.08) if False else None
    stained(b, 1.5, 3.4, 0.2, 0.2, frame=True)
    P['stained_glass_window'] = b.finish()
    P.update(build_interiors2())
    return P


def stained(b, w, h, y0, z, frame=False):
    """tall pointed-arch window of coloured panes (lead lines in iron)"""
    r = w / 2; ys = y0 + h - r
    if frame: b.rbox((0, (y0 + ys) / 2 - 0.08, z - 0.04), (w + 0.4, ys - y0 + 0.2, 0.2), S, r=0.07)
    if frame: b.arch(0, ys - 0.08, r + 0.2, z - 0.14, z + 0.06, S, 10)
    cols = (AB, FP, AG, GD, FR, AB)
    nc, nr = 3, 5
    ph = (ys - y0) / nr
    for jx in range(nc):
        for jy in range(nr):
            x = -r + (jx + 0.5) * w / nc
            m = cols[(jx * 2 + jy) % 6]
            b.box((x, y0 + (jy + 0.5) * ph, z + 0.02), (w / nc - 0.05, ph - 0.05, 0.05), m, j=0)
    for k in range(5):
        a0 = math.pi * k / 5; a1 = math.pi * (k + 1) / 5
        ab = (a0 + a1) / 2
        rr = r * 0.62
        b.box((math.cos(ab) * rr, ys + math.sin(ab) * rr, z + 0.02), (r * 0.7, r * 0.55, 0.05), cols[(k + 2) % 6], Rz(ab - math.pi / 2), j=0)
    b.cyl((0, ys + r * 0.3, z + 0.05), 0.14, 0.14, 0.05, 8, GL, axis='z')
    for jx in range(1, nc): b.box((-r + jx * w / nc, (y0 + ys) / 2, z + 0.06), (0.05, ys - y0, 0.03), IR, j=0)
    for jy in range(0, nr + 1): b.box((0, y0 + jy * ph, z + 0.06), (w, 0.05, 0.03), IR, j=0)
    b.arch(0, ys, r + 0.02, z - 0.02, z + 0.0, IR, 10) if False else None


def fire(b, x, y, z, s=1.0):
    for (r, h, m, yo) in ((0.3, 0.9, FR, 0.0), (0.21, 0.7, GD, 0.02), (0.11, 0.45, GL, 0.04)):
        b.lathe([(0, y + yo * s), (r * 0.9 * s, y + (yo + 0.04) * s), (r * s, y + (yo + h * 0.3) * s), (r * 0.6 * s, y + (yo + h * 0.66) * s), (0, y + (yo + h) * s)],
                m, segs=6, pos=(x, 0, z), smooth=True)


def fireplace(name, big):
    b = B(name); house_grads(b)
    w = 3.2 if big else 2.4; h = 2.4 if big else 1.9
    b.rbox((0, 0.15, 0.2), (w + 0.4, 0.3, 1.4), SD, r=0.07)
    b.rbox((-w / 2 + 0.2, h / 2, 0), (0.55, h, 1.0), S, r=0.08); b.rbox((w / 2 - 0.2, h / 2, 0), (0.55, h, 1.0), S, r=0.08)
    b.rbox((0, h + 0.2, 0), (w + 0.3, 0.4, 1.2), SD, r=0.07); b.rbox((0, h + 0.5, 0.0), (w + 0.5, 0.18, 1.3), W, r=0.05)
    b.rbox((0, h + 1.6, -0.2), (w - 0.4, 2.0, 0.7), S, r=0.08)
    for y in (h + 1.0, h + 1.8, h + 2.4):
        if y < h + 2.5: b.box((0, y, 0.18), (w - 0.5, 0.06, 0.05), SD, j=0.01)
    b.box((0, h / 2 - 0.1, -0.35), (w - 0.8, h - 0.4, 0.1), GL)
    fire(b, 0, 0.3, 0.05, 1.0 if big else 0.8)
    b.limb((-0.55, 0.38, 0.05), (0.55, 0.38, 0.1), 0.1, 0.1, W, segs=6); b.limb((-0.45, 0.4, -0.2), (0.4, 0.4, 0.3), 0.09, 0.09, TM, segs=6)
    for sx in (-1, 1): b.box((sx * (w / 2 - 0.65), 0.45, 0.4), (0.1, 0.35, 0.1), IR, j=0)
    b.box((0, 0.35, 0.45), (w - 1.1, 0.07, 0.07), IR, j=0)
    for k, x in enumerate((-0.9, -0.3, 0.9)):
        if x * x > (w / 2 - 0.5) ** 2: continue
        b.cyl((x, h + 0.78, 0.05), 0.12, 0.1, 0.35, 6, [AB, FP, GD][k % 3])
    P_ = None
    return b.finish()


def build_interiors2():
    P = {}
    # ---------- tavern
    b = B('bar_counter'); house_grads(b)
    b.rbox((0, 0.55, 0), (3.6, 1.1, 0.9), W, r=0.07, j=0.004)
    for k in range(7): b.box((-1.5 + k * 0.5, 0.55, 0.46), (0.44, 1.0, 0.05), W if k % 2 else TM, j=0.01)
    b.rbox((0, 1.16, 0.0), (3.9, 0.14, 1.15), TM, r=0.05)
    b.limb((-1.7, 0.25, 0.6), (1.7, 0.25, 0.6), 0.05, 0.05, IR, segs=5)
    for sx in (-1, 1): b.limb((sx * 1.7, 0.0, 0.6), (sx * 1.7, 0.3, 0.6), 0.05, 0.05, IR, segs=5)
    for x in (-1.0, 0.2, 1.2): b.cyl((x, 1.32, 0.15), 0.12, 0.1, 0.22, 7, W); b.cyl((x, 1.45, 0.15), 0.12, 0.12, 0.05, 7, CW)
    b.ball((1.5, 1.34, -0.1), 0.18, GD, sq=(1, 0.7, 1), seg=7, rings=4)
    P['bar_counter'] = b.finish()

    b = B('stool'); house_grads(b)
    b.cyl((0, 0.78, 0), 0.32, 0.3, 0.14, 8, W); b.cyl((0, 0.86, 0), 0.3, 0.3, 0.04, 8, FR)
    for k in range(3):
        a = k * 2.09 + 0.4; b.limb((math.cos(a) * 0.22, 0.72, math.sin(a) * 0.22), (math.cos(a) * 0.34, 0.0, math.sin(a) * 0.34), 0.05, 0.04, W, segs=5)
    b.cyl((0, 0.3, 0), 0.26, 0.26, 0.04, 8, W)
    P['stool'] = b.finish()

    b = B('round_table'); house_grads(b)
    b.cyl((0, 0.95, 0), 0.9, 0.9, 0.12, 12, W); b.cyl((0, 1.03, 0), 0.9, 0.9, 0.04, 12, TM, caps=False)
    b.cyl((0, 0.5, 0), 0.14, 0.18, 0.9, 7, TM)
    for k in range(3):
        a = k * 2.09; b.limb((0, 0.2, 0), (math.cos(a) * 0.6, 0.04, math.sin(a) * 0.6), 0.09, 0.07, TM, segs=5)
    b.cyl((0.3, 1.14, 0.2), 0.1, 0.09, 0.2, 7, W); b.cyl((0.3, 1.26, 0.2), 0.1, 0.1, 0.05, 7, CW); b.cyl((-0.4, 1.12, -0.2), 0.1, 0.1, 0.16, 6, GD)
    P['round_table'] = b.finish()

    b = B('barrel_tap'); house_grads(b)
    b.rbox((0, 0.2, 0), (1.3, 0.4, 0.9), W, r=0.05)
    b.ball((0, 0.95, 0), 1.0, W, sq=(0.6, 0.6, 0.7), seg=10, rings=7, rot=Rx(0) @ Ry(0))
    b.lathe([(0.0, -0.55), (0.5, -0.52), (0.62, -0.25), (0.66, 0.0), (0.62, 0.25), (0.5, 0.52), (0.0, 0.55)], W, segs=10, pos=(0, 0.95, 0), M=Rx(math.pi / 2), smooth=True)
    for y in (-0.38, 0.38): b.lathe([(0.0, y - 0.05), (0.6, y - 0.05), (0.64, y + 0.05), (0.0, y + 0.05)], IR, segs=10, pos=(0, 0.95, 0), M=Rx(math.pi / 2), smooth=False)
    b.cyl((0, 0.85, 0.66), 0.07, 0.07, 0.3, 6, GD, axis='z'); b.box((0, 0.74, 0.8), (0.07, 0.2, 0.07), GD, j=0); b.ball((0, 0.62, 0.8), 0.1, FR, seg=5, rings=4)
    b.cyl((0.1, 0.1, 0.9), 0.14, 0.12, 0.24, 6, W)
    P['barrel_tap'] = b.finish()

    P['fireplace'] = fireplace('fireplace', True)
    P['hearth'] = fireplace('hearth', False)

    b = B('hanging_pot'); house_grads(b)
    b.rbox((0, 2.2, 0), (0.2, 0.2, 0.2), IR, r=0.03)
    b.limb((0, 2.2, 0), (0, 2.8, 0), 0.07, 0.07, IR, segs=5) if False else None
    b.box((0, 2.9, 0), (0.1, 0.9, 0.1), IR, j=0)
    b.box((0.55, 3.35, 0), (1.2, 0.1, 0.1), IR, j=0); b.strut((0.0, 2.5, 0), (0.95, 3.3, 0), 0.07, 0.07, IR, r=0.02, j=0)
    for k in range(4): b.cyl((0.95, 3.0 - k * 0.12, 0), 0.04, 0.04, 0.1, 4, IR)
    b.lathe([(0, 1.9), (0.42, 1.95), (0.58, 2.25), (0.6, 2.55), (0.54, 2.65), (0, 2.65)], IR, segs=10, pos=(0.95, 0, 0), smooth=True)
    b.lathe([(0, 2.6), (0.52, 2.62), (0.52, 2.67), (0, 2.67)], LL, segs=10, pos=(0.95, 0, 0))
    b.tube([V((0.4, 2.62, 0)), V((0.95, 3.05, 0)), V((1.5, 2.62, 0))], [0.025] * 3, IR, segs=4, cap=False, smooth=False)
    P['hanging_pot'] = b.finish()

    b = B('mug_cluster'); house_grads(b)
    b.rbox((0, 0.03, 0), (0.9, 0.06, 0.7), W, r=0.02)
    for k, (x, z) in enumerate(((-0.25, -0.12), (0.15, -0.2), (0.28, 0.12), (-0.12, 0.18))):
        b.cyl((x, 0.2, z), 0.1, 0.09, 0.28, 7, W if k % 2 else GD); b.cyl((x, 0.36, z), 0.1, 0.1, 0.06, 7, CW)
        b.rbox((x + 0.13, 0.2, z), (0.04, 0.14, 0.05), W if k % 2 else GD, r=0.01, j=0)
    P['mug_cluster'] = b.finish()

    b = B('tavern_shelf'); house_grads(b)
    for y in (0.6, 1.4): b.rbox((0, y, 0.2), (2.6, 0.1, 0.45), W, r=0.03, j=0.004)
    for sx in (-1, 1): b.strut((sx * 1.15, 0.2, 0.0), (sx * 1.15, 0.55, 0.35), 0.07, 0.07, TM, r=0.02, j=0); b.strut((sx * 1.15, 1.0, 0.0), (sx * 1.15, 1.35, 0.35), 0.07, 0.07, TM, r=0.02, j=0)
    b.rbox((0, 1.0, 0.0), (2.6, 1.6, 0.06), TM, r=0.02)
    for k, c in enumerate((AB, FR, LL, GD, AB)):
        x = -1.05 + k * 0.5
        b.ball((x, 1.78, 0.2), 0.16, c, sq=(1, 1.1, 1), seg=7, rings=5); b.cyl((x, 1.98, 0.2), 0.05, 0.05, 0.14, 5, W, caps=False)
    for k in range(4):
        x = -0.9 + k * 0.6; b.cyl((x, 0.8, 0.2), 0.12, 0.1, 0.22, 7, W if k % 2 else GD); b.cyl((x, 0.92, 0.2), 0.12, 0.12, 0.05, 7, CW)
    b.ball((1.0, 0.75, 0.2), 0.2, W, sq=(1.1, 0.8, 0.9), seg=7, rings=5)
    P['tavern_shelf'] = b.finish()

    # ---------- house
    b = B('bed_cosy'); house_grads(b)
    b.rbox((0, 0.35, 0), (2.0, 0.3, 3.0), W, r=0.07)
    for sx in (-1, 1):
        b.rbox((sx * 0.95, 0.5, -1.45), (0.14, 1.2, 0.14), W, r=0.04); b.rbox((sx * 0.95, 0.2, 1.45), (0.14, 0.45, 0.14), W, r=0.04)
        b.ball((sx * 0.95, 1.15, -1.45), 0.12, GD, seg=6, rings=4)
    b.rbox((0, 0.85, -1.5), (2.0, 1.3, 0.12), W, r=0.05); b.arch(0, 1.5, 1.0, -1.56, -1.44, W, 8)
    b.rbox((0, 0.64, 0.05), (1.8, 0.3, 2.7), CW, r=0.1)
    def quilt(u, v): return V(1.9 * (u - 0.5), 0.8 + 0.05 * math.sin(u * 8) * math.sin(v * 5), lerp(-0.4, 1.4, v))
    b.cloth(quilt, 4, 6, AB, th=0.12, matfn=lambda i, j: (AB, FP, CW, GD)[(i + j) % 4])
    b.ball((0, 0.92, -1.0), 1.0, CW, sq=(0.65, 0.22, 0.35), seg=8, rings=5)
    P['bed_cosy'] = b.finish()

    b = B('wardrobe'); house_grads(b)
    b.rbox((0, 1.35, 0), (1.7, 2.5, 0.8), W, r=0.07)
    b.rbox((0, 2.7, 0), (1.9, 0.2, 0.95), TM, r=0.05); b.rbox((0, 0.12, 0.05), (1.8, 0.24, 0.9), TM, r=0.05)
    for sx in (-1, 1):
        b.rbox((sx * 0.4, 1.35, 0.42), (0.7, 2.1, 0.06), TM, r=0.03); b.rbox((sx * 0.4, 1.35, 0.46), (0.5, 1.8, 0.03), W, r=0.02)
        b.ball((sx * 0.1, 1.3, 0.5), 0.07, GD, seg=6, rings=4)
    b.ball((0, 2.95, 0), 0.18, GD, seg=6, rings=4)
    P['wardrobe'] = b.finish()

    b = B('rug_round')
    b.cyl((0, 0.015, 0), 1.5, 1.5, 0.03, 14, AB); b.cyl((0, 0.035, 0), 1.25, 1.25, 0.03, 14, CW)
    b.cyl((0, 0.055, 0), 1.0, 1.0, 0.03, 14, FP); b.cyl((0, 0.075, 0), 0.6, 0.6, 0.03, 12, CW); b.cyl((0, 0.095, 0), 0.28, 0.28, 0.03, 10, GD)
    for k in range(10):
        a = 2 * math.pi * k / 10; b.ball((math.cos(a) * 1.15, 0.065, math.sin(a) * 1.15), 0.06, GD, sq=(1, 0.4, 1), seg=5, rings=3)
    P['rug_round'] = b.finish()

    b = B('bookshelf'); house_grads(b)
    b.rbox((0, 1.1, -0.15), (2.0, 2.2, 0.1), TM, r=0.03)
    for sx in (-1, 1): b.rbox((sx * 0.95, 1.1, 0), (0.12, 2.2, 0.45), W, r=0.04)
    for y in (0.05, 0.6, 1.15, 1.7, 2.2): b.rbox((0, y + 0.03, 0), (2.0, 0.1, 0.45), W, r=0.03, j=0.003)
    b.rbox((0, 2.38, 0), (2.2, 0.2, 0.55), TM, r=0.05)
    rr = random.Random(3); cols = (FR, AB, AG, GD, FP, TM, AR)
    for row, y in enumerate((0.1, 0.65, 1.2, 1.75)):
        x = -0.85
        while x < 0.8:
            wd = rr.uniform(0.1, 0.2); ht = rr.uniform(0.38, 0.5)
            if rr.random() < 0.12: x += 0.25; continue
            b.box((x + wd / 2, y + ht / 2 + 0.03, 0.0), (wd - 0.015, ht, 0.3), cols[rr.randint(0, 6)], Rz(rr.uniform(-0.05, 0.05)) if rr.random() < 0.15 else None, j=0.004)
            x += wd
    P['bookshelf'] = b.finish()

    b = B('desk'); house_grads(b)
    b.rbox((0, 0.95, 0), (1.8, 0.1, 0.9), W, r=0.04)
    for sx in (-1, 1):
        for sz in (-1, 1): b.rbox((sx * 0.8, 0.45, sz * 0.38), (0.12, 0.9, 0.12), W, r=0.03)
    b.rbox((0.5, 0.65, 0), (0.7, 0.55, 0.8), TM, r=0.04)
    for y in (0.5, 0.78): b.rbox((0.5, y, 0.41), (0.58, 0.2, 0.04), W, r=0.02); b.ball((0.5, y, 0.45), 0.04, GD, seg=5, rings=3)
    b.rbox((-0.4, 1.03, 0.1), (0.5, 0.06, 0.38), AB, r=0.02, rot=Ry(0.2)); b.rbox((-0.42, 1.08, 0.1), (0.44, 0.05, 0.32), CW, r=0.02, rot=Ry(0.2))
    b.cyl((0.35, 1.07, -0.2), 0.07, 0.06, 0.1, 6, IR); b.limb((0.35, 1.1, -0.2), (0.45, 1.4, -0.3), 0.012, 0.005, CW, segs=4)
    b.cyl((-0.1, 1.12, -0.25), 0.07, 0.07, 0.18, 6, CW); b.limb((-0.1, 1.2, -0.25), (-0.1, 1.33, -0.25), 0.04, 0.0, GL, segs=5)
    b.cyl((-0.1, 1.02, -0.25), 0.12, 0.12, 0.04, 6, GD)
    P['desk'] = b.finish()

    b = B('window_curtained'); house_grads(b)
    b.grads[AR] = g_lin(0.0, 3.0, (0.85, 0.8, 0.8), (1, 1, 1))
    b.box((0, 1.5, 0.03), (1.4, 1.9, 0.1), W, j=0.004); b.box((0, 1.5, 0.09), (1.1, 1.6, 0.05), GL)
    b.box((0, 1.5, 0.12), (0.06, 1.6, 0.05), W, j=0); b.box((0, 1.55, 0.125), (1.1, 0.06, 0.05), W, j=0)
    b.rbox((0, 0.5, 0.15), (1.7, 0.12, 0.3), SD, r=0.04)
    b.strut((-1.05, 2.8, 0.18), (1.05, 2.8, 0.18), 0.07, 0.07, GD, r=0.02, j=0)
    for sx in (-1, 1):
        b.ball((sx * 1.1, 2.8, 0.18), 0.09, GD, seg=6, rings=4)
        def cur(u, v, sx=sx): return V(sx * (0.95 - 0.3 * u * (1 - 0.6 * v) - 0.0), 2.75 - 2.0 * v + 0.0, 0.2 + 0.1 * math.sin(u * 10 + v) )
        b.cloth(lambda u, v, sx=sx: V(sx * (0.62 + 0.45 * u * (1 - 0.35 * math.sin(math.pi * v))), 2.75 - 2.1 * v, 0.22 + 0.07 * math.sin(u * 12 + 1) * (0.4 + v)), 3, 5, AR, th=0.05)
        b.ball((sx * 0.62, 1.3, 0.26), 0.07, GD, seg=5, rings=3)
    P['window_curtained'] = b.finish()

    b = B('potted_plant'); house_grads(b)
    b.cyl((0, 0.35, 0), 0.4, 0.28, 0.7, 8, AB); b.cyl((0, 0.72, 0), 0.45, 0.45, 0.1, 8, CW)
    b.grads[L] = g_lin(0.7, 2.2, (0.5, 0.72, 0.55), (1, 1, 0.85)); b.grads[LL] = b.grads[L]
    for k in range(9):
        a = 2 * math.pi * k / 9; d = V((math.cos(a), 0, math.sin(a))); hh = 1.5 + 0.3 * (k % 3)
        b.tube([d * 0.05 + V((0, 0.7, 0)), d * 0.3 + V((0, 1.15, 0)), d * (0.6 + 0.1 * (k % 2)) + V((0, hh, 0))], [0.12, 0.1, 0.02], LL if k % 2 else L, segs=4, sq=2.4, cap=False, smooth=False)
    b.ball((0, 1.1, 0), 0.0001, L, seg=3, rings=2) if False else None
    P['potted_plant'] = b.finish()

    # ---------- cave
    b = B('crystal_cluster_glow')
    b.grads[SD] = lambda co, n: mixc((0.6, 0.58, 0.62), (1, 1, 0.96), clamp(0.5 + 0.5 * n.y))
    b.blob((0, 0.2, 0), 0.9, SD, sq=(1.2, 0.35, 1.0), seg=8, rings=5, amp=0.15, seed=2)
    b.blob((0.7, 0.15, 0.4), 0.45, SD, sq=(1.0, 0.5, 1.0), seg=7, rings=4, amp=0.15, seed=5)
    b.grads[RG] = g_lin(0.0, 2.2, (0.7, 0.8, 0.9), (1, 1, 1))
    for k, (x, z, h, r, tilt, yaw, m) in enumerate([(0, 0, 1.9, 0.26, 0.0, 0, RG), (0.4, 0.2, 1.3, 0.2, 0.3, 1.0, RG), (-0.4, 0.15, 1.45, 0.22, -0.3, 2.0, RG),
                                                    (0.05, -0.45, 1.1, 0.18, 0.4, 3.5, FP), (0.65, -0.2, 0.8, 0.15, 0.6, 5.0, RG), (-0.7, -0.15, 0.7, 0.15, -0.6, 4.2, FP), (0.1, 0.55, 0.75, 0.14, 0.5, 0.2, RG)]):
        d = V(math.sin(tilt) * math.cos(yaw), math.cos(tilt), math.sin(tilt) * math.sin(yaw))
        p0 = V(x, 0.25, z); p1 = p0 + d * h * 1.0; p2 = p0 + d * h * 1.45
        b.limb(tuple(p0), tuple(p1), r * 1.2, r, m, segs=6); b.limb(tuple(p1), tuple(p2), r, 0.0, m, segs=6)
    P['crystal_cluster_glow'] = b.finish()
    P.update(build_cave_bits())
    return P


def build_cave_bits():
    P = {}
    b = B('mine_cart'); house_grads(b)
    b.grads[IR] = g_lin(0.3, 1.5, (0.8, 0.8, 0.85), (1, 1, 1))
    b.rbox((0, 0.7, 0), (1.5, 0.8, 1.0), IR, r=0.1)
    b.rbox((0, 0.35, 0), (1.3, 0.2, 0.9), IR, r=0.06)
    for sx in (-1, 1): b.rbox((sx * 0.78, 1.12, 0), (0.1, 0.1, 1.1), W, r=0.03); b.rbox((0, 1.12, sx * 0.52), (1.6, 0.1, 0.1), W, r=0.03)
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.cyl((sx * 0.5, 0.25, sz * 0.5), 0.22, 0.22, 0.1, 8, TM, axis='z'); b.cyl((sx * 0.5, 0.25, sz * 0.56), 0.08, 0.08, 0.06, 6, GD, axis='z')
    b.grads[GD] = lambda co, n: mixc((0.75, 0.7, 0.6), (1, 1, 0.9), clamp(0.5 + 0.5 * n.y))
    for k, (x, z, r) in enumerate(((-0.3, 0.0, 0.3), (0.3, 0.1, 0.28), (0.0, -0.2, 0.26), (0.1, 0.25, 0.2), (-0.35, 0.3, 0.17))):
        b.blob((x, 1.2 + 0.05 * k % 2, z), r, GD, seg=6, rings=4, amp=0.2, seed=k)
    b.box((0.85, 0.5, 0.0), (0.12, 0.12, 0.12), IR, j=0)
    P['mine_cart'] = b.finish()

    b = B('mine_rails'); house_grads(b)
    for k in range(9): b.rbox((-1.8 + k * 0.45, 0.07, 0), (0.2, 0.12, 1.4), W, r=0.03, j=0.012)
    for sz in (-1, 1): b.rbox((0, 0.19, sz * 0.5), (4.0, 0.1, 0.1), IR, r=0.02, j=0) ; b.rbox((0, 0.15, sz * 0.5), (4.0, 0.06, 0.2), IR, r=0.02, j=0) if False else None
    P['mine_rails'] = b.finish()

    b = B('lantern_post'); house_grads(b)
    b.rbox((0, 0.12, 0), (0.7, 0.24, 0.7), SD, r=0.08)
    b.limb((0, 0.1, 0), (0.0, 2.7, 0), 0.1, 0.08, W, segs=6)
    b.strut((0, 2.4, 0), (0.55, 2.85, 0), 0.08, 0.08, W, r=0.025, j=0); b.rbox((0.6, 2.88, 0), (0.7, 0.1, 0.1), W, r=0.03)
    b.box((0.85, 2.7, 0), (0.025, 0.2, 0.025), IR, j=0)
    b.bx(-0.16, 0.16, 2.28, 2.36, -0.16, 0.16, IR, r=0.02) if False else b.rbox((0.85, 2.3, 0), (0.34, 0.1, 0.34), IR, r=0.03)
    b.rbox((0.85, 2.5, 0), (0.26, 0.32, 0.26), GL, r=0.04)
    for ax in (-1, 1):
        for az in (-1, 1): b.box((0.85 + ax * 0.14, 2.5, az * 0.14), (0.04, 0.34, 0.04), IR, j=0)
    b.cyl((0.85, 2.76, 0), 0.22, 0.0, 0.2, 4, IR)
    b.limb((0, 0.5, 0.0), (0.0, 0.5, 0.0), 0.12, 0.12, TM, segs=6) if False else None
    for y in (0.8, 1.6): b.cyl((0, y, 0), 0.12, 0.12, 0.08, 6, TM)
    P['lantern_post'] = b.finish()

    b = B('wood_supports'); house_grads(b)
    for sx in (-1, 1):
        b.rbox((sx * 1.8, 1.5, 0), (0.34, 3.0, 0.34), W, r=0.07, j=0.01); b.rbox((sx * 1.8, 0.1, 0), (0.6, 0.2, 0.6), SD, r=0.06)
        b.strut((sx * 1.8, 2.0, 0.0), (sx * 1.0, 3.0, 0.0), 0.2, 0.2, W, r=0.04, j=0.008)
    b.rbox((0, 3.15, 0), (4.3, 0.36, 0.4), W, r=0.07, j=0.008)
    b.rbox((0, 3.5, 0), (3.6, 0.3, 0.36), TM, r=0.06, j=0.008)
    b.box((-1.2, 3.35, 0.24), (0.1, 0.12, 0.08), IR, j=0); b.box((1.2, 3.35, 0.24), (0.1, 0.12, 0.08), IR, j=0)
    P['wood_supports'] = b.finish()
    return P


# ================================================================= export + render helpers
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
                              export_lights=False, export_image_format='NONE', export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                              export_active_vertex_color_when_no_material=True)


def setup_render(w, h, samples=16):
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


def _plane(name, pts, col, y, rough=1.0, emit=0.0):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x, -z, y) for x, z in pts], [], [tuple(range(len(pts)))[::-1]])
    o = bpy.data.objects.new('ground_' + name, me); bpy.context.scene.collection.objects.link(o)
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = lin(col)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = rough
    me.materials.append(m)
    return o


def rect(name, cx, cz, w, d, col, y=0.0, **kw):
    return _plane(name, [(cx - w / 2, cz - d / 2), (cx + w / 2, cz - d / 2), (cx + w / 2, cz + d / 2), (cx - w / 2, cz + d / 2)], col, y, **kw)


def disc(name, cx, cz, r, col, y=0.0, n=28):
    return _plane(name, [(cx + r * math.cos(2 * math.pi * k / n), cz + r * math.sin(2 * math.pi * k / n)) for k in range(n)], col, y)


def clear_instances():
    for o in [o for o in bpy.data.objects if '_inst' in o.name or o.name.startswith('ground_')]:
        bpy.data.objects.remove(o)


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def sheet(P, rows, path, ortho, yaw=0, pitch=30, target=(0, 2.5, 0), spacing=7.0, rowgap=8.0, floor='#d9d9d9'):
    """rows: list of name lists or (name list, spacing) tuples; rows are laid out front to back"""
    clear_instances()
    rect('floor', 0, 0, 600, 600, floor, -0.02)
    nr = len(rows)
    for ri, row in enumerate(rows):
        names, sp = row if isinstance(row, tuple) else (row, spacing)
        z = (ri - (nr - 1) / 2) * rowgap
        x = -(len(names) - 1) * sp / 2
        for n in names:
            place(P[n], x, z, 0); x += sp
    add_lights()
    make_camera(G(*target), yaw, pitch, 150, ortho=ortho)
    render(path)


# ================================================================= main
def build_all():
    P = {}
    P.update(build_trees())
    P.update(build_pines())
    P.update(build_palm_bush())
    P.update(build_houses())
    P.update(build_town())
    P.update(build_props())
    P.update(build_shops())
    P.update(build_interiors())
    return P


SHOPS = ['anvil_big', 'forge_furnace', 'weapon_rack', 'grindstone', 'doghouse', 'pet_pen_fence', 'bird_cage', 'fortune_tent', 'hanging_lantern', 'herb_garden_box', 'potion_shelf_cart', 'cauldron', 'shield_rack', 'armor_stand', 'banner_pole_red', 'crate_stack_big', 'cart_hay', 'tech_tower_small', 'window_flowerbox', 'shop_sign_hanging', 'potted_plant_a', 'potted_plant_b', 'awning_red', 'awning_green']
INTERIORS = ['floor_tile_castle', 'floor_wood_planks', 'floor_stone_cave', 'wall_castle_window', 'wall_castle_plain', 'wall_wood_house', 'wall_stone_chapel', 'doorway_arch',
             'pillar_castle', 'throne', 'throne_dais_steps', 'carpet_runner', 'banner_wall_red', 'painting_frame', 'light_shaft', 'stained_glass_window',
             'pew', 'altar', 'candle_stand', 'bar_counter', 'stool', 'round_table', 'barrel_tap', 'fireplace',
             'hearth', 'hanging_pot', 'mug_cluster', 'tavern_shelf', 'bed_cosy', 'wardrobe', 'rug_round', 'bookshelf',
             'desk', 'window_curtained', 'potted_plant', 'crystal_cluster_glow', 'mine_cart', 'mine_rails', 'lantern_post', 'wood_supports']
TREES = ['tree_oak_big', 'tree_oak_small', 'tree_birch', 'tree_fruit', 'tree_blossom', 'tree_willow',
         'tree_pine_layered_a', 'tree_pine_layered_b', 'palm_v3', 'bush_cluster']


def scene_town(P, path):
    clear_instances()
    rect('grass', 0, 0, 300, 300, '#86b465', -0.12)
    rect('plaza', 0, -1, 15, 11, '#e5dcc3', 0.0)
    rect('road', 0, 8, 5, 12, '#cfc6ae', 0.01)
    rect('path', -7.5, 2.2, 10, 2.4, '#cfc6ae', 0.02); rect('path2', 7.5, 2.2, 10, 2.4, '#cfc6ae', 0.03)
    rect('river', 0, 13.5, 120, 4.2, '#7cc4ea', -0.05, rough=0.2)
    place(P['house_corner_L'], -13, -3.5, 0); place(P['house_row_3'], 11.5, -3.2, 0)
    place(P['house_bakery'], -10, 7.0, 0); place(P['house_flowerbox'], 10.5, 7.2, 0)
    place(P['wall_tower_round'], -21, -1.5, 0); place(P['wall_tower_round'], 21.5, 0.5, 0)
    place(P['statue_hero'], 0, -1.2, 0)
    place(P['flower_bed_round'], -6.8, 3.4, 0); place(P['flower_bed_round'], 6.8, 3.4, 0)
    place(P['flower_bed_long'], -5.2, -4.8, 0); place(P['flower_bed_long'], 5.2, -4.8, 0)
    for x in (-2.9, 2.9): place(P['lamp_post_double'], x, 5.8, 0)
    place(P['bridge_stone_arch'], 0, 13.5, 90)
    place(P['market_tent_red'], -5.0, 8.6, 0); place(P['market_tent_green'], 5.0, 8.8, 0)
    place(P['fruit_crate'], -7.0, 10.4, 15); place(P['flower_cart'], 6.8, 11.2, -25)
    place(P['notice_board'], 3.4, -5.6, 0); place(P['banner_pole'], -2.6, -6.4, 0); place(P['banner_pole'], 2.6, -6.4, 0)
    place(P['laundry_line'], 0.5, 1.6, 0) if False else None
    place(P['laundry_line'], -15.5, 4.8, 0, scale=0.9)
    place(P['hedge_arch'], 0, -8.2, 0)
    place(P['tree_oak_big'], -18.5, 5.0, 0); place(P['tree_blossom'], 17.0, 3.2, 0); place(P['tree_birch'], 16.8, 11, 0)
    place(P['tree_fruit'], -16.8, 10.8, 0); place(P['tree_willow'], -7.5, 15.8, 0)
    place(P['tree_pine_layered_a'], -23, -9, 0); place(P['tree_pine_layered_b'], 24, -8, 0); place(P['tree_pine_layered_a'], 18, -10, 0, scale=0.85)
    place(P['tree_oak_small'], 8.8, -9.5, 0); place(P['tree_oak_small'], -9.5, -10, 0, scale=0.9)
    place(P['bush_cluster'], -7.4, 1.2, 0); place(P['bush_cluster'], 7.6, 1.0, 0, scale=0.9)
    place(P['bush_cluster'], 14.5, 7.8, 0, scale=0.8); place(P['bush_cluster'], -14.5, 8.0, 0, scale=0.8)
    place(P['reed_cluster'], 9.0, 11.6, 0); place(P['reed_cluster'], -9.6, 11.8, 0, scale=0.9); place(P['reed_cluster'], 12.5, 15.5, 40)
    place(P['lily_pads'], 3.8, 14.2, 20, gy=-0.05); place(P['lily_pads'], -4.2, 13.4, 80, gy=-0.05); place(P['lily_pads'], 9, 14.2, 0, gy=-0.05)
    place(P['rock_cluster_small'], -19.5, 10.5, 0); place(P['rock_cluster_small'], 20, 6, 30)
    place(P['palm_v3'], 21, 13, 0, scale=0.9)
    place(P['campfire'], 14.5, 15.6, 0) if False else None
    place(P['cliff_rock_large'], 26, -4, 0, scale=0.8)
    place(P['stairs_stone'], 0, 5.8, 0, scale=0.0001) if False else None
    add_lights()
    make_camera(G(0, 0.5, 2.0), 0, 50, 92, fov=26)
    render(path)


def scene_throne(P, path):
    clear_instances()
    rect('void', 0, 0, 300, 300, '#58627a', -0.4)
    for x in (-4, 0, 4):
        for z in (-4, 0, 4): place(P['floor_tile_castle'], x, z, 0)
    for x, nm in ((-4, 'wall_castle_window'), (0, 'wall_castle_plain'), (4, 'wall_castle_window')): place(P[nm], x, -6.3, 0)
    for z, nm in ((-4, 'wall_castle_window'), (0, 'wall_castle_plain'), (4, 'wall_castle_window')):
        place(P[nm], -6.3, z, -90); place(P[nm], 6.3, z, 90)
    place(P['throne_dais_steps'], 0, -3.5, 0)
    place(P['throne'], 0, -5.0, 0, gy=0.84)
    for i in range(3): place(P['carpet_runner'], 0, -1.0 + 2.0 + i * 4.0, 0, scale=1.6, gy=0.0) if False else None
    for i in range(3): place(P['carpet_runner'], 0, 1.0 + i * 4.0 - 0.0, 0, gy=0.0)
    for x, z in ((-3.4, -1.0), (3.4, -1.0), (-3.4, 3.2), (3.4, 3.2)): place(P['pillar_castle'], x, z, 0)
    for x in (-2.6, 2.6): place(P['banner_wall_red'], x, -5.93, 0, gy=1.3)
    for x in (-4, 4): place(P['light_shaft'], x, -5.9, 0, gy=0.3)
    place(P['light_shaft'], -5.9, -4, -90, gy=0.3); place(P['light_shaft'], 5.9, 4, 90, gy=0.3)
    for x in (-3.4, 3.4): place(P['candle_stand'], x, -4.2, 0, gy=0.56)
    place(P['painting_frame'], -5.95, 0, -90, gy=1.8); place(P['painting_frame'], 5.95, 0, 90, gy=1.8)
    for x in (-5.2, 5.2): place(P['potted_plant'], x, -5.2, 0)
    place(P['pew'], -4.2, 4.3, 0) if False else None
    add_lights()
    make_camera(G(0, 1.8, -0.5), 0, 50, 52, fov=26)
    render(path)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    global MATS
    MATS = make_materials()
    P = build_all()
    print('--- triangle counts')
    for n, o in P.items(): print(f'{n:22s} {tri_count(o):6d}')
    export_glb(list(P.values()))
    print('exported', RAW_GLB, 'pieces:', len(P))
    if '--no-render' in sys.argv: return
    preview_materials()
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
        setup_render(1000, 800, 20)
        sheet(P, [names], os.path.join(SHOTS, 'close_' + names[0] + '.png'), float(parts[3]) if len(parts) > 3 else 9,
              yaw=float(parts[1]) if len(parts) > 1 else 20, pitch=float(parts[2]) if len(parts) > 2 else 22,
              target=(0, float(parts[4]) if len(parts) > 4 else 3.0, 0), spacing=float(parts[5]) if len(parts) > 5 else 7)
        return
    if want('trees'):
        setup_render(1700, 800, 24)
        sheet(P, [TREES[:5], TREES[5:]], os.path.join(SHOTS, 'sheet_trees.png'), 48, yaw=0, pitch=28, target=(0, 3.5, 0), spacing=8, rowgap=16)
    if want('town'):
        setup_render(1900, 1100, 20)
        sheet(P, [(['house_corner_L', 'house_row_3', 'house_bakery', 'house_flowerbox'], 16),
                  (['wall_tower_round', 'adventure_portal', 'statue_hero', 'stairs_stone', 'hedge_arch'], 11),
                  (['ship_big', 'bridge_stone_arch', 'bridge_wood_small'], 16)],
              os.path.join(SHOTS, 'sheet_town.png'), 84, yaw=0, pitch=30, target=(0, 2.0, 0), rowgap=24)
    if want('props'):
        setup_render(1900, 1100, 20)
        sheet(P, [(['beach_umbrella', 'beach_crates', 'fishing_net_rack', 'campfire', 'flower_bed_round', 'flower_bed_long', 'laundry_line', 'notice_board'], 6.2),
                  (['lamp_post_double', 'banner_pole', 'market_tent_red', 'market_tent_green', 'fruit_crate', 'flower_cart'], 7.5),
                  (['cliff_rock_large', 'rock_cluster_small', 'reed_cluster', 'lily_pads'], 8)],
              os.path.join(SHOTS, 'sheet_props.png'), 56, yaw=0, pitch=30, target=(0, 1.5, 0), rowgap=12)
    if want('interiors'):
        setup_render(1900, 1200, 20)
        sheet(P, [(INTERIORS[i:i + 8], 6.2) for i in range(0, 40, 8)], os.path.join(SHOTS, 'sheet_interiors.png'), 64, yaw=0, pitch=30, target=(0, 2.0, 0), rowgap=12)
    if want('scene'):
        setup_render(1600, 1000, 28); scene_town(P, os.path.join(SHOTS, 'scene.png'))
    if want('throne'):
        setup_render(1500, 1000, 28); scene_throne(P, os.path.join(SHOTS, 'scene_throne.png'))
    if want('shops'):
        setup_render(1900, 1100, 20)
        sheet(P, [(SHOPS[:8], 6.5), (SHOPS[8:16], 6.5), (SHOPS[16:], 6.5)], os.path.join(SHOTS, 'sheet_shops.png'), 56, yaw=0, pitch=30, target=(0, 2.0, 0), rowgap=10)


if __name__ == '__main__':
    main()
