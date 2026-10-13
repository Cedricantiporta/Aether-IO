// Ground indicator for aimed skill casting (cheap shader decals): line / cone / circle / ring / dash-arrow.
// Team-gold; red when the target was clamped to max range or the touch cancel zone is active; grey when not castable.
import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Mesh, PlaneGeometry, ShaderMaterial, DoubleSide } from 'three';
import { world } from '../engine/world';
import { aimState, Shape } from '../engine/systems/aim';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = `
uniform float uType; uniform vec3 uColor; uniform float uAlpha; uniform float uTime; uniform float uHalf; uniform vec2 uSize;
varying vec2 vUv;
void main(){
  vec2 q = (vUv - 0.5) * 2.0;
  float a = 0.0; vec3 c = uColor;
  if (uType < 0.5) { // LINE (width along x, length along y)
    float across = abs(q.x); float along = vUv.y;
    float inside = step(across, 1.0);
    float edge = smoothstep(0.82, 1.0, across) * inside;
    float chev = step(fract(along * uSize.y / 2.2 + across * 0.6 - uTime * 1.8), 0.3);
    float tip = smoothstep(0.0, 0.04, 1.0 - along) * smoothstep(0.0, 0.02, along);
    a = inside * (0.17 + chev * 0.09) + edge * 0.6 + (1.0 - smoothstep(0.0, 0.03, abs(along - 1.0))) * 0.5;
    a *= tip;
  } else if (uType < 1.5) { // ARROW (dash direction)
    float across = abs(q.x); float along = vUv.y;
    float shaft = step(across, 0.38) * step(along, 0.72);
    float headW = (1.0 - along) / 0.28;
    float head = step(0.72, along) * step(across, headW);
    float edge = (shaft + head) > 0.0 ? 1.0 : 0.0;
    float rim = edge * smoothstep(0.0, 0.18, abs(fract(along * 3.0 - uTime * 2.0) - 0.5));
    a = edge * 0.38 + rim * 0.25;
  } else if (uType < 2.5) { // CIRCLE
    float r = length(q);
    float fill = step(r, 1.0) * 0.17;
    float ring = smoothstep(0.9, 0.97, r) * step(r, 1.0);
    float pulse = 0.5 + 0.5 * sin(uTime * 5.0);
    float cross = (smoothstep(0.03, 0.0, abs(q.x)) + smoothstep(0.03, 0.0, abs(q.y))) * step(r, 0.12) * 1.0;
    a = fill + ring * (0.65 + 0.2 * pulse) + cross * 0.5;
  } else if (uType < 3.5) { // RING (self radius)
    float r = length(q);
    float ring = smoothstep(0.92, 0.985, r) * step(r, 1.0);
    float dash = step(0.5, fract(atan(q.y, q.x) * 3.8197 + uTime * 0.3));
    a = ring * (0.5 + 0.35 * dash) + step(r, 1.0) * 0.08;
  } else { // CONE (apex at plane centre, forward = +y)
    float r = length(q);
    float ang = abs(atan(q.x, q.y));
    float inCone = step(ang, uHalf) * step(q.y, 1.0) * step(r, 1.0) * step(0.0, q.y);
    float edgeA = smoothstep(uHalf - 0.05, uHalf, ang) * inCone;
    float edgeR = smoothstep(0.93, 1.0, r) * inCone;
    float chev = step(fract(r * 6.0 - uTime * 2.0), 0.3);
    a = inCone * (0.16 + chev * 0.07) + (edgeA + edgeR) * 0.6;
  }
  if (a < 0.01) discard;
  gl_FragColor = vec4(c * (1.0 + a * 0.4), clamp(a, 0.0, 0.9) * uAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const GOLD = new Color(0xffd54a), RED = new Color(0xff4a3a), GREY = new Color(0x9aa0a8);

function mkMat(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    uniforms: { uType: { value: 0 }, uColor: { value: new Color() }, uAlpha: { value: 1 }, uTime: { value: 0 }, uHalf: { value: 0.3 }, uSize: { value: [1, 1] } },
  });
}

export function AimIndicator() {
  const sys = useMemo(() => {
    const g = new PlaneGeometry(1, 1); g.rotateX(Math.PI / 2); // +uv.y -> +z (forward)
    const main = new Mesh(g, mkMat()), guide = new Mesh(g, mkMat());
    for (const m of [main, guide]) { m.frustumCulled = false; m.renderOrder = 6; m.visible = false; }
    return { main, guide };
  }, []);

  useFrame(({ clock }) => {
    const A = aimState, p = world.player;
    const { main, guide } = sys;
    if (!A.active || !p.alive) { main.visible = false; guide.visible = false; return; }
    const t = clock.elapsedTime;
    const col = A.cancelZone ? RED : !A.castable ? GREY : A.clamped ? RED : GOLD;
    const alpha = A.castable ? 1 : 0.55;
    const mm = main.material as ShaderMaterial, gm = guide.material as ShaderMaterial;
    mm.uniforms.uTime.value = gm.uniforms.uTime.value = t;
    mm.uniforms.uColor.value.copy(col); gm.uniforms.uColor.value.copy(col);
    mm.uniforms.uAlpha.value = alpha; gm.uniforms.uAlpha.value = alpha * 0.8;
    const yaw = Math.atan2(A.dx, A.dz);
    guide.visible = false;
    switch (A.shape) {
      case Shape.LINE: {
        const w = Math.max(0.8, A.width), l = A.len;
        main.visible = true; mm.uniforms.uType.value = 0; mm.uniforms.uSize.value = [w, l];
        main.position.set(p.pos.x + A.dx * l * 0.5, 0.12, p.pos.z + A.dz * l * 0.5); main.rotation.set(0, yaw, 0); main.scale.set(w, 1, l);
        break;
      }
      case Shape.ARROW: {
        main.visible = true; mm.uniforms.uType.value = 1; mm.uniforms.uSize.value = [A.width, A.len];
        main.position.set(p.pos.x + A.dx * A.len * 0.5, 0.12, p.pos.z + A.dz * A.len * 0.5); main.rotation.set(0, yaw, 0); main.scale.set(A.width * 1.6, 1, A.len);
        break;
      }
      case Shape.CIRCLE: {
        main.visible = true; mm.uniforms.uType.value = 2;
        const s = Math.max(1, A.radius) * 2;
        main.position.set(A.x, 0.12, A.z); main.rotation.set(0, 0, 0); main.scale.set(s, 1, s);
        // guide line from the hero to the target
        const dx = A.x - p.pos.x, dz = A.z - p.pos.z, l = Math.hypot(dx, dz);
        if (l > 1) {
          guide.visible = true; gm.uniforms.uType.value = 0; gm.uniforms.uSize.value = [0.6, l];
          guide.position.set(p.pos.x + dx * 0.5, 0.11, p.pos.z + dz * 0.5); guide.rotation.set(0, Math.atan2(dx, dz), 0); guide.scale.set(0.6, 1, l);
        }
        break;
      }
      case Shape.RING: {
        main.visible = A.radius > 0.1; mm.uniforms.uType.value = 3;
        const s = Math.max(1, A.radius) * 2;
        main.position.set(p.pos.x, 0.12, p.pos.z); main.rotation.set(0, 0, 0); main.scale.set(s, 1, s);
        break;
      }
      case Shape.CONE: {
        main.visible = true; mm.uniforms.uType.value = 4; mm.uniforms.uHalf.value = A.half;
        const s = A.len * 2;
        main.position.set(p.pos.x, 0.12, p.pos.z); main.rotation.set(0, yaw, 0); main.scale.set(s, 1, s);
        break;
      }
      default: main.visible = false;
    }
  });
  return <><primitive object={sys.main} /><primitive object={sys.guide} /></>;
}
