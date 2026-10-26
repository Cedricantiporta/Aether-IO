// Leaf module (no imports of other systems): the shared state of the boss INVULNERABLE PHASES. engine/systems/bossPhases.ts writes it,
// bossMech / combat / enemies read `bp.on` / `bp.immune`, render/BossPhaseFx.tsx + ui/hud/BossPhaseHud.tsx draw it.
// Every boss has its own mechanic (`bp.kind`): at set HP thresholds it turns invulnerable (bubble + banner) and runs it, then
// becomes vulnerable again on its own.
export type PhaseKind =
  | '' | 'AVALANCHE' | 'SPLIT' | 'PINBALL' | 'SPORES' | 'TIDAL' | 'LAVA' | 'SAND' | 'DARK';

/** A prop / circle on the floor: safe circles (Avalanche), rocks and pillars (cover / pinball), pods (Spore Garden). */
export interface PhaseProp { x: number; z: number; r: number; /** free value: pod swell 0..1, pillar hp... */ h: number; on: boolean }
export interface PhaseHand { x: number; z: number; t: number; T: number; on: boolean }

export const MAX_PROPS = 8, MAX_TILES = 300, MAX_HANDS = 6, MAX_FOOT = 14;
/** Lava floor: every tile erupts exactly this many times during the phase (te holds MAX_TILES x LAVA_HITS times). */
export const LAVA_HITS = 2;

export const bp = {
  on: false,
  /** the boss (or mini-boss) running the phase */
  id: -1,
  kind: '' as PhaseKind,
  /** seconds since the phase began */
  t: 0,
  /** the boss takes no damage right now */
  immune: false,
  /** banner (HUD): attack name + one line; bannerT counts down */
  name: '', sub: '', color: 0xffffff, bannerT: 0,
  /** seconds left of the visible countdown (-1 = none) and its full length */
  count: -1, countMax: 1,
  /** screen-edge tint 0..1 (HUD) */
  tint: 0,
  /** floor flash after a hit (0..1) */
  flash: 0,
  /** floor red overlay (Avalanche) 0..1 */
  floor: 0,
  props: Array.from({ length: MAX_PROPS }, (): PhaseProp => ({ x: 0, z: 0, r: 2, h: 0, on: false })),
  /** wind / wave travel direction + wave front (-1 .. 1 along the direction, 2 = not started) */
  wx: 0, wz: 1, wave: 2, windOn: false,
  /** the next wind direction (Sandstorm shifts once) shown as a ghost while `shiftT` > 0 */
  nx: 0, nz: 1, shiftT: 0,
  /** Lava floor tiles: centre, the LAVA_HITS erupt times per tile (phase seconds, te[i * LAVA_HITS + k]), half size */
  tx: new Float32Array(MAX_TILES), tz: new Float32Array(MAX_TILES), te: new Float32Array(MAX_TILES * LAVA_HITS), nt: 0, tileHalf: 2.5,
  /** Lights Out */
  dark: false, dOn: false, dsx: 0, dsy: 0,
  hands: Array.from({ length: MAX_HANDS }, (): PhaseHand => ({ x: 0, z: 0, t: 0, T: 1, on: false })),
  /** Pinball: the boss is a boulder (rolling) + crack time left */
  ball: false, crackT: 0, spin: 0, rx: 0, rz: 1,
  /** (unused since Malakar lost his illusions) */
  realId: -1,
  /** seconds since the last phase ended (props linger / shrink for a moment) */
  tail: 9,
  /** Slime King split: live slime ids */
  slimes: [] as number[],
};

/** The boss's own state of "invulnerable phases done" lives in bossPhases.ts; this only says whether a phase runs. */
export function phaseImmune(id: number): boolean { return bp.on && bp.immune && bp.id === id; }
