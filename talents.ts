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
  cost: number;           // talent points per rank (deeper tiers cost more)
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
    { name: 'Earthshaker', blurb: 'Axe Storm axes and ricochets', color: '#d99a4a' },
  ],
  NECROMANCER: [
    { name: 'Gravelord', blurb: 'Stronger, longer-lived minions', color: '#b08aff' },
    { name: 'Plague', blurb: 'Curses and skill damage', color: '#8be05a' },
    { name: 'Lich', blurb: 'Mana, health and soul drain', color: '#7fd8ff' },
  ],
  KNIGHT: [
    { name: 'Crusader', blurb: 'Sword damage and crits', color: '#e9b949' },
    { name: 'Bastion', blurb: 'Defense, health and shield', color: '#9fb2c8' },
    { name: 'Templar', blurb: 'Holy skills and the aura', color: '#fff0a8' },
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
      ['Assassin', '+3% damage, +25% backstab damage', 2, 'u:DAMAGE', { mul: { damage: 0.03 }, add: { backstab: 0.25 } }],
      ['Gale Force', 'Gale Arrow +20% width; +1 arrow pierce', 2, 'GALE_ARROW', { add: { pierceBonus: 1, galeWidth: 0.2 } }],
      ['Twin Volley', 'Every 6th attack fires twice', 1, 'u:MULTISHOT', { add: { echoEvery: 6 } }],
    ]],
    ['e', [
      ['Fire Affinity', '+4% chance to burn on hit', 3, 'burning', { add: { onHitBurnChance: 0.04 } }],
      ['Frost Affinity', '+6% chance to slow on hit', 3, 'freezing', { add: { onHitSlowChance: 0.06 } }],
      ['Quick Study', 'Fire / ice arrow N -1 per rank', 2, 'u:SKILL_BURNING', { add: { procHaste: 1 } }],
      ['Searing Arrows', '+10% skill damage', 2, 'u:SKILL_FREEZING', { add: { skillDamage: 0.1 } }],
      ['Elemental Power', '+4% damage, burn stacks 1 more time', 1, 'u:DAMAGE', { mul: { damage: 0.04 }, add: { burnStacks: 1 } }],
      ['Convergence', 'Fire / ice arrows N -2, +10% burn and slow chance', 1, 'u:SKILL_PIERCING', { add: { procHaste: 2, onHitBurnChance: 0.1, onHitSlowChance: 0.1 } }],
    ]],
    ['s', [
      ['Fleet Foot', '+3% move speed', 3, 'u:SPEED', { mul: { moveSpeed: 0.03 } }],
      ['Evasion', '+2% dodge', 3, 'dash', { add: { dodge: 0.02 } }],
      ['Hardy', '+8 max health', 3, 'u:HEALTH', { add: { maxHealth: 8 } }],
      ['Second Wind', '-0.3s dash cooldown', 2, 'u:DASH_COOLDOWN', { add: { dashCooldown: -0.3 } }],
      ['Storm Caller', 'Storm of a Thousand Arrows lasts +1.5s', 2, 'STORM_ARROWS', { add: { hawkBonus: 1.5 } }],
      ['Phantom', '+10% dodge, +5% move speed', 1, 'u:SKILL_DASH', { add: { dodge: 0.1 }, mul: { moveSpeed: 0.05 } }],
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
      ['Chain Lightning', 'Thundercaller and Storm Orbs chain +1 target', 2, 'thunder', { add: { thunderChain: 1 } }],
      ['Storm Surge', 'Storm tornado lasts +0.5s, Storm Orbs last +2s', 3, 'storm', { add: { stormBonus: 2 } }],
      ['Overcharge', 'Thunder bolt N -1 per rank', 2, 'u:SKILL_THUNDER', { add: { procHaste: 1 } }],
      ['Tailwind', '+4% move speed', 2, 'u:SPEED', { mul: { moveSpeed: 0.04 } }],
      ['Tempest', 'Storm summons a twin tornado, chain +1 target, Storm Orbs +1 orb', 1, 'STORM_ORBS', { add: { stormTwin: 1, thunderChain: 1, orbBonus: 1 } }],
    ]],
    ['f', [
      ['Chill', '+6% chance to slow on hit', 3, 'freezing', { add: { onHitSlowChance: 0.06 } }],
      ['Wide Blizzard', '+1 blizzard radius', 3, 'freezeSpell', { add: { blizzardRadius: 1 } }],
      ['Icy Veins', '+3% cooldown reduction', 2, 'u:SKILL_FREEZE_SPELL', { add: { cooldownReduction: 0.03 } }],
      ['Deep Freeze', 'Blizzard slow lasts +1s', 2, 'freezeSpell', { add: { blizzFreeze: 1 } }],
      ['Frostbite', '+10% crit damage', 3, 'u:CRIT_DAMAGE', { add: { critDamage: 0.1 } }],
      ['Absolute Zero', 'Blizzard +2 radius, slow +2s, +15% skill damage', 1, 'u:SKILL_FREEZE_SPELL', { add: { blizzardRadius: 2, blizzFreeze: 2, skillDamage: 0.15 } }],
    ]],
  ],
  BARBARIAN: [
    ['b', [
      ['Bloodlust', '+4% attack speed', 3, 'u:FIRE_RATE', { mul: { fireRate: 0.04 } }],
      ['Rage Mastery', 'Bloodrage Leap (Space) grants Rage for +1s longer', 3, 'BLOODRAGE_LEAP', { add: { rageBonus: 1 } }],
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
      ['Heavy Hands', '+0.3 knockback, your stuns +0.2s', 3, 'stamp', { add: { knockback: 0.3, stunBonus: 0.2 } }],
      ['Tremor', 'Axe Storm axes +10% size', 3, 'u:SKILL_STAMP', { add: { axeSize: 0.1 } }],
      ['Rebound', 'Axe Storm axes ricochet +1 more time', 2, 'stamp', { add: { axeBounce: 1 } }],
      ['Shatter', 'Axe Storm N -1 per rank', 2, 'orbital', { add: { procHaste: 1 } }],
      ['Aftershock', '+25% Axe Storm damage', 2, 'u:DAMAGE', { add: { stompPower: 0.25 } }],
      ['Axe Tempest', 'Axe Storm +1 axe, +50% damage, +1 ricochet, +20% size', 1, 'u:SKILL_STAMP', { add: { axeCount: 1, stompPower: 0.5, axeBounce: 1, axeSize: 0.2 } }],
    ]],
  ],
  NECROMANCER: [
    ['g', [
      ['Bone Craft', '+8% minion damage', 3, 'RAISE_DEAD', { add: { minionDmg: 0.08 } }],
      ['Bone Marrow', 'Minions +15% HP', 3, 'RAISE_DEAD', { add: { minionLife: 1.5 } }],
      ['Marrow', '+4% minion damage, +5 max health', 3, 'u:DAMAGE', { add: { minionDmg: 0.04, maxHealth: 5 } }],
      ['Legion', '+1 skeleton per Raise Dead (max 4)', 1, 'RAISE_DEAD', { add: { minionCount: 1 } }],
      ['Frenzied Dead', 'Minions attack 12% faster', 2, 'u:FIRE_RATE', { add: { minionHaste: 0.12 } }],
      ['Gravelord', '+1 skeleton per Raise Dead (max 4), +20% minion damage', 1, 'ARMY_DEAD', { add: { minionCount: 1, minionDmg: 0.2 } }],
    ]],
    ['p', [
      ['Malice', '+6% skill damage', 3, 'u:SKILL_WEAPON', { add: { skillDamage: 0.06 } }],
      ['Rot', '+3% cooldown reduction', 3, 'u:SKILL_WEAPON', { add: { cooldownReduction: 0.03 } }],
      ['Dark Focus', '+2% crit rate', 3, 'u:CRIT_RATE', { add: { critRate: 0.02 } }],
      ['Withering', '+10% skill damage', 2, 'CURSE_FIELD', { add: { skillDamage: 0.1 } }],
      ['Bone Shards', '+15% crit damage', 2, 'u:CRIT_DAMAGE', { add: { critDamage: 0.15 } }],
      ['Pestilence', '+20% skill damage, +6% cooldown reduction', 1, 'BONE_SPEAR', { add: { skillDamage: 0.2, cooldownReduction: 0.06 } }],
    ]],
    ['l', [
      ['Phylactery', '+12 max health', 3, 'u:HEALTH', { add: { maxHealth: 12 } }],
      ['Soul Well', '+20 max mana, +0.5 mana regen', 3, 'u:MAX_MANA', { add: { maxMana: 20, manaRegen: 0.5 } }],
      ['Grave Ward', '+3 defense', 3, 'u:DEFENSE', { add: { defense: 3 } }],
      ['Drain', '+1% life steal', 2, 'regen', { add: { lifeSteal: 0.01 } }],
      ['Deathless', 'Take 3% less damage', 2, 'u:DEFENSE', { add: { dmgReduce: 0.03 } }],
      ['Lichdom', 'Take 10% less damage, +15% max mana', 1, 'SOUL_STEP', { add: { dmgReduce: 0.1 }, mul: { maxMana: 0.15 } }],
    ]],
  ],
  KNIGHT: [
    ['c', [
      ['Edge Discipline', '+3% damage', 3, 'u:DAMAGE', { mul: { damage: 0.03 } }],
      ['Swift Strikes', '+4% attack speed', 3, 'u:FIRE_RATE', { mul: { fireRate: 0.04 } }],
      ['Precision', '+2% crit rate', 3, 'u:CRIT_RATE', { add: { critRate: 0.02 } }],
      ['Executioner', '+15% crit damage', 2, 'u:CRIT_DAMAGE', { add: { critDamage: 0.15 } }],
      ['Cleave', '+0.3 knockback, +3% damage', 2, 'u:DAMAGE', { add: { knockback: 0.3 }, mul: { damage: 0.03 } }],
      ['Holy Avenger', 'Divine Avatar lasts +2s, +10% damage', 1, 'DIVINE_AVATAR', { add: { avatarBonus: 2 }, mul: { damage: 0.1 } }],
    ]],
    ['s', [
      ['Plate Mastery', '+4 defense', 3, 'u:DEFENSE', { add: { defense: 4 } }],
      ['Stalwart', '+15 max health', 3, 'u:HEALTH', { add: { maxHealth: 15 } }],
      ['Retribution', '+8 thorns', 3, 'barrier', { add: { thorns: 8 } }],
      ['Second Wind', '+1 HP regen/s', 2, 'regen', { add: { regen: 1 } }],
      ['Shield Training', 'Take 3% less damage', 2, 'u:DEFENSE', { add: { dmgReduce: 0.03 } }],
      ['Unbreakable', 'Take 12% less damage, +12% max health', 1, 'u:SKILL_BARRIER', { add: { dmgReduce: 0.12 }, mul: { maxHealth: 0.12 } }],
    ]],
    ['t', [
      ['Devotion', '+6% skill damage', 3, 'u:SKILL_WEAPON', { add: { skillDamage: 0.06 } }],
      ['Faith', '+20 max mana, +0.5 mana regen', 3, 'u:MAX_MANA', { add: { maxMana: 20, manaRegen: 0.5 } }],
      ['Zeal', '+3% cooldown reduction', 3, 'u:SKILL_WEAPON', { add: { cooldownReduction: 0.03 } }],
      ['Radiance', '+10% skill damage', 2, 'HOLY_WAVE', { add: { skillDamage: 0.1 } }],
      ['Sanctuary', '+1% life steal', 2, 'regen', { add: { lifeSteal: 0.01 } }],
      ['Light Incarnate', '+20% skill damage, +6% cooldown reduction', 1, 'JUDGMENT', { add: { skillDamage: 0.2, cooldownReduction: 0.06 } }],
    ]],
  ],
};

