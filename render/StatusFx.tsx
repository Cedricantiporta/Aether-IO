// Persistent status tags + hero status effects.
//  - Tags: short chips (BRN PSN FRZ STN SLW BLD RT SIL BLN FEAR) that stay above a unit for as long as the status lasts,
//    side by side in a fixed order. Enemies (on screen) and the hero. One instanced billboard quad per tag kind.
//  - Hero effects: an ice block while frozen (stunned + slowed, the frost bosses), embers while burning, green bubbles
//    while poisoned, blood drops while bleeding, spinning stars while stunned, frost motes while slowed.
//    (Enemies already draw their own ice / stars / embers / poison in Enemies.tsx.)
// No per-frame allocations: module scratch objects, fixed instance pools.
import React, { useMemo } from 'react';
import { liftAt } from './lift';
import { useFrame, useThree } from '@react-three/fiber';
import { IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Mesh, PlaneGeometry, Quaternion, Vector3, type Texture } from 'three';
import { world } from '../engine/world';
import { playerFreeze } from '../engine/systems/combat';
import { useGameStore } from '../store';
import { GameStatus } from '../types';
import { labelMaterial } from './label';
import { getModels } from './enemyModels';
import { inView } from './view';
import { CELL, FX, embers } from './fx';

const TAGS: [string, string][] = [
  ['BRN', '#ff8a3a'], ['PSN', '#8be05a'], ['BLD', '#ff5a5a'], ['FRZ', '#9fe4ff'], ['STN', '#ffe27a'],
  ['SLW', '#7fc8ff'], ['RT', '#d0a868'], ['SIL', '#c79bff'], ['BLN', '#c0c0c0'], ['FEAR', '#d08aff'],
];
const T_BRN = 0, T_PSN = 1, T_BLD = 2, T_FRZ = 3, T_STN = 4, T_SLW = 5, T_RT = 6, T_SIL = 7, T_BLN = 8, T_FEAR = 9;
const MAX_PER = 96, H = 0.66, GAP = 0.12;

const _m = new Matrix4(), _p = new Vector3(), _s = new Vector3(1, 1, 1), _q = new Quaternion();
const list: number[] = [];

