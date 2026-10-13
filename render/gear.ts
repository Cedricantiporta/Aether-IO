// Procedural visible gear for the hero: helmet / armor / gloves / boots / accessory.
// Few merged meshes with vertex colours + 2 shared materials; rebuilt only when equipment rarity changes.
import { BufferGeometry, Color, Group, Material, Mesh, MeshBasicMaterial, Object3D } from 'three';
import { GB, TAU, litMat } from './util';
import { RARITY_ACCENT, RARITY_TIER } from './weapons';

export interface GearSet { helmet: string; armor: string; gloves: string; boots: string; accessory: string }

let _solid: Material | null = null, _glow: Material | null = null;
const solid = () => (_solid ||= litMat({ roughness: 0.5, metalness: 0.45 }));
const glow = () => (_glow ||= new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.7, 1.7, 1.7) }));

const METAL = ['#7a5230', '#aeb6c2', '#8a8fa8', '#e2b94a', '#d8c070'];   // by tier: leather, iron, steel-violet, gold, royal gold
const TRIM = (t: number) => RARITY_ACCENT[['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'][t]];
const tierOf = (r: string) => RARITY_TIER[r] ?? 0;

type Pair = { body: GB; glow: GB };
const mk = (): Pair => ({ body: new GB([0.8, 1.1]), glow: new GB([1, 1]) });

function helmet(t: number): Pair {
  const { body: b, glow: g } = mk();
  const m = METAL[t], a = TRIM(t);
  if (t === 0) { // leather cap
    b.sph(0.29, [0, 0.3, -0.01], m, [1, 0.8, 1.05], 8);
    b.box(0.5, 0.05, 0.12, [0, 0.27, 0.27], '#5a3a20');
  } else if (t === 1) { // iron helm + nose guard
    b.sph(0.3, [0, 0.3, -0.01], m, [1, 0.88, 1.07], 8);
    b.cyl(0.31, 0.31, 0.06, 10, [0, 0.27, 0], a);
    b.box(0.05, 0.2, 0.04, [0, 0.2, 0.3], m);
  } else if (t === 2) { // horned helm
    b.sph(0.3, [0, 0.3, -0.01], m, [1, 0.9, 1.07], 8);
    b.cyl(0.32, 0.32, 0.07, 10, [0, 0.26, 0], a);
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

function armorChest(t: number): Pair {
  const { body: b, glow: g } = mk();
  const m = METAL[t], a = TRIM(t);
  // chest plate (front + back) and shoulder pads
  b.box(0.5, 0.42, 0.36, [0, 0.0, 0.0], m, [0, 0, 0]);
  b.box(0.52, 0.06, 0.38, [0, -0.2, 0], a);
  for (const s of [-1, 1]) {
    b.sph(0.17 + t * 0.012, [s * 0.34, 0.2, 0], m, [1.15, 0.7, 1.1], 7);
    b.torus(0.15, 0.025, [s * 0.34, 0.2, 0], a, [Math.PI / 2, 0, 0], [1.1, 1.1, 1], 10);
    if (t >= 2) b.cone(0.045, 0.2 + t * 0.03, 5, [s * 0.4, 0.33, 0], m, [0, 0, -s * 0.5]);
    if (t >= 3) g.sph(0.04, [s * 0.34, 0.26, 0.14], a, 1, 5);
  }
  if (t >= 1) b.box(0.08, 0.34, 0.02, [0, 0.0, 0.19], a);
  if (t >= 3) g.sph(0.06, [0, 0.08, 0.2], a, 1, 6);
  return { body: b, glow: g };
}

function bracer(t: number): Pair {
  const { body: b, glow: g } = mk();
  b.cyl(0.075 + t * 0.005, 0.065, 0.15, 8, [0, 0.12, 0], METAL[t]);
  b.cyl(0.082 + t * 0.005, 0.082 + t * 0.005, 0.03, 8, [0, 0.2, 0], TRIM(t));
  if (t >= 2) g.sph(0.03, [0, 0.12, 0.075], TRIM(t), 1, 5);
  return { body: b, glow: g };
}

function greave(t: number): Pair {
  const { body: b, glow: g } = mk();
  b.cyl(0.1 + t * 0.006, 0.085, 0.17, 8, [0, 0.09, 0], METAL[t]);
  b.cyl(0.108 + t * 0.006, 0.108 + t * 0.006, 0.035, 8, [0, 0.19, 0], TRIM(t));
  if (t >= 2) g.sph(0.035, [0, 0.12, 0.1], TRIM(t), 1, 5);
  return { body: b, glow: g };
}

function bootCap(t: number): Pair {
  const { body: b } = mk();
  b.sph(0.1, [0, 0.07, 0], METAL[t], [1, 1.1, 0.95], 6);
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
  if (set.helmet) put(root.getObjectByName('head') || null, helmet(tierOf(set.helmet)), [0, 0.02, 0], 1.75);
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
  if (set.helmet) root.traverse((o) => { if (o.visible && /hat|hood|helm|cap|crown/i.test(o.name) && (o as Mesh).isMesh) { o.visible = false; hidden.push(o); } });

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
