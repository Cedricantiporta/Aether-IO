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
      desc: 'Loose a giant wind arrow that pierces a full line, launching enemies aside and breaking armor, leaving a trail of tornadoes.',
      per: (lv) => `Damage ${pct(6 * lvMul(lv))} · width x${f1(1 + 0.1 * (lv - 1))} · ${3 + lv} tornadoes` },
    { slot: 'e', icon: 'SHADOW_ROLL', name: 'Shadow Roll', mana: 0, cd: 0,
      desc: 'Roll away with brief invulnerability (ends behind the nearest enemy when possible), leaving an arrow cluster that explodes after 0.6s.',
      per: (lv) => `Blast ${pct(8 * lvMul(lv))} dmg · radius ${f1(7 + 0.5 * (lv - 1))} · i-frames ${f1(0.3 + 0.03 * lv)}s` },
    { slot: 's3', icon: 'FAN_FLAMES', name: 'Fan of Flames', mana: 28, cd: 9,
      desc: 'Fire a tight cone of burning arrows. Arrows stack Burn (up to 3) and leave small fire patches where they hit.',
      per: (lv) => `${Math.min(7, 5 + Math.floor((lv - 1) / 2))} arrows · ${pct(1.87 * lvMul(lv))} dmg each · burn stacks` },
    { slot: 's4', icon: 'FROST_FIELD', name: 'Frost Field', mana: 26, cd: 11,
      desc: 'Throw 3 frost traps in a spread. Each bursts into ice crystals and a large slowing field; the centre is briefly frozen.',
      per: (lv) => `Burst ${pct(3 * lvMul(lv))} dmg · field radius ${f1(7.5 + 0.5 * (lv - 1))} · slow ${pct(Math.min(0.8, 0.5 + 0.04 * lv))}` },
  ],
  WIZARD: [
    { slot: 'q', icon: 'SINGULARITY', name: 'Singularity', mana: 34, cd: 12,
      desc: 'A black hole traps enemies: heavy slow deepening toward the core and a gentle pull. Big monsters resist the pull; bosses and mini-bosses cannot be pulled (only slowed). Collapses in an explosion.',
      per: (lv) => `Collapse ${pct(6.5 * lvMul(lv))} dmg · radius ${f1(11 + 0.6 * (lv - 1))} · lasts ${f1((3 + 0.1 * lv) * 0.7)}s` },
    { slot: 'e', icon: 'BLINK_NOVA', name: 'Blink Nova', mana: 0, cd: 0,
      desc: 'Teleport to the aim point. A frost nova briefly freezes enemies at both the origin and the destination.',
      per: (lv) => `Nova ${pct(3 * lvMul(lv))} dmg x2 · radius ${f1(8.5 + 0.4 * (lv - 1))} · freeze ${f1(0.8 + 0.15 * (lv - 1))}s` },
    { slot: 's3', icon: 'STORM_ORBS', name: 'Storm Orbs', mana: 28, cd: 14,
      desc: 'Three lightning orbs orbit you for 4s, zapping nearby enemies with chain lightning that breaks armor.',
      per: (lv) => `${3 + (lv >= 3 ? 1 : 0)} orbs · zap ${pct(1.7 * lvMul(lv))} dmg · chains ${2 + Math.floor(lv / 2)}` },
    { slot: 's4', icon: 'FIREBALLS', name: 'Fireballs', mana: 30, cd: 9,
      desc: 'Hurl three fireballs in a narrow fan. Each explodes on the first enemy it hits, splashing nearby foes, setting them ablaze and leaving a short trail of fire.',
      per: (lv) => `3 x ${pct(2.6 * lvMul(lv))} dmg · burst radius ${f1(3.2 + 0.15 * (lv - 1))} · burn 3s` },
  ],
  BARBARIAN: [
    { slot: 'q', icon: 'CROSS_SLASH', name: 'Cross Slash', mana: 18, cd: 5,
      desc: 'Hurl two crossed axe waves that fly forward as a burning X, cleaving through every enemy in the lane and knocking them back.',
      per: (lv) => `${pct(4.2 * lvMul(lv))} dmg · pierces all · width ${f1(2 * (2.3 + 0.1 * (lv - 1)))}` },
    { slot: 'e', icon: 'WHIRLWIND', name: 'Whirlwind', mana: 24, cd: 12,
      desc: 'Spin for 2s, barely tugging nearby enemies and shredding them (breaks armor). Hits heal you slightly (max ~12% HP per cast). Enemies are kept from touching you. After Cross Slash: pulls 30% harder, heals +50%.',
      per: (lv) => `${pct(1.76 * lvMul(lv))} dmg per tick · radius ${f1(7.5 + 0.3 * (lv - 1))} · heal ${f1((0.5 + 0.1 * (lv - 1)) * 0.5)}% per hit` },
    { slot: 's3', icon: 'EARTHSPLITTER', name: 'Earthsplitter', mana: 24, cd: 9,
      desc: 'Cleave a fissure that erupts in a line of stone spikes. Launches enemies far (wall-slam bonus) and breaks armor.',
      per: (lv) => `${pct(5 * lvMul(lv))} dmg per spike · length ${34 + 2 * (lv - 1)} · stun ${f1(0.6 + 0.1 * lv)}s` },
  ],
};

