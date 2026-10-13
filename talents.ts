// ============================================================================
// Talent trees: permanent (profile) per class, 3 branches x 6 nodes.
// Points: 1 per Hero Rank (+1 bonus every 5 ranks). Respec costs gold.
// Effects are plain StatFx merged in store.calculateStats; the mechanics are
// read from the new PlayerStats fields by the engine systems.
// ============================================================================
import type { HeroClass } from './types';
import type { StatFx } from './statFx';
import { accumulate, type FxAcc } from './statFx';

export interface TalentNode {
  id: string;
  hero: HeroClass;
  branch: 0 | 1 | 2;
  row: number;            // 0 (top) .. 3
  x: number;              // 0..2 inside the branch
  name: string;
  desc: string;           // effect per rank
  max: number;
  req: string[];          // every listed node needs >= 1 rank
  icon: string;           // 'u:TYPE' (UpgradeArt) or skill icon id
  fx: StatFx;             // per rank
  capstone?: boolean;
}
export interface TalentBranch { name: string; blurb: string; color: string }

export const BRANCHES: Record<HeroClass, TalentBranch[]> = {
  ARCHER: [
    { name: 'Marksman', blurb: 'Crits and attack speed', color: '#f0b64a' },
    { name: 'Elementalist', blurb: 'Fire and ice arrow procs', color: '#ff7a3c' },
    { name: 'Survivalist', blurb: 'Dash, speed and evasion', color: '#5fd35a' },
  ],
  WIZARD: [
    { name: 'Arcane', blurb: 'Skill damage and mana', color: '#b07cff' },
    { name: 'Storm', blurb: 'Chain lightning and typhoons', color: '#ffe14a' },
    { name: 'Frost', blurb: 'Blizzard and slows', color: '#7ee0ff' },
  ],
  BARBARIAN: [
    { name: 'Berserker', blurb: 'Rage and low-health power', color: '#ff5a4a' },
    { name: 'Juggernaut', blurb: 'Health, defense and thorns', color: '#9fb2c8' },
    { name: 'Earthshaker', blurb: 'Stomp radius and stun', color: '#d99a4a' },
  ],
};

type Row = [name: string, desc: string, max: number, icon: string, fx: StatFx];
// Branch layout: [root, left1, right1, left2, right2, capstone]
const LAYOUT: { row: number; x: number; req: number[] }[] = [
  { row: 0, x: 1, req: [] }, { row: 1, x: 0, req: [0] }, { row: 1, x: 2, req: [0] },
  { row: 2, x: 0, req: [1] }, { row: 2, x: 2, req: [2] }, { row: 3, x: 1, req: [3, 4] },
];

