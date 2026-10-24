"""Quaternius "Stylized Nature MegaKit" (CC0) -> public/models/nature_qt.glb

Run:   python3 art/blender/quaternius_nature.py [--no-render]        (Blender 5.x as a python module: `import bpy`)
Input: art/*.obj + art/*.mtl + art/*.png   (the MTLs point at `C:/Name.png`: textures are remapped by basename)
Out:   public/models/nature_qt.glb          one GLB, one named mesh node per piece (`CommonTree_1`, `Bush_Common`, ...)
       $QT_SHOTS/qt_sheet.png               Cycles preview grid of every converted piece (default: scratchpad/shots/qt)

What it does
  * imports each OBJ (Y-up), splits it per material, decimates (trees <= ~2.5k tris, bushes / flowers / rocks <= ~600; the alpha-cutout
    leaf cards are decimated less than the bark so silhouettes stay full), joins again, applies a uniform scale (CommonTree ~ the height
    of the town's toy trees) and a few per-piece size overrides (the Twisted tree and the fern are huge in the source)
  * textures are downsized (512 px; bark 512 too) and exported as WebP inside the GLB; ignore the *_Normal.png (flat toy look)
  * leaf / flower / grass materials are exported as alphaMode MASK (cutout) + double sided
The game side (render/qtNature.tsx) loads it, bakes each piece per material and draws it instanced.
"""
import bpy, bmesh, os, sys, json, struct, math, shutil
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ART = os.path.join(ROOT, 'art')
OUT = os.path.join(ROOT, 'public', 'models', 'nature_qt.glb')
SHOTS = os.environ.get('QT_SHOTS', '/tmp/claude-0/-home-user-Aether-IO/34af09d1-809f-51f6-9a6b-c4e9185a26e4/scratchpad/shots/qt')
TMP = SHOTS
RENDER = '--no-render' not in sys.argv

S = 0.6                       # global scale: CommonTree 7-9 m -> 4.4-5.7 m (the town's trees are ~4.5-5.5 m at scale 1)
TEX_PX = 512

# piece -> (triangle budget, extra scale on top of S or ('h', target height) / ('w', target width))
TREES = [f'CommonTree_{i}' for i in range(1, 6)] + [f'Pine_{i}' for i in range(1, 6)] + [f'TwistedTree_{i}' for i in range(1, 6)] + [f'DeadTree_{i}' for i in range(1, 6)]
SMALL = ['Bush_Common', 'Bush_Common_Flowers', 'Fern_1', 'Flower_3_Group', 'Flower_3_Single', 'Flower_4_Group', 'Flower_4_Single',
         'Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short', 'Grass_Wispy_Tall', 'Clover_1', 'Clover_2',
         'Mushroom_Common', 'Mushroom_Laetiporus', 'Plant_1', 'Plant_1_Big', 'Plant_7', 'Plant_7_Big',
         'Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3', 'Pebble_Square_1', 'Pebble_Square_2', 'Pebble_Square_3',
         'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3',
         'RockPath_Round_Small_1', 'RockPath_Round_Small_2', 'RockPath_Round_Small_3', 'RockPath_Round_Thin', 'RockPath_Round_Wide',
         'RockPath_Square_Small_1', 'RockPath_Square_Small_2', 'RockPath_Square_Small_3', 'RockPath_Square_Thin', 'RockPath_Square_Wide']
BUDGET = {n: 2500 for n in TREES}
BUDGET.update({n: 600 for n in SMALL})
BUDGET['Mushroom_Laetiporus'] = 450
BUDGET.update({n: 160 for n in SMALL if n.startswith('RockPath_')})   # flat stepping stones: tiny
# far-forest LODs (`<name>_lo`, same size / silhouette, ~700 tris): the outskirts forest draws these past the island's edge
LODS = [f'CommonTree_{i}' for i in range(1, 6)] + [f'Pine_{i}' for i in range(1, 6)]
BUDGET.update({n + '_lo': 700 for n in LODS})
SIZE = {}
for i in range(1, 6): SIZE[f'TwistedTree_{i}'] = ('h', 6.6)
SIZE['Fern_1'] = ('w', 2.2)
# the textured materials: name in the MTL -> (texture file, cutout?)
MATS = {
    'Bark_NormalTree': ('Bark_NormalTree.png', False), 'Bark_TwistedTree': ('Bark_TwistedTree.png', False), 'Bark_DeadTree': ('Bark_DeadTree.png', False),
    'Leaves_NormalTree': ('Leaves_NormalTree_C.png', True), 'Leaves_TwistedTree': ('Leaves_TwistedTree_C.png', True), 'Leaves_Pine': ('Leaf_Pine_C.png', True),
    'Leaves_Bush': ('Leaves_TwistedTree_C.png', True),   # (the plain bush's blob leaf texture, its own material so the game can colour it green)
    'Leaves': ('Leaves.png', True), 'Flowers': ('Flowers.png', True), 'Grass': ('Grass.png', True),
    'Mushrooms': ('Mushrooms.png', False), 'Rocks': ('Rocks_Diffuse.png', False), 'PathRocks': ('PathRocks_Diffuse.png', False),
}
CUTOUT = {k for k, v in MATS.items() if v[1]}


