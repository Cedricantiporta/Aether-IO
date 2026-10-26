import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, FrontSide, Mesh, ShaderMaterial } from 'three';
import { world } from '../engine/world';
import { wardedBossId } from '../engine/systems/bossMech';

/** The shield sphere around a warded (immune) boss, or a boss holding a damage shield (e.shield): fresnel rim + slow rising hex-like bands, pulses while it holds. */
export function BossWard() {
  const m = useRef<Mesh>(null!);
  const ill = useRef<Mesh[]>([]);
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
    if (id < 0) for (let i = 0; i < world.enemies.length; i++) { const x = world.enemies[i]; if (x.active && x.boss && !x.decoy && x.shield > 1 && x.kind !== 'SPLITTER') { id = i; break; } }   // (owner) no bubble on the Slime King (SPLITTER) - its shield shows on the boss bar; other shielded bosses with a damage shield (Slime King's 30%) shows the sphere too
    const e = id >= 0 ? world.enemies[id] : null;
    const on = !!e && e.active && e.state !== 'DYING';
    mat.uniforms.uA.value = on ? Math.min(1, mat.uniforms.uA.value + dt * 3) : Math.max(0, mat.uniforms.uA.value - dt * 4);
    m.current.visible = mat.uniforms.uA.value > 0.01;
    // Malakar's illusions wear the same shield as the real one (so the shield never tells them apart)
    let nI = 0;
    for (let i = 0; i < world.enemies.length && nI < 2; i++) {
      const x = world.enemies[i];
      if (!on || !e || e.kind !== 'BOSS_LICH' || !x.active || !x.decoy || x.trickKind !== 1 || x.state === 'DYING') continue;
      const mm = ill.current[nI++]; if (!mm) break;
      const r = Math.min(Math.max(x.radius * 1.45, x.scale * 0.8), x.radius * 1.15 + 0.8) * (1 + Math.sin(mat.uniforms.uT.value * 2.4) * 0.025);
      mm.visible = true; mm.position.set(x.pos.x, r * 0.55, x.pos.z); mm.scale.setScalar(r);
    }
    for (let k = nI; k < 2; k++) if (ill.current[k]) ill.current[k].visible = false;
    if (!on || !e) return;
    mat.uniforms.uT.value += dt;
    const r = Math.min(Math.max(e.radius * 1.45, e.scale * 0.8), e.radius * 1.15 + 0.8) * (   // (owner: the Slime King's bubble was huge) hug the body
      1 + Math.sin(mat.uniforms.uT.value * 2.4) * 0.025);
    m.current.position.set(e.pos.x, r * 0.55, e.pos.z);
    m.current.scale.setScalar(r);
  });
  return (
    <>
      <mesh ref={m} material={mat} visible={false} renderOrder={30}><sphereGeometry args={[1, 40, 24]} /></mesh>
      {[0, 1].map((k) => <mesh key={k} ref={(o) => { if (o) ill.current[k] = o; }} material={mat} visible={false} renderOrder={30}><sphereGeometry args={[1, 40, 24]} /></mesh>)}
    </>
  );
}