const DEF: Record<HeroClass, [string, Row[]][]> = {
  ARCHER: [
    ['m', [
      ['Keen Eye', '+2% crit rate', 3, 'u:CRIT_RATE', { add: { critRate: 0.02 } }],
      ['Quick Draw', '+4% attack speed', 3, 'u:FIRE_RATE', { mul: { fireRate: 0.04 } }],
      ['Deadly Aim', '+10% crit damage', 3, 'u:CRIT_DAMAGE', { add: { critDamage: 0.1 } }],
      ['Steady Hands', '+5% damage', 2, 'u:DAMAGE', { mul: { damage: 0.05 } }],
      ['Piercing Shots', '+1 projectile pierce', 2, 'piercing', { add: { pierceBonus: 1 } }],
      ['Twin Volley', 'Every 6th attack fires twice', 1, 'u:MULTISHOT', { add: { echoEvery: 6 } }],
    ]],
    ['e', [
      ['Fire Affinity', '+4% chance to burn on hit', 3, 'burning', { add: { onHitBurnChance: 0.04 } }],
      ['Frost Affinity', '+6% chance to slow on hit', 3, 'freezing', { add: { onHitSlowChance: 0.06 } }],
      ['Quick Study', 'Fire / ice arrow N -1 per rank', 2, 'u:SKILL_BURNING', { add: { procHaste: 1 } }],
      ['Searing Arrows', '+10% skill damage', 2, 'u:SKILL_FREEZING', { add: { skillDamage: 0.1 } }],
      ['Elemental Power', '+4% damage', 2, 'u:DAMAGE', { mul: { damage: 0.04 } }],
      ['Convergence', 'Fire / ice arrows N -2, +10% burn and slow chance', 1, 'u:SKILL_PIERCING', { add: { procHaste: 2, onHitBurnChance: 0.1, onHitSlowChance: 0.1 } }],
    ]],
    ['s', [
      ['Fleet Foot', '+3% move speed', 3, 'u:SPEED', { mul: { moveSpeed: 0.03 } }],
      ['Evasion', '+2% dodge', 3, 'dash', { add: { dodge: 0.02 } }],
      ['Hardy', '+8 max health', 3, 'u:HEALTH', { add: { maxHealth: 8 } }],
      ['Second Wind', '-0.3s dash cooldown', 2, 'u:DASH_COOLDOWN', { add: { dashCooldown: -0.3 } }],
      ["Hawk Eyes", "Hawk's Focus lasts +1.5s", 2, 'weapon', { add: { hawkBonus: 1.5 } }],
      ['Phantom', '+1 dash charge, +5% dodge', 1, 'u:SKILL_DASH', { add: { dashCharges: 1, dodge: 0.05 } }],
    ]],
  ],
  WIZARD: [
    ['a', [
      ['Arcane Power', '+8% skill damage', 3, 'special', { add: { skillDamage: 0.08 } }],
      ['Mana Well', '+20 max mana', 3, 'u:MAX_MANA', { add: { maxMana: 20 } }],
      ['Siphon', '+0.6 mana regen/s', 3, 'gravity', { add: { manaRegen: 0.6 } }],
      ['Spell Edge', '+3% crit rate', 2, 'u:CRIT_RATE', { add: { critRate: 0.03 } }],
      ['Focus', '+3% cooldown reduction', 2, 'weapon', { add: { cooldownReduction: 0.03 } }],
      ['Archmagus', 'Spells cost 30% less mana, +20% skill damage', 1, 'u:SKILL_GRAVITY', { add: { manaCostCut: 0.3, skillDamage: 0.2 } }],
    ]],
    ['t', [
      ['Static Charge', '+4% damage', 3, 'u:DAMAGE', { mul: { damage: 0.04 } }],
      ['Chain Lightning', 'Thundercaller chains +1 target', 2, 'thunder', { add: { thunderChain: 1 } }],
      ['Storm Surge', 'Typhoon lasts +2s', 3, 'storm', { add: { stormBonus: 2 } }],
      ['Overcharge', 'Thunder bolt N -1 per rank', 2, 'u:SKILL_THUNDER', { add: { procHaste: 1 } }],
      ['Tailwind', '+4% move speed', 2, 'u:SPEED', { mul: { moveSpeed: 0.04 } }],
      ['Tempest', 'A second typhoon, chain +1 target', 1, 'u:SKILL_STORM', { add: { stormTwin: 1, thunderChain: 1 } }],
    ]],
    ['f', [
      ['Chill', '+6% chance to slow on hit', 3, 'freezing', { add: { onHitSlowChance: 0.06 } }],
      ['Wide Blizzard', '+3 blizzard radius', 3, 'freezeSpell', { add: { blizzardRadius: 3 } }],
      ['Icy Veins', '+3% cooldown reduction', 2, 'u:SKILL_FREEZE_SPELL', { add: { cooldownReduction: 0.03 } }],
      ['Deep Freeze', 'Blizzard freezes +1s', 2, 'freezeSpell', { add: { blizzFreeze: 1 } }],
      ['Frostbite', '+10% crit damage', 3, 'u:CRIT_DAMAGE', { add: { critDamage: 0.1 } }],
      ['Absolute Zero', 'Blizzard +6 radius, freezes +2s, +15% skill damage', 1, 'u:SKILL_FREEZE_SPELL', { add: { blizzardRadius: 6, blizzFreeze: 2, skillDamage: 0.15 } }],
    ]],
  ],
  BARBARIAN: [
    ['b', [
      ['Bloodlust', '+4% attack speed', 3, 'u:FIRE_RATE', { mul: { fireRate: 0.04 } }],
      ['Rage Mastery', 'Rage lasts +1s', 3, 'rage', { add: { rageBonus: 1 } }],
      ['Last Stand', '+10% attack speed below 50% HP', 3, 'barrier', { add: { lowHpHaste: 0.1 } }],
      ['Brutality', '+15% crit damage', 2, 'u:CRIT_DAMAGE', { add: { critDamage: 0.15 } }],
      ['Frenzy', '+1% life steal', 2, 'regen', { add: { lifeSteal: 0.01 } }],
      ['Undying Rage', '+40% damage below 35% HP, +2% life steal', 1, 'u:SKILL_RAGE', { add: { berserk: 0.4, lifeSteal: 0.02 } }],
    ]],
    ['j', [
      ['Thick Skin', '+3 defense', 3, 'u:DEFENSE', { add: { defense: 3 } }],
      ['Vitality', '+12 max health', 3, 'u:HEALTH', { add: { maxHealth: 12 } }],
      ['Spiked Armor', '+6 thorns', 3, 'barrier', { add: { thorns: 6 } }],
      ['Regeneration', '+0.8 HP regen/s', 2, 'regen', { add: { regen: 0.8 } }],
      ['Bulwark', 'Take 3% less damage', 2, 'u:DEFENSE', { add: { dmgReduce: 0.03 } }],
      ['Immortal', 'Take 12% less damage, +10% max health', 1, 'u:SKILL_BARRIER', { add: { dmgReduce: 0.12 }, mul: { maxHealth: 0.1 } }],
    ]],
    ['k', [
      ['Heavy Hands', '+0.3 knockback', 3, 'stamp', { add: { knockback: 0.3 } }],
      ['Tremor', 'Mega Stamp radius +2', 3, 'u:SKILL_STAMP', { add: { stompRadius: 2 } }],
      ['Concussion', 'Stomp stuns +0.7s', 2, 'stamp', { add: { stompStun: 0.7 } }],
      ['Shatter', 'Stomp N -1 per rank', 2, 'orbital', { add: { procHaste: 1 } }],
      ['Aftershock', '+25% stomp damage', 2, 'u:DAMAGE', { add: { stompPower: 0.25 } }],
      ['Earthquake', 'Stomp +50% damage, +5 radius, stuns +1.5s', 1, 'u:SKILL_STAMP', { add: { stompPower: 0.5, stompRadius: 5, stompStun: 1.5 } }],
    ]],
  ],
};

