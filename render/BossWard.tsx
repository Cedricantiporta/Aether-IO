import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, FrontSide, Mesh, ShaderMaterial } from 'three';
import { world } from '../engine/world';
import { wardedBossId } from '../engine/systems/bossMech';

/** The shield sphere around a warded (immune) boss, or a boss holding a damage shield (e.shield): fresnel rim + slow rising hex-like bands, pulses while it holds. */
export function BossWard() {
  const m = useRef<Mesh>(null!);
  const mat = useMemo(() => new ShaderMaterial({
    transparent: true, depthWrite: false, side: FrontSide, blending: AdditiveBlending,
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, uC: { value: new Color(0.5, 0.75, 1.0) } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uT; uniform float uA; uniform vec3 uC; varying vec3 vN; varying vec3 vV; varying vec3 vP;'
      + ' void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.0);'
      + ' float a = atan(vP.z, vP.x) * 6.0; float b = vP.y * 9.0 - uT * 1.6;'
      + ' float hex = smoothstep(0.86, 0.98, max(abs(sin(a + b * 0.5)), abs(sin(b))));'
      + ' gl_FragColor = vec4(uC * (0.3 + 1.5 * f + 0.7 * hex), (0.06 + 0.55 * f + 0.22 * hex) * uA); }',
  }), []);
  useFrame((_, dt) => {
    let id = wardedBossId();
    if (id < 0) for (let i = 0; i < world.enemies.length; i++) { const x = world.enemies[i]; if (x.active && x.boss && !x.decoy && x.shield > 1) { id = i; break; } }   // (owner) a boss with a damage shield (Slime King's 30%) shows the sphere too
    const e = id >= 0 ? world.enemies[id] : null;
    const on = !!e && e.active && e.state !== 'DYING';
    mat.uniforms.uA.value = on ? Math.min(1, mat.uniforms.uA.value + dt * 3) : Math.max(0, mat.uniforms.uA.value - dt * 4);
    m.current.visible = mat.uniforms.uA.value > 0.01;
    if (!on || !e) return;
    mat.uniforms.uT.value += dt;
    const r = Math.max(e.radius * 1.45, e.scale * 0.8) * (1 + Math.sin(mat.uniforms.uT.value * 2.4) * 0.025);
    m.current.position.set(e.pos.x, r * 0.55, e.pos.z);
    m.current.scale.setScalar(r);
  });
  return <mesh ref={m} material={mat} visible={false} renderOrder={30}><sphereGeometry args={[1, 40, 24]} /></mesh>;
}
