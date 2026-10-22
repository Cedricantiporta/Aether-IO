// Giant ROOTED bosses that are only partly in the arena (owner request): Glacius the Frost Wyrm rises out of the far rim (head, long neck and the two
// front claws gripping the rim; the rest of the dragon is below the arena), and the Mire Hydra's long necks that arch in from its body beyond the
// rim to its five heads. Elderroot (rooted, huge) uses the ordinary Bosses2 rig. Everything here is cute / toy style: chunky, rounded, bright.
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
import { makeBossMats, useBossRig } from './bossKit';

const sin = Math.sin, cos = Math.cos, ice = '#8fd0f0', ice2 = '#d6f1ff', deep = '#3f86b8', horn = '#e6f6ff';
const wrapPi = (a: number): number => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

// ============================================================================ the dragon
const NECK_N = 20, SC = 2.6, KIT_HEAD = 0.7, KIT_WING = 2;   // KIT_*: scale of the kit head (inside the SC head group) / wings   // neck segments, overall size of the head / claws
function buildDragon() {
  // head (local +z = towards the arena), origin at the skull centre
  const head = new GB([0.78, 1.1]), glow = new GB([1, 1]), jaw = new GB([0.78, 1.1]);
  head.sph(1.15, [0, 0, 0], ice, [1, 0.88, 1.4], 11);
  head.box(0.95, 0.62, 1.6, [0, -0.1, 1.7], ice2);                        // snout
  head.sph(0.52, [0, 0.12, 2.55], ice2, [1, 0.7, 0.8], 7);               // nose
  for (const s of [-1, 1]) {
    head.cone(0.26, 2.0, 5, [s * 0.62, 0.95, -0.6], horn, [-0.95, 0, s * 0.3]);            // horns
    head.cone(0.14, 1.0, 4, [s * 1.0, 0.35, -0.9], horn, [-0.5, 0, s * 0.9]);
    head.cone(0.12, 0.5, 4, [s * 0.34, -0.45, 2.3], '#ffffff', [Math.PI, 0, 0]);            // upper fangs
    head.sph(0.34, [s * 0.5, 0.5, 1.0], deep, [1, 0.8, 0.6], 6);                              // brow ridge
    glow.sph(0.24, [s * 0.58, 0.46, 1.12], '#7df3ff', [1, 1, 0.6], 6);                       // glowing eyes
    glow.sph(0.09, [s * 0.24, 0.2, 2.78], '#bff6ff', 1, 4);                                  // nostrils glint
  }
  for (let i = 0; i < 5; i++) head.cone(0.18, 0.8 - i * 0.08, 4, [0, 0.95 - i * 0.05, -0.2 - i * 0.55], horn, [0.35, 0, 0]);   // crest
  jaw.box(0.85, 0.3, 1.9, [0, -0.62, 1.55], deep); jaw.box(0.7, 0.22, 0.6, [0, -0.64, 2.4], ice2);
  for (const s of [-1, 1]) jaw.cone(0.1, 0.4, 4, [s * 0.32, -0.38, 2.15], '#ffffff');
  // neck segment (unit sphere, instanced) + a dorsal spike
  const seg = new GB([0.82, 1.1]).ico(1, [0, 0, 0], ice, [1, 1, 1], 1).build();
  const spike = new GB([1, 1]).cone(0.34, 1.1, 4, [0, 0.55, 0], horn).build();
  // front claw: palm + three toes with claws, pointing +z
  const claw = new GB([0.8, 1.1]);
  claw.sph(1.5, [0, 0.7, 0], ice, [1.05, 0.62, 1.25], 9);
  claw.sph(1.0, [0, 0.35, 0.5], ice2, [1, 0.5, 1.1], 7);
  for (let i = -1; i <= 1; i++) {
    claw.cyl(0.36, 0.42, 1.7, 6, [i * 0.8, 0.45, 1.9], ice, [Math.PI / 2 - 0.12, 0, 0]);
    claw.cone(0.26, 0.95, 5, [i * 0.8, 0.28, 3.1], '#ffffff', [Math.PI / 2 + 0.25, 0, 0]);
  }
  claw.cone(0.22, 0.8, 5, [-1.45, 0.45, 0.9], horn, [Math.PI / 2, 0, 0.9]);   // dew claw
  // wing bones rising behind the rim
  const wing = (s: number) => {
    const w = new GB([0.82, 1.1]);
    w.cyl(0.26, 0.4, 11, 6, [s * 0.4, 5.2, 0], horn, [0, 0, -s * 0.5]);
    w.cyl(0.18, 0.26, 8, 6, [s * 4.6, 10.1, 0], horn, [0, 0, s * 1.15]);
    w.tri([s * 0.5, 0.6, 0], [s * 3.2, 10.8, 0], [s * 10.5, 14, 0], deep);
    w.tri([s * 0.5, 0.6, 0], [s * 10.5, 14, 0], [s * 13, 8, 0], ice);
    w.tri([s * 0.5, 0.6, 0], [s * 13, 8, 0], [s * 9, 1.0, 0], deep);
    return w.build();
  };
  return { head: head.build(), jaw: jaw.build(), glow: glow.build(), seg, spike, claw: claw.build(), wingL: wing(-1), wingR: wing(1) };
}

