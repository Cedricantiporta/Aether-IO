// The co-op partner's hero: the same KayKit model / weapon / gear tint as the local Hero, driven by `world.remote`
// (net/coop.ts writes the interpolated position every frame). A soft teal ring on the ground and a name plate mark it as "the friend".
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AnimationAction, AnimationMixer, Color, DoubleSide, Group, LoopOnce, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { world } from '../engine/world';
import { GameStatus } from '../types';
import type { HeroClass } from '../types';
import { useGameStore } from '../store';
import { useCoop } from '../net/coopStore';
import type { HeroSnap } from '../net/protocol';
import { F_ALIVE, F_ATTACK, F_CAST } from '../net/protocol';
import { useCharacterInstance, useClips, upperBody, type CharKey } from './characters';
import { NECRO_TINT, HANDSLOT_QUAT, RARITY_ACCENT, RARITY_TIER, makeAxe, makeBow, makeStaff, makeSword, makeShield, wopts, type WOpts, type WeaponGeo } from './weapons';
import { tintGear } from './gear';
import { labelMaterial } from './label';
import { angleLerp, damp, clamp, litMat } from './util';

const CHAR: Record<HeroClass, CharKey> = { ARCHER: 'ARCHER', WIZARD: 'WIZARD', BARBARIAN: 'BARBARIAN', KNIGHT: 'KNIGHT', NECROMANCER: 'ROGUE' };
const RING = '#7fe3ff';

function buildWeapon(cls: HeroClass, accent: string, tier: number, o?: WOpts): WeaponGeo {
  return cls === 'ARCHER' ? makeBow(accent, tier, o) : cls === 'WIZARD' || cls === 'NECROMANCER' ? makeStaff(accent, tier, o) : cls === 'KNIGHT' ? makeSword(accent, tier, o) : makeAxe(accent, tier, o);
}

