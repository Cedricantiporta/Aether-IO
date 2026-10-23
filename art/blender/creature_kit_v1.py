"""Aether Survivor - creature kit v1 (monsters, bosses, pets; cute toy / Zelda: Echoes of Wisdom style).

Rebuild:   python3 art/blender/creature_kit_v1.py                 (needs `pip install bpy`)
           python3 art/blender/creature_kit_v1.py --no-render     (skip the preview renders)
           python3 art/blender/creature_kit_v1.py --only=monsters,bosses,pets
           python3 art/blender/creature_kit_v1.py --closeup=goblin+bat[,yaw,pitch,ortho,y,spacing]
Outputs:   public/models/creatures/creature_kit_v1.glb (monsters + bosses + boss adds + pets, ~2 MB). The script exports the raw glb and
           compresses it itself (weld + meshopt medium via npx @gltf-transform/cli; pass --no-compress to keep only the raw file):
             npx @gltf-transform/cli weld X.raw.glb X.weld.glb && npx @gltf-transform/cli meshopt X.weld.glb X.glb --level medium
           previews go to $CREATURE_SHOTS (default art/renders/creatures/): sheet_monsters/bosses/pets.png + close_*.png

Reuses the whole kit_v3 pipeline (B.blob / B.tube / B.lathe, vertex colour gradients COLOR_0 that MULTIPLY the material colour, flat
shared materials, game-space authoring mapped to Blender).  Difference to kit_v3: a creature is a ROOT Empty `<name>` with JOINT
Empties `<name>_body|head|armL|armR|legL|legR|legFL..|wingL|wingR|tail|...`, each holding exactly one `<joint>_mesh` child.  The Empty
sits at the joint pivot (neck, shoulder, hip, wing root, tail root...) and the mesh is authored relative to it, so code animates a joint by
rotating its Empty (meshopt moves mesh origins, never Empties).  Rest pose: fronts +Z, origin = ground centre, 1 unit = 1 m, authored at the
size the creature has IN GAME (def.scale already applied).  Joints are children of the root unless the table in docs/CREATURE_PLAN.md
says otherwise (nested: shins under legs, hydra neck segments under each other).
"""
import os, sys, math, random, zlib
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Matrix, Vector
import kit_v3 as K
from kit_v3 import (T, Rx, Ry, Rz, Sc, I4, G, clamp, lerp, mixc, smooth, nz, spline, lin, descendants, tri_count)

ROOT = K.ROOT
OUT_DIR = os.path.join(ROOT, 'public/models/creatures')
SHOTS = os.environ.get('CREATURE_SHOTS', os.path.join(ROOT, 'art/renders/creatures'))
PI = math.pi

# ---------------------------------------------------------------- palette (LIGHTEST tone; COLOR_0 darkens undersides)
PAL = {
    # shared
    'eye_white': '#ffffff', 'eye_yellow': '#ffe466', 'eye_red': '#ff7a6a', 'eye_black': '#2a2142', 'shine': '#ffffff', 'blush': '#ff9fb4', 'mouth': '#7a2f40', 'tongue': '#ff7f93',
    'tooth': '#fffbea', 'bone': '#f6efd8', 'bone_dark': '#d8cca8', 'ink': '#3b3250', 'cream': '#fff3d6',
    'wood': '#b27a45', 'wood_dark': '#7a4e2a', 'iron': '#aab3c4', 'iron_dark': '#6b7389', 'steel': '#dde4ef', 'gold': '#ffcb3d',
    'leather': '#b6743c', 'stone': '#b9bec8', 'stone_dark': '#7c8493', 'moss': '#86d156',
    # glow (emissive)
    'glow_orange': '#ff9a2e', 'glow_yellow': '#ffe35c', 'glow_cyan': '#6fe8ff', 'glow_purple': '#c78bff', 'glow_green': '#b6ff5c',
    'glow_pink': '#ff7fd8', 'glow_red': '#ff5a4a', 'glow_white': '#fffbe8', 'glow_blue': '#7fb4ff',
    # slimes / goblins / bandits
    'slime': '#9be85a', 'slime_dark': '#58b02e', 'splitter': '#46d4b0', 'splitter_dark': '#23a08a', 'crystal_purple': '#c88bff',
    'goblin': '#8ad84a', 'goblin_dark': '#5aa832', 'goblin_cloth': '#c0803f', 'goblin_ear': '#ffb0a0',
    'bandit_cloth': '#d27a3a', 'bandit_mask': '#7a3b30', 'bandit_skin': '#ffd2a8', 'bandit_hat': '#4a5aa8', 'bandit_scarf': '#e04a4a',
    'bat': '#9b7be0', 'bat_belly': '#e6d6ff', 'bat_wing': '#c7a3f5', 'bat_ear': '#ffb4d2',
    'skel_cloth': '#d34a4a', 'cult_robe': '#9b5cf0', 'cult_robe_dark': '#6a3aba', 'cult_trim': '#ffcb3d', 'cult_skin': '#ffd8bc',
    'bomber': '#ff8a35', 'bomber_dark': '#c9561f', 'bomber_belly': '#ffe3b0', 'fuse': '#ff4a2a',
    'brute': '#c9824a', 'brute_dark': '#8e5530', 'brute_belly': '#f2cfa0', 'brute_cloth': '#6a4a8a',
    'zombie': '#9bc27a', 'zombie_dark': '#5f8a4d', 'zombie_cloth': '#7a6a9a', 'zombie_cloth2': '#b08a60', 'zombie_eye': '#fff170',
    'wraith': '#aee4ff', 'wraith_dark': '#6fb0e0',
    'golemite': '#f2a8ff', 'golemite_dark': '#b070d8', 'rock_plum': '#8a7aa6',
    'boar': '#c98a52', 'boar_dark': '#8a5a34', 'boar_belly': '#f6d9b0', 'boar_tusk': '#fff6dc', 'boar_snout': '#ffb0a0', 'boar_mane': '#7a4a2a',
    'crab': '#ff7a5a', 'crab_dark': '#d9503a', 'crab_belly': '#ffd3b8', 'crab_rock': '#98a4b8', 'crab_rock_dark': '#6d788c',
    'scarab': '#3ab8b0', 'scarab_dark': '#1f8680', 'scarab_gold': '#ffcc50', 'scarab_belly': '#e9fff6',
    'shield_red': '#d65048', 'shield_gold': '#ffcb3d', 'shield_steel': '#e8edf5', 'shield_skin': '#ffd2a8',
    'sporecap': '#ff6050', 'sporecap_spot': '#fff4e0', 'sporecap_stem': '#f8ecd2', 'sporecap_glow': '#d8a0ff',
    'wolf': '#9aa3b2', 'wolf_dark': '#656d7e', 'wolf_belly': '#e8edf2', 'hound': '#4a3030', 'hound_dark': '#2c1c1c', 'hound_glow': '#ff7a2a',
    'haunted': '#b8c2d6', 'haunted_dark': '#7a859e', 'haunted_gold': '#f2c24a', 'haunted_plume': '#d94a62',
    'gargoyle': '#a7a29a', 'gargoyle_dark': '#716d65', 'gargoyle_wing': '#7cae5c', 'gargoyle_belly': '#d6d0c2',
    'scorpion': '#e09a40', 'scorpion_dark': '#a8661e', 'scorpion_tail': '#f2b658', 'scorpion_sting': '#b4e65a',
    'mummy': '#e8d9ac', 'mummy_dark': '#bba978',
    'yeti': '#f0f6fc', 'yeti_dark': '#a8c4de', 'yeti_face': '#86bde8', 'yeti_horn': '#d8f2ff',
    'wisp': '#bdeaff', 'wisp_core': '#fbffff', 'ice': '#aee6ff', 'ice_dark': '#6fb8e8',
    'shaman': '#d8452a', 'shaman_dark': '#8c2a18', 'shaman_skin': '#6a4030', 'shaman_staff': '#8a5a30', 'shaman_bone': '#f6ead2',
    'void': '#a16bff', 'void_dark': '#5a37a8', 'void_deep': '#2e1f5e', 'void_light': '#d9c4ff', 'void_eye': '#e8a0ff',
    'ward': '#9fd0ff', 'ward_dark': '#5a8fd4', 'ward_base': '#8c93a6',
    'sapling': '#7ad03a', 'sapling_dark': '#4a9a22', 'bark': '#9a6a3a', 'bark_dark': '#6a4624', 'leaf': '#8fe05a', 'leaf_dark': '#4eaa30',
    'hydra': '#58b86a', 'hydra_dark': '#2f8a4a', 'hydra_belly': '#d8f0a8',
    'wyrm': '#a8dcf6', 'wyrm_dark': '#5a9ed0', 'wyrm_belly': '#f2fbff', 'wyrm_horn': '#e8f8ff',
    'imp': '#ff7040', 'imp_dark': '#c8402a', 'imp_belly': '#ffd0a0', 'imp_horn': '#ffe8b0',
    'archer_wood': '#a8703e', 'archer_hood': '#5aa03a', 'archer_cloth': '#d8c7a0',
    'skel_mage': '#b99aff', 'skel_mage_robe': '#7a4ac8',
    'bone_golem': '#f0e8cc', 'bone_golem_dark': '#c4b896', 'bone_purple': '#b088ff',
    'lich_robe': '#7a46c8', 'lich_robe_dark': '#4c2a8a', 'lich_gold': '#ffcb3d',
    'golem': '#bcc2cc', 'golem_dark': '#858c99', 'golem_moss': '#86d156', 'golem_core': '#ffb048',
    'treant_bark': '#b67a40', 'treant_bark_dark': '#7a4e28', 'treant_root': '#8a5c30',
    'warlord_dark': '#6a4a56', 'warlord_red': '#e0503a', 'warlord_iron': '#a69aa6', 'warlord_gold': '#f2c24a',
    'colossus': '#a8b872', 'colossus_dark': '#6e7a45', 'colossus_steel': '#aeb6c4', 'colossus_vent': '#ff9a2e',
    # pets
    'pb_green': '#a6f070', 'pb_dark': '#5ab838',
    'pv_bat': '#c7a0ff', 'pv_belly': '#fff0ff',
    'pf_pink': '#ffb4dc', 'pf_dress': '#ff8ac4', 'pf_skin': '#ffe6d2', 'pf_wing': '#e8f8ff', 'pf_hair': '#ffd36a',
    'pw_blue': '#a8d6ff', 'pw_white': '#f2f8ff',
    'pd_gold': '#ffd23a', 'pd_dark': '#e09a18', 'pd_belly': '#fff0b0',
    'pr_rock': '#a4aab4', 'pr_dark': '#757c88', 'pr_moss': '#7ed054',
    'pg_iron': '#a8b6ca', 'pg_dark': '#6e7a90',
    'pp_orange': '#ff8a2a', 'pp_yellow': '#ffd83a', 'pp_red': '#ff5a2a',
    'px_orange': '#ff8638', 'px_cream': '#fff3e0', 'px_dark': '#4a2a18',
    'po_blue': '#c4ecff', 'po_dark': '#78b0ec', 'po_beak': '#ffcf5a',
    'pm_wood': '#a8703e', 'pm_dark': '#7a4a24', 'pm_inside': '#b32a3c',
    'ps_core': '#fff3a8', 'ps_blue': '#8ad8ff', 'ps_spark': '#c8f0ff',
    'pt_shell': '#58c88a', 'pt_dark': '#2f9a68', 'pt_skin': '#b6e69c',
    'pc_cat': '#5a4a80', 'pc_dark': '#38284f', 'pc_ear': '#9a7ad6',
    'pcr_rock': '#8e98ac', 'pcr_dark': '#667286', 'pcr_crystal': '#8be8ff', 'pcr_light': '#d4faff',
    'pl_blue': '#52a8f0', 'pl_dark': '#3a82d6', 'pl_belly': '#e6fcff', 'pl_fin': '#9eeaff',
    'pz_gold': '#fff2b8', 'pz_ring': '#ffe49a',
}
ORDER = list(PAL)
EMISSIVE = tuple(k for k in PAL if k.startswith('glow_'))
K.PALETTE.clear(); K.PALETTE.update(PAL)
K.ORDER[:] = ORDER
K.MI.clear(); K.MI.update({k: i for i, k in enumerate(ORDER)})
K.EMISSIVE = EMISSIVE
MI = K.MI


def make_materials():
    out = []
    for k in ORDER:
        m = bpy.data.materials.new(k)
        m.use_nodes = True
        bsdf = m.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = lin(PAL[k])
        bsdf.inputs['Roughness'].default_value = 0.8
        bsdf.inputs['Metallic'].default_value = 0.0
        if k in EMISSIVE:
            bsdf.inputs['Emission Color'].default_value = lin(PAL[k])
            bsdf.inputs['Emission Strength'].default_value = 2.5
        m.diffuse_color = lin(PAL[k])
        m.use_backface_culling = True
        out.append(m)
    return out


def preview_materials():
    K.preview_materials()
    for m in K.MATS:
        if m.name in EMISSIVE:
            m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0.9


# ---------------------------------------------------------------- builder with joints
GLOWLIKE = tuple(EMISSIVE) + ('eye_white', 'eye_black', 'shine', 'blush', 'mouth', 'tongue', 'tooth')


def g_body(H):
    """default gradient: darker belly / feet -> lighter back, with a soft up-facing light"""
    def f(co, n):
        t = clamp(co.y / max(H, 0.1))
        u = clamp(0.5 + 0.5 * n.y)
        return mixc((0.70, 0.66, 0.74), (1.0, 1.0, 0.97), smooth(0.45 * t + 0.55 * u))
    return f


class Part(K.B):
    """one joint's geometry, authored in creature coordinates; finish_joint shifts it so the joint pivot is the origin"""
    def __init__(s, name, H=1.5, jit=0.0):
        super().__init__(name, jit)
        s.H = H

    def finish_joint(s, creature_name, suffix, pivot, parent=None, parent_pivot=(0, 0, 0), scale=1.0):
        bm = s.bm
        bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if not f.tag])
        bm.normal_update()
        layer = bm.loops.layers.color.new('Col')
        dg = g_body(s.H)
        for f in bm.faces:
            nm = K.ORDER[f.material_index]
            fn = s.grads.get(nm) or (None if nm in GLOWLIKE else dg)
            for l in f.loops:
                l[layer] = fn(l.vert.co, l.vert.normal if f.smooth else f.normal) if fn else (1.0, 1.0, 1.0, 1.0)
        if scale != 1.0:
            bmesh.ops.scale(bm, vec=(scale, scale, scale), verts=bm.verts)
        pivot = tuple(p * scale for p in pivot); parent_pivot = tuple(p * scale for p in parent_pivot)
        bmesh.ops.translate(bm, vec=(-pivot[0], -pivot[1], -pivot[2]), verts=bm.verts)
        bmesh.ops.transform(bm, matrix=Rx(PI / 2), verts=bm.verts)
        nm = f'{creature_name}_{suffix}'
        me = bpy.data.meshes.new(nm)
        bm.to_mesh(me); bm.free()
        me.color_attributes.active_color = me.color_attributes['Col']; me.color_attributes.render_color_index = me.color_attributes.active_color_index
        for m in K.MATS: me.materials.append(m)
        em = bpy.data.objects.new(nm, None)
        bpy.context.scene.collection.objects.link(em)
        em.location = G(pivot[0] - parent_pivot[0], pivot[1] - parent_pivot[1], pivot[2] - parent_pivot[2])
        ob = bpy.data.objects.new(nm + '_mesh', me)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = em
        return em


class Cr:
    """a creature = root Empty + joint Empties.  c.part(suffix, pivot, parent) -> Part to draw into (creature coordinates)."""
    def __init__(s, name, H, scale=1.0):
        s.name, s.H, s.scale = name, H, scale      # boss builders author in 'design units' and scale the whole creature at done()
        s.root = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(s.root)
        s.parts = []   # (suffix, Part, pivot, parent)
        s.piv = {}

    def part(s, suffix, pivot=(0, 0, 0), parent=None):
        p = Part(f'{s.name}_{suffix}', s.H)
        s.parts.append((suffix, p, pivot, parent))
        s.piv[suffix] = pivot
        return p

    def done(s):
        ems = {}
        for suffix, p, pivot, parent in s.parts:
            pp = s.piv[parent] if parent else (0, 0, 0)
            em = p.finish_joint(s.name, suffix, pivot, parent, pp, s.scale)
            em.parent = ems[parent] if parent else s.root
            ems[suffix] = em
        return s.root


# ---------------------------------------------------------------- cute-style helpers (game space)
DETAIL = [0.85]    # global tessellation multiplier (monsters 0.85; bosses raise it)


def sb(b, pos, r, mat, sq=(1, 1, 1), seg=None, rings=None, rot=None):
    """soft ball; tessellation is automatic from the radius (tiny balls 6x4 ... big ones 10x7) unless given, scaled by DETAIL"""
    if seg is None:
        seg = 6 if r < 0.05 else 7 if r < 0.1 else 8 if r < 0.2 else 9 if r < 0.5 else 11
    seg = max(5, round(seg * DETAIL[0]))
    rings = max(3, round(rings * DETAIL[0])) if rings else max(3, round(seg * 0.68))
    b.ball(pos, r, mat, sq=sq, seg=seg, rings=rings, rot=rot)


def eye(b, x, y, z, r=0.1, look=(0.0, 0.0), pupil='eye_black', white='eye_white', sq=(1.0, 1.12), seg=None, shine=True, flip=1.0, ang=0.0, side=1):
    """toy eye on a +Z facing head, NO big white ball (googly eyes were dropped).
    cute (white == 'eye_white'): one solid glossy dark bean (narrow oval) + a tiny highlight dot; `ang` only tilts it a little (cute-determined).
    menacing (coloured / glowing `white`, or a glowing `pupil`): a flat almond in that colour, slanted inwards-down by `ang` (side = -1 / +1 = which
    face side, like the brows), a thin dark slit pupil and a heavy dark lid cut over the top so it looks fierce, not surprised."""
    seg = seg or (8 if r < 0.15 else 10)
    px, py = x + look[0] * r * 0.2, y + look[1] * r * 0.2
    col = white if white != 'eye_white' else (pupil if pupil.startswith('glow') else None)
    if col is None:      # cute bean
        sb(b, (px, py, z + r * 0.12), r * 0.95, pupil, sq=(0.84 * sq[0], 1.1 * sq[1] / 1.12, 0.6), seg=max(9, seg), rot=Rz(side * ang * 0.35) if ang else None)
        if shine:
            sb(b, (px + r * 0.17 * flip, py + r * 0.32, z + r * 0.56), r * 0.17, 'shine', sq=(1, 1, 0.6), seg=5, rings=3)
        return
    a = ang if ang else 0.32           # menacing eyes always slant
    sb(b, (x, y, z + r * 0.05), r * 1.05, col, sq=(1.2, 0.72, 0.6), seg=max(9, seg), rot=Rz(side * a))                    # almond
    sb(b, (px, py - r * 0.02, z + r * 0.32), r * 0.5, 'eye_black', sq=(0.24, 1.0, 0.55), seg=7, rings=4)         # slit pupil
    # lid: dark ellipse over the upper part, tilted the same way (inner end lower) -> determined glare
    sb(b, (x - side * r * 0.06, y + r * 0.72, z + r * 0.22), r * 0.95, 'ink', sq=(1.2, 0.26, 0.5), seg=max(9, seg), rot=Rz(side * (a + 0.1)))


def brow(b, x, y, z, w, ang, mat='ink', th=0.03):
    """little tilted eyebrow (cute-angry when angled inwards)"""
    b.rbox((x, y, z), (w, th, th * 1.2), mat, r=th * 0.45, rot=Rz(ang), smooth=True)


def slit_eye(b, x, y, z, r, glow, side, ang=0.36, dark='eye_black'):
    """hollow / armoured eye socket as a narrow slanted almond (inner end lower = determined) with a smaller glowing almond inside"""
    sb(b, (x, y, z), r, dark, sq=(1.15, 0.58, 0.5), seg=9, rings=5, rot=Rz(side * ang))
    sb(b, (x - side * r * 0.04, y - r * 0.04, z + r * 0.5), r * 0.62, glow, sq=(1.1, 0.5, 0.5), seg=8, rings=4, rot=Rz(side * ang))


def cheek(b, x, y, z, r=0.07, mat='blush'):
    sb(b, (x, y, z), r, mat, sq=(1, 0.7, 0.3), seg=7, rings=4)


def smile(b, x, y, z, w=0.16, depth=0.04, mat='mouth', th=0.014, up=1.0):
    pts = [(x + w * (k / 4 - 0.5) * 2, y - up * depth * (1 - ((k / 4 - 0.5) * 2) ** 2) + up * depth * 0.2, z) for k in range(5)]
    b.tube(pts, [th * 0.7, th, th, th, th * 0.7], mat, segs=5)


def fang(b, x, y, z, h=0.07, r=0.025, mat='tooth', pt=-1):
    b.limb((x, y, z), (x, y + pt * h, z + 0.005), r, 0.004, mat, segs=5, smooth=True)


def horn(b, p0, p1, r, mat, segs=7, curve=(0, 0, 0)):
    """rounded cone horn / spike / claw: slightly curved tube tapering to a tip"""
    p0, p1 = Vector(p0), Vector(p1)
    mid = (p0 + p1) / 2 + Vector(curve)
    b.tube([p0, mid, p1], [r, r * 0.62, r * 0.08], mat, segs=segs, cap=True)


def capsule(b, p0, p1, r0, r1, mat, segs=8):
    """soft limb: tube with round end caps"""
    b.tube([p0, p1], [r0, r1], mat, segs=segs, cap=False)
    sb(b, p0, r0, mat, seg=segs, rings=4)
    sb(b, p1, r1, mat, seg=segs, rings=4)


def stub_leg(b, x, ytop, z, r, h, mat, foot=None, fr=None, fz=0.05):
    """round, short toy leg hanging from the hip (ytop) to the ground + optional foot ball"""
    sb(b, (x, ytop - h / 2 + 0.02, z), 1.0, mat, sq=(r, h / 2 + 0.02, r), seg=8, rings=5)
    if foot:
        fr = fr or r * 1.25
        sb(b, (x, fr * 0.62, z + fz), fr, foot, sq=(1.0, 0.62, 1.3), seg=8, rings=5)


def stub_arm(b, sh, hand, r, mat, hand_mat=None, hr=None):
    capsule(b, sh, hand, r, r * 0.88, mat, 8)
    if hand_mat:
        sb(b, hand, (hr or r * 1.3), hand_mat, seg=8, rings=5)


def flat_poly(b, pts_xz, y, th, mat):
    """thin extruded polygon in the XZ plane at height y (wings, fins, membranes); pts are (x, z)"""
    b.push(T((0, y, 0)) @ Rx(-PI / 2))
    b.prism([(x, -z) for x, z in pts_xz], -th / 2, th / 2, mat)
    b.pop()


def spikes(b, center, r, n, h, mat, yaw0=0.0, tilt=0.0, ry=1.0, rr=0.06, y_off=0.0):
    """ring of soft spikes around a vertical axis"""
    for i in range(n):
        a = yaw0 + 2 * PI * i / n
        p0 = (center[0] + math.sin(a) * r, center[1] + y_off, center[2] + math.cos(a) * r)
        d = Vector((math.sin(a) * (1 + tilt), ry, math.cos(a) * (1 + tilt))).normalized()
        horn(b, p0, tuple(Vector(p0) + d * h), rr, mat, segs=6)


def sz(c, r, sq, x, y):
    """z of the front surface of an ellipsoid (centre c, radius r, squash sq) at (x, y): puts eyes / mouths ON a head"""
    v = 1 - ((x - c[0]) / (r * sq[0])) ** 2 - ((y - c[1]) / (r * sq[1])) ** 2
    return c[2] + r * sq[2] * math.sqrt(max(v, 0.0))