def clean():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_materials():
    os.makedirs(TMP, exist_ok=True)
    out = {}
    for name, (fn, cut) in MATS.items():
        src = os.path.join(ART, fn)
        img = bpy.data.images.load(src)
        px = TEX_PX
        img.scale(px, px)
        img.name = name
        img.pack()
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        for n in list(nt.nodes):
            if n.type != 'OUTPUT_MATERIAL' and n.type != 'BSDF_PRINCIPLED':
                nt.nodes.remove(n)
        bsdf = nt.nodes['Principled BSDF']
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.interpolation = 'Linear'
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if cut:
            nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
        bsdf.inputs['Roughness'].default_value = 1.0
        bsdf.inputs['Metallic'].default_value = 0.0
        if cut:
            try: m.blend_method = 'CLIP'
            except Exception: pass
            try: m.surface_render_method = 'DITHERED'
            except Exception: pass
        out[name] = m
    return out


def import_obj(name):
    before = set(bpy.data.objects)
    bpy.ops.wm.obj_import(filepath=os.path.join(ART, name + '.obj'))
    obs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    if len(obs) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for o in obs: o.select_set(True)
        bpy.context.view_layer.objects.active = obs[0]
        bpy.ops.object.join()
        obs = [bpy.context.view_layer.objects.active]
    ob = obs[0]
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


SWAP = {'Bush_Common': {'Leaves_TwistedTree': 'Leaves_Bush'}}   # the plain bush ships with the crimson twisted-tree leaf: its own material, the game colours it green


def retarget(ob, mats, name=''):
    """the importer made `Name` materials without textures: swap them for ours (by name, ignoring `.001` suffixes)"""
    for i, sl in enumerate(ob.material_slots):
        base = sl.material.name.split('.')[0] if sl.material else ''
        base = SWAP.get(name, {}).get(base, base)
        if base in mats: ob.material_slots[i].material = mats[base]
        else: print('  !! unknown material', base)


def split_by_material(ob):
    parts = []
    for i in range(len(ob.material_slots)):
        d = ob.copy(); d.data = ob.data.copy(); bpy.context.collection.objects.link(d)
        bm = bmesh.new(); bm.from_mesh(d.data)
        kill = [f for f in bm.faces if f.material_index != i]
        bmesh.ops.delete(bm, geom=kill, context='FACES')
        bm.to_mesh(d.data); bm.free()
        if len(d.data.polygons): parts.append(d)
        else: bpy.data.objects.remove(d)
    bpy.data.objects.remove(ob)
    return parts


def tris(ob): return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def decimate(ob, target):
    n = tris(ob)
    if n <= target: return
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    m = ob.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = max(0.04, target / n); m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=m.name)


def process(name, mats, suffix=''):
    ob = import_obj(name)
    retarget(ob, mats, name)
    parts = split_by_material(ob)
    budget = BUDGET[name + suffix]
    leaf = [p for p in parts if p.material_slots[0].material.name in CUTOUT]
    hard = [p for p in parts if p not in leaf]
    nleaf = sum(tris(p) for p in leaf)
    # cutout cards keep ~42% of the budget at most (their silhouette IS the canopy); the opaque parts get the rest
    leaf_t = min(nleaf, int(budget * (0.42 if hard else 1.0)))
    for p in leaf: decimate(p, max(24, int(leaf_t * tris(p) / max(1, nleaf))))
    rest = max(80, budget - sum(tris(p) for p in leaf))
    nh = sum(tris(p) for p in hard)
    for p in hard: decimate(p, max(40, int(rest * tris(p) / max(1, nh))))
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name + suffix; ob.data.name = name + suffix
    # scale
    k = S
    if name in SIZE:
        kind, v = SIZE[name]
        dims = ob.dimensions
        raw = max(dims.x, dims.y) if kind == 'w' else dims.z
        k = v / raw
    ob.scale = (k, k, k)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # smooth the opaque organic parts (bark / rocks / mushrooms); the cards stay as they are
    bpy.ops.object.shade_smooth()
    return ob


