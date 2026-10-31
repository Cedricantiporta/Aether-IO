// Draws the signature props of the boss kits (engine/systems/bossKit*.ts). Everything is driven by 'trick' events whose kind starts with "KIT_" so a
// co-op guest (who receives host events) builds the same scene:
//   KIT_STATUE|i|state|r   (pos = the spot)   Gorath's Living Statues: 1 rise, 2 broken by his blow, 0 crumble
//   KIT_BEAM|ex|ez|hex|w   (pos = origin)     the Stone Gaze beam to (ex, ez) (cut short by a statue)
//   KIT_KNOT|i|state|ang|r (pos = the boss)   Elderroot's bark knots: 1 glowing, 2 cracked, 0 gone; plus the amber floor line to stand on
// Style: casual cute (cream marble toy guardians with a gold rune ring, amber glowing knots). Telegraph bodies stay RED (Zones.tsx); these are props / accents.
// No per-frame allocation: pooled meshes, shared geometry / materials.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BoxGeometry, CapsuleGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, TorusGeometry } from 'three';
import { events } from '../engine/events';
import { chunks, dustPuff, flashStar, ringBurst, sparks } from './fx';
import { shardBurst } from './BossCrystals';

const MAXS = 4, MAXK = 3, MAXB = 4;
interface StatueFx { on: boolean; x: number; z: number; t: number; r: number }
interface KnotFx { on: boolean; x: number; z: number; ang: number; rad: number; t: number }
interface BeamFx { on: boolean; ox: number; oz: number; ex: number; ez: number; w: number; t: number }
const DUR_BEAM = 0.5;

