// The player hero: KayKit skinned model + animation state machine, weapons, status FX, bars, earthwall, axe spin.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending, AnimationAction, AnimationMixer, BufferGeometry, Color, CylinderGeometry, Group, InstancedMesh, LoopOnce, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, SphereGeometry,
} from 'three';
import { world } from '../engine/world';
import { events } from '../engine/events';
import { abilityState, AXE_RING_RADIUS } from '../engine/systems/abilities';
import { GameStatus } from '../types';
import type { HeroClass } from '../types';
import { useGameStore } from '../store';
import { CELL, FX, dustPuff, embers, sparks } from './fx';
import { GB, TAU, angleLerp, clamp, damp, glowMat, litMat, mulberry32, setInst } from './util';
import { useCharacterInstance, useClips, upperBody, CharKey } from './characters';
import { HANDSLOT_QUAT, RARITY_ACCENT, RARITY_TIER, makeAxe, makeBow, makeStaff, WeaponGeo } from './weapons';
import { makeBeamMaterial } from './beam';
import { isLobbyStatus } from './CameraRig';
import { QualityCfg } from './quality';

const CHAR: Record<HeroClass, CharKey> = { ARCHER: 'ARCHER', WIZARD: 'WIZARD', BARBARIAN: 'BARBARIAN' };
const GHOST_TINT: Record<HeroClass, number> = { ARCHER: 0x7dff9a, WIZARD: 0x8fb0ff, BARBARIAN: 0xff9a6a };

const _col = new Color();

function buildWeapon(cls: HeroClass, accent: string, tier: number): WeaponGeo {
  return cls === 'ARCHER' ? makeBow(accent, tier) : cls === 'WIZARD' ? makeStaff(accent, tier) : makeAxe(accent, tier);
}

