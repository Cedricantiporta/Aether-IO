// Destructible props: crate, barrel, chest, pot, hay, crystal, explosive barrel, grave, cart (instanced per kind).
import { inView } from './view';
import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { questWantsItem } from '../engine/systems/npcQuestLogic';
import { questIconMat } from './Npcs';
import { LOOT_TABLES, LOOT_BY_ID } from '../loot';
import { isHarvestNode } from '../engine/mapgen';
const qNode = new Map<string, boolean>();
let qTick = 0;
import { Color, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Material, MeshBasicMaterial, MeshStandardMaterial, BufferGeometry, Sprite } from 'three';
import { world } from '../engine/world';
import type { CrateKind } from '../engine/types';
import { GB, TAU, commitInst, liveRange, patchFlashRim, setInst } from './util';
import { pushHalo, CELL } from './fx';
import { GameStatus } from '../types';
import { useGameStore } from '../store';

const MAXC = 96;
const _tc = new Color();
const KINDS: CrateKind[] = ['CRATE', 'BARREL', 'CHEST', 'POT', 'HAY', 'CRYSTAL', 'RARE_VEIN', 'EPIC_VEIN', 'LEGEND_VEIN', 'ORE', 'GOLD_VEIN', 'HERB', 'EXPLOSIVE_BARREL', 'GRAVE', 'CART'];

