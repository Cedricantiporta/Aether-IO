// Room objective / twist props (engine/systems/roomEvents.ts): the totem, the captive's cage, spike traps, and glows on
// the treasure goblin / bounty target. Reads world.roomEvt in useFrame; meshes are built once (traps are a fixed pool).
import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AnimationMixer, Color, Mesh as TMesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, Sprite, SpriteMaterial, type Group, type Mesh, type PointLight } from 'three';
import { useCharacterInstance, useClips, type CharKey } from './characters';
import { labelMaterial } from './label';
import { useWorldCounter } from './hooks';
import { angleLerp } from './util';
import { world } from '../engine/world';
import { trapPhase } from '../engine/systems/roomEvents';
import { GB, litMat } from './util';
import { CELL, pushHalo } from './fx';

const MAXT = 40;

/** The caged captive (owner: an actual NPC): a KayKit villager (no hat, plain tunic) cowering in idle, waving to be let out
 *  once the room is clear (state 4) and cheering when freed (state 2). Lives inside the cage group (cage-local origin). */
const CAPTIVE_MODELS: CharKey[] = ['ARCHER', 'WIZARD', 'BARBARIAN', 'KNIGHT', 'ROGUE'];
const TUNICS = ['#c9a77a', '#d8c4a0', '#b89870', '#e8d8b8'];
const HAIRS = ['#5a3a22', '#2a1c12', '#b0582a', '#e0c070', '#8a8a8a'];
const HELP = labelMaterial('Captive · Help!', '#ffe08a', { size: 40, plate: 'mini' });
function CaptiveActor({ model, tunic, hair }: { model: CharKey; tunic: string; hair: string }) {
  const ch = useCharacterInstance(model);
  const clips = useClips();
  const g = useRef<Group>(null!), tag = useRef<Sprite>(null!);
  const S = useRef({ mixer: null as AnimationMixer | null, mode: -1, yaw: 0, idle: null as any, wave: null as any, cheer: null as any });
  useEffect(() => {
    const undo: (() => void)[] = [];
    for (const m of ch.meshes) {
      if (/Hat|Helmet|Hood|Cape|Mask|Quiver/i.test(m.name)) { m.visible = false; undo.push(() => { m.visible = true; }); continue; }
      if (/Body|Leg|Arm/.test(m.name)) {
        const mat = m.material as MeshStandardMaterial, map = mat.map, col = mat.color.clone();
        mat.map = null; mat.color.set(tunic); mat.needsUpdate = true;
        undo.push(() => { mat.map = map; mat.color.copy(col); mat.needsUpdate = true; });
      }
    }
    const head = ch.root.getObjectByName('head') || ch.root.getObjectByName('Head');
    if (head) {   // plain villager hair (the hat is hidden)
      const hm = new MeshStandardMaterial({ color: hair, roughness: 0.6 });
      const cap = new TMesh(new SphereGeometry(0.4, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hm);
      cap.position.set(0, 0.42, -0.03); cap.scale.set(1.12, 1, 1.12); head.add(cap);
      undo.push(() => { head.remove(cap); cap.geometry.dispose(); hm.dispose(); });
    }
    return () => { for (const u of undo) u(); };
  }, [ch, tunic, hair]);
  useEffect(() => {
    const m = new AnimationMixer(ch.root), s = S.current;
    s.idle = (clips['Idle_B'] || clips['Idle_A']) && m.clipAction(clips['Idle_B'] || clips['Idle_A']);
    s.wave = clips['Interact'] && m.clipAction(clips['Interact']);
    s.cheer = (clips['Use_Item'] || clips['Interact']) && m.clipAction(clips['Use_Item'] || clips['Interact']);
    s.mixer = m; s.mode = -1;
    return () => { m.stopAllAction(); m.uncacheRoot(ch.root); s.mixer = null; };
  }, [ch, clips]);
  useFrame((_, dt) => {
    const s = S.current, e = world.roomEvt;
    if (!s.mixer || !g.current) return;
    const mode = e.state === 2 ? 2 : e.state === 4 ? 1 : 0;
    if (mode !== s.mode) {
      const next = mode === 2 ? s.cheer : mode === 1 ? s.wave : s.idle;
      for (const a of [s.idle, s.wave, s.cheer]) if (a && a !== next) a.fadeOut(0.25);
      if (next) next.reset().fadeIn(0.25).play();
      s.mode = mode;
    }
    s.mixer.update(Math.min(dt, 0.05) * (mode === 0 ? 0.6 : 1));   // (trembling, slow idle while the fight goes on)
    const p = world.player.pos;
    s.yaw = angleLerp(s.yaw, Math.atan2(p.x - e.x, p.z - e.z), 1 - Math.exp(-3 * dt));
    g.current.rotation.y = s.yaw;
    if (tag.current) tag.current.visible = e.state !== 2;
  });
  return (
    <group ref={g} scale={0.9}>
      <primitive object={ch.root} />
      <sprite ref={tag} material={HELP.mat} position={[0, 4.4, 0]} scale={[HELP.aspect * 0.9, 0.9, 1]} renderOrder={6} />
    </group>
  );
}
function Captive() {
  useWorldCounter(() => world.room.version);   // a new face per room
  const r = world.room.index, b = world.room.biome;
  return <CaptiveActor key={`${b}:${r}`} model={CAPTIVE_MODELS[(r * 7 + b * 3) % CAPTIVE_MODELS.length]} tunic={TUNICS[(r + b) % TUNICS.length]} hair={HAIRS[(r * 3 + b) % HAIRS.length]} />;
}   // = world.roomEvt.traps pool (tiles of the trap groups)

export function RoomEvents() {
  const totemLight = useRef<PointLight>(null!), barG = useRef<Group>(null!);
  // totem HP bar (two sprites, the fill anchored on its left edge)
  const bar = useMemo(() => {
    // gold frame + dark track + coloured fill (drawn over everything, above the crystal's glow)
    const frame = new Sprite(new SpriteMaterial({ color: '#c8962e', depthTest: false, transparent: true, opacity: 0.95, toneMapped: false }));
    const bg = new Sprite(new SpriteMaterial({ color: '#0d0a08', depthTest: false, transparent: true, opacity: 0.95, toneMapped: false }));
    const fill = new Sprite(new SpriteMaterial({ color: '#4ade80', depthTest: false, toneMapped: false }));
    frame.scale.set(3.5, 0.48, 1); bg.scale.set(3.36, 0.36, 1); fill.center.set(0.5, 0.5); fill.scale.set(3.2, 0.26, 1);   // (left edge kept in SCREEN space via center.x each frame)
    frame.renderOrder = 20; bg.renderOrder = 21; fill.renderOrder = 22;
    return { frame, bg, fill };
  }, []);
  const glowMat = useMemo(() => new MeshBasicMaterial({ color: new Color(1.1, 2.4, 2.8), toneMapped: false }), []);
  const totem = useRef<Group>(null!), cage = useRef<Group>(null!), bars = useRef<Group>(null!);
  const traps = useRef<(Group | null)[]>([]), spikes = useRef<(Mesh | null)[]>([]);
  const mat = useMemo(() => litMat({ roughness: 0.7, metalness: 0.15 }), []);
  const geo = useMemo(() => {
    const t = new GB([0.9, 1.1]);
    t.cyl(1.1, 1.3, 0.5, 8, [0, 0.25, 0], '#5a5a66'); t.cyl(0.55, 0.7, 2.2, 6, [0, 1.6, 0], '#8a8aa0');
    const c = new GB([0.9, 1.1]);
    c.cyl(1.5, 1.5, 0.25, 12, [0, 0.12, 0], '#4a3a2a');
    const v = new GB([0.9, 1.1]);   // the captive: a little villager sitting in the cage
    v.cyl(0.32, 0.4, 0.9, 8, [0, 0.7, 0], '#c08a5a'); v.sph(0.32, [0, 1.4, 0], '#f0c8a0', 1, 8); v.sph(0.34, [0, 1.55, -0.05], '#5a3a20', [1, 0.6, 1], 8);
    const b = new GB([0.9, 1.1]);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; b.cyl(0.06, 0.06, 2.4, 5, [Math.cos(a) * 1.35, 1.3, Math.sin(a) * 1.35], '#3a3a40'); }
    // open roof (a rim + two cross bars) so the captive inside reads from the top-down camera
    b.torus(1.4, 0.1, [0, 2.5, 0], '#4a3a2a', [Math.PI / 2, 0, 0], 1, 16);
    b.box(2.8, 0.12, 0.12, [0, 2.55, 0], '#3a3a40'); b.box(0.12, 0.12, 2.8, [0, 2.55, 0], '#3a3a40');
    // square tiles (3.4 wide, edge to edge) so 1x3 / cross / 3x3 groups read as one trap floor; 3x3 holes each
    const plate = new GB([0.9, 1.1]); plate.box(3.3, 0.08, 3.3, [0, 0.04, 0], '#3a3436');
    for (let i = 0; i < 9; i++) plate.cyl(0.18, 0.2, 0.06, 6, [((i % 3) - 1) * 1.05, 0.09, (Math.floor(i / 3) - 1) * 1.05], '#1a1618');
    const sp = new GB([0.9, 1.1]);
    for (let i = 0; i < 9; i++) sp.cone(0.17, 1.1, 5, [((i % 3) - 1) * 1.05, 0.55, (Math.floor(i / 3) - 1) * 1.05], '#cfcfd8');
    const cr = new GB([1, 1]).ico(0.75, [0, 3.2, 0], '#ffffff', 1, 0);
    return { crystal: cr.build(), totem: t.build(), cageBase: c.build(), villager: v.build(), bars: b.build(), plate: plate.build(), spikes: sp.build() };
  }, []);

  useFrame(({ clock }) => {
    const e = world.roomEvt, t = clock.elapsedTime, live = world.room.active;
    // totem
    const showT = live && e.obj === 'DEFEND';
    if (totem.current) {
      totem.current.visible = showT;
      if (!showT && barG.current) barG.current.visible = false;
      if (showT) {
        totem.current.position.set(e.x, 0, e.z);
        const k = e.maxHp > 0 ? e.hp / e.maxHp : 0;
        if (e.state !== 3) pushHalo(e.x, 4.5, e.z, 3.8 + Math.sin(t * 3) * 0.4, e.hurtT > 0 ? 2.6 : 0.5, e.hurtT > 0 ? 0.6 : 1.8, e.hurtT > 0 ? 0.4 : 2.4, 0.35 + 0.35 * k, CELL.GLOW);
        totem.current.rotation.y = t * 0.4;
        totem.current.scale.setScalar(e.state === 3 ? 0.75 : 1.4);   // bigger; a broken stump when it fell
        // a real light on the floor around it (red while it is being hit) and its HP bar
        const L = totemLight.current;
        if (L) { L.intensity = e.state === 3 ? 0 : (e.hurtT > 0 ? 70 : 45) + Math.sin(t * 3) * 6; L.color.set(e.hurtT > 0 ? '#ff6a5a' : '#7fe0ff'); }
        pushHalo(e.x, 0.15, e.z, 7, 0.4, 1.4, 1.8, e.state === 3 ? 0 : 0.25, CELL.GLOW);
        const alive = e.state !== 3;
        if (barG.current) { barG.current.visible = alive; barG.current.position.set(e.x, 8.4, e.z); }   // (bar above the crystal and its bloom)
        bar.fill.scale.x = Math.max(0.001, 3.2 * Math.max(0, k));
        bar.fill.center.x = 1.6 / bar.fill.scale.x;   // anchor the fill's left edge to the track's left edge (billboards: a world-x offset drifts with the camera)
        bar.fill.material.color.set(k > 0.5 ? '#4ade80' : k > 0.25 ? '#facc15' : '#ef4444');
      }
    }
    // cage + captive
    const showC = live && e.obj === 'RESCUE' && e.state !== 3;
    if (cage.current) {
      cage.current.visible = showC;
      if (showC) {
        cage.current.position.set(e.x, 0, e.z);
        if (bars.current) bars.current.visible = e.state !== 2;
        if (e.state === 4) pushHalo(e.x, 1.5, e.z, 3.2 + Math.sin(t * 4) * 0.4, 2.2, 1.9, 0.6, 0.45, CELL.GLOW);   // free me!
        else if (e.hurtT > 0) pushHalo(e.x, 1.4, e.z, 2.6, 2.6, 0.5, 0.4, 0.45, CELL.GLOW);
      }
    }
    // spike traps
    for (let i = 0; i < MAXT; i++) {
      const g = traps.current[i]; if (!g) continue;
      const on = live && e.twist === 'TRAPS' && i < e.nTraps;
      g.visible = on;
      if (!on) continue;
      const tr = e.traps[i], ph = trapPhase(tr.t);
      g.position.set(tr.x, 0, tr.z);
      const s = spikes.current[i];
      if (s) { const up = ph === 2 ? 1 : ph > 0 ? 0.12 * ph : 0; s.scale.set(1, Math.max(0.01, up), 1); s.visible = up > 0.02; }
      if (ph > 0 && ph < 2) pushHalo(tr.x, 0.3, tr.z, 2.6 + ph, 2.6, 0.3, 0.2, 0.2 + 0.35 * ph, CELL.GLOW);
    }
    // the Shadowcaster (darkness twist): a pulsing violet aura
    if (live && e.twist === 'DARK' && e.darkId >= 0) {
      const m = world.enemies[e.darkId];
      if (m.active && m.state !== 'DYING') pushHalo(m.pos.x, 1.2, m.pos.z, 3.4 + Math.sin(t * 5) * 0.4, 1.6, 0.4, 3.0, 0.6, CELL.GLOW);
    }
    // goblin / bounty glows
    if (live && e.state === 1 && e.enemy >= 0) {
      const m = world.enemies[e.enemy];
      if (m.active && m.state !== 'DYING') {
        if (e.obj === 'GOBLIN') pushHalo(m.pos.x, 1.2, m.pos.z, 2.8, 2.6, 2.0, 0.5, 0.55, CELL.GLOW);
        else if (e.obj === 'HUNT') pushHalo(m.pos.x, 0.4, m.pos.z, 3.4 + Math.sin(t * 6) * 0.4, 2.6, 0.3, 0.2, 0.5, CELL.GLOW);
      }
    }
  });

  return (
    <>
      <group ref={totem} visible={false}>
        <mesh geometry={geo.totem} material={mat} castShadow /><mesh geometry={geo.crystal} material={glowMat} />
        <pointLight ref={totemLight} position={[0, 3.4, 0]} distance={16} decay={1.6} intensity={45} color="#7fe0ff" />
      </group>
      <group ref={barG} visible={false}><primitive object={bar.frame} /><primitive object={bar.bg} /><primitive object={bar.fill} /></group>
      <group ref={cage} visible={false}>
        <mesh geometry={geo.cageBase} material={mat} receiveShadow />
        <Suspense fallback={null}><Captive /></Suspense>
        <group ref={bars}><mesh geometry={geo.bars} material={mat} castShadow /></group>
      </group>
      {Array.from({ length: MAXT }, (_, i) => (
        <group key={i} ref={(g) => { traps.current[i] = g; }} visible={false}>
          <mesh geometry={geo.plate} material={mat} receiveShadow />
          <mesh ref={(m) => { spikes.current[i] = m; }} geometry={geo.spikes} material={mat} />
        </group>
      ))}
    </>
  );
}
