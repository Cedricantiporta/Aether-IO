// Stationary room hazards / war machines (engine/systems/roomTraps.ts): ballista, catapult + flying boulder, magic tower, fire bars, fire jets,
// rooting vines, freezing pools, fire / frost breath statues (stone dragon heads on the rim). Destroyed pieces leave rubble; damaged ones show a small HP bar. Toy / cute style: chunky rounded wood and stone, bright glowing parts. Pooled InstancedMeshes written each frame
// from `rt` (tiny counts), culled with inView; flames / embers are FX particles + halos.
import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BoxGeometry, BufferGeometry, Color, CylinderGeometry, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, InstancedMesh, Mesh, MeshBasicMaterial, PlaneGeometry, ShaderMaterial, Sphere, Vector3, type Material } from 'three';
import { world } from '../engine/world';
import { rt, BEAM_WARN, JET_WARN, JET_ON, BAR_LEN, VINE_REST, TOWER_WIND_T, CATAPULT_WIND_T, BOULDER_FLIGHT, STATUE_WARN, STATUE_ON, STATUE_LEN, STATUE_SWEEP, STATUE_MOUTH, statueBeamYaw, trapAim, lockedTrap, type TrapObj } from '../engine/systems/roomTraps';
import { inView } from './view';
import { CELL, FX, pushHalo, sparks, chunks, dustPuff, smokePuff, embers, scorch, flashStar } from './fx';
import { BAR_VS, BAR_FS } from './Enemies';
import { GB, TAU, clamp, commitInst, glowMat, litMat, setInst } from './util';
import { makeRockGeo } from './models';

const mk = (g: BufferGeometry, m: Material, cap: number): InstancedMesh => {
  const im = new InstancedMesh(g, m, cap); im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(DynamicDrawUsage); return im;
};
const rnd = Math.random;

/** Hit sparks, the break burst (once) and the white hit flash of one stationary. `deadIdx` indexes the render-side "already burst" flags. */
function pieceFx(o: TrapObj, seen: Int32Array, i: number, dead: Uint8Array, deadIdx: number, y: number, c1: number, c2: number): void {
  if (o.hitSeq !== seen[i]) {
    seen[i] = o.hitSeq;
    sparks(o.x + (rnd() - 0.5) * 1.2, y, o.z + (rnd() - 0.5) * 1.2, 5, 0xffe6a8, 7, 0.26, 0.35, 1.6);
    chunks(o.x, y, o.z, 2, c1, c2, 4, 0.22);
  }
  if (o.dead && !dead[deadIdx]) {
    dead[deadIdx] = 1;
    chunks(o.x, y, o.z, 18, c1, c2, 9, 0.36);
    smokePuff(o.x, 0.8, o.z, 7, 0x4a403c, 1.8, 1.2, 1.8, 1.6, 0.5);
    dustPuff(o.x, o.z, 6, 1.6, 0xd9c9a3, 3);
    scorch(o.x, o.z, 3.6, 12, 0.5);
    flashStar(o.x, 1.6, o.z, 0xffffff, 5, 0.25);
  } else if (!o.dead) dead[deadIdx] = 0;
  if (o.flash > 0.02 && !o.dead) pushHalo(o.x, y, o.z, 3.4 + o.flash, 2.6, 2.5, 2.2, 0.55 * o.flash, CELL.GLOW);
}
/** One HP bar instance for a damaged (or aimed-at) live piece. */
function addBar(B: { pos: InstancedBufferAttribute; d: InstancedBufferAttribute; max: number }, n: number, o: TrapObj, y: number, aimed: boolean): number {
  if (o.dead || n >= B.max || (o.hp >= o.maxHp && !aimed)) return n;
  const P = B.pos.array as Float32Array, D = B.d.array as Float32Array;
  P[n * 3] = o.x; P[n * 3 + 1] = y; P[n * 3 + 2] = o.z;
  D[n * 3] = clamp(o.hp / o.maxHp, 0, 1); D[n * 3 + 1] = 0; D[n * 3 + 2] = 2.6;
  return n + 1;
}