function HeroModel({ cls, q }: { cls: HeroClass; q: QualityCfg }) {
  const ch = useCharacterInstance(CHAR[cls]);
  const clips = useClips();
  const rarity = useGameStore((s) => s.equipment?.weapon?.rarity) || 'COMMON';
  const root = useRef<Group>(null!), lean = useRef<Group>(null!), blob = useRef<Mesh>(null!);
  const S = useRef({
    mixer: null as AnimationMixer | null,
    idle: null as AnimationAction | null, run: null as AnimationAction | null, walk: null as AnimationAction | null,
    hit: null as AnimationAction | null, death: null as AnimationAction | null, atk: null as AnimationAction | null, cast: null as AnimationAction | null,
    wIdle: 1, wRun: 0, wDeath: 0, prevAtk: 0, prevCast: 0, prevHurt: 0, wasAlive: true, yaw: 0, lean: 0, t: 0,
    emissiveKey: '', gem: [0, 0, 0] as [number, number, number], stepEmit: 0,
  });

  // ---- weapon attachment
  useEffect(() => {
    if (!ch.handR) return;
    const tier = RARITY_TIER[rarity] ?? 0;
    const accent = RARITY_ACCENT[rarity] || RARITY_ACCENT.COMMON;
    const w = buildWeapon(cls, cls === 'WIZARD' && tier === 0 ? '#8fb8ff' : accent, tier);
    const grp = new Group();
    grp.quaternion.copy(HANDSLOT_QUAT);
    const body = new Mesh(w.body, litMat({ roughness: 0.55, metalness: 0.25 }));
    body.castShadow = true;
    const glowM = new Mesh(w.glow, new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.8, 1.8, 1.8) }));
    grp.add(body, glowM);
    ch.handR.add(grp);
    S.current.gem = w.tip;
    (grp as any).userData.tier = tier;
    const g = grp;
    return () => { ch.handR!.remove(g); w.body.dispose(); w.glow.dispose(); (body.material as any).dispose(); (glowM.material as any).dispose(); };
  }, [ch, cls, rarity]);

  // ---- mixer + actions
  useEffect(() => {
    const m = new AnimationMixer(ch.root);
    const s = S.current;
    const mk = (name: string, w = 0) => { const c = clips[name]; if (!c) return null; const a = m.clipAction(c); a.setEffectiveWeight(w); return a; };
    s.idle = mk('Idle_A', 1); s.idle?.play();
    s.run = mk('Running_A'); s.run?.play();
    s.walk = null;
    s.hit = mk('Hit_A'); s.hit?.setLoop(LoopOnce, 1); if (s.hit) s.hit.clampWhenFinished = false;
    s.death = mk('Death_A'); s.death?.setLoop(LoopOnce, 1); if (s.death) s.death.clampWhenFinished = true;
    const thr = clips['Throw'];
    if (thr) {
      s.atk = m.clipAction(upperBody(thr)); s.atk.setLoop(LoopOnce, 1); s.atk.clampWhenFinished = false;
      const use = clips['Use_Item'] || clips['Interact'];
      s.cast = use ? m.clipAction(upperBody(use)) : null; if (s.cast) { s.cast.setLoop(LoopOnce, 1); s.cast.clampWhenFinished = false; }
    }
    s.mixer = m; s.wIdle = 1; s.wRun = 0; s.wDeath = 0; s.wasAlive = true;
    return () => { m.stopAllAction(); m.uncacheRoot(ch.root); s.mixer = null; };
  }, [ch, clips]);

  useFrame((state, dt0) => {
    const s = S.current, m = s.mixer; if (!m || !root.current) return;
    const store = useGameStore.getState();
    const status = store.status;
    const paused = status === GameStatus.PAUSED;
    const dt = paused ? 0 : Math.min(dt0, 0.05);
    const lobby = isLobbyStatus(status);
    const p = world.player, a = p.anim;
    const alive = lobby || p.alive;
    s.t += dt;
    const t = state.clock.elapsedTime;

    // transform
    const g = root.current;
    if (lobby) g.position.set(0, 0, 0); else g.position.copy(p.pos);
    const targetYaw = lobby ? Math.sin(t * 0.3) * 0.4 : p.facing;
    s.yaw = lobby ? targetYaw : angleLerp(s.yaw, targetYaw, 1 - Math.exp(-20 * dt));
    g.rotation.y = s.yaw;
    const dashing = !lobby && a.dashing;
    s.lean = damp(s.lean, dashing ? 0.5 : 0, 14, dt);
    lean.current.rotation.x = s.lean;
    lean.current.position.y = 0;

    // death / revive
    if (!alive && s.wasAlive) { s.death?.reset().play(); s.wDeath = 0; }
    if (alive && !s.wasAlive) { s.death?.stop(); s.wDeath = 0; }
    s.wasAlive = alive;

    // locomotion weights
    const b = lobby || !alive ? 0 : clamp(a.moveBlend, 0, 1);
    const speedMul = lobby ? 1 : 0.85 + Math.min(1.1, Math.hypot(p.vel.x, p.vel.z) / 9) + (p.sprintT > 0 ? 0.5 : 0) + (dashing ? 0.8 : 0);
    if (s.run) s.run.timeScale = speedMul;
    s.wRun = damp(s.wRun, b, 16, dt); s.wIdle = damp(s.wIdle, alive ? 1 - b : 0, 16, dt);
    s.wDeath = damp(s.wDeath, alive ? 0 : 1, 9, dt);
    s.idle?.setEffectiveWeight(s.wIdle * (alive ? 1 : 0.0001) + 1e-4);
    s.run?.setEffectiveWeight(s.wRun + 1e-4);
    if (s.death && !alive) s.death.setEffectiveWeight(Math.max(0.0001, s.wDeath * 6));

    // one-shots (rising edge of the engine timers)
    if (!lobby && alive) {
      if (a.attackT > 0.85 && s.prevAtk < 0.6 && s.atk) { s.atk.reset(); s.atk.timeScale = p.rageT > 0 ? 3.2 : 2.4; s.atk.play(); }
      if (a.castT > 0.85 && s.prevCast < 0.6 && (s.cast || s.atk)) { const c = s.cast || s.atk!; c.reset(); c.timeScale = 1.5; c.play(); (s as any).castAct = c; }
      if (a.hurtT > 0.85 && s.prevHurt < 0.6 && s.hit) { s.hit.reset(); s.hit.timeScale = 1.6; s.hit.play(); }
    }
    s.prevAtk = lobby ? 0 : a.attackT; s.prevCast = lobby ? 0 : a.castT; s.prevHurt = lobby ? 0 : a.hurtT;
    const env = (act: AnimationAction | null, W: number) => {
      if (!act) return;
      if (!act.isRunning()) { act.setEffectiveWeight(0); return; }
      const dur = act.getClip().duration;
      const f = act.time / dur;
      act.setEffectiveWeight(W * Math.min(1, f / 0.07) * Math.min(1, (1 - f) / 0.15 + 0.001));
    };
    env(s.atk, 7); env(s.cast, 7); env(s.hit, 5);

    m.update(dt);

    // emissive status tint
    let r = 0, gg = 0, bb = 0;
    if (!lobby && alive) {
      if (a.hurtT > 0) { r += a.hurtT * 0.9; gg += a.hurtT * 0.05; }
      if (p.invulnT > 0 && !dashing) { const k = 0.18 + 0.14 * Math.sin(t * 16); gg += k * 0.8; bb += k; }
      if (p.rageT > 0) r += 0.28 + 0.12 * Math.sin(t * 12);
      if (p.sprintT > 0) { gg += 0.2; r += 0.08; }
      if (p.vitalityT > 0) gg += 0.16 + 0.08 * Math.sin(t * 6);
      if (dashing) { r += 0.35; gg += 0.45; bb += 0.55; }
    }
    const key = (r * 100 | 0) + ',' + (gg * 100 | 0) + ',' + (bb * 100 | 0);
    if (key !== s.emissiveKey) { s.emissiveKey = key; for (const mt of ch.mats as MeshStandardMaterial[]) if (mt.emissive) mt.emissive.setRGB(r, gg, bb); }

    // blob shadow
    if (blob.current) { blob.current.visible = alive; (blob.current.material as MeshBasicMaterial).opacity = q.shadowMap ? 0.14 : 0.32; }

    // ---- continuous status particles
    if (dt > 0 && !lobby && alive) {
      const px = p.pos.x, pz = p.pos.z;
      if (p.rageT > 0) {
        FX.add.emit(px, 1.2, pz, 0, 0, 0, 0.1, 3.4, 3.2, 1.6, 0.18, 0.08, 0.3, CELL.GLOW);
        if (Math.random() < dt * 40) embers(px, 0.2, pz, 1, 0xff4a1a, 0.7, 3.4, 0.8, 0.2);
      }
      if (p.sprintT > 0) {
        const vx = p.vel.x, vz = p.vel.z, sp = Math.hypot(vx, vz) || 1;
        for (let i = 0; i < 2; i++) FX.add.emit(px + (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 1.6, pz + (Math.random() - 0.5) * 0.8, -vx / sp * 14, 0, -vz / sp * 14, 0.28, 0.2, 0.05, 1.2, 1.9, 1.2, 0.75, CELL.STREAK, 0, 1, 0, 0, 0.09);
      }
      if (p.vitalityT > 0 && Math.random() < dt * 10) {
        const an = Math.random() * TAU;
        FX.add.emit(px + Math.cos(an) * 0.9, 0.3, pz + Math.sin(an) * 0.9, 0, 2.2, 0, 1.1, 0.5, 0.3, 0.4, 2.2, 0.7, 0.95, CELL.PLUS, 0, 0.3);
      }
      if (p.levelUpFx > 0) {
        const an = t * 9;
        for (let k = 0; k < 2; k++) FX.add.emit(px + Math.cos(an + k * Math.PI) * 1.3, 0.1 + (1 - p.levelUpFx) * 5, pz + Math.sin(an + k * Math.PI) * 1.3, 0, 3.5, 0, 0.6, 0.35, 0.05, 2.2, 1.7, 0.4, 1, CELL.STAR, 0, 0, t, 2);
      }
      if (dashing && Math.random() < 0.8) dustPuff(px, pz, 1, 0.8, 0xd9c9a3, 0.8);
    }
  });

  return (
    <group ref={root}>
      <group ref={lean}><primitive object={ch.root} /></group>
      <mesh ref={blob} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]} renderOrder={1}>
        <circleGeometry args={[0.95, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------ afterimage + pillars --
function Effects({ cls }: { cls: HeroClass }) {
  const N = 6;
  const ghostGeo = useMemo(() => {
    const b = new GB([1, 1]);
    b.cyl(0.32, 0.4, 1.0, 7, [0, 1.15, 0], '#ffffff'); b.sph(0.32, [0, 1.95, 0], '#ffffff', 1, 7);
    b.cyl(0.14, 0.14, 0.9, 5, [-0.2, 0.45, 0], '#ffffff'); b.cyl(0.14, 0.14, 0.9, 5, [0.2, 0.45, 0], '#ffffff');
    b.cyl(0.1, 0.1, 0.9, 5, [-0.5, 1.2, 0], '#ffffff'); b.cyl(0.1, 0.1, 0.9, 5, [0.5, 1.2, 0], '#ffffff');
    return b.build();
  }, []);
  const ghosts = useRef<Mesh[]>([]);
  const gm = useMemo(() => Array.from({ length: N }, () => new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false })), []);
  const gdata = useRef(Array.from({ length: N }, () => ({ x: 0, z: 0, yaw: 0, life: 0 })));
  const cursor = useRef(0), timer = useRef(0);

  const pillarGeo = useMemo(() => new CylinderGeometry(1.5, 1.7, 15, 28, 1, true).translate(0, 7.5, 0), []);
  const pillarMat = useMemo(() => makeBeamMaterial(0xffc83a, { speed: 5, stripes: 7, power: 1.1 }), []);
  const reviveMat = useMemo(() => makeBeamMaterial(0xfff2b0, { speed: 3, stripes: 4, power: 0.8 }), []);
  const reviveGeo = useMemo(() => new CylinderGeometry(2.6, 3.2, 30, 28, 1, true).translate(0, 15, 0), []);
  const pillar = useRef<Mesh>(null!), revive = useRef<Mesh>(null!), bubble = useRef<Mesh>(null!);
  const bubbleMat = useMemo(() => new MeshBasicMaterial({ color: new Color(0.5, 1.6, 2.4), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), []);
  const bubbleGeo = useMemo(() => new SphereGeometry(1, 20, 14), []);
  const flash = useRef({ bubble: 0, radius: 2 });

  useEffect(() => {
    const off = events.on('shieldBlock', (e) => { flash.current.bubble = 1; flash.current.radius = Math.max(1.8, e.radius); });
    return off;
  }, []);

  useFrame((state, dt0) => {
    const status = useGameStore.getState().status;
    const dt = status === GameStatus.PAUSED ? 0 : Math.min(dt0, 0.05);
    const lobby = isLobbyStatus(status);
    const p = world.player, t = state.clock.elapsedTime;
    // afterimages
    if (!lobby && p.anim.dashing && dt > 0) {
      timer.current -= dt;
      if (timer.current <= 0) { timer.current = 0.035; const d = gdata.current[cursor.current]; cursor.current = (cursor.current + 1) % N; d.x = p.pos.x; d.z = p.pos.z; d.yaw = p.facing; d.life = 0.32; }
    }
    for (let i = 0; i < N; i++) {
      const d = gdata.current[i], mesh = ghosts.current[i]; if (!mesh) continue;
      d.life = Math.max(0, d.life - dt);
      mesh.visible = d.life > 0;
      if (d.life > 0) { mesh.position.set(d.x, 0, d.z); mesh.rotation.y = d.yaw; gm[i].opacity = (d.life / 0.32) * 0.5; }
    }
    // pillars
    const lv = lobby ? 0 : p.levelUpFx;
    if (pillar.current) {
      pillar.current.visible = lv > 0;
      if (lv > 0) { pillar.current.position.set(p.pos.x, 0, p.pos.z); const k = 1 - Math.pow(1 - lv, 2); pillar.current.scale.set(0.5 + k * 0.7, 1, 0.5 + k * 0.7); pillarMat.uniforms.uAlpha.value = Math.min(1, lv * 1.6); pillarMat.uniforms.uTime.value = t; }
    }
    const rv = lobby ? 0 : p.reviveFx;
    if (revive.current) {
      revive.current.visible = rv > 0;
      if (rv > 0) { revive.current.position.set(p.pos.x, 0, p.pos.z); const k = Math.min(1, (1 - rv) * 6); revive.current.scale.set(0.3 + k * 0.7 + (1 - rv) * 0.4, 1, 0.3 + k * 0.7 + (1 - rv) * 0.4); reviveMat.uniforms.uAlpha.value = Math.min(1, rv * 1.4); reviveMat.uniforms.uTime.value = t; }
    }
    // shield bubble
    const f = flash.current;
    f.bubble = Math.max(0, f.bubble - dt * 3);
    if (bubble.current) {
      bubble.current.visible = f.bubble > 0;
      if (f.bubble > 0) { bubble.current.position.set(p.pos.x, 1.1, p.pos.z); const s = f.radius * (1.05 + (1 - f.bubble) * 0.3); bubble.current.scale.set(s, s, s); bubbleMat.opacity = f.bubble * 0.45; }
    }
  });
  return (
    <>
      {gm.map((m, i) => <mesh key={i} ref={(r) => { ghosts.current[i] = r!; }} geometry={ghostGeo} material={m} visible={false} />)}
      <mesh ref={pillar} geometry={pillarGeo} material={pillarMat} visible={false} frustumCulled={false} />
      <mesh ref={revive} geometry={reviveGeo} material={reviveMat} visible={false} frustumCulled={false} />
      <mesh ref={bubble} geometry={bubbleGeo} material={bubbleMat} visible={false} />
      <GhostTint cls={cls} mats={gm} />
    </>
  );
}
function GhostTint({ cls, mats }: { cls: HeroClass; mats: MeshBasicMaterial[] }) {
  useEffect(() => { mats.forEach((m) => m.color.setHex(GHOST_TINT[cls]).multiplyScalar(1.6)); }, [cls, mats]);
  return null;
}

// -------------------------------------------------------------- earthwall ---
function EarthWall() {
  const N = 16;
  const ref = useRef<InstancedMesh>(null!);
  const { geo, mat } = useMemo(() => {
    const b = new GB([0.7, 1.15]);
    b.box(3.9, 5.0, 1.5, [0, 2.5, 0], '#8b8378');
    b.box(3.5, 1.2, 1.3, [0.1, 5.4, 0], '#9a9286', [0.05, 0.1, 0.12]);
    b.ico(0.9, [-1.2, 5.3, 0.2], '#7c756a', [1, 0.8, 0.8], 0);
    b.box(1.4, 3.2, 1.8, [-1.3, 1.6, 0.3], '#7a7266', [0, 0.2, 0]);
    b.sph(0.9, [0.4, 5.0, 0.3], '#5aa03a', [1.8, 0.35, 0.9], 6);
    return { geo: b.build(), mat: litMat({ roughness: 0.9 }) };
  }, []);
  const S = useRef({ dust: 0 });
  useFrame(({ clock }, dt0) => {
    const m = ref.current; if (!m) return;
    const ew = world.player.earthwall;
    if (!ew.active) { m.count = 0; return; }
    const dt = Math.min(dt0, 0.05);
    const el = 4 - ew.t;
    const rise = clamp(el / 0.45, 0, 1), sink = clamp(ew.t / 0.7, 0, 1);
    const k = Math.min(rise * rise * (3 - 2 * rise), sink);
    m.count = N;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const stag = clamp((el - (i % 4) * 0.04) / 0.45, 0, 1);
      const kk = Math.min(stag, sink);
      const s = 1.0 + ((i * 37) % 7) * 0.03;
      setInst(m, i, ew.pos.x + Math.cos(a) * ew.radius, -5.2 + 5.3 * kk + Math.sin(el * 40 + i) * 0.04 * (1 - kk) * kk * 4, ew.pos.z + Math.sin(a) * ew.radius, -a + Math.PI / 2, s, s * (0.85 + (i % 3) * 0.15), 1);
    }
    m.instanceMatrix.needsUpdate = true;
    if (dt > 0 && (rise < 1 || sink < 1)) {
      S.current.dust += dt * 60;
      while (S.current.dust > 1) { S.current.dust -= 1; const a = Math.random() * TAU; dustPuff(ew.pos.x + Math.cos(a) * ew.radius, ew.pos.z + Math.sin(a) * ew.radius, 1, 1.4, 0xb8a078, 1.5); }
    }
    void k; void clock;
  });
  return <instancedMesh ref={ref} args={[geo, mat, N]} castShadow receiveShadow frustumCulled={false} />;
}

