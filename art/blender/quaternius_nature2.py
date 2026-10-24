"""Quaternius "Ultimate Stylized Nature" pack 2 (CC0, flat Kd colours, no textures) -> public/models/nature_qt2.glb + engine/qtData2.ts

Run:   python3 art/blender/quaternius_nature2.py [--no-render]        (Blender 5.x as a python module: `import bpy`)
Input: art/<Piece>.obj + .mtl  (pack 2 names only: the MTL has no map_Kd; pack 1 pieces share some file names and are skipped)
Out:   public/models/nature_qt2.glb   one named mesh node per piece, `N_<Piece>` (N_CommonTree_Autumn_2, N_Cactus_1 ...), `_lo` far LODs for the base trees,
                                      `N_Rock_Sand_<n>` = the Rock_n pieces recoloured sandstone-orange with strata (beach)
       engine/qtData2.ts              height / half-width tables (scale 1) + piece lists for the layout code
Colours: each material's Kd becomes a per-corner COLOR_0 (no materials, no textures: ~4 MB for ~190 pieces); a small PALETTE remap brightens
the dull Kd so the pieces read bright and toy-like under the game's lighting.
"""
import bpy, bmesh, os, sys, json, math, glob
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ART = os.path.join(ROOT, 'art')
OUT = os.path.join(ROOT, 'public', 'models', 'nature_qt2.glb')
TS = os.path.join(ROOT, 'engine', 'qtData2.ts')
SHOTS = os.environ.get('QT_SHOTS', '/tmp/claude-0/-home-user-Aether-IO/34af09d1-809f-51f6-9a6b-c4e9185a26e4/scratchpad/shots/qt2')
RENDER = '--no-render' not in sys.argv
PFX = 'N_'

# Kd (linear) -> toy palette (linear). Unlisted names keep Kd.
PALETTE = {
    'Green': (0.10, 0.30, 0.06), 'DarkGreen': (0.06, 0.20, 0.05), 'Wood': (0.20, 0.10, 0.06), 'LightWood': (0.30, 0.15, 0.09),
    'White': (0.78, 0.78, 0.72), 'Black': (0.07, 0.07, 0.07), 'Orange': (0.70, 0.22, 0.05), 'LightOrange': (0.80, 0.42, 0.08),
    'Snow': (0.85, 0.90, 1.0), 'Rock': (0.34, 0.34, 0.36), 'Yellow': (0.80, 0.55, 0.08), 'Pink': (0.80, 0.20, 0.35), 'Cyan': (0.15, 0.55, 0.75),
    'Berry': (0.70, 0.04, 0.06), 'Coconuts': (0.30, 0.15, 0.08), 'Leaves': (0.20, 0.16, 0.08), 'Mushroom_Top': (0.55, 0.12, 0.1), 'Mushroom_Bottom': (0.7, 0.62, 0.5),
}
# per-name palette fixes (cactus is a desert green, birch bark creamy)
PER = {'Cactus': {'Green': (0.10, 0.34, 0.12)}, 'CactusFlower': {'Green': (0.10, 0.34, 0.12)}, 'Wheat': {'Yellow': (0.85, 0.62, 0.12)}, 'Corn': {'Yellow': (0.85, 0.62, 0.12)}}

def group(n):
    for g in ('BirchTree', 'CommonTree', 'PineTree', 'Willow', 'PalmTree', 'CactusFlower', 'Cactus', 'BushBerries', 'Bush', 'Rock', 'TreeStump', 'WoodLog', 'Wheat', 'Corn', 'Lilypad', 'Flowers', 'Grass', 'Plant'):
        if n.startswith(g): return g
    return n
SCALE = {'BirchTree': 1.5, 'CommonTree': 1.9, 'PineTree': 1.9, 'Willow': 1.9, 'PalmTree': 1.7, 'Cactus': 2.2, 'CactusFlower': 2.2, 'Bush': 0.95, 'BushBerries': 0.95,
         'Rock': 1.6, 'TreeStump': 1.3, 'WoodLog': 1.2, 'Wheat': 1.1, 'Corn': 0.95, 'Lilypad': 0.9, 'Flowers': 1.3, 'Grass': 1.5, 'Plant': 1.2}
def budget(n):
    g = group(n)
    if g in ('BirchTree', 'CommonTree', 'PineTree', 'Willow', 'PalmTree'): return 1700 if '_Dead' not in n else 1400
    if g in ('Cactus', 'CactusFlower'): return 700
    if g == 'Rock': return 600
    if g == 'Wheat': return 130
    if g == 'Corn': return 260
    if g in ('Grass',): return 192
    return 600
LOD_OF = [f'{g}_{i}' for g in ('CommonTree', 'BirchTree', 'PineTree', 'CommonTree_Autumn', 'BirchTree_Autumn') for i in range(1, 6)]
SAND_OF = [f'Rock_{i}' for i in range(1, 8)]
SAND = {'Rock': (0.78, 0.36, 0.13)}

