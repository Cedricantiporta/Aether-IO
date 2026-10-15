// Shared (engine + UI) definition of the active kit: Q, E, 3, 4 and the ultimate (R).
import type { HeroClass } from './types';

export type ActiveSlot = 'q' | 'e' | 's3' | 's4';
export interface AbilityDef {
  slot: ActiveSlot | 'ult';
  icon: string;         // PaintedIcon / SkillIcon id
  name: string;
  mana: number;         // base mana (wizard x1.3 applied by store)
  cd: number;           // base cooldown (s); 0 for the ultimate
  desc: string;
  per: (lv: number) => string; // scaling text for level `lv`
}

/** Damage multiplier of an active at level lv. */
export const lvMul = (lv: number): number => 1 + 0.2 * Math.max(0, lv - 1);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const f1 = (n: number) => Number(n.toFixed(1));

export const ABILITIES: Record<HeroClass, AbilityDef[]> = {
  ARCHER: [
    { slot: 'q', icon: 'GALE_ARROW', name: 'Gale Arrow', mana: 22, cd: 7,
      desc: 'Loose a slow giant wind arrow that pierces a full line, breaking armor and leaving a trail of tornadoes that tug enemies in.',
      per: (lv) => `Damage ${pct(4.8 * lvMul(lv))} · width x${f1(1 + 0.1 * (lv - 1))} · ${3 + lv} tornadoes` },
    { slot: 'e', icon: 'SHADOW_ROLL', name: 'Shadow Roll', mana: 0, cd: 0,
      desc: 'Roll away with brief invulnerability (ends behind the nearest enemy when possible), leaving an arrow cluster that explodes after 0.6s.',
      per: (lv) => `Blast ${pct(2.4 * lvMul(lv))} dmg · radius ${f1(4.2 + 0.3 * (lv - 1))} · i-frames ${f1(0.3 + 0.03 * lv)}s` },
    { slot: 's3', icon: 'LIGHT_ARROW', name: 'Lightpiercer', mana: 24, cd: 8,
      desc: 'Loose a streak of white light: a very fast arrow that pierces every enemy in a long line. Hold the key to keep charging it (up to 1.5s): up to x2.5 damage and twice the size.',
      per: (lv) => `Damage ${pct(5 * lvMul(lv))} (full charge ${pct(12.5 * lvMul(lv))}) · pierces all` },
    { slot: 's4', icon: 'FROST_FIELD', name: 'Frost Field', mana: 26, cd: 11,
      desc: 'Throw 3 frost traps in a spread. Each bursts into ice crystals and a large slowing field with a small chance to freeze enemies solid; the centre is briefly frozen.',
      per: (lv) => `Burst ${pct(3 * lvMul(lv))} dmg · field radius ${f1(7.5 + 0.5 * (lv - 1))} · slow ${pct(Math.min(0.9, (0.5 + 0.04 * lv) * 1.5))}` },
  ],
  WIZARD: [
    { slot: 'q', icon: 'SINGULARITY', name: 'Singularity', mana: 34, cd: 12,
      desc: 'A black hole traps enemies: heavy slow deepening toward the core, a gentle pull and constant damage to everything caught inside. Big monsters resist the pull; bosses and mini-bosses cannot be pulled (only slowed).',
      per: (lv) => `${pct(6.5 * lvMul(lv))} dmg over its life · radius ${f1(11 + 0.6 * (lv - 1))} · lasts ${f1((3 + 0.1 * lv) * 0.7)}s` },
    { slot: 'e', icon: 'BLINK_NOVA', name: 'Blink Nova', mana: 0, cd: 0,
      desc: 'Teleport to the aim point. A small frost nova at both the origin and the destination may freeze nearby enemies.',
      per: (lv) => `Nova ${pct(0.9 * lvMul(lv))} dmg x2 · radius ${f1(5 + 0.25 * (lv - 1))} · 35% freeze ${f1(0.8 + 0.1 * (lv - 1))}s` },
    { slot: 's3', icon: 'STORM_ORBS', name: 'Storm Orbs', mana: 28, cd: 14,
      desc: 'Three lightning orbs orbit you for 4s, zapping nearby enemies with chain lightning that breaks armor.',
      per: (lv) => `${3 + (lv >= 3 ? 1 : 0)} orbs · zap ${pct(1.7 * lvMul(lv))} dmg · chains ${2 + Math.floor(lv / 2)}` },
    { slot: 's4', icon: 'FIREBALLS', name: 'Fireballs', mana: 30, cd: 9,
      desc: 'Hurl three huge, slow fireballs in a fan. They roll through every enemy in their path, scorching each one with a splash, setting them ablaze and leaving a trail of fire.',
      per: (lv) => `3 x ${pct(2.2 * lvMul(lv))} dmg per enemy · splash ${f1(2.4 + 0.12 * (lv - 1))} · piercing · burn 3s` },
  ],
  BARBARIAN: [
    { slot: 'q', icon: 'CROSS_SLASH', name: 'Cross Slash', mana: 18, cd: 5,
      desc: 'Hurl a slow, burning X of crossed axe waves that rolls forward through every enemy in the lane, knocking them back. It grows bigger with each level.',
      per: (lv) => `${pct(4.2 * lvMul(lv))} dmg · slow, pierces all · width ${f1(2 * (2.3 + 0.4 * (lv - 1)))}` },
    { slot: 'e', icon: 'WHIRLWIND', name: 'Whirlwind', mana: 24, cd: 12,
      desc: 'Spin for 1.2s (hold the key to keep spinning, up to 4s), barely tugging nearby enemies and shredding them (breaks armor). Hits heal you slightly (max ~12% HP per cast). Enemies are kept from touching you. After Cross Slash: pulls 30% harder, heals +50%.',
      per: (lv) => `${pct(1.76 * lvMul(lv))} dmg per tick · radius ${f1(7.5 + 0.3 * (lv - 1))} · heal ${f1((0.5 + 0.1 * (lv - 1)) * 0.5)}% per hit` },
    { slot: 's3', icon: 'EARTHSPLITTER', name: 'Earthsplitter', mana: 24, cd: 9,
      desc: 'Cleave a fissure that erupts in a line of stone spikes. Launches enemies far (wall-slam bonus) and breaks armor.',
      per: (lv) => `${pct(5 * lvMul(lv))} dmg per spike · length ${34 + 2 * (lv - 1)} · stun ${f1(0.6 + 0.1 * lv)}s` },
  ],
  NECROMANCER: [
    { slot: 'q', icon: 'RAISE_DEAD', name: 'Raise Dead', mana: 26, cd: 13.5,
      desc: 'Skeletons claw out of the ground around you and hunt the nearest enemies: your army holds up to 5, three skeleton warriors and two that rise as a random archer or mage. Monsters attack them before you and they stay until slain. Every few seconds a warrior Cleaves (a spinning swing that hits everything close). Higher levels: more skeletons per cast (2 / 3 / 3 / 4 / 5), +10% skeleton HP and +4% skeleton damage reduction per level.',
      per: (lv) => `${[2, 3, 3, 4, 5][Math.min(5, Math.max(1, lv)) - 1]} skeletons (max 5: 3 warriors + 2 archers / mages) · ${pct(0.9 * lvMul(lv))} dmg per hit · +${(lv - 1) * 10}% HP · ${Math.min(40, (lv - 1) * 4)}% armour` },
    { slot: 'e', icon: 'SOUL_STEP', name: 'Soul Step', mana: 0, cd: 0,
      desc: 'Dissolve into shadow and reappear at the target point; bone shards burst where you left, slowing enemies.',
      per: (lv) => `Burst ${pct(0.375 * lvMul(lv))} dmg · radius ${f1(5 + 0.3 * (lv - 1))} · slow 2s` },
    { slot: 's3', icon: 'BONE_SPEAR', name: 'Bone Spear', mana: 20, cd: 6,
      desc: 'Hurl a huge spear of bone that impales every enemy in a long line and slows them.',
      per: (lv) => `${pct(2.25 * lvMul(lv))} dmg · pierces all · slow 40%` },
    { slot: 's4', icon: 'CURSE_FIELD', name: 'Plague Ground', mana: 28, cd: 12,
      desc: 'Curse a wide patch of ground: enemies inside rot (damage over time, slowed), and anything that dies there rises as a skeleton for you.',
      per: (lv) => `${pct(0.6 * lvMul(lv))} dmg per tick · radius ${f1(7.5 + 0.4 * (lv - 1))} · ${f1(5 + 0.3 * lv)}s · up to ${2 + Math.floor(lv / 2)} risen` },
  ],
  KNIGHT: [
    { slot: 'q', icon: 'HOLY_WAVE', name: 'Holy Wave', mana: 18, cd: 5,
      desc: 'Swing your sword and release a wide golden crescent of light that sweeps forward through every enemy in its path, knocking them back.',
      per: (lv) => `${pct(4.4 * lvMul(lv))} dmg · pierces all · width ${f1(2 * (3.6 + 0.4 * (lv - 1)))}` },
    { slot: 'e', icon: 'SHIELD_WALL', name: 'Shield Wall', mana: 22, cd: 12,
      desc: 'Raise your shield: a wide burst of light knocks nearby enemies back, then for a few seconds you take far less damage and slowly heal.',
      per: (lv) => `Burst ${pct(2.5 * lvMul(lv))} dmg (radius ${f1(8 + 0.3 * (lv - 1))}) · -${Math.round((0.5 + 0.04 * (lv - 1)) * 100)}% damage taken · ${f1(3 + 0.4 * (lv - 1))}s` },
    { slot: 's3', icon: 'JUDGMENT', name: 'Judgment', mana: 26, cd: 9,
      desc: 'Rays of holy light strike down from above on the enemies around the target, one after another: each ray blasts a wide area for heavy damage and stuns. More rays per level (max 12).',
      per: (lv) => `${Math.min(12, 5 + lv)} rays · ${pct(1.5 * lvMul(lv))} dmg each · radius ${f1(4 + 0.2 * (lv - 1))} · stun ${f1(0.8 + 0.1 * lv)}s` },
  ],
};

