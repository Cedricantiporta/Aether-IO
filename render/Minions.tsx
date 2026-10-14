// Necromancer minions (engine/systems/minions.ts): skeleton warriors, skeleton mages, skeleton bowmen and the bone golem. A small fixed
// pool of rigs (one per world.minions slot), each built from jointed parts (hips, head, arms, legs) so they can walk,
// swing, cast, flinch and claw out of the ground; poses are written in useFrame. A thin HP bar shows once hurt.
import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, type Material } from 'three';
import { world } from '../engine/world';
import { GB, litMat } from './util';
import { CELL, pushHalo } from './fx';

const BONE = '#ebe5d0', BONE2 = '#c9c2a8';
type V3 = [number, number, number];
const sub = (p: V3, o: V3): V3 => [p[0] - o[0], p[1] - o[1], p[2] - o[2]];

/** One rig's part geometries (positions relative to each part's pivot) and the pivots. */
interface RigDef { hips: V3; head: V3; armL: V3; armR: V3; legL: V3; legR: V3; geo: Record<'torso' | 'head' | 'armL' | 'armR' | 'legL' | 'legR', BufferGeometry> }

function skeletonDef(v: 'W' | 'M' | 'A'): RigDef {
  const mage = v === 'M', bow = v === 'A';
  const hips: V3 = [0, 0.8, 0], head: V3 = [0, 1.45, 0], armL: V3 = [-0.28, 1.4, 0], armR: V3 = [0.28, 1.4, 0], legL: V3 = [-0.1, 0.8, 0], legR: V3 = [0.1, 0.8, 0];
  const mk = (o: V3, f: (g: GB, at: (p: V3) => V3) => void) => { const g = new GB([0.85, 1.1]); f(g, (p) => sub(p, o)); return g.build(); };
  return {
    hips, head, armL, armR, legL, legR,
    geo: {
      torso: mk(hips, (g, at) => {
        g.cyl(0.04, 0.045, 0.6, 5, at([0, 1.1, 0]), BONE2);                                   // spine
        for (let i = 0; i < 4; i++) g.torus(0.18 - i * 0.012, 0.02, at([0, 1.3 - i * 0.12, 0]), BONE, [Math.PI / 2, 0, 0], [1, 0.75, 1], 8);
        g.box(0.52, 0.06, 0.09, at([0, 1.42, 0]), BONE); g.box(0.32, 0.1, 0.18, at([0, 0.8, 0]), BONE2);
        if (mage) g.cyl(0.25, 0.38, 0.75, 8, at([0, 1.0, 0]), '#3a2050');                    // robe
        if (bow) { g.cyl(0.08, 0.07, 0.6, 6, at([0.12, 1.25, -0.2]), '#5a3a2a', [0.3, 0, -0.35]); for (let i = 0; i < 3; i++) g.box(0.02, 0.18, 0.02, at([0.2 + i * 0.03, 1.6, -0.27 + i * 0.02]), '#d8d0b8', [0.3, 0, -0.35]); }   // quiver
      }),
      head: mk(head, (g, at) => {
        g.sph(0.22, at([0, 1.64, 0]), BONE, [1, 1.05, 1.05], 8);                              // skull
        g.box(0.2, 0.06, 0.14, at([0, 1.47, 0.08]), BONE2);                                   // jaw
        for (const s of [-1, 1]) g.sph(0.06, at([s * 0.08, 1.66, 0.18]), '#1a1020', 1, 5);    // sockets
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
      armR: mk(armR, (g, at) => {
        g.sph(0.06, at([0.28, 1.4, 0]), BONE, 1, 5);
        g.cyl(0.035, 0.03, 0.55, 5, at([0.3, 1.13, 0]), BONE2);
        if (bow) g.box(0.015, 0.015, 0.6, at([0.3, 0.84, 0.2]), '#d8d0b8');                // nocked arrow
        else if (mage) { g.cyl(0.03, 0.03, 1.5, 5, at([0.32, 1.05, 0.06]), '#5a3a2a'); g.sph(0.12, at([0.32, 1.82, 0.06]), '#b08aff', 1, 6); }   // staff
        else { g.box(0.08, 0.85, 0.02, at([0.32, 0.5, 0.0]), '#9aa0aa'); g.box(0.26, 0.05, 0.06, at([0.32, 0.9, 0]), '#5a4a3a'); }      // sword (points down, swings up)
      }),
      legL: mk(legL, (g, at) => { g.cyl(0.04, 0.035, 0.75, 5, at([-0.1, 0.42, 0]), BONE2); g.box(0.1, 0.05, 0.18, at([-0.1, 0.04, 0.05]), BONE); }),
      legR: mk(legR, (g, at) => { g.cyl(0.04, 0.035, 0.75, 5, at([0.1, 0.42, 0]), BONE2); g.box(0.1, 0.05, 0.18, at([0.1, 0.04, 0.05]), BONE); }),
    },
  };
}
function golemDef(): RigDef {
  const hips: V3 = [0, 1.0, 0], head: V3 = [0, 2.25, 0.3], armL: V3 = [-1.15, 1.8, 0.1], armR: V3 = [1.15, 1.8, 0.1], legL: V3 = [-0.45, 0.9, 0], legR: V3 = [0.45, 0.9, 0];
  const mk = (o: V3, f: (g: GB, at: (p: V3) => V3) => void) => { const g = new GB([0.85, 1.1]); f(g, (p) => sub(p, o)); return g.build(); };
  const arm = (s: number, o: V3) => mk(o, (g, at) => { g.sph(0.42, at([s * 1.15, 1.75, 0.1]), '#a8a088', 1, 6); g.cyl(0.3, 0.38, 1.3, 6, at([s * 1.25, 1.0, 0.2]), BONE2); g.sph(0.42, at([s * 1.3, 0.32, 0.3]), '#a8a088', 1, 6); });
  const leg = (s: number, o: V3) => mk(o, (g, at) => { g.cyl(0.32, 0.36, 0.9, 6, at([s * 0.45, 0.45, 0]), BONE2); g.sph(0.36, at([s * 0.45, 0.08, 0.1]), '#a8a088', [1, 0.5, 1.2], 6); });
  return {
    hips, head, armL, armR, legL, legR,
    geo: {
      torso: mk(hips, (g, at) => {
        g.sph(0.9, at([0, 1.6, 0]), '#bdb59c', [1.2, 1, 0.9], 7);                            // bone-plated torso
        for (let i = 0; i < 5; i++) g.cone(0.14, 0.6, 4, at([-0.8 + i * 0.4, 2.4, -0.2]), BONE, [-0.4, 0, 0]);   // spine spikes
        g.box(0.9, 0.35, 0.6, at([0, 0.9, 0]), BONE2);
      }),
      head: mk(head, (g, at) => { g.sph(0.4, at([0, 2.45, 0.35]), BONE, 1, 7); for (const s of [-1, 1]) g.sph(0.08, at([s * 0.15, 2.5, 0.68]), '#9a6bff', 1, 5); }),
      armL: arm(-1, armL), armR: arm(1, armR), legL: leg(-1, legL), legR: leg(1, legR),
    },
  };
}

interface Rig { root: Group; hips: Group; head: Group; armL: Group; armR: Group; legL: Group; legR: Group }
interface Slot { outer: Group; body: Group; rigs: Rig[]; bar: Group; fill: Mesh }

function buildRig(d: RigDef, mat: Material): Rig {
  const root = new Group();
  const piv = (p: V3, parent: Group, at: V3 = [0, 0, 0]) => { const g = new Group(); g.position.set(p[0] - at[0], p[1] - at[1], p[2] - at[2]); parent.add(g); return g; };
  const mesh = (geo: BufferGeometry, g: Group) => { const m = new Mesh(geo, mat); m.castShadow = true; g.add(m); };
  const hips = piv(d.hips, root);
  mesh(d.geo.torso, hips);
  const head = piv(d.head, hips, d.hips), armL = piv(d.armL, hips, d.hips), armR = piv(d.armR, hips, d.hips);
  const legL = piv(d.legL, root), legR = piv(d.legR, root);
  mesh(d.geo.head, head); mesh(d.geo.armL, armL); mesh(d.geo.armR, armR); mesh(d.geo.legL, legL); mesh(d.geo.legR, legR);
  return { root, hips, head, armL, armR, legL, legR };
}

const SCALE = [1.3, 1.3, 1.9, 1.3];   // warrior, mage, golem, bowman
const BAR_Y = [2.75, 3.0, 5.8, 2.85];

export function Minions() {
  const N = world.minions.length;
  const slots = useMemo<Slot[]>(() => {
    const mat = litMat({ roughness: 0.8 });
    const defs = [skeletonDef('W'), skeletonDef('M'), golemDef(), skeletonDef('A')];
    const barBg = new MeshBasicMaterial({ color: 0x140c1c, transparent: true, opacity: 0.8, depthTest: false, side: DoubleSide });
    const barFg = new MeshBasicMaterial({ color: 0xb48cff, depthTest: false, side: DoubleSide });
    const plane = new PlaneGeometry(1, 1);
    return Array.from({ length: N }, () => {
      const outer = new Group(), body = new Group();
      outer.visible = false; outer.add(body);
      const rigs = defs.map((d) => { const r = buildRig(d, mat); body.add(r.root); return r; });
      const bar = new Group(); outer.add(bar);
      const bg = new Mesh(plane, barBg); bg.scale.set(1.04, 0.15, 1); bg.renderOrder = 10; bar.add(bg);
      const fill = new Mesh(plane, barFg); fill.scale.set(1, 0.1, 1); fill.position.z = 0.001; fill.renderOrder = 11; bar.add(fill);
      return { outer, body, rigs, bar, fill };
    });
  }, [N]);

  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < N; i++) {
      const S = slots[i], m = world.minions[i];
      S.outer.visible = m.active;
      if (!m.active) continue;
      const k = m.kind;
      for (let r = 0; r < S.rigs.length; r++) S.rigs[r].root.visible = r === k;
      const R = S.rigs[k], golem = k === 2, mage = k === 1, bow = k === 3;
      const rise = m.rise > 0 ? Math.min(1, m.rise / 0.6) : 0;   // climbing out of the ground
      const mv = m.mv, w = m.walk, sw = Math.sin(w);
      const hurt = m.hitT > 0 ? m.hitT / 0.25 : 0;
      S.outer.position.set(m.x + (hurt > 0 ? Math.sin(t * 60) * 0.05 * hurt : 0), -rise * 1.8, m.z);
      S.body.rotation.set(0, m.facing + (m.spin > 0 ? (1 - m.spin) * Math.PI * 2 : 0), 0);   // cleave: one full spin
      const fade = m.life < 1 ? m.life : 1;
      S.body.scale.setScalar(fade * SCALE[k]);

      // walk cycle + idle breathing
      const idle = 1 - mv, breathe = Math.sin(t * 2.2 + i) * 0.02 * idle;
      R.hips.position.y = (golem ? 1.0 : 0.8) + Math.abs(Math.cos(w)) * (golem ? 0.08 : 0.06) * mv + breathe;
      R.hips.rotation.set(0.08 * mv - hurt * 0.3, sw * 0.12 * mv, sw * 0.05 * mv);
      R.legL.rotation.x = sw * 0.75 * mv; R.legR.rotation.x = -sw * 0.75 * mv;
      R.head.rotation.set(Math.sin(t * 1.3 + i) * 0.08 * idle, Math.sin(t * 0.9 + i * 2) * 0.35 * idle, Math.sin(t * 1.7 + i) * 0.1);
      let aL = -sw * 0.55 * mv + Math.sin(t * 2.2 + i) * 0.06 * idle, aR = sw * 0.55 * mv - Math.sin(t * 2.2 + i) * 0.06 * idle;
      let zL = golem ? 0.15 : 0.08, zR = -zL;

      // attack (m.swing runs 1 -> 0): raise, strike, recover
      if (m.swing > 0) {
        const u = 1 - m.swing;
        const up = u < 0.3 ? u / 0.3 : 0, strike = u >= 0.3 && u < 0.55 ? (u - 0.3) / 0.25 : u >= 0.55 ? 1 - (u - 0.55) / 0.45 : 0;
        if (bow) {    // raise the bow, draw back, loose
          const hold = u < 0.75 ? Math.min(1, u / 0.2) : (1 - u) / 0.25;
          aL = -1.5 * hold; zL = 0.1; aR = -1.45 * hold; zR = -0.25 * hold - 0.2 * Math.min(1, u / 0.5) * hold;
          R.hips.rotation.y += -0.5 * hold;
        } else if (mage) {   // staff thrust forward, head back
          aR = -1.5 * Math.min(1, u / 0.25) * (u < 0.7 ? 1 : (1 - u) / 0.3); R.head.rotation.x -= 0.25 * m.swing;
        } else if (golem) {   // both fists overhead, then slam
          const a = u < 0.4 ? -2.8 * (u / 0.4) : -2.8 + 2.6 * Math.min(1, (u - 0.4) / 0.2);
          aL = aR = a; zL = 0.15 + 0.2 * up; zR = -zL;
          R.hips.rotation.x += u < 0.4 ? -0.2 * (u / 0.4) : 0.35 * (1 - Math.min(1, (u - 0.4) / 0.6));
        } else {      // sword overhead, slash down across; shield up
          aR = up > 0 ? -2.7 * up : -2.7 + 2.3 * Math.min(1, strike * 2);
          if (u >= 0.55) aR *= 1 - (u - 0.55) / 0.45;
          aL = -0.9; zL = 0.35;
          R.hips.rotation.y += (up - strike) * 0.35;
        }
      }
      if (m.spin > 0) { aR = -1.6; zR = -1.2 * m.spin - 0.3; aL = -0.6; zL = 0.9; }   // cleave: sword arm swept out to the side
      if (rise > 0) { aL = aR = -2.9 * rise; zL = 0.3 * rise; zR = -zL; R.head.rotation.x = 0.4 * rise; }   // clawing up
      R.armL.rotation.set(aL, 0, zL); R.armR.rotation.set(aR, 0, zR);

      // HP bar once hurt, always facing the camera
      const frac = m.maxHp > 0 ? Math.max(0, m.hp / m.maxHp) : 1;
      S.bar.visible = frac < 0.999 && rise <= 0;
      if (S.bar.visible) {
        S.bar.position.y = BAR_Y[k] * fade;
        S.bar.quaternion.copy(camera.quaternion);
        S.bar.scale.setScalar(golem ? 1.5 : 1);
        S.fill.scale.x = frac; S.fill.position.x = -(1 - frac) / 2;
      }
      if ((k !== 1 && k !== 3) || (i + Math.floor(t * 4)) % 2 === 0) pushHalo(m.x, golem ? 2.6 : 1.8, m.z, golem ? 2.4 : 1.3, 1.0, 0.5, 2.0, 0.22, CELL.GLOW);   // violet necromantic glow
    }
  });
  return <>{slots.map((s, i) => <primitive key={i} object={s.outer} />)}</>;
}
