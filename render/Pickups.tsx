// Pickups: XP crystals, coins, gems, hearts (instanced) + rarity loot beams with floating labels (items).
import { liftAt } from './lift';
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, CircleGeometry, Color, CylinderGeometry, DynamicDrawUsage, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  OctahedronGeometry, Sprite,
} from 'three';
import { world } from '../engine/world';
import type { Pickup } from '../engine/types';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { CELL, FX, pushHalo } from './fx';
import { GB, TAU, commitInst, setInst } from './util';
import { makeBeamMaterial } from './beam';
import { useItemPickupsVersion } from './hooks';
import { labelMaterial } from './label';
import { inView } from './view';

const RARITY_HEX: Record<string, string> = { COMMON: '#e5e7eb', RARE: '#3b82f6', EPIC: '#a855f7', LEGENDARY: '#eab308', MYTHIC: '#ef4444' };
const MAXP = 500;
const SHARD_RGB: number[][] = [[1.5, 1.5, 1.7], [0.5, 1.2, 2.8], [1.9, 0.6, 2.8], [2.8, 2.1, 0.4], [2.8, 0.5, 0.5]];
const _c = new Color();

export function Pickups() {
  const sys = useMemo(() => {
    const mk = (g: any, m: any, cap = MAXP) => { const im = new InstancedMesh(g, m, cap); im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(DynamicDrawUsage); return im; };
    const xp = mk(new OctahedronGeometry(0.2, 0).scale(0.75, 1.25, 0.75), new MeshBasicMaterial({ toneMapped: false }));
    xp.setColorAt(0, _c.setRGB(1, 1, 1));
    const coinG = new GB([1, 1]).cyl(0.26, 0.26, 0.07, 14, [0, 0, 0], '#ffd23a', [Math.PI / 2, 0, 0]).cyl(0.2, 0.2, 0.09, 14, [0, 0, 0], '#e8a81a', [Math.PI / 2, 0, 0]).build();
    const coin = mk(coinG, new MeshStandardMaterial({ vertexColors: true, flatShading: true, metalness: 0.8, roughness: 0.28, emissive: 0xaa6a00, emissiveIntensity: 0.55 }));
    const gemG = new GB([1, 1]).octa(0.3, [0, 0, 0], '#5ae8ff', [0.85, 1.35, 0.85]).build();
    const gem = mk(gemG, new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.6, 1.7) }));
    const heartG = new GB([1, 1]);
    heartG.sph(0.15, [-0.1, 0.1, 0], '#ff4a6a', 1, 8).sph(0.15, [0.1, 0.1, 0], '#ff4a6a', 1, 8).cone(0.22, 0.36, 8, [0, -0.1, 0], '#ff4a6a', [Math.PI, 0, 0]);
    const heart = mk(heartG.build(), new MeshStandardMaterial({ vertexColors: true, flatShading: true, emissive: 0xff2040, emissiveIntensity: 0.7, roughness: 0.4 }));
    const shardG = new OctahedronGeometry(0.18, 0).scale(0.7, 1.5, 0.7);
    const shard = mk(shardG, new MeshBasicMaterial({ toneMapped: false }));
    shard.setColorAt(0, _c.setRGB(1, 1, 1));
    const itemG = new GB([1, 1]).octa(0.34, [0, 0, 0], '#ffffff', [0.9, 1.2, 0.9]).build();
    return { xp, coin, gem, heart, shard, itemG };
  }, []);
  const group = useMemo(() => { const g = new Group(); g.add(sys.xp, sys.coin, sys.gem, sys.heart, sys.shard); return g; }, [sys]);
  const ver = useItemPickupsVersion();
  const items = useMemo(() => world.pickups.filter((p) => p.active && p.kind === 'ITEM' && p.item), [ver]);

  useFrame(({ clock }, dtRaw) => {
    const t = clock.elapsedTime;
    const pk = world.pickups;
    let nx = 0, nc = 0, ng = 0, nh = 0, ns = 0;
    const paused = useGameStore.getState().status === GameStatus.PAUSED;
    for (let i = 0; i < pk.length; i++) {
      const p = pk[i];
      if (!p.active || p.kind === 'ITEM') continue;
      if (!inView(p.pos.x, p.pos.z, 3)) continue;
      const bob = Math.sin(t * 3.2 + p.id * 1.7) * 0.1;
      const y = Math.max(p.pos.y, 0.25) + 0.35 + bob + liftAt(p.pos.x, p.pos.z);
      const pop = Math.min(1, p.t * 5);
      const s = pop * (1 + (1 - Math.min(1, p.t * 4)) * 0.4);
      switch (p.kind) {
        case 'XP': {
          const v = p.value, tier = v < 8 ? 0 : v < 30 ? 1 : 2;
          const sc = [0.9, 1.25, 1.75][tier] * s;
          setInst(sys.xp, nx, p.pos.x, y, p.pos.z, t * 2 + p.id, sc, sc, sc, 0, Math.sin(t * 3 + p.id) * 0.2);
          if (tier === 0) _c.setRGB(0.5, 1.2, 2.6); else if (tier === 1) _c.setRGB(0.5, 2.4, 0.9); else _c.setRGB(1.9, 0.7, 2.8);
          sys.xp.setColorAt(nx, _c);
          pushHalo(p.pos.x, y, p.pos.z, 0.9 * sc, _c.r * 0.5, _c.g * 0.5, _c.b * 0.5, 0.5, CELL.GLOW);
          nx++; break;
        }
        case 'GOLD': {
          const sc = (0.9 + Math.min(0.5, p.value * 0.004)) * s;
          setInst(sys.coin, nc++, p.pos.x, y, p.pos.z, t * 5 + p.id, sc, sc, sc, 0, 0);
          if (((t * 5 + p.id) % TAU) < 0.25) pushHalo(p.pos.x, y, p.pos.z, 0.7, 2, 1.7, 0.6, 0.7, CELL.STAR);
          break;
        }
        case 'GEM': {
          setInst(sys.gem, ng++, p.pos.x, y + 0.1, p.pos.z, t * 2.5 + p.id, s, s, s, 0, 0);
          pushHalo(p.pos.x, y + 0.1, p.pos.z, 1.0 * s, 0.3, 1.1, 1.5, 0.55, CELL.GLOW);
          break;
        }
        case 'SHARD': {
          const ri = Math.max(0, Math.min(4, p.value | 0)), c = SHARD_RGB[ri];
          setInst(sys.shard, ns, p.pos.x, y + 0.1, p.pos.z, t * 2.2 + p.id, s * 1.15, s * 1.15, s * 1.15, 0, Math.sin(t * 3 + p.id) * 0.25);
          _c.setRGB(c[0], c[1], c[2]); sys.shard.setColorAt(ns, _c); ns++;
          pushHalo(p.pos.x, y + 0.1, p.pos.z, 0.9 * s, c[0] * 0.35, c[1] * 0.35, c[2] * 0.35, 0.5, CELL.GLOW);
          break;
        }
        case 'HEALTH': {
          const sc = (1 + Math.sin(t * 6 + p.id) * 0.08) * s * 1.2;
          setInst(sys.heart, nh++, p.pos.x, y + 0.1, p.pos.z, t * 1.5 + p.id, sc, sc, sc, 0, 0);
          pushHalo(p.pos.x, y + 0.1, p.pos.z, 1.2 * s, 1.4, 0.2, 0.3, 0.45, CELL.GLOW);
          break;
        }
      }
    }
    for (const [m, n] of [[sys.xp, nx], [sys.coin, nc], [sys.gem, ng], [sys.heart, nh], [sys.shard, ns]] as [InstancedMesh, number][]) commitInst(m, n);
    void dtRaw; void paused;
  }, -0.2);

  return (
    <>
      <primitive object={group} />
      {items.map((p) => <ItemPickup key={p.id + ':' + (p.item?.id || '')} p={p} geo={sys.itemG} />)}
    </>
  );
}