def clean(): bpy.ops.wm.read_factory_settings(use_empty=True)

def import_obj(name):
    before = set(bpy.data.objects)
    bpy.ops.wm.obj_import(filepath=os.path.join(ART, name + '.obj'))
    obs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    if len(obs) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for o in obs: o.select_set(True)
        bpy.context.view_layer.objects.active = obs[0]; bpy.ops.object.join(); obs = [bpy.context.view_layer.objects.active]
    ob = obs[0]; bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob

def tris(ob): return sum(len(p.vertices) - 2 for p in ob.data.polygons)

def decimate(ob, target):
    n = tris(ob)
    if n <= target: return
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    m = ob.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = max(0.03, target / n); m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=m.name)

def kd(mat):
    return tuple(mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value[:3])

def split_colour(ob, name, pal_extra=None):
    """-> list of (part object, (r,g,b)) one per material"""
    out = []
    g = group(name)
    for i, sl in enumerate(ob.material_slots):
        base = sl.material.name.split('.')[0]
        col = (pal_extra or {}).get(base) or PER.get(g, {}).get(base) or PALETTE.get(base) or kd(sl.material)
        d = ob.copy(); d.data = ob.data.copy(); bpy.context.collection.objects.link(d)
        bm = bmesh.new(); bm.from_mesh(d.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != i], context='FACES')
        bm.to_mesh(d.data); bm.free()
        if len(d.data.polygons): out.append((d, col))
        else: bpy.data.objects.remove(d)
    bpy.data.objects.remove(ob)
    return out

def paint(ob, col, mode=None):
    me = ob.data
    if me.color_attributes.get('Col'): me.color_attributes.remove(me.color_attributes['Col'])
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    data = []
    for p in me.polygons:
        for li in p.loop_indices:
            c = col
            if mode == 'sand':   # lit tops, darker sides, faint strata bands by height
                v = me.vertices[me.loops[li].vertex_index].co; n = p.normal
                top = max(0.0, n.z); band = 0.5 + 0.5 * math.sin(v.z * 9.0)
                k = (0.72 + 0.34 * top) * (0.93 + 0.1 * band)
                c = (min(1, col[0] * k), min(1, col[1] * k), min(1, col[2] * k))
            data += [c[0], c[1], c[2], 1.0]
    ca.data.foreach_set('color', data)
    me.color_attributes.active_color = ca

def roundify(ob, k):
    """Rocks ship as chunky flat-topped slabs (they read as boxes): one Catmull-Clark pass + every vertex pulled toward the ellipsoid of the bounding box (k = how far), so they become round boulders."""
    from mathutils import Vector
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    m = ob.modifiers.new('sub', 'SUBSURF'); m.levels = 1; m.render_levels = 1
    bpy.ops.object.modifier_apply(modifier=m.name)
    me = ob.data
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    c = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2))
    r = Vector((max(0.01, (max(xs) - min(xs)) / 2), max(0.01, (max(ys) - min(ys)) / 2), max(0.01, (max(zs) - min(zs)) / 2)))
    for v in me.vertices:
        d = v.co - c; q = Vector((d.x / r.x, d.y / r.y, d.z / r.z)); l = q.length
        if l > 1e-6:
            t = c + Vector((q.x / l * r.x, q.y / l * r.y, q.z / l * r.z))
            v.co = v.co.lerp(t, k)
    me.update()

def build(name, src, newname, lod=False, pal=None, mode=None):
    ob = import_obj(src)
    parts = split_colour(ob, src, pal)
    bud = 700 if lod else budget(src)
    if lod: bud = 600 if group(src) != 'PineTree' else 650
    total = sum(tris(p) for p, _ in parts)
    for p, _ in parts:
        decimate(p, max(24, int(bud * tris(p) / max(1, total))) if total > bud else tris(p))
    for p, c in parts: paint(p, c, None if group(src) == 'Rock' else mode)
    bpy.ops.object.select_all(action='DESELECT')
    for p, _ in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0][0]
    if len(parts) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.data.materials.clear()
    if group(src) == 'Rock':
        roundify(ob, 0.7)
        if mode == 'sand': paint(ob, SAND['Rock'], 'sand')
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0005, use_sharp_edge_from_normals=False)   # (corner colours are per part, so only same-colour neighbours weld)
    bpy.ops.object.mode_set(mode='OBJECT')
    try: bpy.ops.mesh.customdata_custom_splitnormals_clear()
    except Exception: pass
    ob.name = newname; ob.data.name = newname
    k = SCALE[group(src)]
    ob.scale = (k, k, k); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth(keep_sharp_edges=False)
    return ob

