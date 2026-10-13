// Companion pets: one procedural model per pet id.
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Material, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, DoubleSide, Vector3 } from 'three';
import { world } from '../engine/world';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { PETS_POOL } from '../constants';
import { getPetProfile } from '../engine/systems/pets';
import { getModels, type MatKey } from './enemyModels';
import { CELL, FX, embers, pushHalo, smokePuff } from './fx';
import { GB, TAU, damp } from './util';
import { isLobbyStatus } from './CameraRig';

interface PetPart { geo: BufferGeometry; mat: MatKey; tint?: number }
interface PetDef {
  body?: BufferGeometry; parts?: PetPart[]; glow?: BufferGeometry;
  wing?: { geo: BufferGeometry; glow?: boolean; up?: boolean; mat?: MatKey; pivot: [number, number, number]; speed: number; amp: number };
  legs?: { geo: BufferGeometry; pivots: [number, number, number][] };
  hover: number; scale: number; hop?: boolean; trail?: 'fire' | 'sparkle' | 'wisp' | 'fairy' | 'ghost'; halo?: [number, number, number, number];
}

function wingGeo(color: string, len: number, h: number, fingers = 3) {
  const w = new GB([0.9, 1.1]);
  w.box(len, 0.04, 0.05, [len / 2, 0.02, 0], color);
  for (let i = 0; i < fingers; i++) { const a = 0.25 + (i / (fingers - 1)) * 1.0; w.tri([0.0, 0, 0.05], [len * 0.95 - i * len * 0.2, -h * 0.2, 0.0], [len * (0.95 - i * 0.28), -h, 0.35 - i * 0.3], color); void a; }
  w.tri([0, 0, 0.05], [len, 0.02, 0], [len * 0.65, -h, 0.35], color);
  return w.build();
}

