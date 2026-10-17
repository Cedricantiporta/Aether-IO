// Procedural visible gear for the hero: helmet / armor / gloves / boots / accessory.
// Few merged meshes with vertex colours + 2 shared materials; rebuilt only when equipment rarity changes.
import { BufferGeometry, Color, Group, Material, Mesh, MeshBasicMaterial, Object3D } from 'three';
import { GB, TAU, litMat } from './util';
import { RARITY_ACCENT, RARITY_TIER } from './weapons';

export interface GearSet { helmet: string; armor: string; gloves: string; boots: string; accessory: string; hero?: string }

let _solid: Material | null = null, _glow: Material | null = null;
const solid = () => (_solid ||= litMat({ roughness: 0.42, metalness: 0.5, flatShading: false }));   // smooth: no faceted 'blocky' look
const glow = () => (_glow ||= new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.7, 1.7, 1.7) }));

const METAL = ['#7a5230', '#aeb6c2', '#8a8fa8', '#e2b94a', '#d8c070'];   // by tier: leather, iron, steel-violet, gold, royal gold
const TRIM = (t: number) => RARITY_ACCENT[['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'][t]];
const tierOf = (r: string) => RARITY_TIER[r] ?? 0;

type Pair = { body: GB; glow: GB };
const mk = (): Pair => ({ body: new GB([0.8, 1.1]), glow: new GB([1, 1]) });

function helmet(t: number): Pair {
  const { body: b, glow: g } = mk();
  const m = METAL[t], a = TRIM(t);
  if (t === 0) { // horned leather war-helm: riveted iron band, crossed straps, nasal guard, cheek flaps (reads as a helmet, not a bald head)
    const leather = '#5e3b20', iron = '#8f8a82';
    b.sph(0.3, [0, 0.3, -0.01], leather, [1, 0.95, 1.06], 16);
    b.torus(0.3, 0.035, [0, 0.25, 0], iron, [Math.PI / 2, 0, 0], [1, 1.06, 1], 20);
    b.torus(0.29, 0.025, [0, 0.3, 0], iron, [0, 0, 0], [1, 0.95, 1], 18, Math.PI);
    b.torus(0.29, 0.025, [0, 0.3, 0], iron, [0, Math.PI / 2, 0], [1.06, 0.95, 1], 18, Math.PI);
    b.box(0.06, 0.2, 0.04, [0, 0.19, 0.32], iron);
    for (const s2 of [-1, 1]) {
      b.box(0.07, 0.2, 0.18, [s2 * 0.28, 0.16, 0.05], leather, [0, 0, s2 * 0.12]);
      b.cone(0.065, 0.3, 8, [s2 * 0.33, 0.44, 0], '#e8dcc0', [0, 0, -s2 * 1.0]);
      b.cone(0.045, 0.16, 8, [s2 * 0.47, 0.6, 0], '#d8cba8', [0, 0, -s2 * 0.35]);
      for (let k = 0; k < 3; k++) b.sph(0.022, [s2 * 0.3 * Math.cos(0.5 + k * 0.45), 0.25, 0.3 * Math.sin(0.5 + k * 0.45) + 0.0], '#c9c2b6', 1, 6);
    }
    b.sph(0.13, [0, 0.42, -0.24], '#3b2a1c', [1.4, 0.7, 1], 10);   // fur tuft at the back
  } else if (t === 1) { // iron helm + nose guard
    b.sph(0.3, [0, 0.3, -0.01], m, [1, 0.88, 1.07], 16);
    b.cyl(0.31, 0.31, 0.06, 18, [0, 0.27, 0], a);
    b.box(0.05, 0.2, 0.04, [0, 0.2, 0.3], m);
  } else if (t === 2) { // horned helm
    b.sph(0.3, [0, 0.3, -0.01], m, [1, 0.9, 1.07], 16);
    b.cyl(0.32, 0.32, 0.07, 18, [0, 0.26, 0], a);
    b.box(0.05, 0.22, 0.04, [0, 0.2, 0.3], m);
    for (const s of [-1, 1]) {
      b.cone(0.07, 0.34, 6, [s * 0.34, 0.42, 0], '#efe6d0', [0, 0, -s * 0.9]);
      b.cone(0.05, 0.22, 6, [s * 0.52, 0.56, 0], '#efe6d0', [0, 0, -s * 0.2]);
    }
    g.sph(0.045, [0, 0.4, 0.3], a, 1, 5);
  } else { // crown (legendary gold / mythic taller w/ red gems)
    const n = t === 3 ? 6 : 8, h = t === 3 ? 0.26 : 0.4;
    b.cyl(0.29, 0.31, 0.12, 12, [0, 0.38, 0], m);
    b.cyl(0.3, 0.3, 0.04, 12, [0, 0.33, 0], a);
    for (let i = 0; i < n; i++) {
      const an = (i / n) * TAU;
      const hh = h * (i % 2 ? 0.75 : 1);
      b.cone(0.055, hh, 5, [Math.cos(an) * 0.29, 0.44 + hh / 2, Math.sin(an) * 0.29], m);
      g.sph(0.04, [Math.cos(an) * 0.29, 0.44 + hh, Math.sin(an) * 0.29], i % 2 ? '#ffffff' : a, 1, 5);
    }
    g.sph(0.075, [0, 0.38, 0.31], a, 1, 6);
    if (t === 4) { g.octa(0.1, [0, 0.95, 0], a, [1, 1.5, 1]); g.torus(0.36, 0.015, [0, 0.52, 0], a, [Math.PI / 2, 0, 0], 1, 16); }
  }
  return { body: b, glow: g };
}

