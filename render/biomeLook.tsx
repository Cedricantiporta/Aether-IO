// Shared "look" of the current place (town = the original palette, run rooms = their biome): fog / background, sky tint,
// hemisphere + sun light. Sky and Lighting read `look` every frame; LookDriver eases it towards the target and applies fog.
import { Color, Fog, Vector3, type PerspectiveCamera } from 'three';
import { updateDistCull } from './distCull';
import { useFrame } from '@react-three/fiber';
import { biomeOf, variantOf } from '../engine/roomDefs';
import { runInfo } from '../engine/runMods';

interface Look { fog: Color; hemiSky: Color; hemiGround: Color; hemiI: number; sun: Color; sunI: number; sky: Vector3; near: number; far: number }
const mk = (fog: string, hs: string, hg: string, hi: number, sun: string, si: number, sky: [number, number, number], near: number, far: number): Look =>
  ({ fog: new Color(fog), hemiSky: new Color(hs), hemiGround: new Color(hg), hemiI: hi, sun: new Color(sun), sunI: si, sky: new Vector3(...sky), near, far });

export const TOWN_FOG = '#cfe6f2';
// Town mood: a warm low-ish sun against a cool sky fill and a green-olive bounce (more colour contrast, less washed-out pale ground)
const TOWN_HEMI_SKY = '#bcd8f4', TOWN_HEMI_GROUND = '#7b8c4a', TOWN_HEMI_I = 1.1, TOWN_SUN = '#ffe7bd', TOWN_SUN_I = 2.95;
/** Extra multiplier on the hemisphere + sun light (render/CaveInterior lowers it as the cave lantern runs out). */
export const lookDim = { k: 1 };
export const look: Look = mk(TOWN_FOG, TOWN_HEMI_SKY, TOWN_HEMI_GROUND, TOWN_HEMI_I, TOWN_SUN, TOWN_SUN_I, [1, 1, 1], 75, 210);
const target: Look = mk(TOWN_FOG, TOWN_HEMI_SKY, TOWN_HEMI_GROUND, TOWN_HEMI_I, TOWN_SUN, TOWN_SUN_I, [1, 1, 1], 75, 210);

/** Points the look at a biome (index >= 0), back at the town (-1) or the crystal cave (-2; -3 lava floor, -4 poison floor). `snap` skips the ease (used at full black). */
export function setLook(biome: number, snap = false, index = 0): void {
  if (biome === -3) {
    // crystal cave, lava floor: smoky red-brown fog, warm orange fill
    target.fog.set('#120604'); target.hemiSky.set('#ffb08a'); target.hemiGround.set('#4a2418'); target.hemiI = 1.0;
    target.sun.set('#ffc49a'); target.sunI = 1.0; target.sky.set(0.08, 0.03, 0.02); target.near = 42; target.far = 110;
  } else if (biome === -4) {
    // crystal cave, poison floor: misty green
    target.fog.set('#08120a'); target.hemiSky.set('#b4f0a8'); target.hemiGround.set('#2c4024'); target.hemiI = 1.0;
    target.sun.set('#c8f0b8'); target.sunI = 1.0; target.sky.set(0.03, 0.07, 0.03); target.near = 34; target.far = 100;
  } else if (biome === -2) {
    // crystal cave (village area CAVE): near-black fog, dim cool fill light; the crystals / torches carry the scene
    target.fog.set('#07090d'); target.hemiSky.set('#9cb0dc'); target.hemiGround.set('#4a4036'); target.hemiI = 1.05;
    target.sun.set('#c4d0ee'); target.sunI = 1.1; target.sky.set(0.03, 0.035, 0.05); target.near = 42; target.far = 100;
  } else if (biome < 0) {
    target.fog.set(TOWN_FOG); target.hemiSky.set(TOWN_HEMI_SKY); target.hemiGround.set(TOWN_HEMI_GROUND); target.hemiI = TOWN_HEMI_I;
    target.sun.set(TOWN_SUN); target.sunI = TOWN_SUN_I; target.sky.set(1, 1, 1); target.near = 75; target.far = 210;
  } else if (runInfo.mode === 'TOWER') {
    // Endless Tower: open-air floors under a deep night sky, cool moonlight
    target.fog.set('#0b1230'); target.hemiSky.set('#8fa6e0'); target.hemiGround.set('#2a2a38'); target.hemiI = 0.95;
    target.sun.set('#c8d6ff'); target.sunI = 2.1; target.sky.set(0.07, 0.09, 0.22); target.near = 45; target.far = 130;
  } else {
    const b = biomeOf(biome), v = variantOf(b, index);   // depth tier light overrides
    const fog = v?.fog ?? b.fog;
    target.fog.set(fog); target.hemiSky.set(v?.hemiSky ?? b.hemiSky); target.hemiGround.set(v?.hemiGround ?? b.hemiGround); target.hemiI = v?.hemiI ?? b.hemiI;
    target.sun.set(v?.sun ?? b.sun); target.sunI = v?.sunI ?? b.sunI; target.sky.set(...(v?.skyTint ?? b.skyTint)); target.near = 50;
    target.far = b.style === 'VOID' || b.style === 'BASALT' || (v?.fog && v.hemiI !== undefined && v.hemiI < 0.9) ? 115 : 150;
  }
  if (snap) copy(look, target, 1);
}

function copy(a: Look, b: Look, k: number): void {
  a.fog.lerp(b.fog, k); a.hemiSky.lerp(b.hemiSky, k); a.hemiGround.lerp(b.hemiGround, k); a.sun.lerp(b.sun, k); a.sky.lerp(b.sky, k);
  a.hemiI += (b.hemiI - a.hemiI) * k; a.sunI += (b.sunI - a.sunI) * k; a.near += (b.near - a.near) * k; a.far += (b.far - a.far) * k;
}

export function LookDriver() {
  useFrame(({ scene, camera }, dt) => {
    copy(look, target, 1 - Math.exp(-4 * Math.min(dt, 0.1)));
    if (scene.background instanceof Color) scene.background.copy(look.fog);
    const f = scene.fog as Fog | null;
    if (f) { f.color.copy(look.fog); f.near = look.near; f.far = look.far; }
    // (perf) nothing past the fog's end is visible: the far plane follows it, so fully-fogged geometry is never drawn
    const cam = camera as PerspectiveCamera, wantFar = Math.max(80, look.far + 25);
    if (Math.abs(cam.far - wantFar) > 2) { cam.far = wantFar; cam.updateProjectionMatrix(); }
    updateDistCull();
  }, -0.3);
  return null;
}
