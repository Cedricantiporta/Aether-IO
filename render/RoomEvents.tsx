// Room objective / twist props (engine/systems/roomEvents.ts): the totem, the captive's cage, spike traps, and glows on
// the treasure goblin / bounty target. Reads world.roomEvt in useFrame; meshes are built once (traps are a fixed pool).
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, MeshBasicMaterial, Sprite, SpriteMaterial, type Group, type Mesh, type PointLight } from 'three';
import { world } from '../engine/world';
import { trapPhase } from '../engine/systems/roomEvents';
import { GB, litMat } from './util';
import { CELL, pushHalo } from './fx';

const MAXT = 40;   // = world.roomEvt.traps pool (tiles of the trap groups)

export function RoomEvents() {
  const totemLight = useRef<PointLight>(null!), barG = useRef<Group>(null!);
  // totem HP bar (two sprites, the fill anchored on its left edge)
  const bar = useMemo(() => {
    // gold frame + dark track + coloured fill (drawn over everything, above the crystal's glow)
    const frame = new Sprite(new SpriteMaterial({ color: '#c8962e', depthTest: false, transparent: true, opacity: 0.95, toneMapped: false }));
    const bg = new Sprite(new SpriteMaterial({ color: '#0d0a08', depthTest: false, transparent: true, opacity: 0.95, toneMapped: false }));
    const fill = new Sprite(new SpriteMaterial({ color: '#4ade80', depthTest: false, toneMapped: false }));
    frame.scale.set(3.5, 0.48, 1); bg.scale.set(3.36, 0.36, 1); fill.center.set(0, 0.5); fill.position.x = -1.6; fill.scale.set(3.2, 0.26, 1);
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
    b.cyl(1.55, 1.55, 0.2, 12, [0, 2.5, 0], '#4a3a2a');
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
        bar.fill.scale.x = 3.2 * Math.max(0, k);
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
        <mesh geometry={geo.villager} material={mat} castShadow />
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