def face(b, c, r, sq=(1, 1, 1), ex=0.38, ey=0.08, er=0.2, my=-0.34, mw=0.2, cheeks=True, mouth='smile', look=(0, 0), pupil='eye_black',
         white='eye_white', brows=None, fangs=0, esq=(1.0, 1.12), sink=0.22, ecol_shine=True):
    """two big eyes (+ optional brows, cheeks, mouth) on the +Z side of an ellipsoid head"""
    cx, cy, cz = c
    er_ = er * r
    for s in (-1, 1):
        x = cx + s * ex * r * sq[0]; y = cy + ey * r * sq[1]
        eye(b, x, y, sz(c, r, sq, x, y) - er_ * sink, er_, look=look, pupil=pupil, white=white, sq=esq, shine=ecol_shine, ang=(brows[0] if brows else 0.0), side=s, flip=s)
        if brows:
            ang, dy, wf = brows
            by = y + er_ * (1.3 + dy)
            brow(b, x, by, sz(c, r, sq, x, by) + 0.005, er_ * wf, s * ang, th=er_ * 0.3)
        if cheeks:
            xx = cx + s * (ex + 0.36) * r * sq[0]; yy = cy + (ey - 0.2) * r * sq[1]
            cheek(b, xx, yy, sz(c, r, sq, xx, yy) - 0.005, r * 0.15)
    my_ = cy + my * r * sq[1]
    mz = sz(c, r, sq, cx, my_)
    if mouth == 'smile':
        smile(b, cx, my_, mz + 0.002, w=mw * r, depth=0.17 * mw * r, th=0.012 + 0.03 * r * 0.2)
    elif mouth == 'open':
        sb(b, (cx, my_ - 0.02 * r, mz - mw * r * 0.2), mw * r * 0.55, 'mouth', sq=(1.2, 0.8, 0.5), seg=9, rings=5)
        sb(b, (cx, my_ - 0.1 * r, mz - mw * r * 0.1), mw * r * 0.3, 'tongue', sq=(1.2, 0.6, 0.4), seg=7, rings=4)
    elif mouth == 'fangs':
        smile(b, cx, my_, mz + 0.002, w=mw * r, depth=0.15 * mw * r, th=0.012 + 0.03 * r * 0.2)
        for s in (-1, 1):
            fang(b, cx + s * mw * r * 0.55, my_ + 0.01, mz + 0.012, h=0.1 * r + 0.02, r=0.028 * r + 0.008)


def crystal(b, pos, h, r, mat, rot=None):
    """hex crystal: prism + pointed tip, standing on y at pos (rot tilts it)"""
    rot = rot or I4
    b.push(T(pos) @ rot)
    b.cyl((0, h * 0.3, 0), r, r, h * 0.6, 6, mat)
    b.cyl((0, h * 0.6 + h * 0.2, 0), r, r * 0.01, h * 0.4, 6, mat)
    b.pop()


# ================================================================= creature registry
MONSTERS, BOSSES, PETS = {}, {}, {}


def reg(table):
    def deco(fn):
        table[fn.__name__] = fn
        return fn
    return deco


# ================================================================= MONSTERS
# (H = approximate in-game height in metres, def.scale already applied; footprint radius ~ enemyDefs radius)
@reg(MONSTERS)
def slime():
    c = Cr('slime', 1.05)
    b = c.part('body')
    sb(b, (0, 0.5, 0), 0.68, 'slime', sq=(1.05, 0.82, 1.05), seg=14, rings=9)
    horn(b, (0, 0.92, -0.02), (0.07, 1.22, 0.04), 0.14, 'slime', segs=8, curve=(0.0, 0.0, 0))      # little drip curl on top
    for i in range(6):
        a = i * PI / 3 + 0.3
        sb(b, (math.sin(a) * 0.52, 0.1, math.cos(a) * 0.52), 0.17, 'slime', sq=(1, 0.7, 1), seg=7, rings=4)   # wobbly skirt
    sb(b, (-0.3, 0.86, 0.34), 0.1, 'shine', sq=(1, 0.65, 0.5), seg=7, rings=4, rot=Rz(0.5))
    f = c.part('face', (0, 0.55, 0.6))
    face(f, (0, 0.5, 0), 0.68, (1.05, 0.82, 1.05), ex=0.34, ey=0.12, er=0.2, my=-0.28, mw=0.2)
    return c.done()


@reg(MONSTERS)
def splitter():
    c = Cr('splitter', 1.9)
    b = c.part('body')
    sb(b, (0, 0.9, 0), 1.0, 'splitter', sq=(1.1, 0.88, 1.08), seg=14, rings=9)
    for i in range(6):
        a = i * PI / 3 + 0.5
        horn(b, (math.sin(a) * 0.62, 1.55, math.cos(a) * 0.62), (math.sin(a) * 0.95, 2.05, math.cos(a) * 0.95), 0.17, 'splitter_dark', segs=7)
    horn(b, (0, 1.7, 0), (0.05, 2.35, 0), 0.22, 'splitter_dark', segs=7)
    for i in range(6):
        a = i * PI / 3 + 0.2
        sb(b, (math.sin(a) * 0.82, 0.14, math.cos(a) * 0.82), 0.26, 'splitter', sq=(1, 0.7, 1), seg=7, rings=4)
    sb(b, (0.5, 1.3, 0.55), 0.12, 'shine', sq=(1, .65, .5), seg=7, rings=4, rot=Rz(0.5))
    face(b, (0, 0.9, 0), 1.0, (1.1, 0.88, 1.08), ex=0.34, ey=0.16, er=0.19, my=-0.3, mw=0.2, brows=(0.4, 0.05, 1.3), mouth='fangs')
    k = c.part('core', (0, 0.42, 0.95))
    sb(k, (0, 0.42, 0.98), 0.2, 'glow_purple', seg=9, rings=6)
    return c.done()


def goblin_build(name, skin='goblin', cloth='goblin_cloth', ear_in='goblin_ear', weapon='club', hat=None, imp=False, H=1.55):
    """goblin family: goblin (club), goblin_archer (hood + bow), boss_imp (red, horns, wings, tail)"""
    c = Cr(name, H)
    b = c.part('body', (0, 0.6, 0))
    sb(b, (0, 0.62, 0), 0.34, cloth, sq=(1, 1, 0.9), seg=9, rings=6)
    sb(b, (0, 0.5, 0.05), 0.3, skin if imp else 'goblin', sq=(1, 0.8, 0.9), seg=8, rings=5)
    b.lathe([(0.35, 0.5), (0.37, 0.5), (0.37, 0.42), (0.35, 0.42)], 'wood_dark', segs=9, closed=True)   # belt
    sb(b, (0, 0.28, -0.1), 0.16, cloth, sq=(1.3, 0.6, 0.7), seg=7, rings=4)
    if weapon == 'bow':   # quiver on the back
        b.limb((-0.1, 0.55, -0.34), (-0.18, 1.0, -0.42), 0.09, 0.09, 'wood_dark', segs=7, smooth=True)
        for k in range(3):
            horn(b, (-0.18 + (k - 1) * 0.04, 1.0, -0.42), (-0.2 + (k - 1) * 0.06, 1.2, -0.44), 0.02, 'cream', segs=4)
    if imp:
        sb(b, (0, 0.48, 0.27), 0.17, 'imp_belly', sq=(1, 1.2, 0.5), seg=8, rings=5)
        b.tube([(0, 0.35, -0.25), (0, 0.15, -0.6), (0.0, 0.3, -0.9), (0, 0.55, -0.95)], [0.07, 0.055, 0.04, 0.03], skin, segs=6)
        horn(b, (0, 0.55, -0.95), (0, 0.75, -1.1), 0.1, 'imp_horn', segs=6)
    h = c.part('head', (0, 0.95, 0.02))
    hc, hr, hs = (0, 1.2, 0.04), 0.42, (1.12, 0.95, 1.0)
    sb(h, hc, hr, skin, sq=hs, seg=11, rings=7)
    for s in (-1, 1):
        horn(h, (s * 0.38, 1.22, 0.0), (s * 0.95, 1.38, -0.12), 0.14, skin, segs=7)
        horn(h, (s * 0.4, 1.22, 0.07), (s * 0.82, 1.33, -0.05), 0.07, ear_in, segs=6)
        if imp:
            horn(h, (s * 0.2, 1.52, 0.0), (s * 0.3, 1.88, -0.08), 0.1, 'imp_horn', segs=7, curve=(s * 0.06, 0.0, 0.0))
    horn(h, (0, 1.15, 0.4), (0, 1.12, 0.58), 0.07, 'imp_dark' if imp else 'goblin_dark', segs=6)
    face(h, hc, hr, hs, ex=0.36, ey=0.14, er=0.2, my=-0.46, mw=0.21, white='eye_yellow', brows=(0.45, 0.0, 1.3), mouth='fangs', cheeks=False)
    if hat == 'hood':
        sb(h, (0, 1.36, -0.04), 0.46, 'archer_hood', sq=(1.12, 0.78, 1.05), seg=10, rings=6)
        horn(h, (0.2, 1.65, -0.1), (0.5, 1.95, -0.25), 0.04, 'cream', segs=5, curve=(0.0, 0.1, 0))
        h.lathe([(0.42, 1.34), (0.46, 1.34), (0.46, 1.3), (0.42, 1.3)], 'wood_dark', segs=9, closed=True) if False else None
    al = c.part('armL', (-0.34, 0.8, 0))
    ar = c.part('armR', (0.34, 0.8, 0))
    if weapon == 'bow':
        stub_arm(al, (-0.34, 0.8, 0), (-0.42, 0.72, 0.42), 0.085, skin, skin, 0.11)
        al.tube(spline([(-0.44, 1.3, 0.4), (-0.44, 1.12, 0.62), (-0.44, 0.74, 0.68), (-0.44, 0.38, 0.62), (-0.44, 0.2, 0.4)], 3), lambda t: 0.03 + 0.02 * math.sin(PI * t), 'archer_wood', segs=6)
        al.limb((-0.44, 1.3, 0.4), (-0.44, 0.2, 0.4), 0.012, 0.012, 'cream', segs=4)
        stub_arm(ar, (0.34, 0.8, 0), (0.42, 0.55, 0.2), 0.085, skin, skin, 0.11)
    else:
        stub_arm(al, (-0.34, 0.8, 0), (-0.5, 0.42, 0.1), 0.085, skin, skin, 0.11)
        stub_arm(ar, (0.34, 0.8, 0), (0.5, 0.5, 0.2), 0.085, skin, skin, 0.11)
        if imp:
            ar.limb((0.5, 0.42, 0.12), (0.5, 1.1, 0.5), 0.03, 0.03, 'wood_dark', segs=6, smooth=True)
            horn(ar, (0.5, 1.0, 0.5), (0.5, 1.5, 0.55), 0.09, 'iron', segs=7)   # little trident / flame spear
            sb(ar, (0.5, 1.58, 0.56), 0.1, 'glow_orange', seg=7, rings=5)
        else:
            ar.limb((0.5, 0.42, 0.12), (0.52, 1.05, 0.5), 0.045, 0.06, 'wood', segs=7, smooth=True)
            sb(ar, (0.52, 1.18, 0.56), 0.21, 'wood_dark', sq=(1, 1.2, 1), seg=9, rings=6)
            for i in range(5):
                a = i * 1.25
                d = Vector((math.cos(a), 0.6 * math.sin(a * 2), math.sin(a))).normalized()
                horn(ar, tuple(Vector((0.52, 1.18, 0.56)) + d * 0.17), tuple(Vector((0.52, 1.18, 0.56)) + d * 0.34), 0.045, 'iron', segs=5)
    for nm, x in (('legL', -0.15), ('legR', 0.15)):
        l = c.part(nm, (x, 0.36, 0))
        stub_leg(l, x, 0.36, 0, 0.1, 0.36, skin if imp else 'goblin', 'wood_dark' if not imp else 'imp_dark', 0.14)
    if imp:
        for nm, s in (('wingL', -1), ('wingR', 1)):
            w = c.part(nm, (s * 0.2, 0.85, -0.2))
            pts = [(0, 0.1), (0.4, 0.45), (0.85, 0.5), (0.75, 0.2), (0.85, -0.05), (0.5, -0.0), (0.4, -0.25), (0.0, -0.15)]
            flat_poly(w, [(s * 0.2 + s * x, -0.2 + z * 0.9) for x, z in pts], 0.9, 0.03, 'imp_dark')
            w.tube([(s * 0.2, 0.9, -0.15), (s * 0.55, 1.0, 0.0), (s * 1.0, 0.95, 0.1)], [0.04, 0.03, 0.02], skin, segs=5)
    return c.done()


@reg(MONSTERS)
def goblin():
    return goblin_build('goblin')


@reg(MONSTERS)
def goblin_archer():
    return goblin_build('goblin_archer', weapon='bow', hat='hood', cloth='archer_cloth', H=1.6)


@reg(BOSSES)
def boss_imp():
    return goblin_build('boss_imp', skin='imp', cloth='imp_dark', ear_in='imp_belly', imp=True, H=1.5)


@reg(MONSTERS)
def bat():
    c = Cr('bat', 1.0)
    b = c.part('body', (0, 0.45, 0))
    sb(b, (0, 0.3, -0.06), 0.24, 'bat', sq=(1, 1.1, 1), seg=10, rings=7)
    sb(b, (0, 0.28, 0.06), 0.17, 'bat_belly', sq=(1, 1.1, 0.7), seg=8, rings=5)
    for s in (-1, 1):
        sb(b, (s * 0.1, 0.1, 0.0), 0.07, 'bat_ear', sq=(1, 0.8, 1.3), seg=6, rings=4)   # tiny feet
    horn(b, (0, 0.2, -0.22), (0, 0.1, -0.5), 0.05, 'bat', segs=6, curve=(0, -0.05, 0))
    h = c.part('head', (0, 0.55, 0.0))
    hc, hr, hs = (0, 0.66, 0.05), 0.36, (1.08, 0.98, 1.0)
    sb(h, hc, hr, 'bat', sq=hs, seg=12, rings=8)
    for s in (-1, 1):
        horn(h, (s * 0.16, 0.9, 0.0), (s * 0.34, 1.28, -0.04), 0.12, 'bat', segs=7)
        horn(h, (s * 0.16, 0.92, 0.06), (s * 0.3, 1.2, 0.03), 0.065, 'bat_ear', segs=6)
    face(h, hc, hr, hs, ex=0.36, ey=0.08, er=0.24, my=-0.45, mw=0.2, mouth='fangs', cheeks=True, look=(0, 0))
    for nm, s in (('wingL', -1), ('wingR', 1)):
        w = c.part(nm, (s * 0.2, 0.52, -0.02))
        pts = [(0, 0.2), (0.45, 0.3), (1.05, 0.16), (1.0, -0.05), (0.8, 0.0), (0.72, -0.3), (0.5, -0.1), (0.34, -0.38), (0.0, -0.22)]
        flat_poly(w, [(s * 0.2 + s * x, -0.02 + z) for x, z in pts], 0.52, 0.035, 'bat_wing')
        w.tube([(s * 0.2, 0.52, 0.05), (s * 0.7, 0.55, 0.28), (s * 1.22, 0.52, 0.14)], [0.045, 0.035, 0.02], 'bat', segs=6)
    return c.done()


def skeleton_build(name, kind='bow', eye_glow='glow_red', H=1.75):
    """skeleton family: archer (bow), warrior (sword + shield, purple eyes), mage (hat + robe + staff, purple eyes)"""
    c = Cr(name, H)
    b = c.part('body', (0, 0.7, 0))
    sb(b, (0, 0.98, -0.02), 0.2, 'bone_dark', sq=(0.75, 1.3, 0.7))
    for i in range(4):
        sb(b, (0, 1.04 - i * 0.1, 0.0), 0.26 - i * 0.015, 'bone', sq=(1.0, 0.16, 0.66), seg=9, rings=5)
    sb(b, (0, 0.62, 0), 0.22, 'bone', sq=(1.15, 0.6, 0.85))
    if kind == 'mage':
        b.lathe([(0, 0.2), (0.4, 0.2), (0.44, 0.22), (0.3, 0.62), (0.2, 1.1), (0, 1.12)], 'skel_mage_robe', segs=10, smooth=True)
    else:
        b.lathe([(0.17, 1.22), (0.25, 1.22), (0.25, 1.12), (0.17, 1.12)], 'skel_cloth' if kind == 'bow' else 'skel_mage_robe', segs=10, closed=True)
        horn(b, (0.1, 1.2, -0.12), (0.22, 0.9, -0.34), 0.07, 'skel_cloth' if kind == 'bow' else 'skel_mage_robe', segs=6)
    h = c.part('head', (0, 1.25, 0))
    hc, hr, hs = (0, 1.5, 0.02), 0.4, (1.05, 0.95, 1.0)
    sb(h, hc, hr, 'bone', sq=hs, seg=11, rings=7)
    sb(h, (0, 1.2, 0.1), 0.22, 'bone', sq=(1.05, 0.55, 0.9))
    for s in (-1, 1):
        x = s * 0.17
        zz = sz(hc, hr, hs, x, 1.53)
        slit_eye(h, x, 1.53, zz - 0.01, 0.15, eye_glow, s)
    sb(h, (0, 1.42, sz(hc, hr, hs, 0, 1.42) - 0.01), 0.04, 'ink', sq=(1, 1.2, 0.5), seg=6, rings=4)
    for i in range(5):
        h.box(((i - 2) * 0.065, 1.2, 0.3), (0.04, 0.05, 0.03), 'bone_dark')
    if kind == 'mage':
        h.lathe([(0, 1.82), (0.34, 1.78), (0.52, 1.7), (0.52, 1.66), (0, 1.66)], 'skel_mage_robe', segs=10)
        horn(h, (0, 1.72, 0), (0.0, 2.25, -0.2), 0.3, 'skel_mage_robe', segs=9, curve=(0, 0.05, -0.1))
    if kind == 'sword':
        sb(h, (0, 1.78, 0), 0.4, 'iron', sq=(1.1, 0.5, 1.1), seg=10, rings=5)     # little cap
        horn(h, (0, 1.9, -0.1), (0, 2.1, -0.4), 0.08, 'skel_mage', segs=6, curve=(0, 0.05, 0))
    al = c.part('armL', (-0.3, 1.1, 0))
    ar = c.part('armR', (0.3, 1.1, 0))
    if kind == 'bow':
        capsule(al, (-0.3, 1.1, 0), (-0.36, 0.95, 0.3), 0.055, 0.05, 'bone')
        sb(al, (-0.37, 0.92, 0.38), 0.07, 'bone')
        al.tube(spline([(-0.37, 1.45, 0.3), (-0.37, 1.3, 0.55), (-0.37, 0.92, 0.6), (-0.37, 0.55, 0.55), (-0.37, 0.4, 0.3)], 3), lambda t: 0.035 + 0.02 * math.sin(PI * t), 'archer_wood', segs=6)
        al.limb((-0.37, 1.45, 0.3), (-0.37, 0.4, 0.3), 0.012, 0.012, 'cream', segs=4)
        capsule(ar, (0.3, 1.1, 0), (0.4, 0.8, 0.12), 0.055, 0.05, 'bone')
        sb(ar, (0.4, 0.76, 0.14), 0.07, 'bone')
    else:
        capsule(al, (-0.3, 1.1, 0), (-0.42, 0.85, 0.22), 0.055, 0.05, 'bone')
        sb(al, (-0.43, 0.82, 0.27), 0.07, 'bone')
        capsule(ar, (0.3, 1.1, 0), (0.42, 0.85, 0.22), 0.055, 0.05, 'bone')
        sb(ar, (0.43, 0.82, 0.27), 0.07, 'bone')
        if kind == 'sword':
            cyl_c = (-0.5, 0.85, 0.42)
            al.cyl(cyl_c, 0.34, 0.34, 0.08, 10, 'iron', axis='z', smooth=True)
            sb(al, (-0.5, 0.85, 0.5), 0.1, 'skel_mage', sq=(1, 1, 0.6))
            ar.limb((0.43, 0.8, 0.27), (0.43, 0.82, 0.55), 0.035, 0.035, 'leather', segs=5, smooth=True)
            ar.box((0.43, 0.82, 0.58), (0.3, 0.05, 0.05), 'gold')
            horn(ar, (0.43, 0.82, 0.62), (0.43, 1.1, 1.15), 0.075, 'steel', segs=6)
        else:
            ar.limb((0.43, 0.2, 0.27), (0.43, 1.75, 0.3), 0.035, 0.04, 'wood', segs=6, smooth=True)
            sb(ar, (0.43, 1.9, 0.3), 0.15, 'glow_purple', seg=9, rings=6)
            for k in range(3):
                an = k * 2.1
                horn(ar, (0.43 + math.cos(an) * 0.1, 1.75, 0.3 + math.sin(an) * 0.1), (0.43 + math.cos(an) * 0.2, 1.98, 0.3 + math.sin(an) * 0.2), 0.04, 'wood', segs=5)
    for nm, x in (('legL', -0.14), ('legR', 0.14)):
        l = c.part(nm, (x, 0.68, 0))
        capsule(l, (x, 0.66, 0), (x, 0.2, 0.02), 0.06, 0.055, 'bone')
        sb(l, (x, 0.09, 0.07), 0.13, 'bone_dark', sq=(0.85, 0.6, 1.4))
    return c.done()


@reg(MONSTERS)
def skeleton_archer():
    return skeleton_build('skeleton_archer', 'bow', 'glow_red')


@reg(MONSTERS)
def skeleton_warrior():
    return skeleton_build('skeleton_warrior', 'sword', 'glow_purple')


@reg(MONSTERS)
def skeleton_mage():
    return skeleton_build('skeleton_mage', 'mage', 'glow_purple')


@reg(MONSTERS)
def cultist():
    c = Cr('cultist', 1.95)
    b = c.part('body')
    b.lathe([(0, 0.0), (0.62, 0.0), (0.64, 0.1), (0.5, 0.55), (0.34, 1.0), (0.3, 1.2), (0, 1.25)], 'cult_robe', segs=14, smooth=True)
    b.lathe([(0.62, 0.0), (0.66, 0.0), (0.66, 0.14), (0.62, 0.14)], 'cult_trim', segs=14, closed=True)
    sb(b, (0, 0.82, 0.31), 0.1, 'cult_trim', sq=(1, 1, 0.4), seg=8, rings=5)
    h = c.part('head', (0, 1.25, 0))
    hc = (0, 1.5, 0.0)
    sb(h, hc, 0.48, 'cult_robe', sq=(1.0, 1.0, 1.0), seg=12, rings=8)
    horn(h, (0, 1.85, -0.05), (0, 2.12, -0.35), 0.18, 'cult_robe_dark', segs=8, curve=(0, 0.05, 0.0))
    sb(h, (0, 1.47, 0.22), 0.34, 'ink', sq=(1, 1.0, 0.7), seg=10, rings=6)
    for s in (-1, 1):
        sb(h, (s * 0.15, 1.5, 0.43), 0.1, 'glow_pink', sq=(1.15, 0.52, 0.45), seg=8, rings=5, rot=Rz(s * 0.35))
    cheek(h, 0, 1.3, 0.5, 0.0)
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 0.38, 1.05, 0))
        capsule(a, (s * 0.38, 1.05, 0), (s * 0.5, 0.78, 0.28), 0.11, 0.1, 'cult_robe')
        sb(a, (s * 0.52, 0.74, 0.34), 0.085, 'cult_skin', seg=8, rings=5)
        if s > 0:
            sb(a, (0.55, 1.1, 0.5), 0.16, 'glow_purple', seg=9, rings=6)
            for k in range(4):
                an = k * 1.57 + 0.4
                sb(a, (0.55 + math.cos(an) * 0.28, 1.1 + math.sin(an) * 0.1, 0.5 + math.sin(an) * 0.28), 0.035, 'glow_pink', seg=5, rings=3)
    return c.done()


