// Humanoid mini bosses (engine/systems/humanBosses.ts): hero-sized KayKit characters with their own tint and weapon.
//   Varn  = Knight model, steel blue + crimson, sword and shield (a big glowing shield plate while the Shield Wall is up),
//   Sable = Mage model, violet, staff (an Arcane Ward bubble while her shield absorbs), vanishes for Blink Strike,
//   Rook  = Ranger model, forest green, bow.
// HumanFx draws the Bulwark Banner (a targetable BOSS_CRYSTAL gets a banner pole + flag) and Rook's snare traps.
// One model instance at a time (keyed by kind). No per-frame allocations.
import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, AnimationAction, AnimationMixer, BoxGeometry, Color, DoubleSide, Group, InstancedMesh, LoopOnce, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  RingGeometry, SphereGeometry,
} from 'three';
import { world } from '../engine/world';
import { humanView, humanTraps, HUMAN_KINDS, type HumanKind } from '../engine/systems/humanBosses';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { CELL, FX } from './fx';
import { GB, TAU, angleLerp, clamp, commitInst, damp, litMat, setInst } from './util';
import { useCharacterInstance, useClips, upperBody, type CharKey } from './characters';
import { HANDSLOT_QUAT, makeBow, makeShield, makeStaff, makeSword } from './weapons';
import { useWorldCounter } from './hooks';

const CHAR: Record<HumanKind, CharKey> = { VARN: 'KNIGHT', SABLE: 'WIZARD', ROOK: 'ARCHER' };
const TINT: Record<HumanKind, Color> = { VARN: new Color(0.62, 0.68, 0.9), SABLE: new Color(0.6, 0.32, 0.95), ROOK: new Color(0.5, 0.8, 0.42) };
const GLOW: Record<HumanKind, [number, number, number]> = { VARN: [0.05, 0.05, 0.08], SABLE: [0.1, 0.02, 0.18], ROOK: [0.02, 0.07, 0.02] };
const ACCENT: Record<HumanKind, string> = { VARN: '#c0283a', SABLE: '#b04aff', ROOK: '#7ad03a' };