function crate() {
  const b = new GB([0.82, 1.08]);
  const w = '#b98650', d = '#7a5230';
  b.box(1.2, 1.2, 1.2, [0, 0.6, 0], w);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.16, 1.26, 0.16, [sx * 0.54, 0.6, sz * 0.54], d);
  for (const y of [0.08, 1.12]) { b.box(1.26, 0.14, 1.26, [0, y, 0], d); }
  for (const s of [0, Math.PI / 2]) { b.box(0.1, 1.5, 0.06, [0, 0.6, 0.62 * (s ? 0 : 1) + 0], d, [0, 0, 0.78]); }
  b.box(0.1, 1.5, 0.06, [0, 0.6, 0.62], d, [0, 0, -0.78]); b.box(0.06, 1.5, 0.1, [0.62, 0.6, 0], d, [0.78, 0, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.sph(0.045, [sx * 0.5, 1.15, sz * 0.62], '#b8b8c0', 1, 4);
  return { body: b.build(), glow: null as BufferGeometry | null };
}
function barrel() {
  const b = new GB([0.8, 1.1]);
  b.cyl(0.52, 0.55, 1.15, 12, [0, 0.58, 0], '#9a6a38', [0, 0, 0], [1, 1, 1]);
  b.sph(0.6, [0, 0.58, 0], '#9a6a38', [1, 0.95, 1], 12);
  for (const y of [0.2, 0.96]) b.cyl(0.6, 0.6, 0.09, 12, [0, y, 0], '#3a3a42');
  b.cyl(0.5, 0.5, 0.05, 12, [0, 1.17, 0], '#7a5230'); b.box(0.5, 0.04, 0.06, [0, 1.2, 0], '#5a3a1e');
  return { body: b.build(), glow: null };
}
function chest() {
  const b = new GB([0.82, 1.1]), g = new GB([1, 1]);
  b.box(1.3, 0.62, 0.85, [0, 0.31, 0], '#8a5a30');
  b.cyl(0.43, 0.43, 1.3, 12, [0, 0.62, 0], '#9a6a38', [0, 0, Math.PI / 2], [1, 1, 1]);
  for (const x of [-0.55, 0, 0.55]) { b.box(0.12, 0.66, 0.9, [x, 0.31, 0], '#e0b040'); b.cyl(0.45, 0.45, 0.12, 12, [x, 0.62, 0], '#e0b040', [0, 0, Math.PI / 2]); }
  b.box(1.34, 0.1, 0.9, [0, 0.03, 0], '#e0b040');
  b.box(0.22, 0.3, 0.1, [0, 0.55, 0.46], '#e0b040');
  g.sph(0.07, [0, 0.53, 0.53], '#fff0a0', 1, 5);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.sph(0.07, [sx * 0.62, 0.05, sz * 0.4], '#e0b040', 1, 5);
  return { body: b.build(), glow: g.build() };
}
function pot() {
  const b = new GB([0.78, 1.1]);
  b.sph(0.46, [0, 0.46, 0], '#c4673a', [1, 0.95, 1], 10);
  b.cyl(0.24, 0.3, 0.3, 10, [0, 0.9, 0], '#c4673a'); b.torus(0.26, 0.05, [0, 1.06, 0], '#a85430', [Math.PI / 2, 0, 0], 1, 10);
  b.torus(0.46, 0.035, [0, 0.52, 0], '#f0d8a0', [Math.PI / 2, 0, 0], 1, 14); b.torus(0.4, 0.025, [0, 0.34, 0], '#4a8fd9', [Math.PI / 2, 0, 0], 1, 14);
  b.box(0.1, 0.32, 0.08, [0.4, 0.78, 0], '#a85430', [0, 0, -0.5]); b.box(0.1, 0.32, 0.08, [-0.4, 0.78, 0], '#a85430', [0, 0, 0.5]);
  return { body: b.build(), glow: null };
}
function hay() {
  const b = new GB([0.85, 1.12]);
  b.cyl(0.62, 0.62, 1.15, 12, [0, 0.62, 0], '#e2c25a', [0, 0, Math.PI / 2]);
  for (const x of [-0.3, 0.3]) b.cyl(0.64, 0.64, 0.07, 12, [x, 0.62, 0], '#8a6a2a', [0, 0, Math.PI / 2]);
  for (let i = 0; i < 9; i++) { const a = i * 0.7; b.cone(0.03, 0.34, 3, [Math.cos(a * 3) * 0.55, 0.62 + Math.sin(a) * 0.6, Math.cos(a) * 0.4], '#f0d878', [a, a * 2, 0]); }
  b.cyl(0.62, 0.62, 0.02, 12, [0.58, 0.62, 0], '#caa840', [0, 0, Math.PI / 2]);
  return { body: b.build(), glow: null };
}
function crystal(ca = '#6fe8ff', cb = '#c88bff', cc = '#8ff4ff') {
  const b = new GB([0.7, 1.1]), g = new GB([0.75, 1.3]);
  b.ico(0.7, [0, 0.1, 0], '#6a707c', [1.3, 0.5, 1.2], 0); b.sph(0.4, [0.5, 0.3, 0.3], '#5aa03a', [1.2, 0.35, 1], 5);
  const sp: [number, number, number, number, number, number, string][] = [[0, 0, 0.3, 1.5, 0.08, 0, ca], [0.4, 0.2, 0.2, 1.0, 0.4, -0.2, cb], [-0.35, -0.1, 0.22, 1.15, -0.35, 0.2, ca], [0.1, -0.4, 0.17, 0.8, 0.2, 0.5, cb], [-0.2, 0.35, 0.15, 0.7, -0.3, -0.4, cc]];
  for (const [x, z, r, h, rz, rx, c] of sp) g.octa(1, [x, h * 0.5 + 0.2, z], c, [r, h * 0.5, r], [rx, 0, rz]);
  return { body: b.build(), glow: g.build() };
}
/** Shard veins of the crystal cavern: the crystal cluster tinted blue (Rare), purple (Epic) or gold (Legendary). */
const rareVein = () => crystal('#3f8cff', '#7fb8ff', '#b8d8ff');
const epicVein = () => crystal('#a24bff', '#d49bff', '#e6c4ff');
const legendVein = () => crystal('#ffb52e', '#ffe27a', '#fff0b0');
function ore() {
  const b = new GB([0.7, 1.1]), g = new GB([0.8, 1.4]);
  b.ico(0.95, [0, 0.45, 0], '#6b6760', [1.2, 0.85, 1.1], 0); b.ico(0.55, [0.65, 0.25, 0.3], '#7a766e', [1, 0.7, 1], 0); b.ico(0.45, [-0.6, 0.2, -0.35], '#5e5a54', [1, 0.7, 1], 0);
  for (const [x, y, z, s] of [[0.2, 0.95, 0.5, 0.2], [-0.4, 0.7, 0.55, 0.16], [0.6, 0.55, -0.4, 0.18], [-0.1, 1.05, -0.3, 0.15]] as number[][]) g.octa(1, [x, y, z], '#9fd0ff', [s, s * 1.5, s], [0.3, 0.4, 0.2]);   // silver-blue ore flecks
  return { body: b.build(), glow: g.build() };
}
/** Gold vein: warm sandstone boulder seamed with chunky gold nuggets. */
function goldVein() {
  const b = new GB([0.7, 1.1]), g = new GB([0.85, 1.35]);
  b.ico(0.9, [0, 0.42, 0], '#8a6a48', [1.25, 0.8, 1.1], 0); b.ico(0.5, [-0.7, 0.22, 0.25], '#9a7a52', [1, 0.7, 1], 0); b.ico(0.42, [0.62, 0.2, -0.4], '#7a5c3c', [1, 0.7, 1], 0);
  for (const [x, y, z, s] of [[0.25, 0.92, 0.42, 0.24], [-0.38, 0.72, 0.5, 0.2], [0.58, 0.58, -0.2, 0.22], [-0.15, 1.02, -0.32, 0.18], [0.0, 0.55, 0.78, 0.16]] as number[][]) g.ico(s, [x, y, z], '#ffcc33', [1.2, 0.9, 1], 0);
  return { body: b.build(), glow: g.build() };
}
/** Healing herb: a leafy bush with glowing red-pink blossoms. */
function herb() {
  const b = new GB([0.7, 1.15]), g = new GB([0.9, 1.2]);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, r = 0.25 + (i % 3) * 0.12; b.cone(0.16, 0.85 + (i % 2) * 0.25, 4, [Math.cos(a) * r, 0.4, Math.sin(a) * r], i % 2 ? '#3f9a3a' : '#5cbf48', [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]); }
  b.sph(0.38, [0, 0.22, 0], '#2f7a2c', [1.3, 0.6, 1.3], 6);
  for (const [x, y, z] of [[0.3, 0.85, 0.15], [-0.25, 0.95, -0.2], [0.05, 1.05, 0.3], [-0.3, 0.78, 0.3], [0.28, 0.9, -0.3]] as number[][]) { g.sph(0.11, [x, y, z], '#ff5a8a', 1, 5); g.sph(0.05, [x, y + 0.08, z], '#fff0a0', 1, 4); }
  return { body: b.build(), glow: g.build() };
}
function keg() {
  const b = new GB([0.8, 1.1]), g = new GB([1, 1]);
  b.cyl(0.5, 0.53, 1.1, 12, [0, 0.56, 0], '#b8321f'); b.sph(0.58, [0, 0.56, 0], '#b8321f', [1, 0.95, 1], 12);
  for (const y of [0.2, 0.94]) b.cyl(0.58, 0.58, 0.09, 12, [y * 0 + 0, y, 0], '#2a2a30');
  b.cyl(0.54, 0.54, 0.22, 12, [0, 0.56, 0], '#f0c020');
  b.sph(0.17, [0, 0.58, 0.54], '#f2f2f0', [1, 1.1, 0.5], 8); b.box(0.16, 0.08, 0.1, [0, 0.42, 0.55], '#f2f2f0');
  for (const s of [-1, 1]) b.sph(0.045, [s * 0.065, 0.6, 0.6], '#101010', 1, 5);
  b.cyl(0.5, 0.5, 0.05, 12, [0, 1.15, 0], '#7a2a1a'); b.cyl(0.02, 0.02, 0.35, 4, [0.15, 1.35, 0], '#d8c8a0', [0, 0, 0.4]);
  g.sph(0.09, [0.25, 1.52, 0], '#ffd060', 1, 6);
  return { body: b.build(), glow: g.build() };
}
function grave() {
  const b = new GB([0.72, 1.1]);
  b.sph(0.8, [0, 0.12, 0.2], '#5a4430', [1.2, 0.35, 1.5], 8);
  b.box(0.95, 1.0, 0.24, [0, 0.55, -0.15], '#9a9aa2'); b.cyl(0.475, 0.475, 0.24, 10, [0, 1.05, -0.15], '#9a9aa2', [Math.PI / 2, 0, 0]);
  b.box(0.1, 0.5, 0.26, [0, 1.05, -0.14], '#6a6a72'); b.box(0.36, 0.1, 0.26, [0, 1.12, -0.14], '#6a6a72');
  b.box(0.05, 0.6, 0.26, [0.2, 0.55, -0.14], '#4a4a52', [0, 0, 0.5]);
  b.box(0.7, 0.14, 0.45, [0, 0.07, -0.1], '#7a7a82'); b.sph(0.25, [-0.5, 0.2, 0.3], '#3f7a30', [1.3, 0.4, 1], 5); b.sph(0.2, [0.55, 0.2, 0.55], '#3f7a30', [1.3, 0.4, 1], 5);
  b.box(0.06, 0.55, 0.06, [0.5, 0.35, 0.7], '#5a3a1e', [0.1, 0, 0.12]); b.box(0.3, 0.06, 0.06, [0.5, 0.52, 0.7], '#5a3a1e', [0.1, 0, 0.12]);
  return { body: b.build(), glow: null };
}
function cart() {
  const b = new GB([0.8, 1.08]), g = new GB([1, 1]);
  const w = '#9a6a38', d = '#6a4624';
  b.box(2.2, 0.16, 1.3, [0, 0.8, 0], w);
  for (const s of [-1, 1]) b.box(2.2, 0.55, 0.12, [0, 1.12, s * 0.62], w, [0, 0, s * 0.0]);
  b.box(0.12, 0.55, 1.3, [-1.05, 1.12, 0], w); b.box(0.12, 0.4, 1.3, [1.05, 1.0, 0], w, [0, 0, 0.5]);
  b.torus(0.55, 0.07, [0.1, 0.55, 0.78], d, [0, 0, 0], 1, 14); for (let i = 0; i < 4; i++) b.box(0.07, 1.05, 0.07, [0.1, 0.55, 0.78], d, [0, 0, (i / 4) * Math.PI]);
  b.torus(0.5, 0.07, [-1.0, 0.25, -0.2], d, [1.4, 0.3, 0.2], 1, 14, 4.0);   // broken wheel lying
  b.box(1.9, 0.09, 0.09, [-2.0, 0.55, 0.3], d, [0, 0.2, -0.3]); b.box(1.7, 0.09, 0.09, [-1.9, 0.5, -0.4], d, [0, -0.1, -0.25]);
  b.sph(0.34, [-0.35, 1.25, 0.1], '#cdb78a', [1, 1.15, 1], 7); b.sph(0.3, [0.35, 1.2, -0.15], '#bfa874', [1, 1.1, 1], 7); b.sph(0.27, [0.2, 1.22, 0.35], '#d6c294', [1, 1.1, 1], 7);
  g.cyl(0.12, 0.12, 0.03, 8, [0.6, 1.0, 0.35], '#ffd23a', [0.4, 0, 0.2]); g.cyl(0.1, 0.1, 0.03, 8, [-0.7, 0.95, 0.25], '#ffd23a', [0.2, 0, 0.5]); g.cyl(0.1, 0.1, 0.03, 8, [1.4, 0.04, 0.5], '#ffd23a', [0, 0, 0]);
  return { body: b.build(), glow: g.build() };
}
const BUILD: Record<CrateKind, () => { body: BufferGeometry; glow: BufferGeometry | null }> = { CRATE: crate, BARREL: barrel, CHEST: chest, POT: pot, HAY: hay, CRYSTAL: () => crystal(), RARE_VEIN: rareVein, EPIC_VEIN: epicVein, LEGEND_VEIN: legendVein, ORE: ore, GOLD_VEIN: goldVein, HERB: herb, EXPLOSIVE_BARREL: keg, GRAVE: grave, CART: cart };