@reg(MONSTERS)
def bomber():
    c = Cr('bomber', 1.15)
    b = c.part('body')
    sb(b, (0, 0.72, -0.05), 0.98, 'bomber', sq=(1.0, 0.72, 1.12), seg=14, rings=9)
    sb(b, (0, 0.42, 0.1), 0.78, 'bomber_belly', sq=(0.95, 0.5, 1.0), seg=10, rings=6)
    for x, z, r in ((0.45, -0.1, 0.17), (-0.45, -0.1, 0.17), (0.0, -0.6, 0.15), (0.3, -0.55, 0.12), (-0.3, -0.55, 0.12)):
        y = 0.72 + 0.7 * math.sqrt(max(0.0, 1 - (x / 0.98) ** 2 - ((z + 0.05) / 1.1) ** 2))
        sb(b, (x, y - 0.03, z), r, 'bomber_dark', sq=(1, 0.35, 1), seg=8, rings=4)
    b.tube([(0, 1.43, -0.5), (0, 1.35, 0.1), (0, 1.1, 0.7)], [0.025, 0.03, 0.025], 'bomber_dark', segs=5)
    sb(b, (0, 1.2, -0.65), 0.2, 'fuse', seg=8, rings=5)
    sb(b, (0, 1.22, -0.66), 0.28, 'glow_orange', seg=8, rings=5, sq=(1, 1, 1))
    hd = c.part('head', (0, 0.6, 0.85))
    hc, hr, hs = (0, 0.62, 0.98), 0.5, (1.1, 0.95, 0.95)
    sb(hd, hc, hr, 'bomber_dark', sq=hs, seg=12, rings=8)
    face(hd, hc, hr, hs, ex=0.4, ey=0.15, er=0.26, my=-0.5, mw=0.2, mouth='smile', cheeks=True)
    for s in (-1, 1):
        hd.tube([(s * 0.2, 1.05, 0.95), (s * 0.4, 1.4, 1.2), (s * 0.5, 1.6, 1.15)], [0.04, 0.035, 0.03], 'bomber_dark', segs=5)
        sb(hd, (s * 0.5, 1.62, 1.15), 0.09, 'glow_orange' if s > 0 else 'bomber_belly', seg=7, rings=5)
    for nm, s in (('legL', -1), ('legR', 1)):
        l = c.part(nm, (s * 0.75, 0.4, 0))
        for z in (0.5, 0.0, -0.5):
            capsule(l, (s * 0.7, 0.4, z), (s * 1.02, 0.1, z + 0.05), 0.11, 0.09, 'bomber_dark')
    return c.done()


@reg(MONSTERS)
def brute():
    c = Cr('brute', 3.1)
    b = c.part('body', (0, 1.2, 0))
    sb(b, (0, 1.3, 0), 1.0, 'brute', sq=(1.12, 1.0, 0.95), seg=14, rings=9)
    sb(b, (0, 1.15, 0.38), 0.82, 'brute_belly', sq=(0.95, 1.0, 0.65), seg=12, rings=7)
    sb(b, (0, 1.85, -0.1), 0.78, 'brute', sq=(1.3, 0.55, 0.9), seg=10, rings=6)    # shoulders
    sb(b, (0, 0.62, 0), 0.62, 'brute_cloth', sq=(1.15, 0.6, 1.0), seg=10, rings=6)     # loincloth
    b.lathe([(0.68, 0.98), (0.72, 0.98), (0.72, 0.84), (0.68, 0.84)], 'wood_dark', segs=12, closed=True)
    h = c.part('head', (0, 2.0, 0.1))
    hc, hr, hs = (0, 2.38, 0.2), 0.62, (1.12, 0.92, 1.0)
    sb(h, hc, hr, 'brute', sq=hs, seg=14, rings=9)
    sb(h, (0, 2.1, 0.42), 0.34, 'brute_belly', sq=(1.2, 0.6, 0.8), seg=9, rings=6)   # muzzle
    for s in (-1, 1):
        horn(h, (s * 0.2, 1.98, 0.5), (s * 0.28, 2.3, 0.7), 0.09, 'boar_tusk', segs=7)
        horn(h, (s * 0.52, 2.62, 0.0), (s * 0.82, 2.78, -0.1), 0.2, 'brute', segs=8)
    face(h, hc, hr, hs, ex=0.34, ey=0.12, er=0.17, my=-0.42, mw=0.14, brows=(0.35, 0.05, 1.5), mouth='smile', cheeks=False)
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 1.0, 1.8, 0))
        capsule(a, (s * 1.0, 1.8, 0), (s * 1.18, 1.0, 0.25), 0.32, 0.28, 'brute')
        sb(a, (s * 1.2, 0.9, 0.3), 0.38, 'brute', seg=10, rings=6)
        if s > 0:
            a.limb((1.2, 0.9, 0.3), (1.25, 1.9, 0.9), 0.1, 0.14, 'wood', segs=8, smooth=True)
            sb(a, (1.27, 2.15, 1.0), 0.42, 'wood_dark', sq=(1, 1.25, 1), seg=10, rings=7)
            for i in range(7):
                an = i * 0.95
                d = Vector((math.cos(an), 0.7 * math.sin(an * 2), math.sin(an))).normalized()
                horn(a, tuple(Vector((1.27, 2.15, 1.0)) + d * 0.36), tuple(Vector((1.27, 2.15, 1.0)) + d * 0.66), 0.09, 'iron', segs=6)
    for nm, x in (('legL', -0.42), ('legR', 0.42)):
        l = c.part(nm, (x, 0.8, 0))
        stub_leg(l, x, 0.8, 0, 0.34, 0.8, 'brute', 'brute_dark', 0.44, 0.1)
    return c.done()


@reg(MONSTERS)
def zombie():
    c = Cr('zombie', 2.1)
    b = c.part('body', (0, 0.9, 0))
    sb(b, (0, 1.12, 0), 0.5, 'zombie_cloth2', sq=(1.0, 1.15, 0.85), seg=10, rings=7)
    sb(b, (0, 0.62, 0), 0.42, 'zombie_cloth', sq=(1.05, 0.7, 0.9), seg=9, rings=6)
    for k in range(3):   # tattered hem
        sb(b, (-0.2 + k * 0.2, 0.78, 0.36 - abs(k - 1) * 0.04), 0.1, 'zombie_cloth2', sq=(1, 1.4, 0.5), seg=6, rings=4)
    sb(b, (0.22, 1.28, 0.37), 0.14, 'zombie_cloth', sq=(1, 1, 0.4), seg=7, rings=4)    # patch
    h = c.part('head', (0.0, 1.5, 0.0))
    hc, hr, hs = (0.06, 1.88, 0.06), 0.52, (1.05, 0.95, 1.0)
    sb(h, hc, hr, 'zombie', sq=hs, seg=12, rings=8, rot=Rz(0.12))
    for k in range(4):
        horn(h, (0.0 + k * 0.1 - 0.1, 2.32 - abs(k - 1.5) * 0.05, -0.02), (-0.05 + k * 0.14, 2.62 - abs(k - 1.5) * 0.06, -0.08), 0.06, 'zombie_dark', segs=5)
    x1, x2 = hc[0] - 0.2, hc[0] + 0.2
    eye(h, x1, 1.93, sz(hc, hr, hs, x1, 1.93) - 0.04, 0.17, white='eye_yellow', look=(0.3, 0.0))
    eye(h, x2, 1.9, sz(hc, hr, hs, x2, 1.9) - 0.03, 0.12, white='eye_yellow', look=(-0.2, 0.2))
    brow(h, x1, 2.14, sz(hc, hr, hs, x1, 2.14) + 0.005, 0.2, -0.3, th=0.04)
    sb(h, (hc[0], 1.66, sz(hc, hr, hs, hc[0], 1.66) - 0.07), 0.15, 'mouth', sq=(1.3, 0.8, 0.5), seg=9, rings=5)
    sb(h, (hc[0] + 0.02, 1.62, sz(hc, hr, hs, hc[0], 1.66) - 0.03), 0.08, 'tongue', sq=(1.2, 0.6, 0.5), seg=6, rings=4)
    for xx in (-0.07, 0.1):
        fang(h, hc[0] + xx, 1.7, sz(hc, hr, hs, hc[0], 1.7) - 0.02, h=0.07, r=0.025)
    cheek(h, hc[0] - 0.38, 1.76, sz(hc, hr, hs, hc[0] - 0.38, 1.76) - 0.01, 0.07, 'zombie_dark')
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 0.52, 1.35, 0))
        capsule(a, (s * 0.52, 1.35, 0), (s * 0.5, 1.2, 0.8), 0.13, 0.11, 'zombie')
        sb(a, (s * 0.5, 1.2, 0.8), 0.12, 'zombie_cloth2', sq=(1, 1, 1), seg=8, rings=5)
        sb(a, (s * 0.5, 1.2, 0.96), 0.13, 'zombie', seg=8, rings=5)
    for nm, x in (('legL', -0.22), ('legR', 0.22)):
        l = c.part(nm, (x, 0.55, 0))
        stub_leg(l, x, 0.55, 0, 0.16, 0.55, 'zombie_cloth', 'zombie', 0.2, 0.08)
    return c.done()


@reg(MONSTERS)
def wraith():
    c = Cr('wraith', 1.95)
    b = c.part('body')
    prof = [(0.0, 0.3), (0.2, 0.34), (0.42, 0.55), (0.55, 0.95), (0.55, 1.3), (0.42, 1.62), (0.2, 1.8), (0.0, 1.86)]
    b.lathe(prof, 'wraith', segs=12, smooth=True)
    for i in range(4):   # wispy hem
        a = i * PI / 2 + 0.4
        horn(b, (math.sin(a) * 0.24, 0.55, math.cos(a) * 0.24), (math.sin(a) * 0.5, 0.12, math.cos(a) * 0.5), 0.14, 'wraith', segs=7, curve=(0, 0.05, 0))
    horn(b, (0, 0.5, 0.1), (0, 0.05, 0.35), 0.15, 'wraith', segs=7)
    horn(b, (0, 1.78, -0.1), (0.0, 2.1, -0.55), 0.14, 'wraith_dark', segs=7, curve=(0, 0.12, 0))
    for s in (-1, 1):
        x = s * 0.2
        zf = 0.5 * math.sqrt(max(0.0, 1 - (1.35 - 1.35) ** 2)) * 0.9
        sb(b, (x, 1.32, 0.46), 0.15, 'eye_black', sq=(0.72, 1.15, 0.5), seg=9, rings=6)
        sb(b, (x + 0.04, 1.38, 0.53), 0.045, 'shine', sq=(1, 1, 0.5), seg=5, rings=3)
        cheek(b, s * 0.36, 1.17, 0.44, 0.075)
    sb(b, (0, 1.12, 0.52), 0.07, 'mouth', sq=(1.2, 0.9, 0.5), seg=7, rings=4)
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 0.5, 1.1, 0.05))
        capsule(a, (s * 0.5, 1.1, 0.05), (s * 0.68, 0.8, 0.28), 0.1, 0.075, 'wraith')
        sb(a, (s * 0.7, 0.77, 0.32), 0.1, 'wraith_dark', seg=7, rings=5)
    return c.done()


def rock(b, pos, r, mat, sq=(1, 1, 1), seed=0.0, seg=8, rings=5, amp=0.12):
    b.blob(pos, r, mat, sq=sq, seg=seg, rings=rings, amp=amp, freq=1.5, seed=seed)


@reg(MONSTERS)
def crystal_golemite():
    c = Cr('crystal_golemite', 2.0)
    b = c.part('body', (0, 0.9, 0))
    rock(b, (0, 0.95, 0), 0.64, 'rock_plum', (1.0, 1.1, 0.95), 1.0, 10, 7)
    rock(b, (0, 0.5, 0), 0.5, 'rock_plum', (1.1, 0.7, 1.0), 2.0)
    for pos, h, r, rot in (((0, 1.4, -0.35), 0.9, 0.17, Rx(-0.3)), ((0.3, 1.3, -0.3), 0.65, 0.13, Rx(-0.3) @ Rz(-0.5)), ((-0.32, 1.28, -0.28), 0.7, 0.14, Rx(-0.3) @ Rz(0.5)),
                           ((0.0, 1.0, -0.55), 0.55, 0.12, Rx(-1.2))):
        crystal(b, pos, h, r, 'golemite', rot)
    sb(b, (0, 0.95, 0.52), 0.2, 'golemite', sq=(1, 1.2, 0.5), seg=8, rings=5)
    h = c.part('head', (0, 1.5, 0))
    hc, hr, hs = (0, 1.82, 0.04), 0.42, (1.1, 0.95, 1.0)
    h.blob(hc, hr, 'rock_plum', sq=hs, seg=10, rings=7, amp=0.08, freq=1.5, seed=3.0)
    crystal(h, (0, 2.12, 0.0), 0.5, 0.11, 'golemite')
    crystal(h, (0.25, 2.06, 0.0), 0.35, 0.08, 'golemite', Rz(-0.5))
    face(h, hc, hr, hs, ex=0.36, ey=0.1, er=0.2, my=-0.4, mw=0.17, white='golemite', brows=(0.35, 0.0, 1.2), cheeks=False)
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 0.7, 1.35, 0))
        rock(a, (s * 0.78, 1.0, 0.1), 0.26, 'rock_plum', (1, 1.5, 1), s + 4)
        rock(a, (s * 0.84, 0.58, 0.2), 0.3, 'rock_plum', (1.1, 1, 1.1), s + 8)
        crystal(a, (s * 0.84, 0.58, 0.4), 0.4, 0.09, 'golemite', Rx(1.3))
        crystal(a, (s * 0.95, 0.66, 0.3), 0.3, 0.07, 'golemite', Rx(1.0) @ Rz(-s * 0.5))
    for nm, x in (('legL', -0.3), ('legR', 0.3)):
        l = c.part(nm, (x, 0.5, 0))
        rock(l, (x, 0.28, 0.02), 0.28, 'rock_plum', (1, 1.3, 1.1), 11 + x)
    return c.done()


@reg(MONSTERS)
def bandit():
    c = Cr('bandit', 1.85)
    b = c.part('body', (0, 0.7, 0))
    sb(b, (0, 0.88, 0), 0.4, 'bandit_cloth', sq=(1, 1.05, 0.85), seg=10, rings=6)
    sb(b, (0, 0.55, 0), 0.36, 'goblin_cloth' if False else 'wood_dark', sq=(1.05, 0.6, 0.9), seg=8, rings=5)
    b.lathe([(0.4, 0.74), (0.43, 0.74), (0.43, 0.66), (0.4, 0.66)], 'leather', segs=10, closed=True)
    b.lathe([(0.24, 1.2), (0.3, 1.2), (0.3, 1.1), (0.24, 1.1)], 'bandit_scarf', segs=10, closed=True)
    horn(b, (-0.15, 1.17, -0.18), (-0.45, 0.9, -0.45), 0.08, 'bandit_scarf', segs=6, curve=(0, 0.1, 0))
    h = c.part('head', (0, 1.2, 0))
    hc, hr, hs = (0, 1.5, 0.03), 0.43, (1.06, 0.97, 1.0)
    sb(h, hc, hr, 'bandit_skin', sq=hs, seg=11, rings=7)
    sb(h, (0, 1.62, -0.02), 0.48, 'bandit_hat', sq=(1.05, 0.62, 1.08), seg=10, rings=6)
    h.lathe([(0.0, 1.57), (0.62, 1.57), (0.62, 1.52), (0.0, 1.52)], 'bandit_hat', segs=12)
    horn(h, (0.1, 1.9, 0.0), (0.35, 2.15, -0.35), 0.04, 'bandit_scarf', segs=5, curve=(0, 0.1, 0))
    my = 1.5
    sb(h, (0, 1.5, sz(hc, hr, hs, 0, 1.5) - 0.02), 0.2, 'bandit_mask', sq=(2.0, 0.48, 0.5), seg=10, rings=5)
    for s in (-1, 1):
        x = s * 0.17
        eye(h, x, 1.5, sz(hc, hr, hs, x, 1.5) + 0.0, 0.1, look=(s * 0.4, 0), sq=(1, 1.0))
        brow(h, x, 1.64, sz(hc, hr, hs, x, 1.64) + 0.01, 0.15, s * 0.35, th=0.035)
        cheek(h, s * 0.3, 1.34, sz(hc, hr, hs, s * 0.3, 1.34) - 0.01, 0.065)
    smile(h, 0.03, 1.3, sz(hc, hr, hs, 0, 1.3) + 0.003, w=0.1, depth=0.025, th=0.014)
    fang(h, 0.06, 1.31, sz(hc, hr, hs, 0, 1.3) + 0.01, h=0.04, r=0.015)
    al = c.part('armL', (-0.4, 1.0, 0))
    stub_arm(al, (-0.4, 1.0, 0), (-0.52, 0.62, 0.12), 0.09, 'bandit_cloth', 'bandit_skin', 0.1)
    ar = c.part('armR', (0.4, 1.0, 0))
    stub_arm(ar, (0.4, 1.0, 0), (0.52, 0.66, 0.24), 0.09, 'bandit_cloth', 'bandit_skin', 0.1)
    ar.limb((0.52, 0.66, 0.3), (0.52, 0.7, 0.62), 0.04, 0.035, 'leather', segs=6, smooth=True)     # dagger
    ar.rbox((0.52, 0.7, 0.72), (0.06, 0.1, 0.3), 'steel', r=0.02, rot=None, smooth=True)
    horn(ar, (0.52, 0.7, 0.85), (0.52, 0.7, 1.1), 0.06, 'steel', segs=6)
    for nm, x in (('legL', -0.17), ('legR', 0.17)):
        l = c.part(nm, (x, 0.42, 0))
        stub_leg(l, x, 0.42, 0, 0.12, 0.42, 'wood_dark', 'leather', 0.16)
    return c.done()


@reg(MONSTERS)
def boar():
    c = Cr('boar', 1.5)
    b = c.part('body', (0, 0.9, 0))
    sb(b, (0, 0.92, -0.05), 0.82, 'boar', sq=(0.95, 0.88, 1.28), seg=12, rings=8)
    sb(b, (0, 0.6, 0.0), 0.62, 'boar_belly', sq=(0.9, 0.6, 1.2), seg=9, rings=6)
    for k in range(7):
        z = 0.7 - k * 0.24
        horn(b, (0, 1.64 - abs(k - 2) * 0.03 - 0.06 * (k > 3), z), (0, 1.95 - abs(k - 2) * 0.04, z - 0.08), 0.1, 'boar_mane', segs=6)
    b.tube([(0, 1.1, -1.0), (0.05, 1.3, -1.25), (-0.08, 1.45, -1.3), (0.0, 1.4, -1.15)], [0.07, 0.06, 0.05, 0.04], 'boar_mane', segs=6)
    h = c.part('head', (0, 1.0, 0.85))
    hc, hr, hs = (0, 0.98, 1.2), 0.55, (1.0, 0.95, 1.0)
    sb(h, hc, hr, 'boar', sq=hs, seg=11, rings=7)
    h.cyl((0, 0.82, 1.7), 0.27, 0.3, 0.3, 9, 'boar_snout', axis='z', smooth=True)
    for s in (-1, 1):
        sb(h, (s * 0.1, 0.84, 1.87), 0.05, 'ink', sq=(1, 1.3, 0.6), seg=6, rings=4)
        horn(h, (s * 0.22, 0.7, 1.6), (s * 0.42, 1.1, 1.7), 0.07, 'boar_tusk', segs=6, curve=(s * 0.1, 0.0, 0.0))
        horn(h, (s * 0.38, 1.4, 1.0), (s * 0.52, 1.72, 0.98), 0.14, 'boar', segs=7)
    face(h, hc, hr, hs, ex=0.52, ey=0.22, er=0.19, my=-0.9, mw=0.1, brows=(0.4, 0.0, 1.2), mouth='none', cheeks=True)
    for nm, x, z in (('legFL', 0.34, 0.5), ('legFR', -0.34, 0.5), ('legBL', 0.34, -0.55), ('legBR', -0.34, -0.55)):
        l = c.part(nm, (x, 0.5, z))
        stub_leg(l, x, 0.5, z, 0.17, 0.5, 'boar', 'wood_dark', 0.18, 0.03)
    return c.done()


@reg(MONSTERS)
def rock_crab():
    c = Cr('rock_crab', 1.3)
    b = c.part('body')
    sb(b, (0, 0.5, 0), 0.8, 'crab', sq=(1.2, 0.58, 1.0), seg=12, rings=7)
    sb(b, (0, 0.38, 0.15), 0.7, 'crab_belly', sq=(1.1, 0.45, 0.9), seg=9, rings=5)
    rock(b, (0, 0.88, -0.2), 0.7, 'crab_rock', (1.2, 0.72, 1.05), 5.0, 10, 6)
    rock(b, (0.5, 0.95, -0.35), 0.28, 'crab_rock', (1, 0.8, 1), 6.0)
    rock(b, (-0.45, 1.0, -0.1), 0.25, 'crab_rock_dark', (1, 0.8, 1), 7.0)
    crystal(b, (0.05, 1.2, -0.3), 0.4, 0.09, 'glow_cyan', Rx(-0.2))
    for s in (-1, 1):
        b.tube([(s * 0.28, 0.8, 0.55), (s * 0.3, 1.1, 0.7), (s * 0.3, 1.3, 0.78)], [0.06, 0.05, 0.05], 'crab', segs=6)
        eye(b, s * 0.3, 1.36, 0.82, 0.17, look=(0, -0.2))
    smile(b, 0, 0.5, 0.78, w=0.14, depth=0.04, th=0.012)
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 0.85, 0.6, 0.45))
        capsule(a, (s * 0.85, 0.6, 0.45), (s * 1.1, 0.62, 0.9), 0.14, 0.14, 'crab')
        sb(a, (s * 1.15, 0.7, 1.15), 0.33, 'crab', sq=(1.1, 0.85, 1.1), seg=9, rings=6)
        horn(a, (s * 1.0, 0.82, 1.3), (s * 0.62, 0.84, 1.78), 0.17, 'crab_dark', segs=7, curve=(s * -0.1, 0, 0.05))
        horn(a, (s * 1.3, 0.62, 1.3), (s * 0.8, 0.6, 1.9), 0.15, 'crab_dark', segs=7, curve=(s * -0.2, 0, 0.0))
    for nm, s in (('legL', -1), ('legR', 1)):
        l = c.part(nm, (s * 0.8, 0.5, 0))
        for z in (0.3, -0.15, -0.55):
            l.tube([(s * 0.8, 0.5, z), (s * 1.15, 0.65, z - 0.05), (s * 1.35, 0.1, z - 0.1)], [0.1, 0.085, 0.07], 'crab_dark', segs=6)
    return c.done()


def hydra_head_build(name, u, H, boss=False):
    """one hydra head on a swaying neck: body (mound) -> neck1 -> neck2 -> head -> jaw (nested joints, each child pivots in its parent)"""
    c = Cr(name, H)
    b = c.part('body')
    sb(b, (0, 0.28 * u, 0), 0.75 * u, 'hydra', sq=(1.0, 0.5, 1.0), seg=11, rings=6)
    sb(b, (0, 0.22 * u, 0.1 * u), 0.6 * u, 'hydra_belly', sq=(1.0, 0.4, 1.0), seg=9, rings=5)
    for k in range(5):
        a = k * 1.26
        sb(b, (math.sin(a) * 0.72 * u, 0.1 * u, math.cos(a) * 0.72 * u), 0.2 * u, 'hydra_dark', sq=(1, 0.6, 1), seg=7, rings=4)
    n1 = c.part('neck1', (0, 0.45 * u, 0))
    n1.tube([(0, 0.45 * u, 0), (0, 1.2 * u, 0.0), (0, 1.9 * u, 0.1 * u)], [0.5 * u, 0.44 * u, 0.4 * u], 'hydra', segs=9, cap=False)
    n1.tube([(0, 0.6 * u, 0.3 * u), (0, 1.2 * u, 0.33 * u), (0, 1.8 * u, 0.38 * u)], [0.22 * u, 0.2 * u, 0.18 * u], 'hydra_belly', segs=7, cap=True)
    for k in range(3):
        horn(n1, (0, (0.9 + k * 0.45) * u, -0.38 * u), (0, (1.12 + k * 0.45) * u, -0.62 * u), 0.1 * u, 'hydra_dark', segs=6)
    n2 = c.part('neck2', (0, 1.9 * u, 0.1 * u), 'neck1')
    n2.tube([(0, 1.9 * u, 0.1 * u), (0, 2.5 * u, 0.25 * u), (0, 3.0 * u, 0.5 * u)], [0.4 * u, 0.36 * u, 0.34 * u], 'hydra', segs=9, cap=False)
    n2.tube([(0, 2.0 * u, 0.45 * u), (0, 2.5 * u, 0.6 * u), (0, 2.95 * u, 0.82 * u)], [0.18 * u, 0.17 * u, 0.15 * u], 'hydra_belly', segs=7, cap=True)
    for k in range(2):
        horn(n2, (0, (2.2 + k * 0.4) * u, 0.0), (0, (2.4 + k * 0.4) * u, -0.2 * u), 0.09 * u, 'hydra_dark', segs=6)
    hd = c.part('head', (0, 3.0 * u, 0.5 * u), 'neck2')
    hc, hr, hs = (0, 3.4 * u, 0.8 * u), 0.62 * u, (1.0, 0.88, 1.12)
    sb(hd, hc, hr, 'hydra', sq=hs, seg=11, rings=7)
    sb(hd, (0, 3.25 * u, 1.45 * u), 0.4 * u, 'hydra', sq=(1.0, 0.7, 1.2), seg=9, rings=6)     # snout
    for s in (-1, 1):
        sb(hd, (s * 0.12 * u, 3.3 * u, 1.9 * u), 0.05 * u, 'ink', sq=(1, 1.3, 0.6), seg=6, rings=4)
        horn(hd, (s * 0.38 * u, 3.8 * u, 0.55 * u), (s * 0.55 * u, 4.35 * u, 0.2 * u), 0.14 * u, 'hydra_dark', segs=7, curve=(s * 0.1 * u, 0, -0.1 * u))
        horn(hd, (s * 0.55 * u, 3.55 * u, 0.55 * u), (s * 0.95 * u, 3.7 * u, 0.2 * u), 0.1 * u, 'hydra_belly', segs=6)   # frill
        fang(hd, s * 0.22 * u, 3.1 * u, 1.62 * u, h=0.3 * u, r=0.07 * u)
    face(hd, hc, hr, hs, ex=0.52, ey=0.28, er=0.22, my=-1.5, mw=0.1, brows=(0.4, 0.0, 1.2), mouth='none', cheeks=True)
    jw = c.part('jaw', (0, 3.15 * u, 0.9 * u), 'head')
    sb(jw, (0, 3.08 * u, 1.35 * u), 0.34 * u, 'hydra_dark', sq=(1.0, 0.42, 1.25), seg=9, rings=5)
    sb(jw, (0, 3.14 * u, 1.45 * u), 0.2 * u, 'tongue', sq=(1.0, 0.3, 1.1), seg=7, rings=4)
    return c.done()