export function RoomTraps() {
  const X = useMemo(() => {
    const wood = '#b8793a', wood2 = '#8a5426', rope = '#e8d8a8', iron = '#8c94a8', stone = '#c9c2d4', stone2 = '#a79fb8';
    // ---- ballista: wheeled base + turning top (bow, rail, bolt)
    const bb = new GB([0.8, 1.1]);
    bb.box(1.7, 0.34, 2.0, [0, 0.55, 0], wood2); bb.box(1.3, 0.24, 1.6, [0, 0.8, 0], wood);
    for (const s of [-1, 1]) { bb.cyl(0.62, 0.62, 0.3, 12, [s * 1.0, 0.62, -0.1], wood2, [0, 0, Math.PI / 2]); bb.cyl(0.18, 0.18, 0.34, 8, [s * 1.0, 0.62, -0.1], iron, [0, 0, Math.PI / 2]); }
    bb.cyl(0.35, 0.45, 0.5, 8, [0, 1.05, 0], iron);
    const bt = new GB([0.85, 1.1]);
    bt.box(0.4, 0.28, 3.0, [0, 1.45, 0.4], wood);                                   // rail
    bt.box(1.6, 0.34, 0.5, [0, 1.5, 1.5], wood2);
    for (const s of [-1, 1]) { bt.box(0.3, 0.3, 2.0, [s * 1.2, 1.5, 1.35], wood, [0, s * 0.55, 0]); bt.sph(0.22, [s * 2.05, 1.5, 1.95], '#ff8a3a', 1, 6); }
    bt.box(0.5, 0.5, 0.6, [0, 1.35, -1.25], wood2);
    const bg = new GB([1, 1]);
    bg.cyl(0.05, 0.05, 2.7, 6, [0, 1.62, 0.7], rope, [Math.PI / 2, 0, 0]);       // the cocked bolt
    bg.cone(0.14, 0.45, 5, [0, 1.62, 2.2], '#ff7a3a', [Math.PI / 2, 0, 0]);
    // ---- catapult: frame + arm (pitches) + bucket rock
    const cb = new GB([0.8, 1.1]);
    cb.box(2.6, 0.34, 3.0, [0, 0.55, 0], wood2); cb.box(0.4, 1.9, 0.4, [-1.0, 1.5, 0], wood); cb.box(0.4, 1.9, 0.4, [1.0, 1.5, 0], wood);
    cb.box(2.5, 0.32, 0.4, [0, 2.4, 0], wood2);
    for (const s of [-1, 1]) for (const z of [-1, 1]) { cb.cyl(0.55, 0.55, 0.28, 12, [s * 1.45, 0.62, z * 1.1], wood2, [0, 0, Math.PI / 2]); cb.cyl(0.16, 0.16, 0.32, 8, [s * 1.45, 0.62, z * 1.1], iron, [0, 0, Math.PI / 2]); }
    const ca = new GB([0.85, 1.1]);
    ca.box(0.4, 0.4, 4.6, [0, 0, 0.9], wood);                                           // arm (pivot at origin, throws toward +z)
    ca.box(1.1, 0.34, 1.1, [0, 0.12, 3.25], wood2); ca.box(1.1, 0.5, 0.2, [0, 0.35, 3.8], wood2);   // bucket
    ca.box(0.9, 0.9, 0.9, [0, 0, -1.4], iron);                                          // counterweight
    const boulderG = makeRockGeo(907, '#9a8a78', '#7a8a58', 1.0); boulderG.scale(1.1, 1.1, 1.1);
    // ---- magic tower
    const tb = new GB([0.85, 1.12]);
    tb.cyl(1.35, 1.6, 0.6, 10, [0, 0.3, 0], stone2); tb.cyl(0.85, 1.1, 2.6, 10, [0, 1.9, 0], stone); tb.cyl(1.1, 0.95, 0.5, 10, [0, 3.35, 0], stone2);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; tb.cone(0.22, 0.9, 5, [Math.sin(a) * 1.0, 3.8, Math.cos(a) * 1.0], '#c8a8ff'); }
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; tb.box(0.2, 0.9, 0.12, [Math.sin(a) * 0.9, 1.9, Math.cos(a) * 0.9], '#b890ff', [0, a, 0]); }
    const tg = new GB([1, 1]).octa(0.75, [0, 0, 0], '#e0c0ff', [0.9, 1.3, 0.9]).octa(0.4, [0, 0, 0], '#ffffff', [0.9, 1.3, 0.9]).build();
    // ---- fire bar: pedestal + arm (instanced x4)
    const hb = new GB([0.85, 1.1]);
    hb.cyl(0.95, 1.15, 0.7, 9, [0, 0.35, 0], '#6a5a62'); hb.cyl(0.7, 0.8, 0.5, 9, [0, 0.95, 0], '#8a7480');
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; hb.sph(0.2, [Math.sin(a) * 0.85, 0.75, Math.cos(a) * 0.85], '#ffb070', 1, 5); }
    const hg = new GB([1, 1]).ico(0.62, [0, 1.35, 0], '#ff8a2a', [1, 1.2, 1], 1).ico(0.34, [0, 1.4, 0], '#fff0a0', 1, 1).build();
    const armB = new GB([0.8, 1.1]);
    armB.box(0.5, 0.42, BAR_LEN, [0, 0.95, BAR_LEN / 2], '#4a2e26');
    for (let i = 0; i < 6; i++) armB.sph(0.28, [0, 1.2, 0.9 + i * ((BAR_LEN - 1.2) / 5)], '#2e1c18', [1, 0.8, 1], 5);
    const armG = new GB([1, 1]);
    for (let i = 0; i < 7; i++) { const z = 0.8 + i * ((BAR_LEN - 1.0) / 6); armG.ico(0.4 - i * 0.012, [0, 1.35 + 0.1 * (i % 2), z], i % 2 ? '#ff8a2a' : '#ffb040', [0.9, 1.35, 0.9], 1); }
    armG.box(0.18, 0.12, BAR_LEN, [0, 1.17, BAR_LEN / 2], '#ffe08a');
    // ---- fire jet: nozzle statue + flat beam
    const jb = new GB([0.85, 1.1]);
    jb.cyl(1.0, 1.25, 0.6, 9, [0, 0.3, 0], '#7a6a6a'); jb.sph(0.95, [0, 1.25, 0], '#b25a3a', [1, 0.9, 1], 9);
    jb.cone(0.5, 1.1, 8, [0, 1.35, 0.95], '#8a4a30', [Math.PI / 2, 0, 0]);
    for (const s of [-1, 1]) { jb.cone(0.14, 0.5, 4, [s * 0.5, 1.95, 0.1], '#e8d0a0', [-0.3, 0, s * 0.4]); jb.sph(0.14, [s * 0.4, 1.45, 0.78], '#ffd070', 1, 5); }
    const jg = new GB([1, 1]).cone(1, 1, 8, [0, 0, 0.5], '#ff9a2a', [Math.PI / 2, 0, 0]).cone(0.55, 1, 8, [0, 0, 0.5], '#fff0a0', [Math.PI / 2, 0, 0]).build();   // unit cone, scaled to the jet
    const jwarn = new BoxGeometry(1, 0.05, 1).translate(0, 0.06, 0.5);
    // ---- vines
    const vg = new GB([0.7, 1.1]);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.3, d = i === 0 ? 0 : 0.35 + (i % 3) * 0.18, s = 0.3 + ((i * 37) % 10) / 45;
      vg.ico(s, [Math.cos(a) * d, s * 0.7, Math.sin(a) * d], i % 2 ? '#4aa23a' : '#378a2e', [1, 0.8, 1], 0);
      vg.cone(0.07, 0.9, 5, [Math.cos(a) * d * 0.9, 0.55, Math.sin(a) * d * 0.9], '#5ec44a', [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5 + 0.2]);
      if (i % 3 === 0) vg.sph(0.14, [Math.cos(a) * d * 1.1, 0.95, Math.sin(a) * d * 1.1], '#ff7ab8', 1, 5);
    }
    // ---- freezing pool: pale ice disc with crystals
    const pg = new GB([0.95, 1.05]);
    pg.cyl(1, 1, 0.07, 30, [0, 0, 0], '#2f7fc4'); pg.cyl(0.9, 0.9, 0.06, 30, [0, 0.03, 0], '#4fb3ee'); pg.cyl(0.62, 0.62, 0.05, 24, [0.06, 0.06, -0.04], '#8fdcff'); pg.cyl(0.28, 0.28, 0.05, 16, [0.2, 0.09, -0.12], '#d8f6ff');
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2, d = 0.92; pg.cone(0.06 + (i % 3) * 0.02, 0.28 + (i % 3) * 0.14, 5, [Math.cos(a) * d, 0.2, Math.sin(a) * d], '#e6fbff', [0, 0, 0]); }
    // ---- breath statues: a chunky stone dragon head on a plinth (front = +z). fire = sandstone + ember red, frost = pale ice stone + blue
    const statueGeo = (st: string, st2: string, acc: string, teeth: string) => {
      const g = new GB([0.82, 1.1]);
      g.cyl(1.25, 1.45, 0.55, 10, [0, 0.28, 0], st2); g.cyl(0.98, 1.15, 0.45, 10, [0, 0.78, 0], st);
      g.sph(0.98, [0, 1.55, -0.05], st, [1, 1.05, 0.95], 9);                                   // round chunky torso / neck
      for (const x of [-1, 1]) { g.sph(0.3, [x * 0.62, 1.05, 0.85], st2, [1, 0.8, 1.3], 6); g.sph(0.1, [x * 0.62 + x * 0.02, 0.98, 1.2], teeth, 1, 5); g.sph(0.1, [x * 0.5, 0.98, 1.22], teeth, 1, 5); }   // front paws + claws
      g.sph(0.88, [0, 2.2, 0.5], st, [1.08, 0.92, 1], 10);                                       // head
      g.sph(0.55, [0, 2.02, 1.3], st, [1.0, 0.62, 1.1], 8);                                      // upper snout
      g.sph(0.46, [0, 1.58, 1.18], st2, [1, 0.42, 1.12], 8);                                     // lower jaw (open)
      g.sph(0.08, [-0.2, 2.1, 1.82], '#3a2c34', 1, 5); g.sph(0.08, [0.2, 2.1, 1.82], '#3a2c34', 1, 5);   // nostrils
      for (const x of [-0.26, 0.26]) { g.cone(0.075, 0.24, 5, [x, 1.8, 1.66], teeth, [Math.PI, 0, 0]); g.cone(0.075, 0.22, 5, [x * 0.9, 1.7, 1.6], teeth, [0, 0, 0]); }   // fangs
      for (const x of [-1, 1]) {
        g.sph(0.27, [x * 0.5, 2.5, 1.0], st2, [1, 0.7, 1], 6);                                   // brow
        g.cone(0.19, 0.95, 6, [x * 0.58, 3.02, 0.12], acc, [-0.7, 0, -x * 0.35]);                  // horns, swept back
        g.cone(0.13, 0.5, 5, [x * 0.98, 2.15, 0.35], acc, [0, 0, -x * 1.25]);                      // side fins
      }
      for (let i = 0; i < 3; i++) g.cone(0.17 - i * 0.025, 0.55 - i * 0.07, 5, [0, 2.75 - i * 0.5, -0.45 - i * 0.28], acc, [-0.75, 0, 0]);   // crest down the back
      g.sph(0.2, [0, 2.0, 1.88], acc, [1, 0.6, 0.8], 5);                                         // nose bump
      return g.build();
    };
    const eyeGeo = new GB([1, 1]).sph(0.16, [-0.43, 2.42, 1.2], '#ffffff', [1, 1.1, 0.8], 6).sph(0.16, [0.43, 2.42, 1.2], '#ffffff', [1, 1.1, 0.8], 6).build();
    const throatGeo = new GB([1, 1]).sph(0.4, [0, 0, 0], '#ffffff', [1.0, 0.8, 1.0], 7).build();   // hot throat between the jaws (centred: placed at the mouth and scaled by the charge)
    // soft sculpted flame tongue (tip toward +z, base at 0): a round belly + a tapered tip + a little curl
    const flameGeo = new GB([1, 1]).sph(0.5, [0, 0, 0.2], '#ffffff', [1, 1, 0.95], 7).cone(0.5, 0.95, 7, [0, 0, 0.62], '#ffffff', [Math.PI / 2, 0, 0]).sph(0.26, [0.2, 0.1, 0.78], '#ffffff', [0.8, 0.9, 1.2], 5).build();
    const wedgeGeo = new BufferGeometry(); wedgeGeo.setAttribute('position', new Float32BufferAttribute([0, 0.05, 0, -1, 0.05, 1, 1, 0.05, 1], 3));
    const stripGeo = new BoxGeometry(1, 0.05, 1).translate(0, 0.07, 0.5);
    // rubble heap: stone lumps, a charred plank or two, a few light chips
    const rg = new GB([0.8, 1.1]);
    rg.dodeca(0.8, [0, 0.35, 0], '#8a8294', [1.3, 0.55, 1.2], [0.2, 0.5, 0]); rg.dodeca(0.5, [0.85, 0.22, 0.3], '#a79fb2', [1.1, 0.6, 1], [0, 1, 0]); rg.dodeca(0.45, [-0.8, 0.2, -0.2], '#7a7284', [1.2, 0.55, 1], [0.3, 2, 0]);
    rg.dodeca(0.34, [0.2, 0.18, -0.95], '#9a92a6', [1, 0.6, 1.1], [0, 0.4, 0]); rg.dodeca(0.3, [-0.35, 0.16, 0.95], '#b8b0c2', [1, 0.6, 1], [0.5, 0, 0.3]);
    rg.box(1.5, 0.18, 0.3, [0.1, 0.52, 0.55], '#6a4624', [0.1, 0.7, 0.18]); rg.box(1.1, 0.16, 0.26, [-0.4, 0.42, -0.5], '#7e5430', [0, -0.5, -0.12]); rg.box(0.8, 0.14, 0.24, [0.7, 0.45, -0.4], '#4a3220', [0.12, 1.2, 0.1]);
    const flat = (c: Color | string | number, o: number) => new MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, toneMapped: false });
    const addM = new MeshBasicMaterial({ color: new Color(2.0, 1.1, 0.35), transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
    const lit = litMat({ roughness: 0.85 });
    const fireM = (c: Color, o: number) => glowMat({ color: c, transparent: true, opacity: o, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    const wedgeFire = flat(new Color(1.8, 0.6, 0.2), 0.08), wedgeFrost = flat(new Color(0.4, 1.3, 2.0), 0.08);
    // ---- HP bars of damaged stationaries (the enemy bar shader: iPos = world pos, iD = fill / kind / width)
    const BMAX = 12;
    const bgeo = new InstancedBufferGeometry(); const bq = new PlaneGeometry(1, 1);
    bgeo.index = bq.index; bgeo.setAttribute('position', bq.attributes.position);
    const bPos = new InstancedBufferAttribute(new Float32Array(BMAX * 3), 3), bD = new InstancedBufferAttribute(new Float32Array(BMAX * 3), 3);
    bPos.setUsage(DynamicDrawUsage); bD.setUsage(DynamicDrawUsage);
    bgeo.setAttribute('iPos', bPos); bgeo.setAttribute('iD', bD); bgeo.instanceCount = 0; bgeo.boundingSphere = new Sphere(new Vector3(), 1e6);
    const barMesh = new Mesh(bgeo, new ShaderMaterial({ vertexShader: BAR_VS, fragmentShader: BAR_FS, transparent: true, depthTest: false, depthWrite: false }));
    barMesh.frustumCulled = false; barMesh.renderOrder = 60;
    const bars = { mesh: barMesh, geo: bgeo, pos: bPos, d: bD, max: BMAX };
    const sts = statueGeo('#d8b49e', '#b08a78', '#ee6a3a', '#fff2d8'), stsF = statueGeo('#d6e8f4', '#a2bfd6', '#58b4ec', '#ffffff');
    const S = {
      balBase: mk(bb.build(), lit, 6), balTop: mk(bt.build(), lit, 6), balBolt: mk(bg.build(), glowMat(), 6),
      catBase: mk(cb.build(), lit, 6), catArm: mk(ca.build(), lit, 6), catRock: mk(boulderG, lit, 6), boulder: mk(boulderG, lit, 6),
      towB: mk(tb.build(), lit, 3), towG: mk(tg, glowMat({ color: new Color(1.5, 1.2, 2.2) }), 3),
      hub: mk(hb.build(), lit, 6), hubG: mk(hg, glowMat({ color: new Color(1.5, 1.2, 0.8) }), 6), armB: mk(armB.build(), lit, 16), armG: mk(armG.build(), glowMat({ color: new Color(1.6, 1.4, 1.1) }), 16),
      jetB: mk(jb.build(), lit, 5), jetG: mk(jg, addM, 5), jetW: mk(jwarn, flat(new Color(2.2, 0.8, 0.3), 0.5), 16),
      vine: mk(vg.build(), lit, 5), pool: mk(pg.build(), litMat({ roughness: 0.15, metalness: 0.25 }), 4),
      pdisc: mk(new CylinderGeometry(1, 1, 0.03, 28), flat(new Color(0.7, 1.8, 2.4), 0.2), 4),
      rubble: mk(rg.build(), lit, 12),
      stB: mk(sts, lit, 3), stE: mk(eyeGeo, glowMat({ color: new Color(2.2, 1.5, 0.3) }), 3), stT: mk(throatGeo, glowMat({ color: new Color(2.6, 1.1, 0.25) }), 3),
      sfB: mk(stsF, lit, 3), sfE: mk(eyeGeo, glowMat({ color: new Color(0.7, 1.9, 2.6) }), 3), sfT: mk(throatGeo, glowMat({ color: new Color(0.6, 1.7, 2.6) }), 3),
      flO: mk(flameGeo, fireM(new Color(1.7, 0.5, 0.1), 0.34), 48), flI: mk(flameGeo, fireM(new Color(1.7, 0.95, 0.3), 0.4), 48),
      fkO: mk(flameGeo, fireM(new Color(0.25, 0.9, 1.7), 0.34), 48), fkI: mk(flameGeo, fireM(new Color(1.1, 1.8, 2.1), 0.42), 48),
      wdF: mk(wedgeGeo, wedgeFire, 4), wdI: mk(wedgeGeo, wedgeFrost, 4),
      spF: mk(stripGeo, flat(new Color(1.9, 0.7, 0.25), 0.4), 8), spI: mk(stripGeo, flat(new Color(0.4, 1.4, 2.1), 0.4), 8),
    };
    return { S, bars, wedgeFire, wedgeFrost, seen: { siege: new Int32Array(6), tower: new Int32Array(3), statue: new Int32Array(3), dead: new Uint8Array(12), ver: -1 } };
  }, []);
  const S = X.S;

  useFrame(({ clock }, dtRaw) => {
    const t = clock.elapsedTime, dt = Math.min(dtRaw, 0.05);
    const on = world.room.active && rt.on;
    let nBb = 0, nCb = 0, nBo = 0, nTw = 0, nHub = 0, nArm = 0, nJet = 0, nJw = 0, nVn = 0, nPl = 0, nRu = 0, nBar = 0;
    let nSf = 0, nSi = 0, nFo = 0, nFk = 0, nWf = 0, nWi = 0, nSpf = 0, nSpi = 0;
    if (on) {
      const sn = X.seen;
      if (sn.ver !== rt.ver) { sn.ver = rt.ver; sn.siege.fill(0); sn.tower.fill(0); sn.statue.fill(0); sn.dead.fill(0); }
      const aimed = trapAim.obj ?? lockedTrap();
      for (let i = 0; i < rt.nSiege; i++) {
        const s = rt.siege[i];
        pieceFx(s, sn.siege, i, sn.dead, i, 1.6, 0x8a5a2e, 0xb8793a);
        if (s.dead) { if (inView(s.x, s.z, 5)) setInst(S.rubble, nRu++, s.x, 0, s.z, i * 1.9 + s.x, 1.25); continue; }
        if (!inView(s.x, s.z, 7)) continue;
        nBar = addBar(X.bars, nBar, s, 3.6, s === aimed);
        const fs = 1 + 0.06 * s.flash;
        const rec = s.state === 2 ? Math.max(0, 1 - s.t / 0.5) : 0, rx = -Math.sin(s.yaw) * rec * 0.35, rz = -Math.cos(s.yaw) * rec * 0.35;
        if (s.kind === 0) {
          setInst(S.balBase, nBb, s.x, 0, s.z, s.yaw, 1.5 * fs);
          setInst(S.balTop, nBb, s.x + rx, 0, s.z + rz, s.yaw, 1.5 * fs);
          if (s.state !== 2) setInst(S.balBolt, nBb, s.x, 0, s.z, s.yaw, 1.5 * fs); else setInst(S.balBolt, nBb, s.x, -9, s.z, s.yaw, 1.5 * fs);
          nBb++;
          if (s.state === 1) pushHalo(s.x + Math.sin(s.yaw) * 2.6, 1.8, s.z + Math.cos(s.yaw) * 2.6, 1.4 + 1.6 * clamp(s.t / 1.35, 0, 1), 2.4, 1.2, 0.4, 0.55, CELL.GLOW);
        } else {
          // arm: rests bucket-down, cranks further down while it winds up, then snaps up and forward at the throw and settles back
          const W = CATAPULT_WIND_T, k = s.state === 1 ? clamp(s.t / W, 0, 1) : 0;
          let th = 0.6 + 0.4 * k;
          if (s.state === 2) th = s.t < 0.3 ? 1.0 + (-0.9 - 1.0) * Math.pow(s.t / 0.3, 0.6) : -0.9 + 1.5 * clamp((s.t - 0.3) / 0.4, 0, 1);
          const sc = 1.4 * fs, cy = 2.4 * sc;
          setInst(S.catBase, nCb, s.x, 0, s.z, s.yaw, sc);
          setInst(S.catArm, nCb, s.x, cy, s.z, s.yaw, sc, sc, sc, th);
          if (s.state < 2) {   // the loaded boulder rides in the bucket
            const bz = (0.62 * Math.sin(th) + 3.2 * Math.cos(th)) * sc, by = cy + (0.62 * Math.cos(th) - 3.2 * Math.sin(th)) * sc;
            setInst(S.catRock, nCb, s.x + Math.sin(s.yaw) * bz, by, s.z + Math.cos(s.yaw) * bz, s.yaw, 1.2);
          } else setInst(S.catRock, nCb, s.x, -9, s.z, 0, 1);
          nCb++;
          if (s.state === 1 && k > 0.5) pushHalo(s.x, 4.5, s.z, 1.2, 1.9, 1.3, 0.6, 0.3 * k, CELL.GLOW);
        }
      }
      for (const b of rt.boulders) {
        if (!b.on || !inView(b.tx, b.tz, 8)) continue;
        const k = b.t / BOULDER_FLIGHT, x = b.sx + (b.tx - b.sx) * k, z = b.sz + (b.tz - b.sz) * k, y = 1.4 + 11 * 4 * k * (1 - k);
        setInst(S.boulder, nBo++, x, y, z, t * 2.4, 1, 1, 1, t * 3.1, t * 1.7);
        if (rnd() < dt * 40) FX.norm.emit(x, y, z, (rnd() - 0.5), 0.3, (rnd() - 0.5), 0.6, 0.5, 0.9, 0.55, 0.5, 0.42, 0.5, CELL.SMOKE);
      }
      for (let i = 0; i < rt.nTower; i++) {
        const m = rt.tower[i];
        pieceFx(m, sn.tower, i, sn.dead, 6 + i, 2.4, 0x9a92a6, 0xc9c2d4);
        if (m.dead) { if (inView(m.x, m.z, 5)) setInst(S.rubble, nRu++, m.x, 0, m.z, i * 2.3 + m.z, 1.45); continue; }
        if (!inView(m.x, m.z, 7)) continue;
        nBar = addBar(X.bars, nBar, m, 7.6, m === aimed);
        const charge = m.state === 1 ? clamp(m.t / TOWER_WIND_T, 0, 1) : m.state === 2 ? 1 - clamp(m.t / 0.6, 0, 1) : 0;
        setInst(S.towB, nTw, m.x, 0, m.z, i, 1.3 * (1 + 0.05 * m.flash));
        const sc = 0.85 + 0.55 * charge + Math.sin(t * 2.5 + i) * 0.05;
        setInst(S.towG, nTw, m.x, 5.7 + Math.sin(t * 1.6 + i) * 0.18, m.z, t * (0.8 + 3 * charge), sc, sc, sc);
        nTw++;
        pushHalo(m.x, 5.7, m.z, 3.2 + 4.2 * charge, 1.4 + charge, 0.7, 2.4, 0.4 + 0.4 * charge, CELL.GLOW);
        if (charge > 0.3 && rnd() < dt * 30 * charge) FX.add.emit(m.x + (rnd() - 0.5) * 2, 3 + rnd() * 2, m.z + (rnd() - 0.5) * 2, 0, 1, 0, 0.6, 0.3, 0.05, 1.5, 0.9, 2.4, 0.8, CELL.STAR, 0, 1, 0, 3);
      }
      for (let i = 0; i < rt.nStatue; i++) {
        const q = rt.statue[i];
        pieceFx(q, sn.statue, i, sn.dead, 9 + i, 1.8, q.kind ? 0xa2bfd6 : 0xb08a78, q.kind ? 0xd6e8f4 : 0xd8b49e);
        if (q.dead) { if (inView(q.x, q.z, 5)) setInst(S.rubble, nRu++, q.x, 0, q.z, i * 1.3 + q.x, 1.2); continue; }
        if (!inView(q.x, q.z, STATUE_LEN + 5)) continue;
        nBar = addBar(X.bars, nBar, q, 5.0, q === aimed);
        const frost = q.kind === 1, fs = 1 + 0.06 * q.flash, sc = 1.15 * fs, gl = q.glow;
        const sx = Math.sin(q.yaw), cz = Math.cos(q.yaw), ix = frost ? nSi : nSf;
        setInst(frost ? S.sfB : S.stB, ix, q.x, 0, q.z, q.yaw, sc);
        setInst(frost ? S.sfE : S.stE, ix, q.x, 0, q.z, q.yaw, sc * (1 + 0.25 * gl));
        const mxp = q.x + sx * 1.5 * sc, mzp = q.z + cz * 1.5 * sc, myp = 2.05 * sc;   // the mouth
        const ts = gl > 0.02 ? sc * (0.25 + 0.95 * gl) * (1 + 0.08 * Math.sin(t * 30)) : 0.001;
        setInst(frost ? S.sfT : S.stT, ix, mxp, gl > 0.02 ? myp : -9, mzp, q.yaw, ts);
        if (frost) nSi++; else nSf++;
        const hot = frost ? 0 : 1, c0 = hot ? 2.6 : 0.6, c1 = hot ? 1.1 : 1.7, c2 = hot ? 0.3 : 2.6;
        if (q.state === 1) {   // telegraph: the mouth fills with light, the lane (and the sweep it will cover) lights up on the floor
          pushHalo(mxp, myp, mzp, 1.3 + 2.4 * gl, c0, c1, c2, 0.5 + 0.4 * gl, CELL.GLOW);
          if (rnd() < dt * 26 * gl) FX.add.emit(mxp + (rnd() - 0.5) * 0.4, myp + 0.2, mzp + (rnd() - 0.5) * 0.4, sx * 1.5, 1.2 + rnd(), cz * 1.5, 0.5, 0.35, 0.05, c0, c1 * 0.8, c2 * 0.8, 0.8, hot ? CELL.FLAME : CELL.STAR, -0.4, 1);
          const ramp = clamp(q.t / (STATUE_WARN * 0.6), 0, 1), fl = 0.6 + 0.4 * Math.sin(t * 34), locked = q.t >= STATUE_WARN * 0.6;
          const a0 = locked ? q.lock - q.sw * STATUE_SWEEP * 0.5 : q.yaw, a1 = locked ? q.lock + q.sw * STATUE_SWEEP * 0.5 : q.yaw;
          const SM = frost ? S.spI : S.spF, WM = frost ? S.wdI : S.wdF;
          const sw = 0.5 + 0.4 * fl, ln = (STATUE_LEN - 0.2) * (0.4 + 0.6 * ramp);
          setInst(SM, frost ? nSpi++ : nSpf++, q.x + Math.sin(a0) * STATUE_MOUTH, 0, q.z + Math.cos(a0) * STATUE_MOUTH, a0, sw, 1, ln);
          if (locked) {
            setInst(SM, frost ? nSpi++ : nSpf++, q.x + Math.sin(a1) * STATUE_MOUTH, 0, q.z + Math.cos(a1) * STATUE_MOUTH, a1, sw, 1, ln);
            setInst(WM, frost ? nWi++ : nWf++, q.x + sx * 0.0, 0, q.z, q.lock, Math.tan(STATUE_SWEEP * 0.5 + 0.1) * STATUE_LEN * 0.95 + 0.9, 1, STATUE_LEN + STATUE_MOUTH);
          }
          (frost ? X.wedgeFrost : X.wedgeFire).opacity = 0.06 + 0.05 * fl;
        } else if (q.state === 2) {   // the breath: a stream of soft flame tongues flowing out of the mouth along the (sweeping) lane
          const k0 = clamp(q.t / 0.25, 0, 1), env = k0 * clamp((STATUE_ON - q.t) / 0.35, 0, 1), reach = STATUE_LEN * (0.35 + 0.65 * k0);
          const O = frost ? S.fkO : S.flO, I = frost ? S.fkI : S.flI, nn = frost ? nFk : nFo;
          const px2 = cz, pz2 = -sx;
          for (let f = 0; f < 14; f++) {
            const u = (f / 14 + t * 0.8 + i * 0.31) % 1, dd = 1.9 + u * reach;
            const e = Math.pow(Math.sin(Math.PI * u), 0.55) * env, w = (0.55 + 1.3 * u) * (0.9 + 0.2 * Math.sin(t * 16 + f * 2.1)) * e;
            const len = (1.2 + 2.3 * u) * e, lat = Math.sin(t * 7 + f * 1.9) * 0.22 * u, y = 2.05 - 1.2 * u + 0.1 * Math.sin(t * 11 + f);
            const fx = q.x + sx * dd + px2 * lat, fz = q.z + cz * dd + pz2 * lat, rl = f * 1.7 + Math.sin(t * 3 + f) * 0.6;
            setInst(O, nn + f, fx, y, fz, q.yaw, w, w * 0.9, len, 0.1, rl);
            setInst(I, nn + f, fx, y, fz, q.yaw, w * 0.5, w * 0.46, len * 0.8, 0.1, rl);
          }
          if (frost) nFk += 14; else nFo += 14;
          setInst(frost ? S.wdI : S.wdF, frost ? nWi++ : nWf++, mxp, 0, mzp, q.yaw, 1.7 * env + 0.3, 1, reach);
          (frost ? X.wedgeFrost : X.wedgeFire).opacity = 0.11 + 0.03 * Math.sin(t * 40);
          pushHalo(mxp, myp, mzp, 3 + 0.5 * Math.sin(t * 30), c0, c1, c2, 0.7 * env, CELL.GLOW);
          for (let h = 0; h < 4; h++) { const dd = 3 + h * reach / 4, hy = 1.8 - h * 0.3; pushHalo(q.x + sx * dd, hy, q.z + cz * dd, 3.2 + h * 0.5, c0 * 0.9, c1 * 0.9, c2 * 0.9, 0.4 * env, CELL.GLOW); }
          for (let h = 0; h < 3; h++) if (rnd() < dt * 55 * env) {
            const dd = 2 + rnd() * reach, spread = 0.5 + 1.0 * (dd / STATUE_LEN);
            FX.add.emit(q.x + sx * dd + px2 * (rnd() - 0.5) * spread, 1.4 - dd * 0.06 + rnd() * 0.7, q.z + cz * dd + pz2 * (rnd() - 0.5) * spread, sx * 2, 1.5 + rnd() * 1.8, cz * 2, 0.5, 0.8, 0.1, c0, c1 * 0.9, c2 * 0.9, 0.8, hot ? CELL.FLAME : CELL.STAR, -0.6, 1.1, 0, hot ? 0 : 3);
          }
        } else if (gl > 0.05 && rnd() < dt * 18) smokePuff(mxp, myp, mzp, 1, hot ? 0x6a5a52 : 0xcfe8f4, 0.5, 0.7, 0.8, 0.3, 0.35);   // a wisp after the breath
      }
      for (let i = 0; i < rt.nBar; i++) {
        const b = rt.bar[i]; if (!inView(b.x, b.z, BAR_LEN + 2)) continue;
        setInst(S.hub, nHub, b.x, 0, b.z, i, 1.0); setInst(S.hubG, nHub, b.x, 0, b.z, t * 2, 1 + Math.sin(t * 6) * 0.06);
        nHub++;
        for (let k = 0; k < 4; k++) {
          const a = b.a + k * Math.PI / 2;
          setInst(S.armB, nArm, b.x, 0, b.z, a, 1); setInst(S.armG, nArm, b.x, 0, b.z, a, 1);
          nArm++;
          if (rnd() < dt * 26) { const d = 1 + rnd() * (BAR_LEN - 1); FX.add.emit(b.x + Math.sin(a) * d, 1.4, b.z + Math.cos(a) * d, (rnd() - 0.5) * 0.8, 1.2 + rnd(), (rnd() - 0.5) * 0.8, 0.45, 0.55, 0.05, 2.3, 0.85, 0.2, 0.8, CELL.FLAME, -0.5, 1); }
        }
        pushHalo(b.x, 1.5, b.z, 4.5, 2.2, 1.0, 0.3, 0.5, CELL.GLOW);
      }
      for (let i = 0; i < rt.nBeam; i++) {   // (owner) HALLS: a pillar with ONE very long rotating flame arm (8 - 12 m)
        const m = rt.beam[i]; if (!inView(m.x, m.z, m.len + 2)) continue;
        setInst(S.hub, nHub, m.x, 0, m.z, i, 1.15); setInst(S.hubG, nHub, m.x, 0, m.z, t * 2, (1 + Math.sin(t * 6) * 0.06) * (m.state === 0 ? 0.7 : 1.15));
        nHub++;
        const sx = Math.sin(m.a), cz = Math.cos(m.a), k = m.len / BAR_LEN;
        if (m.state === 1) {   // telegraph: the lane flickers on the floor (the arm will start here and sweep round)
          const fl = 0.5 + 0.5 * Math.sin(t * 36), ramp = clamp(m.t / BEAM_WARN, 0, 1);
          setInst(S.jetW, nJw++, m.x + sx * 1.2, 0, m.z + cz * 1.2, m.a, 0.7 + 0.7 * fl, 1, (m.len - 1.2) * (0.3 + 0.7 * ramp));
          if (rnd() < dt * 40) FX.add.emit(m.x + sx * (1.5 + rnd() * m.len * 0.9), 0.3, m.z + cz * (1.5 + rnd() * m.len * 0.9), 0, 1.5, 0, 0.5, 0.3, 0.05, 2.4, 0.9, 0.25, 0.8, CELL.FLAME, -0.5, 1);
          pushHalo(m.x, 1.8, m.z, 3 + 2 * ramp, 2.4, 1.0, 0.3, 0.5 + 0.4 * ramp, CELL.GLOW);
        } else if (m.state === 2) {
          const grow = clamp(m.t / 0.4, 0, 1);   // (owner: always on once lit)
          setInst(S.armB, nArm, m.x, 0, m.z, m.a, 1.2, 1.2, k * grow); setInst(S.armG, nArm, m.x, 0, m.z, m.a, 1.5, 1.5, k * grow);
          nArm++;
          setInst(S.jetW, nJw++, m.x + sx * 1.2, 0, m.z + cz * 1.2, m.a, 0.55, 1, (m.len - 1.2) * grow);   // scorched lane under the arm
          for (let q = 0; q < 3; q++) if (rnd() < dt * 50) { const d = 1 + rnd() * (m.len - 1) * grow; FX.add.emit(m.x + Math.sin(m.a) * d, 1.4, m.z + Math.cos(m.a) * d, (rnd() - 0.5) * 0.8, 1.4 + rnd(), (rnd() - 0.5) * 0.8, 0.5, 0.6, 0.05, 2.3, 0.85, 0.2, 0.8, CELL.FLAME, -0.5, 1); }
          for (let h = 1; h <= 4; h++) pushHalo(m.x + sx * h * m.len / 4.6 * grow, 1.4, m.z + cz * h * m.len / 4.6 * grow, 3.2, 2.2, 1.0, 0.3, 0.45, CELL.GLOW);
        }
      }
      for (let i = 0; i < rt.nJet; i++) {
        const j = rt.jet[i]; if (!inView(j.x, j.z, j.len + 2)) continue;
        setInst(S.jetB, i, j.x, 0, j.z, j.ang, 1.0);
        const sx = Math.sin(j.ang), cz = Math.cos(j.ang);
        if (j.state === 1) {   // warning: a flickering ember line + a puff at the nozzle
          const fl = 0.5 + 0.5 * Math.sin(t * 40);
          setInst(S.jetW, nJw++, j.x + sx * 1.6, 0, j.z + cz * 1.6, j.ang, 0.9 + 0.5 * fl, 1, j.len - 1.6);
          if (rnd() < dt * 40) FX.add.emit(j.x + sx * (2 + rnd() * j.len * 0.6), 0.3, j.z + cz * (2 + rnd() * j.len * 0.6), 0, 1.5, 0, 0.5, 0.3, 0.05, 2.4, 0.9, 0.25, 0.8, CELL.FLAME, -0.5, 1);
          pushHalo(j.x + sx * 1.7, 1.4, j.z + cz * 1.7, 1.8 + fl, 2.4, 1.0, 0.3, 0.6, CELL.GLOW);
        } else if (j.state === 2) {
          const k = clamp(j.t / 0.12, 0, 1) * clamp((JET_ON - j.t) / 0.18, 0, 1), w = 1.15 * (0.9 + 0.1 * Math.sin(t * 50));
          setInst(S.jetG, nJet++, j.x + sx * 1.5, 1.35, j.z + cz * 1.5, j.ang, w * k, w * k, (j.len - 1.5) * k);
          for (let q = 0; q < 3; q++) if (rnd() < dt * 60) { const d = 1.8 + rnd() * (j.len - 2); FX.add.emit(j.x + sx * d + (rnd() - 0.5) * 0.8, 0.9 + rnd() * 0.8, j.z + cz * d + (rnd() - 0.5) * 0.8, 0, 2 + rnd() * 2, 0, 0.5, 0.9, 0.1, 2.4, 0.9, 0.2, 0.8, CELL.FLAME, -0.6, 1.2); }
          for (let q = 0; q < 4; q++) pushHalo(j.x + sx * (2 + q * (j.len - 2) / 3.4), 1.2, j.z + cz * (2 + q * (j.len - 2) / 3.4), 3.0, 2.3, 1.0, 0.3, 0.45, CELL.GLOW);
        }
      }
      for (let i = 0; i < rt.nVine; i++) {
        const v = rt.vine[i]; if (!inView(v.x, v.z, 4)) continue;
        const rest = v.state === 2 ? clamp(v.t / VINE_REST, 0, 1) : 0;   // just grabbed = tall + thrashing, then it wilts, then it recovers
        const wilt = v.state === 2 ? (v.t > VINE_REST - 0.9 ? 1.5 : 0.35 + 0.65 * (1 - rest)) : 1;
        const twitch = v.state === 0 ? 1 + Math.sin(t * 5 + v.seed) * 0.05 + v.touch * 0.9 : wilt;
        setInst(S.vine, nVn++, v.x, 0, v.z, v.seed, v.r * 0.95, v.r * 0.95 * twitch, v.r * 0.95);
      }
      for (let i = 0; i < rt.nPool; i++) {
        const p = rt.pool[i]; if (!inView(p.x, p.z, p.r + 3)) continue;
        setInst(S.pool, nPl, p.x, 0.05, p.z, i * 1.7, p.r, 1, p.r); setInst(S.pdisc, nPl, p.x, 0.13 + Math.sin(t * 2 + i) * 0.01, p.z, 0, p.r * 1.0, 1, p.r);
        nPl++;
        if (rnd() < dt * 5) FX.add.emit(p.x + (rnd() - 0.5) * p.r * 1.4, 0.3, p.z + (rnd() - 0.5) * p.r * 1.4, 0, 0.6, 0, 0.8, 0.2, 0.03, 1.4, 2.0, 2.4, 0.7, CELL.STAR, 0, 1, 0, 3);
      }
    }
    commitInst(S.balBase, nBb); commitInst(S.balTop, nBb); commitInst(S.balBolt, nBb);
    commitInst(S.catBase, nCb); commitInst(S.catArm, nCb); commitInst(S.catRock, nCb); commitInst(S.boulder, nBo);
    commitInst(S.towB, nTw); commitInst(S.towG, nTw);
    commitInst(S.hub, nHub); commitInst(S.hubG, nHub); commitInst(S.armB, nArm); commitInst(S.armG, nArm);
    commitInst(S.jetB, on ? rt.nJet : 0); commitInst(S.jetG, nJet); commitInst(S.jetW, nJw);
    commitInst(S.vine, nVn); commitInst(S.pool, nPl); commitInst(S.pdisc, nPl);
    commitInst(S.rubble, nRu);
    commitInst(S.stB, nSf); commitInst(S.stE, nSf); commitInst(S.stT, nSf); commitInst(S.sfB, nSi); commitInst(S.sfE, nSi); commitInst(S.sfT, nSi);
    commitInst(S.flO, nFo); commitInst(S.flI, nFo); commitInst(S.fkO, nFk); commitInst(S.fkI, nFk);
    commitInst(S.wdF, nWf); commitInst(S.wdI, nWi); commitInst(S.spF, nSpf); commitInst(S.spI, nSpi);
    X.bars.geo.instanceCount = nBar; X.bars.pos.needsUpdate = true; X.bars.d.needsUpdate = true;
  });

  return (
    <>
      {(Object.values(S) as InstancedMesh[]).map((m, i) => <primitive key={i} object={m} />)}
      <primitive object={X.bars.mesh} />
    </>
  );
}
void JET_WARN;