const DEFS: Record<string, () => PetDef> = {
  // Reuses the SLIME / BAT enemy geometry (shared, cached) with a friendly tint + face.
  pet_blob: () => {
    const m = getModels().SLIME!.parts;
    const f = new GB([1, 1]);
    for (const s of [-1, 1]) f.sph(0.07, [s * 0.34, 0.5, 0.42], '#ff9aa8', [1, 0.6, 0.5], 5);   // blush
    for (let i = -2; i <= 2; i++) f.sph(0.028, [i * 0.045, 0.42 + (i * i) * 0.012 - 0.03, 0.6], '#1f4a10', 1, 4); // smile
    return { parts: [{ geo: m[0].geo, mat: 'jelly', tint: 0xd8ffc8 }, { geo: m[1].geo, mat: 'lit' }, { geo: m[2].geo, mat: 'lit' }, { geo: f.build(), mat: 'lit' }], hover: 0, scale: 0.9, hop: true };
  },
  pet_bat: () => {
    const m = getModels().BAT!.parts, T = 0xd0a0ff;
    return { parts: [{ geo: m[0].geo, mat: 'lit', tint: T }, { geo: m[1].geo, mat: 'glow' }], wing: { geo: m[2].geo, mat: 'lit2', up: true, pivot: [0.2, 0.08, 0], speed: 20, amp: 0.85 }, hover: 1.6, scale: 1.0 };
  },
  pet_fairy: () => {
    const b = new GB([0.9, 1.1]), g = new GB([1, 1]);
    b.cyl(0.07, 0.05, 0.28, 6, [0, 0, 0], '#ffb0d8'); b.sph(0.09, [0, 0.2, 0], '#ffe0c8', 1, 7); b.cone(0.1, 0.16, 6, [0, 0.3, 0], '#ff7ab8', [0, 0, 0.2]);
    b.cone(0.1, 0.2, 6, [0, -0.2, 0], '#ff9ad0', [Math.PI, 0, 0]);
    g.sph(0.14, [0, 0.0, 0], '#fff4d0', 1, 6);
    const w = new GB([1, 1]); w.tri([0, 0.05, 0], [0.34, 0.3, 0], [0.18, -0.08, 0], '#e8f8ff'); w.tri([0, 0.0, 0], [0.26, -0.22, 0], [0.12, -0.03, 0], '#c8e8ff');
    return { body: b.build(), glow: g.build(), wing: { geo: w.build(), glow: true, pivot: [0.06, 0.12, -0.02], speed: 30, amp: 0.7 }, hover: 1.7, scale: 1.7, trail: 'fairy', halo: [1.8, 1.6, 1.3, 0.8] };
  },
  pet_wolf: () => {
    const b = new GB([0.82, 1.15]), g = new GB([1, 1]);
    const c = '#9ad0ff', c2 = '#e8f4ff';
    b.sph(0.34, [0, 0.62, 0], c, [0.85, 0.8, 1.45], 8); b.sph(0.26, [0, 0.8, 0.5], c, 1, 8); b.cone(0.13, 0.32, 5, [0, 0.75, 0.82], c2, [Math.PI / 2, 0, 0]);
    for (const s of [-1, 1]) { b.cone(0.08, 0.22, 4, [s * 0.12, 1.06, 0.42], c2); g.sph(0.035, [s * 0.1, 0.86, 0.72], '#fff060', 1, 4); }
    b.cone(0.1, 0.55, 5, [0, 0.78, -0.65], c2, [-2.0, 0, 0]);
    b.sph(0.22, [0, 0.72, 0.3], c2, [1, 0.9, 1.1], 7);
    const leg = new GB([0.85, 1.1]); leg.cyl(0.06, 0.05, 0.5, 5, [0, -0.25, 0], c2); leg.box(0.1, 0.05, 0.16, [0, -0.5, 0.04], c);
    return { body: b.build(), glow: g.build(), legs: { geo: leg.build(), pivots: [[-0.14, 0.5, 0.3], [0.14, 0.5, 0.3], [-0.14, 0.5, -0.3], [0.14, 0.5, -0.3]] }, hover: 0.05, scale: 1.15, trail: 'ghost', halo: [2.4, 0.4, 0.8, 1.3] };
  },
  pet_dragon: () => {
    const b = new GB([0.82, 1.12]), g = new GB([1, 1]);
    const gold = '#f0c030', gold2 = '#c89018', belly = '#ffe8a0';
    b.sph(0.3, [0, 0.4, 0], gold, [0.9, 0.9, 1.3], 8); b.sph(0.22, [0, 0.4, 0.05], belly, [0.8, 0.8, 1.1], 7);
    b.cyl(0.1, 0.14, 0.4, 6, [0, 0.62, 0.3], gold, [0.6, 0, 0]);
    b.sph(0.18, [0, 0.82, 0.45], gold, [1, 0.9, 1.2], 8); b.cone(0.09, 0.2, 5, [0, 0.78, 0.66], gold2, [Math.PI / 2, 0, 0]);
    for (const s of [-1, 1]) { b.cone(0.04, 0.22, 4, [s * 0.09, 1.0, 0.36], '#fff4c0', [-0.4, 0, -s * 0.3]); g.sph(0.04, [s * 0.09, 0.86, 0.6], '#ff3a2a', 1, 4); }
    b.cone(0.12, 0.6, 5, [0, 0.28, -0.5], gold2, [-1.9, 0, 0]); b.cone(0.07, 0.4, 5, [0, 0.22, -0.9], gold, [-2.1, 0, 0]);
    for (let i = 0; i < 5; i++) b.cone(0.04, 0.12, 3, [0, 0.62 - i * 0.07 + (i > 2 ? -0.03 : 0), 0.0 - i * 0.14], gold2);
    for (const s of [-1, 1]) { b.cyl(0.05, 0.05, 0.25, 5, [s * 0.14, 0.12, 0.2], gold2); b.cyl(0.05, 0.05, 0.25, 5, [s * 0.14, 0.12, -0.2], gold2); }
    return { body: b.build(), glow: g.build(), wing: { geo: wingGeo('#e0a020', 0.75, 0.5, 4), pivot: [0.14, 0.56, -0.05], speed: 11, amp: 0.7 }, hover: 0.9, scale: 1.25, trail: 'sparkle', halo: [1.8, 1.4, 0.7, 0.5] };
  },
  pet_rock: () => {
    const b = new GB([0.8, 1.15]);
    b.ico(0.38, [0, 0.36, 0], '#8d939c', [1.1, 0.9, 1], 1);
    for (const s of [-1, 1]) { b.sph(0.1, [s * 0.14, 0.5, 0.3], '#fff', [1, 1, 0.6], 6); b.sph(0.045, [s * 0.14 + s * 0.02, 0.49, 0.37], '#111', 1, 5); }
    b.sph(0.18, [-0.1, 0.68, -0.05], '#5aa03a', [1.3, 0.4, 1], 5); b.box(0.15, 0.03, 0.05, [0, 0.3, 0.37], '#444');
    return { body: b.build(), hover: 0, scale: 1.5, hop: true };
  },
  pet_golem: () => {
    const b = new GB([0.82, 1.12]), g = new GB([1, 1]);
    const m = '#8a96a8', m2 = '#5c6676';
    b.box(0.55, 0.5, 0.4, [0, 0.62, 0], m); b.box(0.4, 0.3, 0.3, [0, 1.0, 0.02], m2); b.box(0.5, 0.2, 0.34, [0, 0.3, 0], m2);
    for (const s of [-1, 1]) { b.box(0.16, 0.5, 0.16, [s * 0.4, 0.62, 0], m); b.box(0.2, 0.2, 0.2, [s * 0.4, 0.3, 0.05], m2); b.box(0.2, 0.24, 0.2, [s * 0.16, 0.12, 0], m); }
    b.box(0.3, 0.06, 0.1, [0, 1.14, 0.1], m2);
    g.box(0.3, 0.07, 0.05, [0, 1.02, 0.18], '#ffb040'); g.ico(0.09, [0, 0.66, 0.22], '#ffb040', 1, 0);
    return { body: b.build(), glow: g.build(), hover: 0.05, scale: 1.15, hop: false };
  },
  pet_phoenix: () => {
    const b = new GB([0.85, 1.15]), g = new GB([1, 1]);
    const o = '#ff7a1a', y = '#ffd23a';
    b.sph(0.25, [0, 0.4, 0], o, [0.9, 0.9, 1.4], 8); b.sph(0.16, [0, 0.62, 0.32], y, 1, 7); b.cone(0.06, 0.18, 4, [0, 0.6, 0.5], '#ffe070', [Math.PI / 2, 0, 0]);
    b.cone(0.06, 0.26, 4, [0, 0.82, 0.25], y, [-0.5, 0, 0]); b.cone(0.05, 0.22, 4, [0.07, 0.8, 0.22], o, [-0.6, 0, -0.3]);
    for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.3; b.cone(0.07, 0.8 - Math.abs(i - 2) * 0.1, 4, [Math.sin(a) * 0.2, 0.3, -0.5], i % 2 ? y : o, [-1.9, a, 0]); }
    for (const s of [-1, 1]) g.sph(0.03, [s * 0.07, 0.66, 0.43], '#fff', 1, 4);
    g.ico(0.2, [0, 0.4, 0], '#ff9a30', [0.9, 0.9, 1.3], 1);
    return { body: b.build(), glow: g.build(), wing: { geo: wingGeo('#ff9020', 0.8, 0.55, 4), glow: true, pivot: [0.15, 0.5, 0], speed: 10, amp: 0.65 }, hover: 1.4, scale: 1.25, trail: 'fire', halo: [2.4, 1.6, 0.5, 0.1] };
  },
  pet_demigod: () => {
    const g = new GB([1, 1]), b = new GB([1, 1]);
    g.ico(0.22, [0, 0, 0], '#fff4c0', 1, 2); g.ico(0.34, [0, 0, 0], '#ffe090', 1, 1);
    b.torus(0.5, 0.02, [0, 0, 0], '#fff0b0', [Math.PI / 2, 0, 0], 1, 24); b.torus(0.42, 0.02, [0, 0, 0], '#ffd870', [0.9, 0.6, 0], 1, 24);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; g.octa(0.07, [Math.cos(a) * 0.62, Math.sin(a * 2) * 0.1, Math.sin(a) * 0.62], '#ffffff'); }
    return { body: b.build(), glow: g.build(), hover: 1.5, scale: 1.2, trail: 'wisp', halo: [3.0, 1.6, 1.4, 0.8] };
  },
};