@reg(MONSTERS)
def lake_hydra():
    return hydra_head_build('lake_hydra', 0.72, 2.9)


@reg(BOSSES)
def boss_hydra_head():
    return hydra_head_build('boss_hydra_head', 2.0, 8.5, True)


@reg(MONSTERS)
def scarab():
    c = Cr('scarab', 0.6)
    b = c.part('body')
    sb(b, (0, 0.34, -0.05), 0.4, 'scarab', sq=(1.0, 0.72, 1.2), seg=10, rings=6)
    b.tube([(0, 0.62, -0.5), (0, 0.7, 0.0), (0, 0.6, 0.38)], [0.012, 0.016, 0.012], 'scarab_dark', segs=4)
    sb(b, (0, 0.22, 0.05), 0.3, 'scarab_belly', sq=(1.0, 0.5, 1.1), seg=8, rings=5)
    for z in (-0.25, 0.02):
        b.rbox((0, 0.64 - (z < -0.1) * 0.03, z), (0.18, 0.03, 0.2), 'scarab_gold', r=0.012, smooth=True)
    hd = c.part('head', (0, 0.4, 0.3))
    hc, hr, hs = (0, 0.4, 0.46), 0.26, (1.1, 0.9, 0.95)
    sb(hd, hc, hr, 'scarab_dark', sq=hs)
    horn(hd, (0, 0.5, 0.64), (0, 0.72, 0.74), 0.06, 'scarab_gold', segs=6)
    face(hd, hc, hr, hs, ex=0.5, ey=0.18, er=0.3, my=-0.4, mw=0.1, mouth='smile', cheeks=False)
    for nm, s in (('legL', -1), ('legR', 1)):
        l = c.part(nm, (s * 0.3, 0.25, 0))
        for z in (0.2, -0.1, -0.35):
            capsule(l, (s * 0.3, 0.25, z), (s * 0.5, 0.06, z + 0.04), 0.045, 0.04, 'scarab_dark', 6)
    return c.done()


@reg(MONSTERS)
def shieldbearer():
    c = Cr('shieldbearer', 2.3)
    b = c.part('body', (0, 0.8, 0))
    sb(b, (0, 1.15, 0), 0.55, 'shield_steel', sq=(1.05, 1.1, 0.92), seg=10, rings=7)
    sb(b, (0, 1.12, 0.38), 0.4, 'shield_red', sq=(0.8, 1.15, 0.4), seg=8, rings=6)
    b.lathe([(0.0, 0.62), (0.62, 0.55), (0.66, 0.5), (0.48, 0.92), (0, 0.95)], 'shield_red', segs=11, smooth=True)
    b.lathe([(0.55, 0.9), (0.58, 0.9), (0.58, 0.82), (0.55, 0.82)], 'shield_gold', segs=11, closed=True)
    h = c.part('head', (0, 1.6, 0))
    hc, hr, hs = (0, 1.95, 0.02), 0.45, (1.0, 0.96, 1.0)
    sb(h, hc, hr, 'shield_skin', sq=hs, seg=11, rings=7)
    sb(h, (0, 2.1, -0.04), 0.5, 'shield_steel', sq=(1.05, 0.78, 1.08), seg=10, rings=6)
    h.lathe([(0.47, 2.02), (0.52, 2.02), (0.52, 1.97), (0.47, 1.97)], 'shield_gold', segs=11, closed=True)
    b2 = h.tube([(0, 2.5, 0.28), (0, 2.62, 0.0), (0, 2.5, -0.35)], [0.05, 0.1, 0.05], 'shield_red', segs=7)
    for s in (-1, 1):
        x = s * 0.18
        eye(h, x, 1.93, sz(hc, hr, hs, x, 1.93) - 0.02, 0.12, look=(0, 0))
        cheek(h, s * 0.31, 1.78, sz(hc, hr, hs, s * 0.31, 1.78) - 0.01, 0.07)
        brow(h, x, 2.07, sz(hc, hr, hs, x, 2.07) + 0.01, 0.15, s * 0.3, th=0.035)
    smile(h, 0, 1.7, sz(hc, hr, hs, 0, 1.7) + 0.003, w=0.1, depth=0.03, th=0.014)
    al = c.part('armL', (-0.58, 1.4, 0))
    capsule(al, (-0.58, 1.4, 0), (-0.72, 1.05, 0.3), 0.13, 0.12, 'shield_steel')
    al.cyl((-0.78, 1.1, 0.62), 0.62, 0.62, 0.12, 12, 'shield_steel', axis='z', smooth=True)
    al.lathe([(0.66, 0.0), (0.7, 0.0), (0.7, 0.06), (0.66, 0.06)], 'shield_gold', segs=12, closed=True, M=Rx(PI / 2), pos=(-0.78, 1.1, 0.61))
    sb(al, (-0.78, 1.1, 0.7), 0.17, 'shield_gold', sq=(1, 1, 0.6), seg=9, rings=6)
    for k in range(3):
        a = k * 2.09 + PI / 2
        sb(al, (-0.78 + math.cos(a) * 0.4, 1.1 + math.sin(a) * 0.4, 0.69), 0.07, 'shield_red', sq=(1, 1, 0.5), seg=6, rings=4)
    ar = c.part('armR', (0.58, 1.4, 0))
    capsule(ar, (0.58, 1.4, 0), (0.7, 1.0, 0.3), 0.13, 0.12, 'shield_steel')
    sb(ar, (0.71, 0.96, 0.34), 0.12, 'shield_skin')
    ar.limb((0.71, 0.95, 0.3), (0.71, 1.0, 1.1), 0.04, 0.04, 'wood', segs=6, smooth=True)       # spear
    horn(ar, (0.71, 1.0, 1.05), (0.71, 1.0, 1.55), 0.1, 'steel', segs=6)
    for nm, x in (('legL', -0.25), ('legR', 0.25)):
        l = c.part(nm, (x, 0.62, 0))
        stub_leg(l, x, 0.62, 0, 0.18, 0.62, 'shield_steel', 'shield_red', 0.22, 0.08)
    return c.done()


@reg(MONSTERS)
def sporecap():
    c = Cr('sporecap', 1.9)
    b = c.part('body', (0, 0.6, 0))
    bc, br, bs = (0, 0.75, 0), 0.52, (1.0, 1.2, 1.0)
    sb(b, bc, br, 'sporecap_stem', sq=bs, seg=11, rings=7)
    face(b, bc, br, bs, ex=0.4, ey=0.12, er=0.2, my=-0.32, mw=0.2, mouth='open', brows=(0.25, -0.1, 1.1))
    for s in (-1, 1):
        sb(b, (s * 0.2, 0.12, 0.08), 0.2, 'sporecap_stem', sq=(1, 0.6, 1.3), seg=8, rings=5)
    cap = c.part('cap', (0, 1.2, 0))
    sb(cap, (0, 1.45, 0), 0.92, 'sporecap', sq=(1.15, 0.62, 1.15), seg=12, rings=7)
    cap.lathe([(0.0, 1.17), (0.84, 1.15), (1.0, 1.2), (0.0, 1.22)], 'sporecap_stem', segs=12)
    for k, (x, z, r) in enumerate(((0.45, 0.4, 0.17), (-0.5, 0.2, 0.2), (0.1, -0.55, 0.18), (0.0, 0.7, 0.13), (-0.25, -0.2, 0.12), (0.62, -0.25, 0.12))):
        y = 1.45 + 0.57 * math.sqrt(max(0.0, 1 - (x / 1.06) ** 2 - (z / 1.06) ** 2))
        sb(cap, (x, y - 0.03, z), r, 'sporecap_spot', sq=(1, 0.35, 1), seg=8, rings=4)
    for k, (x, y, z) in enumerate(((0.9, 1.85, 0.4), (-0.8, 2.1, -0.3), (0.2, 2.35, 0.5))):
        sb(cap, (x, y, z), 0.08, 'glow_purple', seg=6, rings=4)
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 0.5, 0.78, 0.0))
        capsule(a, (s * 0.5, 0.78, 0.0), (s * 0.68, 0.5, 0.18), 0.09, 0.08, 'sporecap_stem')
    return c.done()


def wolf_build(name, fur, dark, belly, hound=False, H=1.45, k=1.0, tipglow=None):
    c = Cr(name, H, k)
    b = c.part('body', (0, 0.9, 0))
    sb(b, (0, 0.92, -0.05), 0.66, fur, sq=(0.86, 0.82, 1.38), seg=11, rings=7)
    sb(b, (0, 0.72, 0.35), 0.5, belly, sq=(0.85, 0.8, 0.85), seg=9, rings=6)
    for k in range(5):   # mane / back ridge
        z = 0.5 - k * 0.3
        horn(b, (0, 1.45 - abs(k - 1) * 0.02, z), (0, 1.72 - abs(k - 1) * 0.04, z - 0.12), 0.1, dark, segs=6)
    if hound:
        for x, z in ((0.3, 0.1), (-0.3, -0.25), (0.15, -0.55)):
            sb(b, (x, 1.12 + 0.05, z), 0.1, 'glow_orange', sq=(1, 0.4, 1), seg=7, rings=4)
    h = c.part('head', (0, 1.05, 0.8))
    hc, hr, hs = (0, 1.12, 1.05), 0.46, (1.05, 0.95, 1.0)
    sb(h, hc, hr, fur, sq=hs, seg=11, rings=7)
    sb(h, (0, 0.98, 1.45), 0.27, belly if not hound else dark, sq=(0.9, 0.72, 1.35), seg=9, rings=5)
    sb(h, (0, 1.04, 1.78), 0.09, 'ink', sq=(1.2, 0.9, 0.9), seg=7, rings=4)
    for s in (-1, 1):
        horn(h, (s * 0.26, 1.42, 0.95), (s * 0.34, 1.82, 0.85), 0.14, fur, segs=7, curve=(s * 0.03, 0, 0))
        horn(h, (s * 0.26, 1.44, 1.0), (s * 0.32, 1.74, 0.93), 0.07, 'bat_ear' if not hound else 'glow_orange', segs=6)
    face(h, hc, hr, hs, ex=0.5, ey=0.25, er=0.2, my=-0.8, mw=0.1, white='eye_yellow' if not hound else 'glow_yellow', brows=(0.35, 0.05, 1.2), mouth='none', cheeks=True)
    smile(h, 0, 0.8, 1.66, w=0.12, depth=0.03, th=0.013)
    sb(h, (0, 0.72, 1.55), 0.08, 'tongue', sq=(1, 0.5, 1.2), seg=6, rings=4)
    t = c.part('tail', (0, 1.1, -0.85))
    if hound:
        for k, (y, z, r, m) in enumerate(((1.15, -1.0, 0.13, dark), (1.3, -1.2, 0.15, 'glow_orange'), (1.48, -1.32, 0.18, 'glow_orange'), (1.72, -1.4, 0.15, 'glow_yellow'))):
            sb(t, (0, y, z), r, m)
    else:
        t.tube([(0, 1.1, -0.85), (0, 1.35, -1.25), (0, 1.5, -1.65)], [0.1, 0.17, 0.12], fur, segs=7)
        sb(t, (0, 1.5, -1.68), 0.16, tipglow or belly, sq=(1, 1, 1.2))
    for nm, x, z in (('legFL', 0.3, 0.55), ('legFR', -0.3, 0.55), ('legBL', 0.3, -0.6), ('legBR', -0.3, -0.6)):
        l = c.part(nm, (x, 0.55, z))
        stub_leg(l, x, 0.55, z, 0.14, 0.55, fur, dark if not hound else 'hound_glow', 0.17, 0.04)
    return c.done()


@reg(MONSTERS)
def direwolf():
    return wolf_build('direwolf', 'wolf', 'wolf_dark', 'wolf_belly', k=0.72)


@reg(MONSTERS)
def hellhound():
    return wolf_build('hellhound', 'hound', 'hound_dark', 'hound', hound=True, k=0.72)


@reg(MONSTERS)
def haunted_armor():
    c = Cr('haunted_armor', 2.6)
    b = c.part('body', (0, 0.9, 0))
    sb(b, (0, 1.4, 0), 0.62, 'haunted', sq=(1.05, 1.2, 0.9), seg=11, rings=7)
    sb(b, (0, 1.25, 0.4), 0.38, 'haunted_dark', sq=(0.9, 1.0, 0.4), seg=8, rings=6)
    b.lathe([(0.42, 0.92), (0.72, 0.9), (0.76, 0.74), (0.5, 0.7), (0.4, 0.72)], 'haunted_gold', segs=11, smooth=True)
    b.lathe([(0.6, 1.0), (0.66, 1.0), (0.66, 0.94), (0.6, 0.94)], 'haunted_gold', segs=11, closed=True)
    sb(b, (0, 1.25, 0.4), 0.1, 'glow_cyan', sq=(1, 1, 0.5), seg=7, rings=5)
    h = c.part('head', (0, 2.0, 0))
    hc, hr, hs = (0, 2.3, 0.0), 0.52, (1.0, 1.05, 1.0)
    sb(h, hc, hr, 'haunted', sq=hs, seg=11, rings=7)
    h.lathe([(0.0, 2.84), (0.18, 2.84), (0.18, 2.74), (0.0, 2.7)], 'haunted_gold', segs=9)
    sb(h, (0, 2.3, 0.3), 0.36, 'eye_black', sq=(1.15, 0.55, 0.6), seg=9, rings=5)
    for s in (-1, 1):
        sb(h, (s * 0.15, 2.3, 0.54), 0.12, 'glow_cyan', sq=(1.2, 0.42, 0.45), seg=8, rings=5, rot=Rz(s * 0.3))
    horn(h, (0, 2.78, -0.05), (0, 3.15, -0.5), 0.12, 'haunted_plume', segs=8, curve=(0, 0.2, 0.0))
    horn(h, (0, 2.74, -0.1), (0, 2.9, -0.65), 0.1, 'haunted_plume', segs=7, curve=(0, 0.1, 0.0))
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 0.72, 1.7, 0))
        sb(a, (s * 0.72, 1.72, 0), 0.3, 'haunted_gold', sq=(1, 0.8, 1))
        capsule(a, (s * 0.76, 1.55, 0.05), (s * 0.82, 1.0, 0.3), 0.15, 0.14, 'haunted')
        sb(a, (s * 0.84, 0.92, 0.36), 0.2, 'haunted_dark')
        if s > 0:
            a.limb((0.84, 0.9, 0.32), (0.84, 0.95, 1.0), 0.05, 0.05, 'leather', segs=6, smooth=True)
            a.box((0.84, 0.95, 0.92), (0.4, 0.07, 0.07), 'haunted_gold')
            horn(a, (0.84, 0.95, 1.0), (0.84, 1.35, 1.6), 0.12, 'steel', segs=6)
    for nm, x in (('legL', -0.28), ('legR', 0.28)):
        l = c.part(nm, (x, 0.7, 0))
        stub_leg(l, x, 0.7, 0, 0.2, 0.7, 'haunted_dark', 'haunted', 0.26, 0.1)
    return c.done()


@reg(MONSTERS)
def gargoyle():
    c = Cr('gargoyle', 2.0)
    b = c.part('body', (0, 0.9, 0))
    sb(b, (0, 1.0, 0), 0.6, 'gargoyle', sq=(1.0, 1.1, 0.9), seg=10, rings=7)
    sb(b, (0, 0.88, 0.3), 0.42, 'gargoyle_belly', sq=(0.9, 1.0, 0.5), seg=8, rings=5)
    b.tube([(0, 0.55, -0.4), (0, 0.3, -0.85), (0, 0.55, -1.2)], [0.1, 0.08, 0.06], 'gargoyle', segs=6)
    horn(b, (0, 0.55, -1.2), (0, 0.6, -1.5), 0.17, 'gargoyle_dark', segs=4)
    h = c.part('head', (0, 1.5, 0.05))
    hc, hr, hs = (0, 1.85, 0.1), 0.5, (1.1, 0.92, 1.0)
    sb(h, hc, hr, 'gargoyle', sq=hs, seg=11, rings=7)
    for s in (-1, 1):
        horn(h, (s * 0.3, 2.15, 0.0), (s * 0.5, 2.6, -0.2), 0.13, 'gargoyle_dark', segs=7, curve=(s * 0.08, 0, 0.0))
        horn(h, (s * 0.48, 1.9, 0.0), (s * 0.95, 2.0, -0.15), 0.12, 'gargoyle', segs=6)
    face(h, hc, hr, hs, ex=0.38, ey=0.1, er=0.19, my=-0.45, mw=0.2, pupil='glow_orange', brows=(0.45, 0.0, 1.3), mouth='fangs', cheeks=True)
    for nm, s in (('wingL', -1), ('wingR', 1)):
        w = c.part(nm, (s * 0.45, 1.5, -0.35))
        pts = [(0, 0.15), (0.5, 0.55), (1.2, 0.7), (1.45, 0.35), (1.2, 0.15), (1.2, -0.3), (0.85, -0.1), (0.7, -0.5), (0.4, -0.2), (0.0, -0.3)]
        flat_poly(w, [(s * 0.45 + s * x, -0.35 + z) for x, z in pts], 1.6, 0.05, 'gargoyle_wing')
        w.tube([(s * 0.45, 1.6, -0.3), (s * 1.0, 1.75, -0.05), (s * 1.9, 1.62, 0.02)], [0.07, 0.06, 0.04], 'gargoyle_dark', segs=6)
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 0.55, 1.3, 0.05))
        capsule(a, (s * 0.55, 1.3, 0.05), (s * 0.7, 0.9, 0.3), 0.12, 0.11, 'gargoyle')
        sb(a, (s * 0.72, 0.86, 0.35), 0.14, 'gargoyle_dark')
        for k in (-1, 0, 1):
            horn(a, (s * 0.72 + k * 0.07, 0.8, 0.45), (s * 0.72 + k * 0.1, 0.72, 0.62), 0.035, 'bone', segs=5)
    for nm, x in (('legL', -0.3), ('legR', 0.3)):
        l = c.part(nm, (x, 0.55, 0))
        stub_leg(l, x, 0.55, 0, 0.19, 0.55, 'gargoyle', 'gargoyle_dark', 0.22, 0.08)
    return c.done()


@reg(MONSTERS)
def scorpion():
    c = Cr('scorpion', 1.7, 0.85)
    b = c.part('body', (0, 0.7, 0))
    bc, br, bs = (0, 0.7, 0.0), 0.7, (1.0, 0.6, 1.25)
    sb(b, bc, br, 'scorpion', sq=bs, seg=11, rings=7)
    for k in range(4):
        b.rbox((0, 1.08 - abs(k - 1.5) * 0.02, -0.55 + k * 0.38), (0.9 - abs(k - 1.5) * 0.12, 0.05, 0.1), 'scorpion_dark', r=0.02, smooth=True) if False else None
    h = c.part('head', (0, 0.75, 0.7))
    hc, hr, hs = (0, 0.8, 0.95), 0.4, (1.15, 0.9, 0.95)
    sb(h, hc, hr, 'scorpion', sq=hs, seg=10, rings=6)
    face(h, hc, hr, hs, ex=0.45, ey=0.22, er=0.26, my=-0.5, mw=0.17, mouth='smile', cheeks=True)
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 0.55, 0.7, 0.55))
        capsule(a, (s * 0.55, 0.7, 0.55), (s * 0.85, 0.72, 1.05), 0.13, 0.12, 'scorpion')
        sb(a, (s * 0.92, 0.78, 1.3), 0.3, 'scorpion', sq=(1.1, 0.85, 1.1), seg=9, rings=6)
        horn(a, (s * 0.8, 0.9, 1.45), (s * 0.5, 0.92, 1.9), 0.15, 'scorpion_dark', segs=7, curve=(s * -0.05, 0, 0.05))
        horn(a, (s * 1.08, 0.7, 1.45), (s * 0.66, 0.7, 1.95), 0.13, 'scorpion_dark', segs=7, curve=(s * -0.1, 0, 0.0))
    t = c.part('tail', (0, 0.85, -0.65))
    pts = [(0, 0.85, -0.65), (0, 0.9, -1.1), (0, 1.3, -1.45), (0, 1.8, -1.2), (0, 2.05, -0.7), (0, 1.95, -0.3)]
    t.tube(spline(pts, 3), lambda tt: 0.17 - 0.07 * tt, 'scorpion_tail', segs=8)
    for p in pts[1:5]:
        sb(t, p, 0.15, 'scorpion_tail')
    sb(t, (0, 1.95, -0.27), 0.22, 'scorpion_sting', seg=9, rings=6)
    horn(t, (0, 1.9, -0.18), (0, 1.62, 0.1), 0.1, 'scorpion_sting', segs=7)
    for nm, s in (('legL', -1), ('legR', 1)):
        l = c.part(nm, (s * 0.6, 0.6, 0))
        for z in (0.35, 0.0, -0.35, -0.7):
            l.tube([(s * 0.6, 0.6, z), (s * 0.95, 0.7, z - 0.05), (s * 1.1, 0.05, z - 0.1)], [0.08, 0.07, 0.055], 'scorpion_dark', segs=5)
    return c.done()


def wrap(b, y, r, mat='mummy_dark', th=0.04, h=0.09, cx=0.0, cz=0.0, sqz=1.0):
    pts = [(r + th, y + h / 2), (r + th, y - h / 2), (r, y - h / 2 - 0.01), (r, y + h / 2 + 0.01)]
    b.lathe(pts, mat, segs=10, pos=(cx, 0, cz), M=Sc(1, 1, sqz), closed=True)