export function StatusFx() {
  const camera = useThree((s) => s.camera);
  const sys = useMemo(() => {
    const meshes: InstancedMesh[] = [], widths: number[] = [];
    for (const [txt, col] of TAGS) {
      const l = labelMaterial(txt, col, { size: 52, bg: 'rgba(10,8,6,0.86)', border: col });
      const w = H * l.aspect;
      const mat = new MeshBasicMaterial({ map: l.mat.map as Texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
      const m = new InstancedMesh(new PlaneGeometry(w, H), mat, MAX_PER);
      m.frustumCulled = false; m.count = 0; m.renderOrder = 30;
      meshes.push(m); widths.push(w);
    }
    const ice = new Mesh(new IcosahedronGeometry(1, 0), new MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.5, roughness: 0.1, metalness: 0.1, flatShading: true, emissive: 0x2a6a9a, emissiveIntensity: 0.7 }));
    ice.visible = false; ice.renderOrder = 4;
    return { meshes, widths, counts: new Int32Array(TAGS.length), ice };
  }, []);

  const place = (x: number, y: number, z: number): void => {   // lays out `list` centred at (x, y, z)
    if (list.length === 0) return;
    let total = 0; for (const t of list) total += sys.widths[t];
    total += GAP * (list.length - 1);
    let off = -total / 2;
    for (const t of list) {
      const w = sys.widths[t], n = sys.counts[t];
      if (n < MAX_PER) {
        // shift along the camera's right vector so the row reads left-to-right on screen
        _p.set(off + w / 2, 0, 0).applyQuaternion(_q).add(_v.set(x, y, z));
        _m.compose(_p, _q, _s); sys.meshes[t].setMatrixAt(n, _m); sys.counts[t] = n + 1;
      }
      off += w + GAP;
    }
  };

  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const st = useGameStore.getState().status;
    const live = st === GameStatus.PLAYING || (world.village.area === 'CAVE' && world.village.cave.combat);
    sys.counts.fill(0);
    _q.copy(camera.quaternion);
    if (live) {
      const models = getModels();
      // enemies
      for (const e of world.enemies) {
        if (!e.active || e.state === 'DYING' || !inView(e.pos.x, e.pos.z, 2)) continue;
        list.length = 0;
        if (e.burnT > 0) list.push(T_BRN);
        if (e.poisonT > 0) list.push(T_PSN);
        if (e.freezeT > 0) list.push(T_FRZ);
        else if (e.stunT > 0) list.push(T_STN);
        if (e.fearT > 0) list.push(T_FEAR);
        if (e.slowT > 0.05 && e.freezeT <= 0) list.push(T_SLW);
        if (list.length === 0) continue;
        const s = e.scale || 1, head = (models[e.kind]?.headY ?? e.radius * 1.6 + 0.6) * s;
        place(e.pos.x, e.pos.y + head + (e.elite ? 1.75 : 1.05), e.pos.z);
      }
      // hero
      const p = world.player;
      if (p.alive) {
        const frozen = p.stunT > 0 && world.time < playerFreeze.until;   // (owner: a stun is a stun; only real freezes show as ice)
        list.length = 0;
        if (p.burnT > 0) list.push(T_BRN);
        if (p.poisonT > 0) list.push(T_PSN);
        if (p.bleedT > 0) list.push(T_BLD);
        if (frozen) list.push(T_FRZ); else if (p.stunT > 0) list.push(T_STN);
        if (p.slowT > 0 && !frozen) list.push(T_SLW);
        if (p.rootT > 0) list.push(T_RT);
        if (p.silenceT > 0) list.push(T_SIL);
        if (p.blindT > 0) list.push(T_BLN);
        place(p.pos.x, 5.3 + liftAt(p.pos.x, p.pos.z), p.pos.z);   // above the name + HP bar
        // hero effects
        sys.ice.visible = frozen;
        if (frozen) { sys.ice.position.set(p.pos.x, 0.95, p.pos.z); sys.ice.scale.set(0.95, 1.3, 0.95); sys.ice.rotation.y += dt * 0.2; }
        if (dt > 0) {
          if (p.burnT > 0 && Math.random() < dt * 10) embers(p.pos.x, 0.8, p.pos.z, 1, 0xff8a2a, 0.4, 3, 0.7, 0.16);
          if (p.poisonT > 0 && Math.random() < dt * 7) FX.add.emit(p.pos.x + (Math.random() - 0.5) * 0.8, 0.6, p.pos.z + (Math.random() - 0.5) * 0.8, 0, 1.4, 0, 0.8, 0.22, 0.05, 0.4, 1.6, 0.3, 0.7, CELL.DISC);
          if (p.bleedT > 0 && Math.random() < dt * 6) FX.add.emit(p.pos.x + (Math.random() - 0.5) * 0.6, 1.2, p.pos.z + (Math.random() - 0.5) * 0.6, 0, -1.5, 0, 0.6, 0.14, 0.02, 1.6, 0.15, 0.15, 0.9, CELL.DISC);
          if (p.stunT > 0 && !frozen && Math.random() < dt * 8) { const a = world.time * 6; FX.add.emit(p.pos.x + Math.cos(a) * 0.55, 2.5, p.pos.z + Math.sin(a) * 0.55, 0, 0.1, 0, 0.5, 0.22, 0.05, 2.4, 2.1, 0.6, 1, CELL.STAR); }
          if ((p.slowT > 0 || frozen) && Math.random() < dt * 5) FX.add.emit(p.pos.x + (Math.random() - 0.5) * 1.1, 0.3 + Math.random() * 1.6, p.pos.z + (Math.random() - 0.5) * 1.1, 0, 0.3, 0, 0.6, 0.2, 0.05, 1.3, 2.0, 2.4, 0.9, CELL.STAR);
        }
      } else sys.ice.visible = false;
    } else sys.ice.visible = false;
    for (let t = 0; t < TAGS.length; t++) { const m = sys.meshes[t]; m.count = sys.counts[t]; m.instanceMatrix.needsUpdate = true; }
  });

  return (
    <>
      {sys.meshes.map((m, i) => <primitive key={i} object={m} />)}
      <primitive object={sys.ice} />
    </>
  );
}
const _v = new Vector3();