// Shared across all pet instances / previews (never disposed; pets are few).
const MATS = new Map<string, Material>();
function petMat(kind: MatKey, id: string, tint = 0xffffff): Material {
  const key = `${kind}:${tint}:${kind === 'lit' ? id : ''}`;
  let m = MATS.get(key);
  if (!m) {
    if (kind === 'glow') m = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.7, 1.7, 1.7), side: DoubleSide });
    else if (kind === 'jelly') m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.2, transparent: true, opacity: 0.85, depthWrite: false, color: tint });
    else m = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7, side: DoubleSide, color: tint, emissive: id === 'pet_wolf' ? 0x335577 : id === 'pet_dragon' ? 0x553300 : 0x000000, emissiveIntensity: 0.6 });
    MATS.set(key, m);
  }
  return m;
}
const DEF_CACHE = new Map<string, PetDef | null>();
function getDef(id: string): PetDef | null {
  if (!DEF_CACHE.has(id)) DEF_CACHE.set(id, DEFS[id] ? DEFS[id]() : null);
  return DEF_CACHE.get(id)!;
}
function partsOf(def: PetDef): PetPart[] {
  const l: PetPart[] = def.parts ? [...def.parts] : [];
  if (def.body) l.unshift({ geo: def.body, mat: 'lit' });
  if (def.glow) l.push({ geo: def.glow, mat: 'glow' });
  return l;
}
function PetMeshes({ def, id, cast }: { def: PetDef; id: string; cast?: boolean }) {
  return <>{partsOf(def).map((p, i) => <mesh key={i} geometry={p.geo} material={petMat(p.mat, id, p.tint)} castShadow={cast && p.mat !== 'jelly'} renderOrder={p.mat === 'jelly' ? 3 : 0} />)}</>;
}