@reg(MONSTERS)
def mummy():
    c = Cr('mummy', 2.1)
    b = c.part('body', (0, 0.9, 0))
    sb(b, (0, 1.12, 0), 0.5, 'mummy', sq=(1.0, 1.2, 0.85), seg=10, rings=7)
    sb(b, (0, 0.65, 0), 0.4, 'mummy', sq=(1.05, 0.8, 0.9), seg=9, rings=6)
    for y, r in ((0.8, 0.36), (1.0, 0.49), (1.2, 0.5), (1.4, 0.44)):
        wrap(b, y, r * 1.0, sqz=0.88)
    horn(b, (0.3, 0.95, 0.3), (0.5, 0.35, 0.45), 0.07, 'mummy_dark', segs=5, curve=(0.05, 0, 0.1))
    h = c.part('head', (0, 1.5, 0))
    hc, hr, hs = (0, 1.88, 0.03), 0.5, (1.0, 0.97, 1.0)
    sb(h, hc, hr, 'mummy', sq=hs, seg=11, rings=7)
    for y, r in ((2.12, 0.34), (2.0, 0.46), (1.72, 0.44), (1.62, 0.35)):
        wrap(h, y, r, sqz=1.0, cz=0.03)
    for s in (-1, 1):
        x = s * 0.2
        eye(h, x, 1.9, sz(hc, hr, hs, x, 1.9) - 0.03, 0.15, pupil='glow_green', look=(0, 0))
        cheek(h, s * 0.34, 1.72, sz(hc, hr, hs, s * 0.34, 1.72) - 0.01, 0.07)
    horn(h, (-0.4, 2.05, 0.2), (-0.7, 1.7, 0.5), 0.06, 'mummy_dark', segs=5, curve=(-0.05, 0, 0.1))
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 0.52, 1.35, 0))
        capsule(a, (s * 0.52, 1.35, 0), (s * 0.5, 1.28, 0.7), 0.13, 0.11, 'mummy')
        wrap(a, 1.0, 0.0) if False else None
        sb(a, (s * 0.5, 1.28, 0.78), 0.14, 'mummy_dark')
        horn(a, (s * 0.5, 1.2, 0.8), (s * 0.55, 0.75, 0.95), 0.05, 'mummy_dark', segs=5, curve=(0, 0, 0.1))
    for nm, x in (('legL', -0.22), ('legR', 0.22)):
        l = c.part(nm, (x, 0.55, 0))
        stub_leg(l, x, 0.55, 0, 0.17, 0.55, 'mummy', 'mummy_dark', 0.21, 0.08)
    return c.done()


@reg(MONSTERS)
def yeti():
    c = Cr('yeti', 3.1)
    b = c.part('body', (0, 1.3, 0))
    b.blob((0, 1.6, 0), 1.15, 'yeti', sq=(1.1, 1.05, 0.95), seg=10, rings=7, amp=0.07, freq=1.8, seed=1.0)
    b.blob((0, 0.95, 0.1), 0.85, 'yeti', sq=(1.15, 0.8, 1.0), seg=9, rings=6, amp=0.07, freq=1.8, seed=2.0)
    sb(b, (0, 1.5, 0.62), 0.62, 'yeti_dark', sq=(0.9, 1.0, 0.5), seg=9, rings=6)
    for k in range(5):
        horn(b, ((k - 2) * 0.28, 2.5 - abs(k - 2) * 0.12, -0.45), ((k - 2) * 0.34, 2.9 - abs(k - 2) * 0.18, -0.6), 0.14, 'yeti_dark', segs=6)
    h = c.part('head', (0, 2.45, 0.1))
    hc, hr, hs = (0, 2.8, 0.2), 0.78, (1.15, 0.92, 1.0)
    h.blob(hc, hr, 'yeti', sq=hs, seg=11, rings=7, amp=0.05, freq=1.8, seed=3.0)
    sb(h, (0, 2.7, 0.62), 0.55, 'yeti_face', sq=(1.2, 0.95, 0.5), seg=10, rings=6)
    for s in (-1, 1):
        horn(h, (s * 0.5, 3.35, 0.0), (s * 0.78, 3.95, -0.1), 0.2, 'yeti_horn', segs=8, curve=(s * 0.15, 0.0, 0.1))
        x = s * 0.27
        eye(h, x, 2.82, sz((0, 2.7, 0.62), 0.55, (1.2, 0.95, 0.5), x, 2.82) - 0.02, 0.17, look=(0, 0))
        brow(h, x, 3.06, 0.9, 0.3, s * 0.35, th=0.06)
        cheek(h, s * 0.5, 2.6, 0.84, 0.1)
        fang(h, s * 0.2, 2.48, 0.97, h=0.19, r=0.055)
    smile(h, 0, 2.5, 0.96, w=0.22, depth=0.05, th=0.025)
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 1.15, 2.3, 0))
        a.blob((s * 1.3, 1.7, 0.05), 0.5, 'yeti', sq=(1, 1.7, 1), seg=9, rings=6, amp=0.07, freq=1.8, seed=4 + s)
        a.blob((s * 1.4, 0.9, 0.3), 0.6, 'yeti', sq=(1.05, 0.95, 1.1), seg=9, rings=6, amp=0.07, freq=1.8, seed=6 + s)
        for k in (-1, 0, 1):
            horn(a, (s * 1.4 + k * 0.2, 0.62, 0.6), (s * 1.42 + k * 0.28, 0.35, 0.85), 0.09, 'yeti_dark', segs=5)
    for nm, x in (('legL', -0.55), ('legR', 0.55)):
        l = c.part(nm, (x, 1.0, 0))
        l.blob((x, 0.55, 0.05), 0.5, 'yeti', sq=(1.0, 1.3, 1.0), seg=9, rings=6, amp=0.06, freq=1.8, seed=8 + x)
        sb(l, (x, 0.2, 0.25), 0.5, 'yeti_dark', sq=(1.0, 0.45, 1.4), seg=9, rings=5)
    return c.done()


@reg(MONSTERS)
def frost_wisp():
    c = Cr('frost_wisp', 1.7)
    b = c.part('body')
    b.lathe([(0, 0.55), (0.18, 0.6), (0.4, 0.85), (0.5, 1.15), (0.42, 1.45), (0.2, 1.7), (0.0, 1.85)], 'wisp', segs=12, smooth=True)
    for k in range(3):
        a = k * 2.1 + 0.5
        horn(b, (math.sin(a) * 0.15, 0.7, math.cos(a) * 0.15), (math.sin(a) * 0.35, 0.2 + k * 0.05, math.cos(a) * 0.35), 0.13, 'wisp', segs=7, curve=(0, 0.05, 0))
    horn(b, (0, 1.75, 0), (0.12, 2.2, -0.1), 0.2, 'ice', segs=8, curve=(0.0, 0.05, 0.0))
    sb(b, (0, 1.05, 0.0), 0.3, 'wisp_core', seg=9, rings=6) if False else None
    for s in (-1, 1):
        x = s * 0.2
        eye(b, x, 1.22, 0.41, 0.15, look=(0, 0), pupil='eye_black')
        cheek(b, s * 0.36, 1.02, 0.36, 0.075)
    smile(b, 0, 0.98, 0.5, w=0.09, depth=0.03, th=0.013)
    o = c.part('orbit', (0, 1.1, 0))
    for k in range(4):
        a = k * PI / 2 + 0.4
        crystal(o, (math.sin(a) * 0.82, 1.0 + 0.12 * (k % 2), math.cos(a) * 0.82), 0.34, 0.07, 'ice', Rx(0.3 * math.cos(a)) @ Rz(-0.3 * math.sin(a)))
    return c.done()


@reg(MONSTERS)
def cinder_shaman():
    c = Cr('cinder_shaman', 2.1)
    b = c.part('body')
    b.lathe([(0, 0.0), (0.58, 0.0), (0.62, 0.1), (0.48, 0.55), (0.34, 1.0), (0.3, 1.2), (0, 1.25)], 'shaman', segs=12, smooth=True)
    b.lathe([(0.6, 0.0), (0.64, 0.0), (0.64, 0.14), (0.6, 0.14)], 'glow_orange', segs=12, closed=True)
    sb(b, (0, 0.85, 0.31), 0.1, 'shaman_bone', sq=(1, 1, 0.4))
    h = c.part('head', (0, 1.25, 0))
    hc, hr, hs = (0, 1.58, 0.0), 0.44, (1.0, 1.0, 1.0)
    sb(h, hc, hr, 'shaman_skin', sq=hs, seg=11, rings=7)
    sb(h, (0, 1.58, 0.14), 0.4, 'shaman_bone', sq=(1.0, 1.05, 0.7), seg=10, rings=6)
    for s in (-1, 1):
        x = s * 0.16
        slit_eye(h, x, 1.63, 0.47, 0.13, 'glow_orange', s)
        horn(h, (s * 0.34, 1.7, 0.1), (s * 0.55, 1.95, 0.15), 0.08, 'shaman_bone', segs=6, curve=(s * 0.08, 0.0, 0.0))
        cheek(h, s * 0.27, 1.45, 0.47, 0.06, 'glow_orange')
    smile(h, 0, 1.4, 0.52, w=0.1, depth=0.03, mat='shaman_dark', th=0.014)
    for k in range(5):
        a = (k - 2) * 0.38
        horn(h, (math.sin(a) * 0.2, 1.95, -0.05), (math.sin(a) * 0.6, 2.2 + 0.1 * (2 - abs(k - 2)) + 0.1, -0.2), 0.07, 'glow_orange' if k % 2 else 'shaman_dark', segs=5)
    al = c.part('armL', (-0.38, 1.05, 0))
    capsule(al, (-0.38, 1.05, 0), (-0.52, 0.8, 0.25), 0.1, 0.09, 'shaman')
    sb(al, (-0.54, 0.76, 0.3), 0.085, 'shaman_skin')
    sb(al, (-0.54, 0.98, 0.34), 0.1, 'glow_orange', seg=7, rings=5)
    ar = c.part('armR', (0.38, 1.05, 0))
    capsule(ar, (0.38, 1.05, 0), (0.52, 0.85, 0.25), 0.1, 0.09, 'shaman')
    sb(ar, (0.54, 0.82, 0.3), 0.085, 'shaman_skin')
    ar.limb((0.54, 0.0, 0.3), (0.54, 1.95, 0.3), 0.04, 0.05, 'shaman_staff', segs=6, smooth=True)
    sb(ar, (0.54, 2.08, 0.3), 0.19, 'glow_orange', seg=9, rings=6)
    for k in range(3):
        a = k * 2.1
        horn(ar, (0.54 + math.cos(a) * 0.12, 1.98, 0.3 + math.sin(a) * 0.12), (0.54 + math.cos(a) * 0.22, 2.35, 0.3 + math.sin(a) * 0.22), 0.05, 'glow_yellow', segs=5)
    return c.done()


@reg(MONSTERS)
def void_stalker():
    c = Cr('void_stalker', 2.2)
    b = c.part('body', (0, 0.8, 0))
    sb(b, (0, 1.2, 0), 0.38, 'void_dark', sq=(0.95, 1.4, 0.85), seg=9, rings=7)
    b.lathe([(0, 0.45), (0.33, 0.5), (0.42, 0.75), (0.3, 1.0), (0, 1.0)], 'void_deep', segs=10, smooth=True)
    sb(b, (0, 1.3, 0.3), 0.1, 'glow_purple', sq=(1, 1, 0.5), seg=7, rings=5)
    for k in range(4):
        horn(b, (0, 1.5 - k * 0.2, -0.25), (0, 1.35 - k * 0.2, -0.65), 0.07, 'void_deep', segs=5)
    for k, x in enumerate((-0.2, 0.0, 0.2)):
        horn(b, (x, 0.6, -0.2), (x * 1.5, 0.1, -0.6), 0.1, 'void_deep', segs=6, curve=(0, -0.05, 0))
    h = c.part('head', (0, 1.6, 0))
    hc, hr, hs = (0, 1.92, 0.08), 0.42, (1.0, 1.0, 1.0)
    sb(h, hc, hr, 'void_dark', sq=hs, seg=11, rings=7)
    horn(h, (0, 2.25, -0.1), (0, 2.65, -0.45), 0.2, 'void_deep', segs=8, curve=(0, 0.1, 0))
    for s in (-1, 1):
        horn(h, (s * 0.3, 2.15, 0.0), (s * 0.5, 2.5, -0.05), 0.07, 'void_light', segs=6, curve=(s * 0.05, 0, 0))
    face(h, hc, hr, hs, ex=0.4, ey=0.1, er=0.22, my=-0.5, mw=0.15, white='glow_purple', brows=(0.4, 0.05, 1.2), mouth='smile', cheeks=False)
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 0.38, 1.4, 0))
        capsule(a, (s * 0.38, 1.4, 0), (s * 0.55, 0.9, 0.35), 0.075, 0.065, 'void_dark')
        sb(a, (s * 0.57, 0.86, 0.4), 0.1, 'void_light')
        horn(a, (s * 0.57, 0.86, 0.45), (s * 0.3, 1.0, 1.25), 0.07, 'void_light', segs=6)
    for nm, x in (('legL', -0.15), ('legR', 0.15)):
        l = c.part(nm, (x, 0.75, 0))
        capsule(l, (x, 0.72, 0), (x, 0.2, 0.02), 0.09, 0.07, 'void_deep')
        sb(l, (x, 0.1, 0.07), 0.13, 'void_dark', sq=(0.9, 0.6, 1.4))
    return c.done()


@reg(MONSTERS)
def void_eye():
    c = Cr('void_eye', 2.2)
    b = c.part('body')
    cy = 1.5
    sb(b, (0, cy, 0), 0.72, 'void_light', seg=12, rings=8)
    sb(b, (0, cy, 0.4), 0.46, 'void', sq=(1.0, 1.0, 0.55), seg=11, rings=7)
    sb(b, (0, cy, 0.58), 0.27, 'eye_black', sq=(0.34, 1.15, 0.5), seg=9, rings=6)       # slit pupil
    sb(b, (0, cy + 0.34, 0.6), 0.4, 'void_deep', sq=(0.95, 0.26, 0.45), seg=10, rings=5)   # heavy lid
    sb(b, (0.1, cy + 0.14, 0.68), 0.075, 'shine', sq=(1, 1, 0.5), seg=6, rings=4)
    sb(b, (-0.12, cy - 0.12, 0.66), 0.035, 'shine', sq=(1, 1, 0.5), seg=5, rings=3)
    for k, (dx, dy, ang) in enumerate(((-0.45, 0.35, 0.6), (0.5, 0.3, -0.7), (-0.5, -0.25, -0.4))):
        horn(b, (dx * 0.75, cy + dy * 0.75, 0.33), (dx * 1.15, cy + dy * 1.1, 0.12), 0.035, 'glow_pink', segs=5)
    for s in (-1, 1):
        brow(b, s * 0.34, cy + 0.62, 0.35, 0.34, s * 0.45, mat='void_deep', th=0.07)
        cheek(b, s * 0.52, cy - 0.28, 0.42, 0.1)
        horn(b, (s * 0.55, cy + 0.45, -0.1), (s * 0.85, cy + 0.85, -0.25), 0.1, 'void_dark', segs=7, curve=(s * 0.05, 0, 0))
    t = c.part('tentacles', (0, 1.0, 0))
    for k in range(6):
        a = k * PI / 3 + 0.3
        pts = [(math.sin(a) * 0.25, 1.0, math.cos(a) * 0.25 - 0.05), (math.sin(a) * 0.42, 0.55, math.cos(a) * 0.42 - 0.05), (math.sin(a) * 0.5, 0.2, math.cos(a) * 0.5 - 0.05), (math.sin(a) * 0.65, 0.1, math.cos(a) * 0.65 - 0.05)]
        t.tube(pts, [0.11, 0.09, 0.07, 0.03], 'void_dark', segs=6)
        sb(t, pts[-1], 0.06, 'glow_pink', seg=6, rings=4)
    r = c.part('ring', (0, 1.5, 0))
    n = 20
    ring = [(math.cos(2 * PI * i / n) * 1.0, 1.5 + math.sin(2 * PI * i / n) * 0.0, math.sin(2 * PI * i / n) * 1.0 - 0.0) for i in range(n + 1)]
    ring_tube = [(math.cos(2 * PI * i / n) * 1.02, 1.5, math.sin(2 * PI * i / n) * 1.02) for i in range(n)]
    ring_tube.append(ring_tube[0])
    r.tube(ring_tube, [0.035] * (n + 1), 'glow_purple', segs=5, cap=False)
    return c.done()


@reg(BOSSES)
def boss_crystal():
    c = Cr('boss_crystal', 3.2)
    b = c.part('body')
    b.cyl((0, 0.18, 0), 1.05, 1.15, 0.36, 8, 'ward_base')
    b.cyl((0, 0.45, 0), 0.8, 1.0, 0.22, 8, 'stone')
    b.lathe([(0.7, 0.56), (0.74, 0.56), (0.74, 0.6), (0.7, 0.6)], 'glow_cyan', segs=8, closed=True)
    cr = c.part('crystal', (0, 1.8, 0))
    sb(cr, (0, 1.9, 0), 0.7, 'ward', sq=(0.8, 2.0, 0.8), seg=6, rings=6)
    sb(cr, (0.55, 1.1, 0.25), 0.34, 'ward_dark', sq=(0.7, 1.6, 0.7), seg=6, rings=5)
    sb(cr, (-0.5, 1.05, -0.3), 0.3, 'ward', sq=(0.7, 1.5, 0.7), seg=6, rings=5)
    sb(cr, (0, 1.9, 0), 0.4, 'glow_white', sq=(0.7, 1.8, 0.7), seg=6, rings=5)
    sh = c.part('shards', (0, 2.3, 0))
    for k in range(4):
        a = k * PI / 2 + 0.4
        crystal(sh, (math.sin(a) * 1.2, 2.15 + 0.25 * (k % 2), math.cos(a) * 1.2), 0.5, 0.12, 'glow_blue')
    return c.done()


@reg(MONSTERS)
def bone_golem():
    c = Cr('bone_golem', 3.4)
    b = c.part('body', (0, 1.2, 0))
    sb(b, (0, 1.65, 0), 1.0, 'bone_golem', sq=(1.1, 1.05, 0.9), seg=11, rings=7)
    for i in range(4):
        sb(b, (0, 2.0 - i * 0.28, 0.1), 1.05 - 0.03 * i, 'bone', sq=(1.1, 0.13, 0.9), seg=12, rings=5)
    sb(b, (0, 1.55, 0.45), 0.42, 'glow_purple', sq=(0.9, 1.0, 0.5), seg=8, rings=6)
    sb(b, (0, 0.85, 0), 0.75, 'bone_golem_dark', sq=(1.15, 0.7, 0.95), seg=10, rings=6)
    for s in (-1, 1):
        sb(b, (s * 1.1, 2.4, 0), 0.4, 'bone', sq=(1, 0.9, 1), seg=9, rings=6)
        sb(b, (s * 1.1, 2.38, 0.33), 0.2, 'eye_black', sq=(1, 1.1, 0.5), seg=7, rings=5)
    h = c.part('head', (0, 2.45, 0.05))
    hc, hr, hs = (0, 2.95, 0.12), 0.62, (1.1, 0.95, 1.0)
    sb(h, hc, hr, 'bone', sq=hs, seg=11, rings=7)
    sb(h, (0, 2.45, 0.25), 0.4, 'bone_dark', sq=(1.05, 0.55, 0.85), seg=9, rings=5)
    for s in (-1, 1):
        x = s * 0.27
        zz = sz(hc, hr, hs, x, 3.0)
        slit_eye(h, x, 3.0, zz - 0.0, 0.22, 'glow_purple', s)
        horn(h, (s * 0.4, 3.45, 0.0), (s * 0.7, 3.95, -0.1), 0.14, 'bone_dark', segs=7, curve=(s * 0.1, 0, 0))
    sb(h, (0, 2.82, sz(hc, hr, hs, 0, 2.82) - 0.02), 0.06, 'ink', sq=(1, 1.2, 0.5), seg=6, rings=4)
    for i in range(6):
        h.box(((i - 2.5) * 0.1, 2.46, 0.52), (0.07, 0.09, 0.04), 'bone_dark')
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 1.2, 2.3, 0))
        capsule(a, (s * 1.2, 2.3, 0), (s * 1.4, 1.2, 0.3), 0.3, 0.27, 'bone_golem')
        for k in range(2):
            sb(a, (s * 1.3, 1.85 - k * 0.5, 0.15), 0.34, 'bone', sq=(1, 0.3, 1), seg=9, rings=4)
        sb(a, (s * 1.45, 1.0, 0.4), 0.42, 'bone', seg=10, rings=7)
        for k in (-1, 0, 1):
            horn(a, (s * 1.45 + k * 0.22, 0.75, 0.65), (s * 1.47 + k * 0.3, 0.4, 0.9), 0.1, 'bone', segs=5)
    for nm, x in (('legL', -0.55), ('legR', 0.55)):
        l = c.part(nm, (x, 1.0, 0))
        stub_leg(l, x, 1.0, 0, 0.42, 1.0, 'bone_golem', 'bone', 0.5, 0.12)
    return c.done()


@reg(BOSSES)
def boss_sapling():
    c = Cr('boss_sapling', 1.9)
    b = c.part('body', (0, 0.4, 0))
    bc, br, bs = (0, 0.82, 0), 0.52, (1.0, 1.15, 0.95)
    sb(b, bc, br, 'bark', sq=bs, seg=10, rings=7)
    face(b, bc, br, bs, ex=0.38, ey=0.2, er=0.2, my=-0.35, mw=0.2, white='eye_yellow', brows=(0.3, 0.0, 1.2), mouth='open')
    for s in (-1, 1):
        horn(b, (s * 0.2, 1.3, 0.0), (s * 0.5, 1.7, 0.0), 0.08, 'bark_dark', segs=5)
    for pos, r, m in (((0, 1.65, 0), 0.62, 'leaf'), ((0.4, 1.5, 0.2), 0.34, 'leaf_dark'), ((-0.38, 1.82, -0.1), 0.32, 'leaf_dark'), ((0.0, 1.45, 0.45), 0.25, 'leaf')):
        b.blob(pos, r, m, sq=(1.1, 0.85, 1.1), seg=9, rings=6, amp=0.1, freq=1.5, seed=pos[0] * 3)
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 0.45, 0.95, 0))
        a.tube([(s * 0.45, 0.95, 0), (s * 0.7, 0.75, 0.1), (s * 0.85, 0.5, 0.25)], [0.09, 0.07, 0.05], 'bark', segs=6)
        for k in (-1, 0, 1):
            horn(a, (s * 0.85, 0.5, 0.25), (s * (0.95 + 0.03 * k), 0.3, 0.4 + 0.08 * k), 0.035, 'bark_dark', segs=4)
        sb(a, (s * 0.6, 0.9, 0.05), 0.14, 'leaf', sq=(1.2, 0.5, 1), seg=7, rings=4)
    for nm, x in (('legL', -0.2), ('legR', 0.2)):
        l = c.part(nm, (x, 0.4, 0))
        stub_leg(l, x, 0.4, 0, 0.12, 0.4, 'bark_dark', 'bark_dark', 0.18, 0.08)
    return c.done()


def baby_dragon(name, body, dark, belly, hornm, k=1.0, H=1.4, white='eye_white', spark=None):
    """round baby dragon: boss_wyrmling (ice) and pet_dragon (gold)"""
    c = Cr(name, H, k)
    b = c.part('body', (0, 0.6, 0))
    sb(b, (0, 0.62, -0.05), 0.5, body, sq=(0.95, 0.92, 1.3), seg=10, rings=7)
    sb(b, (0, 0.5, 0.15), 0.38, belly, sq=(0.85, 0.85, 1.1), seg=8, rings=6)
    for i in range(4):
        horn(b, (0, 1.03 - i * 0.03, 0.2 - i * 0.22), (0, 1.3 - i * 0.04, 0.12 - i * 0.22), 0.08, hornm, segs=5)
    for nm, x in (('legL', -0.2), ('legR', 0.2)):
        l = c.part(nm, (x, 0.4, 0.05))
        stub_leg(l, x, 0.4, 0.05, 0.11, 0.4, body, dark, 0.14, 0.05)
    h = c.part('head', (0, 0.9, 0.35))
    hc, hr, hs = (0, 0.98, 0.58), 0.42, (1.05, 0.95, 1.0)
    sb(h, hc, hr, body, sq=hs, seg=11, rings=7)
    sb(h, (0, 0.88, 0.95), 0.22, belly, sq=(1.0, 0.7, 1.1), seg=8, rings=5)
    for s in (-1, 1):
        horn(h, (s * 0.2, 1.3, 0.5), (s * 0.35, 1.65, 0.2), 0.1, hornm, segs=7, curve=(s * 0.05, 0, -0.05))
        sb(h, (s * 0.06, 0.88, 1.12), 0.04, 'ink', sq=(1, 1.3, 0.6), seg=5, rings=3)
    face(h, hc, hr, hs, ex=0.5, ey=0.22, er=0.22, my=-0.6, mw=0.12, brows=None if spark else (0.3, 0.0, 1.2), mouth='none', cheeks=True, white=white)
    if spark:
        sb(h, (0, 1.36, 0.82), 0.07, spark, sq=(1, 1, 0.6), seg=6, rings=4)
    t = c.part('tail', (0, 0.6, -0.5))
    t.tube([(0, 0.6, -0.5), (0, 0.5, -0.95), (0.1, 0.65, -1.35)], [0.22, 0.15, 0.08], body, segs=7)
    horn(t, (0.1, 0.65, -1.35), (0.15, 0.7, -1.7), 0.14, hornm, segs=6)
    for nm, s in (('wingL', -1), ('wingR', 1)):
        w = c.part(nm, (s * 0.3, 0.95, -0.1))
        pts = [(0, 0.1), (0.5, 0.4), (1.1, 0.35), (1.05, 0.0), (0.85, -0.05), (0.8, -0.35), (0.55, -0.15), (0.3, -0.3), (0, -0.2)]
        flat_poly(w, [(s * 0.3 + s * x, -0.1 + z) for x, z in pts], 1.05, 0.04, dark)
        w.tube([(s * 0.3, 1.05, -0.05), (s * 0.8, 1.15, 0.2), (s * 1.4, 1.1, 0.25)], [0.05, 0.04, 0.025], body, segs=5)
    return c.done()


