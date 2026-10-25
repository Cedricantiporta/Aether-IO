// (owner 2026-10-25) "Lost?" trail: in a run, when monsters are still alive but the hero has not hit anything for IDLE_S seconds,
// a red chevron trail ">>>>" leads along the walkable route (roomNav A*) to the nearest monster. Any hit hides it again.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, Euler, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { thinArrowGeo } from './arrowGeo';
import { world } from '../engine/world';
import { events } from '../engine/events';
import { useGameStore } from '../store';
import { GameStatus } from '../types';
import { optionalForClear } from '../engine/enemyDefs';
import { navActive, navClear, navFindPath, navPath } from '../engine/roomNav';

const IDLE_S = 10, N = 40, STEP = 1.3;
const idle = { t: 0 };
events.on('enemyHit', () => { idle.t = 0; });
events.on('roomEnter', () => { idle.t = 0; });
const path = new Float32Array(2 * 64);
const _m = new Matrix4(), _q = new Quaternion(), _e = new Euler(), _p = new Vector3(), _s = new Vector3(1, 1, 1);

export function EnemyGuide() {
  const geo = useMemo(() => ({ chev: thinArrowGeo(0.55, 0.55, 0, 0.24), sh: thinArrowGeo(0.63, 0.63, 0, 0.44).translate(0.06, -0.01, -0.1) }), []);
  const mat = useMemo(() => new MeshBasicMaterial({ color: '#ff4a3a', transparent: true, opacity: 0.92, toneMapped: false, depthWrite: false, side: DoubleSide }), []);
  const shMat = useMemo(() => new MeshBasicMaterial({ color: '#2a0806', transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false, side: DoubleSide }), []);
  const tr = useRef<InstancedMesh>(null!), sh = useRef<InstancedMesh>(null!);
  const S = useMemo(() => ({ acc: 1, tgt: -1, np: 0, tx: 0, tz: 0 }), []);
  useFrame(({ clock }, dt) => {
    const t = tr.current; if (!t) return;
    const p = world.player;
    const fighting = useGameStore.getState().status === GameStatus.PLAYING && world.room.active && p.alive && world.director.phase === 'FIGHT';
    if (!fighting) { idle.t = 0; t.visible = sh.current.visible = false; return; }
    idle.t += dt;
    if (idle.t < IDLE_S) { t.visible = sh.current.visible = false; S.tgt = -1; return; }
    S.acc += dt;
    if (S.acc > 0.5) {   // re-pick the nearest monster + its route twice a second
      S.acc = 0; S.tgt = -1;
      let bd = 1e9;
      const es = world.enemies;
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        if (!e.active || e.state === 'DYING' || e.hideT > 0 || optionalForClear(e.kind)) continue;   // (tower archers / hydras / gargoyles are optional)
        const d = (e.pos.x - p.pos.x) ** 2 + (e.pos.z - p.pos.z) ** 2;
        if (d < bd) { bd = d; S.tgt = i; }
      }
      S.np = 0;
      if (S.tgt >= 0) {
        const e = es[S.tgt]; S.tx = e.pos.x; S.tz = e.pos.z;
        if (navActive() && !navClear(p.pos.x, p.pos.z, S.tx, S.tz)) {
          const n = Math.min(64, navFindPath(p.pos.x, p.pos.z, S.tx, S.tz));
          for (let k = 0; k < n * 2; k++) path[k] = navPath[k];   // (navPath is shared: copy it out)
          S.np = n;
        }
      }
    }
    let n = 0;
    if (S.tgt >= 0) {
      const scroll = (clock.elapsedTime * 1.8) % STEP;
      let ax = p.pos.x, az = p.pos.z, seg = 0, next = 1.4 + scroll, acc = 0;
      const segs = S.np > 0 ? S.np : 1;
      while (seg < segs && n < N) {
        const bx = S.np > 0 ? path[seg * 2] : S.tx, bz = S.np > 0 ? path[seg * 2 + 1] : S.tz;
        const sx = bx - ax, sz = bz - az, sl = Math.hypot(sx, sz);
        if (sl < 1e-3) { seg++; continue; }
        while (acc + sl >= next && n < N) {
          const f = (next - acc) / sl, x = ax + sx * f, z = az + sz * f;
          if (seg === segs - 1 && Math.hypot(bx - x, bz - z) < 2.2) { seg = segs; break; }   // stop short of the monster
          const fade = Math.min(1, n / 3 + 0.35);
          _e.set(0, Math.atan2(sx, sz), 0); _q.setFromEuler(_e); _p.set(x, 0.26, z); _s.set(fade, 1, fade); _m.compose(_p, _q, _s);
          t.setMatrixAt(n, _m); sh.current.setMatrixAt(n, _m); n++;
          next += STEP;
        }
        acc += sl; ax = bx; az = bz; seg++;
      }
    }
    t.count = sh.current.count = n; t.visible = sh.current.visible = n > 0;
    if (n > 0) { t.instanceMatrix.needsUpdate = true; sh.current.instanceMatrix.needsUpdate = true; }
  });
  return (
    <>
      <instancedMesh ref={sh} args={[geo.sh, shMat, N]} renderOrder={5} frustumCulled={false} visible={false} />
      <instancedMesh ref={tr} args={[geo.chev, mat, N]} renderOrder={6} frustumCulled={false} visible={false} />
    </>
  );
}
