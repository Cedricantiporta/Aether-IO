// Event-driven VFX for the combat-depth systems: monster/boss tricks, player debuffs, slam, stagger, armor break, combo, ult wind-up.
import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { events } from '../engine/events';
import { world } from '../engine/world';
import { abilityState } from '../engine/systems/abilities';
import { tether, prism } from '../engine/systems/bossSpecials';
import { CELL, DECALS, FX, bolt, chunks, dustPuff, flashStar, glowPuff, pushHalo, ringBurst, smokePuff, sparks, splat, gate } from './fx';
import { TAU } from './util';

const rnd = Math.random;
let tetherAcc = 0;
const DEBUFF_COLOR: Record<string, number> = { STUN: 0xffd23a, ROOT: 0xc8a050, SILENCE: 0xc084fc, DEFDOWN: 0xa855f7, BLIND: 0x9ca3af, BURN: 0xff7a1a, POISON: 0x84cc16, BLEED: 0xef4444, SLOW: 0x60a5fa };

export function TrickFx() {
  useEffect(() => {
    const off: (() => void)[] = [];
    const on = events.on.bind(events) as typeof events.on;

    off.push(on('trick', (e) => {
      const p = e.pos, r = e.radius;
      switch (e.kind) {
        case 'GOO': splat(p.x, p.z, r * 2.2, 0x84cc16, 6, 0.8); sparks(p.x, 0.6, p.z, 12, 0x9be32a, 5, 0.22, 0.5, 1.5); break;
        case 'FIREBOMB': sparks(p.x, 0.8, p.z, 20, 0xff8a2a, 9, 0.28, 0.5, 2.2); glowPuff(p.x, 1, p.z, 0xff7a1a, r * 2, 0.4, 1.8, 0.8); break;
        case 'SCREECH': ringBurst(p.x, 1.2, p.z, 0xc084fc, 1, r * 1.3, 0.5, 2); ringBurst(p.x, 1.2, p.z, 0xffffff, 0.5, r, 0.35, 1.6); sparks(p.x, 1.2, p.z, 16, 0xd8b4fe, 10, 0.2, 0.4, 2); break;
        case 'PIN': sparks(p.x, 1.1, p.z, 10, 0xfacc15, 8, 0.2, 0.3, 2); break;
        case 'PIN_HIT': ringBurst(p.x, 0.3, p.z, 0xfacc15, 0.4, 3.2, 0.5, 1.8); dustPuff(p.x, p.z, 4, 0.8, 0xc8a050, 1.4); break;
        case 'CURSE': ringBurst(p.x, 0.25, p.z, 0xa855f7, 0.5, r * 1.2, 0.6, 1.8); for (let i = 0; i < 14; i++) FX.add.emit(p.x + (rnd() - 0.5) * r, 0.2, p.z + (rnd() - 0.5) * r, 0, 4 + rnd() * 3, 0, 0.8, 0.3, 0.05, 1.8, 0.4, 2.2, 0.9, CELL.STREAK, 0, 0, 0, 0, 0.1); break;
        case 'STOMP': dustPuff(p.x, p.z, 10, 1.6, 0xcdbd98, r * 0.8); chunks(p.x, 0.5, p.z, 12, 0x7a6a58, 0x4a4036, r, 0.3); DECALS.add(p.x, p.z, r * 1.1, r * 1.1, 3.5, 0.05, 0.04, 0.03, 0.4, CELL.CRACK); break;
        case 'PLAGUE': smokePuff(p.x, 0.6, p.z, 14, 0x7aa83a, 3, 1.4, 1.5, r * 0.6, 0.5); splat(p.x, p.z, r * 2, 0x6aa84f, 5, 0.6); break;
        case 'TERROR': flashStar(p.x, 1.4, p.z, 0xbdeaff, r * 1.2, 0.35); ringBurst(p.x, 1.2, p.z, 0x7dd3fc, 1, r * 1.2, 0.6, 2); break;
        case 'WALL': flashStar(p.x, 1.5, p.z, 0xf0abfc, 10, 0.35); chunks(p.x, 0.5, p.z, 22, 0xe879f9, 0x7e22ce, 9, 0.35); sparks(p.x, 1.5, p.z, 24, 0xf5d0fe, 12, 0.22, 0.5, 2); break;
        case 'WALL_BREAK': chunks(p.x, 1.2, p.z, 10, 0xe879f9, 0x7e22ce, 7, 0.3); sparks(p.x, 1.2, p.z, 10, 0xf5d0fe, 8, 0.2, 0.4, 2); break;
        case 'CALTROPS': sparks(p.x, 0.5, p.z, 22, 0xd1d5db, 6, 0.18, 0.5, 1.8); splat(p.x, p.z, r * 2, 0x9ca3af, 6, 0.5); break;
        case 'SMOKE': smokePuff(p.x, 0.8, p.z, 18, 0x8a8f96, 3, 1.6, 1.2, r * 0.7, 0.6); break;
        case 'PINCH': sparks(p.x, 0.9, p.z, 14, 0xef4444, 7, 0.22, 0.4, 2); break;
        case 'BOAR_KNOCKDOWN': dustPuff(p.x, p.z, 8, 1.2, 0xc9a97a, 2); sparks(p.x, 1, p.z, 10, 0xfde68a, 6, 0.2, 0.4, 2); break;
        case 'BOMBER_PATCH': splat(p.x, p.z, r * 1.8, 0x2a1a10, 5, 0.6); break;
        case 'ACID': splat(p.x, p.z, r * 2.2, 0x9be32a, 6, 0.8); smokePuff(p.x, 0.5, p.z, 8, 0xa8e03a, 2, 1, 1.4, r * 0.5, 0.4); break;
        case 'BOSS_CAST': ringBurst(p.x, 0.3, p.z, 0xffe9a0, 1, 9, 0.6, 2); glowPuff(p.x, 2, p.z, 0xffd070, 6, 0.5, 1.8, 0.8); break;
        case 'PRISON': dustPuff(p.x, p.z, 12, 2, 0xb08a5a, 8); chunks(p.x, 0.5, p.z, 24, 0x8a6a4a, 0x4a3a2a, 10, 0.4); break;
        case 'VEINS': for (let i = 0; i < 3; i++) ringBurst(p.x, 0.3, p.z, 0xff6a1a, 2, 14 + i * 8, 0.6, 1.8); break;
        case 'CHAINS': ringBurst(p.x, 0.5, p.z, 0xc084fc, 0.5, 3.5, 0.5, 2); sparks(p.x, 1.4, p.z, 14, 0xd8b4fe, 8, 0.2, 0.5, 2); break;
        case 'CHAINS_BREAK': sparks(p.x, 1.4, p.z, 22, 0xe9d5ff, 12, 0.22, 0.5, 2.4); ringBurst(p.x, 0.5, p.z, 0xffffff, 0.5, 4, 0.4, 2); break;
        case 'CHAINS_END': ringBurst(p.x, 0.5, p.z, 0x7c3aed, 0.5, 5, 0.6, 2); flashStar(p.x, 1.5, p.z, 0xc084fc, 6, 0.3); break;
        case 'CLONES': flashStar(p.x, 2, p.z, 0x7dd3fc, 10, 0.4); sparks(p.x, 2, p.z, 28, 0x93c5fd, 12, 0.24, 0.6, 2.2); ringBurst(p.x, 0.4, p.z, 0x38bdf8, 1, 9, 0.5, 2); break;
        case 'DECOY_POP': smokePuff(p.x, 1.5, p.z, 12, 0x5b21b6, 3, 1, 1.2, 2, 0.5); sparks(p.x, 2, p.z, 14, 0xc4b5fd, 9, 0.22, 0.4, 2); break;
        case 'RAISE': dustPuff(p.x, p.z, 14, 2, 0x6a7a3a, 8); chunks(p.x, 0.5, p.z, 28, 0x4a5a2a, 0x2a2a1a, 11, 0.35); smokePuff(p.x, 0.5, p.z, 12, 0x84cc16, 3, 1.2, 1.4, 7, 0.4); break;
        case 'PRISM': flashStar(p.x, 2.4, p.z, 0xf5d0fe, 9, 0.35); break;
        case 'STAMPEDE_DUST': dustPuff(p.x, p.z, 4, 1.4, 0xc9a97a, 2); FX.add.emit(p.x, 0.5, p.z, 0, 3, 0, 0.5, 0.8, 0.2, 2, 1.6, 0.8, 0.8, CELL.STREAK, 0, 0, 0, 0, 0.1); break;
        case 'SHELL_SPIN': ringBurst(p.x, 0.4, p.z, 0x9ad0ff, 1, 6, 0.5, 2); sparks(p.x, 1, p.z, 18, 0xbfe6ff, 10, 0.22, 0.4, 2); break;
        case 'ROOTS': dustPuff(p.x, p.z, 8, 1.4, 0x8a6a3a, Math.min(8, r)); chunks(p.x, 0.5, p.z, 10, 0x6b4423, 0x3a2410, 6, 0.28); sparks(p.x, 0.8, p.z, 8, 0x9be32a, 6, 0.2, 0.4, 2); break;
        case 'THORN_POP': sparks(p.x, 0.6, p.z, 14, 0x84cc16, 7, 0.22, 0.4, 2); dustPuff(p.x, p.z, 4, 1.0, 0x5a7a2a, 2); break;
        case 'FUSE': sparks(p.x, 1, p.z, 12, 0xbef264, 6, 0.22, 0.5, 2); glowPuff(p.x, 1.2, p.z, 0x84cc16, 3, 0.4, 1.6, 0.8); break;
        case 'BARK_BREAK': chunks(p.x, 2.5, p.z, 28, 0x9aa0aa, 0x5b3a1e, 11, 0.4); ringBurst(p.x, 0.4, p.z, 0xffd23a, 1, 9, 0.6, 2); break;
        case 'SPIT_CAST': sparks(p.x, 2, p.z, 10, 0x9be32a, 6, 0.24, 0.4, 2); break;
        case 'SUBMERGE': dustPuff(p.x, p.z, 10, 2, 0x4c6a3a, 6); ringBurst(p.x, 0.3, p.z, 0x6b8f5a, 1, 8, 0.6, 1.8); break;
        case 'SURFACE': dustPuff(p.x, p.z, 12, 2.4, 0x4c6a3a, r * 0.8); chunks(p.x, 0.6, p.z, 16, 0x4c8a3a, 0x2a4a2a, r, 0.34); break;
        case 'TAIL_SWEEP': dustPuff(p.x, p.z, 10, 1.6, 0xb8a888, r * 0.6); sparks(p.x, 1, p.z, 10, 0xffffff, 8, 0.2, 0.3, 2); break;
        case 'BREATH': flashStar(p.x, 2.4, p.z, 0xbfe8ff, 6, 0.3); break;
        case 'ICE_SPIKES': sparks(p.x, 1, p.z, 18, 0xbfe8ff, 9, 0.24, 0.45, 2); ringBurst(p.x, 0.3, p.z, 0x7dd3fc, 1, 6, 0.5, 1.8); break;
        case 'TAKEOFF': dustPuff(p.x, p.z, 10, 2.2, 0xdff3ff, 6); ringBurst(p.x, 0.4, p.z, 0xbfe8ff, 1, 10, 0.6, 1.8); break;
        case 'DIVE_CRASH': chunks(p.x, 0.8, p.z, 26, 0xbfe8ff, 0x3f86b8, r * 1.3, 0.4); dustPuff(p.x, p.z, 14, 2.4, 0xdff3ff, r); ringBurst(p.x, 0.3, p.z, 0xbfe8ff, 1, r * 1.8, 0.6, 2); break;
        case 'HAIL': sparks(p.x, 0.8, p.z, 10, 0xdff3ff, 7, 0.2, 0.35, 2); break;
        case 'CHILL': sparks(p.x, 1.4, p.z, 8, 0xbfe8ff, 5, 0.18, 0.4, 2); break;
        case 'FREEZE': flashStar(p.x, 1.4, p.z, 0xbfe8ff, 5, 0.35); ringBurst(p.x, 0.5, p.z, 0x7dd3fc, 1, 6, 0.6, 2); sparks(p.x, 1.4, p.z, 22, 0xe0f4ff, 9, 0.22, 0.6, 2); break;
        case 'PILLAR': sparks(p.x, 1, p.z, 22, 0xff9a30, 10, 0.26, 0.5, 2.2); ringBurst(p.x, 0.3, p.z, 0xff5a1a, 1, r * 1.8, 0.5, 2); glowPuff(p.x, 1.5, p.z, 0xff7a1a, r * 2.2, 0.4, 1.8, 0.8); break;
        case 'RIFT': ringBurst(p.x, 0.4, p.z, 0xc084fc, 1, 9, 0.6, 2); glowPuff(p.x, 2, p.z, 0xa855f7, 5, 0.4, 1.8, 0.8); break;
        case 'PORTAL_SHOT': sparks(p.x, 2.3, p.z, 10, 0xd8b4fe, 7, 0.22, 0.4, 2); break;
        case 'GRAVITY_PUSH': ringBurst(p.x, 0.4, p.z, 0xc084fc, 2, 22, 0.7, 2); flashStar(p.x, 2.5, p.z, 0xe9d5ff, 9, 0.35); break;
        case 'ECHO_SLAM': dustPuff(p.x, p.z, 10, 1.8, 0xa8a29e, r * 0.7); chunks(p.x, 0.6, p.z, 12, 0x9ca3af, 0x57534e, 7, 0.3); break;
        case 'ECHO_FIRE': flashStar(p.x, 2, p.z, 0xe9d5ff, 4, 0.3); break;
        case 'SHELL_BOUNCE': sparks(p.x, 1, p.z, 14, 0xffffff, 10, 0.2, 0.3, 2.4); break;
        default:
          if (e.kind.endsWith('_CAST')) { glowPuff(p.x, 1.6, p.z, 0xffe9a0, 2.4, 0.3, 1.6, 0.8); }
      }
    }));

    off.push(on('playerDebuff', (e) => {
      const pp = world.player.pos, hex = DEBUFF_COLOR[e.type] ?? 0xffffff;
      ringBurst(pp.x, 0.4, pp.z, hex, 0.5, 2.6, 0.45, 1.8);
      sparks(pp.x, 1.5, pp.z, 8, hex, 5, 0.18, 0.4, 2);
      if (e.type === 'STUN') for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; FX.add.emit(pp.x + Math.cos(a) * 0.7, 2.6, pp.z + Math.sin(a) * 0.7, 0, 0, 0, 0.9, 0.45, 0.2, 2.4, 2.0, 0.4, 0.95, CELL.STAR, 0, 0.5, 0, 2); }
    }));

    off.push(on('slam', (e) => {
      flashStar(e.pos.x, 1.2, e.pos.z, 0xffe0a0, 3.2, 0.2);
      chunks(e.pos.x, 0.8, e.pos.z, 8, 0x7a6a58, 0x4a4036, 6, 0.25);
      sparks(e.pos.x, 1, e.pos.z, 12, 0xffc070, 9, 0.22, 0.35, 2);
    }));
    off.push(on('stagger', (e) => {
      ringBurst(e.pos.x, 2, e.pos.z, 0xffd23a, 1, 7, 0.6, 2);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; FX.add.emit(e.pos.x + Math.cos(a) * 1.4, 3.4, e.pos.z + Math.sin(a) * 1.4, Math.cos(a) * 3, 2, Math.sin(a) * 3, 0.8, 0.6, 0.2, 2.4, 2.0, 0.3, 0.95, CELL.STAR, 0, 0.5, 0, 3); }
    }));
    off.push(on('armorBreak', (e) => {
      sparks(e.pos.x, 1.4, e.pos.z, 10, 0xbfd8ff, 6, 0.22, 0.45, 2);
      FX.add.emit(e.pos.x, 2.6, e.pos.z, 0, 1.2, 0, 0.8, 1.1, 1.3, 1.7, 1.9, 2.4, 0.95, CELL.SHARD, 0, 0.3, 0, 0);
    }));
    off.push(on('combo', (e) => {
      const p = world.player.pos;
      const hex = e.finisher ? 0xffd23a : e.stacks >= 3 ? 0xff8a3a : e.stacks === 2 ? 0xffc24a : 0xfff0b0;
      ringBurst(p.x, 0.3, p.z, hex, 0.8, 3 + e.stacks * 1.5 + (e.finisher ? 8 : 0), 0.5, 2);
      if (e.finisher) { flashStar(p.x, 2, p.z, 0xffe9a0, 14, 0.4); sparks(p.x, 1.4, p.z, 40, 0xffd23a, 14, 0.3, 0.6, 2.4); }
    }));
    off.push(on('ultRelease', (e) => {
      const p = e.pos;
      flashStar(p.x, 2, p.z, 0xffffff, 12, 0.3);
    }));
    return () => { for (const o of off) o(); };
  }, []);

  // ---- soul-chain tether + prism beam + lich-clone shimmer
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    if (dt <= 0) return;
    const pp = world.player.pos;
    if (tether.active) {
      tetherAcc += dt;
      if (tetherAcc > 0.05) { tetherAcc = 0; bolt(tether.lx, 2.2, tether.lz, pp.x, 1.2, pp.z, 0xc084fc, 0.45); }
      pushHalo(pp.x, 1.2, pp.z, 2.4, 1.6, 0.6, 2.4, 0.7, CELL.GLOW);
    }
    const z = prism.zone;
    if (z && z.active) {
      const fire = z.life < 0.2;
      for (let i = 0; i < (fire ? 6 : 2); i++) {
        if (!gate()) continue;
        const d = rnd() * z.length;
        FX.add.emit(z.pos.x + z.dir.x * d + (rnd() - 0.5), 0.6 + rnd() * 1.2, z.pos.z + z.dir.z * d + (rnd() - 0.5), 0, 1.2, 0, 0.5, fire ? 0.5 : 0.3, 0.05, fire ? 2.4 : 1.4, fire ? 0.8 : 0.4, fire ? 2.6 : 1.6, 0.9, CELL.GLOW);
      }
      if (fire) pushHalo(z.pos.x + z.dir.x * z.length * 0.5, 1, z.pos.z + z.dir.z * z.length * 0.5, z.length * 0.6, 1.0, 0.3, 1.2, 0.18, CELL.GLOW);
    }
  });

  // ---- ult wind-up: light streaks + particles gathering inward, glowing aura around the hero
  useFrame((_, dtRaw) => {
    const a = abilityState;
    if (a.windupT <= 0) return;
    const dt = Math.min(dtRaw, 0.05);
    const p = world.player.pos;
    const k = 1 - a.windupT / a.windupDur;
    const hero = useHeroColor();
    pushHalo(p.x, 1.3, p.z, 3 + k * 5, hero[0], hero[1], hero[2], 0.45 + 0.4 * k, CELL.GLOW);
    pushHalo(p.x, 1.2, p.z, 1.6 + k * 2, 2.4, 2.4, 2.4, 0.7, CELL.GLOW);
    if (dt <= 0) return;
    const n = Math.round(10 + 22 * k);
    for (let i = 0; i < n; i++) {
      if (!gate()) continue;
      const ang = rnd() * TAU, d = 9 + rnd() * 9 * (1 - k * 0.4);
      const x = p.x + Math.cos(ang) * d, z = p.z + Math.sin(ang) * d, y = 0.2 + rnd() * 5;
      const life = 0.5 + rnd() * 0.3, sp = d / life;
      FX.add.emit(x, y, z, -Math.cos(ang) * sp, (1.3 - y) / life, -Math.sin(ang) * sp, life, 0.35, 0.05, hero[0] * 1.5, hero[1] * 1.5, hero[2] * 1.5, 0.95, CELL.STREAK, 0, 0, 0, 0, 0.14);
    }
    if (rnd() < dt * 18) FX.add.emit(p.x, 0.2, p.z, 0, 8 + rnd() * 4, 0, 0.7, 0.9, 0.2, hero[0], hero[1], hero[2], 0.6, CELL.GLOW);
  });
  return null;
}

