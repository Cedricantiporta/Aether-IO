// Necromancer minions (engine/systems/minions.ts): skeleton warriors, skeleton mages, skeleton bowmen and the bone golem. A small fixed
// pool of rigs (one per world.minions slot), each built from jointed parts (hips, head, arms, legs) so they can walk,
// swing, cast, flinch and claw out of the ground; poses are written in useFrame. A thin HP bar shows once hurt.
import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferGeometry, DoubleSide, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, PlaneGeometry, type Material } from 'three';
import { world } from '../engine/world';
import { GB, litMat } from './util';
import { CELL, pushHalo } from './fx';

import { BONE, BONE2, glowOf, sub, skeletonDef, type V3, type RigDef } from './skeletonRig';

function golemDef(): RigDef {
  const hips: V3 = [0, 1.0, 0], head: V3 = [0, 2.25, 0.3], armL: V3 = [-1.15, 1.8, 0.1], armR: V3 = [1.15, 1.8, 0.1], legL: V3 = [-0.45, 0.9, 0], legR: V3 = [0.45, 0.9, 0];
  const mk = (o: V3, f: (g: GB, at: (p: V3) => V3, gl: GB) => void) => { const g = new GB([0.85, 1.1]), gl = new GB([1, 1]); f(g, (p) => sub(p, o), gl); const geo = g.build(); if (gl.parts.length) glowOf.set(geo, gl.build()); return geo; };
  const arm = (s: number, o: V3) => mk(o, (g, at) => { g.sph(0.42, at([s * 1.15, 1.75, 0.1]), '#4e3f66', 1, 6); g.cyl(0.3, 0.38, 1.3, 6, at([s * 1.25, 1.0, 0.2]), BONE2); g.sph(0.42, at([s * 1.3, 0.32, 0.3]), '#4e3f66', 1, 6); });
  const leg = (s: number, o: V3) => mk(o, (g, at) => { g.cyl(0.32, 0.36, 0.9, 6, at([s * 0.45, 0.45, 0]), BONE2); g.sph(0.36, at([s * 0.45, 0.08, 0.1]), '#4e3f66', [1, 0.5, 1.2], 6); });
  return {
    hips, head, armL, armR, legL, legR,
    geo: {
      torso: mk(hips, (g, at, gl) => {
        gl.sph(0.32, at([0, 1.7, 0.72]), '#ffffff', [1, 1, 0.5], 7);                          // soul core in the chest
        for (const s of [-1, 1]) gl.box(0.08, 0.5, 0.06, at([s * 0.45, 1.55, 0.78]), '#ffffff', [0, 0, s * 0.4]);   // runes
        g.sph(0.9, at([0, 1.6, 0]), '#56466e', [1.2, 1, 0.9], 7);                            // bone-plated torso
        for (let i = 0; i < 5; i++) g.cone(0.14, 0.6, 4, at([-0.8 + i * 0.4, 2.4, -0.2]), BONE, [-0.4, 0, 0]);   // spine spikes
        g.box(0.9, 0.35, 0.6, at([0, 0.9, 0]), BONE2);
      }),
      head: mk(head, (g, at, gl) => { g.sph(0.4, at([0, 2.45, 0.35]), BONE, 1, 7); for (const s of [-1, 1]) gl.sph(0.09, at([s * 0.15, 2.5, 0.7]), '#ffffff', 1, 5); }),
      armL: arm(-1, armL), armR: arm(1, armR), legL: leg(-1, legL), legR: leg(1, legR),
    },
  };
}

interface Rig { root: Group; hips: Group; head: Group; armL: Group; armR: Group; legL: Group; legR: Group }
interface Slot { outer: Group; body: Group; rigs: Rig[]; bar: Group; fill: Mesh; ward: Mesh }

