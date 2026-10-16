// ============================================================================
// Talent trees: permanent (profile) per class. A radial graph (owner reference): the class emblem in the centre and
// four branches (up / right / down / left), each fanning out over five rings:
//   ring 0  root ............................. (no requirement)
//   ring 1  two nodes ........................ need the root
//   ring 2  four nodes (two per ring-1 node) . need their parent
//   ring 3  two nodes ........................ each needs BOTH ring-2 nodes on its side
//   ring 4  capstone ......................... needs both ring-3 nodes
// (owner: a mix) plain stat talents need their parents learned (1 rank) and little / no class level; special
// talents and the capstone need their parents MAXED and the ring's class level (see reqMax).
// Rings also need a class level (RING_LEVEL) and cost more points per rank (RING_COST). 4 points per class level;
// a full tree costs 158-164 of the 200 points at Lv 50, so every talent fits at the cap - before that you choose.
// Effects are plain StatFx merged in store.calculateStats; the mechanics are read from PlayerStats by the engine.
// ============================================================================
import type { HeroClass } from './types';
import type { StatFx } from './statFx';
import { accumulate, describeFx, type FxAcc } from './statFx';

export interface TalentNode {
  id: string;
  hero: HeroClass;
  branch: number;
  row: number;            // ring 0 (next to the emblem) .. 4 (capstone)
  x: number;              // angle offset (degrees) from the branch axis
  lvReq: number;          // class level needed (by ring)
  name: string;
  desc: string;           // effect per rank
  max: number;
  req: string[];          // every listed node must be learned first (MAXED for a capstone, see reqMet)
  icon: string;           // 'u:TYPE' (UpgradeArt) or skill icon id
  fx: StatFx;             // per rank
  capstone?: boolean;
  /** prerequisites must be MAXED (strong talents), otherwise one rank in each is enough */
  reqMax?: boolean;
  /** a special talent: changes a mechanic (extra dash / pierce / skeleton / axe / chain...), drawn with a gold star */
  special?: boolean;
  cost: number;           // talent points per rank (deeper tiers cost more)
}
export interface TalentBranch { name: string; blurb: string; color: string }

export const BRANCHES: Record<HeroClass, TalentBranch[]> = {
  ARCHER: [
    { name: 'Marksman', blurb: 'Crits and attack speed', color: '#f0b64a' },
    { name: 'Elementalist', blurb: 'Fire and ice arrow procs', color: '#ff7a3c' },
    { name: 'Survivalist', blurb: 'Dash, speed and evasion', color: '#5fd35a' },
    { name: 'Ranger', blurb: 'Special tricks: pierce, dash charges, ambush', color: '#7ee8c8' },
  ],
  WIZARD: [
    { name: 'Arcane', blurb: 'Skill damage and mana', color: '#b07cff' },
    { name: 'Storm', blurb: 'Chain lightning and arcane wards', color: '#ffe14a' },
    { name: 'Frost', blurb: 'Blizzard and slows', color: '#7ee0ff' },
    { name: 'Chronomancer', blurb: 'Special tricks: cooldowns, orbs, chains', color: '#ffb3f0' },
  ],
  BARBARIAN: [
    { name: 'Berserker', blurb: 'Rage and low-health power', color: '#ff5a4a' },
    { name: 'Juggernaut', blurb: 'Health, defense and thorns', color: '#9fb2c8' },
    { name: 'Earthshaker', blurb: 'Axe Storm axes and ricochets', color: '#d99a4a' },
    { name: 'Warlord', blurb: 'Special tricks: extra axes, leap, bloodlust', color: '#ff9a5a' },
  ],
  NECROMANCER: [
    { name: 'Gravelord', blurb: 'Stronger, longer-lived minions', color: '#b08aff' },
    { name: 'Plague', blurb: 'Curses and skill damage', color: '#8be05a' },
    { name: 'Lich', blurb: 'Mana, health and soul drain', color: '#7fd8ff' },
    { name: 'Bone Lord', blurb: 'Special tricks: more skeletons, swift dead', color: '#e8e0c8' },
  ],
  KNIGHT: [
    { name: 'Crusader', blurb: 'Sword damage and crits', color: '#e9b949' },
    { name: 'Bastion', blurb: 'Defense, health and shield', color: '#9fb2c8' },
    { name: 'Templar', blurb: 'Holy skills and the aura', color: '#fff0a8' },
    { name: 'Paladin', blurb: 'Special tricks: avatar, dash, retribution', color: '#ffd27a' },
  ],
};

