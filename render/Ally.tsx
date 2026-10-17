// The run ally (engine/systems/ally.ts): a KayKit adventurer who fights beside the hero for one room. Position, facing,
// swing and hit flinch come from its world.minions slot; this draws the model, a name tag, an HP bar and a speech line.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AnimationMixer, Color, Group, LoopOnce, Sprite, SpriteMaterial, type AnimationAction } from 'three';
import { world } from '../engine/world';
import { ally, ALLIES } from '../engine/systems/ally';
import { useWorldCounter } from './hooks';
import { useCharacterInstance, useClips } from './characters';
import { labelMaterial } from './label';

type Lab = ReturnType<typeof labelMaterial>;

const WHITE = new Color(1, 1, 1);
const BAR_BG = new SpriteMaterial({ color: 0x120c0c, transparent: true, opacity: 0.8, depthTest: false });
const BAR_FG = new SpriteMaterial({ color: 0x7ddc6a, transparent: true, depthTest: false });
const lines = new Map<string, Lab>();
const lineLabel = (text: string, color: string): Lab => {
  let l = lines.get(text);
  if (!l) { l = labelMaterial(text, color, { size: 40, plate: 'mini' }); lines.set(text, l); }
  return l;
};

function Actor({ def }: { def: number }) {
  const d = ALLIES[def];
  const ch = useCharacterInstance(d.model);
  const clips = useClips();
  const g = useRef<Group>(null!), body = useRef<Group>(null!), speech = useRef<Sprite>(null!), fg = useRef<Sprite>(null!), bg = useRef<Sprite>(null!);
  const tag = useMemo(() => labelMaterial(`${d.name} · Ally`, d.accent, { size: 44, plate: 'mini' }), [d]);
  const S = useRef({ mixer: null as AnimationMixer | null, idle: null as AnimationAction | null, run: null as AnimationAction | null, hit: null as AnimationAction | null, atk: null as AnimationAction | null, swing: 0, hurt: 0, said: '', fade: -1 });
  useEffect(() => {
    const tint = new Color(d.tint).lerp(WHITE, 0.35);
    ch.mats.forEach((m: any) => { if (m.color) m.color.copy(tint); });
  }, [ch, d]);
  useEffect(() => {
    const m = new AnimationMixer(ch.root), s = S.current;
    const mk = (n: string, w = 0, once = false) => { const c = clips[n]; if (!c) return null; const a = m.clipAction(c); a.setEffectiveWeight(w); if (once) { a.setLoop(LoopOnce, 1); a.clampWhenFinished = false; } a.play(); return a; };
    s.idle = mk('Idle_A', 1) || mk('Idle_B', 1);
    s.run = mk('Running_A') || mk('Running_B');
    s.hit = mk('Hit_A', 0, true); s.atk = mk('Throw', 0, true);
    if (s.hit) s.hit.stop(); if (s.atk) s.atk.stop();
    s.mixer = m;
    return () => { m.stopAllAction(); m.uncacheRoot(ch.root); s.mixer = null; };
  }, [ch, clips]);
  useFrame((_, dt) => {
    const s = S.current, m = world.minions[ally.slot];
    if (!g.current || !s.mixer || !m || !m.active) return;
    // a new swing / flinch restarts the one-shot clip
    if (m.swing > s.swing + 0.5 && s.atk) { s.atk.reset().play(); s.atk.setEffectiveWeight(1); }
    s.swing = m.swing;
    const hurt = m.hitT > 0 ? 1 : 0;
    if (hurt && !s.hurt && s.hit) { s.hit.reset().play(); s.hit.setEffectiveWeight(1); }
    s.hurt = hurt;
    const mv = m.mv;
    if (s.run) s.run.setEffectiveWeight(Math.min(1, mv * 1.4));
    if (s.idle) s.idle.setEffectiveWeight(1 - Math.min(1, mv * 1.4));
    s.mixer.update(Math.min(dt, 0.05));
    g.current.position.set(m.x, 0, m.z);
    body.current.rotation.y = m.facing + (m.spin > 0 ? (1 - m.spin) * Math.PI * 2 : 0);
    // melee lunge on the swing
    body.current.position.set(Math.sin(m.facing) * m.swing * 0.25, 0, Math.cos(m.facing) * m.swing * 0.25);
    // fade in / out
    const f = Math.round(ally.fade * 20) / 20;
    if (f !== s.fade) { s.fade = f; ch.mats.forEach((mt: any) => { mt.transparent = f < 1; mt.opacity = f; mt.needsUpdate = true; }); }
    // HP bar
    const k = Math.max(0, Math.min(1, m.hp / m.maxHp));
    fg.current.scale.set(1.2 * k, 0.12, 1); fg.current.position.x = -0.6 * (1 - k);
    fg.current.material.color.setHex(k > 0.5 ? 0x7ddc6a : k > 0.25 ? 0xf2c14a : 0xe5584a);
    bg.current.visible = fg.current.visible = f > 0.3;
    // speech line
    const text = ally.sayT > 0 && f > 0 ? ally.say : '';
    if (text !== s.said) { s.said = text; if (text) { const l = lineLabel(text, d.accent); speech.current.material = l.mat; speech.current.scale.set(l.aspect * 0.8, 0.8, 1); } }
    speech.current.visible = !!text;
  });
  return (
    <group ref={g}>
      <group ref={body}><primitive object={ch.root} /></group>
      <sprite ref={speech} position={[0, 3.9, 0]} visible={false} renderOrder={8}><spriteMaterial /></sprite>
      <sprite material={tag.mat} position={[0, 3.2, 0]} scale={[tag.aspect * 0.7, 0.7, 1]} />
      <sprite ref={bg} material={BAR_BG} position={[0, 2.8, 0]} scale={[1.26, 0.17, 1]} renderOrder={9} />
      <sprite ref={fg} material={BAR_FG.clone()} position={[0, 2.8, 0.001]} scale={[1.2, 0.12, 1]} renderOrder={10} />
      <pointLight position={[0, 1.6, 0.8]} color={d.accent} intensity={3} distance={6} decay={1.6} />
    </group>
  );
}

export function AllyActor() {
  const ver = useWorldCounter(() => ally.ver);
  if (!ally.on || !world.room.active) return null;
  return <Actor key={ver} def={ally.def} />;
}
