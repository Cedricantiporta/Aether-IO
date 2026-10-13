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
      desc: 'Loose a giant wind arrow that pierces a full line and leaves a trail of tornadoes dragging enemies in.',
      per: (lv) => `Damage ${pct(6 * lvMul(lv))} · width x${f1(1 + 0.1 * (lv - 1))} · ${3 + lv} tornadoes` },
    { slot: 'e', icon: 'SHADOW_ROLL', name: 'Shadow Roll', mana: 14, cd: 6,
      desc: 'Roll away with brief invulnerability, leaving an arrow cluster that explodes after 0.6s.',
      per: (lv) => `Blast ${pct(8 * lvMul(lv))} dmg · radius ${f1(7 + 0.5 * (lv - 1))} · i-frames ${f1(0.3 + 0.03 * lv)}s` },
    { slot: 's3', icon: 'FAN_FLAMES', name: 'Fan of Flames', mana: 28, cd: 9,
      desc: 'Fire a cone of burning arrows; every arrow ignites the ground it flies over.',
      per: (lv) => `${8 + lv} arrows · ${pct(2.2 * lvMul(lv))} dmg each · ground fire ${pct(0.9 * lvMul(lv))}/s` },
    { slot: 's4', icon: 'FROST_FIELD', name: 'Frost Field', mana: 26, cd: 11,
      desc: 'Throw 3 frost traps in a spread. Each bursts into ice crystals and a large slowing field.',
      per: (lv) => `Burst ${pct(3 * lvMul(lv))} dmg · field radius ${f1(7.5 + 0.5 * (lv - 1))} · slow ${pct(Math.min(0.8, 0.5 + 0.04 * lv))}` },
  ],
  WIZARD: [
    { slot: 'q', icon: 'SINGULARITY', name: 'Singularity', mana: 34, cd: 12,
      desc: 'A black hole drags in a huge area, then collapses in a massive explosion.',
      per: (lv) => `Collapse ${pct(14 * lvMul(lv))} dmg · radius ${f1(11 + 0.6 * (lv - 1))} · lasts ${f1(3 + 0.1 * lv)}s` },
    { slot: 'e', icon: 'BLINK_NOVA', name: 'Blink Nova', mana: 18, cd: 6,
      desc: 'Teleport to the aim point. A frost nova erupts at both the origin and the destination.',
      per: (lv) => `Nova ${pct(3 * lvMul(lv))} dmg x2 · radius ${f1(8.5 + 0.4 * (lv - 1))} · freeze ${f1(1 + 0.2 * (lv - 1))}s` },
    { slot: 's3', icon: 'STORM_ORBS', name: 'Storm Orbs', mana: 28, cd: 14,
      desc: 'Three lightning orbs orbit you for 6s, zapping nearby enemies with chain lightning.',
      per: (lv) => `${3 + (lv >= 3 ? 1 : 0)} orbs · zap ${pct(2.4 * lvMul(lv))} dmg · chains ${2 + Math.floor(lv / 2)}` },
    { slot: 's4', icon: 'INFERNO_PILLAR', name: 'Inferno Pillar', mana: 32, cd: 11,
      desc: 'A pillar of fire erupts at the target, followed by an expanding ring of flames.',
      per: (lv) => `Pillar ${pct(10 * lvMul(lv))} dmg · ring ${pct(4 * lvMul(lv))} · radius ${f1(6.5 + 0.4 * (lv - 1))}` },
  ],
  BARBARIAN: [
    { slot: 'q', icon: 'BLOODRAGE_LEAP', name: 'Bloodrage Leap', mana: 20, cd: 8,
      desc: 'Leap to the target, slamming a crater that stuns, and enter Rage (double attack speed).',
      per: (lv) => `Slam ${pct(7 * lvMul(lv))} dmg · radius ${f1(9 + 0.5 * (lv - 1))} · Rage ${f1(3 + lv)}s` },
    { slot: 'e', icon: 'WHIRLWIND', name: 'Whirlwind', mana: 24, cd: 12,
      desc: 'Spin for 3s, pulling enemies inward and shredding them. Every hit heals you.',
      per: (lv) => `${pct(1.6 * lvMul(lv))} dmg per tick · radius ${f1(7.5 + 0.3 * (lv - 1))} · heal ${f1(0.5 + 0.1 * (lv - 1))}% per hit` },
    { slot: 's3', icon: 'EARTHSPLITTER', name: 'Earthsplitter', mana: 24, cd: 9,
      desc: 'Cleave a fissure that erupts in a line of stone spikes.',
      per: (lv) => `${pct(5 * lvMul(lv))} dmg per spike · length ${34 + 2 * (lv - 1)} · stun ${f1(0.6 + 0.1 * lv)}s` },
    { slot: 's4', icon: 'BATTLE_CRY', name: 'Battle Cry', mana: 22, cd: 14,
      desc: 'A shout that stuns and terrifies enemies (they flee) and empowers you with +30% damage for 8s.',
      per: (lv) => `Radius ${15 + lv} · stun 1.5s · fear ${f1(3 + 0.3 * lv)}s · ${pct(2 * lvMul(lv))} dmg` },
  ],
};

export const ULTS: Record<HeroClass, AbilityDef> = {
  ARCHER: { slot: 'ult', icon: 'STORM_ARROWS', name: 'Storm of a Thousand Arrows', mana: 0, cd: 0,
    desc: 'Time slows, the sky darkens, and for 6s arrows rain across the whole screen. A final volley ends it.',
    per: (lv) => `${Math.round(70 * (1 + 0.1 * (lv - 1)))} arrows/s · ${pct(2.4 * lvMul(lv))} dmg each · final volley ${pct(25 * lvMul(lv))}` },
  WIZARD: { slot: 'ult', icon: 'METEOR_CATA', name: 'Meteor Cataclysm', mana: 0, cd: 0,
    desc: 'A giant meteor falls (1.2s) and crashes with a screen-wide shockwave, leaving a burning crater while smaller meteors rain for 4s.',
    per: (lv) => `Impact ${pct(60 * lvMul(lv))} dmg (center) · small meteors ${pct(5 * lvMul(lv))}` },
  BARBARIAN: { slot: 'ult', icon: 'TITAN_WRATH', name: "Titan's Wrath", mana: 0, cd: 0,
    desc: 'Grow into a giant (x2.2) for 8s with +50% damage. Every step quakes the ground; the finale slams screen-wide spikes and rocks.',
    per: (lv) => `Quake ${pct(3.5 * lvMul(lv))} per step · final slam ${pct(30 * lvMul(lv))}` },
};

export function abilityDef(hero: HeroClass, slot: ActiveSlot | 'ult'): AbilityDef {
  return slot === 'ult' ? ULTS[hero] : ABILITIES[hero].find((a) => a.slot === slot)!;
}
export function abilityMana(hero: HeroClass, slot: ActiveSlot, lv: number): number {
  return Math.round(abilityDef(hero, slot).mana * (1 + 0.04 * Math.max(0, lv - 1)));
}
export function abilityCd(hero: HeroClass, slot: ActiveSlot, lv: number): number {
  return Math.max(2, abilityDef(hero, slot).cd * (1 - 0.03 * Math.max(0, lv - 1)));
}
/** Ult charge needed (always 100). */
export const ULT_MAX = 100;