function RemoteModel({ snap }: { snap: HeroSnap }) {
  const cls = snap.c;
  const ch = useCharacterInstance(CHAR[cls]);
  const clips = useClips();
  const root = useRef<Group>(null!), ring = useRef<Mesh>(null!);
  const S = useRef({ mixer: null as AnimationMixer | null, idle: null as AnimationAction | null, run: null as AnimationAction | null, atk: null as AnimationAction | null, cast: null as AnimationAction | null, death: null as AnimationAction | null, wIdle: 1, wRun: 0, yaw: 0, prevFl: 0, wasAlive: true });
  const nameLab = useMemo(() => labelMaterial(snap.n, '#d9f6ff', { size: 46 }), [snap.n]);
  useEffect(() => { nameLab.mat.depthTest = false; nameLab.mat.depthWrite = false; }, [nameLab]);

  // outfit tint (multiplied over the model's colours), like the local hero
  useEffect(() => {
    for (const mt of ch.mats as MeshStandardMaterial[]) if (mt.color) { mt.color.set(snap.t); if (cls === 'NECROMANCER') mt.color.multiply(NECRO_TINT); }
  }, [ch, cls, snap.t]);
  // gear recolour by rarity (helmet, armor, gloves, boots, accessory)
  const gearKey = snap.g.join('|');
  useEffect(() => {
    const [helmet, armor, gloves, boots, accessory] = gearKey.split('|');
    return tintGear(ch.meshes, { helmet, armor, gloves, boots, accessory, hero: cls });
  }, [ch, gearKey, cls]);
  // weapon (+ knight shield)
  useEffect(() => {
    if (!ch.handR) return;
    const rarity = snap.w || 'COMMON', tier = RARITY_TIER[rarity] ?? 0, accent = RARITY_ACCENT[rarity] || RARITY_ACCENT.COMMON;
    const wo = wopts(rarity, 'MID', cls === 'NECROMANCER'), w = buildWeapon(cls, cls === 'WIZARD' && tier === 0 ? '#8fb8ff' : accent, tier, wo);
    const grp = new Group(); grp.quaternion.copy(HANDSLOT_QUAT); grp.scale.setScalar(1 + 0.05 * tier);
    const body = new Mesh(w.body, litMat({ roughness: 0.55, metalness: 0.25 }));
    const glowM = new Mesh(w.glow, new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.5 + 0.35 * tier, 1.5 + 0.35 * tier, 1.5 + 0.35 * tier) }));
    grp.add(body, glowM); ch.handR.add(grp);
    for (const sp of w.spins ?? []) { const m = new Mesh(sp.geo, glowM.material); m.position.set(sp.pos[0], sp.pos[1], sp.pos[2]); grp.add(m); }
    let sh: { g: Group; w: WeaponGeo; b: Mesh; m: Mesh } | null = null;
    if (cls === 'KNIGHT' && ch.handL) {
      const sw = makeShield(accent, tier, wo), g = new Group();
      g.position.set(0, 0.05, 0.12); g.rotation.set(Math.PI / 2, Math.PI / 2, 0); g.scale.setScalar(0.9);
      const b = new Mesh(sw.body, litMat({ roughness: 0.45, metalness: 0.4 })), m = new Mesh(sw.glow, new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.6, 1.6) }));
      g.add(b, m); ch.handL.add(g); sh = { g, w: sw, b, m };
    }
    return () => {
      ch.handR!.remove(grp); w.body.dispose(); w.glow.dispose(); for (const sp of w.spins ?? []) sp.geo.dispose(); (body.material as any).dispose(); (glowM.material as any).dispose();
      if (sh) { ch.handL!.remove(sh.g); sh.w.body.dispose(); sh.w.glow.dispose(); (sh.b.material as any).dispose(); (sh.m.material as any).dispose(); }
    };
  }, [ch, cls, snap.w]);
  // animations
  useEffect(() => {
    const m = new AnimationMixer(ch.root), s = S.current;
    const mk = (name: string, w = 0) => { const c = clips[name]; if (!c) return null; const a = m.clipAction(c); a.setEffectiveWeight(w); return a; };
    s.idle = mk('Idle_A', 1); s.idle?.play(); s.run = mk('Running_A'); s.run?.play();
    s.death = mk('Death_A'); s.death?.setLoop(LoopOnce, 1); if (s.death) s.death.clampWhenFinished = true;
    const thr = clips['Throw'];
    if (thr) {
      s.atk = m.clipAction(upperBody(thr)); s.atk.setLoop(LoopOnce, 1); s.atk.clampWhenFinished = false;
      const use = clips['Use_Item'] || clips['Interact'];
      s.cast = use ? m.clipAction(upperBody(use)) : s.atk; if (s.cast !== s.atk) { s.cast.setLoop(LoopOnce, 1); s.cast.clampWhenFinished = false; }
    }
    s.mixer = m; s.wIdle = 1; s.wRun = 0; s.wasAlive = true;
    return () => { m.stopAllAction(); m.uncacheRoot(ch.root); s.mixer = null; };
  }, [ch, clips]);

  useFrame((state, dt0) => {
    const g = root.current, s = S.current, m = s.mixer; if (!g || !m) return;
    const R = world.remote, status = useGameStore.getState().status;
    const on = R.active && (status === GameStatus.PLAYING || status === GameStatus.PAUSED || status === GameStatus.LEVEL_UP);
    g.visible = on; if (!on) return;
    const dt = status === GameStatus.PAUSED ? 0 : Math.min(dt0, 0.05), t = state.clock.elapsedTime;
    g.position.set(R.x, 0, R.z);
    s.yaw = angleLerp(s.yaw, R.facing, 1 - Math.exp(-20 * dt));
    g.rotation.y = s.yaw;
    const alive = (R.flags & F_ALIVE) !== 0, b = alive ? clamp(R.blend, 0, 1) : 0;
    if (!alive && s.wasAlive) { s.death?.reset().play(); }
    if (alive && !s.wasAlive) s.death?.stop();
    s.wasAlive = alive;
    s.wRun = damp(s.wRun, b, 16, dt); s.wIdle = damp(s.wIdle, alive ? 1 - b : 0, 16, dt);
    s.idle?.setEffectiveWeight(s.wIdle + 1e-4); s.run?.setEffectiveWeight(s.wRun + 1e-4);
    if (s.run) s.run.timeScale = 0.85 + b * 0.5;
    if (s.death && !alive) s.death.setEffectiveWeight(7);
    const fl = R.flags;
    if (alive) {   // one-shots on the rising edge of the partner's attack / cast flags
      if ((fl & F_ATTACK) && !(s.prevFl & F_ATTACK) && s.atk) { s.atk.reset(); s.atk.timeScale = 2.4; s.atk.play(); }
      if ((fl & F_CAST) && !(s.prevFl & F_CAST) && s.cast) { s.cast.reset(); s.cast.timeScale = 1.5; s.cast.play(); }
    }
    s.prevFl = fl;
    for (const act of [s.atk, s.cast]) {
      if (!act) continue;
      if (!act.isRunning()) { act.setEffectiveWeight(0); continue; }
      const f = act.time / act.getClip().duration;
      act.setEffectiveWeight(7 * Math.min(1, f / 0.07) * Math.min(1, (1 - f) / 0.15 + 0.001));
    }
    m.update(dt);
    if (ring.current) { ring.current.scale.setScalar(1 + Math.sin(t * 3) * 0.04); }
  });

  return (
    <group ref={root} visible={false}>
      <primitive object={ch.root} />
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} renderOrder={5}>
        <ringGeometry args={[0.95, 1.2, 40]} />
        <meshBasicMaterial color={RING} transparent opacity={0.8} depthWrite={false} toneMapped={false} side={DoubleSide} />
      </mesh>
      <sprite material={nameLab.mat} position={[0, 3.2, 0]} scale={[nameLab.aspect * 0.78, 0.78, 1]} renderOrder={42} />
    </group>
  );
}

/** Mounted by Scene during runs: nothing unless a co-op partner is connected. */
export function RemoteHero() {
  const partner = useCoop((s) => s.partner);
  const state = useCoop((s) => s.state);
  if (state !== 'connected' || !partner) return null;
  return <RemoteModel key={partner.c + partner.t + partner.w + partner.g.join('|') + partner.n} snap={partner} />;
}
