// Giant ROOTED bosses that are only partly in the arena (owner request): Glacius the Frost Wyrm rises out of the far rim (head, long neck and the two
// front claws gripping the rim; the rest of the dragon is below the arena), and the Mire Hydra's long necks that arch in from its body beyond the
// rim to its five heads. Elderroot (rooted, huge) uses the ordinary Bosses2 rig. Angular low-poly style (owner 2026-10-25): tapered wedges, spikes and faceted plates, bright palette, no round blobs.
// Engine side: systems/bosses2.ts (patterns), enemies.ts (rooted: pinned at rootX / rootZ), enemyDefs.rootedHome.
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, DoubleSide, DynamicDrawUsage, Group, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, type BufferGeometry } from 'three';
import { world } from '../engine/world';
import { bossView } from '../engine/systems/bosses2';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { CELL, FX, pushHalo, smokePuff } from './fx';
import { GB, TAU, clamp, commitInst, damp } from './util';
import { blade, limb, lump, spike } from './bossShapes';

type V3 = [number, number, number];
const sin = Math.sin, cos = Math.cos, ice = '#8fd0f0', ice2 = '#d6f1ff', deep = '#3f86b8', horn = '#e6f6ff';
const wrapPi = (a: number): number => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

// ============================================================================ the dragon
// Owner 2026-10-25: bosses must not look like round baby toys. Glacius is built from low-poly angular parts (5-sided tapered limbs, detail-0 icosahedra,
// 4-sided spikes) under flatShading: long wedge snout, slanted slit eyes, swept horns, crest, fangs, serrated neck plates, clawed talons, a jagged finger-bone wing.
const NECK_N = 20, SC = 2.6;   // neck segments, overall size of the head / claws
function buildDragon() {
  // head (local +z = towards the arena), origin at the skull centre
  const head = new GB([0.78, 1.1]), glow = new GB([1, 1]), jaw = new GB([0.78, 1.1]);
  lump(head, 1.05, [0, 0, 0], ice, [0.95, 0.78, 1.3]);                                                   // angular cranium
  limb(head, [0, 0.05, 0.6], [0, -0.12, 3.35], 0.78, 0.3, 5, ice2, [1, 0.62, 1]);                          // long tapered wedge snout
  limb(head, [0, 0.42, 0.8], [0, 0.34, 3.2], 0.2, 0.1, 4, deep);                                          // nose ridge
  spike(head, [0, 0.34, 3.1], [0, 0.2, 3.7], 0.16, 4, ice2);                                              // nose horn
  for (const s of [-1, 1]) {
    spike(head, [s * 0.55, 0.75, -0.2], [s * 1.6, 1.7, -3.4], 0.34, 5, horn);                               // main horns: long, swept back
    spike(head, [s * 0.95, 0.15, -0.3], [s * 2.4, 0.5, -2.3], 0.2, 4, horn);                                // lower horns
    spike(head, [s * 0.95, -0.15, 0.7], [s * 1.9, -0.55, -0.1], 0.16, 4, horn);                             // cheek spikes
    spike(head, [s * 0.4, -0.3, 2.2], [s * 0.42, -1.15, 2.45], 0.11, 4, '#ffffff');                         // upper fangs
    for (let i = 0; i < 3; i++) spike(head, [s * 0.3, -0.3, 2.6 + i * 0.25], [s * 0.3, -0.7, 2.65 + i * 0.25], 0.06, 3, '#ffffff');
    lump(head, 0.4, [s * 0.52, 0.5, 1.05], deep, [1.1, 0.34, 0.9], [0, 0, -s * 0.5]);                       // heavy slanted brow ridge
    blade(glow, [s * 0.34, 0.4, 1.2], [s * 0.9, 0.62, 1.15], 0.1, 0.07, '#7df3ff');                         // narrow glowing slit eye
    glow.octa(0.07, [s * 0.24, 0.18, 3.55], '#bff6ff', [1, 0.6, 1.4]);                                      // nostril glint
  }
  for (let i = 0; i < 6; i++) spike(head, [0, 0.8 - i * 0.04, -0.1 - i * 0.55], [0, 1.9 - i * 0.2, -0.8 - i * 0.62], 0.2 - i * 0.015, 4, horn, [0.7, 1, 1]);   // crest
  limb(jaw, [0, -0.52, 0.2], [0, -0.58, 3.0], 0.62, 0.26, 5, deep, [1, 0.45, 1]);                          // lower jaw wedge
  spike(jaw, [0, -0.7, 2.7], [0, -1.35, 3.2], 0.16, 4, ice2);                                              // chin spike
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) spike(jaw, [s * 0.3, -0.45, 1.6 + i * 0.5], [s * 0.3, 0.05, 1.7 + i * 0.5], 0.07, 3, '#ffffff');   // lower teeth
    spike(jaw, [s * 0.55, -0.6, 0.6], [s * 1.2, -0.95, 0.1], 0.12, 4, horn);                                // jaw frill
  }
  // neck segment (faceted, instanced, uniform scale) + dorsal spike with two swept side fins
  const seg = new GB([0.82, 1.1]).ico(1, [0, 0, 0], ice, [1, 0.85, 1.2], 0).build();
  const spk = new GB([1, 1]);
  spike(spk, [0, 0.3, 0], [0, 1.9, -0.45], 0.32, 4, horn, [0.6, 1, 1]);
  for (const s of [-1, 1]) spike(spk, [s * 0.35, 0.2, 0], [s * 1.05, 0.95, -0.35], 0.14, 4, horn);
  const spike_ = spk.build();
  // front claw: armoured palm + three long tapered toes with hooked talons, pointing +z
  const claw = new GB([0.8, 1.1]);
  lump(claw, 1.5, [0, 0.7, 0], ice, [1.1, 0.5, 1.25]);
  lump(claw, 1.0, [0, 0.3, 0.6], ice2, [1.1, 0.4, 1.1]);
  for (let i = -1; i <= 1; i++) {
    limb(claw, [i * 0.8, 0.5, 1.0], [i * 0.9, 0.3, 2.7], 0.45, 0.3, 5, ice);
    spike(claw, [i * 0.9, 0.3, 2.6], [i * 0.95, -0.1, 4.3], 0.3, 4, '#ffffff');
    spike(claw, [i * 0.8, 1.05, 1.3], [i * 0.8, 1.9, 0.9], 0.18, 4, horn);                                 // knuckle spike
  }
  spike(claw, [-1.4, 0.45, 0.7], [-2.6, 0.2, 1.9], 0.24, 4, horn);                                        // dew claw
  // wing: arm bone, wrist, four long finger bones with claw tips and a deeply scalloped membrane
  const wing = (s: number) => {
    const w = new GB([0.82, 1.1]);
    const W: V3 = [s * 3.4, 10.6, 0], T: V3[] = [[s * 10.8, 14.6, 0], [s * 14.4, 9.4, 0], [s * 12.2, 3.2, 0], [s * 8, 0.2, 0]], R: V3 = [s * 0.5, 0.6, 0];
    limb(w, [s * -0.4, -0.5, 0], W, 0.55, 0.28, 5, horn);                                                  // arm bone
    spike(w, W, [s * 3.0, 12.6, 0], 0.22, 4, horn);                                                         // wrist spike
    const mid = (a: V3, b: V3): V3 => { const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; return [mx + (W[0] - mx) * 0.38, my + (W[1] - my) * 0.38, 0]; };
    const ring: V3[] = [T[0], mid(T[0], T[1]), T[1], mid(T[1], T[2]), T[2], mid(T[2], T[3]), T[3], mid(T[3], R)];
    ring.push(R);
    for (let i = 0; i < ring.length - 1; i++) w.tri(W, ring[i], ring[i + 1], i % 4 < 2 ? deep : ice);
    w.tri(W, R, [s * 0.5, 9, 0], deep);
    for (const t of T) {
      limb(w, W, t, 0.22, 0.07, 5, horn);
      const dx = t[0] - W[0], dy = t[1] - W[1], l = Math.hypot(dx, dy);
      spike(w, t, [t[0] + dx / l * 1.3, t[1] + dy / l * 1.3, 0], 0.13, 4, '#ffffff');
    }
    return w.build();
  };
  return { head: head.build(), jaw: jaw.build(), glow: glow.build(), seg, spike: spike_, claw: claw.build(), wingL: wing(-1), wingR: wing(1) };
}