export const TALENTS: TalentNode[] = [];
(Object.keys(DEF) as HeroClass[]).forEach((hero) => {
  DEF[hero].forEach(([pfx, rows], b) => {
    rows.forEach((r, i) => {
      const L = LAYOUT[i];
      TALENTS.push({
        id: `${hero[0].toLowerCase()}_${pfx}${i}`, hero, branch: b as 0 | 1 | 2, row: L.row, x: L.x,
        name: r[0], desc: r[1], max: r[2], icon: r[3], fx: r[4],
        req: L.req.map((q) => `${hero[0].toLowerCase()}_${pfx}${q}`), capstone: i === 5,
      });
    });
  });
});
export const TALENT_BY_ID: Record<string, TalentNode> = Object.fromEntries(TALENTS.map((t) => [t.id, t]));
export const talentsOf = (hero: HeroClass): TalentNode[] => TALENTS.filter((t) => t.hero === hero);

export type TalentRanks = Record<string, number>;
export const emptyTalents = (): Record<HeroClass, TalentRanks> => ({ ARCHER: {}, WIZARD: {}, BARBARIAN: {} });

/** 1 point per Hero Rank, +1 bonus every 5 ranks. */
export const talentPointsTotal = (rank: number): number => Math.max(0, Math.floor(rank)) + Math.floor(rank / 5);
export const talentsSpent = (ranks: TalentRanks): number => { let n = 0; for (const k in ranks) n += ranks[k]; return n; };
export const branchSpent = (hero: HeroClass, branch: number, ranks: TalentRanks): number =>
  talentsOf(hero).reduce((n, t) => n + (t.branch === branch ? ranks[t.id] || 0 : 0), 0);
export const CAPSTONE_BRANCH_POINTS = 6;
export const respecCost = (ranks: TalentRanks): number => { const s = talentsSpent(ranks); return s > 0 ? 200 + 150 * s : 0; };

export type AllocBlock = null | 'max' | 'points' | 'prereq' | 'branch';
export function allocBlock(node: TalentNode, ranks: TalentRanks, free: number): AllocBlock {
  if ((ranks[node.id] || 0) >= node.max) return 'max';
  if (node.req.some((r) => !(ranks[r] > 0))) return 'prereq';
  if (node.capstone && branchSpent(node.hero, node.branch, ranks) < CAPSTONE_BRANCH_POINTS) return 'branch';
  if (free <= 0) return 'points';
  return null;
}

/** Adds all allocated talent effects of `hero` into `acc`. */
export function accumulateTalents(acc: FxAcc, hero: HeroClass, ranks: TalentRanks | undefined): void {
  if (!ranks) return;
  for (const t of talentsOf(hero)) { const r = ranks[t.id]; if (r > 0) accumulate(acc, t.fx, r); }
}

/** Drops invalid / out-of-range entries when loading a saved profile. */
export function sanitizeTalents(raw: unknown): Record<HeroClass, TalentRanks> {
  const out = emptyTalents();
  if (!raw || typeof raw !== 'object') return out;
  for (const t of TALENTS) {
    const v = (raw as Record<string, Record<string, unknown>>)[t.hero]?.[t.id];
    if (typeof v === 'number' && v > 0) out[t.hero][t.id] = Math.min(t.max, Math.floor(v));
  }
  return out;
}