function useHeroColor(): [number, number, number] {
  const c = abilityState.flashRgb;
  return [c[0] * 1.8, c[1] * 1.4, c[2] * 1.0];
}

/** Temporary crystal wall segments raised by Crystal Golemites (Colliders live in engine/mapgen). */
import React, { useMemo } from 'react';
import { Color, DodecahedronGeometry, DynamicDrawUsage, InstancedMesh, MeshStandardMaterial, Object3D, OctahedronGeometry } from 'three';

export function CrystalWalls() {
  const sys = useMemo(() => {
    const mk = (g: any, m: any) => { const im = new InstancedMesh(g, m, 80); im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(DynamicDrawUsage); return im; };
    const crystal = mk(new OctahedronGeometry(1, 0), new MeshStandardMaterial({ color: new Color(0xe879f9), emissive: new Color(0x8a2be2), emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.3, transparent: true, opacity: 0.92 }));
    const rock = mk(new DodecahedronGeometry(1, 0), new MeshStandardMaterial({ color: new Color(0x8a7a66), roughness: 0.95, flatShading: true }));
    return { crystal, rock, o: new Object3D() };
  }, []);
  useFrame(() => {
    const { crystal, rock, o } = sys;
    let nc = 0, nr = 0;
    for (const w of world.walls) {
      if (!w.active) continue;
      const rise = Math.min(1, w.t / 0.25), fade = Math.min(1, (w.life - w.t) / 0.5);
      const h = (w.rock ? 3.0 : 3.4) * rise * (0.6 + 0.4 * fade);
      const im = w.rock ? rock : crystal;
      const n = w.rock ? nr : nc;
      o.position.set(w.x, h * 0.5, w.z); o.rotation.set(0, w.rot, 0); o.scale.set(w.r * 0.95, h * 0.5, w.r * 0.95); o.updateMatrix(); im.setMatrixAt(n, o.matrix);
      o.position.set(w.x + Math.cos(w.rot) * 0.6, h * 0.3, w.z + Math.sin(w.rot) * 0.6); o.rotation.set(0.25, w.rot + 1, 0.2); o.scale.set(w.r * 0.55, h * 0.3, w.r * 0.55); o.updateMatrix(); im.setMatrixAt(n + 1, o.matrix);
      if (w.rock) nr += 2; else nc += 2;
    }
    crystal.count = nc; rock.count = nr; crystal.instanceMatrix.needsUpdate = true; rock.instanceMatrix.needsUpdate = true;
  });
  return <><primitive object={sys.crystal} /><primitive object={sys.rock} /></>;
}
