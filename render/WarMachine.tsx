// The Dune Colossus (BOSS_WARMACH, engine/systems/bosses2.ts): the Sunscorch Desert's six-legged war machine. An olive armoured hull
// with molten vents, a turret that tracks the hero (twin cannons), and six blocky armoured legs that walk in an
// alternating tripod gait, lift for the stomp and crouch for the rampage. Built once; posed from the boss state.
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Group, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { world } from '../engine/world';
import { bossView } from '../engine/systems/bosses2';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { GB, clamp, damp } from './util';
import { dustPuff, embers } from './fx';

const OLIVE = '#7a844c', OLIVE2 = '#5f683a', DARK = '#3a3f2a', STEEL = '#55585e', AMBER = '#ffb347';
const R = 2.4;   // authored footprint radius (scale = enemy.radius / R)
// leg hips: [x, z, outward yaw]
const HIPS: [number, number, number][] = [[1.35, 1.25, 0.55], [1.5, 0, 0], [1.35, -1.25, -0.55], [-1.35, 1.25, Math.PI - 0.55], [-1.5, 0, Math.PI], [-1.35, -1.25, Math.PI + 0.55]];

function build() {
  const hull = new GB([0.8, 1.12]), glow = new GB([1, 1]), tur = new GB([0.82, 1.1]), turG = new GB([1, 1]), upper = new GB([0.8, 1.1]), lower = new GB([0.78, 1.1]);
  // hull: a wide armoured carapace, sloped plates, a front prow with a sensor eye
  hull.box(2.8, 0.7, 3.2, [0, 1.75, 0], OLIVE);
  hull.box(2.4, 0.5, 2.6, [0, 2.3, -0.1], OLIVE2, [0.05, 0, 0]);
  hull.box(2.2, 0.35, 0.9, [0, 1.95, 1.8], OLIVE, [-0.35, 0, 0]);          // sloped front plate
  hull.box(1.6, 0.5, 0.7, [0, 1.6, 2.0], DARK);                              // chin
  hull.box(0.5, 0.3, 0.4, [0.7, 2.62, -0.8], OLIVE2); hull.box(0.5, 0.3, 0.4, [-0.7, 2.62, -0.8], OLIVE2);   // hatches
  for (const x of [-0.9, -0.6, 0.6, 0.9]) hull.cyl(0.03, 0.03, 0.7, 4, [x, 2.95, -1.0], STEEL);               // antennas
  hull.box(3.0, 0.25, 0.4, [0, 1.35, 1.3], DARK); hull.box(3.0, 0.25, 0.4, [0, 1.35, -1.3], DARK);              // underside struts
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) glow.cyl(0.09, 0.09, 0.06, 8, [s * 1.0 + s * i * 0.18, 2.58, 0.3 + i * 0.12], AMBER, [0, 0, 0]);   // molten vents
  glow.sph(0.18, [0, 1.75, 2.38], '#ff8a2a', [1.4, 0.7, 0.5], 8);            // sensor eye
  glow.box(2.2, 0.06, 0.06, [0, 1.42, 1.62], '#ff7a1a');                     // under-glow seam
  // turret: a squat block with twin cannons (points +Z)
  tur.box(1.3, 0.55, 1.2, [0, 0.3, 0], OLIVE2);
  tur.box(1.0, 0.25, 0.9, [0, 0.65, -0.05], OLIVE);
  tur.box(0.22, 0.22, 1.5, [-0.28, 0.3, 1.1], DARK); tur.box(0.22, 0.22, 1.5, [0.28, 0.3, 1.1], DARK);
  turG.sph(0.09, [-0.28, 0.3, 1.87], '#ff8a2a', 1, 6); turG.sph(0.09, [0.28, 0.3, 1.87], '#ff8a2a', 1, 6);
  // leg (points +X from the hip): an upper strut rising to the knee, a big armoured shin down to the foot
  upper.box(1.5, 0.35, 0.45, [0.75, 0.25, 0], DARK, [0, 0, 0.32]);
  upper.box(0.55, 0.55, 0.55, [1.45, 0.6, 0], STEEL);                          // knee joint
  lower.box(0.85, 2.0, 0.95, [0, -0.95, 0], OLIVE);                            // shin armour (local origin at the knee)
  lower.box(0.95, 0.35, 1.05, [0, -0.3, 0], OLIVE2); lower.box(0.95, 0.35, 1.05, [0, -1.15, 0], OLIVE2);   // stacked plates
  lower.box(1.0, 0.25, 1.15, [0, -2.05, 0], DARK);                             // foot
  lower.cyl(0.12, 0.12, 0.2, 6, [0.3, -2.2, 0.35], STEEL); lower.cyl(0.12, 0.12, 0.2, 6, [-0.3, -2.2, 0.35], STEEL);
  return { hull: hull.build(), glow: glow.build(), tur: tur.build(), turG: turG.build(), upper: upper.build(), lower: lower.build() };
}