// ---------------------------------------------------------------- axe spin ---
function AxeSpin() {
  const N = 6;
  const ref = useRef<InstancedMesh>(null!);
  const { geo, geoGlow, mat, glow } = useMemo(() => {
    const w = makeAxe('#ffb060', 2);
    return { geo: w.body, geoGlow: w.glow, mat: litMat({ roughness: 0.4, metalness: 0.4 }), glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.8, 1.4, 1) }) };
  }, []);
  const ref2 = useRef<InstancedMesh>(null!);
  useFrame(({ clock }, dt0) => {
    const m = ref.current, m2 = ref2.current; if (!m) return;
    const on = abilityState.axeSpinT > 0 && !isLobbyStatus(useGameStore.getState().status);
    if (!on) { m.count = 0; m2.count = 0; return; }
    const t = clock.elapsedTime, p = world.player;
    const grow = clamp((3 - abilityState.axeSpinT) / 0.3, 0, 1), fade = clamp(abilityState.axeSpinT / 0.4, 0, 1);
    m.count = m2.count = N;
    const R = AXE_RING_RADIUS * grow;
    for (let i = 0; i < N; i++) {
      const a = t * 5 + (i / N) * TAU;
      const x = p.pos.x + Math.cos(a) * R, z = p.pos.z + Math.sin(a) * R;
      setInst(m, i, x, 1.4, z, -a, 2.2 * fade, 2.2 * fade, 2.2 * fade, t * 14 + i, 0);
      setInst(m2, i, x, 1.4, z, -a, 2.2 * fade, 2.2 * fade, 2.2 * fade, t * 14 + i, 0);
      FX.add.emit(x, 1.4, z, 0, 0, 0, 0.18, 2.3, 1.2, 1.8, 0.7, 0.2, 0.55, CELL.GLOW);
      if (Math.random() < 0.5) sparks(x, 1.4, z, 1, 0xffc070, 4, 0.2, 0.25, 1.6);
    }
    for (let k = 0; k < 20; k++) { const a = (k / 20) * TAU + t * 0.5; FX.add.emit(p.pos.x + Math.cos(a) * R, 0.15, p.pos.z + Math.sin(a) * R, 0, 0, 0, 0.1, 1.4, 1.4, 1.3, 0.5, 0.15, 0.25 * fade, CELL.GLOW); }
    m.instanceMatrix.needsUpdate = true; m2.instanceMatrix.needsUpdate = true;
    void dt0;
  });
  return (
    <>
      <instancedMesh ref={ref} args={[geo, mat, N]} castShadow frustumCulled={false} />
      <instancedMesh ref={ref2} args={[geoGlow, glow, N]} frustumCulled={false} />
    </>
  );
}

