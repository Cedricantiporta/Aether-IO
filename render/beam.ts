import { AdditiveBlending, Color, DoubleSide, ShaderMaterial } from 'three';

/** Additive vertical light beam / pillar material. Geometry: open cylinder (uv.y 0 = bottom, 1 = top). */
export function makeBeamMaterial(hex: number | string, opts: { speed?: number; stripes?: number; power?: number } = {}) {
  const c = new Color(hex as any);
  return new ShaderMaterial({
    uniforms: { uColor: { value: c }, uTime: { value: 0 }, uAlpha: { value: 1 }, uSpeed: { value: opts.speed ?? 2 }, uStripes: { value: opts.stripes ?? 6 }, uPower: { value: opts.power ?? 1.4 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uTime; uniform float uAlpha; uniform float uSpeed; uniform float uStripes; uniform float uPower; varying vec2 vUv;
      void main(){
        float fade = pow(1.0 - vUv.y, uPower) * smoothstep(0.0, 0.04, vUv.y);
        float s = 0.55 + 0.45 * sin(vUv.x * 6.2831 * uStripes + vUv.y * 9.0 - uTime * uSpeed);
        float a = fade * s * uAlpha;
        gl_FragColor = vec4(uColor * 1.8, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  });
}
