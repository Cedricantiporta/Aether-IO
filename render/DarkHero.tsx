// Dark hero champions (engine/systems/darkHero.ts): the player's KayKit class model, dyed shadow-black, glowing red eyes,
// a crimson class weapon, a pulsing violet aura; the charging ball of a cast, the Shield Wall bubble, the Whirlwind ring,
// the Divine Avatar halo. DarkFx draws the champion's skill shots (darkShots: Gale Arrow, Lightpiercer, Fireballs,
// Cross Slash, Holy Wave, Bone Spear, sword arcs), the boomerang axes (enemy projectile kind AXE) and the Storm Orbs.
// The hero's own looks, dyed dark / violet. One model instance at a time (keyed by class). No per-frame allocations.
import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, AnimationAction, BufferGeometry, AnimationMixer, Color, DoubleSide, Group, InstancedMesh, LoopOnce, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  RingGeometry, SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import { world } from '../engine/world';
import { darkView, DARK_CLASSES, darkShots, darkOrbs, SHOT_GALE, SHOT_LIGHT, SHOT_FIRE, SHOT_XSLASH, SHOT_HOLY, SHOT_BONE, SHOT_SLASH } from '../engine/systems/darkHero';
import { GameStatus } from '../types';
import type { HeroClass } from '../types';
import { useGameStore } from '../store';
import { CELL, FX, pushHalo } from './fx';
import { GB, TAU, angleLerp, clamp, damp, litMat, setInst } from './util';
import { useCharacterInstance, useClips, upperBody, type CharKey } from './characters';
import { HANDSLOT_QUAT, makeAxe, makeBow, makeStaff, makeSword } from './weapons';
import { useWorldCounter } from './hooks';

const CHAR: Record<HeroClass, CharKey> = { ARCHER: 'ARCHER', WIZARD: 'WIZARD', BARBARIAN: 'BARBARIAN', KNIGHT: 'KNIGHT', NECROMANCER: 'ROGUE' };
const SHADOW = new Color(0.17, 0.14, 0.24);
/** Colour of the charging ball per class (light arrow, fireball, axe fury, holy light, bone). */
const ORB_COL: Record<HeroClass, Color> = {
  ARCHER: new Color(2.2, 1.8, 2.8), WIZARD: new Color(2.6, 0.9, 0.6), BARBARIAN: new Color(2.4, 0.4, 0.7), KNIGHT: new Color(2.4, 1.7, 2.8), NECROMANCER: new Color(1.6, 1.0, 2.6),
};
const _v = new Vector3();

function weapon(cls: HeroClass) {
  const accent = '#ff2a4a';
  return cls === 'ARCHER' ? makeBow(accent, 3) : cls === 'WIZARD' || cls === 'NECROMANCER' ? makeStaff(cls === 'NECROMANCER' ? '#b04aff' : accent, 3) : cls === 'KNIGHT' ? makeSword(accent, 3) : makeAxe(accent, 3);
}