type Row = [name: string, desc: string, max: number, icon: string, fx: StatFx];
// Branch layout: node index -> ring, angle offset from the branch axis, prerequisites (must be maxed). Content order:
// DEF rows 0..4, EXTRA rows 0..3, DEF row 5 (capstone).
const LAYOUT: { row: number; x: number; req: number[] }[] = [
  { row: 0, x: 0, req: [] },
  { row: 1, x: -20, req: [0] }, { row: 1, x: 20, req: [0] },
  { row: 2, x: -38, req: [1] }, { row: 2, x: 38, req: [2] }, { row: 2, x: -13, req: [1] }, { row: 2, x: 13, req: [2] },
  { row: 3, x: -22, req: [3, 5] }, { row: 3, x: 22, req: [4, 6] },
  { row: 4, x: 0, req: [7, 8] },
];
/** Extra paths per branch (owner: more talent choices): two more nodes in each lane before the capstone. */
const EXTRA: Record<HeroClass, Row[][]> = {
  ARCHER: [
    [['Long Shot', '', 2, 'GALE_ARROW', { add: { attackRange: 2.2 } }], ['Hunter\'s Mark', '', 2, 'u:DAMAGE', { mul: { damage: 0.03 } }], ['Hawkeye', '', 2, 'u:CRIT_DAMAGE', { add: { critDamage: 0.12 } }], ['Rapid Fire', '', 2, 'u:FIRE_RATE', { mul: { fireRate: 0.05 } }]],
    [['Kindling', '', 2, 'burning', { add: { onHitBurnChance: 0.05 } }], ['Rime', '', 2, 'freezing', { add: { onHitSlowChance: 0.06 } }], ['Wildfire', '', 2, 'u:SKILL_BURNING', { add: { skillDamage: 0.1 } }], ['Glacial Tips', '', 2, 'u:SKILL_FREEZING', { add: { critDamage: 0.12 } }]],
    [['Light Step', '', 2, 'u:SPEED', { mul: { moveSpeed: 0.04 } }], ['Tumble', '', 2, 'dash', { add: { dodge: 0.03 } }], ['Rugged', '', 2, 'u:HEALTH', { add: { maxHealth: 12 } }], ['Windrunner', '', 2, 'u:SKILL_DASH', { add: { dodge: 0.03 }, mul: { moveSpeed: 0.03 } }]],
    [['Eagle Eye', '', 2, 'u:CRIT_RATE', { add: { attackRange: 2.2, critRate: 0.01 } }], ['Falconer', 'Arrow storm lasts +1s', 2, 'STORM_ARROWS', { add: { hawkBonus: 1 } }], ['Snare Shot', '', 2, 'freezing', { add: { onHitSlowChance: 0.06 } }], ['Deep Quiver', 'Arrows pierce +1 more enemy', 1, 'u:SKILL_PIERCING', { add: { pierceBonus: 1 } }]],
  ],
  WIZARD: [
    [['Spellweave', '', 2, 'special', { add: { skillDamage: 0.08 } }], ['Deep Well', '', 2, 'u:MAX_MANA', { add: { maxMana: 25 } }], ['Arcane Echo', '', 2, 'u:CRIT_DAMAGE', { add: { critDamage: 0.12 } }], ['Clarity', '', 2, 'gravity', { add: { manaRegen: 0.8 } }]],
    [['Conductor', '', 2, 'thunder', { mul: { damage: 0.04 } }], ['Ion Field', '', 2, 'storm', { add: { cooldownReduction: 0.03 } }], ['Thunderhead', '', 2, 'u:SKILL_THUNDER', { add: { skillDamage: 0.1 } }], ['Galvanize', '', 2, 'u:SPEED', { mul: { moveSpeed: 0.04 } }]],
    [['Permafrost', '', 2, 'freezing', { add: { onHitSlowChance: 0.06 } }], ['Ice Armor', '', 2, 'u:DEFENSE', { add: { defense: 3 } }], ['Shatterpoint', '', 2, 'u:CRIT_RATE', { add: { critRate: 0.03 } }], ['Winter\'s Grasp', '', 2, 'freezeSpell', { add: { skillDamage: 0.1 } }]],
    [['Haste', '', 2, 'u:SPEED', { mul: { moveSpeed: 0.04 } }], ['Rewind', '', 2, 'regen', { add: { regen: 0.8 } }], ['Echoing Bolt', 'Thunder bolt N -1', 1, 'u:SKILL_THUNDER', { add: { procHaste: 1 } }], ['Eternity', '', 2, 'special', { add: { skillDamage: 0.1 } }]],
  ],
  BARBARIAN: [
    [['Savagery', '', 2, 'u:DAMAGE', { mul: { damage: 0.04 } }], ['Bloodthirst', '', 2, 'regen', { add: { lifeSteal: 0.01 } }], ['Rampage', '', 2, 'u:FIRE_RATE', { mul: { fireRate: 0.05 } }], ['Gore', '', 2, 'u:CRIT_DAMAGE', { add: { critDamage: 0.15 } }]],
    [['Iron Hide', '', 2, 'u:DEFENSE', { add: { defense: 4 } }], ['Giant\'s Blood', '', 2, 'u:HEALTH', { add: { maxHealth: 18 } }], ['Thornmail', '', 2, 'barrier', { add: { thorns: 8 } }], ['Rooted', '', 2, 'u:DEFENSE', { add: { dmgReduce: 0.03 } }]],
    [['Fault Line', '', 2, 'stamp', { add: { stompPower: 0.2 } }], ['Hurl', '', 2, 'orbital', { add: { axeSize: 0.1 } }], ['Quake', '', 2, 'u:SKILL_STAMP', { add: { stunBonus: 0.3 } }], ['Landslide', '', 2, 'u:DAMAGE', { mul: { damage: 0.04 } }]],
    [['Battle Hunger', '', 2, 'u:FIRE_RATE', { mul: { fireRate: 0.05 } }], ['Hide of Iron', '', 2, 'u:DEFENSE', { add: { defense: 4 } }], ['Boomerang', 'Axe Storm axes ricochet +1 more time', 1, 'stamp', { add: { axeBounce: 1 } }], ['Last Rites', '', 2, 'barrier', { add: { lowHpHaste: 0.1 } }]],
  ],
  NECROMANCER: [
    [['Bone Armor', '', 2, 'RAISE_DEAD', { add: { minionLife: 1.5 } }], ['Grave Pact', '', 2, 'u:DAMAGE', { add: { minionDmg: 0.1 } }], ['Dread March', '', 2, 'u:FIRE_RATE', { add: { minionHaste: 0.1 } }], ['Ossuary', '', 2, 'RAISE_DEAD', { add: { minionDmg: 0.1 } }]],
    [['Blight', '', 2, 'CURSE_FIELD', { add: { skillDamage: 0.08 } }], ['Miasma', '', 2, 'u:SKILL_WEAPON', { add: { cooldownReduction: 0.03 } }], ['Necrosis', '', 2, 'u:CRIT_DAMAGE', { add: { critDamage: 0.15 } }], ['Contagion', '', 2, 'BONE_SPEAR', { add: { skillDamage: 0.1 } }]],
    [['Soul Leech', '', 2, 'regen', { add: { lifeSteal: 0.01 } }], ['Spectral Ward', '', 2, 'u:DEFENSE', { add: { defense: 4 } }], ['Undeath', '', 2, 'u:HEALTH', { add: { maxHealth: 15 } }], ['Eternal', '', 2, 'SOUL_STEP', { add: { dmgReduce: 0.03 } }]],
    [['Marrow Feast', '', 2, 'u:HEALTH', { add: { maxHealth: 12 } }], ['Rattle', '', 2, 'u:FIRE_RATE', { add: { minionHaste: 0.1 } }], ['Bone Wall', '', 2, 'u:DEFENSE', { add: { defense: 4 } }], ['Grim Tide', '', 2, 'u:DAMAGE', { add: { minionDmg: 0.12 } }]],
  ],
  KNIGHT: [
    [['Riposte', '', 2, 'u:CRIT_RATE', { add: { critRate: 0.02 } }], ['Sword Mastery', '', 2, 'u:DAMAGE', { mul: { damage: 0.04 } }], ['Flurry', '', 2, 'u:FIRE_RATE', { mul: { fireRate: 0.05 } }], ['Coup de Grace', '', 2, 'u:CRIT_DAMAGE', { add: { critDamage: 0.15 } }]],
    [['Tower Shield', '', 2, 'u:DEFENSE', { add: { defense: 4 } }], ['Fortitude', '', 2, 'u:HEALTH', { add: { maxHealth: 18 } }], ['Vigil', '', 2, 'regen', { add: { regen: 1 } }], ['Aegis Oath', '', 2, 'u:SKILL_BARRIER', { add: { dmgReduce: 0.03 } }]],
    [['Litany', '', 2, 'HOLY_WAVE', { add: { skillDamage: 0.08 } }], ['Blessed', '', 2, 'u:MAX_MANA', { add: { maxMana: 25 } }], ['Consecrate', '', 2, 'JUDGMENT', { add: { skillDamage: 0.1 } }], ['Grace', '', 2, 'u:SKILL_WEAPON', { add: { cooldownReduction: 0.03 } }]],
    [['Shining Mail', '', 2, 'u:DEFENSE', { add: { defense: 4 } }], ['Valor', '', 2, 'u:DAMAGE', { mul: { damage: 0.04 } }], ['Lay on Hands', '', 2, 'regen', { add: { regen: 1 } }], ['Bulwark Oath', '', 2, 'u:SKILL_BARRIER', { add: { dmgReduce: 0.03 } }]],
  ],
};
/** Count / step mechanics stay whole; every other talent value is cut to 45% (owner: -50% or more). */
const WHOLE = new Set(['dashCharges', 'pierceBonus', 'echoEvery', 'thunderChain', 'procHaste', 'burnStacks', 'orbBonus', 'stormTwin', 'axeBounce', 'axeCount', 'minionCount']);
const TALENT_SCALE = 0.45;
const SPECIAL_KEYS = new Set(['dashCharges', 'hawkBonus', 'avatarBonus', 'rageBonus', 'galeWidth', 'stormBonus', 'blizzFreeze', 'blizzardRadius']);
function scaleFx(fx: StatFx): StatFx {
  const out: StatFx = {};
  for (const part of ['add', 'mul'] as const) {
    const src = fx[part]; if (!src) continue;
    const dst: Record<string, number> = {};
    for (const [k, v] of Object.entries(src)) dst[k] = WHOLE.has(k) ? (v as number) : parseFloat(((v as number) * TALENT_SCALE).toFixed(4));
    (out as Record<string, unknown>)[part] = dst;
  }
  return out;
}

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
      ['Second Wind', '+3% dodge', 2, 'u:DASH_COOLDOWN', { add: { dodge: 0.03 } }],
      ['Storm Caller', 'Storm of a Thousand Arrows lasts +1.5s', 2, 'STORM_ARROWS', { add: { hawkBonus: 1.5 } }],
      ['Phantom', '+10% dodge, +5% move speed', 1, 'u:SKILL_DASH', { add: { dodge: 0.1 }, mul: { moveSpeed: 0.05 } }],
    ]],
    ['r', [
      ['Trailblazer', '', 3, 'u:SPEED', { mul: { moveSpeed: 0.03 } }],
      ['Ricochet', 'Arrows pierce +1 more enemy', 1, 'u:SKILL_PIERCING', { add: { pierceBonus: 1 } }],
      ['Bounty Hunter', '', 3, 'u:DAMAGE', { add: { goldFind: 0.08 } }],
      ['Ambush', '', 2, 'u:CRIT_DAMAGE', { add: { backstab: 0.25 } }],
      ['Double Step', 'Dash +1 charge', 1, 'u:SKILL_DASH', { add: { dashCharges: 1 } }],
      ['Apex Predator', 'Arrows pierce +1, +1 dash charge, +10% damage', 1, 'u:MULTISHOT', { add: { pierceBonus: 1, dashCharges: 1 }, mul: { damage: 0.1 } }],
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
      ['Storm Surge', 'Arcane Shield lasts +0.5s, Storm Orbs last +2s', 3, 'storm', { add: { stormBonus: 2 } }],
      ['Overcharge', 'Thunder bolt N -1 per rank', 2, 'u:SKILL_THUNDER', { add: { procHaste: 1 } }],
      ['Tailwind', '+4% move speed', 2, 'u:SPEED', { mul: { moveSpeed: 0.04 } }],
      ['Tempest', 'Arcane Shield +25% stronger, chain +1 target, Storm Orbs +1 orb', 1, 'STORM_ORBS', { add: { stormTwin: 1, thunderChain: 1, orbBonus: 1 } }],
    ]],
    ['f', [
      ['Chill', '+6% chance to slow on hit', 3, 'freezing', { add: { onHitSlowChance: 0.06 } }],
      ['Wide Blizzard', '+1 blizzard radius', 3, 'freezeSpell', { add: { blizzardRadius: 1 } }],
      ['Icy Veins', '+3% cooldown reduction', 2, 'u:SKILL_FREEZE_SPELL', { add: { cooldownReduction: 0.03 } }],
      ['Deep Freeze', 'Blizzard slow lasts +1s', 2, 'freezeSpell', { add: { blizzFreeze: 1 } }],
      ['Frostbite', '+10% crit damage', 3, 'u:CRIT_DAMAGE', { add: { critDamage: 0.1 } }],
      ['Absolute Zero', 'Blizzard +2 radius, slow +2s, +15% skill damage', 1, 'u:SKILL_FREEZE_SPELL', { add: { blizzardRadius: 2, blizzFreeze: 2, skillDamage: 0.15 } }],
    ]],
    ['c', [
      ['Time Weave', '', 3, 'weapon', { add: { cooldownReduction: 0.03 } }],
      ['Orb Weaver', 'Storm Orbs +1 orb', 1, 'STORM_ORBS', { add: { orbBonus: 1 } }],
      ['Mana Loop', '', 3, 'gravity', { add: { manaCostCut: 0.05 } }],
      ['Arc Jump', 'Lightning chains +1 target', 1, 'thunder', { add: { thunderChain: 1 } }],
      ['Blink Step', 'Dash +1 charge', 1, 'u:SKILL_DASH', { add: { dashCharges: 1 } }],
      ['Paradox', 'Storm Orbs +1, chains +1 target, +8% cooldown reduction', 1, 'u:SKILL_THUNDER', { add: { orbBonus: 1, thunderChain: 1, cooldownReduction: 0.08 } }],
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
    ['w', [
      ['War Cry', '', 3, 'u:DAMAGE', { mul: { damage: 0.03 } }],
      ['Twin Axes', 'Axe Storm +1 axe', 1, 'orbital', { add: { axeCount: 1 } }],
      ['Bloodbath', '', 3, 'regen', { add: { lifeSteal: 0.01 } }],
      ['Long Leap', 'Bloodrage Leap grants Rage +1s longer', 2, 'BLOODRAGE_LEAP', { add: { rageBonus: 1 } }],
      ['Second Leap', 'Dash +1 charge', 1, 'u:SKILL_DASH', { add: { dashCharges: 1 } }],
      ['Conqueror', 'Axe Storm +1 axe and +1 ricochet, +40% damage below 35% HP', 1, 'u:SKILL_RAGE', { add: { axeCount: 1, axeBounce: 1, berserk: 0.4 } }],
    ]],
  ],
  NECROMANCER: [
    ['g', [
      ['Bone Craft', '+8% minion damage', 3, 'RAISE_DEAD', { add: { minionDmg: 0.08 } }],
      ['Bone Marrow', 'Minions +15% HP', 3, 'RAISE_DEAD', { add: { minionLife: 1.5 } }],
      ['Marrow', '+4% minion damage, +5 max health', 3, 'u:DAMAGE', { add: { minionDmg: 0.04, maxHealth: 5 } }],
      ['Legion', '+1 skeleton per Raise Dead (max 4)', 1, 'RAISE_DEAD', { add: { minionCount: 1 } }],
      ['Frenzied Dead', 'Minions attack 12% faster', 2, 'u:FIRE_RATE', { add: { minionHaste: 0.12 } }],
      ['Gravelord', '+1 skeleton per Raise Dead (max 4), +20% minion damage', 1, 'RAISE_DEAD', { add: { minionCount: 1, minionDmg: 0.2 } }],
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
    ['o', [
      ['Ossified', '', 3, 'RAISE_DEAD', { add: { minionLife: 1.5 } }],
      ['Bone Horde', '+1 skeleton per Raise Dead (max 4)', 1, 'RAISE_DEAD', { add: { minionCount: 1 } }],
      ['Death March', '', 3, 'u:FIRE_RATE', { add: { minionHaste: 0.08 } }],
      ['Grave Hunger', '', 2, 'u:DAMAGE', { add: { minionDmg: 0.1 } }],
      ['Soul Step', 'Dash +1 charge', 1, 'u:SKILL_DASH', { add: { dashCharges: 1 } }],
      ['Bone Throne', '+1 skeleton, minions +20% damage and attack speed', 1, 'RAISE_DEAD', { add: { minionCount: 1, minionDmg: 0.2, minionHaste: 0.2 } }],
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
    ['p', [
      ['Oathkeeper', '', 3, 'u:HEALTH', { add: { maxHealth: 12 } }],
      ['Long Vigil', 'Divine Avatar lasts +2s', 1, 'DIVINE_AVATAR', { add: { avatarBonus: 2 } }],
      ['Penance', '', 3, 'barrier', { add: { thorns: 8 } }],
      ['Mercy', '', 2, 'regen', { add: { lifeSteal: 0.01 } }],
      ['Holy Charge', 'Dash +1 charge', 1, 'u:SKILL_DASH', { add: { dashCharges: 1 } }],
      ['Crusade', 'Divine Avatar +3s, +1 dash charge, take 8% less damage', 1, 'DIVINE_AVATAR', { add: { avatarBonus: 3, dashCharges: 1, dmgReduce: 0.08 } }],
    ]],
  ],
};

/** Points per rank by ring (owner: talent costs range 1..5) and the class level each ring needs. */
export const RING_COST = [1, 1, 2, 3, 5];
export const RING_LEVEL = [1, 4, 10, 20, 30];

export const TALENTS: TalentNode[] = [];
(Object.keys(DEF) as HeroClass[]).forEach((hero) => {
  DEF[hero].forEach(([pfx, rows], b) => {
    const all = [...rows.slice(0, 5), ...EXTRA[hero][b], rows[5]];
    const id = (i: number) => `${hero[0].toLowerCase()}3_${pfx}${i}`;   // ('3': the radial tree; older ranks are refunded)
    all.forEach((r, i) => {
      const L = LAYOUT[i], fx = scaleFx(r[4]);
      const mech = r[1] && !/^[+\-]/.test(r[1]) ? `${r[1].split(/[;,]/)[0]}. ` : '';   // keep a mechanic's wording (e.g. 'Every 6th attack fires twice')
      TALENTS.push({
        id: id(i), hero, branch: b, row: L.row, x: L.x,
        name: r[0], desc: mech && Object.keys({ ...fx.add, ...fx.mul }).every((k) => WHOLE.has(k)) ? r[1] : describeFx(fx), max: r[2], icon: r[3], fx,
        req: L.req.map(id), capstone: i === 9, cost: RING_COST[L.row], lvReq: RING_LEVEL[L.row], special: Object.keys({ ...fx.add, ...fx.mul }).some((k) => WHOLE.has(k) || SPECIAL_KEYS.has(k)),
      });
      // (owner: a mix) the strong talents - special mechanics and the capstone - keep the ring's class level and need
      // their parents MAXED; plain stat talents only need the previous node learned, with a lighter level gate
      // (none in rings 1-2, half the ring level further out).
      const t = TALENTS[TALENTS.length - 1];
      t.reqMax = !!(t.capstone || t.special);
      if (!t.reqMax) t.lvReq = L.row <= 2 ? 1 : Math.round(RING_LEVEL[L.row] / 2);
    });
  });
});
export const TALENT_BY_ID: Record<string, TalentNode> = Object.fromEntries(TALENTS.map((t) => [t.id, t]));
export const talentsOf = (hero: HeroClass): TalentNode[] => TALENTS.filter((t) => t.hero === hero);

export type TalentRanks = Record<string, number>;
export const emptyTalents = (): Record<HeroClass, TalentRanks> => ({ ARCHER: {}, WIZARD: {}, BARBARIAN: {}, KNIGHT: {}, NECROMANCER: {} });

/** 4 points per class level (owner: at max level every talent is full; the fullest 4-branch tree costs 196 <= 50 x 4). */
export const TALENT_POINTS_PER_LEVEL = 4;
export const talentPointsTotal = (rank: number): number => Math.max(0, Math.floor(rank)) * TALENT_POINTS_PER_LEVEL;
export const talentsSpent = (ranks: TalentRanks): number => { let n = 0; for (const k in ranks) n += ranks[k] * (TALENT_BY_ID[k]?.cost ?? 1); return n; };
export const branchSpent = (hero: HeroClass, branch: number, ranks: TalentRanks): number =>
  talentsOf(hero).reduce((n, t) => n + (t.branch === branch ? (ranks[t.id] || 0) * t.cost : 0), 0);
export const respecCost = (ranks: TalentRanks): number => { const s = talentsSpent(ranks); return s > 0 ? (200 + 150 * s) * 10 : 0; };   // x10 economy

export const isMaxed = (id: string, ranks: TalentRanks): boolean => (ranks[id] || 0) >= (TALENT_BY_ID[id]?.max ?? 1);
/** Prerequisite `q` of `node` is satisfied: maxed for a strong talent (reqMax), at least one rank for a plain one. */
export const reqMet = (node: TalentNode, q: string, ranks: TalentRanks): boolean => node.reqMax ? isMaxed(q, ranks) : (ranks[q] || 0) > 0;
/** Nodes this one opens up (the ones listing it as a prerequisite). */
export const childrenOf = (node: TalentNode): TalentNode[] => talentsOf(node.hero).filter((t) => t.req.includes(node.id));

export type AllocBlock = null | 'max' | 'points' | 'prereq' | 'level';
export function allocBlock(node: TalentNode, ranks: TalentRanks, free: number, lv = 99): AllocBlock {
  if ((ranks[node.id] || 0) >= node.max) return 'max';
  if (node.req.some((r) => !reqMet(node, r, ranks))) return 'prereq';
  if (lv < node.lvReq) return 'level';
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
