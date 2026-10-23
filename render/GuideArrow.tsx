// Ground guide trail in the town hub, ALONG THE WALKABLE ROUTE (engine/systems/townPath route hint) to
// where the current objective continues (engine/systems/questNav): the main quest's NPC / shop first (gold), then a
// side quest to hand in (green), then the main quest's field objective (sky blue, the
// Adventure Portal). Inside the castle it leads to the King / a castle NPC or the exit.
import React, { useMemo, useRef } from 'react';
import { liftAt } from './lift';
import { useFrame } from '@react-three/fiber';
import { Color, ConeGeometry, DoubleSide, Euler, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, RingGeometry, Vector3 } from 'three';
import { thinArrowGeo } from './arrowGeo';
import { world } from '../engine/world';
import { useGameStore } from '../store';
import { GameStatus } from '../types';
import { useUiStore } from '../ui/uiStore';
import { npcMarkers } from '../engine/systems/npcQuestLogic';
import { mainNav, navNpc, npcArea, type NavTarget } from '../engine/systems/questNav';
import { updateRouteHint, routeHintPath } from '../engine/systems/townPath';
import { gateOpen } from '../story';

// (owner) colour by what it leads to: main quest gold, side quest green, the Adventure Portal its own sky blue
const GOLD = new Color('#ffc53d'), QUEST = new Color('#5fe07a'), PORTAL = new Color('#7ad8ff');
const tgt = { x: 0, z: 0, reach: 2, col: GOLD, hideR: 4.5, mark: false };
const use = (t: NavTarget, col: Color): boolean => { tgt.x = t.x; tgt.z = t.z; tgt.reach = t.reach; tgt.col = col; tgt.hideR = Math.max(4.5, t.reach + 1); tgt.mark = !t.hop; return true; };

function pickTarget(): boolean {
  if (world.village.area === 'CAVE' && world.village.cave.floor > 1) return false;   // deep cave floors: no arrow (the way out is the trip's business)
  const st = useGameStore.getState();
  // 1) the main quest when it waits on someone / a shop in town (gold)
  const main = mainNav();
  if (main && !main.field) return use(main, GOLD);
  // 2) a side quest ready to hand in (green)
  const mk = npcMarkers(), here = world.village.area;
  let npcI = -1;
  for (let i = 0; i < mk.length; i++) if (mk[i] === 3 && (npcI < 0 || npcArea(i) === here)) npcI = i;   // prefer one in the current area
  if (npcI >= 0) return use(navNpc(npcI), QUEST);
  // 3) the main quest's field objective: out to the Adventure Portal (once the gate is open)
  if (main && gateOpen(st.story)) { use(main, PORTAL); tgt.hideR = 9; return true; }
  return false;
}

const TRAIL_N = 44, STEP = 1.25;   // chevrons along the walkable route, every STEP m, scrolling toward the goal
const _m = new Matrix4(), _q = new Quaternion(), _e = new Euler(), _p = new Vector3(), _s = new Vector3(1, 1, 1);
const groundY = (x: number, z: number): number => (world.village.area !== 'TOWN' ? 0.32 : 0.22 + liftAt(x, z));

/** Ground guide in the town hub (owner): a trail of chevrons ">>>>" along the walkable route to the current goal, a pulsing
 *  ring at the goal and a bobbing arrow above it (NPC / shop / portal). Hidden once the hero is there. */
