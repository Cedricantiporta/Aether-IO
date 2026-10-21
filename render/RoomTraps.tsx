// Stationary room hazards / war machines (engine/systems/roomTraps.ts): ballista, catapult + flying boulder, magic tower, fire bars, fire jets,
// rooting vines, freezing pools. Toy / cute style: chunky rounded wood and stone, bright glowing parts. Pooled InstancedMeshes written each frame
// from `rt` (tiny counts), culled with inView; flames / embers are FX particles + halos.
import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BoxGeometry, Color, CylinderGeometry, DynamicDrawUsage, InstancedMesh, MeshBasicMaterial, type BufferGeometry, type Material } from 'three';
import { world } from '../engine/world';
import { rt, JET_WARN, JET_ON, BAR_LEN, VINE_REST, TOWER_WIND_T, CATAPULT_WIND_T, BOULDER_FLIGHT } from '../engine/systems/roomTraps';
import { inView } from './view';
import { CELL, FX, pushHalo } from './fx';
import { GB, TAU, clamp, commitInst, glowMat, litMat, setInst } from './util';
import { makeRockGeo } from './models';

const mk = (g: BufferGeometry, m: Material, cap: number): InstancedMesh => {
  const im = new InstancedMesh(g, m, cap); im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(DynamicDrawUsage); return im;
};
const rnd = Math.random;

export function RoomTraps() {
  const S = useMemo(() => {
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
    const flat = (c: Color | string | number, o: number) => new MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, toneMapped: false });
    const addM = new MeshBasicMaterial({ color: new Color(2.0, 1.1, 0.35), transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
    const lit = litMat({ roughness: 0.85 });
    return {
      balBase: mk(bb.build(), lit, 4), balTop: mk(bt.build(), lit, 4), balBolt: mk(bg.build(), glowMat(), 4),
      catBase: mk(cb.build(), lit, 4), catArm: mk(ca.build(), lit, 4), catRock: mk(boulderG, lit, 4), boulder: mk(boulderG, lit, 6),
      towB: mk(tb.build(), lit, 3), towG: mk(tg, glowMat({ color: new Color(1.5, 1.2, 2.2) }), 3),
      hub: mk(hb.build(), lit, 3), hubG: mk(hg, glowMat({ color: new Color(1.5, 1.2, 0.8) }), 3), armB: mk(armB.build(), lit, 12), armG: mk(armG.build(), glowMat({ color: new Color(1.6, 1.4, 1.1) }), 12),
      jetB: mk(jb.build(), lit, 3), jetG: mk(jg, addM, 3), jetW: mk(jwarn, flat(new Color(2.2, 0.8, 0.3), 0.5), 3),
      vine: mk(vg.build(), lit, 5), pool: mk(pg.build(), litMat({ roughness: 0.15, metalness: 0.25 }), 4),
      pdisc: mk(new CylinderGeometry(1, 1, 0.03, 28), flat(new Color(0.7, 1.8, 2.4), 0.2), 4),
    };
  }, []);

  useFrame(({ clock }, dtRaw) => {
    const t = clock.elapsedTime, dt = Math.min(dtRaw, 0.05);
    const on = world.room.active && rt.on;
    let nBb = 0, nCb = 0, nBo = 0, nTw = 0, nHub = 0, nArm = 0, nJet = 0, nJw = 0, nVn = 0, nPl = 0;
    if (on) {
      for (let i = 0; i < rt.nSiege; i++) {
        const s = rt.siege[i]; if (!inView(s.x, s.z, 7)) continue;
        const rec = s.state === 2 ? Math.max(0, 1 - s.t / 0.5) : 0, rx = -Math.sin(s.yaw) * rec * 0.35, rz = -Math.cos(s.yaw) * rec * 0.35;
        if (s.kind === 0) {
          setInst(S.balBase, nBb, s.x, 0, s.z, s.yaw, 1.5);
          setInst(S.balTop, nBb, s.x + rx, 0, s.z + rz, s.yaw, 1.5);
          if (s.state !== 2) setInst(S.balBolt, nBb, s.x, 0, s.z, s.yaw, 1.5); else setInst(S.balBolt, nBb, s.x, -9, s.z, s.yaw, 1.5);
          nBb++;
          if (s.state === 1) pushHalo(s.x + Math.sin(s.yaw) * 2.6, 1.8, s.z + Math.cos(s.yaw) * 2.6, 1.4 + 1.6 * clamp(s.t / 1.35, 0, 1), 2.4, 1.2, 0.4, 0.55, CELL.GLOW);
        } else {
          // arm: rests bucket-down, cranks further down while it winds up, then snaps up and forward at the throw and settles back
          const W = CATAPULT_WIND_T, k = s.state === 1 ? clamp(s.t / W, 0, 1) : 0;
          let th = 0.6 + 0.4 * k;
          if (s.state === 2) th = s.t < 0.3 ? 1.0 + (-0.9 - 1.0) * Math.pow(s.t / 0.3, 0.6) : -0.9 + 1.5 * clamp((s.t - 0.3) / 0.4, 0, 1);
          const sc = 1.4, cy = 2.4 * sc;
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
        const m = rt.tower[i]; if (!inView(m.x, m.z, 7)) continue;
        const charge = m.state === 1 ? clamp(m.t / TOWER_WIND_T, 0, 1) : m.state === 2 ? 1 - clamp(m.t / 0.6, 0, 1) : 0;
        setInst(S.towB, nTw, m.x, 0, m.z, i, 1.3);
        const sc = 0.85 + 0.55 * charge + Math.sin(t * 2.5 + i) * 0.05;
        setInst(S.towG, nTw, m.x, 5.7 + Math.sin(t * 1.6 + i) * 0.18, m.z, t * (0.8 + 3 * charge), sc, sc, sc);
        nTw++;
        pushHalo(m.x, 5.7, m.z, 3.2 + 4.2 * charge, 1.4 + charge, 0.7, 2.4, 0.4 + 0.4 * charge, CELL.GLOW);
        if (charge > 0.3 && rnd() < dt * 30 * charge) FX.add.emit(m.x + (rnd() - 0.5) * 2, 3 + rnd() * 2, m.z + (rnd() - 0.5) * 2, 0, 1, 0, 0.6, 0.3, 0.05, 1.5, 0.9, 2.4, 0.8, CELL.STAR, 0, 1, 0, 3);
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
  });

  return (
    <>
      {(Object.values(S) as InstancedMesh[]).map((m, i) => <primitive key={i} object={m} />)}
    </>
  );
}
void JET_WARN;
