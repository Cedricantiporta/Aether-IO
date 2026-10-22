// Ground ring under the click-locked enemy: one quad, one cheap shader (rotating dashed ring + soft glow),
// red-orange for normal enemies, bigger and gold for bosses. No allocations per frame.
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Mesh, PlaneGeometry, ShaderMaterial, DoubleSide } from 'three';
import { world } from '../engine/world';
import { currentTarget } from '../engine/systems/combat';
import { trapAim, lockedTrap } from '../engine/systems/roomTraps';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = `
uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
void main(){
  vec2 q = (vUv - 0.5) * 2.0;
  float r = length(q);
  float ang = atan(q.y, q.x);
  float ring = smoothstep(0.80, 0.86, r) * (1.0 - smoothstep(0.94, 1.0, r));
  float dash = 0.55 + 0.45 * step(0.0, sin(ang * 6.0 - uTime * 2.2));
  float thin = smoothstep(0.66, 0.68, r) * (1.0 - smoothstep(0.70, 0.72, r)) * step(0.0, sin(ang * 3.0 + uTime * 3.0)) * 0.55;
  float glow = (1.0 - smoothstep(0.0, 0.8, r)) * 0.12 + smoothstep(0.7, 0.86, r) * (1.0 - smoothstep(0.86, 1.0, r)) * 0.25;
  float pulse = 0.85 + 0.15 * sin(uTime * 4.0);
  float a = (ring * dash + thin + glow) * pulse;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * (1.0 + ring * 0.35), clamp(a, 0.0, 0.95));
}`;

const RED = new Color(0xff5a2a), GOLD = new Color(0xffc93a);

export function TargetRing() {
  const mesh = useMemo(() => {
    const g = new PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    const m = new Mesh(g, new ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      uniforms: { uColor: { value: new Color() }, uTime: { value: 0 } },
    }));
    m.frustumCulled = false; m.renderOrder = 5; m.visible = false;
    return m;
  }, []);

  useFrame(({ clock }) => {
    const e = currentTarget();
    const tr = e ? null : (lockedTrap() ?? trapAim.obj);   // (owner) a targeted siege weapon / tower / statue gets the ring too
    if (!e && tr && !tr.dead && world.player.alive) {
      const u = (mesh.material as ShaderMaterial).uniforms;
      u.uTime.value = clock.elapsedTime; u.uColor.value.copy(RED);
      const d = tr.rad * 2 + 1.8;
      mesh.visible = true; mesh.position.set(tr.x, 0.1, tr.z); mesh.scale.set(d, 1, d);
      return;
    }
    if (!e || e.hideT > 0 || !world.player.alive) { mesh.visible = false; return; }
    const u = (mesh.material as ShaderMaterial).uniforms;
    u.uTime.value = clock.elapsedTime;
    u.uColor.value.copy(e.boss ? GOLD : RED);
    const d = Math.max(1.6, e.radius * 2 * (e.boss ? 1.9 : 1.55) + 0.6);
    mesh.visible = true;
    mesh.position.set(e.pos.x, 0.1, e.pos.z);
    mesh.scale.set(d, 1, d);
  });
  return <primitive object={mesh} />;
}