@reg(BOSSES)
def boss_wyrmling():
    return baby_dragon('boss_wyrmling', 'wyrm', 'wyrm_dark', 'wyrm_belly', 'wyrm_horn')


# ================================================================= BOSSES (designed in 'design units', then scaled to the in-game size)
# (bosses are built with DETAIL 1.25, see build_category)
@reg(BOSSES)
def boss_golem():
    c = Cr('boss_golem', 2.9, 3.4)      # ~9.7 m tall in game (def.scale 4 x 0.85 render factor)
    b = c.part('body', (0, 1.0, 0))
    rock(b, (0, 0.8, 0), 0.7, 'golem_dark', (1.15, 0.9, 1.0), 3.0, 10, 7, 0.08)
    rock(b, (0, 1.55, 0), 0.95, 'golem', (1.1, 1.0, 0.95), 7.0, 11, 8, 0.08)
    for s in (-1, 1):
        rock(b, (s * 1.0, 2.05, 0), 0.5, 'golem', (1, 0.85, 1), 17 + s, 9, 6, 0.1)
    for pos, r in (((0.45, 2.0, -0.1), 0.36), ((-0.55, 1.95, -0.3), 0.3), ((0.1, 1.3, -0.8), 0.4)):
        sb(b, pos, r, 'golem_moss', sq=(1.2, 0.35, 1.0), seg=8, rings=5)
    sb(b, (0.5, 2.55, -0.2), 0.14, 'golem_moss', sq=(1, 1.5, 1), seg=6, rings=4)
    for k in range(3):
        horn(b, (-0.6 + k * 0.6, 2.35, -0.55), (-0.6 + k * 0.6, 2.85, -0.7), 0.13, 'golem_dark', segs=6)
    for x, y, h, a in ((0.55, 1.9, 0.4, 0.4), (-0.6, 1.2, 0.35, -0.5), (0.4, 1.0, 0.3, -0.3)):
        b.limb((x - h * 0.2 * math.sin(a), y - h / 2, 0.8), (x + h * 0.2 * math.sin(a), y + h / 2, 0.8), 0.035, 0.03, 'glow_orange', segs=5)
    k = c.part('core', (0, 1.5, 0.85))
    sb(k, (0, 1.5, 0.85), 0.26, 'glow_orange', seg=9, rings=6)
    h = c.part('head', (0, 2.1, 0.05))
    hc, hr, hs = (0, 2.45, 0.12), 0.52, (1.05, 0.95, 1.0)
    rock(h, hc, hr, 'golem', hs, 13.0, 10, 7, 0.05)
    for s in (-1, 1):
        horn(h, (s * 0.3, 2.8, 0.0), (s * 0.5, 3.2, -0.05), 0.14, 'golem_dark', segs=7, curve=(s * 0.08, 0, 0))
    face(h, hc, hr, hs, ex=0.4, ey=0.12, er=0.2, my=-0.42, mw=0.22, white='glow_yellow', brows=(0.4, 0.05, 1.3), mouth='fangs', cheeks=False)
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 1.25, 2.05, 0))
        rock(a, (s * 1.4, 1.4, 0.05), 0.5, 'golem', (1, 1.5, 1), 21 + s, 9, 6, 0.08)
        rock(a, (s * 1.5, 0.55, 0.15), 0.62, 'golem_dark', (1.1, 1.0, 1.1), 25 + s, 10, 7, 0.08)
        for q in range(4):
            horn(a, (s * 1.5 + (q - 1.5) * 0.22, 0.4, 0.7), (s * 1.5 + (q - 1.5) * 0.25, 0.15, 0.95), 0.1, 'golem', segs=6)
        sb(a, (s * 1.4, 1.0, -0.2), 0.3, 'golem_moss', sq=(1.2, 0.4, 1), seg=7, rings=4)
    for nm, x in (('legL', -0.5), ('legR', 0.5)):
        l = c.part(nm, (x, 0.9, 0))
        rock(l, (x, 0.45, 0.0), 0.5, 'golem_dark', (0.95, 1.5, 1.0), 31 + x, 9, 6, 0.08)
        sb(l, (x, 0.14, 0.2), 0.5, 'golem', sq=(1.0, 0.4, 1.4), seg=9, rings=5)
    return c.done()


@reg(BOSSES)
def boss_lich():
    c = Cr('boss_lich', 3.1, 1.7)      # ~5 m tall
    b = c.part('body', (0, 1.0, 0))
    b.lathe([(0, 0.05), (0.78, 0.05), (0.8, 0.2), (0.6, 0.7), (0.42, 1.2), (0.4, 1.5), (0, 1.55)], 'lich_robe', segs=14, smooth=True)
    b.lathe([(0.76, 0.05), (0.82, 0.05), (0.82, 0.22), (0.77, 0.22)], 'lich_gold', segs=14, closed=True)
    for i in range(5):
        a = i * 1.26
        horn(b, (math.sin(a) * 0.6, 0.3, math.cos(a) * 0.6), (math.sin(a) * 0.95, -0.0, math.cos(a) * 0.95), 0.17, 'lich_robe_dark', segs=7, curve=(0, 0.05, 0))
    b.lathe([(0.45, 1.25), (0.5, 1.25), (0.5, 1.18), (0.45, 1.18)], 'lich_gold', segs=12, closed=True)
    sb(b, (0, 1.85, 0), 0.62, 'lich_robe_dark', sq=(1.3, 0.55, 1.0), seg=10, rings=6)
    for s in (-1, 1):
        horn(b, (s * 0.72, 2.0, -0.05), (s * 1.05, 2.45, -0.1), 0.15, 'bone', segs=7, curve=(s * 0.1, 0, 0))
    sb(b, (0, 1.3, 0.36), 0.14, 'glow_purple', sq=(1, 1, 0.4), seg=8, rings=5)
    h = c.part('head', (0, 2.0, 0))
    hc, hr, hs = (0, 2.55, 0.05), 0.55, (1.0, 0.98, 1.0)
    sb(h, hc, hr, 'bone', sq=hs, seg=12, rings=8)
    sb(h, (0, 2.12, 0.18), 0.3, 'bone', sq=(1.1, 0.55, 0.85), seg=9, rings=5)
    for s in (-1, 1):
        x = s * 0.24
        zz = sz(hc, hr, hs, x, 2.6)
        slit_eye(h, x, 2.6, zz - 0.0, 0.22, 'glow_purple', s)
        brow(h, x, 2.88, sz(hc, hr, hs, x, 2.88) + 0.01, 0.3, s * 0.3, mat='bone_dark', th=0.06)
    sb(h, (0, 2.45, sz(hc, hr, hs, 0, 2.45) - 0.01), 0.06, 'ink', sq=(1, 1.2, 0.5), seg=6, rings=4)
    for i in range(6):
        h.box(((i - 2.5) * 0.09, 2.14, 0.4), (0.06, 0.08, 0.04), 'bone_dark')
    h.lathe([(0.52, 2.95), (0.56, 2.95), (0.56, 2.82), (0.52, 2.82)], 'lich_gold', segs=12, closed=True)
    for i in range(5):
        a = (i - 2) * 0.5
        horn(h, (math.sin(a) * 0.5, 2.9, math.cos(a) * 0.1), (math.sin(a) * 0.55, 3.3 + (0.15 if i == 2 else 0), math.cos(a) * 0.1), 0.1, 'lich_gold', segs=6)
    al = c.part('armL', (-0.6, 1.8, 0))
    capsule(al, (-0.6, 1.8, 0), (-0.85, 1.3, 0.55), 0.17, 0.14, 'lich_robe')
    sb(al, (-0.88, 1.25, 0.62), 0.12, 'bone', seg=8, rings=5)
    for k in (-1, 0, 1):
        horn(al, (-0.88 + k * 0.07, 1.2, 0.72), (-0.88 + k * 0.1, 1.1, 0.95), 0.03, 'bone', segs=4)
    ar = c.part('armR', (0.6, 1.8, 0))
    capsule(ar, (0.6, 1.8, 0), (0.85, 1.3, 0.5), 0.17, 0.14, 'lich_robe')
    sb(ar, (0.88, 1.25, 0.56), 0.12, 'bone', seg=8, rings=5)
    ar.limb((0.88, 0.0, 0.56), (0.88, 2.6, 0.56), 0.06, 0.07, 'wood_dark', segs=7, smooth=True)
    sb(ar, (0.88, 2.75, 0.56), 0.28, 'bone', sq=(1, 1.1, 1), seg=9, rings=6)
    for s in (-1, 1):
        horn(ar, (0.88 + s * 0.24, 2.75, 0.56), (0.88 + s * 0.4, 3.05, 0.56), 0.07, 'lich_gold', segs=6)
    sb(ar, (0.88, 2.78, 0.56), 0.2, 'glow_purple', seg=9, rings=6)
    o = c.part('orb', (-0.9, 1.5, 0.8))
    sb(o, (-0.9, 1.5, 0.85), 0.17, 'glow_purple', seg=9, rings=6)
    sb(o, (-0.9, 1.5, 0.85), 0.08, 'glow_white', seg=6, rings=4)
    return c.done()


@reg(BOSSES)
def boss_treant():
    c = Cr('boss_treant', 5.0, 2.2)     # ~11 m tall
    b = c.part('body')
    b.lathe([(0, 0.0), (1.0, 0.0), (1.05, 0.3), (0.95, 1.2), (0.82, 2.0), (0.8, 2.3), (0, 2.3)], 'treant_bark', segs=14, smooth=True)
    bc, br, bs = (0, 2.75, 0), 0.95, (1.0, 1.0, 0.95)
    sb(b, bc, br, 'treant_bark', sq=bs, seg=12, rings=8)
    face(b, bc, br, bs, ex=0.38, ey=0.12, er=0.2, my=-0.32, mw=0.22, white='glow_green', brows=(0.4, 0.05, 1.3), mouth='open', cheeks=False)
    for k in range(7):
        a = k * 2 * PI / 7 + 0.3
        b.tube([(math.sin(a) * 0.7, 0.5, math.cos(a) * 0.7), (math.sin(a) * 1.3, 0.3, math.cos(a) * 1.3), (math.sin(a) * 1.9, 0.0, math.cos(a) * 1.9)], [0.3, 0.22, 0.14], 'treant_root', segs=7)
    for pos, r in (((0.5, 1.9, 0.78), 0.3), ((-0.6, 1.5, 0.7), 0.26)):
        sb(b, pos, r, 'treant_bark_dark', sq=(1, 1, 0.5), seg=8, rings=5)
    cr = c.part('crown', (0, 3.5, 0))
    for pos, r, m in (((0, 4.35, 0), 1.2, 'leaf'), ((1.0, 4.05, 0.3), 0.8, 'leaf_dark'), ((-0.95, 4.1, -0.2), 0.85, 'leaf'), ((0.1, 4.85, -0.3), 0.7, 'leaf_dark'), ((-0.2, 3.9, 1.0), 0.55, 'leaf'), ((0.7, 4.7, 0.5), 0.45, 'leaf')):
        cr.blob(pos, r, m, sq=(1.1, 0.85, 1.1), seg=10, rings=7, amp=0.1, freq=1.5, seed=pos[0] * 2.3 + 1)
    for s in (-1, 1):
        sb(cr, (s * 0.55, 3.95, 0.7), 0.16, 'blush', sq=(1, 0.5, 1), seg=7, rings=4)
    pl = c.part('plates', (0, 2.0, 0))
    for k in range(8):
        a = k * 2 * PI / 8 + 0.2
        horn(pl, (math.sin(a) * 0.98, 1.0 + (k % 3) * 0.7, math.cos(a) * 0.98), (math.sin(a) * 1.5, 1.3 + (k % 3) * 0.7, math.cos(a) * 1.5), 0.2, 'iron', segs=6)
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 1.0, 3.3, 0))
        a.tube([(s * 1.0, 3.3, 0), (s * 1.5, 2.3, 0.2), (s * 1.7, 1.3, 0.5)], [0.35, 0.3, 0.26], 'treant_bark', segs=8)
        sb(a, (s * 1.75, 1.15, 0.55), 0.38, 'treant_bark_dark', seg=9, rings=6)
        for k in (-1, 0, 1):
            horn(a, (s * 1.75 + k * 0.2, 0.95, 0.7), (s * (1.85 + 0.05 * k), 0.4, 0.95 + 0.1 * k), 0.1, 'treant_bark', segs=6)
        a.blob((s * 1.3, 2.7, 0.2), 0.4, 'leaf', sq=(1, 0.8, 1), seg=8, rings=5, amp=0.1, freq=1.5, seed=s + 3)
    return c.done()


@reg(BOSSES)
def boss_hydra():
    c = Cr('boss_hydra', 2.4, 2.06)      # ~5 m tall body; the three heads are boss_hydra_head instances placed on the neck stumps
    b = c.part('body', (0, 0.9, 0))
    sb(b, (0, 1.0, 0), 1.5, 'hydra', sq=(1.15, 0.62, 1.4), seg=12, rings=8)
    sb(b, (0, 0.62, 0.2), 1.25, 'hydra_belly', sq=(1.1, 0.4, 1.3), seg=10, rings=6)
    for i in range(7):
        horn(b, ((0.28 if i % 2 else -0.28), 1.5 - 0.02 * i, -1.2 + i * 0.4), ((0.28 if i % 2 else -0.28), 1.95 - 0.03 * i, -1.3 + i * 0.4), 0.2, 'hydra_dark', segs=6)
    for k in (-1, 0, 1):
        sb(b, (k * 0.95, 1.15, 1.45), 0.62, 'hydra_dark', sq=(1, 0.8, 1), seg=9, rings=6)     # neck stumps (heads attach here)
    for s in (-1, 1):
        sb(b, (s * 0.9, 1.25, -0.4), 0.16, 'glow_yellow', sq=(1, 1, 0.5), seg=7, rings=5)
    t = c.part('tail', (0, 1.0, -1.3))
    t.tube([(0, 1.0, -1.3), (0, 0.8, -2.1), (0, 0.65, -2.9), (0.1, 0.9, -3.5)], [0.6, 0.48, 0.32, 0.2], 'hydra', segs=9)
    for i in range(4):
        horn(t, (0, 1.2 - i * 0.1, -1.5 - i * 0.55), (0, 1.55 - i * 0.12, -1.55 - i * 0.55), 0.14, 'hydra_dark', segs=6)
    for s in (-1, 1):
        horn(t, (s * 0.1, 0.9, -3.5), (s * 0.8, 0.95, -4.0), 0.3, 'hydra_belly', segs=7)
    for nm, x, z in (('legFL', 1.25, 0.8), ('legFR', -1.25, 0.8), ('legBL', 1.15, -0.8), ('legBR', -1.15, -0.8)):
        l = c.part(nm, (x, 0.8, z))
        stub_leg(l, x, 0.8, z, 0.45, 0.8, 'hydra', 'hydra_dark', 0.55, 0.1)
    return c.done()


@reg(BOSSES)
def boss_wyrm():
    c = Cr('boss_wyrm', 3.0, 2.1)       # ~6 m tall to the horns, ~15 m wingspan
    b = c.part('body', (0, 0.4, 0))
    sb(b, (0, 0.3, 0), 1.05, 'wyrm', sq=(0.95, 0.85, 1.5), seg=12, rings=8)
    sb(b, (0, 0.0, 0.1), 0.8, 'wyrm_belly', sq=(0.85, 0.55, 1.4), seg=10, rings=6)
    b.tube([(0, 0.5, 0.9), (0, 0.9, 1.5), (0, 1.35, 1.95)], [0.6, 0.5, 0.42], 'wyrm', segs=10, cap=False)       # neck
    b.tube([(0, 0.35, 1.0), (0, 0.7, 1.55), (0, 1.1, 2.0)], [0.35, 0.3, 0.26], 'wyrm_belly', segs=7, cap=False)
    for i in range(7):
        z = -1.0 + i * 0.45
        horn(b, (0, 0.95 + (0.06 if i > 3 else 0), z), (0, 1.35 + (i % 2) * 0.12, z - 0.12), 0.16, 'wyrm_horn', segs=6)
    h = c.part('head', (0, 1.35, 1.95))
    hc, hr, hs = (0, 1.6, 2.35), 0.78, (1.0, 0.92, 1.1)
    sb(h, hc, hr, 'wyrm', sq=hs, seg=12, rings=8)
    sb(h, (0, 1.45, 3.0), 0.42, 'wyrm_belly', sq=(1.0, 0.7, 1.2), seg=9, rings=6)
    for s in (-1, 1):
        horn(h, (s * 0.35, 2.15, 2.0), (s * 0.65, 2.9, 1.5), 0.2, 'wyrm_horn', segs=8, curve=(s * 0.1, 0.0, -0.1))
        sb(h, (s * 0.14, 1.52, 3.4), 0.06, 'ink', sq=(1, 1.3, 0.6), seg=6, rings=4)
        fang(h, s * 0.22, 1.28, 3.05, h=0.28, r=0.06)
    face(h, hc, hr, hs, ex=0.52, ey=0.26, er=0.2, my=-1.2, mw=0.1, brows=(0.35, 0.05, 1.3), mouth='none', cheeks=True, pupil='eye_black')
    jw = c.part('jaw', (0, 1.4, 2.5), 'head')
    sb(jw, (0, 1.2, 2.95), 0.4, 'wyrm_dark', sq=(1.0, 0.4, 1.3), seg=9, rings=5)
    t = c.part('tail', (0, 0.3, -1.4))
    t.tube([(0, 0.3, -1.4), (0, 0.15, -2.3), (0.0, 0.2, -3.2), (0.2, 0.5, -3.9)], [0.7, 0.5, 0.3, 0.15], 'wyrm', segs=9)
    horn(t, (0.2, 0.5, -3.9), (0.3, 0.6, -4.5), 0.3, 'wyrm_horn', segs=7)
    for s in (-1, 1):
        horn(t, (s * 0.1, 0.5, -3.9), (s * 0.55, 0.55, -4.3), 0.2, 'wyrm_horn', segs=7)
    for nm, s in (('wingL', -1), ('wingR', 1)):
        w = c.part(nm, (s * 0.7, 0.75, 0.3))
        pts = [(0, 0.2), (0.9, 0.7), (2.0, 0.9), (2.9, 0.5), (2.6, 0.15), (2.7, -0.4), (2.0, -0.2), (1.9, -0.9), (1.2, -0.5), (0.8, -1.1), (0.2, -0.6), (0, -0.4)]
        flat_poly(w, [(s * 0.7 + s * x, 0.3 + z) for x, z in pts], 0.8, 0.06, 'wyrm_dark')
        w.tube([(s * 0.7, 0.85, 0.25), (s * 1.6, 1.05, 0.7), (s * 2.9, 0.9, 0.55)], [0.12, 0.09, 0.05], 'wyrm', segs=6)
        w.tube([(s * 1.6, 1.0, 0.65), (s * 2.0, 0.85, -0.1), (s * 2.0, 0.8, -0.85)], [0.07, 0.06, 0.04], 'wyrm_horn', segs=5)
    for nm, x, z in (('legL', -0.55, 0.7), ('legR', 0.55, 0.7)):
        l = c.part(nm, (x, 0.45, z))
        stub_leg(l, x, 0.45, z, 0.22, 0.45, 'wyrm', 'wyrm_dark', 0.28, 0.08)
    return c.done()


@reg(BOSSES)
def boss_warlord():
    c = Cr('boss_warlord', 4.2, 2.4)      # ~10 m tall
    b = c.part('body', (0, 1.0, 0))
    sb(b, (0, 1.75, 0), 0.8, 'warlord_red', sq=(1.15, 1.0, 0.9), seg=11, rings=8)
    sb(b, (0, 1.65, 0.4), 0.55, 'warlord_iron', sq=(1.0, 1.0, 0.45), seg=9, rings=6)
    sb(b, (0, 0.9, 0), 0.6, 'warlord_dark', sq=(1.2, 0.7, 1.0), seg=10, rings=6)
    b.lathe([(0.62, 1.15), (0.78, 1.15), (0.78, 1.0), (0.62, 1.0)], 'warlord_gold', segs=12, closed=True)
    sb(b, (0, 1.55, 0.6), 0.18, 'glow_orange', sq=(1, 1, 0.5), seg=8, rings=6)
    for s in (-1, 1):
        sb(b, (s * 1.05, 2.45, 0), 0.55, 'warlord_iron', sq=(1, 0.8, 1), seg=10, rings=6)
        for k in range(3):
            horn(b, (s * (1.0 + k * 0.12), 2.75 - k * 0.05, 0.0), (s * (1.25 + k * 0.2), 3.2 - k * 0.15, 0.0), 0.12, 'warlord_gold', segs=6, curve=(s * 0.05, 0, 0))
    b.cloth(lambda u, v: Vector((lerp(-0.85, 0.85, u), lerp(2.3, 0.4, v), -0.62 - 0.12 * math.sin(v * 3 + u * 2))), 8, 6, 'warlord_red', th=0.06, smooth=True)
    h = c.part('head', (0, 2.45, 0))
    hc, hr, hs = (0, 3.0, 0.08), 0.6, (1.0, 1.0, 1.0)
    sb(h, hc, hr, 'warlord_dark', sq=hs, seg=12, rings=8)
    sb(h, (0, 3.0, 0.28), 0.46, 'ink', sq=(1.1, 0.95, 0.65), seg=10, rings=7)
    for s in (-1, 1):
        x = s * 0.2
        sb(h, (x, 3.05, 0.66), 0.17, 'glow_orange', sq=(1.15, 0.5, 0.45), seg=9, rings=6, rot=Rz(s * 0.4))
        horn(h, (s * 0.38, 3.35, 0.0), (s * 0.85, 3.95, -0.1), 0.17, 'warlord_gold', segs=8, curve=(s * 0.15, 0.0, 0.0))
        brow(h, x, 3.3, 0.6, 0.3, s * 0.4, mat='warlord_dark', th=0.07)
    h.lathe([(0.58, 3.05), (0.64, 3.05), (0.64, 2.98), (0.58, 2.98)], 'warlord_gold', segs=12, closed=True)
    h.rbox((0, 3.65, 0.0), (0.18, 0.5, 0.9), 'warlord_red', r=0.07, smooth=True)
    for k in range(3):
        fang(h, (k - 1) * 0.16, 2.73, 0.66, h=0.12, r=0.04)
    al = c.part('armL', (-1.0, 2.35, 0))
    capsule(al, (-1.0, 2.35, 0), (-1.2, 1.3, 0.4), 0.32, 0.28, 'warlord_red')
    sb(al, (-1.22, 1.15, 0.45), 0.38, 'warlord_iron', seg=9, rings=6)
    ar = c.part('armR', (1.0, 2.35, 0))
    capsule(ar, (1.0, 2.35, 0), (1.2, 1.3, 0.4), 0.32, 0.28, 'warlord_red')
    sb(ar, (1.22, 1.15, 0.45), 0.38, 'warlord_iron', seg=9, rings=6)
    ar.limb((1.22, 1.1, 0.5), (1.22, 1.2, 1.0), 0.09, 0.09, 'leather', segs=7, smooth=True)
    ar.rbox((1.22, 1.2, 1.1), (1.2, 0.18, 0.2), 'warlord_gold', r=0.07, smooth=True)
    ar.rbox((1.22, 0.55, 1.1), (0.4, 2.6, 0.12), 'steel', r=0.05, smooth=True)
    ar.rbox((1.22, 0.55, 1.1), (0.22, 2.4, 0.16), 'glow_orange', r=0.05, smooth=True)
    for nm, x in (('legL', -0.45), ('legR', 0.45)):
        l = c.part(nm, (x, 0.95, 0))
        stub_leg(l, x, 0.95, 0, 0.36, 0.95, 'warlord_dark', 'warlord_iron', 0.46, 0.1)
    return c.done()


