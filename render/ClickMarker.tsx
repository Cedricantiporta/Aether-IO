// Click-to-move / click-to-target marker (owner): a gold ring (dark-edged) that snaps inward with an outer ripple where the ground
// was clicked (red on an enemy). Reads engine/systems/target `clickMark`; drawn on top so terrain never hides it.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Mesh, MeshBasicMaterial, RingGeometry, CircleGeometry } from 'three';
import { clickMark } from '../engine/systems/target';
import { liftAt } from './lift';

const LIFE = 650;   // ms

export function ClickMarker() {
  const g = useRef<Group>(null), shade = useRef<Mesh>(null), inner = useRef<Mesh>(null), outer = useRef<Mesh>(null), dot = useRef<Mesh>(null);
  const r = useMemo(() => {
    const mk = () => new MeshBasicMaterial({ color: '#ffbf2a', transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    return { ring: new RingGeometry(0.78, 1, 40), thin: new RingGeometry(0.93, 1, 40), disc: new CircleGeometry(0.16, 20), shade: new RingGeometry(0.72, 1.06, 40), mi: mk(), mo: mk(), md: mk(), ms: new MeshBasicMaterial({ color: '#1a120a', transparent: true, depthTest: false, depthWrite: false }) };
  }, []);
  useFrame(() => {
    const G = g.current; if (!G) return;
    const k = (performance.now() - clickMark.t) / LIFE;
    if (k < 0 || k >= 1) { G.visible = false; return; }
    G.visible = true;
    G.position.set(clickMark.x, liftAt(clickMark.x, clickMark.z) + 0.08, clickMark.z);
    const col = clickMark.attack ? '#ff4a3a' : '#ffbf2a', e = 1 - (1 - k) ** 3, fade = 1 - k;
    r.mi.color.set(col); r.mo.color.set(col); r.md.color.set(col);
    const base = clickMark.attack ? 1.3 : 1;
    inner.current!.scale.setScalar(base * (1.1 - 0.75 * e));   // snaps inward
    r.mi.opacity = Math.min(1, fade * 1.6);
    shade.current!.scale.copy(inner.current!.scale); r.ms.opacity = Math.min(0.8, fade * 1.2);   // dark under-ring: readable on bright stone too
    outer.current!.scale.setScalar(base * (0.4 + 1.4 * e));    // ripple outward
    r.mo.opacity = fade * 0.7;
    dot.current!.scale.setScalar(k < 0.15 ? k / 0.15 : 1);
    r.md.opacity = fade;
  });
  return (
    <group ref={g} visible={false} renderOrder={20}>
      <mesh ref={shade} geometry={r.shade} material={r.ms} rotation-x={-Math.PI / 2} renderOrder={19} />
      <mesh ref={inner} geometry={r.ring} material={r.mi} rotation-x={-Math.PI / 2} renderOrder={20} />
      <mesh ref={outer} geometry={r.thin} material={r.mo} rotation-x={-Math.PI / 2} renderOrder={20} />
      <mesh ref={dot} geometry={r.disc} material={r.md} rotation-x={-Math.PI / 2} renderOrder={20} />
    </group>
  );
}
