// Dark Legion (Necromancer's Mythic staff, weaponPerks.ts DARK_LEGION): the DARK KNIGHT (replaces skeleton warriors) and the DARK DRAGON (replaces the Bone Golem).
// Same jointed RigDef as the skeletons (render/skeletonRig.ts) so render/Minions.tsx poses them with the same walk / swing code; glow parts (violet visor, eyes,
// runes, wing edges) go in the second geometry (glowOf). Rounded, toy-like shapes in near-black plum with soft violet light: dark, but still cute.
import { GB } from './util';
import { glowOf, sub, type V3, type RigDef } from './skeletonRig';
import type { BufferGeometry } from 'three';

const PLATE = '#2a2142', PLATE2 = '#1d1630', TRIM = '#6a3fb0', PURPLE = '#8a4cff';
type Fn = (g: GB, at: (p: V3) => V3, gl: GB) => void;
const maker = (shade: [number, number]) => (o: V3, f: Fn): BufferGeometry => {
  const g = new GB(shade), gl = new GB([1, 1]); f(g, (p) => sub(p, o), gl);
  const geo = g.build(); if (gl.parts.length) glowOf.set(geo, gl.build()); return geo;
};

/** Dark Knight: chunky near-black armour, big round pauldrons, plumed helm with a glowing visor slit, kite shield and a glowing blade. */
export function darkKnightDef(): RigDef {
  const hips: V3 = [0, 0.8, 0], head: V3 = [0, 1.45, 0], armL: V3 = [-0.3, 1.4, 0], armR: V3 = [0.3, 1.4, 0], legL: V3 = [-0.12, 0.8, 0], legR: V3 = [0.12, 0.8, 0];
  const mk = maker([0.85, 1.1]);
  const leg = (s: number, o: V3) => mk(o, (g, at) => { g.cyl(0.085, 0.07, 0.62, 7, at([s * 0.12, 0.45, 0]), PLATE); g.sph(0.095, at([s * 0.12, 0.72, 0.02]), TRIM, 1, 6); g.box(0.15, 0.09, 0.26, at([s * 0.12, 0.05, 0.05]), PLATE2); });
  return {
    hips, head, armL, armR, legL, legR,
    geo: {
      torso: mk(hips, (g, at, gl) => {
        g.sph(0.31, at([0, 1.1, 0]), PLATE, [1.1, 1.1, 0.88], 9);                              // breastplate
        g.cyl(0.27, 0.33, 0.3, 9, at([0, 0.78, 0]), PLATE2);                                   // skirt
        g.cyl(0.3, 0.3, 0.06, 9, at([0, 0.9, 0]), TRIM);                                       // belt
        gl.sph(0.075, at([0, 1.12, 0.26]), '#ffffff', [1, 1, 0.5], 6);                         // soul gem
        g.sph(0.22, at([0, 1.2, -0.17]), PLATE2, [1, 1.2, 0.6], 7);                            // back plate
      }),
      head: mk(head, (g, at, gl) => {
        g.sph(0.25, at([0, 1.64, 0]), PLATE, [1, 1.05, 1.05], 9);                              // great helm
        gl.box(0.24, 0.05, 0.05, at([0, 1.65, 0.23]), '#ffffff');                              // glowing visor slit
        for (const s of [-1, 1]) g.cone(0.06, 0.26, 6, at([s * 0.2, 1.84, -0.02]), TRIM, [0, 0, -s * 0.7]);   // little horns
        g.cone(0.07, 0.42, 6, at([0, 1.92, -0.14]), PURPLE, [-0.8, 0, 0]);                      // plume
      }),
      armL: mk(armL, (g, at, gl) => {
        g.sph(0.15, at([-0.3, 1.4, 0]), PLATE, [1.1, 0.8, 1], 8);                              // pauldron
        g.cyl(0.055, 0.05, 0.5, 6, at([-0.32, 1.14, 0]), PLATE2);
        g.sph(0.07, at([-0.33, 0.88, 0.02]), PLATE, 1, 6);
        g.cyl(0.3, 0.3, 0.07, 10, at([-0.4, 0.96, 0.08]), PLATE2, [0, 0, Math.PI / 2], [1, 1.2, 1]);   // round shield
        g.cyl(0.31, 0.31, 0.04, 10, at([-0.435, 0.96, 0.08]), TRIM, [0, 0, Math.PI / 2], [0.6, 0.75, 0.6]);
        gl.sph(0.07, at([-0.46, 0.96, 0.08]), '#ffffff', [0.5, 1, 1], 6);
      }),
      armR: mk(armR, (g, at, gl) => {
        g.sph(0.15, at([0.3, 1.4, 0]), PLATE, [1.1, 0.8, 1], 8);
        g.cyl(0.055, 0.05, 0.5, 6, at([0.32, 1.14, 0]), PLATE2);
        g.sph(0.07, at([0.33, 0.88, 0.02]), PLATE, 1, 6);
        g.box(0.11, 0.95, 0.035, at([0.34, 0.48, 0]), '#3a2f5c'); gl.box(0.03, 0.9, 0.05, at([0.34, 0.47, 0]), '#ffffff');   // blade (points down, swings up)
        g.box(0.3, 0.06, 0.07, at([0.34, 0.95, 0]), TRIM); g.cyl(0.03, 0.03, 0.18, 5, at([0.34, 1.05, 0]), PLATE2);
      }),
      legL: leg(-1, legL), legR: leg(1, legR),
    },
  };
}