// ============================================================================ the hydra necks
const HN = 16, MAX_HEADS = 8;
function buildNeck() {
  const seg = new GB([0.8, 1.12]).ico(1, [0, 0, 0], '#35823f', [1, 1, 1], 1).build();
  const belly = new GB([0.9, 1.1]).ico(1, [0, 0, 0], '#c8d88a', [0.5, 0.8, 0.5], 1).build();
  return { seg, belly };
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
      hSeg: inst(n.seg, lit, MAX_HEADS * HN), hBelly: inst(n.belly, lit, MAX_HEADS * HN),
    };
  }, []);
  const root = useRef<Group>(null!), headG = useRef<Group>(null!), jawG = useRef<Group>(null!), wingG = useRef<Group>(null!);
  // creature-kit look for Glacius' head, jaw and wings (the neck / claws stay procedural: they are the rooted-giant part); old meshes show until the kit is in
  const km = useMemo(() => makeBossMats(), []), rigH = useBossRig('boss_wyrm', km), rigW = useBossRig('boss_wyrm', km);
  useMemo(() => {
    if (rigH) { for (const k of ['body', 'legL', 'legR', 'tail', 'wingL', 'wingR']) rigH.J[k].visible = false; rigH.J.head.position.set(0, 0, 0); }
    if (rigW) for (const k of ['body', 'legL', 'legR', 'tail', 'head']) rigW.J[k].visible = false;
  }, [rigH, rigW]);
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
      if (rigH) rigH.J.jaw.rotation.x = s.jaw * 0.7;
      if (rigW) {
        const fl = 0.5 + sin(t * 1.6) * 0.12 + (p === 2 && (st === 'WINDUP' || st === 'ATTACK') ? 0.35 : 0) + (st === 'WINDUP' ? 0.1 : 0);
        rigW.J.wingL.rotation.z = fl; rigW.J.wingR.rotation.z = -fl;
        wingG.current.position.set(0, 3.6 + s.dy * 0.5, -3.4);
      }
      km.glow.color.setScalar(0.8 + s.glow * 0.8 + 0.2 * sin(TT * 5));
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
          const r = 1.55 - 0.35 * u;
          put(G.hSeg, nHead * HN + q, x, y, z, r, r, r);
          put(G.hBelly, nHead * HN + q, x, y - r * 0.35, z, r * 0.75, r * 0.7, r * 0.75);
        }
        nHead++;
      }
    }
    commitInst(G.hSeg, nHead * HN); commitInst(G.hBelly, nHead * HN);
  });

  return (
    <>
      <group ref={root} visible={false}>
        <primitive object={G.segs} /><primitive object={G.spikes} /><primitive object={G.claws} />
        <group ref={headG}>
          <group visible={!rigH}>
            <mesh geometry={G.d.head} material={G.lit} castShadow />
            <mesh geometry={G.d.glow} material={G.glowM} />
            <group ref={jawG}><mesh geometry={G.d.jaw} material={G.lit} castShadow /></group>
          </group>
          {rigH && <group scale={KIT_HEAD}><primitive object={rigH.root} /></group>}
        </group>
        <group visible={!rigW}>
          <mesh geometry={G.d.wingL} material={G.lit} position={[0, 0, -2.4]} />
          <mesh geometry={G.d.wingR} material={G.lit} position={[0, 0, -2.4]} />
        </group>
        {rigW && <group ref={wingG} scale={KIT_WING}><primitive object={rigW.root} /></group>}
      </group>
      <primitive object={G.hSeg} /><primitive object={G.hBelly} />
    </>
  );
}
