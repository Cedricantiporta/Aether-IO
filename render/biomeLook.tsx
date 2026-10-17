// Shared "look" of the current place (town = the original palette, run rooms = their biome): fog / background, sky tint,
// hemisphere + sun light. Sky and Lighting read `look` every frame; LookDriver eases it towards the target and applies fog.
import { Color, Fog, Vector3, type PerspectiveCamera } from 'three';
import { updateDistCull } from './distCull';
import { useFrame } from '@react-three/fiber';
import { biomeOf, variantOf } from '../engine/roomDefs';
import { runInfo } from '../engine/runMods';
import { world } from '../engine/world';
import type { MeshBasicMaterial } from 'three';

interface Look { fog: Color; hemiSky: Color; hemiGround: Color; hemiI: number; sun: Color; sunI: number; sky: Vector3; near: number; far: number; dir: Vector3 }
const mk = (fog: string, hs: string, hg: string, hi: number, sun: string, si: number, sky: [number, number, number], near: number, far: number): Look =>
  ({ fog: new Color(fog), hemiSky: new Color(hs), hemiGround: new Color(hg), hemiI: hi, sun: new Color(sun), sunI: si, sky: new Vector3(...sky), near, far, dir: new Vector3(-0.55, 0.72, 0.42).normalize() });

export const TOWN_FOG = '#cfe6f2';
// Town mood: a warm low-ish sun against a cool sky fill and a green-olive bounce (more colour contrast, less washed-out pale ground)
const TOWN_HEMI_SKY = '#bcd8f4', TOWN_HEMI_GROUND = '#7b8c4a', TOWN_HEMI_I = 1.1, TOWN_SUN = '#ffe7bd', TOWN_SUN_I = 2.95;
/** Extra multiplier on the hemisphere + sun light (render/CaveInterior lowers it as the cave lantern runs out). */
export const lookDim = { k: 1 };
export const look: Look = mk(TOWN_FOG, TOWN_HEMI_SKY, TOWN_HEMI_GROUND, TOWN_HEMI_I, TOWN_SUN, TOWN_SUN_I, [1, 1, 1], 75, 210);
const target: Look = mk(TOWN_FOG, TOWN_HEMI_SKY, TOWN_HEMI_GROUND, TOWN_HEMI_I, TOWN_SUN, TOWN_SUN_I, [1, 1, 1], 75, 210);

// ------------------------------------------------------------------ town day / night cycle ---
// world.townTime 0..1: 0 dawn, 0.25 noon, 0.5 dusk, 0.75 midnight. Four keyframes are blended per frame into `target`
// (module scratch only, no allocations); the sky gradient, stars, night lamps and sun direction follow.
interface TownKey { fog: Color; hs: Color; hg: Color; hi: number; sun: Color; si: number; hor: Color; mid: Color; zen: Color }
const tk = (fog: string, hs: string, hg: string, hi: number, sun: string, si: number, hor: number[], mid: number[], zen: number[]): TownKey =>
  ({ fog: new Color(fog), hs: new Color(hs), hg: new Color(hg), hi, sun: new Color(sun), si, hor: new Color(hor[0], hor[1], hor[2]), mid: new Color(mid[0], mid[1], mid[2]), zen: new Color(zen[0], zen[1], zen[2]) });
const TOWN_KEYS: TownKey[] = [
  tk('#f0cdc2', '#f0c8d8', '#7a7048', 0.98, '#ffc794', 2.1, [1, 0.72, 0.6], [0.82, 0.7, 0.86], [0.4, 0.5, 0.82]),                       // dawn: pink-gold
  tk(TOWN_FOG, TOWN_HEMI_SKY, TOWN_HEMI_GROUND, TOWN_HEMI_I, TOWN_SUN, TOWN_SUN_I, [1, 0.93, 0.78], [0.55, 0.8, 1], [0.2, 0.5, 0.92]),  // noon (the original look)
  tk('#cf9a9c', '#b69ad2', '#6e5a5c', 0.9, '#ff9650', 1.75, [1, 0.52, 0.26], [0.74, 0.44, 0.62], [0.3, 0.27, 0.58]),                    // dusk: warm orange sun, purple-ish sky
  tk('#26335a', '#86a2e6', '#41506c', 0.92, '#a4c0ff', 0.5, [0.14, 0.18, 0.34], [0.07, 0.1, 0.24], [0.03, 0.045, 0.13]),               // night: cool moonlight
];
/** Day sky gradient colours (non-town looks use these) + night amounts for the lamps / stars / fireflies. */
export const townSky = { hor: new Color(1, 0.93, 0.78), mid: new Color(0.55, 0.8, 1), zen: new Color(0.2, 0.5, 0.92), on: false };
export const townFx = { lamp: 0, stars: 0 };
let townMode = false;
const DAY_DIR = new Vector3(-0.55, 0.72, 0.42).normalize();
const MOON_DIR = new Vector3(0.5, 0.62, -0.42).normalize();
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const townT = () => (world.village.area === 'TOWN' ? world.townTime : 0.25);

