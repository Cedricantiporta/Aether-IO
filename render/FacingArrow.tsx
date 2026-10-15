// One white triangle on the ground in front of the hero showing where it faces (= where a dash goes). Two meshes, no allocations per frame.
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three';
import { world } from '../engine/world';
import { triArrowGeo } from './arrowGeo';
import { useGameStore } from '../store';
import { GameStatus } from '../types';

function tri(w: number, l: number, notch: number): BufferGeometry {
  const g = new BufferGeometry();   // flat arrowhead pointing +z (notched back edge)
  g.setAttribute('position', new Float32BufferAttribute([0, 0, l, -w, 0, 0, 0, 0, notch, 0, 0, l, 0, 0, notch, w, 0, 0], 3));
  return g;
}
const DASH_REACH = 7;

export function FacingArrow() {
  const { root, arrow, chev, chevMat, arrowMat } = useMemo(() => {
    const arrowMat = new MeshBasicMaterial({ color: 0x14100c, transparent: true, opacity: 0.85, depthWrite: false, side: DoubleSide, toneMapped: false });   // dark thin chevron
    const rimMat = new MeshBasicMaterial({ color: 0xf1e2b8, transparent: true, opacity: 0.55, depthWrite: false, side: DoubleSide, toneMapped: false });
    const chevMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide, toneMapped: false });
    const root = new Group();
    const arrow = new Mesh(triArrowGeo(0.4, 0.66, 0.2), arrowMat); arrow.position.set(0, 0.07, 1.35); arrow.renderOrder = 6;
    const rim = new Mesh(triArrowGeo(0.5, 0.8, 0.18), rimMat); rim.position.set(0, 0.06, 1.28); rim.renderOrder = 5;
    const chev = new Group();
    for (let i = 0; i < 3; i++) { const m = new Mesh(tri(0.42, 0.5, 0.22), chevMat); m.position.set(0, 0.05, 3 + i * ((DASH_REACH - 3) / 2)); m.renderOrder = 5; chev.add(m); }
    root.add(rim, arrow, chev);
    return { root, arrow, chev, chevMat, arrowMat };
  }, []);
  useFrame(({ clock }) => {
    const p = world.player, st = useGameStore.getState().status;
    const run = st === GameStatus.PLAYING, town = st === GameStatus.MENU && world.village.area === 'TOWN';
    root.visible = p.alive && (run || town) && !p.anim.dashing;
    if (!root.visible) return;
    root.position.set(p.pos.x, 0, p.pos.z);
    root.rotation.y = p.facing;
    arrowMat.opacity = 0.75 + 0.12 * Math.sin(clock.elapsedTime * 4);
    chev.visible = false;   // single arrow only (user preference)
    if (chev.visible) chevMat.opacity = 0.12 + 0.06 * Math.sin(clock.elapsedTime * 3);
    void arrow;
  });
  return <primitive object={root} />;
}