export function GuideArrow() {
  const geo = useMemo(() => ({ chev: thinArrowGeo(0.5, 0.5, 0, 0.22), chevShadow: thinArrowGeo(0.58, 0.58, 0, 0.42).translate(0.06, -0.01, -0.1), ring: new RingGeometry(0.95, 1.2, 40).rotateX(-Math.PI / 2), bob: new ConeGeometry(0.34, 0.8, 4).rotateX(Math.PI) }), []);
  const mat = useMemo(() => new MeshBasicMaterial({ transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false, side: DoubleSide, color: GOLD.clone() }), []);
  const shadowMat = useMemo(() => new MeshBasicMaterial({ transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false, side: DoubleSide, color: '#1a1410' }), []);   // (owner) dark underlay so the trail reads on light paving
  const ringMat = useMemo(() => new MeshBasicMaterial({ transparent: true, opacity: 0.75, toneMapped: false, depthWrite: false, side: DoubleSide, color: GOLD.clone() }), []);
  const bobMat = useMemo(() => new MeshBasicMaterial({ toneMapped: false, color: GOLD.clone() }), []);
  const trail = useRef<InstancedMesh>(null!), trailSh = useRef<InstancedMesh>(null!), ring = useRef<Mesh>(null!), bob = useRef<Mesh>(null!);
  const S = useRef({ acc: 1, has: false });
  useFrame(({ clock }, dt) => {
    const tr = trail.current; if (!tr) return;
    const on = useGameStore.getState().status === GameStatus.MENU && useUiStore.getState().titleDone && !world.village.pending;
    const s = S.current, p = world.player.pos;
    s.acc += dt;
    if (on && s.acc > 0.25) {
      s.has = pickTarget(); mat.color.copy(tgt.col); ringMat.color.copy(tgt.col); bobMat.color.copy(tgt.col);
      if (s.has) updateRouteHint(p.x, p.z, tgt.x, tgt.z, tgt.reach, s.acc);
      s.acc = 0;
    }
    const far = Math.hypot(tgt.x - p.x, tgt.z - p.z);
    const show = on && s.has;
    const t = clock.elapsedTime;
    // goal marker: ring + bobbing arrow (stay visible when the hero is close, until the talk / shop opens)
    ring.current.visible = bob.current.visible = show && tgt.mark;
    if (ring.current.visible) {
      const k = 1 + Math.sin(t * 3) * 0.08;
      ring.current.position.set(tgt.x, groundY(tgt.x, tgt.z) + 0.02, tgt.z); ring.current.scale.set(k, 1, k);
      bob.current.position.set(tgt.x, groundY(tgt.x, tgt.z) + 3.3 + Math.sin(t * 3.2) * 0.22, tgt.z); bob.current.rotation.y = t * 1.6;
    }
    // trail: walk the planned route from the hero, a chevron every STEP m (offset scrolls so they flow toward the goal)
    let n = 0;
    if (show && far > tgt.hideR) {
      const r = routeHintPath();
      let ax = p.x, az = p.z, k = r.n > 0 ? r.i : 0, until = 1.4 + ((t * 1.6) % STEP);
      for (;;) {
        const bx = k < r.n ? r.wp[k * 2] : tgt.x, bz = k < r.n ? r.wp[k * 2 + 1] : tgt.z;
        const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
        let u = until;
        while (u <= L && n < TRAIL_N) {
          const x = ax + (dx / L) * u, z = az + (dz / L) * u;
          if (Math.hypot(tgt.x - x, tgt.z - z) < tgt.reach + 0.6) { u = 1e9; k = r.n + 1; break; }   // stop short of the goal (the ring takes over)
          _e.set(0, Math.atan2(dx, dz), 0); _q.setFromEuler(_e); _p.set(x, groundY(x, z), z);
          const fade = Math.min(1, n / 3 + 0.35);
          _s.set(fade, 1, fade); _m.compose(_p, _q, _s); trailSh.current.setMatrixAt(n, _m); tr.setMatrixAt(n++, _m);
          u += STEP;
        }
        if (k > r.n || n >= TRAIL_N) break;
        until = u - L; ax = bx; az = bz; k++;
      }
    }
    tr.count = trailSh.current.count = n; tr.visible = trailSh.current.visible = n > 0;
    if (n > 0) { tr.instanceMatrix.needsUpdate = true; trailSh.current.instanceMatrix.needsUpdate = true; }
  });
  return (
    <>
      <instancedMesh ref={trailSh} args={[geo.chevShadow, shadowMat, TRAIL_N]} renderOrder={4} frustumCulled={false} visible={false} />
      <instancedMesh ref={trail} args={[geo.chev, mat, TRAIL_N]} renderOrder={5} frustumCulled={false} visible={false} />
      <mesh ref={ring} geometry={geo.ring} material={ringMat} renderOrder={5} visible={false} />
      <mesh ref={bob} geometry={geo.bob} material={bobMat} renderOrder={6} visible={false} />
    </>
  );
}