function applyTown(t: number): void {
  const x = (t - Math.floor(t)) * 4, i = Math.floor(x) & 3, u = sstep(0.15, 0.85, x - Math.floor(x));
  // keyframes by time: 0 dawn, .25 noon, .5 dusk, .75 night, 1 dawn
  const A = TOWN_KEYS[i], B = TOWN_KEYS[(i + 1) & 3];
  target.fog.copy(A.fog).lerp(B.fog, u); target.hemiSky.copy(A.hs).lerp(B.hs, u); target.hemiGround.copy(A.hg).lerp(B.hg, u);
  target.hemiI = A.hi + (B.hi - A.hi) * u; target.sun.copy(A.sun).lerp(B.sun, u); target.sunI = A.si + (B.si - A.si) * u;
  townSky.hor.copy(A.hor).lerp(B.hor, u); townSky.mid.copy(A.mid).lerp(B.mid, u); townSky.zen.copy(A.zen).lerp(B.zen, u); townSky.on = true;
  // sun path: a low angle at dawn / dusk, mirrored east-west; the moon takes over below the horizon
  const ang = t * Math.PI * 2, sinE = Math.sin(ang), up = Math.max(0, sinE), c = Math.cos(ang) * 0.9 + 0.69 * up;
  target.dir.set(-0.55 / 0.692 * c, 0.12 + 0.6 * up, 0.42 / 0.692 * c);
  const m = sstep(0.0, -0.3, sinE);
  target.dir.lerp(MOON_DIR, m).normalize();
  townFx.lamp = sstep(0.3, -0.1, sinE); townFx.stars = sstep(0.05, -0.4, sinE);
}

// shared night-lit materials (window glow, lamp bulbs, torches): colour = base * (1 + 0.8 * lamp), set per frame
const glowMats: MeshBasicMaterial[] = [], glowBase: Color[] = [];
let glowK = -1;
export function nightGlow<T extends MeshBasicMaterial>(m: T): T { glowMats.push(m); glowBase.push(m.color.clone()); glowK = -1; return m; }
export function forgetNightGlow(m: MeshBasicMaterial): void { const i = glowMats.indexOf(m); if (i >= 0) { glowMats.splice(i, 1); glowBase.splice(i, 1); } }

/** Points the look at a biome (index >= 0), back at the town (-1) or the crystal cave (-2; -3 lava floor, -4 poison floor). `snap` skips the ease (used at full black). */
export function setLook(biome: number, snap = false, index = 0): void {
  townMode = false; target.dir.copy(DAY_DIR);
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
    townMode = biome === -1; if (townMode) applyTown(townT());   // (day / night cycle; interiors keep the day look)
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
  a.dir.lerp(b.dir, k); a.hemiI += (b.hemiI - a.hemiI) * k; a.sunI += (b.sunI - a.sunI) * k; a.near += (b.near - a.near) * k; a.far += (b.far - a.far) * k;
}

export function LookDriver() {
  useFrame(({ scene, camera }, dt) => {
    if (townMode) applyTown(townT());
    else if (townSky.on) { townSky.on = false; townSky.hor.setRGB(1, 0.93, 0.78); townSky.mid.setRGB(0.55, 0.8, 1); townSky.zen.setRGB(0.2, 0.5, 0.92); townFx.lamp = 0; townFx.stars = 0; }
    const gk = 1 + 0.8 * townFx.lamp;
    if (Math.abs(gk - glowK) > 0.004) { glowK = gk; for (let i = 0; i < glowMats.length; i++) glowMats[i].color.copy(glowBase[i]).multiplyScalar(gk); }
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