/** Wizard headgear: a pointed hat at every tier (cloth colour + trim band by rarity, gem / stars from Epic up). */
const HAT = ['#3a2c6a', '#2c4a8a', '#5a2a8a', '#7a1f2a', '#1a1a2a'];
function wizardHat(t: number): Pair {
  const { body: b, glow: g } = mk();
  const c = HAT[t], a = TRIM(t);
  b.cyl(0.46, 0.46, 0.035, 22, [0, 0.27, 0], c, [0.08, 0, 0]);                          // brim
  b.cyl(0.27, 0.29, 0.1, 18, [0, 0.33, 0], a, [0.08, 0, 0]);                            // trim band
  b.cone(0.27, 0.55, 18, [0, 0.62, -0.02], c, [-0.12, 0, 0]);                           // crown
  b.cone(0.13, 0.32, 14, [0.06, 0.98, -0.12], c, [-0.75, 0, 0.35]);                     // floppy tip
  if (t >= 1) b.sph(0.05, [0.12, 1.06, -0.32], a, 1, 10);
  if (t >= 2) g.octa(0.06, [0, 0.34, 0.29], a, [1, 1.3, 1]);
  if (t >= 3) for (let i = 0; i < 5; i++) { const an = 0.6 + i * 1.1; g.octa(0.025, [Math.cos(an) * 0.2, 0.5 + (i % 2) * 0.12, Math.sin(an) * 0.2], '#ffffff', 1); }
  return { body: b, glow: g };
}

function armorChest(t: number): Pair {
  const { body: b, glow: g } = mk();
  const m = METAL[t], a = TRIM(t);
  // chest plate (front + back) and shoulder pads
  // rounded cuirass: tapered elliptic barrel + domed collar + belt ring (was a plain box)
  b.cyl(0.255, 0.215, 0.38, 18, [0, -0.01, 0], m, [0, 0, 0], [1, 1, 0.74]);
  b.sph(0.255, [0, 0.18, 0], m, [1, 0.42, 0.74], 18);
  b.torus(0.222, 0.032, [0, -0.2, 0], a, [Math.PI / 2, 0, 0], [1, 0.74, 1], 20);
  b.torus(0.2, 0.018, [0, 0.27, 0.02], a, [Math.PI / 2, 0, 0], [1, 0.7, 1], 18);
  for (const s of [-1, 1]) {
    b.sph(0.17 + t * 0.012, [s * 0.32, 0.2, 0], m, [1.15, 0.7, 1.1], 14);
    b.torus(0.15, 0.025, [s * 0.32, 0.18, 0], a, [Math.PI / 2, 0, 0], [1.1, 1.1, 1], 16);
    if (t >= 2) b.cone(0.045, 0.2 + t * 0.03, 5, [s * 0.4, 0.33, 0], m, [0, 0, -s * 0.5]);
    if (t >= 3) g.sph(0.04, [s * 0.34, 0.26, 0.14], a, 1, 5);
  }
  if (t >= 1) b.cyl(0.03, 0.03, 0.3, 8, [0, 0.0, 0.185], a);
  if (t >= 3) g.sph(0.06, [0, 0.08, 0.2], a, 1, 6);
  return { body: b, glow: g };
}