def glb_patch(path):
    """Blender writes leaf materials as BLEND / OPAQUE depending on version: force MASK 0.5 + double sided for the cutout ones."""
    with open(path, 'rb') as f: data = f.read()
    magic, ver, length = struct.unpack('<4sII', data[:12])
    clen, ctype = struct.unpack('<II', data[12:20])
    js = json.loads(data[20:20 + clen])
    for m in js.get('materials', []):
        nm = m.get('name', '').split('.')[0]
        if nm in CUTOUT:
            m['alphaMode'] = 'MASK'; m['alphaCutoff'] = 0.5; m['doubleSided'] = True
        else:
            m.pop('alphaMode', None); m['doubleSided'] = False
        pb = m.setdefault('pbrMetallicRoughness', {}); pb['metallicFactor'] = 0.0; pb['roughnessFactor'] = 1.0
    jb = json.dumps(js, separators=(',', ':')).encode()
    jb += b' ' * ((4 - len(jb) % 4) % 4)
    rest = data[20 + clen:]
    out = struct.pack('<4sII', magic, ver, 12 + 8 + len(jb) + len(rest)) + struct.pack('<II', len(jb), ctype) + jb + rest
    with open(path, 'wb') as f: f.write(out)


def main():
    clean()
    mats = make_materials()
    names = [(n, '') for n in TREES + SMALL] + [(n, '_lo') for n in LODS]
    obs = []
    stats = {}
    for n0, suf in names:
        n = n0 + suf
        ob = process(n0, mats, suf)
        stats[n] = tris(ob)
        obs.append(ob)
        print(f'{n:24s} {stats[n]:5d} tris   dims {tuple(round(x, 2) for x in ob.dimensions)}')
    print('TOTAL tris', sum(stats.values()))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
                              export_image_format='WEBP', export_image_quality=82, export_materials='EXPORT', export_cameras=False, export_lights=False,
                              export_normals=True, export_texcoords=True, export_vertex_color='NONE', export_animations=False)
    glb_patch(OUT)
    print('GLB', OUT, round(os.path.getsize(OUT) / 1024), 'KB')
    json.dump(stats, open(os.path.join(TMP, 'tris.json'), 'w'), indent=1)
    if RENDER: sheet(obs)


def sheet(obs):
    """Cycles preview grid (EEVEE needs a GPU / EGL): 4 tree rows + the small pieces, tilted ortho camera, sun + sky."""
    os.makedirs(SHOTS, exist_ok=True)
    sc = bpy.context.scene
    pre = ('CommonTree', 'Pine', 'TwistedTree', 'DeadTree')
    rows = [[o for o in obs if o.name.startswith(p) and not o.name.endswith('_lo')] for p in pre]
    small = [o for o in obs if not o.name.startswith(pre)] + [o for o in obs if o.name.endswith('_lo')]
    y = 0.0
    for r in rows:
        for i, o in enumerate(r): o.location = (i * 7.0, y, 0); o.rotation_euler = (0, 0, 0)
        y -= 9.0
    for i, o in enumerate(small):
        r, c = divmod(i, 10)
        o.location = (c * 3.6 - 0.5, y - r * 3.6, 0); o.rotation_euler = (0, 0, 0)
    y -= 3 * 3.6
    cx, cy = 14.0, y / 2 + 4
    bpy.ops.mesh.primitive_plane_add(size=1, location=(cx, cy, -0.02)); pl = bpy.context.object; pl.scale = (46, abs(y) + 14, 1)
    gm = bpy.data.materials.new('g'); gm.use_nodes = True; gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.42, 0.72, 0.3, 1); pl.data.materials.append(gm)
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(45), 0, math.radians(30))); bpy.context.object.data.energy = 3.2
    w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.8, 0.9, 1, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.9; sc.world = w
    pitch = math.radians(58)
    bpy.ops.object.camera_add(location=(cx, cy - 80 * math.sin(pitch), 80 * math.cos(pitch)), rotation=(pitch, 0, 0)); cam = bpy.context.object
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 52
    sc.camera = cam
    sc.view_settings.view_transform = 'Standard'
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.device = 'CPU'
    try: sc.cycles.use_denoising = False
    except Exception: pass
    sc.render.resolution_x = 2000; sc.render.resolution_y = 1500
    sc.render.filepath = os.path.join(SHOTS, 'qt_sheet.png')
    bpy.ops.render.render(write_still=True)
    print('sheet', sc.render.filepath)


main()
