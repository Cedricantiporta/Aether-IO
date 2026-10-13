import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BackSide, CanvasTexture, Color, DirectionalLight, Group, Mesh, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial,
  SRGBColorSpace, Vector3,
} from 'three';
import { world } from '../engine/world';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { QualityCfg } from './quality';
import { mulberry32 } from './util';
import { isLobbyStatus } from './CameraRig';

export const FOG_COLOR = '#cfe6f2';
export const SUN_DIR = new Vector3(-0.55, 0.72, 0.42).normalize();

const SKY_VS = /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const SKY_FS = /* glsl */ `
varying vec3 vDir; uniform vec3 uSun;
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 horizon = vec3(1.0, 0.93, 0.78);
  vec3 mid = vec3(0.55, 0.80, 1.0);
  vec3 zenith = vec3(0.20, 0.50, 0.92);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
  col = mix(col, zenith, smoothstep(0.18, 0.85, h));
  col = mix(vec3(0.82, 0.90, 0.88), col, smoothstep(-0.2, 0.02, h));
  float s = max(dot(d, normalize(uSun)), 0.0);
  col += vec3(1.0, 0.85, 0.55) * pow(s, 14.0) * 0.45;
  col += vec3(1.0, 0.95, 0.8) * smoothstep(0.9985, 0.9995, s) * 3.0;
  col += vec3(1.0, 0.9, 0.7) * pow(s, 400.0) * 1.5;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function cloudTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const ctx = cv.getContext('2d')!;
  const rnd = mulberry32(7);
  for (let i = 0; i < 22; i++) {
    const x = 40 + rnd() * 176, y = 70 - Math.abs(x - 128) * 0.15 + (rnd() - 0.5) * 22, r = 18 + rnd() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.6, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new CanvasTexture(cv); t.colorSpace = SRGBColorSpace; return t;
}

export function Sky({ q }: { q: QualityCfg }) {
  const dome = useRef<Mesh>(null!);
  const clouds = useRef<Group>(null!);
  const { camera } = useThree();
  const mat = useMemo(() => new ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: { uSun: { value: new Vector3(-0.45, 0.4, -0.78) } }, side: BackSide, depthWrite: false, fog: false }), []);
  const cloudMat = useMemo(() => new SpriteMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, fog: false, opacity: 0.95, color: new Color(1, 1, 1) }), []);
  const list = useMemo(() => {
    const r = mulberry32(21);
    return Array.from({ length: q.clouds }, (_, i) => ({ a: (i / q.clouds) * Math.PI * 2 + r() * 0.5, h: 30 + r() * 45, d: 200 + r() * 60, s: 90 + r() * 70, sp: 0.002 + r() * 0.003 }));
  }, [q.clouds]);

  useFrame((_, dt) => {
    dome.current.position.copy(camera.position);
    clouds.current.position.set(camera.position.x, 0, camera.position.z);
    const ch = clouds.current.children;
    for (let i = 0; i < ch.length; i++) {
      const c = list[i]; c.a += c.sp * dt;
      ch[i].position.set(Math.cos(c.a) * c.d, c.h, Math.sin(c.a) * c.d);
    }
  });
  return (
    <>
      <mesh ref={dome} material={mat} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[330, 32, 16]} />
      </mesh>
      <group ref={clouds}>
        {list.map((c, i) => <sprite key={i} material={cloudMat} scale={[c.s, c.s * 0.42, 1]} renderOrder={-9} />)}
      </group>
    </>
  );
}

export function Lighting({ q }: { q: QualityCfg }) {
  const sun = useRef<DirectionalLight>(null!);
  useEffect(() => {
    const l = sun.current;
    const c = l.shadow.camera;
    c.left = -38; c.right = 38; c.top = 38; c.bottom = -38; c.near = 1; c.far = 170; c.updateProjectionMatrix();
    l.shadow.bias = -0.0004; l.shadow.normalBias = 0.05;
    l.shadow.mapSize.set(q.shadowMap || 512, q.shadowMap || 512);
    l.shadow.map?.dispose(); (l.shadow as any).map = null;
  }, [q.shadowMap]);
  const t = useRef(new Vector3());
  useFrame(() => {
    const l = sun.current; if (!l) return;
    const lobby = isLobbyStatus(useGameStore.getState().status);
    const px = lobby ? 0 : world.player.pos.x, pz = lobby ? -10 : world.player.pos.z;
    // snap to shadow texel grid to avoid shimmering
    const texel = 76 / (q.shadowMap || 1024);
    const tx = Math.round(px / texel) * texel, tz = Math.round(pz / texel) * texel;
    t.current.set(tx, 0, tz);
    l.target.position.copy(t.current);
    l.position.copy(t.current).addScaledVector(SUN_DIR, 90);
    l.target.updateMatrixWorld();
  });
  return (
    <>
      <hemisphereLight args={[0xcfe8ff, 0x6f8f45, 1.25]} />
      <directionalLight ref={sun} color={0xfff0d2} intensity={3.1} castShadow={q.shadowMap > 0} />
      <SunTarget sun={sun} />
    </>
  );
}
function SunTarget({ sun }: { sun: React.RefObject<DirectionalLight> }) {
  const scene = useThree((s) => s.scene);
  useEffect(() => { const t = sun.current?.target; if (t) { scene.add(t); return () => { scene.remove(t); }; } }, [scene, sun]);
  return null;
}
