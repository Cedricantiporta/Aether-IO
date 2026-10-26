// The necromancer's skeleton look (warrior / mage / bowman), shared by render/Minions.tsx (the hero's summons) and render/enemyModels.ts
// (hostile skeletons use the very same models). Pure geometry: jointed part geometries relative to each part's pivot, plus the pivots.
import type { BufferGeometry } from 'three';
import { GB } from './util';

// dark purple bone with soul-fire glowing parts (eyes, heart core, staff orb, golem runes); glow parts are built into a
// second geometry per part (glowOf) drawn with an unlit, non-tone-mapped violet so they read as light
export const BONE = '#5e4c78', BONE2 = '#43365c';
export const glowOf = new WeakMap<BufferGeometry, BufferGeometry>();
export type V3 = [number, number, number];
export const sub = (p: V3, o: V3): V3 => [p[0] - o[0], p[1] - o[1], p[2] - o[2]];

/** One rig's part geometries (positions relative to each part's pivot) and the pivots. */
export interface RigDef { hips: V3; head: V3; armL: V3; armR: V3; legL: V3; legR: V3; geo: Record<'torso' | 'head' | 'armL' | 'armR' | 'legL' | 'legR', BufferGeometry> }

export function skeletonDef(v: 'W' | 'M' | 'A'): RigDef {
  const mage = v === 'M', bow = v === 'A';
  const hips: V3 = [0, 0.8, 0], head: V3 = [0, 1.45, 0], armL: V3 = [-0.28, 1.4, 0], armR: V3 = [0.28, 1.4, 0], legL: V3 = [-0.1, 0.8, 0], legR: V3 = [0.1, 0.8, 0];
  const mk = (o: V3, f: (g: GB, at: (p: V3) => V3, gl: GB) => void) => { const g = new GB([0.85, 1.1]), gl = new GB([1, 1]); f(g, (p) => sub(p, o), gl); const geo = g.build(); if (gl.parts.length) glowOf.set(geo, gl.build()); return geo; };
  return {
    hips, head, armL, armR, legL, legR,
    geo: {
      torso: mk(hips, (g, at, gl) => {
        g.cyl(0.04, 0.045, 0.6, 5, at([0, 1.1, 0]), BONE2);                                   // spine
        for (let i = 0; i < 4; i++) g.torus(0.18 - i * 0.012, 0.02, at([0, 1.3 - i * 0.12, 0]), BONE, [Math.PI / 2, 0, 0], [1, 0.75, 1], 8);
        g.box(0.52, 0.06, 0.09, at([0, 1.42, 0]), BONE); g.box(0.32, 0.1, 0.18, at([0, 0.8, 0]), BONE2);
        gl.sph(0.09, at([0, 1.18, 0.02]), '#ffffff', 1, 6);                                  // soul-fire heart in the ribcage
        if (mage) g.cyl(0.25, 0.38, 0.75, 8, at([0, 1.0, 0]), '#3a2050');                    // robe
        if (bow) { g.cyl(0.08, 0.07, 0.6, 6, at([0.12, 1.25, -0.2]), '#5a3a2a', [0.3, 0, -0.35]); for (let i = 0; i < 3; i++) g.box(0.02, 0.18, 0.02, at([0.2 + i * 0.03, 1.6, -0.27 + i * 0.02]), '#d8d0b8', [0.3, 0, -0.35]); }   // quiver
      }),
      head: mk(head, (g, at, gl) => {
        g.sph(0.22, at([0, 1.64, 0]), BONE, [1, 1.05, 1.05], 8);                              // skull
        g.box(0.2, 0.06, 0.14, at([0, 1.47, 0.08]), BONE2);                                   // jaw
        for (const s of [-1, 1]) gl.sph(0.055, at([s * 0.08, 1.66, 0.19]), '#ffffff', 1, 5);  // glowing eyes
        if (mage) g.cone(0.32, 0.55, 8, at([0, 1.87, -0.03]), '#4a2a6a');                    // hood
        else if (bow) g.cone(0.27, 0.3, 7, at([0, 1.86, -0.02]), '#3e4a32');                // ragged green hood
        else g.cone(0.2, 0.28, 6, at([0, 1.9, 0]), '#7a7f88');                                // rusty helm spike
      }),
      armL: mk(armL, (g, at) => {
        g.sph(0.06, at([-0.28, 1.4, 0]), BONE, 1, 5);
        g.cyl(0.035, 0.03, 0.55, 5, at([-0.3, 1.13, 0]), BONE2);
        if (bow) {   // bow in the left fist: limbs along local z (stand upright when the arm aims forward), string toward the body
          const G: V3 = [-0.3, 0.78, 0];
          g.box(0.05, 0.05, 0.52, at([G[0], G[1] + 0.06, 0.24]), '#6a4a2a', [-0.25, 0, 0]);
          g.box(0.05, 0.05, 0.52, at([G[0], G[1] + 0.06, -0.24]), '#6a4a2a', [0.25, 0, 0]);
          g.box(0.012, 0.012, 0.98, at([G[0], G[1] + 0.13, 0]), '#e8e0c8');
        } else if (!mage) g.cyl(0.28, 0.28, 0.06, 10, at([-0.36, 0.95, 0.08]), '#6a5040', [0, 0, Math.PI / 2]);   // round shield
      }),
      armR: mk(armR, (g, at, gl) => {
        g.sph(0.06, at([0.28, 1.4, 0]), BONE, 1, 5);
        g.cyl(0.035, 0.03, 0.55, 5, at([0.3, 1.13, 0]), BONE2);
        if (bow) gl.box(0.015, 0.015, 0.6, at([0.3, 0.84, 0.2]), '#ffffff');               // nocked arrow (soul-lit)
        else if (mage) { g.cyl(0.03, 0.03, 1.5, 5, at([0.32, 1.05, 0.06]), '#5a3a2a'); gl.sph(0.12, at([0.32, 1.82, 0.06]), '#ffffff', 1, 6); }   // staff (glowing orb)
        else { g.box(0.08, 0.85, 0.02, at([0.32, 0.5, 0.0]), '#3a3048'); gl.box(0.02, 0.8, 0.03, at([0.32, 0.48, 0.0]), '#ffffff'); g.box(0.26, 0.05, 0.06, at([0.32, 0.9, 0]), '#5a4a3a'); }      // sword (points down, swings up)
      }),
      legL: mk(legL, (g, at) => { g.cyl(0.04, 0.035, 0.75, 5, at([-0.1, 0.42, 0]), BONE2); g.box(0.1, 0.05, 0.18, at([-0.1, 0.04, 0.05]), BONE); }),
      legR: mk(legR, (g, at) => { g.cyl(0.04, 0.035, 0.75, 5, at([0.1, 0.42, 0]), BONE2); g.box(0.1, 0.05, 0.18, at([0.1, 0.04, 0.05]), BONE); }),
    },
  };
}
