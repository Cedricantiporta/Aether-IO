// The player hero: KayKit skinned model + animation state machine, weapons, status FX, bars, earthwall, axe spin.
import { activeChar } from '../characters';
import { liftAt } from './lift';
import { titleOf } from '../achievements';
import { labelMaterial } from './label';
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending, AnimationAction, AnimationMixer, BufferGeometry, Color, CylinderGeometry, Group, InstancedMesh, LoopOnce, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, SphereGeometry, DoubleSide, CanvasTexture, SRGBColorSpace, ShaderMaterial, FrontSide,
  type Object3D,
} from 'three';
import { world } from '../engine/world';
import { animals } from '../engine/systems/npcs';
import { events } from '../engine/events';
import { abilityState, LP_CHARGE } from '../engine/systems/abilities';
import { GameStatus } from '../types';
import type { HeroClass } from '../types';
import { useGameStore } from '../store';
import { CELL, FX, dustPuff, embers, sparks } from './fx';
import { GB, TAU, angleLerp, clamp, damp, glowMat, litMat, mulberry32, setInst } from './util';
import { useCharacterInstance, useClips, upperBody, CharKey } from './characters';
import { NECRO_TINT, HANDSLOT_QUAT, RARITY_ACCENT, RARITY_TIER, makeAxe, makeBow, makeStaff, makeSword, makeShield, WeaponGeo } from './weapons';
import { makeBeamMaterial } from './beam';
import { isLobbyStatus } from './CameraRig';
import { QualityCfg } from './quality';
import { tintGear } from './gear';
import { useUiStore } from '../ui/uiStore';

const CHAR: Record<HeroClass, CharKey> = { ARCHER: 'ARCHER', WIZARD: 'WIZARD', BARBARIAN: 'BARBARIAN', KNIGHT: 'KNIGHT', NECROMANCER: 'ROGUE' };
/** Knight shield placement in the left hand slot (bone space). */
const SHIELD_POS: [number, number, number] = [0, 0.05, 0.12], SHIELD_ROT: [number, number, number] = [Math.PI / 2, Math.PI / 2, 0], SHIELD_SCALE = 0.9;
const GHOST_TINT: Record<HeroClass, number> = { ARCHER: 0x7dff9a, WIZARD: 0x8fb0ff, BARBARIAN: 0xff9a6a, KNIGHT: 0xffe08a, NECROMANCER: 0xb08aff };

const _col = new Color();

function buildWeapon(cls: HeroClass, accent: string, tier: number): WeaponGeo {
  return cls === 'ARCHER' ? makeBow(accent, tier) : cls === 'WIZARD' || cls === 'NECROMANCER' ? makeStaff(cls === 'NECROMANCER' ? '#7a4ad0' : accent, tier) : cls === 'KNIGHT' ? makeSword(accent, tier) : makeAxe(accent, tier);
}