function bracer(t: number): Pair {
  const { body: b, glow: g } = mk();
  b.cyl(0.075 + t * 0.005, 0.065, 0.15, 14, [0, 0.12, 0], METAL[t]);
  b.cyl(0.082 + t * 0.005, 0.082 + t * 0.005, 0.03, 14, [0, 0.2, 0], TRIM(t));
  if (t >= 2) g.sph(0.03, [0, 0.12, 0.075], TRIM(t), 1, 5);
  return { body: b, glow: g };
}

function greave(t: number): Pair {
  const { body: b, glow: g } = mk();
  b.cyl(0.1 + t * 0.006, 0.085, 0.17, 14, [0, 0.09, 0], METAL[t]);
  b.cyl(0.108 + t * 0.006, 0.108 + t * 0.006, 0.035, 14, [0, 0.19, 0], TRIM(t));
  if (t >= 2) g.sph(0.035, [0, 0.12, 0.1], TRIM(t), 1, 5);
  return { body: b, glow: g };
}

function bootCap(t: number): Pair {
  const { body: b } = mk();
  b.sph(0.1, [0, 0.07, 0], METAL[t], [1, 1.1, 0.95], 12);
  return { body: b, glow: new GB() };
}

function amulet(t: number): Pair {
  const { body: b, glow: g } = mk();
  const a = TRIM(t);
  b.torus(0.16, 0.012, [0, 0.2, 0.0], '#c9b27a', [0.35, 0, 0], 1, 14, Math.PI);
  g.octa(0.045 + t * 0.008, [0, 0.06, 0.2], a, [1, 1.4, 1]);
  return { body: b, glow: g };
}

const names = (root: Object3D, ...n: string[]) => n.map((x) => root.getObjectByName(x) || null);