/** Active slot bound to keys 1, 2, 3 (per class). Archer/Wizard keep their old E in the dash; the Barbarian keeps Whirlwind on 2. */
export const ACTIVE_ORDER: Record<HeroClass, ActiveSlot[]> = {
  ARCHER: ['q', 's3', 's4'], WIZARD: ['s4', 's3', 'q'], BARBARIAN: ['q', 'e', 's3'], KNIGHT: ['q', 'e', 's3'], NECROMANCER: ['q', 's3', 's4'],
};
export const ACTIVE_KEYS = ['Digit1', 'Digit2', 'Digit3'] as const;
/** Slot whose definition IS the class dash (Space). Barbarian has a dedicated shoulder charge (skill level key `dash`). */
export const DASH_SLOT: Record<HeroClass, ActiveSlot | null> = { ARCHER: 'e', WIZARD: 'e', BARBARIAN: null, KNIGHT: null, NECROMANCER: 'e' };
/** Skill-level key of the class dash. */
export const dashKey = (hero: HeroClass): 'e' | 'dash' => (hero === 'BARBARIAN' || hero === 'KNIGHT' ? 'dash' : 'e');
export const isDashKey = (hero: HeroClass, key: string): boolean => key === dashKey(hero);

export const SHOULDER_CHARGE: AbilityDef = {
  slot: 'e', icon: 'BLOODRAGE_LEAP', name: 'Bloodrage Leap', mana: 0, cd: 0,
  desc: 'Leap to the target (tap: forward) and slam down: stuns nearby enemies and grants a short Rage (faster attacks). Invulnerable while airborne.',
  per: (lv) => `Slam ${pct(1.05 * lvMul(lv))} dmg · radius ${f1(7 + 0.5 * (lv - 1))} · Rage ${f1(1.5 + 0.5 * lv)}s`,
};
export const HOLY_CHARGE: AbilityDef = {
  slot: 'e', icon: 'HOLY_CHARGE', name: 'Holy Charge', mana: 0, cd: 0,
  desc: 'Charge forward behind your shield (invulnerable), striking every enemy you pass and knocking them aside.',
  per: (lv) => `${pct(0.9 * lvMul(lv))} dmg · length ${f1(11 + 0.5 * (lv - 1))}`,
};
/** Ordered active definitions (keys 1, 2, 3). */
export function activeDefs(hero: HeroClass): AbilityDef[] {
  return ACTIVE_ORDER[hero].map((s) => ABILITIES[hero].find((a) => a.slot === s)!);
}
export function dashDef(hero: HeroClass): AbilityDef {
  return hero === 'BARBARIAN' ? SHOULDER_CHARGE : hero === 'KNIGHT' ? HOLY_CHARGE : ABILITIES[hero].find((a) => a.slot === 'e')!;
}