function HeroModel({ cls, q }: { cls: HeroClass; q: QualityCfg }) {
  const ch = useCharacterInstance(CHAR[cls]);
  const clips = useClips();
  // the character's outfit tint (characters.ts), multiplied over the model's colours
  useEffect(() => {
    const t = activeChar()?.tint ?? '#ffffff';
    for (const mt of ch.mats as MeshStandardMaterial[]) if (mt.color) { mt.color.set(t); if (cls === 'NECROMANCER') mt.color.multiply(NECRO_TINT); }
  }, [ch, cls]);
  const rarity = useGameStore((s) => s.equipment?.weapon?.rarity) || 'COMMON';
  const eq = useGameStore((s) => s.equipment);
  const gearKey = ['helmet', 'armor', 'gloves', 'boots', 'accessory'].map((k) => (eq as any)?.[k]?.rarity || '').join('|');
  const root = useRef<Group>(null!), lean = useRef<Group>(null!), blob = useRef<Mesh>(null!);
  const S = useRef({
    mixer: null as AnimationMixer | null, sitK: 0, legs: null as (Object3D | null)[] | null,
    idle: null as AnimationAction | null, run: null as AnimationAction | null, walk: null as AnimationAction | null,
    hit: null as AnimationAction | null, death: null as AnimationAction | null, atk: null as AnimationAction | null, cast: null as AnimationAction | null,
    wIdle: 1, wRun: 0, wDeath: 0, prevAtk: 0, prevCast: 0, prevHurt: 0, wasAlive: true, yaw: 0, lean: 0, t: 0, tscale: 1,
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
    grp.scale.setScalar(1 + 0.05 * tier);
    const body = new Mesh(w.body, litMat({ roughness: 0.55, metalness: 0.25 }));
    body.castShadow = true;
    const glowM = new Mesh(w.glow, new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.5 + 0.35 * tier, 1.5 + 0.35 * tier, 1.5 + 0.35 * tier) }));
    grp.add(body, glowM);
    ch.handR.add(grp);
    S.current.gem = w.tip;
    (grp as any).userData.tier = tier;
    const g = grp;
    return () => { ch.handR!.remove(g); w.body.dispose(); w.glow.dispose(); (body.material as any).dispose(); (glowM.material as any).dispose(); };
  }, [ch, cls, rarity]);

  // ---- the knight's shield on the left arm (tinted like the weapon's rarity)
  useEffect(() => {
    if (cls !== 'KNIGHT' || !ch.handL) return;
    const tier = RARITY_TIER[rarity] ?? 0, accent = RARITY_ACCENT[rarity] || RARITY_ACCENT.COMMON;
    const w = makeShield(accent, tier);
    const grp = new Group();
    grp.position.set(SHIELD_POS[0], SHIELD_POS[1], SHIELD_POS[2]); grp.rotation.set(SHIELD_ROT[0], SHIELD_ROT[1], SHIELD_ROT[2]);
    grp.scale.setScalar(SHIELD_SCALE);
    const body = new Mesh(w.body, litMat({ roughness: 0.45, metalness: 0.4 })); body.castShadow = true;
    const glowM = new Mesh(w.glow, new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.6, 1.6) }));
    grp.add(body, glowM);
    ch.handL.add(grp);
    return () => { ch.handL!.remove(grp); w.body.dispose(); w.glow.dispose(); (body.material as any).dispose(); (glowM.material as any).dispose(); };
  }, [ch, cls, rarity]);

  // ---- gear look: the model keeps its original design; equipped gear recolours its parts by rarity
  // (re-applied only when a slot's rarity changes; runs after the outfit tint above)
  useEffect(() => {
    const [helmet, armor, gloves, boots, accessory] = gearKey.split('|');
    return tintGear(ch.meshes, { helmet, armor, gloves, boots, accessory, hero: cls });
  }, [ch, gearKey, cls]);

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
    if (lobby) g.position.set(0, 0, 0); else { g.position.copy(p.pos); g.position.y = p.air + liftAt(p.pos.x, p.pos.z); }
    const tk = !lobby && p.titanT > 0 ? 2.2 : 1;
    s.tscale = damp(s.tscale ?? 1, tk, 5, dt);
    g.scale.setScalar(s.tscale);
    const targetYaw = lobby ? Math.sin(t * 0.3) * 0.4 : p.facing;
    s.yaw = lobby ? targetYaw : angleLerp(s.yaw, targetYaw, 1 - Math.exp(-20 * dt));
    g.rotation.y = s.yaw + (!lobby && p.whirlT > 0 ? t * 20 : 0);
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
    const speedMul = lobby ? 1 : 0.85 + Math.min(1.1, Math.hypot(p.vel.x, p.vel.z) / 9) + (p.whirlT > 0 ? 0.6 : 0) + (dashing ? 0.8 : 0);
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

    // seated on a bench / pew (no sit clip in the KayKit packs: the legs are posed on top of the idle)
    const rideOn = !lobby && alive && world.village.ride.on && status === GameStatus.MENU;   // (owner) astride a stable horse
    const sitOn = !lobby && alive && (world.village.sit.on || rideOn) && status === GameStatus.MENU;
    s.sitK = damp(s.sitK ?? 0, sitOn ? 1 : 0, 10, dt);
    if (s.sitK > 0.01) {
      if (!s.legs) s.legs = ['upperlegl', 'upperlegr', 'lowerlegl', 'lowerlegr', 'hips'].map((n) => ch.root.getObjectByName(n) ?? null);
      const [ul, ur, ll, lr] = s.legs, k = s.sitK;
      if (rideOn) {   // legs apart round the horse's flanks, knees bent a little
        if (ul) { ul.rotation.x -= 0.75 * k; ul.rotation.z -= 0.5 * k; } if (ur) { ur.rotation.x -= 0.75 * k; ur.rotation.z += 0.5 * k; }
        if (ll) ll.rotation.x += 0.9 * k; if (lr) lr.rotation.x += 0.9 * k;
        const hv = world.village.ride.horse, hz = hv >= 0 ? animals[hv] : null;
        const bob = hz && hz.moving ? Math.abs(Math.sin(hz.hop)) * 0.12 : 0;
        g.position.y += (RIDE_SEAT_Y + bob - SIT_HIP_DROP) * k;
      } else {
        if (ul) ul.rotation.x -= 1.5 * k; if (ur) ur.rotation.x -= 1.5 * k;
        if (ll) ll.rotation.x += 1.55 * k; if (lr) lr.rotation.x += 1.55 * k;
        g.position.y += (world.village.sit.y - SIT_HIP_DROP) * k;
      }
    }

    // emissive status tint
    let r = 0, gg = 0, bb = 0;
    if (!lobby && alive) {
      if (a.hurtT > 0) { r += a.hurtT * 0.9; gg += a.hurtT * 0.05; }
      if (p.invulnT > 0 && !dashing && status === GameStatus.PLAYING) { const k = 0.18 + 0.14 * Math.sin(t * 16); gg += k * 0.8; bb += k; }
      if (p.cryT > 0) { const k = 0.25 + 0.12 * Math.sin(t * 9); r += k * 0.9; gg += k * 0.55; bb += k * 0.1; }
      if (p.titanT > 0) { const k = 0.3 + 0.12 * Math.sin(t * 6); r += k * 0.8; gg += k * 0.35; }
      if (p.rageT > 0) r += 0.28 + 0.12 * Math.sin(t * 12);
      if (p.whirlT > 0) { gg += 0.12; r += 0.2; }
      if (p.avatarT > 0) { const k = 0.2 + 0.05 * Math.sin(t * 3); r += k; gg += k * 0.9; bb += k * 0.6; }   // Divine Avatar: a soft holy glow
      if (dashing) { r += 0.35; gg += 0.45; bb += 0.55; }
    }
    const key = (r * 100 | 0) + ',' + (gg * 100 | 0) + ',' + (bb * 100 | 0);
    if (key !== s.emissiveKey) { s.emissiveKey = key; for (const mt of ch.mats as MeshStandardMaterial[]) if (mt.emissive) mt.emissive.setRGB(r, gg, bb); }

    // blob shadow
    if (blob.current) { blob.current.visible = alive; (blob.current.material as MeshBasicMaterial).opacity = q.shadowMap ? 0.14 : 0.32; }

    // ---- continuous status particles
    if (dt > 0 && !lobby && alive) {
      const px = p.pos.x, pz = p.pos.z;
      if (p.cryT > 0) {
        FX.add.emit(px, 1.2, pz, 0, 0, 0, 0.1, 3.4, 3.0, 2.2, 1.1, 0.18, 0.28, CELL.GLOW);
        if (Math.random() < dt * 24) FX.add.emit(px + (Math.random() - 0.5) * 1.2, 0.2, pz + (Math.random() - 0.5) * 1.2, 0, 2.5, 0, 0.8, 0.3, 0.05, 2.2, 1.6, 0.3, 0.9, CELL.STAR, 0, 0.2, t, 2);
      }
      if (p.titanT > 0) {
        const sc = s.tscale ?? 2.2;
        FX.add.emit(px, 2.2 * sc * 0.5, pz, 0, 0, 0, 0.1, 6 * sc * 0.5, 5 * sc * 0.5, 2.4, 1.0, 0.2, 0.32, CELL.GLOW);
        if (Math.random() < dt * 50) embers(px + (Math.random() - 0.5) * 3, 0.3, pz + (Math.random() - 0.5) * 3, 1, 0xff8a2a, 0.8, 5, 1.1, 0.26);
        if (Math.random() < dt * 20) FX.add.emit(px + Math.cos(t * 3) * 3.2, 0.1, pz + Math.sin(t * 3) * 3.2, 0, 3, 0, 0.7, 1.2, 0.2, 2.2, 0.9, 0.2, 0.5, CELL.RING);
      }
      if (p.air > 0.3 && Math.random() < 0.9) FX.add.emit(px, p.air + 1, pz, 0, 0, 0, 0.5, 1.4, 0.2, 2.4, 0.4, 0.15, 0.6, CELL.GLOW);
      if (p.rageT > 0) {
        FX.add.emit(px, 1.2, pz, 0, 0, 0, 0.1, 3.4, 3.2, 1.6, 0.18, 0.08, 0.3, CELL.GLOW);
        if (Math.random() < dt * 40) embers(px, 0.2, pz, 1, 0xff4a1a, 0.7, 3.4, 0.8, 0.2);
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
  // town arrival: a tall white-gold light column on the hero that flares up then fades
  const arriveGeo = useMemo(() => new CylinderGeometry(1.15, 1.35, 46, 32, 1, true).translate(0, 23, 0), []);
  const arriveMat = useMemo(() => makeBeamMaterial(0xfff0c0, { speed: 2.4, stripes: 5, power: 0.9 }), []);
  const arriveCore = useMemo(() => makeBeamMaterial(0xffffff, { speed: 4, stripes: 3, power: 1.3 }), []);
  const arrive = useRef<Mesh>(null!), arriveIn = useRef<Mesh>(null!);
  const prevTitle = useRef(useUiStore.getState().titleDone);
  const bubbleMat = useMemo(() => new MeshBasicMaterial({ color: new Color(0.5, 1.6, 2.4), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), []);
  const bubbleGeo = useMemo(() => new SphereGeometry(1, 20, 14), []);
  // knight Divine Avatar: a pair of glowing white feathered wings (one geometry, mirrored for the left wing)
  const wingGeo = useMemo(() => {
    const w = new GB([0.85, 1.1]);
    w.box(1.9, 0.2, 0.1, [0.95, 0.62, 0], '#ffffff', [0, 0, 0.38]);   // the arm of the wing
    // overlapping feathers: long flight feathers along the trailing edge, a full inner layer of coverts
    for (let k = 0; k < 12; k++) {
      const t = k / 11, bx = 0.1 + t * 1.7, by = 0.28 + t * 0.66, len = 0.7 + t * 1.0, ang = 0.05 + t * 0.7;
      const dx = Math.sin(ang), dy = -Math.cos(ang);
      w.box(0.36, len, 0.05, [bx + dx * len * 0.5, by + dy * len * 0.5, -0.03], k % 2 ? '#eef4ff' : '#dfe8ff', [0, 0, ang]);
      const l2 = len * 0.6;
      w.box(0.34, l2, 0.05, [bx + dx * l2 * 0.5, by + dy * l2 * 0.5, 0.03], '#ffffff', [0, 0, ang]);
    }
    return w.build();
  }, []);
  const wingMat = useMemo(() => new MeshBasicMaterial({ vertexColors: true, color: new Color(1.35, 1.35, 1.45), transparent: true, opacity: 0, side: DoubleSide, depthWrite: false, toneMapped: false }), []);
  const wings = useRef<Group>(null!), wingL = useRef<Mesh>(null!), wingR = useRef<Mesh>(null!);
  const wingK = useRef(0);
  const flash = useRef({ bubble: 0, radius: 2, gold: false });

  useEffect(() => {
    const off = events.on('shieldBlock', (e) => { flash.current.bubble = 1; flash.current.radius = Math.max(1.8, e.radius); flash.current.gold = !!e.gold; });
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
    // arrival pillar (town spawn, and when the class select closes)
    const ui = useUiStore.getState();
    if (ui.titleDone && !prevTitle.current) world.village.spawnFx = 1;
    prevTitle.current = ui.titleDone;
    const V = world.village, onTitle = !ui.titleDone || ui.charSelect;
    if (V.spawnFx > 0 && !onTitle) V.spawnFx = Math.max(0, V.spawnFx - dt / 3.2);
    const sf = onTitle || status !== GameStatus.MENU ? 0 : V.spawnFx;   // town only
    if (arrive.current) {
      arrive.current.visible = arriveIn.current.visible = sf > 0;
      if (sf > 0) {
        const age = 1 - sf, grow = Math.min(1, age * 7);           // snaps open in ~0.45 s, then thins out as it fades
        const w = (0.35 + grow * 0.65) * (0.75 + sf * 0.25);
        arrive.current.position.set(p.pos.x, 0, p.pos.z); arrive.current.scale.set(w, 0.4 + grow * 0.6, w);
        arriveIn.current.position.copy(arrive.current.position); arriveIn.current.scale.set(w * 0.42, 0.4 + grow * 0.6, w * 0.42);
        const a = Math.min(1, sf * 2.2);
        arriveMat.uniforms.uAlpha.value = a; arriveMat.uniforms.uTime.value = t;
        arriveCore.uniforms.uAlpha.value = a; arriveCore.uniforms.uTime.value = t;
        if (dt > 0 && Math.random() < dt * 40 * sf) { const r = Math.random() * 1.2, an = Math.random() * TAU; embers(p.pos.x + Math.cos(an) * r, 0.3 + Math.random() * 2, p.pos.z + Math.sin(an) * r, 1, 0xffe9a8, 0.25, 4.5, 1.4, 0.12); }
        if (age < 0.02 && dt > 0) dustPuff(p.pos.x, p.pos.z, 10, 2.6, 0xfff2c8, 3.5);
      }
    }
    // Divine Avatar wings: unfurl, slow flap, fold away when it ends
    const wantWings = !lobby && p.avatarT > 0 ? 1 : 0;
    wingK.current += (wantWings - wingK.current) * (1 - Math.exp(-(wantWings ? 6 : 4) * Math.min(dt0, 0.05)));
    if (wings.current) {
      const k = wingK.current;
      wings.current.visible = k > 0.01;
      if (k > 0.01) {
        wings.current.position.set(p.pos.x, p.pos.y + 1.45 + liftAt(p.pos.x, p.pos.z), p.pos.z);
        wings.current.rotation.y = p.facing;
        const flap = Math.sin(t * 3.2) * 0.16, open = 0.3 + (1 - k) * 0.9;
        wingR.current.rotation.set(1.15 + flap, open, 0.25);
        wingL.current.rotation.set(1.15 + flap, -open, -0.25);
        const s = 0.3 + k * 1.15; wingR.current.scale.set(s, s, s); wingL.current.scale.set(-s, s, s);
        wingMat.opacity = Math.min(1, k * 1.2) * 0.92;
      }
    }
    // shield bubble
    const f = flash.current;
    f.bubble = Math.max(0, f.bubble - dt * 3);
    if (bubble.current) {
      bubble.current.visible = f.bubble > 0;
      if (f.bubble > 0) { bubble.current.position.set(p.pos.x, 1.1, p.pos.z); const s = f.radius * (1.05 + (1 - f.bubble) * 0.3); bubble.current.scale.set(s, s, s); bubbleMat.opacity = f.bubble * 0.45; bubbleMat.color.setRGB(f.gold ? 2.4 : 0.5, f.gold ? 1.9 : 1.6, f.gold ? 0.6 : 2.4); }
    }
  });
  return (
    <>
      {gm.map((m, i) => <mesh key={i} ref={(r) => { ghosts.current[i] = r!; }} geometry={ghostGeo} material={m} visible={false} />)}
      <mesh ref={pillar} geometry={pillarGeo} material={pillarMat} visible={false} frustumCulled={false} />
      <mesh ref={revive} geometry={reviveGeo} material={reviveMat} visible={false} frustumCulled={false} />
      <mesh ref={arrive} geometry={arriveGeo} material={arriveMat} visible={false} frustumCulled={false} renderOrder={5} />
      <mesh ref={arriveIn} geometry={arriveGeo} material={arriveCore} visible={false} frustumCulled={false} renderOrder={6} />
      <mesh ref={bubble} geometry={bubbleGeo} material={bubbleMat} visible={false} />
      <group ref={wings} visible={false}>
        <mesh ref={wingR} geometry={wingGeo} material={wingMat} position={[0.2, 0.15, -0.45]} renderOrder={4} />
        <mesh ref={wingL} geometry={wingGeo} material={wingMat} position={[-0.2, 0.15, -0.45]} renderOrder={4} />
      </group>
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
    const on = world.player.whirlT > 0 && !isLobbyStatus(useGameStore.getState().status);
    if (!on) { m.count = 0; m2.count = 0; return; }
    const t = clock.elapsedTime, p = world.player;
    const wt = world.player.whirlT;
    const grow = clamp((3 - wt) / 0.25, 0, 1), fade = clamp(wt / 0.4, 0, 1);
    m.count = m2.count = N;
    const R = abilityState.whirlR * 0.8 * grow;
    for (let i = 0; i < N; i++) {
      const a = t * 5 + (i / N) * TAU;
      // lying flat (sideways): handle points back at the hero, blade swings horizontally at the rim
      const ri = R * 0.45, x = p.pos.x + Math.cos(a) * ri, z = p.pos.z + Math.sin(a) * ri;
      const bx = p.pos.x + Math.cos(a) * R, bz = p.pos.z + Math.sin(a) * R;
      setInst(m, i, x, 1.15, z, -a, 2.2 * fade, 2.2 * fade, 2.2 * fade, Math.PI / 2, -Math.PI / 2);
      setInst(m2, i, x, 1.15, z, -a, 2.2 * fade, 2.2 * fade, 2.2 * fade, Math.PI / 2, -Math.PI / 2);
      FX.add.emit(bx, 1.15, bz, 0, 0, 0, 0.18, 2.3, 1.2, 1.8, 0.7, 0.2, 0.55, CELL.GLOW);
      if (Math.random() < 0.5) sparks(bx, 1.15, bz, 1, 0xffc070, 4, 0.2, 0.25, 1.6);
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
  // the character's name (and the equipped achievement title above it) float over the bars
  const hero = useGameStore((s) => s.hero);
  const title = useGameStore((s) => titleOf(s.meta.title));
  const nameLab = useMemo(() => labelMaterial(activeChar()?.name || hero.charAt(0) + hero.slice(1).toLowerCase(), '#f4ead2', { size: 46 }), [hero]);
  const titleLab = useMemo(() => (title ? labelMaterial(`« ${title} »`, '#ffd24a', { size: 38 }) : null), [title]);
  useEffect(() => { for (const l of [nameLab, titleLab]) if (l) { l.mat.depthTest = false; l.mat.depthWrite = false; } }, [nameLab, titleLab]);
  const g = useRef<Group>(null!), hp = useRef<Mesh>(null!), mp = useRef<Mesh>(null!), sh = useRef<Mesh>(null!), shG = useRef<Group>(null!);
  const chG = useRef<Group>(null!), ch = useRef<Mesh>(null!), barsG = useRef<Group>(null!);   // Lightpiercer charge meter (archer skill 2, owner)
  // Aegis shield bar: light blue, with tick lines splitting it into segments (one per ~10% of the shield)
  const ticks = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 16;
    const x = c.getContext('2d')!;
    x.fillStyle = 'rgba(10,30,50,0.85)';
    for (let i = 1; i < 10; i++) x.fillRect(Math.round((i / 10) * 256) - 1, 0, 2, 16);
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace;
    return t;
  }, []);
  useFrame(() => {
    const st = useGameStore.getState();
    const run = st.status === GameStatus.PLAYING || st.status === GameStatus.PAUSED || st.status === GameStatus.LEVEL_UP;
    const town = st.status === GameStatus.MENU && useUiStore.getState().titleDone && !useUiStore.getState().charSelect;   // (owner) name + title in town too, without the bars
    if (!g.current) return;
    g.current.visible = (run || town) && world.player.alive;
    if (barsG.current) barsG.current.visible = run;
    if (!g.current.visible) return;
    const p = world.player;
    g.current.position.set(p.pos.x, (run ? 3.15 : 1.95) + (p.air || 0) + liftAt(p.pos.x, p.pos.z), p.pos.z);   // (owner: in town no bars, so the name sits just above the head like NPC names)   // mini HP / MP bars float above the hero's head
    g.current.quaternion.copy(camera.quaternion);
    const fh = clamp(p.hp / Math.max(1, st.stats.maxHealth), 0, 1), fm = clamp(p.mana / Math.max(1, st.stats.maxMana), 0, 1);
    hp.current.scale.x = Math.max(0.001, fh); hp.current.position.x = -(1 - fh) * 1.1;
    mp.current.scale.x = Math.max(0.001, fm); mp.current.position.x = -(1 - fm) * 1.1;
    (hp.current.material as MeshBasicMaterial).color.setRGB(fh < 0.3 ? 1.6 : 1.1, fh < 0.3 ? 0.2 : 0.18, 0.2);
    const fsMax = p.aegisMax + p.arcaneMax, fs = fsMax > 0 ? clamp((p.aegis + p.arcane) / fsMax, 0, 1) : 0;   // Aegis + Arcane Shield
    shG.current.visible = fs > 0;
    if (fs > 0) { sh.current.scale.x = Math.max(0.001, fs); sh.current.position.x = -(1 - fs) * 1.1; }
    const charging = abilityState.lpT > 0;
    chG.current.visible = charging;
    if (charging) {
      const fc = clamp(abilityState.lpCharge / LP_CHARGE, 0, 1);
      ch.current.scale.x = Math.max(0.001, fc); ch.current.position.x = -(1 - fc) * 1.1;
      (ch.current.material as MeshBasicMaterial).color.setRGB(fc >= 1 ? 1.8 : 1.3, fc >= 1 ? 1.7 : 1.1, fc >= 1 ? 1.4 : 0.45);
    }
  });
  const bg = <meshBasicMaterial color="#10141c" transparent opacity={0.7} depthTest={false} depthWrite={false} />;
  return (
    <group ref={g} renderOrder={40}>
      <group ref={barsG}>
      <mesh position={[0, 0.1, 0]} renderOrder={40}><planeGeometry args={[2.36, 0.46]} />{bg}</mesh>
      <mesh ref={hp} position={[0, 0.2, 0.01]} renderOrder={41}><planeGeometry args={[2.2, 0.16]} /><meshBasicMaterial color="#e0442f" depthTest={false} depthWrite={false} toneMapped={false} /></mesh>
      <mesh ref={mp} position={[0, 0.0, 0.01]} renderOrder={41}><planeGeometry args={[2.2, 0.12]} /><meshBasicMaterial color="#3b82f6" depthTest={false} depthWrite={false} toneMapped={false} /></mesh>
      <group ref={shG} position={[0, 0.47, 0]} visible={false}>
        <mesh renderOrder={40}><planeGeometry args={[2.36, 0.2]} />{bg}</mesh>
        <mesh ref={sh} position={[0, 0, 0.01]} renderOrder={41}><planeGeometry args={[2.2, 0.12]} /><meshBasicMaterial color="#8fdcff" depthTest={false} depthWrite={false} toneMapped={false} /></mesh>
        <mesh position={[0, 0, 0.02]} renderOrder={42}><planeGeometry args={[2.2, 0.12]} /><meshBasicMaterial map={ticks} transparent depthTest={false} depthWrite={false} /></mesh>
      </group>
      <group ref={chG} position={[0, -0.3, 0]} visible={false}>
        <mesh renderOrder={40}><planeGeometry args={[2.36, 0.2]} />{bg}</mesh>
        <mesh ref={ch} position={[0, 0, 0.01]} renderOrder={41}><planeGeometry args={[2.2, 0.12]} /><meshBasicMaterial color="#ffd36a" depthTest={false} depthWrite={false} toneMapped={false} /></mesh>
      </group>
      </group>
      <sprite material={nameLab.mat} position={[0, 0.8, 0.02]} scale={[nameLab.aspect * 0.78, 0.78, 1]} renderOrder={42} />
      {titleLab && <sprite material={titleLab.mat} position={[0, 1.38, 0.02]} scale={[titleLab.aspect * 0.6, 0.6, 1]} renderOrder={42} />}
    </group>
  );
}

/** A transparent sphere around the hero (bright rim, see-through middle): purple while the Wizard's Arcane Shield holds,
 *  light blue while the Aegis shield holds, golden while the knight's Shield Wall is up. */
function AegisSphere() {
  const m = useRef<Mesh>(null!);
  const mat = useMemo(() => new ShaderMaterial({
    transparent: true, depthWrite: false, side: FrontSide, blending: AdditiveBlending,
    uniforms: { uA: { value: 1 }, uC: { value: new Color(0.45, 0.85, 1.0) } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uA; uniform vec3 uC; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(uC * (0.25 + 1.4 * f), (0.08 + 0.6 * f) * uA); }',
  }), []);
  useFrame(({ clock }) => {
    const p = world.player, arcane = p.arcane > 0, aegis = p.aegis > 0, guard = p.guardT > 0, on = (arcane || aegis || guard) && p.alive;   // purple: Arcane Shield; blue: Aegis; gold: Shield Wall
    m.current.visible = on;
    if (!on) return;
    if (arcane) mat.uniforms.uC.value.setRGB(0.72, 0.38, 1.0); else if (aegis) mat.uniforms.uC.value.setRGB(0.45, 0.85, 1.0); else mat.uniforms.uC.value.setRGB(1.0, 0.82, 0.3);
    m.current.position.set(p.pos.x, 1.1 + (p.air || 0), p.pos.z);
    m.current.scale.setScalar(1.55 + Math.sin(clock.elapsedTime * 3) * 0.04);
    mat.uniforms.uA.value = arcane ? 0.7 + 0.5 * clamp(p.arcane / Math.max(1, p.arcaneMax), 0, 1) : aegis ? 0.6 + 0.4 * clamp(p.aegis / Math.max(1, p.aegisMax), 0, 1) : 0.8;
  });
  return <mesh ref={m} material={mat} visible={false} renderOrder={30}><sphereGeometry args={[1, 32, 20]} /></mesh>;
}

/** How far the hips drop from standing to sitting on a seat at height 0 (tuned to the KayKit medium rig). */
const SIT_HIP_DROP = 0.42;
/** saddle height of the stable horses (render/Npcs buildHorse, scale 1) */
const RIDE_SEAT_Y = 1.66;
export function Hero({ q }: { q: QualityCfg }) {
  const cls = useGameStore((s) => s.hero) as HeroClass;
  return (
    <>
      <HeroModel key={cls} cls={cls} q={q} />
      <Effects cls={cls} />
      <EarthWall />
      {cls === 'BARBARIAN' && <AxeSpin />}
      <HeroBars />
      <AegisSphere />
    </>
  );
}