/** Attach the requested gear to the skeleton; returns a disposer (also restores body tint). */
export function attachGear(root: Object3D, mats: Material[], set: GearSet): () => void {
  const geos: BufferGeometry[] = [];
  const added: { parent: Object3D; obj: Object3D }[] = [];
  const put = (bone: Object3D | null, p: Pair, pos: [number, number, number] = [0, 0, 0], scl = 1, flipX = false) => {
    if (!bone) return;
    const grp = new Group();
    grp.position.set(...pos); grp.scale.set(flipX ? -scl : scl, scl, scl);
    const bg = p.body.build(); geos.push(bg);
    const m1 = new Mesh(bg, solid()); m1.castShadow = true; m1.frustumCulled = false; grp.add(m1);
    if (p.glow.parts.length) { const gg = p.glow.build(); geos.push(gg); const m2 = new Mesh(gg, glow()); m2.frustumCulled = false; grp.add(m2); }
    bone.add(grp); added.push({ parent: bone, obj: grp });
  };
  const wiz = set.hero === 'WIZARD';
  // the wizard keeps the model's own hat with a starter helmet; better helmets become coloured wizard hats
  const ownHat = wiz && (!set.helmet || tierOf(set.helmet) === 0);
  if (set.helmet && !ownHat) put(root.getObjectByName('head') || null, wiz ? wizardHat(tierOf(set.helmet)) : helmet(tierOf(set.helmet)), [0, 0.02, 0], 1.75);
  if (set.armor) put(root.getObjectByName('chest') || null, armorChest(tierOf(set.armor)), [0, -0.06, 0.02], 1.7);
  if (set.gloves) { const [l, r] = names(root, 'lowerarml', 'lowerarmr'); put(l, bracer(tierOf(set.gloves)), [0, 0, 0], 1.7); put(r, bracer(tierOf(set.gloves)), [0, 0, 0], 1.7); }
  if (set.boots) {
    const t = tierOf(set.boots);
    const [l, r] = names(root, 'lowerlegl', 'lowerlegr'); put(l, greave(t), [0, 0, 0], 1.45); put(r, greave(t), [0, 0, 0], 1.45);
    const [fl, fr] = names(root, 'footl', 'footr'); put(fl, bootCap(t), [0, 0, 0], 1.5); put(fr, bootCap(t), [0, 0, 0], 1.5);
  }
  if (set.accessory) put(root.getObjectByName('chest') || null, amulet(tierOf(set.accessory)), [0, -0.06, 0.02], 1.7);

  // hide the character's own headgear (bear hat, wizard hat, hood) under a helmet
  const hidden: Object3D[] = [];
  if (set.helmet && !ownHat) root.traverse((o) => { if (o.visible && /hat|hood|helm|cap|crown/i.test(o.name) && (o as Mesh).isMesh) { o.visible = false; hidden.push(o); } });

  // subtle body tint from armour rarity
  const orig: [Color, Color | null][] = [];
  if (set.armor && tierOf(set.armor) > 0) {
    const tint = new Color(TRIM(tierOf(set.armor)));
    for (const m of mats as any[]) if (m.color) { orig.push([m.color.clone(), null]); m.color.lerp(tint, 0.1 + 0.03 * tierOf(set.armor)).multiplyScalar(1.05); }
  }
  return () => {
    for (const { parent, obj } of added) parent.remove(obj);
    for (const g of geos) g.dispose();
    for (const o of hidden) o.visible = true;
    if (orig.length) { let i = 0; for (const m of mats as any[]) if (m.color && orig[i]) m.color.copy(orig[i++][0]); }
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Recolour mode (what the hero uses now): the KayKit model keeps its own silhouette; each gear slot only recolours
// the matching parts of the model by rarity. Helmet -> hat / helmet / hood / mask, armour -> body (+ cape when the
// cape is not the hood), gloves -> arms, boots -> legs. Common gear leaves the original colours.
const PART_TINT: Record<string, string> = { UNCOMMON: '#b8f0b8', RARE: '#a9c8ff', EPIC: '#d6b0ff', LEGENDARY: '#ffc08a', MYTHIC: '#ff9c8c' };
const PART_GLOW: Record<string, string> = { LEGENDARY: '#3a1800', MYTHIC: '#3a0804' };

/** Which gear slot a character mesh belongs to (by KayKit part name). */
export const slotOfMesh = (n: string, hoodIsCape: boolean): keyof GearSet | null => {
  if (/Hat|Helmet|Visor|Mask/i.test(n)) return 'helmet';
  if (/Cape/.test(n)) return hoodIsCape ? 'helmet' : 'armor';
  if (/Body/.test(n)) return 'armor';
  if (/Arm(Left|Right)/.test(n)) return 'gloves';
  if (/Leg(Left|Right)/.test(n)) return 'boots';
  return null;
};

/** One glowing body part: its (private, already cloned) material + the rarity colour pulsed into `emissive` each frame. */
export interface WearGlow { mat: any; r: number; g: number; b: number; amt: number; ph: number }
/** Collect the parts of enhanced (+7) wear. `amts`/`colors` are per slot; built once per equipment change, never per frame. */
export function collectWearGlow(meshes: Mesh[], amts: Partial<Record<keyof GearSet, number>>, colors: Partial<Record<keyof GearSet, Color>>): WearGlow[] {
  const hoodIsCape = meshes.some((m) => /Ranger_Cape|RogueHooded_Cape/.test(m.name));
  const out: WearGlow[] = [];
  for (const m of meshes) {
    const slot = slotOfMesh(m.name, hoodIsCape); if (!slot) continue;
    const amt = amts[slot], c = colors[slot], mat = m.material as any;
    if (!amt || !c || !mat?.emissive) continue;
    out.push({ mat, r: c.r, g: c.g, b: c.b, amt, ph: out.length * 0.9 });
  }
  return out;
}

export function tintGear(meshes: Mesh[], set: GearSet): () => void {
  // rangers and hooded rogues wear their hood as part of the cape
  const hoodIsCape = meshes.some((m) => /Ranger_Cape|RogueHooded_Cape/.test(m.name));
  const slotOf = (n: string) => slotOfMesh(n, hoodIsCape);
  const undo: [any, Color, Color | null][] = [];
  for (const m of meshes) {
    const slot = slotOf(m.name); if (!slot) continue;
    const r = set[slot]; const tint = r && PART_TINT[r]; if (!tint) continue;
    const mat = m.material as any; if (!mat?.color) continue;
    undo.push([mat, mat.color.clone(), mat.emissive ? mat.emissive.clone() : null]);
    mat.color.multiply(new Color(tint));
    if (PART_GLOW[r] && mat.emissive) mat.emissive.set(PART_GLOW[r]);
  }
  return () => { for (const [mat, c, e] of undo) { mat.color.copy(c); if (e) mat.emissive.copy(e); } };
}
