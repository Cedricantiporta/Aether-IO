// Shared "look" of the current place (town = the original palette, run rooms = their biome): fog / background, sky tint,
// hemisphere + sun light. Sky and Lighting read `look` every frame; LookDriver eases it towards the target and applies fog.
import { Color, Fog, Vector3 } from 'three';
import { useFrame } from '@react-three/fiber';
import { biomeOf } from '../engine/roomDefs';
import { runInfo } from '../engine/runMods';

interface Look { fog: Color; hemiSky: Color; hemiGround: Color; hemiI: number; sun: Color; sunI: number; sky: Vector3; near: number; far: number }
const mk = (fog: string, hs: string, hg: string, hi: number, sun: string, si: number, sky: [number, number, number], near: number, far: number): Look =>
  ({ fog: new Color(fog), hemiSky: new Color(hs), hemiGround: new Color(hg), hemiI: hi, sun: new Color(sun), sunI: si, sky: new Vector3(...sky), near, far });

export const TOWN_FOG = '#cfe6f2';
export const look: Look = mk(TOWN_FOG, '#cfe8ff', '#6f8f45', 1.25, '#fff0d2', 3.1, [1, 1, 1], 75, 210);
const target: Look = mk(TOWN_FOG, '#cfe8ff', '#6f8f45', 1.25, '#fff0d2', 3.1, [1, 1, 1], 75, 210);

/** Points the look at a biome (index >= 0) or back at the town (-1). `snap` skips the ease (used at full black). */
export function setLook(biome: number, snap = false): void {
  if (biome < 0) {
    target.fog.set(TOWN_FOG); target.hemiSky.set('#cfe8ff'); target.hemiGround.set('#6f8f45'); target.hemiI = 1.25;
    target.sun.set('#fff0d2'); target.sunI = 3.1; target.sky.set(1, 1, 1); target.near = 75; target.far = 210;
  } else if (runInfo.mode === 'TOWER') {
    // Endless Tower: open-air floors under a deep night sky, cool moonlight
    target.fog.set('#0b1230'); target.hemiSky.set('#8fa6e0'); target.hemiGround.set('#2a2a38'); target.hemiI = 0.95;
    target.sun.set('#c8d6ff'); target.sunI = 2.1; target.sky.set(0.07, 0.09, 0.22); target.near = 45; target.far = 130;
  } else {
    const b = biomeOf(biome);
    target.fog.set(b.fog); target.hemiSky.set(b.hemiSky); target.hemiGround.set(b.hemiGround); target.hemiI = b.hemiI;
    target.sun.set(b.sun); target.sunI = b.sunI; target.sky.set(...b.skyTint); target.near = 50; target.far = b.fog === '#1c1433' || b.fog === '#7a3c2c' ? 115 : 150;
  }
  if (snap) copy(look, target, 1);
}

function copy(a: Look, b: Look, k: number): void {
  a.fog.lerp(b.fog, k); a.hemiSky.lerp(b.hemiSky, k); a.hemiGround.lerp(b.hemiGround, k); a.sun.lerp(b.sun, k); a.sky.lerp(b.sky, k);
  a.hemiI += (b.hemiI - a.hemiI) * k; a.sunI += (b.sunI - a.sunI) * k; a.near += (b.near - a.near) * k; a.far += (b.far - a.far) * k;
}

export function LookDriver() {
  useFrame(({ scene }, dt) => {
    copy(look, target, 1 - Math.exp(-4 * Math.min(dt, 0.1)));
    if (scene.background instanceof Color) scene.background.copy(look.fog);
    const f = scene.fog as Fog | null;
    if (f) { f.color.copy(look.fog); f.near = look.near; f.far = look.far; }
  }, -0.3);
  return null;
}