export const ULTS: Record<HeroClass, AbilityDef> = {
  ARCHER: { slot: 'ult', icon: 'STORM_ARROWS', name: 'Storm of a Thousand Arrows', mana: 0, cd: 0,
    desc: 'Aim a large circle (radius 14): time slows and for 2.7s arrows rain inside it. A final volley ends it. Needs a full charge bar and its 90s cooldown finished.',
    per: (lv) => `${Math.round(54 * (1 + 0.1 * (lv - 1)))} arrows/s · ${pct(2.4 * 0.49 * lvMul(lv))} dmg each · final volley ${pct(25 * 0.49 * lvMul(lv))}` },
  WIZARD: { slot: 'ult', icon: 'METEOR_CATA', name: 'Meteor Cataclysm', mana: 0, cd: 0,
    desc: 'A colossal meteor falls onto the target circle (1.2s shadow). The impact stuns and ignites everything, two fire shockwaves roll outward, and a molten crater burns for 2.5s, erupting lava. Needs a full charge bar and its 90s cooldown finished.',
    per: (lv) => `Impact ${pct(50 * 0.7 * lvMul(lv))} dmg (center) · 2 fire rings ${pct(3 * 0.7 * lvMul(lv))} each · lava ${pct(2.2 * 0.7 * lvMul(lv))}` },
  BARBARIAN: { slot: 'ult', icon: 'TITAN_WRATH', name: "Titan's Wrath", mana: 0, cd: 0,
    desc: 'Open with a roar that stuns and terrifies nearby enemies (they cower in place, then stay 30% slowed for 3s), then grow into a giant (x2.2) for 6s with +50% damage. Every step quakes the ground; the finale slams a ring of spikes and rocks around you. Needs a full charge bar and its 90s cooldown finished.',
    per: (lv) => `Quake ${pct(2.3 * lvMul(lv) * 0.7)} per step · final slam ${pct(12 * lvMul(lv) * 0.7)}` },
  NECROMANCER: { slot: 'ult', icon: 'ARMY_DEAD', name: 'Army of the Dead', mana: 0, cd: 0,
    desc: 'A hulking bone golem crashes down like a meteor where you aim, stunning and battering everything in the crater, then fights for you for 20s before it crumbles. Its 90s cooldown starts once the golem is gone; it also needs a full charge bar.',
    per: (lv) => `Impact ${pct(8 * lvMul(lv) * 0.7)} dmg · golem ${pct(3 * lvMul(lv) * 0.8)} per hit · 20s` },
  KNIGHT: { slot: 'ult', icon: 'DIVINE_AVATAR', name: 'Divine Avatar', mana: 0, cd: 0,
    desc: 'A column of light crashes down around you (damage + stun), and you become a radiant avatar for 8s: +50% damage, +50% attack speed, sword swings and Holy Wave turn golden and twice as big, and every swing also releases a Holy Wave. Needs a full charge bar and its 90s cooldown finished.',
    per: (lv) => `Burst ${pct(14 * lvMul(lv) * 0.7)} dmg · wave ${pct(2 * lvMul(lv))} per swing` },
};

export function abilityDef(hero: HeroClass, slot: ActiveSlot | 'ult'): AbilityDef {
  return slot === 'ult' ? ULTS[hero] : ABILITIES[hero].find((a) => a.slot === slot)!;
}
export function abilityMana(hero: HeroClass, slot: ActiveSlot, lv: number): number {
  if (!ABILITIES[hero].some((a) => a.slot === slot)) return 0;
  return Math.round(abilityDef(hero, slot).mana * (1 + 0.04 * Math.max(0, lv - 1)));
}
export function abilityCd(hero: HeroClass, slot: ActiveSlot, lv: number): number {
  return Math.max(2, abilityDef(hero, slot).cd * (1 - 0.03 * Math.max(0, lv - 1)));
}
/** Ult charge needed (always 100). */
export const ULT_MAX = 100;