// -------------------------------------------------------------- mini bars ---
function HeroBars() {
  const camera = useThree((s) => s.camera);
  const g = useRef<Group>(null!), hp = useRef<Mesh>(null!), mp = useRef<Mesh>(null!);
  useFrame(() => {
    const st = useGameStore.getState();
    const show = st.status === GameStatus.PLAYING || st.status === GameStatus.PAUSED || st.status === GameStatus.LEVEL_UP;
    if (!g.current) return;
    g.current.visible = show && world.player.alive;
    if (!g.current.visible) return;
    const p = world.player;
    g.current.position.set(p.pos.x, 0.2, p.pos.z + 1.7);
    g.current.quaternion.copy(camera.quaternion);
    const fh = clamp(p.hp / Math.max(1, st.stats.maxHealth), 0, 1), fm = clamp(p.mana / Math.max(1, st.stats.maxMana), 0, 1);
    hp.current.scale.x = Math.max(0.001, fh); hp.current.position.x = -(1 - fh) * 1.1;
    mp.current.scale.x = Math.max(0.001, fm); mp.current.position.x = -(1 - fm) * 1.1;
    (hp.current.material as MeshBasicMaterial).color.setRGB(fh < 0.3 ? 1.6 : 1.1, fh < 0.3 ? 0.2 : 0.18, 0.2);
  });
  const bg = <meshBasicMaterial color="#10141c" transparent opacity={0.7} depthTest={false} depthWrite={false} />;
  return (
    <group ref={g} renderOrder={40}>
      <mesh position={[0, 0.1, 0]} renderOrder={40}><planeGeometry args={[2.36, 0.46]} />{bg}</mesh>
      <mesh ref={hp} position={[0, 0.2, 0.01]} renderOrder={41}><planeGeometry args={[2.2, 0.16]} /><meshBasicMaterial color="#e0442f" depthTest={false} depthWrite={false} toneMapped={false} /></mesh>
      <mesh ref={mp} position={[0, 0.0, 0.01]} renderOrder={41}><planeGeometry args={[2.2, 0.12]} /><meshBasicMaterial color="#3b82f6" depthTest={false} depthWrite={false} toneMapped={false} /></mesh>
    </group>
  );
}

export function Hero({ q }: { q: QualityCfg }) {
  const cls = useGameStore((s) => s.hero) as HeroClass;
  return (
    <>
      <HeroModel key={cls} cls={cls} q={q} />
      <Effects cls={cls} />
      <EarthWall />
      {cls === 'BARBARIAN' && <AxeSpin />}
      <HeroBars />
    </>
  );
}