export function Crates() {
  const sys = useMemo(() => {
    const group = new Group();
    const lit = patchFlashRim(new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }), 0.25);
    const glowM = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.6, 1.6) });
    const crystalM = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.7, 1.7, 1.7) });
    const per: Record<string, { body: InstancedMesh; glow: InstancedMesh | null; flash: InstancedBufferAttribute }> = {};
    for (const k of KINDS) {
      const m = BUILD[k]();
      const flash = new InstancedBufferAttribute(new Float32Array(MAXC), 1); flash.setUsage(DynamicDrawUsage);
      m.body.setAttribute('aFlash', flash);
      const body = new InstancedMesh(m.body, lit, MAXC); body.count = 0; body.frustumCulled = false; body.castShadow = true; body.receiveShadow = true; body.instanceMatrix.setUsage(DynamicDrawUsage);
      group.add(body);
      let glow: InstancedMesh | null = null;
      if (m.glow) { glow = new InstancedMesh(m.glow, k === 'CRYSTAL' || k === 'RARE_VEIN' || k === 'EPIC_VEIN' || k === 'LEGEND_VEIN' ? crystalM : glowM, MAXC); glow.count = 0; glow.frustumCulled = false; glow.instanceMatrix.setUsage(DynamicDrawUsage); if (k === 'EXPLOSIVE_BARREL') glow.setColorAt(0, new Color(1, 1, 1)); group.add(glow); }
      per[k] = { body, glow, flash };
    }
    // (owner) harvest nodes a quest needs (their loot is wanted): a quest scroll floats above them
    const qIcons: Sprite[] = [];
    for (let k = 0; k < 12; k++) { const sp = new Sprite(questIconMat()); sp.scale.set(0.6, 0.6, 1); sp.visible = false; sp.renderOrder = 61; group.add(sp); qIcons.push(sp); }
    return { group, per, crystalM, qIcons };
  }, []);
  const counts = useMemo(() => ({} as Record<string, number>), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (const k of KINDS) counts[k] = 0;
    if (++qTick % 20 === 1) qNode.clear();
    let nQ = 0;
    const c = world.crates;
    for (let i = 0; i < c.length; i++) {
      const cr = c[i];
      if (!cr.active) continue;
      if (!inView(cr.pos.x, cr.pos.z, 4)) continue;
      const P = sys.per[cr.kind]; if (!P) continue;
      if (nQ < 12 && isHarvestNode(cr.kind)) {
        let want = qNode.get(cr.kind);
        if (want === undefined) { want = (LOOT_TABLES[cr.kind] ?? []).some((id) => !!LOOT_BY_ID[id] && questWantsItem(LOOT_BY_ID[id].name)); qNode.set(cr.kind, want); }
        if (want) { const sp = sys.qIcons[nQ++]; sp.position.set(cr.pos.x, cr.pos.y + 2.4 + Math.sin(t * 3 + i) * 0.06, cr.pos.z); sp.visible = true; }
      }
      const n = counts[cr.kind]++;
      const f = cr.hitFlash;
      const jx = f > 0 ? Math.sin(t * 70 + i) * 0.07 * f : 0, jz = f > 0 ? Math.cos(t * 83 + i) * 0.07 * f : 0;
      const sq = 1 + f * 0.06;
      setInst(P.body, n, cr.pos.x + jx, cr.pos.y, cr.pos.z + jz, cr.rot, sq, 1 - f * 0.04, sq, 0, f * 0.05 * Math.sin(t * 60));
      P.flash.array[n] = f * 0.8;
      if (P.glow) {
        setInst(P.glow, n, cr.pos.x + jx, cr.pos.y, cr.pos.z + jz, cr.rot, sq, 1 - f * 0.04, sq, 0, f * 0.05 * Math.sin(t * 60));
        if (cr.kind === 'EXPLOSIVE_BARREL') { const bl = 0.5 + 0.5 * Math.sin(t * (4 + (1 - cr.hp / cr.maxHp) * 10) + i); P.glow.setColorAt(n, _tc.setRGB(0.4 + bl * 2.4, 0.3 + bl * 1.4, 0.1)); }
        if (cr.kind === 'CRYSTAL') pushHalo(cr.pos.x, cr.pos.y + 1.0, cr.pos.z, 3.0, 0.4, 1.0, 1.6, 0.35 + 0.1 * Math.sin(t * 2 + i), CELL.GLOW);
        else if (cr.kind === 'RARE_VEIN') pushHalo(cr.pos.x, cr.pos.y + 1.0, cr.pos.z, 3.2, 0.3, 0.6, 2.0, 0.42 + 0.1 * Math.sin(t * 2 + i), CELL.GLOW);
        else if (cr.kind === 'EPIC_VEIN') pushHalo(cr.pos.x, cr.pos.y + 1.0, cr.pos.z, 3.4, 1.1, 0.35, 2.0, 0.46 + 0.1 * Math.sin(t * 2 + i), CELL.GLOW);
        else if (cr.kind === 'LEGEND_VEIN') pushHalo(cr.pos.x, cr.pos.y + 1.0, cr.pos.z, 3.8, 2.0, 1.4, 0.3, 0.55 + 0.12 * Math.sin(t * 2.6 + i), CELL.GLOW);
        else if (cr.kind === 'GOLD_VEIN') pushHalo(cr.pos.x, cr.pos.y + 0.8, cr.pos.z, 2.6, 1.6, 1.2, 0.3, 0.25 + 0.08 * Math.sin(t * 2.4 + i), CELL.GLOW);
        else if (cr.kind === 'HERB') pushHalo(cr.pos.x, cr.pos.y + 0.9, cr.pos.z, 2.2, 1.6, 0.5, 0.8, 0.22 + 0.08 * Math.sin(t * 2 + i), CELL.GLOW);
        else if (cr.kind === 'ORE') pushHalo(cr.pos.x, cr.pos.y + 0.8, cr.pos.z, 2.2, 0.6, 0.9, 1.4, 0.16, CELL.GLOW);
        if (cr.kind === 'CHEST') { if (((t * 1.3 + i) % 3) < 0.15) pushHalo(cr.pos.x, cr.pos.y + 0.6, cr.pos.z + 0.5, 0.9, 2, 1.7, 0.7, 0.8, CELL.STAR); }
      }
    }
    for (let k = nQ; k < 12; k++) if (sys.qIcons[k].visible) sys.qIcons[k].visible = false;
    for (const k of KINDS) { const P = sys.per[k], n = counts[k]; commitInst(P.body, n); liveRange(P.flash, n); if (P.glow) commitInst(P.glow, n); }
    const k = 1.55 + Math.sin(t * 1.6) * 0.3; sys.crystalM.color.setRGB(k, k, k);
  }, -0.2);
  return <primitive object={sys.group} />;
}
void TAU; void GameStatus; void useGameStore;
export const __builders = BUILD;