export function WarMachine() {
  const g = useMemo(build, []);
  const mats = useMemo(() => ({
    lit: new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75, metalness: 0.25 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(2, 2, 2) }),
  }), []);
  const root = useRef<Group>(null!), body = useRef<Group>(null!), turret = useRef<Group>(null!);
  const legs = useRef<(Group | null)[]>([]), shins = useRef<(Group | null)[]>([]);
  const S = useRef({ crouch: 0, lift: 0, glow: 1, tYaw: 0, lastStep: 0 });

  useFrame(({ clock }, dtRaw) => {
    const r = root.current;
    const status = useGameStore.getState().status;
    const id = bossView.id, e = id >= 0 ? world.enemies[id] : null;
    if (!e || !e.active || e.kind !== 'BOSS_WARMACH' || status === GameStatus.MENU || status === GameStatus.HERO_SELECT) { r.visible = false; return; }
    r.visible = true;
    const dt = status === GameStatus.PAUSED ? 0 : Math.min(dtRaw, 0.05), s = S.current, t = e.animT, TT = clock.elapsedTime;
    const W = e.state === 'WINDUP', A = e.state === 'ATTACK', p = e.pattern;
    const moving = Math.min(1, Math.hypot(e.vel.x, e.vel.z) / Math.max(0.1, e.speed));
    // targets: crouch for the rampage, legs lift for the stomp, vents flare while attacking
    const crouchT = p === 4 && (W || A) ? 0.45 : 0;
    const liftT = p === 2 ? (W ? clamp(e.stateT / 0.9, 0, 1) : A ? -0.3 : 0) : 0;
    s.crouch = damp(s.crouch, crouchT, 8, dt); s.lift = damp(s.lift, liftT, 14, dt);
    s.glow = damp(s.glow, 1 + (W || A ? 1.6 : 0) + e.phase * 0.3, 8, dt);
    // spawn: rises out of the ground; death: sinks with a shudder
    let yOff = 0, shx = 0;
    if (e.state === 'SPAWN') { const k = clamp(e.stateT / 1.6, 0, 1); yOff = -(1 - k * k) * 5; shx = Math.sin(TT * 60) * 0.06 * (1 - k); }
    if (e.state === 'DYING') { const k = clamp(e.deathT / 0.6, 0, 1); yOff = -k * 2.5; shx = Math.sin(TT * 80) * 0.1 * (1 - k); s.glow = 3 * (1 - k); }
    const sc = e.radius / R;
    r.position.set(e.pos.x + shx * sc, e.pos.y + yOff, e.pos.z);
    r.rotation.y = e.facing;
    r.scale.setScalar(sc);
    body.current.position.y = -s.crouch + Math.abs(Math.sin(t * 4)) * 0.05 * moving;
    // turret tracks the hero
    const pl = world.player.pos, want = Math.atan2(pl.x - e.pos.x, pl.z - e.pos.z) - e.facing;
    s.tYaw += Math.atan2(Math.sin(want - s.tYaw), Math.cos(want - s.tYaw)) * Math.min(1, dt * 5);
    turret.current.rotation.y = s.tYaw;
    // legs: alternating tripod gait while moving; all lift together for the stomp
    for (let i = 0; i < 6; i++) {
      const L = legs.current[i], sh = shins.current[i]; if (!L || !sh) continue;
      const ph = t * 6 + (i % 2 === (i < 3 ? 0 : 1) ? 0 : Math.PI);
      const swing = Math.sin(ph) * 0.28 * moving, up = Math.max(0, Math.cos(ph)) * 0.35 * moving;
      L.rotation.y = HIPS[i][2] + swing;
      L.rotation.z = up + s.lift * 0.55 + s.crouch * 0.5;
      sh.rotation.z = -(up * 0.6 + s.lift * 0.4) + s.crouch * 0.4;
    }
    mats.glow.color.setScalar(1.1 + s.glow * 0.9 + 0.2 * Math.sin(TT * 6));
    if (dt > 0 && e.state !== 'DYING' && e.state !== 'SPAWN') {
      if (Math.random() < dt * 8) embers(e.pos.x + (Math.random() - 0.5) * e.radius, 2.5 * sc, e.pos.z + (Math.random() - 0.5) * e.radius, 1, 0xff9a3a, 0.3, 2.2, 0.9, 0.2);
      const step = Math.sin(t * 6) > 0 ? 1 : 0;
      if (moving > 0.2 && step !== s.lastStep) { s.lastStep = step; dustPuff(e.pos.x, e.pos.z, 3, 2.2, 0xb8a888, 3); }
    }
  });

  return (
    <group ref={root} visible={false}>
      <group ref={body}>
        <mesh geometry={g.hull} material={mats.lit} castShadow />
        <mesh geometry={g.glow} material={mats.glow} />
        <group ref={turret} position={[0, 2.6, 0.2]}>
          <mesh geometry={g.tur} material={mats.lit} castShadow />
          <mesh geometry={g.turG} material={mats.glow} />
        </group>
        {HIPS.map(([x, z], i) => (
          <group key={i} ref={(el) => { legs.current[i] = el; }} position={[x, 1.75, z]}>
            <mesh geometry={g.upper} material={mats.lit} castShadow />
            <group ref={(el) => { shins.current[i] = el; }} position={[1.45, 0.6, 0]}>
              <mesh geometry={g.lower} material={mats.lit} castShadow />
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}
