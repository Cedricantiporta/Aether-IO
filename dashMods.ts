// Dash Charms: one selectable special ability for the class dash (Skill Trainer, free to swap in town), unlocked by dash level.
// Also the per-class enemy-projectile resistance shown on the Stats tab.
import type { HeroClass } from './types';

export type DashMod = 'MIRROR' | 'GUARD' | 'BLADE' | 'SWIFT';

export interface DashModDef { id: DashMod; name: string; lv: number; hex: number; css: string; desc: string }

export const DASH_MODS: DashModDef[] = [
  { id: 'MIRROR', name: 'Mirror Step', lv: 1, hex: 0xdfe8f5, css: '#cfd9ea', desc: 'Enemy shots you touch while dashing are reflected back at the enemies.' },
  { id: 'GUARD', name: 'Guard Step', lv: 2, hex: 0xffd24a, css: '#ffc93a', desc: 'After a dash you get a golden bubble that soaks 12% of your max HP for 2.5 s.' },
  { id: 'BLADE', name: 'Blade Step', lv: 3, hex: 0xff5a5a, css: '#ff6a6a', desc: 'The dash slashes every enemy you pass through for 80% weapon damage, with a small knockback.' },
  { id: 'SWIFT', name: 'Swift Step', lv: 4, hex: 0x7be38a, css: '#6fdc84', desc: 'Dash cooldown -20%, and +25% move speed for 1.5 s after a dash.' },
];
export const dashModDef = (id: DashMod | null | undefined): DashModDef | null => (id ? DASH_MODS.find((m) => m.id === id) ?? null : null);
export const isDashMod = (x: unknown): x is DashMod => typeof x === 'string' && DASH_MODS.some((m) => m.id === x);

export const MIRROR_DMG_MUL = 1.5;     // a reflected shot hits for its original damage x this
export const GUARD_FRAC = 0.12, GUARD_SEC = 2.5;
export const BLADE_DMG = 0.8, BLADE_KNOCK = 0.6, BLADE_RADIUS = 1.9, BLADE_BASE_BONUS = 1.25;   // base dash damage x1.25 with Blade Step
export const SWIFT_CD_MUL = 0.8, SWIFT_SPEED = 1.25, SWIFT_SEC = 1.5;

/** Share of damage from enemy PROJECTILES (arrows, orbs, bolts, rocks, boss shots) a class shrugs off. */
export const PROJ_RESIST: Record<HeroClass, number> = { ARCHER: 0, WIZARD: 0, BARBARIAN: 0.15, KNIGHT: 0.25, NECROMANCER: 0.1 };
