// ============================================================================
// Endless Waves: survival in one big round arena. Waves spawn one after another (short breather + banner between
// them), growing in size and strength and mixing the monster pools of more biomes over time. Elites from wave 3,
// a mini-boss every 5th wave, a real biome boss every 10th (cycling through the six; adds join from wave 20).
// No exits: the run ends on death. Best wave per class + one-time milestone rewards (waves 10/20/30/50).
//
// Pure data + engine run state (no React, no store import). The director drives the waves (towerFloor = wave),
// the store persists progress.wavesBest / wavesClaimed.
// ============================================================================
import type { RoomPlan } from './engine/types';
import type { Rarity } from './types';

export const WAVES_BIOMES = 6;
export const WAVE_BREAK = 5;          // seconds of breather between waves
export const WAVES_ARENA_R = 29;      // boss-room size

/** The Endless Waves run in progress (on = this run is Endless Waves; set at run start). */
export const waves = { on: false, breakT: -1, lastBest: 0, lastWave: 0 };   // lastWave: waves cleared this run
export function armWaves(): void { waves.on = true; waves.breakT = -1; waves.lastBest = 0; waves.lastWave = 0; }
export function disarmWaves(): void { waves.on = false; waves.breakT = -1; }

/** Wave w's room plan. Every 3rd: reward card; boss / mini waves drop an item. */
export function wavePlan(w: number): RoomPlan {
  if (w % 10 === 0) return { type: 'BOSS', reward: 'NONE' };          // (boss waves: bossRewards incl. a card)
  if (w % 5 === 0) return { type: 'MINIBOSS', reward: 'ITEM' };
  const card = w % 3 === 0;
  return { type: w >= 3 && w % 3 === 0 ? 'ELITE' : 'COMBAT', reward: card ? 'CARD' : w % 2 ? 'GOLD' : 'NONE' };
}
/** Biome whose monster pool wave w draws from: the first 4 waves Greenwood, then more biomes join the mix
 *  (one more every 5 waves) and the waves rotate through them. Boss waves cycle the six biome bosses. */
export function waveBiome(w: number): number {
  if (w % 10 === 0) return (w / 10 - 1) % WAVES_BIOMES;
  const open = Math.min(WAVES_BIOMES, 1 + Math.floor(w / 5));
  return (w * 7 + Math.floor(w / 3)) % open;
}
/** Depth (enemy hp / damage / budget scaling) of wave w. */
export const waveDepth = (w: number): number => 2 + Math.round(w * 1.6);
/** Roster unlock index (monsters with `from <= index` may appear). */
export const waveIndex = (w: number): number => Math.min(13, w + 1);
/** Bonus elites in normal waves (from wave 8 on). */
export const waveElites = (w: number): number => (w >= 8 ? Math.min(3, Math.floor(w / 8)) : 0);
/** Spawn budget multiplier (more monsters per wave). */
export const waveCrowd = (w: number): number => 0.8 + Math.min(1.0, w * 0.035);   // (kept moderate: phones; the arena caps live units too)

// ------------------------------------------------------- milestones ---
export const WAVE_MILESTONES = [10, 20, 30, 50] as const;
export interface WaveMilestone { wave: number; gems: number; shards: number; rarity: Rarity }
export function waveMilestone(w: number): WaveMilestone | null {
  switch (w) {
    case 10: return { wave: 10, gems: 50, shards: 3, rarity: 'RARE' };
    case 20: return { wave: 20, gems: 100, shards: 3, rarity: 'EPIC' };
    case 30: return { wave: 30, gems: 150, shards: 2, rarity: 'LEGENDARY' };
    case 50: return { wave: 50, gems: 300, shards: 1, rarity: 'MYTHIC' };
    default: return null;
  }
}
export const milestoneText = (m: WaveMilestone): string => `${m.gems} gems + ${m.shards} ${m.rarity.charAt(0) + m.rarity.slice(1).toLowerCase()} shard${m.shards > 1 ? 's' : ''}`;