/** Active slot bound to keys 1, 2, 3 (per class). Archer/Wizard keep their old E in the dash; the Barbarian keeps Whirlwind on 2. */
export const ACTIVE_ORDER: Record<HeroClass, ActiveSlot[]> = {
  ARCHER: ['q', 's3', 's4'], WIZARD: ['q', 's3', 's4'], BARBARIAN: ['q', 'e', 's3'],
};
export const ACTIVE_KEYS = ['Digit1', 'Digit2', 'Digit3'] as const;
/** Slot whose definition IS the class dash (Space). Barbarian has a dedicated shoulder charge (skill level key `dash`). */
export const DASH_SLOT: Record<HeroClass, ActiveSlot | null> = { ARCHER: 'e', WIZARD: 'e', BARBARIAN: null };
/** Skill-level key of the class dash. */
export const dashKey = (hero: HeroClass): 'e' | 'dash' => (hero === 'BARBARIAN' ? 'dash' : 'e');
export const isDashKey = (hero: HeroClass, key: string): boolean => key === dashKey(hero);

export const SHOULDER_CHARGE: AbilityDef = {
  slot: 'e', icon: 'BLOODRAGE_LEAP', name: 'Bloodrage Leap', mana: 0, cd: 0,
  desc: 'Leap to the target (tap: forward) and slam down: stuns nearby enemies and grants a short Rage (faster attacks). Invulnerable while airborne.',
  per: (lv) => `Slam ${pct(3.5 * lvMul(lv))} dmg · radius ${f1(7 + 0.5 * (lv - 1))} · Rage ${f1(1.5 + 0.5 * lv)}s · recharge -${Math.round(8 * Math.max(0, lv - 1))}%`,
};
/** Ordered active definitions (keys 1, 2, 3). */
export function activeDefs(hero: HeroClass): AbilityDef[] {
  return ACTIVE_ORDER[hero].map((s) => ABILITIES[hero].find((a) => a.slot === s)!);
}
export function dashDef(hero: HeroClass): AbilityDef {
  return hero === 'BARBARIAN' ? SHOULDER_CHARGE : ABILITIES[hero].find((a) => a.slot === 'e')!;
}

export const ULTS: Record<HeroClass, AbilityDef> = {
  ARCHER: { slot: 'ult', icon: 'STORM_ARROWS', name: 'Storm of a Thousand Arrows', mana: 0, cd: 0,
    desc: 'Aim a large circle (radius 14): time slows and for 4.5s arrows rain inside it. A final volley ends it. Needs a full charge bar and its 90s cooldown finished.',
    per: (lv) => `${Math.round(54 * (1 + 0.1 * (lv - 1)))} arrows/s · ${pct(2.4 * 0.7 * lvMul(lv))} dmg each · final volley ${pct(25 * 0.7 * lvMul(lv))}` },
  WIZARD: { slot: 'ult', icon: 'METEOR_CATA', name: 'Meteor Cataclysm', mana: 0, cd: 0,
    desc: 'A colossal meteor falls onto the target circle (1.2s shadow). The impact stuns and ignites everything, two fire shockwaves roll outward, and a molten crater burns for 2.5s, erupting lava. Needs a full charge bar and its 90s cooldown finished.',
    per: (lv) => `Impact ${pct(50 * 0.7 * lvMul(lv))} dmg (center) · 2 fire rings ${pct(3 * 0.7 * lvMul(lv))} each · lava ${pct(2.2 * 0.7 * lvMul(lv))}` },
  BARBARIAN: { slot: 'ult', icon: 'TITAN_WRATH', name: "Titan's Wrath", mana: 0, cd: 0,
    desc: 'Open with a roar that stuns and terrifies nearby enemies, then grow into a giant (x2.2) for 6s with +50% damage. Every step quakes the ground; the finale slams a ring of spikes and rocks around you. Needs a full charge bar and its 90s cooldown finished.',
    per: (lv) => `Quake ${pct(2.3 * lvMul(lv) * 0.7)} per step · final slam ${pct(12 * lvMul(lv) * 0.7)}` },
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