export function Pet() {
  // Owned pets get unique instance ids, so resolve the model by template id / name.
  const id = useGameStore((s) => {
    const p = s.equipment?.pet;
    if (!p) return '';
    return DEFS[p.id] ? p.id : (PETS_POOL.find((x) => x.name === p.name)?.id ?? '');
  });
  const def = useMemo(() => getDef(id), [id]);
  if (!def) return null;
  return <PetActor key={id} id={id} def={def} />;
}

/** Standalone showcase model (no world access): bobs, flaps wings, hops and turns slowly. For UI previews. */
export function PetModel({ id }: { id: string }) {
  const def = useMemo(() => getDef(id), [id]);
  const root = useRef<Group>(null!), model = useRef<Group>(null!), wL = useRef<Group>(null!), wR = useRef<Group>(null!);
  const legs = useRef<Group[]>([]);
  const lit = petMat('lit', id), glow = petMat('glow', id);
  useFrame(({ clock }) => {
    if (!def) return;
    const t = clock.elapsedTime;
    root.current.rotation.y = t * 0.6;
    let y = def.hover + (def.hover > 0.2 ? Math.sin(t * 3) * 0.12 : 0), sq = 1;
    if (def.hop) { const h = Math.max(0, Math.sin(t * 5)) * 0.3; y += h; sq = 1 + h * 0.25; }
    root.current.position.y = y;
    const hx = def.hop ? 1.05 - (sq - 1) * 0.5 : 1;
    model.current.scale.set(def.scale * hx, def.scale * sq, def.scale * hx);
    if (def.wing && wL.current) { const f = Math.sin(t * def.wing.speed * 0.6) * def.wing.amp; const u = def.wing.up ? -1 : 1; wL.current.rotation.z = u * (f + 0.2); wR.current.rotation.z = -u * (f + 0.2); }
    for (let i = 0; i < legs.current.length; i++) if (legs.current[i]) legs.current[i].rotation.x = Math.sin(t * 4 + (i % 2) * Math.PI) * 0.25;
  });
  if (!def) return null;
  const w = def.wing;
  return (
    <group ref={root}>
      <group ref={model}>
        <PetMeshes def={def} id={id} />
        {w && <>
          <group ref={wR} position={w.pivot}><mesh geometry={w.geo} material={w.mat ? petMat(w.mat, id) : w.glow ? glow : lit} /></group>
          <group ref={wL} position={[-w.pivot[0], w.pivot[1], w.pivot[2]]} scale={[-1, 1, 1]}><mesh geometry={w.geo} material={w.mat ? petMat(w.mat, id) : w.glow ? glow : lit} /></group>
        </>}
        {def.legs && def.legs.pivots.map((p, i) => <group key={i} position={p} ref={(r) => { legs.current[i] = r!; }}><mesh geometry={def.legs!.geo} material={lit} /></group>)}
      </group>
    </group>
  );
}