/** Points per rank by row: the first two tiers 1, the third 2, the capstone 3. */
const TIER_COST = [1, 1, 2, 3];

export const TALENTS: TalentNode[] = [];
(Object.keys(DEF) as HeroClass[]).forEach((hero) => {
  DEF[hero].forEach(([pfx, rows], b) => {
    rows.forEach((r, i) => {
      const L = LAYOUT[i];
      TALENTS.push({
        id: `${hero[0].toLowerCase()}_${pfx}${i}`, hero, branch: b as 0 | 1 | 2, row: L.row, x: L.x,
        name: r[0], desc: r[1], max: r[2], icon: r[3], fx: r[4],
        req: L.req.map((q) => `${hero[0].toLowerCase()}_${pfx}${q}`), capstone: i === 5, cost: TIER_COST[L.row],
      });
    });
  });
});
export const TALENT_BY_ID: Record<string, TalentNode> = Object.fromEntries(TALENTS.map((t) => [t.id, t]));
export const talentsOf = (hero: HeroClass): TalentNode[] => TALENTS.filter((t) => t.hero === hero);

export type TalentRanks = Record<string, number>;
export const emptyTalents = (): Record<HeroClass, TalentRanks> => ({ ARCHER: {}, WIZARD: {}, BARBARIAN: {}, KNIGHT: {}, NECROMANCER: {} });