// ============================================================================ the hydra necks
const HN = 16, MAX_HEADS = 8;
function buildNeck() {
  const seg = new GB([0.8, 1.12]).ico(1, [0, 0, 0], '#35823f', [1, 0.9, 1.2], 0).build();
  const belly = new GB([0.9, 1.1]).ico(1, [0, 0, 0], '#c8d88a', [0.5, 0.8, 0.5], 0).build();
  const ridge = new GB([1, 1]);   // dorsal plate with two swept side barbs, one per neck segment
  spike(ridge, [0, 0.25, 0], [0, 1.5, -0.4], 0.3, 4, '#1f4a28', [0.55, 1, 1]);
  for (const s of [-1, 1]) spike(ridge, [s * 0.5, 0.2, 0], [s * 1.0, 0.85, -0.3], 0.12, 4, '#e4e0b8');
  return { seg, belly, ridge: ridge.build() };
}

const _o = new Object3D();
function put(m: InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0, rx = 0): void {
  _o.position.set(x, y, z); _o.rotation.set(rx, ry, 0, 'YXZ'); _o.scale.set(sx, sy, sz); _o.updateMatrix(); m.setMatrixAt(i, _o.matrix);
}
const inst = (g: BufferGeometry, m: MeshStandardMaterial, cap: number): InstancedMesh => { const im = new InstancedMesh(g, m, cap); im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(DynamicDrawUsage); im.castShadow = true; return im; };