def main():
    clean()
    names = sorted(os.path.basename(f)[:-4] for f in glob.glob(ART + '/*.obj'))
    names = [n for n in names if 'map_Kd' not in open(f'{ART}/{n}.mtl').read()]
    obs, info = [], {}
    jobs = [(n, PFX + n, False, None, None) for n in names] + [(n, PFX + n + '_lo', True, None, None) for n in LOD_OF] + [(n, PFX + 'Rock_Sand_' + n.split('_')[1], False, SAND, 'sand') for n in SAND_OF]
    for src, nn, lod, pal, mode in jobs:
        ob = build(nn, src, nn, lod, pal, mode)
        d = ob.dimensions
        info[nn] = dict(h=round(d.z, 2), r=round(max(d.x, d.y) / 2, 2), t=tris(ob))
        obs.append(ob)
    print('TOTAL tris', sum(v['t'] for v in info.values()), 'pieces', len(info))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=False, export_materials='NONE',
                              export_cameras=False, export_lights=False, export_normals=True, export_texcoords=False, export_vertex_color='ACTIVE',
                              export_active_vertex_color_when_no_material=True, export_animations=False)
    print('GLB', OUT, round(os.path.getsize(OUT) / 1024), 'KB')
    with open(TS, 'w') as f:
        f.write('// GENERATED by art/blender/quaternius_nature2.py (do not edit): pack 2 pieces (public/models/nature_qt2.glb), heights / half-widths at scale 1.\n')
        f.write('export const QT2_H: Record<string, number> = {\n' + ''.join(f"  {k[len(PFX):]}: {v['h']},\n" for k, v in info.items()) + '};\n')
        f.write('export const QT2_R: Record<string, number> = {\n' + ''.join(f"  {k[len(PFX):]}: {v['r']},\n" for k, v in info.items()) + '};\n')
    os.makedirs(SHOTS, exist_ok=True)
    json.dump(info, open(os.path.join(SHOTS, 'info.json'), 'w'), indent=1)
    if RENDER: sheet(obs)

def sheet(obs):
    sc = bpy.context.scene
    vm = bpy.data.materials.new('vc'); vm.use_nodes = True
    nt = vm.node_tree; vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color']); nt.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
    for o in obs: o.data.materials.append(vm)
    sheets = [('trees', lambda n: group(n[2:]) in ('CommonTree', 'BirchTree', 'PineTree', 'Willow', 'PalmTree') and not n.endswith('_lo'), 5, 6.0),
              ('small', lambda n: not (group(n[2:]) in ('CommonTree', 'BirchTree', 'PineTree', 'Willow', 'PalmTree') and not n.endswith('_lo')), 14, 3.4)]
    for sname, pred, cols, gap in sheets:
        sel = [o for o in obs if pred(o.name)]
        for o in obs: o.hide_render = o not in sel
        rows = math.ceil(len(sel) / cols)
        for i, o in enumerate(sel):
            r, c = divmod(i, cols); o.location = (c * gap, -r * gap, 0)
        W, Hh = cols * gap, rows * gap
        cx, cy = W / 2 - gap / 2, -Hh / 2 + gap / 2
        for o in list(bpy.data.objects):
            if o.name.startswith('_env'): bpy.data.objects.remove(o)
        bpy.ops.mesh.primitive_plane_add(size=1, location=(cx, cy, -0.02)); pl = bpy.context.object; pl.name = '_envpl'; pl.scale = (W + 8, Hh + 8, 1)
        gm = bpy.data.materials.new('g'); gm.use_nodes = True; gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.5, 0.75, 0.35, 1); pl.data.materials.append(gm)
        bpy.ops.object.light_add(type='SUN', rotation=(math.radians(50), 0, math.radians(30))); bpy.context.object.data.energy = 3.4; bpy.context.object.name = '_envsun'
        w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.8, 0.9, 1, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.9; sc.world = w
        pitch = math.radians(58)
        bpy.ops.object.camera_add(location=(cx, cy - 80 * math.sin(pitch), 80 * math.cos(pitch)), rotation=(pitch, 0, 0)); cam = bpy.context.object; cam.name = '_envcam'
        cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(W, Hh * 1.2) + 4
        sc.camera = cam; sc.view_settings.view_transform = 'Standard'
        sc.render.engine = 'CYCLES'; sc.cycles.samples = 16; sc.cycles.device = 'CPU'
        sc.render.resolution_x = 2400; sc.render.resolution_y = int(2400 * (Hh * 1.0 + 4) / (W + 4))
        sc.render.resolution_y = min(max(sc.render.resolution_y, 800), 3200)
        sc.render.filepath = os.path.join(SHOTS, f'qt2_{sname}.png')
        bpy.ops.render.render(write_still=True); print('sheet', sc.render.filepath)

main()