function PetActor({ id, def }: { id: string; def: PetDef }) {
  const root = useRef<Group>(null!), model = useRef<Group>(null!), wL = useRef<Group>(null!), wR = useRef<Group>(null!);
  const legs = useRef<Group[]>([]);
  const lit = petMat('lit', id), glow = petMat('glow', id);
  const prof = useMemo(() => getPetProfile(PETS_POOL.find((x) => x.id === id)?.name), [id]);
  const animK = 0.55 + 0.45 * prof.moveSpeed; // slower pets hop/flap/trot slower
  const S = useRef({ prev: new Vector3(), speed: 0, init: false, yaw: 0, t: 0, phase: 0 });
  const carryG = useRef<Group>(null!);
  const carryMat = useMemo(() => new MeshBasicMaterial({ color: new Color(2, 2, 2), toneMapped: false }), []);
  useFrame(({ clock }, dtRaw) => {
    const status = useGameStore.getState().status;
    if (isLobbyStatus(status) || status === GameStatus.MENU) { root.current.visible = false; return; }
    root.current.visible = true;
    const dt = status === GameStatus.PAUSED ? 0 : Math.min(dtRaw, 0.05);
    const pet = world.pet, s = S.current, t = clock.elapsedTime;
    if (!s.init) { s.prev.copy(pet.pos); s.init = true; }
    const sp = dt > 0 ? Math.hypot(pet.pos.x - s.prev.x, pet.pos.z - s.prev.z) / dt : 0;
    if (Math.hypot(pet.pos.x - s.prev.x, pet.pos.z - s.prev.z) > 8) { // teleported back to the player: poof
      smokePuff(s.prev.x, 1.2, s.prev.z, 6, 0xcccccc, 1.2, 0.7, 1.0, 1.0, 0.5);
      smokePuff(pet.pos.x, 1.2, pet.pos.z, 6, 0xcccccc, 1.2, 0.7, 1.0, 1.0, 0.5);
    }
    s.prev.copy(pet.pos); s.speed = damp(s.speed, sp, 8, dt);
    s.phase += dt * (1 + clamp01(s.speed / 6) * 1.2) * animK;
    const moving = clamp01(s.speed / 4);
    const bob = Math.sin(s.phase * 3 + 1) * (0.12 + moving * 0.05);
    let y = def.hover + (def.hover > 0.2 ? bob : 0);
    let sq = 1;
    if (def.hop) { const h = Math.max(0, Math.sin(s.phase * 7 * (1 + moving * 0.5))) * (0.3 + moving * 0.3); y += h; sq = 1 + h * 0.25; }
    root.current.position.set(pet.pos.x, Math.max(0, pet.pos.y - 1) + y, pet.pos.z);
    s.yaw = pet.facing;
    root.current.rotation.y = pet.facing;
    const a = pet.attackT; // 1 -> 0 after a strike: stretch forward then settle
    const hx = def.hop ? 1.05 - (sq - 1) * 0.5 : 1;
    model.current.scale.set(def.scale * hx * (1 - 0.15 * a), def.scale * sq * (1 - 0.1 * a), def.scale * hx * (1 + 0.45 * a));
    model.current.position.z = a * 0.7;
    model.current.rotation.x = (def.hover > 0.2 ? moving * 0.2 : 0) + a * 0.35;
    if (def.wing && wL.current) { const f = Math.sin(s.phase * def.wing.speed) * def.wing.amp * (1 + moving * 0.3); const u = def.wing.up ? -1 : 1; wL.current.rotation.z = u * (f + 0.2); wR.current.rotation.z = -u * (f + 0.2); }
    for (let i = 0; i < legs.current.length; i++) if (legs.current[i]) legs.current[i].rotation.x = Math.sin(s.phase * 12 + (i % 2) * Math.PI + (i > 1 ? 1.5 : 0)) * 0.7 * moving;
    if (carryG.current) {
      const c = pet.carryT > 0 ? pet.carry : '';
      carryG.current.visible = !!c;
      if (c) {
        carryMat.color.setHex(c === 'GOLD' ? 0xffd23a : c === 'XP' ? 0x5cf0ff : c === 'GEM' ? 0xc58bff : c === 'HEALTH' ? 0xff5a6a : 0xffffff).multiplyScalar(2);
        carryG.current.position.y = 1.05 * def.scale + 0.5 + Math.sin(t * 8) * 0.06;
        carryG.current.rotation.y = t * 3;
        carryG.current.scale.setScalar(Math.min(1, pet.carryT * 4));
      }
    }
    if (dt > 0 && pet.sparkT > 0 && Math.random() < dt * 60) embers(pet.pos.x, root.current.position.y + 0.8, pet.pos.z, 2, 0xfff0a0, 0.5, 2.0, 0.6, 0.12);
    if (def.halo) pushHalo(pet.pos.x, root.current.position.y + 0.5 * def.scale, pet.pos.z, def.halo[0], def.halo[1] * 0.5, def.halo[2] * 0.5, def.halo[3] * 0.5, 0.5, CELL.GLOW);
    if (dt > 0 && def.trail) {
      const x = pet.pos.x, yy = root.current.position.y + 0.4, z = pet.pos.z, r = Math.random;
      if (def.trail === 'fire' && r() < dt * 50) { FX.add.emit(x, yy, z, (r() - 0.5), 0.5, (r() - 0.5), 0.7, 0.5, 0.05, 2.4, 0.8, 0.15, 0.8, CELL.FLAME, -0.5, 1); if (r() < 0.4) embers(x, yy, z, 1, 0xffb040, 0.3, 1.5, 0.9, 0.12); }
      if (def.trail === 'sparkle' && r() < dt * 14) FX.add.emit(x + (r() - 0.5) * 0.5, yy, z + (r() - 0.5) * 0.5, 0, 0.3, 0, 0.7, 0.2, 0.03, 2.2, 1.7, 0.5, 0.9, CELL.STAR, 0, 0.4, r() * 3, 3);
      if (def.trail === 'wisp' && r() < dt * 40) FX.add.emit(x + (r() - 0.5) * 0.4, yy + (r() - 0.5) * 0.4, z + (r() - 0.5) * 0.4, 0, 0.2, 0, 0.9, 0.35, 0.03, 1.8, 1.5, 1.0, 0.7, CELL.GLOW);
      if (def.trail === 'fairy' && r() < dt * 30) FX.add.emit(x + (r() - 0.5) * 0.3, yy, z + (r() - 0.5) * 0.3, (r() - 0.5) * 0.5, -0.4, (r() - 0.5) * 0.5, 0.9, 0.2, 0.02, 2.2, 1.6, 2.0, 0.9, CELL.STAR, 0, 0.3, r() * 3, 3);
      if (def.trail === 'ghost' && r() < dt * 10 * (0.2 + moving)) FX.add.emit(x, yy, z, 0, 0.3, 0, 0.7, 0.5, 0.2, 0.5, 0.9, 1.6, 0.35, CELL.GLOW);
    }
    void smokePuff;
  }, -0.2);
  const w = def.wing;
  return (
    <group ref={root}>
      <group ref={model}>
        <PetMeshes def={def} id={id} cast />
        {w && <>
          <group ref={wR} position={w.pivot}><mesh geometry={w.geo} material={w.mat ? petMat(w.mat, id) : w.glow ? glow : lit} /></group>
          <group ref={wL} position={[-w.pivot[0], w.pivot[1], w.pivot[2]]} scale={[-1, 1, 1]}><mesh geometry={w.geo} material={w.mat ? petMat(w.mat, id) : w.glow ? glow : lit} /></group>
        </>}
        {def.legs && def.legs.pivots.map((p, i) => <group key={i} position={p} ref={(r) => { legs.current[i] = r!; }}><mesh geometry={def.legs!.geo} material={lit} castShadow /></group>)}
      </group>
      <group ref={carryG} visible={false}><mesh material={carryMat}><octahedronGeometry args={[0.2, 0]} /></mesh></group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -(def.hover) + 0.05, 0]} scale={0.5}><circleGeometry args={[0.8, 14]} /><meshBasicMaterial color="#000" transparent opacity={0.25} depthWrite={false} /></mesh>
    </group>
  );
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
void Mesh;
export const __builders = DEFS;
