// Fishing rod + mining pickaxe tiers (Common -> Mythic). Pure data + helpers (no store / React import).
// Low tiers cost gold, Epic costs Aether Crystals, Legendary / Mythic cost gems (+ crystals). (owner 2026-10-26)
import { GOLD_SCALE } from './constants';
import type { Item, Rarity } from './types';

/** What a tool upgrade costs: gold (already x GOLD_SCALE), Aether Crystals and / or gems. */
export interface ToolCost { gold?: number; crystals?: number; gems?: number }
/** "40,000 G" / "60 Aether Crystals" / "1,500 gems + 150 Aether Crystals" */
export const toolCostText = (c: ToolCost): string => [c.gold ? `${c.gold.toLocaleString()} G` : '', c.gems ? `${c.gems.toLocaleString()} gems` : '', c.crystals ? `${c.crystals.toLocaleString()} Aether Crystals` : ''].filter(Boolean).join(' + ') || 'free';

export interface PickDef {
  name: string; tier: Rarity; cost: ToolCost;
  /** hold-E harvest strokes hit this many times harder (fewer hits per node) */
  mul: number;
  /** chance that a mined node pays its drop twice (better ore) */
  bonus: number;
  desc: string;
}
export const PICKAXES: PickDef[] = [
  { name: 'Mining Pickaxe', tier: 'COMMON', cost: {}, mul: 2, bonus: 0, desc: 'Grit\'s old spare: harvest strokes hit twice as hard.' },
  { name: 'Steel Pickaxe', tier: 'UNCOMMON', cost: { gold: 5000 * GOLD_SCALE }, mul: 2.5, bonus: 0.1, desc: 'Sharper steel: strokes hit 2.5x, and 10% of nodes pay out twice.' },
  { name: 'Aether Pickaxe', tier: 'RARE', cost: { gold: 25000 * GOLD_SCALE }, mul: 3, bonus: 0.2, desc: 'Strokes hit 3x; 20% of nodes pay out twice.' },
  { name: 'Crystalline Pickaxe', tier: 'EPIC', cost: { crystals: 40 }, mul: 4, bonus: 0.3, desc: 'Strokes hit 4x; 30% of nodes pay out twice.' },
  { name: 'Sunforged Pickaxe', tier: 'LEGENDARY', cost: { gems: 450 }, mul: 5.5, bonus: 0.45, desc: 'Strokes hit 5.5x; nearly half the nodes pay out twice.' },
  { name: 'Mythril Pickaxe', tier: 'MYTHIC', cost: { gems: 1200, crystals: 120 }, mul: 8, bonus: 0.65, desc: 'Veins crumble in a stroke or two; 65% of nodes pay out twice.' },
];
export const PICK_MAX = PICKAXES.length - 1;
export const pickTierOf = (n: number | undefined): number => Math.max(0, Math.min(PICK_MAX, Math.floor(Number(n) || 0)));

/** The Mining Pickaxe item re-skinned to a tier (name / rarity / text); other items untouched. */
export function skinPickaxe<T extends Item>(i: T, tier: number): T {
  const d = PICKAXES[pickTierOf(tier)];
  return { ...i, name: d.name, rarity: d.tier, description: `Equip it as your weapon: every ore vein, crystal, herb and other harvest node falls faster. ${d.desc} Upgrade it at the Mining Supplies stall. Its swing is weak, so swap back to your real weapon to fight.` };
}
