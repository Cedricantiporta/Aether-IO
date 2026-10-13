// Ground-zone decals (telegraphs, fire, black hole, frost, poison, shockwave, puddles, gas vents, wildfire) via one instanced shader.
import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Object3D, PlaneGeometry, ShaderMaterial,
} from 'three';
import { world } from '../engine/world';
import type { Zone, ZoneKind } from '../engine/types';
import { gasActive } from '../engine/systems/zones';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { CELL, FX, embers, smokePuff } from './fx';
import { TAU, clamp } from './util';

const MAXZ = 192;
const TYPE: Record<ZoneKind, number> = { TELEGRAPH_CIRCLE: 0, TELEGRAPH_LINE: 1, FIRE: 2, BLACKHOLE: 3, FROST_NOVA: 4, POISON_POOL: 5, SHOCKWAVE: 6, PUDDLE: 7, GAS: 8, WILDFIRE: 9, TORNADO: 3, FROST_FIELD: 4, METEOR_SHADOW: 0 };
const PAD = 1.25;

const VS = `attribute vec4 iP; attribute vec3 iC; varying vec2 vQ; varying vec4 vP; varying vec3 vC; varying vec2 vS;
void main(){
  vQ = position.xz * 2.0; vP = iP; vC = iC;
  vS = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[2].xyz));
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const FS = `
uniform float uTime; varying vec2 vQ; varying vec4 vP; varying vec3 vC; varying vec2 vS;
const float PAD = ${PAD.toFixed(2)};
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  float type = vP.x, prog = vP.y, aux = vP.z;
  vec2 q = vQ; float r = length(q) * PAD; float ang = atan(q.y, q.x);
  vec4 col = vec4(0.0);
  if (type < 0.5) {
    float edge = smoothstep(0.92, 0.96, r) * smoothstep(1.04, 1.0, r);
    float disc = step(r, 1.0);
    float fill = smoothstep(prog + 0.015, prog - 0.015, r) * disc;
    float hatch = 0.5 + 0.5 * sin((q.x + q.y) * PAD * 16.0 - uTime * 2.0);
    float front = smoothstep(0.035, 0.0, abs(r - prog)) * step(0.02, prog);
    float a = disc * (0.13 + hatch * 0.05) + fill * 0.38 + edge * (0.7 + 0.3 * sin(uTime * 12.0)) + front * 0.5;
    col = vec4(mix(vec3(1.0, 0.14, 0.08), vec3(1.0, 0.5, 0.25), fill * 0.6 + front) * (1.0 + edge * 0.6), a);
  } else if (type < 1.5) {
    float across = abs(q.x) * PAD; float along = q.y * 0.5 + 0.5;
    float inside = step(across, 1.0) * step(0.0, along) * step(along, 1.0);
    float border = inside * (smoothstep(0.88, 0.94, across) + smoothstep(0.985, 0.94, along) * step(0.94, along) + step(along, 0.012));
    float fill = inside * smoothstep(prog + 0.01, prog - 0.01, along);
    float chev = step(fract(along * vS.y / 1.8 + abs(q.x) * PAD * 0.7 - uTime * 1.6), 0.35);
    float front = inside * smoothstep(0.03, 0.0, abs(along - prog));
    float a = inside * (0.12 + chev * 0.1) + fill * 0.34 + border * 0.7 + front * 0.6;
    col = vec4(mix(vec3(1.0, 0.14, 0.08), vec3(1.0, 0.55, 0.3), fill * 0.5 + front) * (1.0 + border * 0.6), a);
  } else if (type < 2.5 || type > 8.5) {
    float wild = step(8.5, type);
    float n = fbm(q * 3.2 * PAD + vec2(0.0, -uTime * 1.6));
    float n2 = fbm(q * 6.0 * PAD + vec2(uTime * 0.4, -uTime * 2.6));
    float body = smoothstep(1.0, 0.5, r + (n - 0.5) * 0.5);
    float flame = smoothstep(0.32, 0.85, n * 0.7 + n2 * 0.5 + (1.0 - r) * 0.45) * body;
    vec3 c = mix(vec3(0.25, 0.03, 0.0), vec3(1.0, 0.32, 0.04), flame);
    c = mix(c, vec3(1.0, 0.85, 0.3), smoothstep(0.7, 1.0, flame));
    float scorch = smoothstep(1.05, 0.85, r) * 0.45;
    float a = max(body * (0.25 + 0.6 * flame), scorch * (1.0 - flame));
    vec3 rgb = mix(vec3(0.04, 0.03, 0.02), c * (1.2 + flame * 1.3), clamp(flame * 1.5 + 0.2, 0.0, 1.0));
    col = vec4(rgb, a * aux);
  } else if (type < 3.5) {
    float arms = 0.5 + 0.5 * sin(ang * 3.0 + r * 16.0 - uTime * 5.0);
    float arms2 = 0.5 + 0.5 * sin(ang * 5.0 - r * 22.0 - uTime * 7.0);
    float disk = smoothstep(1.0, 0.18, r) * (0.3 + 0.5 * arms + 0.25 * arms2);
    float ring = smoothstep(0.09, 0.0, abs(r - 0.3 - 0.02 * sin(uTime * 6.0)));
    float core = smoothstep(0.3, 0.2, r);
    vec3 base = mix(vC * 1.8, vec3(1.0, 0.9, 1.4), ring + smoothstep(0.5, 0.2, r) * 0.4);
    float a = max(disk * 0.85 * smoothstep(1.02, 0.9, r), core) ;
    col = vec4(mix(base, vec3(0.0), core), a * aux);
  } else if (type < 4.5) {
    float f = fbm(q * 4.0 * PAD);
    float e = clamp(prog * 3.0, 0.0, 1.0);
    float disc = smoothstep(1.0, 0.8, r) * (0.18 + 0.32 * f) * smoothstep(0.0, 0.15, e);
    float ring = exp(-pow((r - e) / 0.05, 2.0)) * (1.0 - smoothstep(0.7, 1.0, prog));
    float cr = smoothstep(0.04, 0.0, abs(fract(ang * 1.9 + f * 2.0) - 0.5) - 0.46) * smoothstep(1.0, 0.2, r) * 0.5;
    float sp = step(0.985, hash(floor(q * 26.0 * PAD + floor(uTime * 3.0)))) * smoothstep(1.0, 0.3, r);
    vec3 c = mix(vec3(0.55, 0.85, 1.0), vec3(1.0), f * 0.7 + ring);
    col = vec4(c * (1.1 + sp * 2.0 + ring), (disc + ring * 0.8 + cr * 0.3 + sp * 0.8) * aux);
  } else if (type < 5.5) {
    float n = fbm(q * 3.0 * PAD + uTime * 0.2);
    vec2 p = q * PAD * 5.0; vec2 id = floor(p); vec2 f = fract(p) - 0.5;
    float rn = hash(id); float t = fract(uTime * 0.45 + rn);
    float br = 0.05 + 0.2 * t;
    float bub = smoothstep(0.04, 0.0, abs(length(f + (hash(id + 3.0) - 0.5) * 0.3) - br)) * step(0.45, rn) * (1.0 - t);
    float body = smoothstep(1.0, 0.82, r + (n - 0.5) * 0.15);
    vec3 c = mix(vec3(0.12, 0.38, 0.1), vec3(0.45, 0.85, 0.2), n * 0.8 + 0.1);
    float rim = smoothstep(0.82, 0.95, r) * body;
    col = vec4((c + bub * vec3(0.5, 1.0, 0.4) + rim * vec3(0.3, 0.5, 0.1)) * 1.1, body * (0.62 + 0.15 * n) * aux);
  } else if (type < 6.5) {
    float e = prog;
    float band = exp(-pow((r - e) / (0.06 + 0.05 * prog), 2.0)) * (1.0 - prog);
    float dust = smoothstep(e, e - 0.35, r) * smoothstep(0.0, e * 0.9, r) * (1.0 - prog) * 0.18;
    col = vec4(vC * (1.2 + band), band * 0.85 + dust);
  } else if (type < 7.5) {
    float n = fbm(q * 2.4 + 3.0);
    float rr = r + (n - 0.5) * 0.38;
    float body = smoothstep(1.0, 0.86, rr);
    float rip = 0.5 + 0.5 * sin(rr * 26.0 - uTime * 2.0 + n * 6.0);
    float streak = pow(max(0.0, sin(q.x * 3.0 + q.y * 2.0 + n * 4.0 + uTime * 0.3)), 6.0) * 0.6;
    float sparkle = step(0.992, hash(floor(q * 18.0 + floor(uTime * 2.0)))) ;
    vec3 c = mix(vec3(0.10, 0.34, 0.62), vec3(0.55, 0.85, 1.0), 0.18 + streak + rip * 0.1);
    float edge = smoothstep(0.78, 0.9, rr) * body;
    col = vec4(c + edge * vec3(0.25, 0.3, 0.35) + sparkle * 0.8, body * 0.62);
  } else {
    float vent = 0.3;
    float rr = r;
    float n = fbm(q * 5.0 * PAD);
    float ridge = 1.0 - abs(fbm(q * 7.0 * PAD + 5.0) * 2.0 - 1.0);
    float crackM = smoothstep(vent * 1.9, vent * 0.8, rr);
    float cracks = smoothstep(0.82, 0.93, ridge) * crackM;
    float dark = smoothstep(vent * 1.5, vent * 1.0, rr) * 0.9;
    float hole = smoothstep(vent * 0.55, vent * 0.4, rr);
    float glowI = 0.35 + aux * 1.5;
    vec3 g = vec3(0.35, 1.0, 0.15);
    float haze = aux * smoothstep(1.0, 0.1, r) * (0.14 + 0.12 * n) * (0.8 + 0.2 * sin(uTime * 3.0));
    vec3 rgb = mix(vec3(0.06, 0.06, 0.05), g * glowI, max(cracks, hole * 0.8));
    rgb = mix(rgb, g * 0.6, haze);
    float a = max(max(dark, cracks), haze) ;
    col = vec4(rgb, a);
  }
  if (col.a < 0.01) discard;
  gl_FragColor = col;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const _col = new Color();