@reg(BOSSES)
def boss_void():
    c = Cr('boss_void', 4.3, 2.1)       # ~9 m tall, floats
    b = c.part('body', (0, 1.5, 0))
    b.lathe([(0, 0.4), (0.4, 0.45), (0.7, 0.9), (0.85, 1.5), (0.7, 2.0), (0.45, 2.4), (0, 2.5)], 'void_deep', segs=14, smooth=True)
    for k in range(9):
        a = k * 2 * PI / 9
        horn(b, (math.sin(a) * 0.5, 0.65, math.cos(a) * 0.5), (math.sin(a) * 0.85, 0.0, math.cos(a) * 0.85), 0.2, 'void_dark', segs=7, curve=(0, -0.05, 0))
    sb(b, (0, 1.5, 0.62), 0.28, 'glow_purple', sq=(1, 1.2, 0.5), seg=9, rings=6)
    sb(b, (0, 2.35, 0), 0.7, 'void_dark', sq=(1.25, 0.7, 0.95), seg=10, rings=6)
    h = c.part('head', (0, 2.6, 0))
    hc, hr, hs = (0, 3.15, 0.1), 0.6, (1.0, 1.0, 1.0)
    sb(h, hc, hr, 'void_dark', sq=hs, seg=12, rings=8)
    for s in (-1, 1):
        horn(h, (s * 0.35, 3.5, -0.05), (s * 0.7, 4.3, -0.2), 0.16, 'void_deep', segs=8, curve=(s * 0.2, 0.0, 0))
    face(h, hc, hr, hs, ex=0.38, ey=0.1, er=0.24, my=-0.45, mw=0.16, white='glow_pink', pupil='eye_black', brows=(0.4, 0.05, 1.2), mouth='smile', cheeks=True)
    ha = c.part('halo', (0, 3.2, -0.45))
    n = 24
    pts = [(math.cos(2 * PI * i / n) * 0.9, 3.25 + math.sin(2 * PI * i / n) * 0.9, -0.45) for i in range(n)]
    pts.append(pts[0])
    ha.tube(pts, [0.06] * (n + 1), 'glow_purple', segs=6, cap=False)
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 0.8, 2.4, 0))
        capsule(a, (s * 0.8, 2.4, 0), (s * 1.2, 1.4, 0.4), 0.2, 0.15, 'void_dark')
        sb(a, (s * 1.25, 1.3, 0.45), 0.24, 'void_light', seg=9, rings=6)
        for k in (-1, 0, 1):
            horn(a, (s * 1.25 + k * 0.12, 1.15, 0.6), (s * 1.3 + k * 0.16, 0.85, 0.85), 0.05, 'void_light', segs=5)
    sh = c.part('shards', (0, 2.2, 0))
    for k in range(6):
        a = k * PI / 3
        r = 1.7 + (k % 2) * 0.3
        crystal(sh, (math.sin(a) * r, 1.5 + (k % 3) * 0.55, math.cos(a) * r), 0.6, 0.14, 'void' if k % 2 else 'glow_purple', Rx(0.2 * math.sin(a)) @ Rz(0.2 * math.cos(a)))
    return c.done()


@reg(BOSSES)
def boss_warmach():
    c = Cr('boss_warmach', 3.4, 1.42)      # ~5 m tall, ~8 m wide war machine
    OL, OL2, DK, ST = 'colossus', 'colossus_dark', 'warlord_dark', 'colossus_steel'
    b = c.part('body', (0, 1.75, 0))
    sb(b, (0, 1.9, 0), 1.65, OL, sq=(0.95, 0.55, 1.1), seg=12, rings=8)
    sb(b, (0, 1.55, 0), 1.55, OL2, sq=(0.95, 0.4, 1.05), seg=10, rings=6)
    sb(b, (0, 1.5, 1.4), 0.8, DK, sq=(1.1, 0.7, 0.9), seg=9, rings=6)
    for s in (-1, 1):
        for i in range(3):
            sb(b, (s * (1.0 + i * 0.22), 2.55, 0.35 + i * 0.1), 0.1, 'glow_orange', sq=(1, 0.5, 1), seg=7, rings=4)
        horn(b, (s * 0.8, 2.6, -0.9), (s * 0.85, 3.4, -1.0), 0.06, ST, segs=5)
    for k in (-1, 1):
        sb(b, (k * 0.55, 2.55, -0.9), 0.3, OL2, sq=(1, 0.6, 1), seg=8, rings=5)
    sb(b, (0, 1.8, 2.05), 0.46, 'ink', sq=(1.4, 0.62, 0.55), seg=11, rings=7)
    sb(b, (0, 1.8, 2.3), 0.3, 'glow_orange', sq=(1.3, 0.42, 0.5), seg=10, rings=6)
    sb(b, (0, 1.8, 2.42), 0.14, 'eye_black', sq=(0.35, 1.0, 0.5), seg=8, rings=5)
    brow(b, 0, 2.38, 2.0, 0.9, 0.0, mat=DK, th=0.14)
    tu = c.part('turret', (0, 2.6, -0.1))
    sb(tu, (0, 2.95, -0.1), 0.75, OL2, sq=(1.05, 0.62, 1.0), seg=10, rings=7)
    sb(tu, (0, 3.25, -0.1), 0.45, OL, sq=(1.1, 0.5, 1.0), seg=9, rings=6)
    for x in (-0.3, 0.3):
        tu.cyl((x, 2.95, 1.05), 0.17, 0.17, 1.6, 10, DK, axis='z', smooth=True)
        sb(tu, (x, 2.95, 1.9), 0.2, 'glow_orange', seg=8, rings=5)
        tu.cyl((x, 2.95, 0.4), 0.22, 0.22, 0.25, 10, ST, axis='z', smooth=True)
    HIPS = [(1.35, 1.25, 0.55), (1.5, 0, 0.0), (1.35, -1.25, -0.55), (-1.35, 1.25, PI - 0.55), (-1.5, 0, PI), (-1.35, -1.25, PI + 0.55)]
    for i, (hx, hz, yaw) in enumerate(HIPS):
        d = Vector((math.cos(yaw), 0, -math.sin(yaw)))
        hip = Vector((hx, 1.7, hz))
        knee = hip + d * 1.5 + Vector((0, 0.65, 0))
        foot = knee + d * 0.4
        l = c.part(f'leg{i}', tuple(hip))
        capsule(l, tuple(hip), tuple(knee), 0.3, 0.26, DK, 7)
        sb(l, tuple(knee), 0.34, ST, seg=8, rings=5)
        sh = c.part(f'shin{i}', tuple(knee), f'leg{i}')
        capsule(sh, tuple(knee), (foot.x, 0.55, foot.z), 0.36, 0.3, OL, 7)
        sb(sh, (foot.x, 0.28, foot.z), 0.5, OL2, sq=(1.0, 0.55, 1.0), seg=8, rings=5)
    return c.done()


# ================================================================= PETS (authored with PetDef.scale already baked in; code still multiplies by profile size + stage scale)
# Flying / floating pets stand on the ground here (code adds `hover`).
@reg(PETS)
def pet_blob():
    c = Cr('pet_blob', 0.7)
    b = c.part('body')
    sb(b, (0, 0.34, 0), 0.42, 'pb_green', sq=(1.08, 0.86, 1.05), seg=12, rings=8)
    horn(b, (0, 0.62, -0.02), (0.05, 0.84, 0.03), 0.09, 'pb_green', segs=7)
    sb(b, (0.1, 0.8, 0.0), 0.1, 'leaf', sq=(1.8, 0.3, 1.0), seg=7, rings=4, rot=Rz(-0.4))
    sb(b, (-0.2, 0.54, 0.22), 0.07, 'shine', sq=(1, 0.65, 0.5), seg=6, rings=4, rot=Rz(0.5))
    for i in range(5):
        a = i * 1.26 + 0.2
        sb(b, (math.sin(a) * 0.34, 0.06, math.cos(a) * 0.34), 0.11, 'pb_green', sq=(1, 0.7, 1), seg=7, rings=4)
    f = c.part('face', (0, 0.36, 0.38))
    face(f, (0, 0.34, 0), 0.42, (1.08, 0.86, 1.05), ex=0.34, ey=0.16, er=0.21, my=-0.2, mw=0.2)
    return c.done()


@reg(PETS)
def pet_bat():
    c = Cr('pet_bat', 0.8)
    b = c.part('body')
    sb(b, (0, 0.28, -0.04), 0.2, 'pv_bat', sq=(1, 1.1, 1))
    sb(b, (0, 0.26, 0.06), 0.14, 'pv_belly', sq=(1, 1.1, 0.7))
    for s in (-1, 1):
        sb(b, (s * 0.08, 0.09, 0.0), 0.06, 'bat_ear', sq=(1, 0.8, 1.3), seg=6, rings=4)
    h = c.part('head', (0, 0.45, 0))
    hc, hr, hs = (0, 0.58, 0.04), 0.3, (1.08, 0.98, 1.0)
    sb(h, hc, hr, 'pv_bat', sq=hs, seg=10, rings=7)
    for s in (-1, 1):
        horn(h, (s * 0.14, 0.8, 0.0), (s * 0.3, 1.12, -0.04), 0.1, 'pv_bat', segs=7)
        horn(h, (s * 0.14, 0.82, 0.05), (s * 0.27, 1.05, 0.02), 0.055, 'bat_ear', segs=6)
    face(h, hc, hr, hs, ex=0.38, ey=0.08, er=0.26, my=-0.45, mw=0.2, mouth='open', look=(0, 0.2))
    for nm, s in (('wingL', -1), ('wingR', 1)):
        w = c.part(nm, (s * 0.16, 0.42, -0.02))
        pts = [(0, 0.16), (0.4, 0.26), (0.9, 0.12), (0.84, -0.04), (0.66, 0.0), (0.6, -0.25), (0.42, -0.08), (0.28, -0.3), (0.0, -0.18)]
        flat_poly(w, [(s * 0.16 + s * x, -0.02 + z) for x, z in pts], 0.42, 0.03, 'pf_wing' if False else 'bat_wing')
        w.tube([(s * 0.16, 0.42, 0.04), (s * 0.6, 0.45, 0.22), (s * 1.0, 0.42, 0.12)], [0.04, 0.03, 0.018], 'pv_bat', segs=5)
    return c.done()


@reg(PETS)
def pet_fairy():
    c = Cr('pet_fairy', 0.65)
    b = c.part('body', (0, 0.25, 0))
    b.lathe([(0, 0.04), (0.2, 0.04), (0.17, 0.12), (0.1, 0.34), (0.09, 0.4), (0, 0.42)], 'pf_dress', segs=10, smooth=True)
    b.lathe([(0.18, 0.04), (0.21, 0.04), (0.21, 0.09), (0.18, 0.09)], 'pf_pink', segs=10, closed=True)
    sb(b, (0, 0.3, 0.07), 0.05, 'glow_pink', sq=(1, 1, 0.5), seg=6, rings=4)
    for s in (-1, 1):
        sb(b, (s * 0.06, 0.04, 0.0), 0.05, 'pf_skin', sq=(1, 1.4, 1), seg=6, rings=4)
    h = c.part('head', (0, 0.42, 0))
    hc, hr, hs = (0, 0.6, 0.02), 0.22, (1.0, 0.95, 1.0)
    sb(h, hc, hr, 'pf_skin', sq=hs, seg=11, rings=8)
    sb(h, (0, 0.67, -0.04), 0.23, 'pf_hair', sq=(1.08, 0.9, 1.05), seg=10, rings=6)
    for s in (-1, 1):
        sb(h, (s * 0.24, 0.5, -0.04), 0.1, 'pf_hair', sq=(0.9, 1.3, 0.9), seg=7, rings=5)
        horn(h, (s * 0.2, 0.62, 0.0), (s * 0.38, 0.74, -0.02), 0.04, 'pf_skin', segs=5)
    sb(h, (0, 0.86, -0.02), 0.06, 'glow_yellow', seg=6, rings=4)
    face(h, hc, hr, hs, ex=0.4, ey=-0.08, er=0.24, my=-0.46, mw=0.14, cheeks=True)
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 0.1, 0.38, 0.0))
        capsule(a, (s * 0.1, 0.38, 0), (s * 0.2, 0.28, 0.1), 0.03, 0.028, 'pf_skin', 6)
        if s > 0:
            a.limb((0.2, 0.26, 0.1), (0.24, 0.56, 0.22), 0.012, 0.012, 'gold', segs=4)
            sb(a, (0.24, 0.6, 0.23), 0.06, 'glow_yellow', seg=6, rings=4)
    for nm, s in (('wingL', -1), ('wingR', 1)):
        w = c.part(nm, (s * 0.05, 0.36, -0.06))
        flat_poly(w, [(s * 0.05, -0.02), (s * 0.28, 0.2), (s * 0.5, 0.18), (s * 0.48, -0.04), (s * 0.3, -0.15), (s * 0.05, -0.08)], 0.36, 0.015, 'pf_wing')
        flat_poly(w, [(s * 0.05, -0.08), (s * 0.3, -0.15), (s * 0.34, -0.36), (s * 0.12, -0.26)], 0.363, 0.015, 'ps_spark')
    return c.done()


@reg(PETS)
def pet_wolf():
    return wolf_build('pet_wolf', 'pw_blue', 'po_dark', 'pw_white', H=1.0, k=0.45, tipglow='glow_cyan')


@reg(PETS)
def pet_dragon():
    return baby_dragon('pet_dragon', 'pd_gold', 'pd_dark', 'pd_belly', 'pw_white', k=0.78, H=1.1, spark='glow_red')


@reg(PETS)
def pet_rock():
    c = Cr('pet_rock', 0.6)
    b = c.part('body')
    b.blob((0, 0.3, 0), 0.38, 'pr_rock', sq=(1.12, 0.9, 1.0), seg=10, rings=7, amp=0.07, freq=1.5, seed=2.0)
    b.blob((-0.1, 0.62, -0.05), 0.16, 'pr_moss', sq=(1.4, 0.45, 1.1), seg=7, rings=4, amp=0.1, freq=1.5, seed=3.0)
    horn(b, (-0.1, 0.66, -0.05), (-0.08, 0.84, -0.02), 0.012, 'pr_moss', segs=4)
    sb(b, (-0.08, 0.86, -0.02), 0.05, 'blush', seg=6, rings=4)
    bc, br, bs = (0, 0.3, 0), 0.38, (1.12, 0.9, 1.0)
    face(b, bc, br, bs, ex=0.33, ey=0.2, er=0.2, my=-0.28, mw=0.2, cheeks=True, brows=(0.15, 0.0, 1.0))
    return c.done()


@reg(PETS)
def pet_golem():
    c = Cr('pet_golem', 1.3)
    b = c.part('body', (0, 0.5, 0))
    b.rbox((0, 0.62, 0), (0.7, 0.62, 0.52), 'pg_iron', r=0.16, seg=2, smooth=True)
    b.rbox((0, 0.34, 0), (0.6, 0.2, 0.44), 'pg_dark', r=0.07, seg=1, smooth=True)
    sb(b, (0, 0.65, 0.27), 0.11, 'glow_orange', sq=(1, 1, 0.45), seg=8, rings=5)
    for k in (-1, 1):
        sb(b, (k * 0.2, 0.96, -0.12), 0.05, 'pg_dark', seg=6, rings=4)
    h = c.part('head', (0, 0.95, 0))
    h.rbox((0, 1.15, 0.02), (0.6, 0.5, 0.5), 'pg_iron', r=0.17, seg=2, smooth=True)
    h.rbox((0, 1.15, 0.24), (0.46, 0.22, 0.08), 'ink', r=0.04, seg=1, smooth=True)
    for s in (-1, 1):
        sb(h, (s * 0.12, 1.15, 0.29), 0.075, 'glow_orange', sq=(1, 1.2, 0.5), seg=7, rings=5)
        sb(h, (s * 0.12 + 0.02, 1.18, 0.33), 0.02, 'shine', sq=(1, 1, 0.5), seg=5, rings=3)
    horn(h, (0, 1.4, 0.0), (0, 1.58, 0.0), 0.04, 'pg_dark', segs=5)
    sb(h, (0, 1.6, 0.0), 0.06, 'glow_orange', seg=6, rings=4)
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 0.42, 0.85, 0))
        capsule(a, (s * 0.42, 0.85, 0), (s * 0.5, 0.5, 0.1), 0.1, 0.1, 'pg_iron', 8)
        a.rbox((s * 0.5, 0.36, 0.12), (0.26, 0.26, 0.26), 'pg_dark', r=0.09, seg=1, smooth=True)
    for nm, x in (('legL', -0.18), ('legR', 0.18)):
        l = c.part(nm, (x, 0.35, 0))
        l.rbox((x, 0.2, 0.0), (0.26, 0.4, 0.28), 'pg_iron', r=0.09, seg=1, smooth=True)
        l.rbox((x, 0.07, 0.06), (0.3, 0.14, 0.4), 'pg_dark', r=0.05, seg=1, smooth=True)
    return c.done()


@reg(PETS)
def pet_phoenix():
    c = Cr('pet_phoenix', 0.9)
    b = c.part('body', (0, 0.4, 0))
    sb(b, (0, 0.42, 0), 0.3, 'pp_orange', sq=(0.95, 1.0, 1.25), seg=10, rings=7)
    sb(b, (0, 0.34, 0.12), 0.2, 'pp_yellow', sq=(0.9, 1.0, 0.8), seg=8, rings=5)
    for s in (-1, 1):
        capsule(b, (s * 0.1, 0.16, 0.05), (s * 0.1, 0.04, 0.1), 0.03, 0.025, 'pp_yellow', 5)
        sb(b, (s * 0.1, 0.03, 0.15), 0.06, 'pp_yellow', sq=(1, 0.5, 1.3), seg=6, rings=4)
    h = c.part('head', (0, 0.62, 0.15))
    hc, hr, hs = (0, 0.78, 0.2), 0.25, (1.0, 0.98, 1.0)
    sb(h, hc, hr, 'pp_orange', sq=hs, seg=10, rings=7)
    horn(h, (0, 0.74, 0.4), (0, 0.7, 0.58), 0.07, 'po_beak', segs=6)
    for k, (dx, dy) in enumerate(((0, 0.3), (0.07, 0.26), (-0.07, 0.26))):
        horn(h, (dx * 0.4, 0.98, 0.1), (dx, 0.98 + dy, -0.02), 0.045, 'pp_yellow' if k == 0 else 'pp_red', segs=5)
    face(h, hc, hr, hs, ex=0.42, ey=0.14, er=0.24, my=-0.7, mw=0.1, mouth='none', cheeks=True)
    t = c.part('tail', (0, 0.4, -0.28))
    for i in range(5):
        a = (i - 2) * 0.3
        horn(t, (math.sin(a) * 0.05, 0.4, -0.28), (math.sin(a) * 0.4, 0.32 - abs(i - 2) * 0.03, -0.9 + abs(i - 2) * 0.08), 0.07, 'pp_yellow' if i % 2 else 'pp_red', segs=6)
    for nm, s in (('wingL', -1), ('wingR', 1)):
        w = c.part(nm, (s * 0.24, 0.5, 0.0))
        pts = [(0, 0.15), (0.35, 0.28), (0.8, 0.2), (0.88, 0.02), (0.7, 0.08), (0.74, -0.18), (0.5, -0.06), (0.45, -0.34), (0.25, -0.1), (0.0, -0.22)]
        flat_poly(w, [(s * 0.24 + s * x, z) for x, z in pts], 0.5, 0.03, 'pp_orange')
        flat_poly(w, [(s * 0.24 + s * x, z) for x, z in ((0.4, 0.2), (0.78, 0.1), (0.62, -0.08), (0.4, -0.28), (0.3, -0.05))], 0.515, 0.02, 'glow_yellow')
    return c.done()


@reg(PETS)
def pet_fox():
    c = Cr('pet_fox', 0.85)
    b = c.part('body', (0, 0.45, 0))
    sb(b, (0, 0.42, 0), 0.3, 'px_orange', sq=(0.85, 0.82, 1.35), seg=10, rings=7)
    sb(b, (0, 0.32, 0.18), 0.2, 'px_cream', sq=(0.9, 0.9, 0.9), seg=8, rings=5)
    h = c.part('head', (0, 0.5, 0.3))
    hc, hr, hs = (0, 0.6, 0.45), 0.3, (1.1, 0.95, 1.0)
    sb(h, hc, hr, 'px_orange', sq=hs, seg=10, rings=7)
    sb(h, (0, 0.5, 0.7), 0.13, 'px_cream', sq=(0.95, 0.72, 1.3), seg=8, rings=5)
    sb(h, (0, 0.54, 0.84), 0.04, 'ink', sq=(1.2, 0.9, 0.9), seg=6, rings=4)
    for s in (-1, 1):
        horn(h, (s * 0.17, 0.82, 0.38), (s * 0.28, 1.12, 0.3), 0.1, 'px_orange', segs=6)
        horn(h, (s * 0.17, 0.84, 0.42), (s * 0.26, 1.06, 0.36), 0.05, 'px_dark', segs=5)
        sb(h, (s * 0.26, 0.45, 0.52), 0.08, 'px_cream', sq=(1, 0.9, 0.6), seg=7, rings=4)   # cheek fluff
    face(h, hc, hr, hs, ex=0.42, ey=0.2, er=0.2, my=-0.5, mw=0.1, mouth='smile', cheeks=True)
    t = c.part('tail', (0, 0.45, -0.34))
    t.tube(spline([(0, 0.45, -0.34), (0, 0.6, -0.7), (0, 0.85, -0.9), (0, 1.0, -0.85)], 3), lambda tt: 0.1 + 0.1 * math.sin(PI * min(tt * 1.2, 1.0)), 'px_orange', segs=8)
    sb(t, (0, 1.04, -0.83), 0.14, 'px_cream', sq=(1, 1.3, 1), seg=8, rings=6)
    sb(t, (0, 1.12, -0.8), 0.08, 'glow_orange', seg=6, rings=4)
    for nm, x, z in (('legFL', 0.12, 0.2), ('legFR', -0.12, 0.2), ('legBL', 0.12, -0.2), ('legBR', -0.12, -0.2)):
        l = c.part(nm, (x, 0.3, z))
        stub_leg(l, x, 0.3, z, 0.07, 0.3, 'px_orange', 'px_dark', 0.09, 0.02)
    return c.done()


