// Dark hero champions (engine/systems/darkHero.ts): the player's KayKit class model, dyed shadow-black, glowing red eyes,
// a crimson class weapon, a pulsing violet aura, plus the boomerang axes (enemy projectile kind AXE) and the Dark Knight's
// crescent slash. One model instance at a time (keyed by class). No per-frame allocations.
import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, AnimationAction, AnimationMixer, Color, DoubleSide, Group, InstancedMesh, LoopOnce, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  RingGeometry, SphereGeometry, CircleGeometry, Vector3,
} from 'three';
import { world } from '../engine/world';
import { darkView, DARK_CLASSES } from '../engine/systems/darkHero';
import { GameStatus } from '../types';
import type { HeroClass } from '../types';
import { useGameStore } from '../store';
import { CELL, FX } from './fx';
import { GB, TAU, angleLerp, clamp, damp, litMat, setInst } from './util';
import { useCharacterInstance, useClips, upperBody, type CharKey } from './characters';
import { HANDSLOT_QUAT, makeAxe, makeBow, makeStaff, makeSword } from './weapons';
import { useWorldCounter } from './hooks';

const CHAR: Record<HeroClass, CharKey> = { ARCHER: 'ARCHER', WIZARD: 'WIZARD', BARBARIAN: 'BARBARIAN', KNIGHT: 'KNIGHT', NECROMANCER: 'ROGUE' };
const SHADOW = new Color(0.17, 0.14, 0.24);
const _v = new Vector3();

function weapon(cls: HeroClass) {
  const accent = '#ff2a4a';
  return cls === 'ARCHER' ? makeBow(accent, 3) : cls === 'WIZARD' || cls === 'NECROMANCER' ? makeStaff(cls === 'NECROMANCER' ? '#b04aff' : accent, 3) : cls === 'KNIGHT' ? makeSword(accent, 3) : makeAxe(accent, 3);
}

function DarkHeroModel({ cls }: { cls: HeroClass }) {
  const ch = useCharacterInstance(CHAR[cls]);
  const clips = useClips();
  const root = useRef<Group>(null!), body = useRef<Group>(null!), aura = useRef<Mesh>(null!), eyes = useRef<Group>(null!), guard = useRef<Mesh>(null!), spinRing = useRef<Mesh>(null!);
  const mats = useMemo(() => ({
    eye: new MeshBasicMaterial({ color: new Color(3.2, 0.35, 0.45), toneMapped: false }),
    eyeGlow: new MeshBasicMaterial({ color: new Color(1.6, 0.1, 0.25), transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    aura: new MeshBasicMaterial({ color: new Color(0.9, 0.25, 1.6), transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }),
    guard: new MeshBasicMaterial({ color: new Color(0.6, 0.8, 2.2), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }),
    spin: new MeshBasicMaterial({ color: new Color(2.0, 0.3, 0.5), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }),
  }), []);
  const geos = useMemo(() => ({
    eye: new SphereGeometry(0.06, 8, 6), eyeGlow: new SphereGeometry(0.16, 8, 6),
    aura: new RingGeometry(0.9, 1.6, 40).rotateX(-Math.PI / 2), guard: new CircleGeometry(1.25, 28), spin: new RingGeometry(2.9, 3.5, 48).rotateX(-Math.PI / 2),
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
    mats.guard.opacity = damp(mats.guard.opacity, gk * (0.5 + Math.sin(t * 9) * 0.12), 10, dt);
    guard.current.visible = mats.guard.opacity > 0.02;
    mats.spin.opacity = damp(mats.spin.opacity, darkView.spin > 0 && !dying ? 0.55 : 0, 10, dt);
    spinRing.current.visible = mats.spin.opacity > 0.02; spinRing.current.rotation.y = -t * 6;
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
      <mesh ref={guard} geometry={geos.guard} material={mats.guard} position={[0, 1.1, 1.0]} renderOrder={4} visible={false} />
      <mesh ref={spinRing} geometry={geos.spin} material={mats.spin} position={[0, 0.1, 0]} renderOrder={3} visible={false} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]} renderOrder={1}>
        <circleGeometry args={[0.95, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** The dark barbarian's thrown axes (enemy projectiles of kind AXE) + the dark knight's crescent slash. */
function DarkFx() {
  const N = 3;
  const axeRef = useRef<InstancedMesh>(null!), glowRef = useRef<InstancedMesh>(null!), slash = useRef<Mesh>(null!);
  const res = useMemo(() => {
    const w = makeAxe('#ff2a4a', 3);
    const sg = new GB([1, 1]);
    for (let i = 0; i < 9; i++) { const a = -0.9 + (i / 8) * 1.8, rr = 4.2; sg.box(0.9, 0.08, 0.5 - Math.abs(a) * 0.25, [Math.sin(a) * rr, 0, Math.cos(a) * rr], '#ffffff', [0, a, 0]); }
    return {
      body: w.body, glow: w.glow, mat: litMat({ roughness: 0.4, metalness: 0.4, color: new Color(0.35, 0.3, 0.4) }),
      glowMat: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(2.4, 1.6, 1.8) }),
      slashGeo: sg.build(), slashMat: new MeshBasicMaterial({ vertexColors: true, color: new Color(1.6, 0.3, 0.6), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }),
    };
  }, []);
  const sl = useRef({ n: darkView.slash, t: 1 });
  useFrame(({ clock }, dt0) => {
    const t = clock.elapsedTime, dt = Math.min(dt0, 0.05);
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
    // crescent: sweeps 9 units down the lane in 0.3 s
    const s = sl.current;
    if (darkView.slash !== s.n) { s.n = darkView.slash; s.t = 0; }
    s.t += dt;
    const k = clamp(s.t / 0.3, 0, 1);
    slash.current.visible = s.t < 0.45;
    if (slash.current.visible) {
      slash.current.position.set(darkView.slashX + Math.sin(darkView.slashYaw) * (k * 5 - 3.2), 1.0, darkView.slashZ + Math.cos(darkView.slashYaw) * (k * 5 - 3.2));
      slash.current.rotation.set(0, darkView.slashYaw, 0);
      res.slashMat.opacity = (1 - clamp((s.t - 0.25) / 0.2, 0, 1)) * 0.9;
    }
  });
  return (
    <>
      <instancedMesh ref={axeRef} args={[res.body, res.mat, N]} frustumCulled={false} castShadow />
      <instancedMesh ref={glowRef} args={[res.glow, res.glowMat, N]} frustumCulled={false} />
      <mesh ref={slash} geometry={res.slashGeo} material={res.slashMat} visible={false} renderOrder={5} />
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