function buildRig(d: RigDef, mat: Material, glow: Material): Rig {
  const root = new Group();
  const piv = (p: V3, parent: Group, at: V3 = [0, 0, 0]) => { const g = new Group(); g.position.set(p[0] - at[0], p[1] - at[1], p[2] - at[2]); parent.add(g); return g; };
  const mesh = (geo: BufferGeometry, g: Group) => { const m = new Mesh(geo, mat); m.castShadow = true; g.add(m); const gg = glowOf.get(geo); if (gg) g.add(new Mesh(gg, glow)); };
  const hips = piv(d.hips, root);
  mesh(d.geo.torso, hips);
  const head = piv(d.head, hips, d.hips), armL = piv(d.armL, hips, d.hips), armR = piv(d.armR, hips, d.hips);
  const legL = piv(d.legL, root), legR = piv(d.legR, root);
  mesh(d.geo.head, head); mesh(d.geo.armL, armL); mesh(d.geo.armR, armR); mesh(d.geo.legL, legL); mesh(d.geo.legR, legR);
  return { root, hips, head, armL, armR, legL, legR };
}

const SCALE = [1.3, 1.3, 2.85, 1.3];   // warrior, mage, golem, bowman
const BAR_Y = [2.75, 3.0, 8.7, 2.85];

export function Minions() {
  const N = world.minions.length;
  const slots = useMemo<Slot[]>(() => {
    const mat = litMat({ roughness: 0.8 });
    const glow = new MeshBasicMaterial({ color: 0xc27cff, toneMapped: false });
    const defs = [skeletonDef('W'), skeletonDef('M'), golemDef(), skeletonDef('A')];
    const barBg = new MeshBasicMaterial({ color: 0x140c1c, transparent: true, opacity: 0.8, depthTest: false, side: DoubleSide });
    const barFg = new MeshBasicMaterial({ color: 0xb48cff, depthTest: false, side: DoubleSide });
    const plane = new PlaneGeometry(1, 1);
    // Bone Ward: a faceted lilac bubble while a summon carries a bone shield
    const wardGeo = new IcosahedronGeometry(1, 1), wardMat = new MeshBasicMaterial({ color: 0xc9b4ff, transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, toneMapped: false, wireframe: false });
    return Array.from({ length: N }, () => {
      const outer = new Group(), body = new Group();
      outer.visible = false; outer.add(body);
      const rigs = defs.map((d) => { const r = buildRig(d, mat, glow); body.add(r.root); return r; });
      const bar = new Group(); outer.add(bar);
      const bg = new Mesh(plane, barBg); bg.scale.set(1.04, 0.15, 1); bg.renderOrder = 10; bar.add(bg);
      const fill = new Mesh(plane, barFg); fill.scale.set(1, 0.1, 1); fill.position.z = 0.001; fill.renderOrder = 11; bar.add(fill);
      const ward = new Mesh(wardGeo, wardMat); ward.visible = false; outer.add(ward);
      return { outer, body, rigs, bar, fill, ward };
    });
  }, [N]);

  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < N; i++) {
      const S = slots[i], m = world.minions[i];
      S.outer.visible = m.active && m.src !== 6;   // (src 6 = the run ally, drawn by render/Ally.tsx)
      if (!m.active || m.src === 6) continue;
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
      S.ward.visible = m.shield > 0 && rise <= 0;
      if (S.ward.visible) { const r = (golem ? 3.45 : 1.25) * (1 + Math.sin(t * 5 + i) * 0.03); S.ward.scale.set(r, r * 1.15, r); S.ward.position.y = golem ? 3.6 : 1.25; S.ward.rotation.y = t * 0.6; }
      S.bar.visible = frac < 0.999 && rise <= 0;
      if (S.bar.visible) {
        S.bar.position.y = BAR_Y[k] * fade;
        S.bar.quaternion.copy(camera.quaternion);
        S.bar.scale.setScalar(golem ? 2.2 : 1);
        S.fill.scale.x = frac; S.fill.position.x = -(1 - frac) / 2;
      }
      if ((k !== 1 && k !== 3) || (i + Math.floor(t * 4)) % 2 === 0) pushHalo(m.x, golem ? 3.9 : 1.8, m.z, golem ? 3.6 : 1.3, 1.0, 0.5, 2.0, 0.22, CELL.GLOW);   // violet necromantic glow
    }
  });
  return <>{slots.map((s, i) => <primitive key={i} object={s.outer} />)}</>;
}
