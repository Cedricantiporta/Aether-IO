// Shared "look" of the current place (town = the original palette, run rooms = their biome): fog / background, sky tint,
// hemisphere + sun light. Sky and Lighting read `look` every frame; LookDriver eases it towards the target and applies fog.
import { WATER_T, WATER_NIGHT } from './waterFx';
import { Color, Fog, Vector3, type PerspectiveCamera } from 'three';
import { updateDistCull } from './distCull';
import { useFrame } from '@react-three/fiber';
import { biomeOf, variantOf } from '../engine/roomDefs';
import { runInfo } from '../engine/runMods';
import { shape } from '../engine/roomShape';
import { showcase } from '../engine/showcase';
import { world } from '../engine/world';
import { dreamFx, tickDreamFx } from '../engine/dreamFx';
import type { MeshBasicMaterial } from 'three';

interface Look { fog: Color; hemiSky: Color; hemiGround: Color; hemiI: number; sun: Color; sunI: number; sky: Vector3; near: number; far: number; dir: Vector3 }
const mk = (fog: string, hs: string, hg: string, hi: number, sun: string, si: number, sky: [number, number, number], near: number, far: number): Look =>
  ({ fog: new Color(fog), hemiSky: new Color(hs), hemiGround: new Color(hg), hemiI: hi, sun: new Color(sun), sunI: si, sky: new Vector3(...sky), near, far, dir: new Vector3(-0.55, 0.72, 0.42).normalize() });

export const TOWN_FOG = '#dbe9ec';
// Town mood: a warm low-ish sun against a cool sky fill and a green-olive bounce (more colour contrast, less washed-out pale ground)
const TOWN_HEMI_SKY = '#c6dcf0', TOWN_HEMI_GROUND = '#92a257', TOWN_HEMI_I = 1.22, TOWN_SUN = '#ffdc9c', TOWN_SUN_I = 3.15;
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
  tk('#f2d2c0', '#f2cfd0', '#847a4c', 1.05, '#ffc27c', 2.35, [1, 0.72, 0.6], [0.82, 0.7, 0.86], [0.4, 0.5, 0.82]),                       // dawn: pink-gold
  tk(TOWN_FOG, TOWN_HEMI_SKY, TOWN_HEMI_GROUND, TOWN_HEMI_I, TOWN_SUN, TOWN_SUN_I, [1, 0.92, 0.74], [0.55, 0.8, 1], [0.2, 0.5, 0.92]),  // noon (warm golden grade) (the original look)
  tk('#d9a08e', '#c0a0c8', '#76625a', 0.98, '#ff9440', 2.0, [1, 0.52, 0.26], [0.74, 0.44, 0.62], [0.3, 0.27, 0.58]),                    // dusk: warm orange sun, purple-ish sky
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