/** 1 point per Hero Rank, +1 bonus every 5 ranks. */
export const talentPointsTotal = (rank: number): number => Math.max(0, Math.floor(rank)) + Math.floor(rank / 5);
export const talentsSpent = (ranks: TalentRanks): number => { let n = 0; for (const k in ranks) n += ranks[k] * (TALENT_BY_ID[k]?.cost ?? 1); return n; };
export const branchSpent = (hero: HeroClass, branch: number, ranks: TalentRanks): number =>
  talentsOf(hero).reduce((n, t) => n + (t.branch === branch ? (ranks[t.id] || 0) * t.cost : 0), 0);
export const CAPSTONE_BRANCH_POINTS = 6;
export const respecCost = (ranks: TalentRanks): number => { const s = talentsSpent(ranks); return s > 0 ? (200 + 150 * s) * 10 : 0; };   // x10 economy

export type AllocBlock = null | 'max' | 'points' | 'prereq' | 'branch';
export function allocBlock(node: TalentNode, ranks: TalentRanks, free: number): AllocBlock {
  if ((ranks[node.id] || 0) >= node.max) return 'max';
  if (node.req.some((r) => !(ranks[r] > 0))) return 'prereq';
  if (node.capstone && branchSpent(node.hero, node.branch, ranks) < CAPSTONE_BRANCH_POINTS) return 'branch';
  if (free < node.cost) return 'points';
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
