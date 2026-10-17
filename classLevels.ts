// Permanent per-class levels (replace the old shared Hero Rank + per-run level). Each class keeps its own level, xp,
// unspent skill points and learned skill levels. Gear / crafting / quests / talents read the current class's level.
// Skills unlock by level: skill 1 (+ the basic utilities) from the start, skill 2 at Lv 4, the dash at Lv 6, skill 3 at Lv 8, the ultimate at Lv 10;
// a fresh class starts with 3 skill points. Room upgrade cards are run-only boosts on top of the learned levels.
import type { HeroClass, SkillLevels, PlayerStats } from './types';
import { ACTIVE_ORDER } from './abilityDefs';
import { SKILLS_INFO } from './constants';

export interface ClassProg { lv: number; xp: number; sp: number; skills: SkillLevels }
export const HEROES: HeroClass[] = ['ARCHER', 'WIZARD', 'BARBARIAN', 'KNIGHT', 'NECROMANCER'];
export const START_SP = 3;
/** Skill points per class level (owner: 2, so most of the tree can be trained by Lv 50). */
export const SP_PER_LEVEL = 2;
export const MAX_LEVEL = 50;
/** The class dash unlocks at this class level (below it Space does nothing). */
export const DASH_UNLOCK_LV = 6;   // (owner: was 20, then 8)

/** The ultimate unlocks (auto-learned, bar pre-filled once) at this class level (owner). */
export const ULT_UNLOCK_LV = 10;

/** XP needed to go from `lv` to `lv + 1`. */
export const xpNeed = (lv: number): number => Math.round(250 * Math.pow(Math.max(1, lv), 1.5));

/** Hero level a skill key unlocks at (0 = available from level 1). */
export function unlockLevel(hero: HeroClass, key: string): number {
  const order = ACTIVE_ORDER[hero];
  if (key === order[1]) return 4;    // (owner: skill 2 at Lv 4)
  if (key === order[2]) return 8;    // (owner: skill 3 - e.g. Judgment - at Lv 8)
  if (key === 'ult') return ULT_UNLOCK_LV;
  if (key === 'regen') return 2;
  const passives = Object.entries(SKILLS_INFO).filter(([k, i]) => (i as { type?: string; classType?: string }).type === 'PASSIVE' && (i as { classType?: string }).classType === hero && k !== 'dash').map(([k]) => k);
  const i = passives.indexOf(key);
  if (i >= 0) return 2 + i * 2;   // class passives: Lv 2, 4, 6, 8 ...
  return 0;
}

/** Skill points to learn / raise `key` from level `lvl` (SP_PER_LEVEL per class level, 3 to start). Actives and class passives
 *  2 + lvl, dash / shield 2 + lvl, the ultimate 3 + lvl, Ultimate Charge 3 + lvl, Regeneration is pricey: 4 + 2 x lvl. */
export function skillCost(key: string, lvl: number, dash = false): number {
  if (key === 'regen') return 4 + 2 * lvl;
  if (key === 'ult' || key === 'weapon') return 3 + lvl;
  if (dash || key === 'barrier') return 2 + lvl;
  return 2 + lvl;
}

/** Active skills (and the ultimate) auto-learn (level 1, free) once the class reaches their unlock level. Returns null when nothing changes. */
export function autoLearnActives(hero: HeroClass, lv: number, skills: SkillLevels): SkillLevels | null {
  const s = skills as unknown as Record<string, number>;
  let out: Record<string, number> | null = null;
  for (const k of [...ACTIVE_ORDER[hero], 'ult']) if ((s[k] ?? 0) <= 0 && lv >= unlockLevel(hero, k)) { out = out ?? { ...s }; out[k] = 1; }
  return out as unknown as SkillLevels | null;
}

/** Learned skills of a fresh class: skill 1, the class dash and the basic utilities. Everything else 0. */
export function freshSkills(hero: HeroClass, base: SkillLevels): SkillLevels {
  const s = { ...base } as unknown as Record<string, number>;
  for (const k of Object.keys(s)) if (unlockLevel(hero, k) > 0) s[k] = 0;
  return s as unknown as SkillLevels;
}

export const freshClass = (hero: HeroClass, base: SkillLevels, lv = 1): ClassProg => ({ lv, xp: 0, sp: START_SP + SP_PER_LEVEL * Math.max(0, lv - 1), skills: freshSkills(hero, base) });

/** One level of class growth on the base stats (same numbers the old run level used). */
export function growBase(b: PlayerStats, hero: HeroClass): PlayerStats {
  const base = { ...b, maxHealth: b.maxHealth + 5, maxMana: b.maxMana + 5, damage: b.damage + 1, defense: b.defense + 0.5 };
  // (the archer gains no attack speed per level)
  if (hero === 'WIZARD') { base.skillDamage += 0.03; base.manaRegen *= 1.02; }   // (owner balance: additive, was x1.03 compounding = x4.3 by Lv 50)
  else if (hero === 'BARBARIAN') { base.maxHealth *= 1.03; base.damage *= 1.015; }
  else if (hero === 'NECROMANCER') { base.skillDamage += 0.025; base.maxMana += 3; base.manaRegen *= 1.015; }
  else if (hero === 'KNIGHT') { base.maxHealth *= 1.025; base.defense += 0.5; base.damage *= 1.012; }
  return base;
}

export function sanitizeClassProg(raw: unknown, base: SkillLevels, legacyLevel: number): Record<HeroClass, ClassProg> {
  const out = {} as Record<HeroClass, ClassProg>;
  const r = (raw && typeof raw === 'object' ? raw : null) as Record<string, Partial<ClassProg>> | null;
  for (const h of HEROES) {
    const e = r?.[h];
    if (e && typeof e === 'object') {
      const skills = { ...freshSkills(h, base), ...(e.skills ?? {}) } as SkillLevels;
      const lv = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(e.lv) || 1)));
      let sp = Math.max(0, Math.floor(Number(e.sp) || 0));
      if (lv < ULT_UNLOCK_LV && skills.ult > 0) {   // old saves had the ult from Lv 1: re-lock it, refund the SP spent past Lv 1
        for (let l = 1; l < skills.ult; l++) sp += skillCost('ult', l);
        skills.ult = 0;
      }
      out[h] = { lv, xp: Math.max(0, Number(e.xp) || 0), sp, skills };
    } else out[h] = freshClass(h, base, Math.max(1, Math.min(MAX_LEVEL, Math.floor(legacyLevel || 1))));   // old saves: every class starts at the old shared rank
  }
  return out;
}

/** (owner) every quest pays EXP: a share of what the hero's current level needs (story step 12%, side quest 20%, bounty 10%). */
export const QUEST_XP_SHARE = { STORY: 0.153, SIDE: 0.204, BOUNTY: 0.1275 } as const;   // (owner: +50%, was 0.12 / 0.2 / 0.1; then -15%; NPC side quests another -20%: 0.255 -> 0.204)
/** (owner) every monster kill pays 15% less EXP than its base value. */
export const KILL_XP_MUL = 0.85;
export const questXp = (kind: keyof typeof QUEST_XP_SHARE, lv: number): number => Math.max(10, Math.round(xpNeed(Math.max(1, lv)) * QUEST_XP_SHARE[kind]));