/** Dark Dragon: a chubby plum-black dragon (long tail, round head with glowing eyes and small horns, big membrane wings on the arm joints so they can flap,
 *  tucked feet). Faces +z; Minions.tsx hovers it, flaps the wings (arm z rotation), bites (head x) and opens the mouth for the breath (head up). */
export function darkDragonDef(): RigDef {
  const hips: V3 = [0, 1.0, 0], head: V3 = [0, 1.45, 0.95], armL: V3 = [-0.5, 1.5, 0.15], armR: V3 = [0.5, 1.5, 0.15], legL: V3 = [-0.32, 0.8, 0.45], legR: V3 = [0.32, 0.8, 0.45];
  const mk = maker([0.85, 1.1]);
  const wing = (s: number, o: V3) => mk(o, (g, at, gl) => {
    g.cyl(0.07, 0.05, 1.7, 6, at([s * 1.35, 1.55, 0.1]), PLATE, [0, 0, Math.PI / 2]);              // arm bone
    g.sph(0.1, at([s * 0.5, 1.5, 0.15]), TRIM, 1, 6);
    for (let i = 0; i < 3; i++) {   // membrane panels, spreading toward the tip, with finger bones
      const x = s * (0.95 + i * 0.55), w = 0.62 - i * 0.1;
      g.box(w, 0.04, 1.05 - i * 0.2, at([x, 1.5, -0.35 - i * 0.05]), i === 1 ? '#53358a' : '#46307a');
      g.cyl(0.03, 0.02, 1.0 - i * 0.18, 5, at([x + s * w * 0.45, 1.5, -0.4]), PLATE, [Math.PI / 2, 0, 0]);
    }
    gl.box(0.1, 0.05, 0.1, at([s * 2.25, 1.55, 0.1]), '#ffffff');                                  // glowing wing tip
  });
  const foot = (s: number, o: V3) => mk(o, (g, at) => {   // short tucked leg with three pale claws
    g.sph(0.17, at([s * 0.32, 0.6, 0.45]), PLATE, [1, 1.3, 1], 7);
    for (let k = -1; k <= 1; k++) g.cone(0.04, 0.13, 4, at([s * 0.32 + k * 0.07, 0.4, 0.58]), '#d8c8ff', [Math.PI / 2, 0, 0]);
  });
  return {
    hips, head, armL, armR, legL, legR,
    geo: {
      torso: mk(hips, (g, at, gl) => {
        g.sph(0.72, at([0, 1.15, 0]), PLATE, [0.9, 0.85, 1.4], 10);                              // chubby body
        g.sph(0.55, at([0, 0.95, 0.15]), '#5a3f86', [0.9, 0.7, 1.3], 9);                         // lighter belly
        for (let i = 0; i < 5; i++) { g.cone(0.13 - i * 0.012, 0.36 - i * 0.03, 5, at([0, 1.78 - i * 0.04, 0.7 - i * 0.38]), PURPLE, [-0.2, 0, 0]); }   // back spikes
        const tail: [number, number, number][] = [[1.05, 0.4, -1.05], [0.98, 0.32, -1.55], [0.9, 0.25, -2.0], [0.86, 0.18, -2.4]];
        for (const [y, r, z] of tail) g.sph(r, at([0, y, z]), PLATE, [0.9, 0.85, 1.2], 7);       // tail
        gl.cone(0.16, 0.45, 5, at([0, 0.86, -2.8]), '#ffffff', [-Math.PI / 2, 0, 0]);             // glowing tail tip
        gl.sph(0.14, at([0, 1.05, 0.55]), '#ffffff', [1, 1, 0.5], 6);                             // soul core in the chest
      }),
      head: mk(head, (g, at, gl) => {
        g.cyl(0.2, 0.3, 0.55, 8, at([0, 1.55, 0.7]), PLATE, [0.7, 0, 0]);                         // neck
        g.sph(0.44, at([0, 1.72, 1.3]), PLATE, [1, 0.9, 1.15], 10);                               // round head
        g.sph(0.28, at([0, 1.6, 1.78]), '#3a2b5c', [1, 0.75, 1.2], 8);                            // snout
        for (const s of [-1, 1]) {
          gl.sph(0.1, at([s * 0.23, 1.86, 1.55]), '#ffffff', 1, 6);                              // glowing eyes
          g.cone(0.09, 0.4, 6, at([s * 0.27, 2.12, 1.1]), TRIM, [-0.7, 0, -s * 0.3]);             // horns
          g.sph(0.045, at([s * 0.1, 1.68, 2.02]), PLATE2, 1, 5);                                  // nostrils
          for (let i = 0; i < 2; i++) g.cone(0.025, 0.1, 4, at([s * (0.08 + i * 0.1), 1.5, 1.98 - i * 0.12]), '#e8e0ff', [Math.PI, 0, 0]);   // tiny fangs
        }
        gl.sph(0.07, at([0, 1.52, 2.0]), '#ffffff', [1.5, 0.5, 0.8], 5);                         // ember in the mouth
      }),
      armL: wing(-1, armL), armR: wing(1, armR),
      legL: foot(-1, legL), legR: foot(1, legR),
    },
  };
}
