// Draws the dodge mechanics of engine/systems/dodgeMechs.ts. Everything is driven by 'trick' events whose kind starts with "DG_" (so a co-op guest,
// who receives host events, sees the same thing): converging ring + expanding shockwave ring (particle rings from fx.ts), beam meshes that move by the
// shared `beamAngle` formula, the Bomb Shroom burst. Telegraph bodies are the red METEOR_SHADOW zones drawn by Zones.tsx; the colours here are accents.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BoxGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial } from 'three';
import { events } from '../engine/events';
import { beamAngle } from '../engine/systems/dodgeMechs';
import { flashStar, glowPuff, ringBurst, smokePuff, sparks, splat } from './fx';

const MAXB = 6;
interface BeamFx { on: boolean; ox: number; oz: number; mode: number; a0: number; w: number; amp: number; per: number; t: number; dur: number; len: number; width: number; }

export function DodgeFx() {
  const beams = useMemo<BeamFx[]>(() => Array.from({ length: MAXB }, () => ({ on: false, ox: 0, oz: 0, mode: 0, a0: 0, w: 0, amp: 0, per: 1, t: 0, dur: 0, len: 40, width: 2 })), []);
  const geo = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const outer = useMemo(() => Array.from({ length: MAXB }, () => new MeshBasicMaterial({ transparent: true, opacity: 0.4, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, toneMapped: false })), []);
  const core = useMemo(() => Array.from({ length: MAXB }, () => new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, blending: AdditiveBlending, toneMapped: false })), []);
  const group = useRef<Group>(null);

  useEffect(() => {
    const off = events.on('trick', (e) => {
      const k = e.kind;
      if (k.charCodeAt(0) !== 68 || !k.startsWith('DG_')) return;
      const p = e.pos, a = k.split('|');
      switch (a[0]) {
        case 'DG_RING': {   // converging rings, staggered so the warning pulses; they all close on the centre exactly when the wave is released
          const conv = Math.max(0.3, +a[1] || 1.1), c = parseInt(a[2], 16) || 0xffd36a;
          ringBurst(p.x, 0.45, p.z, c, 58, 1.5, conv, 2.4);
          ringBurst(p.x, 0.5, p.z, 0xffffff, 40, 1.5, conv * 0.8, 1.6);
          ringBurst(p.x, 0.55, p.z, c, 24, 1.5, conv * 0.6, 2.2);
          glowPuff(p.x, 1, p.z, c, 3, conv, 1.2, 0.5);
          break;
        }
        case 'DG_GO': {   // the wave is out: a fast expanding bright ring (+ a white core), flash at the centre
          const sp = +a[1] || 36, c = parseInt(a[2], 16) || 0xffd36a, R = +a[3] || 90, life = R / sp;
          ringBurst(p.x, 0.5, p.z, c, 1, R, life, 2.6);
          ringBurst(p.x, 0.6, p.z, 0xffffff, 0.6, R * 0.97, life, 1.8);
          flashStar(p.x, 1.5, p.z, c, 14, 0.35);
          sparks(p.x, 1, p.z, 18, c, 12, 0.3, 0.5, 2);
          break;
        }
        case 'DG_BEAM': {
          for (let i = 0; i < MAXB; i++) {
            const b = beams[i];
            if (b.on) continue;
            b.on = true; b.ox = p.x; b.oz = p.z; b.mode = +a[1]; b.a0 = +a[2]; b.w = +a[3]; b.amp = +a[4]; b.per = +a[5] || 1; b.t = 0; b.dur = +a[6]; b.len = +a[7]; b.width = +a[8];
            outer[i].color.setHex(parseInt(a[9], 16) || 0xff8a2a);
            break;
          }
          break;
        }
        case 'DG_BOOM': {   // Bomb Shroom burst: poison cloud + a green ring out to the floor radius
          const r = e.radius;
          ringBurst(p.x, 0.4, p.z, 0xb8f060, 1, r * 0.8, 0.4, 2);
          ringBurst(p.x, 0.45, p.z, 0xa060e0, 0.6, r * 0.55, 0.35, 1.8);
          smokePuff(p.x, 0.8, p.z, 16, 0x8a5ad0, 3.2, 1.2, 1.4, r * 0.55, 0.55);
          sparks(p.x, 0.8, p.z, 14, 0xc8f060, 9, 0.24, 0.5, 2);
          splat(p.x, p.z, r * 1.6, 0x7a4ab0, 6, 0.5);
          break;
        }
        case 'DG_FUSE': sparks(p.x, 1.4, p.z, 12, 0xffb040, 7, 0.2, 0.3, 2); flashStar(p.x, 1.4, p.z, 0xffe08a, 3, 0.2); break;
        default: break;
      }
    });
    return () => { off(); };
  }, [beams, outer]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw), g = group.current;
    if (!g) return;
    for (let i = 0; i < MAXB; i++) {
      const b = beams[i], m = g.children[i] as Group;
      if (!b.on) { m.visible = false; continue; }
      b.t += dt;
      if (b.t >= b.dur) { b.on = false; m.visible = false; continue; }
      const a = beamAngle(b.mode, b.a0, b.w, b.amp, b.per, b.t);
      const fade = Math.min(1, b.t / 0.12, (b.dur - b.t) / 0.2), fl = 0.85 + 0.15 * Math.sin(b.t * 60 + i);
      m.visible = true;
      m.position.set(b.ox + Math.sin(a) * b.len * 0.5, 0.9, b.oz + Math.cos(a) * b.len * 0.5);
      m.rotation.y = a;
      const o = m.children[0] as Mesh, c = m.children[1] as Mesh;
      o.scale.set(b.width * (1.1 + 0.1 * fl), 1.6, b.len); c.scale.set(b.width * 0.34 * fl, 0.9, b.len);
      outer[i].opacity = 0.42 * fade; core[i].opacity = 0.95 * fade;
    }
  });

  return (
    <group ref={group}>
      {Array.from({ length: MAXB }, (_, i) => (
        <group key={i} visible={false}>
          <mesh geometry={geo} material={outer[i]} frustumCulled={false} />
          <mesh geometry={geo} material={core[i]} frustumCulled={false} />
        </group>
      ))}
    </group>
  );
}