function HumanModel({ kind }: { kind: HumanKind }) {
  const ch = useCharacterInstance(CHAR[kind]);
  const clips = useClips();
  const root = useRef<Group>(null!), wall = useRef<Mesh>(null!), ward = useRef<Mesh>(null!), aura = useRef<Mesh>(null!);
  const mats = useMemo(() => ({
    wall: new MeshBasicMaterial({ color: new Color(1.4, 1.5, 2.2), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }),
    ward: new MeshBasicMaterial({ color: new Color(1.0, 0.45, 2.4), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }),
    aura: new MeshBasicMaterial({ color: new Color(...(kind === 'VARN' ? [2.0, 0.5, 0.5] : kind === 'SABLE' ? [1.0, 0.3, 1.8] : [0.6, 1.6, 0.4])), transparent: true, opacity: 0.4, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }),
  }), [kind]);
  const geos = useMemo(() => ({
    wall: new BoxGeometry(3.0, 2.3, 0.18), ward: new SphereGeometry(1.7, 20, 14), aura: new RingGeometry(0.9, 1.5, 40).rotateX(-Math.PI / 2),
  }), []);
  const S = useRef({ mixer: null as AnimationMixer | null, idle: null as AnimationAction | null, run: null as AnimationAction | null, atk: null as AnimationAction | null,
    cast: null as AnimationAction | null, death: null as AnimationAction | null, hit: null as AnimationAction | null,
    wRun: 0, yaw: 0, atk0: -1, cast0: -1, flash0: 0, dead: false, emis: '', puff: 0 });

  // tint (the model's own atlas stays visible: colour multiplies it)
  useEffect(() => { for (const m of ch.mats as MeshStandardMaterial[]) { if (m.color) m.color.copy(TINT[kind]); if ('roughness' in m) m.roughness = 0.55; } }, [ch, kind]);
  // weapons
  useEffect(() => {
    const added: { p: { remove: (o: any) => void }; o: Group }[] = [];
    const acc = ACCENT[kind];
    const w = kind === 'VARN' ? makeSword(acc, 3) : kind === 'SABLE' ? makeStaff(acc, 3) : makeBow(acc, 3);
    if (ch.handR) {
      const g = new Group();
      g.quaternion.copy(HANDSLOT_QUAT); g.scale.setScalar(1.15);
      const b = new Mesh(w.body, litMat({ roughness: 0.4, metalness: 0.4 })); b.castShadow = true;
      const gl = new Mesh(w.glow, new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(2.2, 1.6, 1.8) }));
      g.add(b, gl); ch.handR.add(g); added.push({ p: ch.handR, o: g });
    }
    if (kind === 'VARN' && ch.handL) {
      const sh = makeShield(acc, 3), g = new Group();
      g.add(new Mesh(sh.body, litMat({ roughness: 0.45, metalness: 0.5 })));
      g.rotation.set(0, Math.PI / 2, 0); g.scale.setScalar(1.5); g.position.set(0, 0.1, 0.05);
      ch.handL.add(g); added.push({ p: ch.handL, o: g });
    }
    return () => { for (const a of added) a.p.remove(a.o); };
  }, [ch, kind]);
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
    s.mixer = m; s.dead = false; s.atk0 = humanView.atk; s.cast0 = humanView.cast;
    return () => { m.stopAllAction(); m.uncacheRoot(ch.root); s.mixer = null; };
  }, [ch, clips]);

  useFrame((state, dt0) => {
    const s = S.current, m = s.mixer, g = root.current; if (!m || !g) return;
    const e = world.enemies[humanView.id];
    const on = !!e && e.active && e.kind === 'HUMAN_BOSS';
    g.visible = on && e.hideT <= 0;
    if (!on) return;
    const paused = useGameStore.getState().status === GameStatus.PAUSED;
    const dt = paused ? 0 : Math.min(dt0, 0.05), t = state.clock.elapsedTime;
    const dying = e.state === 'DYING';
    const rise = e.state === 'SPAWN' ? clamp(e.stateT / 0.6, 0, 1) : 1;
    g.position.set(e.pos.x, (1 - rise) * -2.2, e.pos.z);
    g.scale.setScalar(e.scale);
    s.yaw = angleLerp(s.yaw, e.facing, 1 - Math.exp(-18 * dt));
    g.rotation.y = s.yaw;
    if (dying && !s.dead) { s.dead = true; s.death?.reset().play(); }
    const speed = Math.hypot(e.vel.x, e.vel.z);
    s.wRun = damp(s.wRun, dying ? 0 : clamp(speed / 3, 0, 1), 12, dt);
    if (s.run) { s.run.setEffectiveWeight(s.wRun + 1e-4); s.run.timeScale = 0.8 + speed / 9; }
    s.idle?.setEffectiveWeight((dying ? 0 : 1 - s.wRun) + 1e-4);
    if (s.death) s.death.setEffectiveWeight(dying ? 6 : 0);
    if (!dying) {
      if (humanView.atk !== s.atk0 && s.atk) { s.atk.reset(); s.atk.timeScale = 2.2; s.atk.play(); }
      if (humanView.cast !== s.cast0 && (s.cast || s.atk)) { const c = s.cast || s.atk!; c.reset(); c.timeScale = 1.6; c.play(); }
      if (e.hitFlash > 0.9 && s.flash0 < 0.5 && s.hit && Math.random() < 0.25) { s.hit.reset(); s.hit.timeScale = 1.8; s.hit.play(); }
    }
    s.atk0 = humanView.atk; s.cast0 = humanView.cast; s.flash0 = e.hitFlash;
    const env = (a: AnimationAction | null, W: number) => { if (!a) return; if (!a.isRunning()) { a.setEffectiveWeight(0); return; } const f = a.time / a.getClip().duration; a.setEffectiveWeight(W * Math.min(1, f / 0.07) * Math.min(1, (1 - f) / 0.15 + 0.001)); };
    env(s.atk, 7); env(s.cast, 7); env(s.hit, 4);
    m.update(dt);
    // emissive: faint base glow, pulse while winding up, white flash on hits
    let [r, gg, bb] = GLOW[kind];
    if (e.state === 'WINDUP') { const k = 0.2 + 0.15 * Math.sin(e.stateT * 30); r += k; gg += k * 0.5; bb += k * 0.3; }
    if (humanView.enraged) r += 0.08 + 0.04 * Math.sin(t * 6);
    r += e.hitFlash * 0.7; gg += e.hitFlash * 0.4; bb += e.hitFlash * 0.4;
    const key = ((r * 100) | 0) + ',' + ((gg * 100) | 0) + ',' + ((bb * 100) | 0);
    if (key !== s.emis) { s.emis = key; for (const mt of ch.mats as MeshStandardMaterial[]) if (mt.emissive) mt.emissive.setRGB(r, gg, bb); }
    // aura ring, shield wall plate, ward bubble
    aura.current.rotation.y = t * 0.6;
    mats.aura.opacity = dying ? 0 : 0.25 + Math.sin(t * 5) * 0.08 + (humanView.enraged ? 0.15 : 0);
    const wk = humanView.wall > 0 && !dying && e.pattern === 1 && e.state === 'ATTACK' ? 1 : 0;
    mats.wall.opacity = damp(mats.wall.opacity, wk * (0.3 + Math.sin(t * 8) * 0.06), 12, dt);
    wall.current.visible = mats.wall.opacity > 0.02;
    const wk2 = e.shield > 1 && !dying ? 1 : 0;
    mats.ward.opacity = damp(mats.ward.opacity, wk2 * (0.26 + Math.sin(t * 6) * 0.07), 10, dt);
    ward.current.visible = mats.ward.opacity > 0.02;
    ward.current.scale.setScalar(1 + Math.sin(t * 3) * 0.03);
    if (dt > 0 && !dying && rise >= 1) {
      s.puff += dt * 8;
      while (s.puff > 1) {
        s.puff -= 1;
        const a = Math.random() * TAU, rr = 0.4 + Math.random() * 0.6, c = kind === 'VARN' ? [1.6, 0.4, 0.4] : kind === 'SABLE' ? [1.2, 0.3, 1.8] : [0.5, 1.4, 0.4];
        FX.add.emit(e.pos.x + Math.cos(a) * rr, 0.2 + Math.random() * 1.6, e.pos.z + Math.sin(a) * rr, 0, 1.2 + Math.random(), 0, 0.7, 0.3, 0.05, c[0], c[1], c[2], 0.6, CELL.GLOW);
      }
    }
  });

  return (
    <group ref={root}>
      <primitive object={ch.root} />
      <mesh ref={aura} geometry={geos.aura} material={mats.aura} position={[0, 0.06, 0]} renderOrder={3} />
      <mesh ref={wall} geometry={geos.wall} material={mats.wall} position={[0, 1.2, 1.1]} renderOrder={4} visible={false} />
      <mesh ref={ward} geometry={geos.ward} material={mats.ward} position={[0, 1.1, 0]} renderOrder={4} visible={false} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]} renderOrder={1}>
        <circleGeometry args={[0.95, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Bulwark Banner pole + flag on the banner's crystal, and Rook's snare traps. */
function HumanFx() {
  const res = useMemo(() => {
    const pole = new GB([0.8, 1.1]);
    pole.cyl(0.07, 0.09, 4.2, 6, [0, 2.1, 0], '#5b3a20'); pole.box(1.3, 0.9, 0.05, [0.7, 3.6, 0], '#b0262e'); pole.box(1.3, 0.1, 0.07, [0.7, 4.0, 0], '#d9b25a'); pole.sph(0.14, [0, 4.3, 0], '#d9b25a', 1, 8);
    const trap = new GB([0.8, 1.1]);
    trap.cyl(0.9, 1.0, 0.1, 14, [0, 0.05, 0], '#5a4a30');
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; trap.cone(0.12, 0.5, 4, [Math.cos(a) * 0.65, 0.3, Math.sin(a) * 0.65], '#c8c8c0', [0, 0, 0]); }
    const ring = new RingGeometry(1.4, 1.75, 28).rotateX(-Math.PI / 2);
    return {
      poleGeo: pole.build(), poleMat: litMat({ roughness: 0.6 }), trapGeo: trap.build(), trapMat: litMat({ roughness: 0.5, metalness: 0.3 }),
      ringGeo: ring, ringMat: new MeshBasicMaterial({ color: new Color(1.8, 0.5, 0.3), transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }),
    };
  }, []);
  const pole = useRef<Mesh>(null!), traps = useRef<InstancedMesh>(null!), rings = useRef<InstancedMesh>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const b = humanView.bannerId >= 0 ? world.enemies[humanView.bannerId] : null;
    const pm = pole.current; if (!pm) return;
    pm.visible = !!b && b.active && b.state !== 'DYING';
    if (pm.visible) { pm.position.set(b!.pos.x, 0, b!.pos.z); pm.rotation.y = Math.sin(t * 1.5) * 0.15; }
    let n = 0;
    for (const tr of humanTraps) {
      if (!tr.active) continue;
      const armed = tr.arm <= 0;
      setInst(traps.current, n, tr.x, 0, tr.z, n, armed ? 1 : 0.7, armed ? 1 : 0.35, armed ? 1 : 0.7);
      setInst(rings.current, n, tr.x, 0.08, tr.z, 0, armed ? 1 + Math.sin(t * 6 + n) * 0.05 : 0.6);
      n++;
    }
    commitInst(traps.current, n); commitInst(rings.current, n);
  });
  return (
    <>
      <mesh ref={pole} geometry={res.poleGeo} material={res.poleMat} visible={false} castShadow />
      <instancedMesh ref={traps} args={[res.trapGeo, res.trapMat, 10]} frustumCulled={false} />
      <instancedMesh ref={rings} args={[res.ringGeo, res.ringMat, 10]} frustumCulled={false} renderOrder={3} />
    </>
  );
}

export function HumanBosses() {
  // 0 = none, else kind index + 1 (re-mounts the model when a different one appears)
  const k = useWorldCounter(() => { const e = world.enemies[humanView.id]; return humanView.id >= 0 && e && e.active && e.kind === 'HUMAN_BOSS' ? HUMAN_KINDS.indexOf(humanView.kind) + 1 : 0; });
  return (
    <>
      {k > 0 && <Suspense fallback={null}><HumanModel key={k} kind={HUMAN_KINDS[k - 1]} /></Suspense>}
      <HumanFx />
    </>
  );
}