export function BossKitFx() {
  const statues = useMemo<StatueFx[]>(() => Array.from({ length: MAXS }, () => ({ on: false, x: 0, z: 0, t: 0, r: 1.7 })), []);
  const knots = useMemo<KnotFx[]>(() => Array.from({ length: MAXK }, () => ({ on: false, x: 0, z: 0, ang: 0, rad: 6, t: 0 })), []);
  const beams = useMemo<BeamFx[]>(() => Array.from({ length: MAXB }, () => ({ on: false, ox: 0, oz: 0, ex: 0, ez: 0, w: 3, t: 0 })), []);
  const G = useMemo(() => ({
    box: new BoxGeometry(1, 1, 1),
    plinth: new CylinderGeometry(1.45, 1.65, 0.55, 16),
    body: new CapsuleGeometry(0.8, 1.35, 6, 14),
    head: new SphereGeometry(0.66, 14, 12),
    ring: new TorusGeometry(1.9, 0.09, 6, 36),
    orb: new SphereGeometry(1, 14, 12),
    col: new CylinderGeometry(0.4, 0.4, 1, 10, 1, true),
  }), []);
  const M = useMemo(() => ({
    marble: new MeshStandardMaterial({ color: 0xf1e9d6, roughness: 0.72, metalness: 0.02 }),
    base: new MeshStandardMaterial({ color: 0xcfc4ac, roughness: 0.85 }),
    gold: new MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.85, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
    beamO: new MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.45, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, toneMapped: false }),
    beamC: new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
    knot: new MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.95, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
    knotGlow: new MeshBasicMaterial({ color: 0xffc866, transparent: true, opacity: 0.28, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
    line: new MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.16, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, toneMapped: false }),
    col: new MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.3, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, toneMapped: false }),
  }), []);
  const gS = useRef<Group>(null), gK = useRef<Group>(null), gB = useRef<Group>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) (window as unknown as Record<string, unknown>).__kitFx = { statues, knots, beams };   // QA
    const off = events.on('trick', (e) => {
      const k = e.kind;
      if (k.charCodeAt(0) !== 75 || !k.startsWith('KIT_')) return;
      const p = e.pos, a = k.split('|');
      switch (a[0]) {
        case 'KIT_STATUE': {
          const i = (+a[1] | 0) % MAXS, st = +a[2] | 0, s = statues[i];
          if (st === 1) { s.on = true; s.x = p.x; s.z = p.z; s.t = 0; s.r = +a[3] || 1.7; dustPuff(p.x, p.z, 10, 1.6, 0xcdbd98, 3); ringBurst(p.x, 0.4, p.z, 0xffd36a, 0.8, 5.5, 0.7, 2); }
          else if (s.on) {
            s.on = false;
            if (st === 2) { shardBurst(p.x, 1.8, p.z, 22, 0xf1e9d6, 0xb8ae98, 10, 0.42, 1); chunks(p.x, 1.5, p.z, 16, 0xe8e0d0, 0xa89e88, 8, 0.36); dustPuff(p.x, p.z, 12, 2, 0xe8e0d0, 3.5); ringBurst(p.x, 0.5, p.z, 0xffe9a0, 1, 8, 0.55, 2.4); flashStar(p.x, 2, p.z, 0xffe9a0, 7, 0.3); }
            else { dustPuff(p.x, p.z, 8, 1.4, 0xcdbd98, 3); chunks(p.x, 1.2, p.z, 8, 0xd6cdb8, 0x9a9078, 5, 0.3); }
          }
          break;
        }
        case 'KIT_BEAM': {
          for (let i = 0; i < MAXB; i++) {
            const b = beams[i]; if (b.on) continue;
            b.on = true; b.ox = p.x; b.oz = p.z; b.ex = +a[1]; b.ez = +a[2]; b.w = +a[4] || 3.6; b.t = 0;
            sparks(b.ex, 1.4, b.ez, 14, 0xffe9a0, 9, 0.3, 0.5, 2);
            break;
          }
          break;
        }
        case 'KIT_KNOT': {
          const i = (+a[1] | 0) % MAXK, st = +a[2] | 0, n = knots[i];
          const ang = +a[3] || 0, rad = +a[4] || 6;
          if (st === 1) { n.on = true; n.x = p.x; n.z = p.z; n.ang = ang; n.rad = rad; n.t = 0; flashStar(p.x + Math.sin(ang) * rad * 0.75, 2.6, p.z + Math.cos(ang) * rad * 0.75, 0xffc866, 4, 0.4); }
          else if (n.on) {
            n.on = false;
            if (st === 2) { const kx = n.x + Math.sin(n.ang) * n.rad * 0.75, kz = n.z + Math.cos(n.ang) * n.rad * 0.75; shardBurst(kx, 2.6, kz, 14, 0x8a5a2a, 0x5b3a1e, 8, 0.36, 1); sparks(kx, 2.6, kz, 18, 0xffd23a, 9, 0.3, 0.5, 2); flashStar(kx, 2.6, kz, 0xffe08a, 6, 0.3); ringBurst(kx, 0.5, kz, 0xffd23a, 0.6, 5, 0.5, 2); }
          }
          break;
        }
        default: break;
      }
    });
    return () => { off(); };
  }, [statues, knots, beams]);

  useFrame((state, dtRaw) => {
    const dt = Math.min(0.05, dtRaw), tm = state.clock.elapsedTime;
    const gs = gS.current, gk = gK.current, gb = gB.current;
    if (gs) for (let i = 0; i < MAXS; i++) {
      const s = statues[i], m = gs.children[i] as Group;
      if (!s.on) { m.visible = false; continue; }
      s.t += dt;
      const k = Math.min(1, s.t / 0.8), up = 1 - Math.pow(1 - k, 3) * (1 + 1.2 * (1 - k));   // ease out with a little overshoot
      m.visible = true; m.position.set(s.x, -3.6 * (1 - Math.min(1, up)), s.z); m.scale.setScalar((s.r / 1.7) * 1.35);
      const ring = m.children[4] as Mesh; ring.scale.setScalar(1 + 0.06 * Math.sin(tm * 3 + i)); (ring.material as MeshBasicMaterial).opacity = 0.55 + 0.3 * Math.sin(tm * 3 + i);
    }
    if (gb) for (let i = 0; i < MAXB; i++) {
      const b = beams[i], m = gb.children[i] as Group;
      if (!b.on) { m.visible = false; continue; }
      b.t += dt;
      if (b.t >= DUR_BEAM) { b.on = false; m.visible = false; continue; }
      const dx = b.ex - b.ox, dz = b.ez - b.oz, len = Math.hypot(dx, dz) || 1, fade = Math.min(1, b.t / 0.06, (DUR_BEAM - b.t) / 0.2);
      m.visible = true; m.position.set(b.ox + dx * 0.5, 1.5, b.oz + dz * 0.5); m.rotation.y = Math.atan2(dx, dz);
      (m.children[0] as Mesh).scale.set(b.w * 1.05, 2.4, len); (m.children[1] as Mesh).scale.set(b.w * 0.34, 1.0, len);
      M.beamO.opacity = 0.45 * fade; M.beamC.opacity = 0.95 * fade;
    }
    if (gk) for (let i = 0; i < MAXK; i++) {
      const n = knots[i], m = gk.children[i] as Group;
      if (!n.on) { m.visible = false; continue; }
      n.t += dt;
      const pulse = 0.82 + 0.18 * Math.sin(tm * 6 + i * 2), grow = Math.min(1, n.t / 0.5), sx = Math.sin(n.ang), sz = Math.cos(n.ang);
      m.visible = true; m.position.set(n.x, 0, n.z);
      const orb = m.children[0] as Mesh, halo = m.children[1] as Mesh, col = m.children[2] as Mesh, line = m.children[3] as Mesh;
      const kr = n.rad * 0.75;
      orb.position.set(sx * kr, 2.6, sz * kr); orb.scale.setScalar(1.15 * pulse * grow);
      halo.position.copy(orb.position); halo.scale.setScalar(2.4 * pulse * grow);
      col.position.set(sx * kr, 6, sz * kr); col.scale.set(1, 12 * grow, 1);
      line.position.set(sx * (n.rad + 18), 0.1, sz * (n.rad + 18)); line.rotation.y = n.ang; line.scale.set(2.4, 1, 36);
    }
  });

  return (
    <group>
      <group ref={gS}>
        {Array.from({ length: MAXS }, (_, i) => (
          <group key={i} visible={false}>
            <mesh geometry={G.plinth} material={M.base} position={[0, 0.27, 0]} />
            <mesh geometry={G.body} material={M.marble} position={[0, 1.95, 0]} />
            <mesh geometry={G.head} material={M.marble} position={[0, 3.45, 0]} />
            <mesh geometry={G.box} material={M.marble} position={[0.95, 2.1, 0.2]} scale={[0.25, 1.5, 1.0]} />
            <mesh geometry={G.ring} material={M.gold.clone()} position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]} />
          </group>
        ))}
      </group>
      <group ref={gB}>
        {Array.from({ length: MAXB }, (_, i) => (
          <group key={i} visible={false}>
            <mesh geometry={G.box} material={M.beamO} frustumCulled={false} />
            <mesh geometry={G.box} material={M.beamC} frustumCulled={false} />
          </group>
        ))}
      </group>
      <group ref={gK}>
        {Array.from({ length: MAXK }, (_, i) => (
          <group key={i} visible={false}>
            <mesh geometry={G.orb} material={M.knot} frustumCulled={false} />
            <mesh geometry={G.orb} material={M.knotGlow} frustumCulled={false} />
            <mesh geometry={G.col} material={M.col} frustumCulled={false} />
            <mesh geometry={G.box} material={M.line} frustumCulled={false} />
          </group>
        ))}
      </group>
    </group>
  );
}