// ------------------------------------------------------------------ run time of day (biomes 0, 2, 3, 4) ---
// world.runPhase (fixed at run start): 1 dusk, 2 night, 3 dawn. Blended ON TOP of the biome's own light values (lerp towards the
// phase colours, multiply the intensities) once per room enter / ease; never per entity. Brightness floors keep hazards readable:
// sun >= 0.55 x day, hemisphere >= 0.85 x day.
interface PhaseKey { fog: string; hs: string; hg: string; hiM: number; sun: string; siM: number; k: number; hor: number[]; mid: number[]; zen: number[]; dirY: number; stars: number }
const PH = (fog: string, hs: string, hg: string, hiM: number, sun: string, siM: number, k: number, hor: number[], mid: number[], zen: number[], dirY: number, stars = 0): PhaseKey => ({ fog, hs, hg, hiM, sun, siM, k, hor, mid, zen, dirY, stars });
const RUN_PHASES: Record<number, PhaseKey[]> = {   // [dusk, night, dawn]
  0: [PH('#e2b27a', '#ffd9a0', '#7a6a3a', 0.95, '#ffb766', 0.8, 0.8, [1, 0.62, 0.3], [0.78, 0.56, 0.6], [0.34, 0.4, 0.7], 0.4),
      PH('#25405a', '#9ec0e0', '#2c4a50', 0.9, '#a8d0ff', 0.58, 0.88, [0.14, 0.22, 0.3], [0.06, 0.12, 0.2], [0.03, 0.06, 0.13], 0.62, 0.9),
      PH('#ecc4c8', '#f2cadc', '#7a7a50', 0.97, '#ffc4a0', 0.85, 0.7, [1, 0.74, 0.7], [0.84, 0.72, 0.88], [0.42, 0.52, 0.84], 0.4)],
  2: [PH('#e08a4a', '#ffb070', '#9a5a30', 0.95, '#ff8240', 0.8, 0.9, [1, 0.45, 0.18], [0.8, 0.38, 0.3], [0.32, 0.2, 0.42], 0.36),
      PH('#1e3058', '#7e9ee0', '#2c3a64', 0.88, '#8fb0ff', 0.56, 0.92, [0.1, 0.16, 0.34], [0.05, 0.08, 0.22], [0.02, 0.035, 0.12], 0.62, 1),
      PH('#f0b4b4', '#ffc8d0', '#a86a60', 0.97, '#ffb0a0', 0.85, 0.75, [1, 0.62, 0.62], [0.9, 0.66, 0.8], [0.45, 0.5, 0.82], 0.4)],
  3: [PH('#e8785a', '#ffa088', '#8a5a4a', 0.95, '#ff6a3a', 0.82, 0.9, [1, 0.38, 0.16], [0.9, 0.34, 0.34], [0.36, 0.22, 0.5], 0.3),
      PH('#1c4a5c', '#80d0d8', '#2c5c60', 0.9, '#a0f0f0', 0.58, 0.9, [0.08, 0.26, 0.32], [0.04, 0.16, 0.24], [0.02, 0.06, 0.14], 0.62, 0.9),
      PH('#f4c8c4', '#ffd8d8', '#b89a70', 0.98, '#ffd0b0', 0.88, 0.7, [1, 0.74, 0.66], [0.8, 0.82, 0.92], [0.4, 0.56, 0.86], 0.42)],
  4: [PH('#b8a0d8', '#d4c0f4', '#7a6a9c', 0.95, '#d8b0ff', 0.8, 0.85, [0.9, 0.62, 0.86], [0.62, 0.5, 0.82], [0.28, 0.3, 0.6], 0.38),
      PH('#6a86b8', '#c4dcff', '#6a82a8', 0.9, '#cfe4ff', 0.58, 0.9, [0.2, 0.28, 0.5], [0.08, 0.14, 0.32], [0.03, 0.06, 0.16], 0.62, 1),
      PH('#ead0e4', '#f4d8ea', '#a0a4c0', 0.98, '#ffd0d8', 0.88, 0.7, [1, 0.76, 0.8], [0.8, 0.74, 0.92], [0.42, 0.52, 0.86], 0.4)],
};
export const runFx = { fireflies: 0 };   // 1 on Greenwood nights (render/Fireflies RunFireflies)
let runSky = false;
const _pc = new Color();
/** Applies the run's phase to `target` (after the biome / depth-tier values are in). Greenwood: depths 1-10 only (not Darkwood or the boss arena). */
function applyRunPhase(biome: number, index: number): void {
  runSky = false; runFx.fireflies = 0; townFx.stars = 0;
  const ph = world.runPhase, P = RUN_PHASES[biome % 7];
  if (ph <= 0 || !P || (biome % 7 === 0 && index >= 10)) return;
  const K = P[ph - 1], k = K.k;
  target.fog.lerp(_pc.set(K.fog), k); target.hemiSky.lerp(_pc.set(K.hs), k); target.hemiGround.lerp(_pc.set(K.hg), k); target.sun.lerp(_pc.set(K.sun), k);
  target.hemiI *= K.hiM; target.sunI *= K.siM;
  target.dir.set(DAY_DIR.x, K.dirY, DAY_DIR.z);
  if (ph === 2) target.dir.lerp(MOON_DIR, 0.8);
  target.dir.normalize();
  townSky.hor.setRGB(K.hor[0], K.hor[1], K.hor[2]); townSky.mid.setRGB(K.mid[0], K.mid[1], K.mid[2]); townSky.zen.setRGB(K.zen[0], K.zen[1], K.zen[2]);
  townSky.on = true; runSky = true; townFx.stars = K.stars; if (ph === 2 && biome % 7 === 0) runFx.fireflies = 1;
}

// shared night-lit materials (window glow, lamp bulbs, torches): colour = base * (1 + 0.8 * lamp), set per frame
const glowMats: MeshBasicMaterial[] = [], glowBase: Color[] = [];
let glowK = -1;
export function nightGlow<T extends MeshBasicMaterial>(m: T): T { glowMats.push(m); glowBase.push(m.color.clone()); glowK = -1; return m; }
export function forgetNightGlow(m: MeshBasicMaterial): void { const i = glowMats.indexOf(m); if (i >= 0) { glowMats.splice(i, 1); glowBase.splice(i, 1); } }

/** (owner) Font dream look: pale gold-lavender haze (denser fog), softer warm light, a hazy pale sky. Restored by the next setLook. */
function applyDream(): void {
  dreamFx.inDream = true; runSky = false; runFx.fireflies = 0;
  target.fog.set('#efe2ee'); target.hemiSky.set('#fff0d8'); target.hemiGround.set('#cdb8d8'); target.hemiI = 1.25;
  target.sun.set('#ffe2b0'); target.sunI = 2.0; target.sky.set(1, 0.96, 1); target.near = 34; target.far = 120;   // (owner: clear around the hero, the haze lives at the edges - see .dream-mist)
}

/** The Hall of the Undying: deep violet dusk, still readable (the purple braziers + the far portal carry the scene). */
function applyHall(): void {
  target.fog.set('#120a24'); target.hemiSky.set('#a68cf0'); target.hemiGround.set('#35205c'); target.hemiI = 0.78;
  target.sun.set('#9a84e8'); target.sunI = 0.38; target.sky.set(0.03, 0.015, 0.08); target.near = 26; target.far = 96;
}