const rnd = Math.random;

export function Zones() {
  const sys = useMemo(() => {
    const g = new PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    const iP = new InstancedBufferAttribute(new Float32Array(MAXZ * 4), 4), iC = new InstancedBufferAttribute(new Float32Array(MAXZ * 3), 3);
    iP.setUsage(DynamicDrawUsage); iC.setUsage(DynamicDrawUsage);
    g.setAttribute('iP', iP); g.setAttribute('iC', iC);
    const mat = new ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new InstancedMesh(g, mat, MAXZ); mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    return { mesh, iP, iC, mat, o: new Object3D(), emitT: new Float32Array(MAXZ) };
  }, []);

  useFrame(({ clock }, dtRaw) => {
    const status = useGameStore.getState().status;
    const dt = status === GameStatus.PAUSED ? 0 : Math.min(dtRaw, 0.05);
    const t = clock.elapsedTime;
    sys.mat.uniforms.uTime.value = t;
    const { o, mesh } = sys;
    const P = sys.iP.array as Float32Array, C = sys.iC.array as Float32Array;
    const px = world.player.pos.x, pz = world.player.pos.z;
    let n = 0;
    const zones = world.zones;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (!z.active) continue;
      const type = TYPE[z.kind];
      if (type === undefined) continue;
      const frac = z.permanent ? 1 : clamp(z.life / Math.max(0.001, z.maxLife), 0, 1);
      let prog = 1 - frac, aux = 1, sx = z.radius * 2 * PAD, sz = z.radius * 2 * PAD, x = z.pos.x, zz = z.pos.z, yaw = 0, y = 0.08;
      let hex = z.color;
      switch (z.kind) {
        case 'TELEGRAPH_LINE': {
          // width = z.radius (full), length = z.length, along z.dir from z.pos
          sx = z.radius * PAD; sz = z.length;
          x = z.pos.x + z.dir.x * z.length * 0.5; zz = z.pos.z + z.dir.z * z.length * 0.5;
          yaw = Math.atan2(z.dir.x, z.dir.z);
          break;
        }
        case 'FIRE': case 'WILDFIRE': aux = clamp(frac * 4, 0, 1) * clamp((1 - frac) * 8 + 0.2, 0, 1); break;
        case 'BLACKHOLE': case 'TORNADO': aux = clamp((1 - frac) * 6, 0, 1) * clamp(frac * 5, 0, 1); break;
        case 'FROST_FIELD': aux = clamp(frac * 3, 0, 1); break;
        case 'FROST_NOVA': aux = clamp(frac * 3, 0, 1); break;
        case 'POISON_POOL': aux = clamp(frac * 4, 0, 1) * clamp((1 - frac) * 6, 0, 1); break;
        case 'SHOCKWAVE': hex = hex || 0xcdbd98; break;
        case 'PUDDLE': y = 0.05; break;
        case 'GAS': {
          const act = gasActive(z);
          let a = act ? 1 : 0;
          if (!act && z.period > 0) { const ph = (world.time + z.life) % z.period; const warn = z.period - ph; if (warn < 0.5) a = 0.5 * (1 - warn / 0.5); }
          aux = a; y = 0.06;
          break;
        }
        default: break;
      }
      o.position.set(x, y, zz); o.rotation.set(0, yaw, 0); o.scale.set(sx, 1, sz); o.updateMatrix();
      mesh.setMatrixAt(n, o.matrix);
      P[n * 4] = type; P[n * 4 + 1] = prog; P[n * 4 + 2] = aux; P[n * 4 + 3] = 0;
      _col.setHex(hex || 0xffffff);
      C[n * 3] = _col.r; C[n * 3 + 1] = _col.g; C[n * 3 + 2] = _col.b;
      n++;

      // ---- particles (near the player only)
      if (dt <= 0) continue;
      const dx = z.pos.x - px, dzp = z.pos.z - pz;
      if (dx * dx + dzp * dzp > 62 * 62) continue;
      const R = z.radius;
      switch (z.kind) {
        case 'FIRE': case 'WILDFIRE': {
          const rate = (z.kind === 'WILDFIRE' ? 16 : 10) + R * 7;
          let k = rate * dt * aux; while (k > 0) { if (rnd() < k) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * R * 0.85; FX.add.emit(z.pos.x + Math.cos(a) * d, 0.1, z.pos.z + Math.sin(a) * d, (rnd() - 0.5) * 0.6, 1.8 + rnd() * 2.2, (rnd() - 0.5) * 0.6, 0.45 + rnd() * 0.4, 0.7 + R * 0.12, 0.1, 2.4, 0.85, 0.15, 0.85, CELL.FLAME, -0.8, 1.2); } k -= 1; }
          if (rnd() < dt * (3 + R)) embers(z.pos.x + (rnd() - 0.5) * R, 0.3, z.pos.z + (rnd() - 0.5) * R, 1, 0xff9a30, R * 0.5, 3.4, 1.0, 0.16);
          if (z.kind === 'WILDFIRE' && rnd() < dt * 4) smokePuff(z.pos.x + (rnd() - 0.5) * R, 0.8, z.pos.z + (rnd() - 0.5) * R, 1, 0x3a3430, 1.6, 1.6, 1.8, 0.6, 0.45);
          break;
        }
        case 'BLACKHOLE': {
          let k = (40 + R * 6) * dt; while (k > 0) { if (rnd() < k) { const a = rnd() * TAU; const rr = R * (0.7 + rnd() * 0.5); FX.add.emit(z.pos.x + Math.cos(a) * rr, 0.4 + rnd() * 1.2, z.pos.z + Math.sin(a) * rr, -Math.cos(a) * rr * 1.1 - Math.sin(a) * rr * 0.9, 0, -Math.sin(a) * rr * 1.1 + Math.cos(a) * rr * 0.9, 0.75, 0.55, 0.05, 1.4, 0.5, 2.4, 0.8, CELL.STREAK, 0, 0, 0, 0, 0.1); } k -= 1; }
          if (rnd() < dt * 18) FX.add.emit(z.pos.x, 0.5, z.pos.z, 0, 4 + rnd() * 3, 0, 0.7, 0.9, 0.2, 1.2, 0.4, 2.0, 0.6, CELL.GLOW);
          break;
        }
        case 'TORNADO': {
          let k = (30 + R * 5) * dt; while (k > 0) { if (rnd() < k) { const a = rnd() * TAU, rr = R * (0.25 + rnd() * 0.65), h = rnd(); FX.add.emit(z.pos.x + Math.cos(a) * rr, 0.2 + h * 3.4, z.pos.z + Math.sin(a) * rr, -Math.sin(a) * rr * 2.4, 1.0 + rnd() * 2, Math.cos(a) * rr * 2.4, 0.5, 0.35, 0.05, 0.8, 1.6, 1.3, 0.7, CELL.STREAK, 0, 0.6, 0, 0, 0.1); } k -= 1; }
          if (rnd() < dt * 14) FX.norm.emit(z.pos.x + (rnd() - 0.5) * R, 0.3, z.pos.z + (rnd() - 0.5) * R, 0, 2.5, 0, 0.8, 0.9, 1.8, 0.75, 0.9, 0.85, 0.3, CELL.SMOKE, 0, 0.5, rnd() * 6, 1);
          break;
        }
        case 'FROST_FIELD':
          if (rnd() < dt * (10 + R * 2)) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * R; FX.add.emit(z.pos.x + Math.cos(a) * d, 0.2, z.pos.z + Math.sin(a) * d, (rnd() - 0.5), 0.6 + rnd() * 1.4, (rnd() - 0.5), 1.0, 0.26, 0.05, 1.2, 1.9, 2.4, 0.9, CELL.STAR, 0, 0.3, rnd() * 3, 2); }
          if (rnd() < dt * 4) smokePuff(z.pos.x + (rnd() - 0.5) * R, 0.2, z.pos.z + (rnd() - 0.5) * R, 1, 0xe0f4ff, 2.0, 1.4, 0.4, 1.0, 0.25);
          break;
        case 'FROST_NOVA':
          if (rnd() < dt * (14 + R * 2)) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * R; FX.add.emit(z.pos.x + Math.cos(a) * d, 0.2, z.pos.z + Math.sin(a) * d, (rnd() - 0.5), 0.6 + rnd() * 1.4, (rnd() - 0.5), 1.0, 0.28, 0.05, 1.2, 1.9, 2.4, 0.9, CELL.STAR, 0, 0.3, rnd() * 3, 2); }
          if (rnd() < dt * 5) smokePuff(z.pos.x + (rnd() - 0.5) * R, 0.2, z.pos.z + (rnd() - 0.5) * R, 1, 0xe0f4ff, 2.0, 1.4, 0.4, 1.0, 0.3);
          break;
        case 'POISON_POOL':
          if (rnd() < dt * (8 + R * 2)) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * R * 0.8; FX.add.emit(z.pos.x + Math.cos(a) * d, 0.15, z.pos.z + Math.sin(a) * d, 0, 1.0 + rnd(), 0, 0.9, 0.22, 0.05, 0.5, 1.7, 0.3, 0.7, CELL.RING, 0, 0.4); }
          if (rnd() < dt * 3) smokePuff(z.pos.x + (rnd() - 0.5) * R, 0.3, z.pos.z + (rnd() - 0.5) * R, 1, 0x7bd62a, 1.6, 1.4, 0.8, 0.5, 0.25);
          break;
        case 'GAS': {
          if (aux > 0.5) {
            let k = (16 + R * 4) * dt; while (k > 0) { if (rnd() < k) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * R * 0.8; FX.norm.emit(z.pos.x + Math.cos(a) * d, 0.3 + rnd() * 0.5, z.pos.z + Math.sin(a) * d, (rnd() - 0.5) * 0.8, 0.8 + rnd() * 0.8, (rnd() - 0.5) * 0.8, 1.5 + rnd(), 1.4 + R * 0.25, 2.4 + R * 0.4, 0.38, 0.75, 0.12, 0.34, CELL.SMOKE, -0.1, 0.8, rnd() * 6, (rnd() - 0.5) * 0.6); } k -= 1; }
            if (rnd() < dt * 8) FX.add.emit(z.pos.x + (rnd() - 0.5) * R, 0.4, z.pos.z + (rnd() - 0.5) * R, 0, 1.2, 0, 1.0, 0.3, 0.05, 0.5, 1.8, 0.3, 0.7, CELL.DISC);
          } else if (aux > 0.02) {
            if (rnd() < dt * 20) FX.norm.emit(z.pos.x + (rnd() - 0.5) * 0.8, 0.2, z.pos.z + (rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.6, 1.2, (rnd() - 0.5) * 0.6, 0.7, 0.4, 1.0, 0.45, 0.85, 0.2, 0.45, CELL.SMOKE, 0, 1.2, rnd() * 6, 0.5);
          }
          break;
        }
        case 'PUDDLE':
          if (rnd() < dt * 1.2) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * R * 0.7; FX.add.emit(z.pos.x + Math.cos(a) * d, 0.1, z.pos.z + Math.sin(a) * d, 0, 0, 0, 1.0, 0.1, 0.9, 0.5, 0.8, 1.2, 0.4, CELL.RING); }
          break;
        default: break;
      }
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; sys.iP.needsUpdate = true; sys.iC.needsUpdate = true;
  });
  return <primitive object={sys.mesh} />;
}