const beamGeo = new CylinderGeometry(0.55, 0.8, 11, 16, 1, true).translate(0, 5.5, 0);
const ringGeo = new CircleGeometry(1.1, 24).rotateX(-Math.PI / 2);

function ItemPickup({ p, geo }: { p: Pickup; geo: any }) {
  const rarity = p.item?.rarity || 'COMMON';
  const hex = RARITY_HEX[rarity];
  const beam = rarity !== 'COMMON' && rarity !== 'RARE';
  const g = useRef<Group>(null!), icon = useRef<Mesh>(null!), label = useRef<Sprite>(null!), ring = useRef<Mesh>(null!);
  const beamMat = useMemo(() => makeBeamMaterial(hex, { speed: 2.5, stripes: 5, power: 1.3 }), [hex]);
  const iconMat = useMemo(() => new MeshBasicMaterial({ color: new Color(hex).multiplyScalar(2.2), toneMapped: false }), [hex]);
  const ringMat = useMemo(() => new MeshBasicMaterial({ color: new Color(hex).multiplyScalar(1.5), transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), [hex]);
  const lab = useMemo(() => labelMaterial(p.item?.name || 'Item', hex, { size: 52 }), [p.item, hex]);
  const lastSpark = useRef(0);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (!g.current) return;
    const vis = p.active && p.kind === 'ITEM' && inView(p.pos.x, p.pos.z, 4);
    g.current.visible = vis;
    if (!vis) return;
    g.current.position.set(p.pos.x, liftAt(p.pos.x, p.pos.z), p.pos.z);
    const pop = Math.min(1, p.t * 3);
    beamMat.uniforms.uTime.value = t; beamMat.uniforms.uAlpha.value = (0.55 + 0.15 * Math.sin(t * 4)) * pop * (p.item?.type === 'LOOT' && rarity === 'COMMON' ? 0.3 : 1);
    const hy = Math.max(p.pos.y, 0) + 1.1 + Math.sin(t * 2.4 + p.id) * 0.15;
    icon.current.position.y = hy; icon.current.rotation.y = t * 2; icon.current.scale.setScalar(pop * (rarity === 'MYTHIC' ? 1.5 : rarity === 'LEGENDARY' ? 1.3 : 1.1));
    label.current.position.y = hy + 1.0 + Math.sin(t * 2.4) * 0.05;
    ringMat.opacity = 0.35 + 0.2 * Math.sin(t * 4);
    ring.current.scale.setScalar(1 + 0.06 * Math.sin(t * 4));
    pushHalo(p.pos.x, hy, p.pos.z, 2.0, _c.set(hex).r * 1.4, _c.g * 1.4, _c.b * 1.4, 0.55, CELL.GLOW);
    lastSpark.current += dt;
    if (lastSpark.current > 0.12 && useGameStore.getState().status !== GameStatus.PAUSED) {
      lastSpark.current = 0; _c.set(hex);
      FX.add.emit(p.pos.x + (Math.random() - 0.5) * 1.2, 0.2, p.pos.z + (Math.random() - 0.5) * 1.2, 0, 2.5 + Math.random() * 2, 0, 1.0, 0.22, 0.04, _c.r * 2.2, _c.g * 2.2, _c.b * 2.2, 0.9, CELL.STAR, 0, 0.2, Math.random() * 3, 3);
    }
  }, -0.2);
  return (
    <group ref={g}>
      {beam && <mesh geometry={beamGeo} material={beamMat} />}{/* light beam only for Epic and above */}
      <mesh ref={ring} geometry={ringGeo} material={ringMat} position={[0, 0.07, 0]} />
      <mesh ref={icon} geometry={geo} material={iconMat} />
      <sprite ref={label} material={lab.mat} scale={[lab.aspect * 0.62, 0.62, 1]} />
    </group>
  );
}