/** Points the look at a biome (index >= 0), back at the town (-1) or the crystal cave (-2; -3 lava floor, -4 poison floor). `snap` skips the ease (used at full black). */
export function setLook(biome: number, snap = false, index = 0): void {
  townMode = false; runSky = false; runFx.fireflies = 0; target.dir.copy(DAY_DIR); dreamFx.inDream = false;
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
  } else if (runInfo.mode === 'TOWER' && !showcase.on) {
    // Endless Tower: open-air floors under a deep night sky, cool moonlight
    target.fog.set('#0b1230'); target.hemiSky.set('#8fa6e0'); target.hemiGround.set('#2a2a38'); target.hemiI = 0.95;
    target.sun.set('#c8d6ff'); target.sunI = 2.1; target.sky.set(0.07, 0.09, 0.22); target.near = 45; target.far = 130;
  } else {
    const b = biomeOf(biome), v = variantOf(b, index);   // depth tier light overrides
    const fog = v?.fog ?? b.fog;
    target.fog.set(fog); target.hemiSky.set(v?.hemiSky ?? b.hemiSky); target.hemiGround.set(v?.hemiGround ?? b.hemiGround); target.hemiI = v?.hemiI ?? b.hemiI;
    target.sun.set(v?.sun ?? b.sun); target.sunI = v?.sunI ?? b.sunI; target.sky.set(...(v?.skyTint ?? b.skyTint)); target.near = 50;
    target.far = b.style === 'VOID' || b.style === 'BASALT' || (v?.fog && v.hemiI !== undefined && v.hemiI < 0.9) ? 115 : 150;
    applyRunPhase(biome, index);
    if (b.style === 'MARBLE' && shape.kind === 'HALLS') { target.hemiI *= 0.32; target.sunI *= 0.24; target.fog.multiplyScalar(0.35); target.sky.multiplyScalar(0.3); }
    else if (b.style === 'MARBLE') { target.hemiI *= 0.65; target.sunI *= 0.55; target.fog.multiplyScalar(0.6); target.sky.multiplyScalar(0.6); }   // (owner 2026-10-24: biome 2 darker everywhere)   // (owner) Marble Halls are moody indoors: the wall torches carry the light (render/HallsMarble.tsx)
    if (world.room.plan?.type === 'HALL') applyHall();
    if (world.room.plan?.dream) applyDream();
  }
  if (snap) copy(look, target, 1);
}

function copy(a: Look, b: Look, k: number): void {
  a.fog.lerp(b.fog, k); a.hemiSky.lerp(b.hemiSky, k); a.hemiGround.lerp(b.hemiGround, k); a.sun.lerp(b.sun, k); a.sky.lerp(b.sky, k);
  a.dir.lerp(b.dir, k); a.hemiI += (b.hemiI - a.hemiI) * k; a.sunI += (b.sunI - a.sunI) * k; a.near += (b.near - a.near) * k; a.far += (b.far - a.far) * k;
}

/** (owner) the lower camera angle sees ~13% farther across the ground: fog + far plane + draw distance are pushed out by this. */
export const FOG_K = 0.85;   // closer camera (CameraRig CAM_CLOSE) sees less ground: fog + cull range shrink with it

export function LookDriver() {
  useFrame(({ scene, camera, clock }, dt) => {
    tickDreamFx(dt);
    WATER_T.value = clock.elapsedTime; WATER_NIGHT.value = townFx.lamp;   // (the one per-frame write of the shared water look, render/waterFx.ts)
    if (dreamFx.haze > 0) lookDim.k = 1 + Math.sin(performance.now() * 0.0009) * 0.07 * dreamFx.haze; else if (lookDim.k !== 1 && !dreamFx.inDream && world.village.area !== 'CAVE') lookDim.k = 1;   // (the light breathes)
    if (townMode) applyTown(townT());
    else if (townSky.on && !runSky) { townSky.on = false; townSky.hor.setRGB(1, 0.93, 0.78); townSky.mid.setRGB(0.55, 0.8, 1); townSky.zen.setRGB(0.2, 0.5, 0.92); townFx.lamp = 0; townFx.stars = 0; }
    const gk = 1 + 0.8 * townFx.lamp;
    if (Math.abs(gk - glowK) > 0.004) { glowK = gk; for (let i = 0; i < glowMats.length; i++) glowMats[i].color.copy(glowBase[i]).multiplyScalar(gk); }
    copy(look, target, 1 - Math.exp(-4 * Math.min(dt, 0.1)));
    if (scene.background instanceof Color) scene.background.copy(look.fog);
    const f = scene.fog as Fog | null;
    if (f) { f.color.copy(look.fog); f.near = look.near * FOG_K; f.far = look.far * FOG_K; }
    // (perf) nothing past the fog's end is visible: the far plane follows it, so fully-fogged geometry is never drawn
    const cam = camera as PerspectiveCamera, wantFar = Math.max(80, look.far * FOG_K + 25);
    if (Math.abs(cam.far - wantFar) > 2) { cam.far = wantFar; cam.updateProjectionMatrix(); }
    updateDistCull();
  }, -0.3);
  return null;
}
