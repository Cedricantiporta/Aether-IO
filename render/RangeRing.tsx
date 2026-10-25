// (owner 2026-10-25) Attack range ring: a soft dashed circle round the hero at the basic-attack reach (player.heroRange), shown in
// runs while a monster is near (on screen) - fades in / out. One quad, one cheap shader, no per-frame allocations.
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, PlaneGeometry, ShaderMaterial, DoubleSide, Color } from 'three';
import { world } from '../engine/world';
import { useGameStore } from '../store';
import { heroRange } from '../engine/systems/player';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// uPx: ring width as a fraction of the radius (so the line stays ~0.18 m thick at any range)
const FS = `
uniform vec3 uColor; uniform float uTime; uniform float uAlpha; uniform float uPx; varying vec2 vUv;
void main(){
  vec2 q = (vUv - 0.5) * 2.0;
  float r = length(q);
  float ang = atan(q.y, q.x);
  float line = smoothstep(1.0 - uPx * 2.0, 1.0 - uPx, r) * (1.0 - smoothstep(1.0 - uPx * 0.2, 1.0, r));
  float dash = step(0.0, sin(ang * 48.0 - uTime * 1.2));
  float fill = smoothstep(0.55, 1.0, r) * (1.0 - step(1.0, r)) * 0.07;
  float a = (line * (0.35 + 0.65 * dash) + fill) * uAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;
const NEAR_R = 30;   // a monster within this many metres = "on screen / in combat"

export function RangeRing() {
  const mesh = useMemo(() => {
    const g = new PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    const m = new Mesh(g, new ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { uColor: { value: new Color('#fff1c4') }, uTime: { value: 0 }, uAlpha: { value: 0 }, uPx: { value: 0.02 } },
    }));
    m.frustumCulled = false; m.renderOrder = 4; m.visible = false;
    return m;
  }, []);
  const S = useMemo(() => ({ near: false, acc: 1, a: 0 }), []);
  useFrame(({ clock }, dt) => {
    const p = world.player;
    const live = world.room.active && p.alive;
    S.acc += dt;
    if (live && S.acc > 0.2) {   // any monster near? (checked 5x a second)
      S.acc = 0; S.near = false;
      const es = world.enemies;
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        if (!e.active || e.state === 'DYING') continue;
        if ((e.pos.x - p.pos.x) ** 2 + (e.pos.z - p.pos.z) ** 2 < NEAR_R * NEAR_R) { S.near = true; break; }
      }
    }
    S.a += ((live && S.near ? 1 : 0) - S.a) * Math.min(1, dt * 6);
    if (S.a < 0.02) { mesh.visible = false; return; }
    const R = heroRange(useGameStore.getState());
    const u = (mesh.material as ShaderMaterial).uniforms;
    u.uTime.value = clock.elapsedTime; u.uAlpha.value = S.a * 0.8; u.uPx.value = Math.min(0.08, 0.18 / R);
    mesh.visible = true;
    mesh.position.set(p.pos.x, 0.08, p.pos.z);
    mesh.scale.set(R * 2, 1, R * 2);
  });
  return <primitive object={mesh} />;
}