export function GiantBosses() {
  const G = useMemo(() => {
    const d = buildDragon(), n = buildNeck();
    const lit = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0.05, side: DoubleSide });
    const glowM = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(2, 2, 2) });
    return {
      d, lit, glowM,
      segs: inst(d.seg, lit, NECK_N), spikes: inst(d.spike, lit, NECK_N), claws: inst(d.claw, lit, 2),
      hSeg: inst(n.seg, lit, MAX_HEADS * HN), hBelly: inst(n.belly, lit, MAX_HEADS * HN), hRidge: inst(n.ridge, lit, MAX_HEADS * HN),
    };
  }, []);
  const root = useRef<Group>(null!), headG = useRef<Group>(null!), jawG = useRef<Group>(null!);
  const wingLg = useRef<Group>(null!), wingRg = useRef<Group>(null!);
  const S = useRef({ dy: 0, pitch: 0, jaw: 0, yaw: 0, claw: 0, glow: 0 });

  useFrame(({ clock }, dtRaw) => {
    const status = useGameStore.getState().status;
    const dt = status === GameStatus.PAUSED ? 0 : Math.min(dtRaw, 0.05), TT = clock.elapsedTime;
    const id = bossView.id;
    const e = id >= 0 ? world.enemies[id] : null;
    const on = !!e && e.active && e.rooted && status !== GameStatus.MENU && status !== GameStatus.HERO_SELECT;
    const dragon = on && e!.kind === 'BOSS_WYRM', hydra = on && e!.kind === 'BOSS_HYDRA';
    root.current.visible = dragon;
    let nSeg = 0, nHead = 0;
    if (dragon && e) {
      const s = S.current, t = e.animT, st = e.state, p = e.pattern, k = e.stateT;
      let tDy = sin(t * 1.4) * 0.22, tPitch = 0.1, tJaw = 0.12, tClaw = 0, tGlow = 1 + e.phase * 0.3;
      if (st === 'SPAWN') { const q = clamp(k / 1.6, 0, 1); tDy = -(1 - q * q) * 12; }
      if (p === 0 && st === 'WINDUP') { tPitch = -0.28 * clamp(k / 1.0, 0, 1); tJaw = 0.2 + 0.7 * clamp(k / 1.0, 0, 1); tGlow += 1; }
      else if (p === 0 && st === 'ATTACK') { tPitch = 0.12; tJaw = 0.95; tGlow += 1.6; }
      else if (p === 2 && (st === 'WINDUP' || st === 'ATTACK')) { tPitch = -0.7; tJaw = 0.8; tDy += 1.2; tGlow += 1.2; }   // roars at the sky
      else if (p === 3 && st !== 'RECOVER') { tPitch = -0.45; tJaw = 0.6; tGlow += 1.2; }
      else if ((p === 1 || p === 5) && (st === 'WINDUP' || st === 'ATTACK')) { tClaw = 1; tPitch = 0.2; tDy -= 0.5; tGlow += 1; }   // claws dig in as the ice erupts
      else if (p === 4 && (st === 'WINDUP' || st === 'ATTACK')) { tPitch = 0.3; tJaw = 0.5; }
      if (st === 'DYING') tDy = -clamp(e.deathT / 0.6, 0, 1) * 10;
      const f = st === 'WINDUP' || st === 'ATTACK' ? 11 : 6;
      s.dy = damp(s.dy, tDy, 9, dt); s.pitch = damp(s.pitch, tPitch, f, dt); s.jaw = damp(s.jaw, tJaw, f, dt); s.claw = damp(s.claw, tClaw, 14, dt); s.glow = damp(s.glow, tGlow, 8, dt);
      const baseYaw = Math.atan2(-e.pos.x, -e.pos.z);
      s.yaw = damp(s.yaw, clamp(wrapPi(e.facing - baseYaw), -1.15, 1.15), 7, dt);
      root.current.position.set(e.pos.x, 0, e.pos.z); root.current.rotation.y = baseYaw;
      const H = 6.2 + s.dy;
      headG.current.position.set(0, H, 0.4 - s.pitch * 2); headG.current.rotation.set(s.pitch, s.yaw, 0, 'YXZ'); headG.current.scale.setScalar(SC);
      jawG.current.rotation.x = s.jaw * 0.7;
      const fl = 0.04 + sin(t * 1.6) * 0.07 + (p === 2 && (st === 'WINDUP' || st === 'ATTACK') ? 0.22 : 0) + (st === 'WINDUP' ? 0.05 : 0);   // slow flap, big on the roar
      wingRg.current.rotation.z = fl; wingLg.current.rotation.z = -fl;
      G.glowM.color.setScalar(1.2 + s.glow * 0.8 + 0.2 * sin(TT * 5));
      // neck: rises steeply out of the rim behind the head, then dives below the arena, swaying
      const L = 22;
      for (let i = 0; i < NECK_N; i++) {
        const u = (i + 0.6) / NECK_N;
        const climb = clamp(1 - u * 5.2, 0, 1);
        const y = H * Math.pow(climb, 1.15) - 9 * Math.pow(clamp((u - 0.19) / 0.81, 0, 1), 0.85);
        const x = sin(t * 0.8 + u * 4.2) * 0.9 * u + s.yaw * 2.4 * (1 - u);
        const zz = -3.2 - u * L + (u < 0.19 ? (0.19 - u) / 0.19 * 3.0 : 0);
        const r = 1.65 + 1.9 * u;
        put(G.segs, nSeg, x, y, zz, r, r, r * 1.05);
        put(G.spikes, nSeg, x, y + r * 0.85, zz, r * 0.9, r * 0.9 * (i % 2 ? 1 : 1.35), r * 0.9, 0, -0.2);
        nSeg++;
      }
      for (let i = 0; i < 2; i++) {   // front claws grip the rim (dig in / clench on the ice attacks)
        const sd = i ? 1 : -1;
        put(G.claws, i, sd * 5.8, -0.1 - s.claw * 0.1, -1.4 + s.claw * 0.8, 1.15, 1.15 * (1 - s.claw * 0.25), 1.15, sd * (-0.12 - s.claw * 0.08), 0);
      }
      if (dt > 0 && st !== 'DYING') {   // cold mist from the nostrils, sparkles round the claws, a soft glow on the head
        const hx = e.pos.x + sin(baseYaw + s.yaw) * 2.6 * SC * 0.5, hz = e.pos.z + cos(baseYaw + s.yaw) * 2.6 * SC * 0.5;
        if (Math.random() < dt * 8) smokePuff(hx, H - 0.8, hz, 1, 0xd6f1ff, 1.3, 1.2, 0.5, 1.2, 0.3);
        if (Math.random() < dt * 4) FX.add.emit(e.pos.x + (Math.random() - 0.5) * 14, 0.5 + Math.random() * 1.5, e.pos.z - 1 + Math.random() * 2, 0, 0.8, 0, 0.9, 0.22, 0.03, 1.4, 2.0, 2.4, 0.7, CELL.STAR, 0, 1, 0, 3);
        pushHalo(e.pos.x + sin(baseYaw + s.yaw) * 1.0, H + 0.3, e.pos.z + cos(baseYaw + s.yaw) * 1.0, 5 + s.glow, 0.5, 1.2, 1.7, 0.18 + 0.07 * s.glow, CELL.GLOW);
      }
    }
    commitInst(G.segs, nSeg); commitInst(G.spikes, nSeg);
    G.claws.count = dragon ? 2 : 0; G.claws.instanceMatrix.needsUpdate = true; G.claws.visible = dragon;

    // ---- hydra necks: every living head gets a chain of segments arching in from the body beyond the rim
    if (hydra && e) {
      const list = world.enemies;
      for (let i = 0; i < list.length && nHead < MAX_HEADS; i++) {
        const h = list[i];
        if (!h.active || h.kind !== 'BOSS_HYDRA_HEAD' || h.state === 'DYING') continue;
        const bx = e.pos.x + (nHead - 2) * 1.8, bz = e.pos.z + 1.6, by = 0.6;
        const hx = h.pos.x, hz = h.pos.z, hy = 1.5;
        const dist = Math.hypot(hx - bx, hz - bz), arch = 5 + dist * 0.16;
        const mx = (bx + hx) / 2, mz = (bz + hz) / 2, my = Math.max(by, hy) + arch;
        const nx = -(hz - bz) / (dist || 1), nz = (hx - bx) / (dist || 1);
        for (let q = 0; q < HN; q++) {
          const u = (q + 0.5) / HN, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
          const sw = sin(TT * 1.4 + u * 5 + nHead * 1.3) * 0.7 * sin(Math.PI * u);
          const x = a * bx + b * mx + c * hx + nx * sw, y = a * by + b * my + c * hy, z = a * bz + b * mz + c * hz + nz * sw;
          const r = 1.4 - 0.45 * u;
          put(G.hSeg, nHead * HN + q, x, y, z, r, r, r);
          put(G.hBelly, nHead * HN + q, x, y - r * 0.35, z, r * 0.75, r * 0.7, r * 0.75);
          put(G.hRidge, nHead * HN + q, x, y + r * 0.7, z, r * 0.9, r * 0.9, r * 0.9);
        }
        nHead++;
      }
    }
    commitInst(G.hSeg, nHead * HN); commitInst(G.hBelly, nHead * HN); commitInst(G.hRidge, nHead * HN);
  });

  return (
    <>
      <group ref={root} visible={false}>
        <primitive object={G.segs} /><primitive object={G.spikes} /><primitive object={G.claws} />
        <group ref={headG}>
          <mesh geometry={G.d.head} material={G.lit} castShadow />
          <mesh geometry={G.d.glow} material={G.glowM} />
          <group ref={jawG}><mesh geometry={G.d.jaw} material={G.lit} castShadow /></group>
        </group>
        <group ref={wingRg} position={[0, 0.6, -2.4]}><mesh geometry={G.d.wingR} material={G.lit} position={[0, -0.6, 0]} /></group>
        <group ref={wingLg} position={[0, 0.6, -2.4]}><mesh geometry={G.d.wingL} material={G.lit} position={[0, -0.6, 0]} /></group>
      </group>
      <primitive object={G.hSeg} /><primitive object={G.hBelly} /><primitive object={G.hRidge} />
    </>
  );
}