@reg(PETS)
def pet_owl():
    c = Cr('pet_owl', 0.9)
    b = c.part('body', (0, 0.35, 0))
    sb(b, (0, 0.38, 0), 0.34, 'po_blue', sq=(0.95, 1.1, 0.95), seg=10, rings=7)
    sb(b, (0, 0.32, 0.14), 0.22, 'pw_white', sq=(0.9, 1.0, 0.7), seg=8, rings=5)
    for s in (-1, 1):
        sb(b, (s * 0.12, 0.05, 0.1), 0.08, 'po_beak', sq=(1, 0.6, 1.4), seg=6, rings=4)
    h = c.part('head', (0, 0.62, 0))
    hc, hr, hs = (0, 0.78, 0.04), 0.32, (1.15, 0.92, 1.0)
    sb(h, hc, hr, 'po_blue', sq=hs, seg=11, rings=7)
    for s in (-1, 1):
        horn(h, (s * 0.24, 1.0, 0.0), (s * 0.34, 1.28, -0.06), 0.1, 'po_dark', segs=6)
        sb(h, (s * 0.15, 0.8, 0.26), 0.2, 'pw_white', sq=(1, 1, 0.45), seg=9, rings=6)
    face(h, hc, hr, hs, ex=0.36, ey=0.06, er=0.25, my=-0.5, mw=0.1, mouth='none', cheeks=False, pupil='eye_black')
    horn(h, (0, 0.74, 0.34), (0, 0.66, 0.5), 0.07, 'po_beak', segs=6)
    for nm, s in (('wingL', -1), ('wingR', 1)):
        w = c.part(nm, (s * 0.3, 0.52, 0.0))
        flat_poly(w, [(s * 0.3, 0.12), (s * 0.55, 0.18), (s * 0.85, 0.08), (s * 0.9, -0.1), (s * 0.7, -0.05), (s * 0.7, -0.28), (s * 0.5, -0.12), (s * 0.3, -0.2)], 0.52, 0.04, 'po_dark')
        sb(w, (s * 0.34, 0.46, 0.0), 0.12, 'po_blue', sq=(0.8, 1.3, 1.0), seg=7, rings=5)
    t = c.part('tail', (0, 0.3, -0.25))
    horn(t, (0, 0.3, -0.25), (0, 0.12, -0.6), 0.12, 'po_dark', segs=6)
    return c.done()


@reg(PETS)
def pet_mimic():
    c = Cr('pet_mimic', 0.8)
    b = c.part('body')
    b.rbox((0, 0.3, 0), (0.78, 0.4, 0.56), 'pm_wood', r=0.07, seg=1, smooth=True)
    b.rbox((0, 0.5, 0.0), (0.82, 0.05, 0.6), 'gold', r=0.02)
    for x in (-0.3, 0.3):
        b.rbox((x, 0.3, 0.0), (0.07, 0.42, 0.6), 'gold', r=0.025)
    b.rbox((0, 0.44, 0.2), (0.66, 0.12, 0.3), 'pm_inside', r=0.04, smooth=True)
    for i in range(-2, 3):
        horn(b, (i * 0.13, 0.5, 0.33), (i * 0.13, 0.36, 0.34), 0.04, 'tooth', segs=5)
    sb(b, (0, 0.24, 0.3), 0.07, 'gold', sq=(1, 1, 0.5), seg=6, rings=4)
    tg = c.part('tongue', (0, 0.42, 0.3))
    sb(tg, (0, 0.38, 0.42), 0.1, 'tongue', sq=(1.3, 0.35, 1.5), seg=8, rings=5)
    lid = c.part('lid', (0, 0.52, -0.28))
    lid.rbox((0, 0.84, -0.46), (0.78, 0.07, 0.56), 'pm_dark', r=0.03, rot=Rx(-0.95), smooth=True)
    for x in (-0.3, 0.3):
        lid.rbox((x, 0.84, -0.46), (0.07, 0.09, 0.58), 'gold', r=0.02, rot=Rx(-0.95))
    for i in range(-2, 3):
        horn(lid, (i * 0.13, 0.62, -0.3), (i * 0.13, 0.5, -0.24), 0.04, 'tooth', segs=5, curve=(0, 0, 0))
    for s in (-1, 1):
        eye(lid, s * 0.2, 0.98, -0.2, 0.13, white='eye_yellow', look=(0, 0), seg=9)
    for nm, x in (('legL', -0.25), ('legR', 0.25)):
        l = c.part(nm, (x, 0.15, 0))
        stub_leg(l, x, 0.15, 0, 0.1, 0.16, 'pm_dark', 'pm_dark', 0.12, 0.06)
    return c.done()


@reg(PETS)
def pet_sprite():
    c = Cr('pet_sprite', 0.7)
    b = c.part('body', (0, 0.35, 0))
    bc, br, bs = (0, 0.35, 0), 0.3, (1.0, 1.0, 1.0)
    sb(b, bc, br, 'ps_core', sq=bs, seg=11, rings=8)
    face(b, bc, br, bs, ex=0.36, ey=0.1, er=0.24, my=-0.4, mw=0.18, cheeks=True)
    for i in range(6):
        a = i * PI / 3
        horn(b, (math.sin(a) * 0.26, 0.35 + math.cos(a) * 0.26, 0.0), (math.sin(a) * 0.55, 0.35 + math.cos(a) * 0.55, 0.0), 0.07, 'ps_blue', segs=6) if abs(math.cos(a)) < 2 and True else None
    for s in (-1, 1):
        horn(b, (s * 0.1, 0.62, 0.0), (s * 0.28, 0.9, 0.0), 0.05, 'glow_yellow', segs=5, curve=(s * 0.05, 0, 0))
    r = c.part('ring', (0, 0.35, 0))
    n = 20
    pts = [(math.cos(2 * PI * i / n) * 0.5, 0.35 + math.sin(2 * PI * i / n) * 0.18, math.sin(2 * PI * i / n) * 0.5) for i in range(n)]
    pts.append(pts[0])
    r.tube(pts, [0.02] * (n + 1), 'glow_cyan', segs=5, cap=False)
    sb(r, pts[0], 0.045, 'glow_white', seg=6, rings=4)
    sb(r, pts[10], 0.045, 'glow_white', seg=6, rings=4)
    return c.done()


@reg(PETS)
def pet_turtle():
    c = Cr('pet_turtle', 0.65)
    b = c.part('body')
    sb(b, (0, 0.3, 0), 0.4, 'pt_shell', sq=(1.0, 0.8, 1.15), seg=11, rings=7)
    sb(b, (0, 0.2, 0.0), 0.36, 'pt_skin', sq=(0.95, 0.4, 1.1), seg=9, rings=5)
    for i in range(5):
        a = i * 2 * PI / 5
        sb(b, (math.sin(a) * 0.2, 0.56, math.cos(a) * 0.24 - 0.02), 0.11, 'pt_dark', sq=(1, 0.4, 1), seg=7, rings=4)
    sb(b, (0, 0.62, -0.02), 0.13, 'pt_skin', sq=(1, 0.4, 1), seg=7, rings=4)
    horn(b, (0, 0.2, -0.4), (0, 0.16, -0.64), 0.07, 'pt_skin', segs=6)
    h = c.part('head', (0, 0.32, 0.38))
    hc, hr, hs = (0, 0.38, 0.55), 0.22, (1.0, 0.95, 1.0)
    sb(h, hc, hr, 'pt_skin', sq=hs, seg=10, rings=7)
    face(h, hc, hr, hs, ex=0.42, ey=0.2, er=0.22, my=-0.4, mw=0.18, cheeks=True)
    for nm, x, z in (('legFL', 0.3, 0.22), ('legFR', -0.3, 0.22), ('legBL', 0.3, -0.22), ('legBR', -0.3, -0.22)):
        l = c.part(nm, (x, 0.18, z))
        stub_leg(l, x, 0.18, z, 0.1, 0.18, 'pt_skin', 'pt_skin', 0.13, 0.04)
    return c.done()


@reg(PETS)
def pet_shadowcat():
    c = Cr('pet_shadowcat', 0.85)
    b = c.part('body', (0, 0.4, 0))
    sb(b, (0, 0.38, 0), 0.26, 'pc_cat', sq=(0.85, 0.85, 1.4), seg=10, rings=7)
    sb(b, (0, 0.27, 0.12), 0.16, 'pc_ear', sq=(0.9, 0.9, 1.0), seg=7, rings=5)
    h = c.part('head', (0, 0.46, 0.28))
    hc, hr, hs = (0, 0.58, 0.42), 0.3, (1.1, 0.95, 1.0)
    sb(h, hc, hr, 'pc_cat', sq=hs, seg=11, rings=7)
    for s in (-1, 1):
        horn(h, (s * 0.2, 0.8, 0.38), (s * 0.3, 1.1, 0.32), 0.12, 'pc_cat', segs=6)
        horn(h, (s * 0.2, 0.82, 0.42), (s * 0.28, 1.02, 0.38), 0.06, 'pc_ear', segs=5)
        for k in (-1, 1):
            horn(h, (s * 0.25, 0.5 + k * 0.03, 0.7), (s * 0.46, 0.5 + k * 0.08, 0.68), 0.01, 'pc_ear', segs=3)
    face(h, hc, hr, hs, ex=0.4, ey=0.12, er=0.24, my=-0.52, mw=0.1, white='glow_purple', pupil='eye_black', mouth='smile', cheeks=True)
    sb(h, (0, 0.5, sz(hc, hr, hs, 0, 0.5) - 0.01), 0.035, 'blush', sq=(1.2, 0.8, 0.6), seg=6, rings=4)
    t = c.part('tail', (0, 0.42, -0.3))
    t.tube(spline([(0, 0.42, -0.3), (0, 0.55, -0.65), (0, 0.85, -0.8), (0, 1.1, -0.72)], 3), lambda tt: 0.07 - 0.015 * tt, 'pc_cat', segs=7)
    sb(t, (0, 1.12, -0.7), 0.09, 'glow_purple', seg=7, rings=5)
    for nm, x, z in (('legFL', 0.11, 0.2), ('legFR', -0.11, 0.2), ('legBL', 0.11, -0.2), ('legBR', -0.11, -0.2)):
        l = c.part(nm, (x, 0.28, z))
        stub_leg(l, x, 0.28, z, 0.065, 0.28, 'pc_cat', 'pc_ear', 0.085, 0.02)
    return c.done()


@reg(PETS)
def pet_crystal():
    c = Cr('pet_crystal', 1.25)
    b = c.part('body', (0, 0.5, 0))
    b.rbox((0, 0.58, 0), (0.62, 0.56, 0.46), 'pcr_rock', r=0.16, seg=2, smooth=True)
    b.rbox((0, 0.3, 0), (0.54, 0.2, 0.4), 'pcr_dark', r=0.07, seg=1, smooth=True)
    for i, (x, h_, a) in enumerate(((0, 0.55, 0), (0.2, 0.4, -0.45), (-0.2, 0.42, 0.45), (0.1, 0.3, -0.9))):
        crystal(b, (x, 0.8, -0.2), h_, 0.07, 'pcr_crystal', Rx(-0.3) @ Rz(a))
    sb(b, (0, 0.6, 0.24), 0.1, 'pcr_crystal', sq=(1, 1.2, 0.5), seg=7, rings=5)
    h = c.part('head', (0, 0.9, 0))
    hc, hr, hs = (0, 1.08, 0.02), 0.3, (1.05, 0.9, 1.0)
    h.blob(hc, hr, 'pcr_rock', sq=hs, seg=10, rings=7, amp=0.05, freq=1.5, seed=1.0)
    crystal(h, (0, 1.32, 0.0), 0.3, 0.07, 'pcr_crystal')
    face(h, hc, hr, hs, ex=0.38, ey=0.1, er=0.2, my=-0.42, mw=0.14, white='pcr_light', cheeks=True)
    for nm, s in (('armL', -1), ('armR', 1)):
        a = c.part(nm, (s * 0.38, 0.8, 0))
        capsule(a, (s * 0.38, 0.8, 0), (s * 0.46, 0.48, 0.1), 0.09, 0.09, 'pcr_rock', 7)
        crystal(a, (s * 0.48, 0.34, 0.14), 0.22, 0.06, 'pcr_crystal', Rx(PI) @ Rz(0))
    for nm, x in (('legL', -0.16), ('legR', 0.16)):
        l = c.part(nm, (x, 0.32, 0))
        l.rbox((x, 0.18, 0.0), (0.24, 0.36, 0.26), 'pcr_rock', r=0.08, seg=1, smooth=True)
        l.rbox((x, 0.06, 0.06), (0.28, 0.12, 0.36), 'pcr_dark', r=0.05, seg=1, smooth=True)
    return c.done()


@reg(PETS)
def pet_leviathan():
    c = Cr('pet_leviathan', 1.2)
    b = c.part('body', (0, 0.6, 0))
    pts = [(0, 0.55 + math.sin(t * PI * 1.5) * 0.22, 0.45 - t * 1.0) for t in (0.0, 0.15, 0.3, 0.45, 0.6)]
    b.tube(spline(pts, 3), lambda tt: 0.26 - 0.06 * tt, 'pl_blue', segs=9, cap=False)
    sb(b, (0, 0.5, 0.45), 0.26, 'pl_blue', seg=9, rings=6)
    b.tube(spline([(0, 0.38 + math.sin(t * PI * 1.5) * 0.22, 0.52 - t * 1.0) for t in (0.0, 0.15, 0.3, 0.45)], 3), lambda tt: 0.14, 'pl_belly', segs=6, cap=False)
    for i, t_ in enumerate((0.1, 0.25, 0.4, 0.55)):
        y = 0.55 + math.sin(t_ * PI * 1.5) * 0.22
        horn(b, (0, y + 0.18, 0.45 - t_), (0, y + 0.45 - t_ * 0.2, 0.38 - t_), 0.06, 'pl_fin', segs=5)
    for nm, s in (('finL', -1), ('finR', 1)):
        f = c.part(nm, (s * 0.25, 0.5, 0.15))
        flat_poly(f, [(s * 0.22, 0.28), (s * 0.55, 0.3), (s * 0.62, 0.06), (s * 0.4, 0.0), (s * 0.22, -0.02)], 0.5, 0.03, 'pl_fin')
    h = c.part('head', (0, 0.62, 0.62))
    hc, hr, hs = (0, 0.74, 0.85), 0.34, (1.05, 0.92, 1.1)
    sb(h, hc, hr, 'pl_blue', sq=hs, seg=11, rings=7)
    sb(h, (0, 0.62, 1.15), 0.2, 'pl_belly', sq=(1.0, 0.7, 1.2), seg=8, rings=5)
    for s in (-1, 1):
        horn(h, (s * 0.26, 0.8, 0.8), (s * 0.55, 0.95, 0.65), 0.1, 'pl_fin', segs=6, curve=(0, 0.1, 0))
        horn(h, (s * 0.12, 1.05, 0.8), (s * 0.2, 1.4, 0.65), 0.07, 'pl_fin', segs=6)
    face(h, hc, hr, hs, ex=0.46, ey=0.16, er=0.22, my=-0.58, mw=0.1, mouth='smile', cheeks=True)
    t = c.part('tail', (0, 0.55, -0.55))
    t.tube(spline([(0, 0.55, -0.55), (0, 0.45, -0.85), (0, 0.6, -1.1), (0, 0.85, -1.15)], 3), lambda tt: 0.17 - 0.12 * tt, 'pl_blue', segs=7)
    for s in (-1, 1):
        horn(t, (0, 0.88, -1.15), (s * 0.3, 1.0, -1.3), 0.08, 'pl_fin', segs=5)
    return c.done()


@reg(PETS)
def pet_demigod():
    c = Cr('pet_demigod', 0.9)
    b = c.part('body', (0, 0.45, 0))
    bc, br, bs = (0, 0.45, 0), 0.3, (1.0, 1.0, 1.0)
    sb(b, bc, br, 'pz_gold', sq=bs, seg=11, rings=8)
    face(b, bc, br, bs, ex=0.36, ey=0.1, er=0.23, my=-0.42, mw=0.17, cheeks=True)
    for i in range(8):
        a = i * PI / 4 + 0.2
        horn(b, (math.sin(a) * 0.28, 0.45 + math.cos(a) * 0.28, -0.05), (math.sin(a) * 0.46, 0.45 + math.cos(a) * 0.46, -0.05), 0.045, 'glow_white', segs=5)
    for nm, tilt in (('ringA', 0.0), ('ringB', 0.9)):
        r = c.part(nm, (0, 0.45, 0))
        n = 22
        rad = 0.55 if nm == 'ringA' else 0.46
        pts = [(math.cos(2 * PI * i / n) * rad, 0.45 + math.sin(2 * PI * i / n) * rad * math.sin(tilt), math.sin(2 * PI * i / n) * rad * math.cos(tilt) if tilt else math.sin(2 * PI * i / n) * rad) for i in range(n)]
        if nm == 'ringA':
            pts = [(math.cos(2 * PI * i / n) * rad, 0.45, math.sin(2 * PI * i / n) * rad) for i in range(n)]
        else:
            pts = [(math.cos(2 * PI * i / n) * rad, 0.45 + math.sin(2 * PI * i / n) * rad * 0.7, math.sin(2 * PI * i / n) * rad * 0.7) for i in range(n)]
        pts.append(pts[0])
        r.tube(pts, [0.022] * (n + 1), 'pz_ring' if nm == 'ringA' else 'glow_yellow', segs=5, cap=False)
    sp = c.part('sparkles', (0, 0.45, 0))
    for i in range(3):
        a = i * 2 * PI / 3
        crystal(sp, (math.cos(a) * 0.62, 0.45 + math.sin(a * 2) * 0.1, math.sin(a) * 0.62), 0.16, 0.04, 'glow_white')
    return c.done()


# ================================================================= build / export / preview
BOSS_ADDS = ('boss_imp', 'boss_hydra_head', 'boss_sapling', 'boss_wyrmling', 'boss_crystal')    # summons / body parts: monster-sized budget
CATEGORIES = (('monsters', MONSTERS, 0.78), ('bosses', BOSSES, 1.2), ('pets', PETS, 0.74))


def build_category(table, detail):
    out = {}
    for n, fn in table.items():
        DETAIL[0] = 0.78 if n in BOSS_ADDS else detail
        out[n] = fn()
    return out


def joint_names(root):
    return [d.name for d in descendants(root) if d.type == 'EMPTY' and d is not root]


def bbox(root):
    """world-space (min, max) in GAME coordinates (x, y up, z front) of all meshes of a creature"""
    lo, hi = [1e9] * 3, [-1e9] * 3
    bpy.context.view_layer.update()
    for d in descendants(root):
        if d.type != 'MESH': continue
        for v in d.data.vertices:
            w = d.matrix_world @ v.co
            g = (w.x, w.z, -w.y)
            for i in range(3):
                lo[i] = min(lo[i], g[i]); hi[i] = max(hi[i], g[i])
    return lo, hi


def validate(P):
    bad = []
    for n, r in P.items():
        for d in descendants(r):
            if d.type == 'EMPTY' and d is not r:
                ms = [c for c in d.children if c.type == 'MESH']
                if len(ms) != 1 or ms[0].name != d.name + '_mesh': bad.append((n, d.name, [c.name for c in d.children]))
    return bad


def export_kit(roots, name):
    os.makedirs(OUT_DIR, exist_ok=True)
    K.RAW_GLB = os.path.join(OUT_DIR, name + '.raw.glb')
    K.export_glb(roots)
    return K.RAW_GLB


def compress(raw, name):
    import subprocess
    w = os.path.join(OUT_DIR, name + '.weld.glb'); out = os.path.join(OUT_DIR, name + '.glb')
    subprocess.check_call(['npx', '--yes', '@gltf-transform/cli', 'weld', raw, w], cwd=ROOT)
    subprocess.check_call(['npx', '--yes', '@gltf-transform/cli', 'meshopt', w, out, '--level', 'medium'], cwd=ROOT)
    os.remove(w)
    return out


MONSTER_ROWS = [
    ['slime', 'scarab', 'bat', 'frost_wisp', 'goblin', 'goblin_archer', 'bandit', 'skeleton_archer', 'skeleton_warrior', 'skeleton_mage'],
    ['cultist', 'cinder_shaman', 'void_stalker', 'mummy', 'zombie', 'wraith', 'haunted_armor', 'shieldbearer', 'sporecap', 'void_eye'],
    ['crystal_golemite', 'boar', 'direwolf', 'hellhound', 'scorpion', 'rock_crab', 'bomber', 'gargoyle', 'lake_hydra'],
    ['splitter', 'brute', 'yeti', 'bone_golem'],
]
BOSS_ROWS = [['boss_golem', 'boss_treant', 'boss_warlord', 'boss_void'], ['boss_wyrm', 'boss_hydra', 'boss_warmach', 'boss_lich']]
ADD_ROWS = [['boss_hydra_head', 'boss_sapling', 'boss_wyrmling', 'boss_imp', 'boss_crystal']]
PET_ROWS = [['pet_blob', 'pet_bat', 'pet_fairy', 'pet_wolf', 'pet_dragon', 'pet_rock', 'pet_golem', 'pet_phoenix', 'pet_fox'],
            ['pet_owl', 'pet_mimic', 'pet_sprite', 'pet_turtle', 'pet_shadowcat', 'pet_crystal', 'pet_leviathan', 'pet_demigod']]


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    K.MATS = make_materials()
    P = {}
    for cat, table, det in CATEGORIES:
        P[cat] = build_category(table, det)
    bad = validate({**P['monsters'], **P['bosses'], **P['pets']})
    print('--- joint structure problems:', bad or 'none')
    print('--- triangle counts / sizes (game space, metres)')
    allp = {}
    for cat in P:
        for n, o in P[cat].items():
            lo, hi = bbox(o)
            allp[n] = o
            print(f'{cat[:3]} {n:20s} tris {tri_count(o):5d}  size x{hi[0]-lo[0]:5.2f} y{hi[1]:5.2f} z{hi[2]-lo[2]:5.2f}  joints {len(joint_names(o))}')
    raw = export_kit(list(P['monsters'].values()) + list(P['bosses'].values()) + list(P['pets'].values()), 'creature_kit_v1')
    if '--no-compress' not in sys.argv:
        out = compress(raw, 'creature_kit_v1')
        print('creature_kit_v1 raw', os.path.getsize(raw) // 1024, 'KB -> compressed', os.path.getsize(out) // 1024, 'KB')
        os.remove(raw)
    if '--no-render' in sys.argv: return
    preview_materials()
    os.makedirs(SHOTS, exist_ok=True)
    for r in allp.values():
        for d in descendants(r): d.hide_render = True
    cu = [a for a in sys.argv if a.startswith('--closeup=')]
    only = [a for a in sys.argv if a.startswith('--only=')]
    only = only[0][7:].split(',') if only else None
    want = lambda k: only is None or k in only
    if cu:
        parts = cu[0][10:].split(',')
        names = parts[0].split('+')
        K.setup_render(1400, 900, 40)
        K.sheet(allp, [names], os.path.join(SHOTS, 'close_' + names[0] + '.png'), float(parts[3]) if len(parts) > 3 else 6,
                yaw=float(parts[1]) if len(parts) > 1 else 15, pitch=float(parts[2]) if len(parts) > 2 else 18,
                target=(0, float(parts[4]) if len(parts) > 4 else 1.0, 0), spacing=float(parts[5]) if len(parts) > 5 else 2.4, floor='#cfe5c2')
        return
    S = lambda name, rows, sp, ortho, y, w=2400, h=1300, rg=None, samples=24, pitch=24: (K.setup_render(w, h, samples),
        K.sheet(allp, [(r, sp) for r in rows], os.path.join(SHOTS, name), ortho, yaw=10, pitch=pitch, target=(0, y, 0), spacing=sp, rowgap=rg or sp * 1.15, floor='#cfe5c2'))
    if want('monsters'): S('sheet_monsters.png', MONSTER_ROWS, 3.8, 40, 0.8, 2400, 1400, 4.6)
    if want('bosses'):
        S('sheet_bosses.png', BOSS_ROWS, 17, 70, 3.0, 2200, 1200, 17)
        S('sheet_boss_adds.png', ADD_ROWS, 6.0, 30, 1.2, 1800, 600, 6)
    if want('pets'): S('sheet_pets.png', PET_ROWS, 2.6, 25, 0.5, 2200, 900, 2.9)
    if want('closeups'):
        for names, ortho, y, nm in ((['goblin', 'bandit', 'skeleton_archer'], 5.6, 0.9, 'close_monsters'), (['boss_wyrm'], 12, 2.5, 'close_boss'), (['pet_fox', 'pet_owl', 'pet_mimic'], 3.8, 0.45, 'close_pets')):
            K.setup_render(1400, 800, 48)
            K.sheet(allp, [names], os.path.join(SHOTS, nm + '.png'), ortho, yaw=18, pitch=16, target=(0, y, 0), spacing=ortho * 0.36, floor='#cfe5c2')


if __name__ == '__main__':
    main()