function DarkHeroModel({ cls }: { cls: HeroClass }) {
  const ch = useCharacterInstance(CHAR[cls]);
  const clips = useClips();
  const root = useRef<Group>(null!), body = useRef<Group>(null!), aura = useRef<Mesh>(null!), eyes = useRef<Group>(null!), guard = useRef<Mesh>(null!), spinRing = useRef<Mesh>(null!);
  const orb = useRef<Mesh>(null!), halo = useRef<Mesh>(null!);
  const mats = useMemo(() => ({
    eye: new MeshBasicMaterial({ color: new Color(3.2, 0.35, 0.45), toneMapped: false }),
    eyeGlow: new MeshBasicMaterial({ color: new Color(1.6, 0.1, 0.25), transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    aura: new MeshBasicMaterial({ color: new Color(0.9, 0.25, 1.6), transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }),
    guard: new MeshBasicMaterial({ color: new Color(0.6, 0.8, 2.2), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }),
    spin: new MeshBasicMaterial({ color: new Color(2.0, 0.3, 0.5), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }),
    orb: new MeshBasicMaterial({ color: ORB_COL[cls], transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    halo: new MeshBasicMaterial({ color: new Color(2.2, 1.6, 2.6), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }),
  }), [cls]);
  const geos = useMemo(() => ({
    eye: new SphereGeometry(0.06, 8, 6), eyeGlow: new SphereGeometry(0.16, 8, 6),
    aura: new RingGeometry(0.9, 1.6, 40).rotateX(-Math.PI / 2), guard: new SphereGeometry(1.7, 20, 14), spin: new RingGeometry(4.1, 4.8, 56).rotateX(-Math.PI / 2),
    orb: new SphereGeometry(0.32, 12, 10), halo: new TorusGeometry(0.42, 0.06, 6, 24).rotateX(Math.PI / 2),
  }), []);
  const S = useRef({ mixer: null as AnimationMixer | null, idle: null as AnimationAction | null, run: null as AnimationAction | null, atk: null as AnimationAction | null,
    cast: null as AnimationAction | null, death: null as AnimationAction | null, hit: null as AnimationAction | null,
    wRun: 0, yaw: 0, atk0: -1, cast0: -1, flash0: 0, dead: false, emis: '', puff: 0 });

  // shadow dye
  useEffect(() => {
    for (const m of ch.mats as MeshStandardMaterial[]) { if (m.color) m.color.copy(SHADOW); if ('roughness' in m) m.roughness = 0.55; }
  }, [ch]);
  // weapon in the right hand, eyes on the head bone (a small shield on the knight's left hand)
  useEffect(() => {
    const added: { p: { remove: (o: any) => void }; o: Group }[] = [];
    if (ch.handR) {
      const w = weapon(cls), g = new Group();
      g.quaternion.copy(HANDSLOT_QUAT); g.scale.setScalar(1.15);
      const b = new Mesh(w.body, litMat({ roughness: 0.4, metalness: 0.4, color: new Color(0.35, 0.3, 0.4) })); b.castShadow = true;
      const gl = new Mesh(w.glow, new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(2.4, 1.6, 1.8) }));
      g.add(b, gl); ch.handR.add(g); added.push({ p: ch.handR, o: g });
    }
    if (cls === 'KNIGHT' && ch.handL) {
      const sb = new GB([0.8, 1.1]); sb.cyl(0.5, 0.5, 0.1, 8, [0, 0, 0], '#2a2236', [Math.PI / 2, 0, 0]); sb.cyl(0.18, 0.18, 0.14, 8, [0, 0, 0.03], '#8a1a2a', [Math.PI / 2, 0, 0]);
      const g = new Group(); g.add(new Mesh(sb.build(), litMat({ roughness: 0.5, metalness: 0.3 }))); g.position.set(0, 0.1, 0); g.rotation.set(0, Math.PI / 2, 0);
      ch.handL.add(g); added.push({ p: ch.handL, o: g });
    }
    const head = ch.root.getObjectByName('head');
    if (head) { head.add(eyes.current); added.push({ p: head, o: eyes.current }); }
    return () => { for (const a of added) a.p.remove(a.o); };
  }, [ch, cls]);
  // animation mixer
  useEffect(() => {
    const m = new AnimationMixer(ch.root), s = S.current;
    const mk = (name: string, w = 0) => { const c = clips[name]; if (!c) return null; const a = m.clipAction(c); a.setEffectiveWeight(w); return a; };
    s.idle = mk('Idle_A', 1); s.idle?.play();
    s.run = mk('Running_A'); s.run?.play();
    s.death = mk('Death_A'); if (s.death) { s.death.setLoop(LoopOnce, 1); s.death.clampWhenFinished = true; }
    s.hit = mk('Hit_A'); if (s.hit) s.hit.setLoop(LoopOnce, 1);
    const thr = clips['Throw'];
    if (thr) { s.atk = m.clipAction(upperBody(thr)); s.atk.setLoop(LoopOnce, 1); }
    const use = clips['Use_Item'] || clips['Interact'];
    if (use) { s.cast = m.clipAction(upperBody(use)); s.cast.setLoop(LoopOnce, 1); }
    s.mixer = m; s.dead = false; s.atk0 = darkView.atk; s.cast0 = darkView.cast;
    return () => { m.stopAllAction(); m.uncacheRoot(ch.root); s.mixer = null; };
  }, [ch, clips]);

  useFrame((state, dt0) => {
    const s = S.current, m = s.mixer, g = root.current; if (!m || !g) return;
    const e = world.enemies[darkView.id];
    const on = !!e && e.active && e.kind === 'DARK_HERO';
    g.visible = on && e.hideT <= 0;
    if (!on) return;
    const paused = useGameStore.getState().status === GameStatus.PAUSED;
    const dt = paused ? 0 : Math.min(dt0, 0.05), t = state.clock.elapsedTime;
    const dying = e.state === 'DYING';
    // transform: rise out of the ground on spawn, leap arc, whirlwind spin
    const rise = e.state === 'SPAWN' ? clamp(e.stateT / 0.6, 0, 1) : 1;
    g.position.set(e.pos.x, (1 - rise) * -2.2 + (dying ? 0 : darkView.air), e.pos.z);
    g.scale.setScalar(e.scale);
    s.yaw = angleLerp(s.yaw, e.facing, 1 - Math.exp(-18 * dt));
    body.current.rotation.y = darkView.spin > 0 && !dying ? t * 18 : 0;
    g.rotation.y = s.yaw;
    // animation weights
    if (dying && !s.dead) { s.dead = true; s.death?.reset().play(); }
    const speed = Math.hypot(e.vel.x, e.vel.z);
    s.wRun = damp(s.wRun, dying ? 0 : clamp(speed / 3, 0, 1), 12, dt);
    if (s.run) { s.run.setEffectiveWeight(s.wRun + 1e-4); s.run.timeScale = 0.8 + speed / 9; }
    s.idle?.setEffectiveWeight((dying ? 0 : 1 - s.wRun) + 1e-4);
    if (s.death) s.death.setEffectiveWeight(dying ? 6 : 0);
    if (!dying) {
      if (darkView.atk !== s.atk0 && s.atk) { s.atk.reset(); s.atk.timeScale = 2.2; s.atk.play(); }
      if (darkView.cast !== s.cast0 && (s.cast || s.atk)) { const c = s.cast || s.atk!; c.reset(); c.timeScale = 1.6; c.play(); }
      if (e.hitFlash > 0.9 && s.flash0 < 0.5 && s.hit && Math.random() < 0.25) { s.hit.reset(); s.hit.timeScale = 1.8; s.hit.play(); }
    }
    s.atk0 = darkView.atk; s.cast0 = darkView.cast; s.flash0 = e.hitFlash;
    const env = (a: AnimationAction | null, W: number) => { if (!a) return; if (!a.isRunning()) { a.setEffectiveWeight(0); return; } const f = a.time / a.getClip().duration; a.setEffectiveWeight(W * Math.min(1, f / 0.07) * Math.min(1, (1 - f) / 0.15 + 0.001)); };
    env(s.atk, 7); env(s.cast, 7); env(s.hit, 4);
    m.update(dt);
    // emissive: violet base glow, red pulse while winding up, white-red flash on hits
    let r = 0.07, gg = 0.0, bb = 0.12;
    if (darkView.titan > 0 || darkView.rage > 0) { r += 0.18; }
    if (darkView.avatar > 0) { r += 0.12; gg += 0.08; bb += 0.22; }
    if (e.state === 'WINDUP') { const k = 0.25 + 0.2 * Math.sin(e.stateT * 30); r += k; bb += k * 0.2; }
    if (darkView.enraged) { r += 0.06 + 0.04 * Math.sin(t * 6); }
    r += e.hitFlash * 0.7; gg += e.hitFlash * 0.25; bb += e.hitFlash * 0.3;
    if (dying) { const k = clamp(e.deathT / 0.6, 0, 1); r = 0.4 * (1 - k); bb = 0.6 * (1 - k); }
    const key = ((r * 100) | 0) + ',' + ((gg * 100) | 0) + ',' + ((bb * 100) | 0);
    if (key !== s.emis) { s.emis = key; for (const mt of ch.mats as MeshStandardMaterial[]) if (mt.emissive) mt.emissive.setRGB(r, gg, bb); }
    // aura ring + eyes + guard + whirlwind ring
    const pulse = 1 + Math.sin(t * 4) * 0.08;
    aura.current.scale.set(pulse * (darkView.enraged ? 1.25 : 1), 1, pulse * (darkView.enraged ? 1.25 : 1));
    aura.current.rotation.y = t * 0.6;
    mats.aura.opacity = dying ? 0.5 * (1 - clamp(e.deathT / 0.6, 0, 1)) : 0.42 + Math.sin(t * 5) * 0.1;
    mats.aura.color.setRGB(darkView.enraged ? 1.8 : 0.9, 0.2, darkView.enraged ? 0.6 : 1.6);
    mats.eyeGlow.opacity = 0.45 + Math.sin(t * 7) * 0.15;
    const gk = darkView.guard > 0 && !dying ? 1 : 0;
    mats.guard.opacity = damp(mats.guard.opacity, gk * (0.22 + Math.sin(t * 9) * 0.06), 10, dt);
    guard.current.visible = mats.guard.opacity > 0.02;
    mats.spin.opacity = damp(mats.spin.opacity, darkView.spin > 0 && !dying ? 0.55 : 0, 10, dt);
    spinRing.current.visible = mats.spin.opacity > 0.02; spinRing.current.rotation.y = -t * 6;
    // the ball of light / fire charging in front of the hero during a cast
    const chg = dying ? 0 : darkView.charge;
    orb.current.visible = chg > 0.02;
    if (orb.current.visible) { orb.current.scale.setScalar(0.4 + chg * 1.4 + Math.sin(t * 30) * 0.06); mats.orb.opacity = 0.5 + chg * 0.45; }
    // Divine Avatar: a radiant halo; Titan's Wrath / Bloodrage: a blood-red glow
    mats.halo.opacity = damp(mats.halo.opacity, darkView.avatar > 0 && !dying ? 0.9 : 0, 8, dt);
    halo.current.visible = mats.halo.opacity > 0.02; halo.current.rotation.y = t * 2;
    if (darkView.avatar > 0 && dt > 0 && Math.random() < dt * 30) FX.add.emit(e.pos.x + (Math.random() - 0.5) * 1.6, 0.4 + Math.random() * 2.2, e.pos.z + (Math.random() - 0.5) * 1.6, 0, 2.2, 0, 0.6, 0.3, 0.05, 2.2, 1.6, 2.6, 0.9, CELL.STAR);
    if ((darkView.titan > 0 || darkView.rage > 0) && dt > 0 && Math.random() < dt * 24) FX.add.emit(e.pos.x + (Math.random() - 0.5) * 2 * e.scale, 0.3 + Math.random() * 2 * e.scale, e.pos.z + (Math.random() - 0.5) * 2 * e.scale, 0, 2, 0, 0.5, 0.45, 0.05, 2.4, 0.3, 0.5, 0.8, CELL.GLOW);
    // rising violet wisps
    if (dt > 0 && !dying && rise >= 1) {
      s.puff += dt * 14;
      while (s.puff > 1) {
        s.puff -= 1;
        const a = Math.random() * TAU, rr = 0.4 + Math.random() * 0.6;
        FX.add.emit(e.pos.x + Math.cos(a) * rr, 0.2 + Math.random() * 1.6, e.pos.z + Math.sin(a) * rr, 0, 1.4 + Math.random(), 0, 0.7, 0.35, 0.05, darkView.enraged ? 1.6 : 0.8, 0.15, darkView.enraged ? 0.5 : 1.4, 0.7, CELL.GLOW);
      }
    }
    void _v;
  });

  return (
    <group ref={root}>
      <group ref={body}><primitive object={ch.root} /></group>
      <group ref={eyes} position={[0, 0.22, 0.3]}>
        <mesh geometry={geos.eye} material={mats.eye} position={[0.12, 0, 0]} />
        <mesh geometry={geos.eye} material={mats.eye} position={[-0.12, 0, 0]} />
        <mesh geometry={geos.eyeGlow} material={mats.eyeGlow} position={[0.12, 0, 0]} />
        <mesh geometry={geos.eyeGlow} material={mats.eyeGlow} position={[-0.12, 0, 0]} />
      </group>
      <mesh ref={aura} geometry={geos.aura} material={mats.aura} position={[0, 0.06, 0]} renderOrder={3} />
      <mesh ref={guard} geometry={geos.guard} material={mats.guard} position={[0, 1.1, 0]} renderOrder={4} visible={false} />
      <mesh ref={orb} geometry={geos.orb} material={mats.orb} position={[0.15, 1.35, 0.95]} renderOrder={5} visible={false} />
      <mesh ref={halo} geometry={geos.halo} material={mats.halo} position={[0, 2.45, 0]} renderOrder={5} visible={false} />
      <mesh ref={spinRing} geometry={geos.spin} material={mats.spin} position={[0, 0.1, 0]} renderOrder={3} visible={false} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]} renderOrder={1}>
        <circleGeometry args={[0.95, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Skill-shot looks per darkShots tag: [lit body, additive glow] geometries (built along +z, apex at the origin). */
function shotGeos() {
  const arc = (rr: number, w: number, col: string) => {   // a crescent of boxes bulging toward +z, apex at 0
    const g = new GB([1, 1]);
    for (let i = 0; i < 11; i++) { const a = -0.95 + (i / 10) * 1.9; g.box(rr * 0.24, 0.1, w - Math.abs(a) * w * 0.45, [Math.sin(a) * rr, 0, Math.cos(a) * rr - rr], col, [0, a, 0]); }
    return g.build();
  };
  const empty = new GB([1, 1]).box(0.01, 0.01, 0.01, [0, -50, 0], '#000000').build();
  // Gale Arrow: a giant dark arrow wrapped in wind
  const gale = new GB([0.8, 1.1]);
  gale.box(0.16, 0.16, 3.4, [0, 0, -1.4], '#3a2a4a'); gale.cone(0.42, 1.0, 6, [0, 0, 0.6], '#6a4a8a', [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) { gale.box(0.04, 0.42, 0.7, [0, s * 0.2, -2.8], '#8a5aba'); gale.box(0.42, 0.04, 0.7, [s * 0.2, 0, -2.8], '#8a5aba'); }
  const galeG = new GB([1, 1]).sph(0.75, [0, 0, -0.9], '#9a70ff', [1, 1, 3.2], 10).build();
  // Lightpiercer: a streak of white-violet light
  const lightG = new GB([1, 1]).sph(0.42, [0, 0, -1.6], '#f0e0ff', [1, 1, 5], 10).sph(0.7, [0, 0, -1.2], '#a070ff', [1, 1, 3.4], 10).build();
  // Fireballs: a dark core in violet-orange flame
  const fireB = new GB([1, 1]).ico(0.55, [0, 0, 0], '#2a1020', 1, 1).build();
  const fireG = new GB([1, 1]).sph(1.0, [0, 0, 0], '#ff6a3a', 1, 12).sph(1.35, [0, 0, -0.3], '#a03aff', [1, 1, 1.3], 10).build();
  // Cross Slash: a burning X of crossed axe waves
  const xg = new GB([1, 1]);
  for (const s of [-1, 1]) xg.box(0.5, 0.12, 3.8, [0, 0, -0.6], '#ff4a7a', [0, s * 0.75, 0]);
  const xG = xg.build();
  // Holy Wave / sword arc: a wide crescent (scaled by the shot radius)
  const holyG = arc(3, 1.1, '#e8c8ff');
  // Bone Spear: a long bone lance
  const bone = new GB([0.85, 1.1]);
  bone.cyl(0.1, 0.14, 3.2, 6, [0, 0, -1.4], '#d8d0b8', [Math.PI / 2, 0, 0]); bone.cone(0.3, 1.1, 6, [0, 0, 0.7], '#ebe5d0', [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 3; i++) bone.cone(0.12, 0.45, 4, [0, 0.15, -0.6 - i * 0.8], '#c9c2a8', [-0.6, 0, 0]);
  const boneG = new GB([1, 1]).sph(0.5, [0, 0, -1], '#a070ff', [1, 1, 3.6], 8).build();
  return {
    [SHOT_GALE]: [gale.build(), galeG], [SHOT_LIGHT]: [empty, lightG], [SHOT_FIRE]: [fireB, fireG], [SHOT_XSLASH]: [empty, xG],
    [SHOT_HOLY]: [empty, holyG], [SHOT_BONE]: [bone.build(), boneG], [SHOT_SLASH]: [empty, holyG],
  } as Record<number, [BufferGeometry, BufferGeometry]>;
}
const SHOT_TAGS = [SHOT_GALE, SHOT_LIGHT, SHOT_FIRE, SHOT_XSLASH, SHOT_HOLY, SHOT_BONE, SHOT_SLASH];
/** Trail particle colour per tag (r, g, b boosted). */
const TRAIL: Record<number, [number, number, number]> = {
  [SHOT_GALE]: [1.4, 1.1, 2.4], [SHOT_LIGHT]: [2.4, 2.0, 2.8], [SHOT_FIRE]: [2.4, 0.7, 0.9], [SHOT_XSLASH]: [2.4, 0.4, 0.8],
  [SHOT_HOLY]: [2.2, 1.6, 2.6], [SHOT_BONE]: [1.6, 1.2, 2.2], [SHOT_SLASH]: [2.0, 1.4, 2.4],
};

/** The champion's skill shots, the dark barbarian's thrown axes (enemy projectiles of kind AXE) and the Storm Orbs. */
function DarkFx() {
  const N = 3, NS = 8;
  const axeRef = useRef<InstancedMesh>(null!), glowRef = useRef<InstancedMesh>(null!), orbRef = useRef<InstancedMesh>(null!), ring = useRef<Mesh>(null!);
  const res = useMemo(() => {
    const w = makeAxe('#ff2a4a', 3);
    const geos = shotGeos();
    const body = litMat({ roughness: 0.45, metalness: 0.2 });
    const glow = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide, color: new Color(1.8, 1.4, 1.9) });
    const shots: Record<number, [InstancedMesh, InstancedMesh]> = {};
    for (const tag of SHOT_TAGS) {
      const b = new InstancedMesh(geos[tag][0], body, NS), g = new InstancedMesh(geos[tag][1], glow, NS);
      b.frustumCulled = g.frustumCulled = false; b.count = g.count = 0; g.renderOrder = 5; b.castShadow = true;
      shots[tag] = [b, g];
    }
    return {
      body: w.body, glow: w.glow, mat: litMat({ roughness: 0.4, metalness: 0.4, color: new Color(0.35, 0.3, 0.4) }),
      glowMat: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(2.4, 1.6, 1.8) }),
      shots, group: (() => { const g = new Group(); for (const tag of SHOT_TAGS) g.add(shots[tag][0], shots[tag][1]); return g; })(),
      orbGeo: new SphereGeometry(0.45, 12, 10), orbMat: new MeshBasicMaterial({ color: new Color(1.6, 1.4, 3.0), toneMapped: false }),
      ringGeo: new RingGeometry(7.6, 8, 64).rotateX(-Math.PI / 2),
      ringMat: new MeshBasicMaterial({ color: new Color(0.9, 0.7, 2.2), transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }),
    };
  }, []);
  const cnt = useRef<Record<number, number>>({});
  useFrame(({ clock }, dt0) => {
    const t = clock.elapsedTime, dt = useGameStore.getState().status === GameStatus.PAUSED ? 0 : Math.min(dt0, 0.05);
    const am = axeRef.current, gm = glowRef.current; if (!am) return;
    let n = 0;
    const ep = world.enemyProjectiles;
    for (let i = 0; i < ep.length && n < N; i++) {
      const p = ep[i];
      if (!p.active || p.kind !== 'AXE') continue;
      setInst(am, n, p.pos.x, p.pos.y, p.pos.z, t * 16, 1.6, 1.6, 1.6, Math.PI / 2, 0);
      setInst(gm, n, p.pos.x, p.pos.y, p.pos.z, t * 16, 1.6, 1.6, 1.6, Math.PI / 2, 0);
      if (dt > 0 && Math.random() < 0.6) FX.add.emit(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.25, 1.2, 0.2, 1.6, 0.2, 0.4, 0.5, CELL.GLOW);
      n++;
    }
    am.count = gm.count = n; am.instanceMatrix.needsUpdate = true; gm.instanceMatrix.needsUpdate = true;
    // skill shots
    const c = cnt.current;
    for (const tag of SHOT_TAGS) c[tag] = 0;
    for (let i = 0; i < darkShots.length; i++) {
      const s = darkShots[i];
      if (!s.active) continue;
      const pair = res.shots[s.tag]; if (!pair) continue;
      const k = c[s.tag]; if (k >= NS) continue;
      c[s.tag] = k + 1;
      const yaw = Math.atan2(s.vx, s.vz), fade = clamp(s.life / 0.15, 0, 1), grow = clamp((s.maxLife - s.life) / 0.08, 0.3, 1);
      let sc = 1, y = 1.2, spin = 0;
      switch (s.tag) {
        case SHOT_GALE: sc = s.r / 1.8; y = 1.5; break;
        case SHOT_FIRE: sc = s.r / 1.6; y = 1.4; spin = t * 6; break;
        case SHOT_XSLASH: sc = s.r / 2.2 * 1.4; y = 1.1; break;
        case SHOT_HOLY: case SHOT_SLASH: sc = s.r / 3; y = 1.1; break;
        default: break;
      }
      const f = sc * grow * (0.6 + 0.4 * fade);
      setInst(pair[0], k, s.x, y, s.z, yaw + spin, f, f, f);
      setInst(pair[1], k, s.x, y, s.z, yaw + spin, f * (1 + Math.sin(t * 20 + i) * 0.05), f, f);
      if (dt > 0) {
        const tc = TRAIL[s.tag], q = s.tag === SHOT_FIRE || s.tag === SHOT_GALE ? 3 : 1.5;
        for (let m = 0; m < q; m++) if (Math.random() < 0.8) {
          const ox = (Math.random() - 0.5) * s.r, oz = (Math.random() - 0.5) * s.r;
          FX.add.emit(s.x + ox, y + (Math.random() - 0.5) * 0.6, s.z + oz, -s.vx * 0.08, 0.6, -s.vz * 0.08, 0.35, 0.5 + s.r * 0.3, 0.05, tc[0], tc[1], tc[2], 0.8, s.tag === SHOT_FIRE ? CELL.FLAME : CELL.GLOW);
        }
        pushHalo(s.x, y, s.z, 2 + s.r * 1.6, tc[0] * 0.6, tc[1] * 0.6, tc[2] * 0.6, 0.35, CELL.GLOW);
      }
    }
    for (const tag of SHOT_TAGS) { const pr = res.shots[tag]; pr[0].count = pr[1].count = c[tag]; pr[0].instanceMatrix.needsUpdate = pr[1].instanceMatrix.needsUpdate = true; }
    // Storm Orbs (+ the faint zap-range ring around the archmage)
    const om = orbRef.current;
    for (let i = 0; i < darkOrbs.n; i++) {
      setInst(om, i, darkOrbs.x[i], 1.6 + Math.sin(t * 5 + i * 2) * 0.2, darkOrbs.z[i], 0, 1 + Math.sin(t * 30 + i) * 0.12);
      if (dt > 0 && Math.random() < 0.5) FX.add.emit(darkOrbs.x[i], 1.6, darkOrbs.z[i], (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.2, 0.4, 0.05, 1.6, 1.4, 3, 0.9, CELL.STAR);
    }
    om.count = darkOrbs.n; om.instanceMatrix.needsUpdate = true;
    const e = world.enemies[darkView.id];
    ring.current.visible = darkView.orbR > 0 && !!e && e.active;
    if (ring.current.visible) { ring.current.position.set(e.pos.x, 0.08, e.pos.z); res.ringMat.opacity = 0.25 + Math.sin(t * 8) * 0.08; }
  });
  return (
    <>
      <instancedMesh ref={axeRef} args={[res.body, res.mat, N]} frustumCulled={false} castShadow />
      <instancedMesh ref={glowRef} args={[res.glow, res.glowMat, N]} frustumCulled={false} />
      <instancedMesh ref={orbRef} args={[res.orbGeo, res.orbMat, 3]} frustumCulled={false} />
      <mesh ref={ring} geometry={res.ringGeo} material={res.ringMat} visible={false} renderOrder={3} />
      <primitive object={res.group} />
    </>
  );
}

export function DarkHeroes() {
  // 0 = none, else class index + 1 (re-mounts the model when a different class rises)
  const k = useWorldCounter(() => { const e = world.enemies[darkView.id]; return darkView.id >= 0 && e && e.active && e.kind === 'DARK_HERO' ? DARK_CLASSES.indexOf(darkView.cls) + 1 : 0; });
  return (
    <>
      {k > 0 && <Suspense fallback={null}><DarkHeroModel key={k} cls={DARK_CLASSES[k - 1]} /></Suspense>}
      <DarkFx />
    </>
  );
}
