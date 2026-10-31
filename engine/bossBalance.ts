// Boss balance (owner 2026-10-31). Pure leaf (no store / world import): enemies.ts feeds it the hero numbers at spawn time.
//
//  HP      total boss HP = the pre-x5 value x BOSS_HP_TOTAL (2). The stacked bars (x5 / x10) are COSMETIC: the same total split in N equal layers.
//  ARMOUR  bosses carry `bossLvArmor(heroLevel)` extra armour so a high-level hero does not melt them (concave, monotonic, capped):
//            armor = ARMOR_CAP * ((L - 1) / 49) ^ 1.3   (L 10 ~33, 25 ~118, 40 ~223, 50 = 300), x1.15 in Boss Trials (final-tier)
//          damageEnemy reduces hits by 100 / (100 + armor), so the term cuts a late-game hero damage to ~1/3.
//  DAMAGE  flat boss hits (contact / projectile / strikes: everything built from e.contactDamage / e.projectileDamage) are scaled at spawn so a
//          typical skill hit lands near HIT_TARGET (10%, trial 14%) share of the hero's max HP AFTER defence: k = clamp((target / share) ^ 0.6, 1, 4).
//          Exponent < 1: more defence still means a smaller hit, just never immunity; k >= 1: a hit that is already harder than the target is never softened. Share-of-max-HP hits (`pct`) are untouched, except x TRIAL_PCT_MUL in Boss Trials (combat.damagePlayer).

export const BOSS_HP_TOTAL = 2;
/** Cosmetic stacked-bar counts. */
export const BOSS_LAYERS = 5, BOSS_LAYERS_HARD = 10;
export const ARMOR_CAP = 300, ARMOR_EXP = 1.3, TRIAL_ARMOR_MUL = 1.15;
/** Target hit (share of max HP after mitigation) of an ordinary boss skill; Boss Trials bosses are final-tier. */
export const HIT_TARGET = 0.10, HIT_TARGET_TRIAL = 0.14, HIT_EXP = 0.6, HIT_MIN = 1, HIT_MAX = 4;

/** Extra boss armour for a hero of `level` (1..50). */
export function bossLvArmor(level: number, trial: boolean): number {
  const t = Math.max(0, Math.min(1, (level - 1) / 49));
  return Math.round(ARMOR_CAP * Math.pow(t, ARMOR_EXP) * (trial ? TRIAL_ARMOR_MUL : 1));
}
/** Damage multiplier for a boss whose reference skill hit is `raw` (pre-mitigation, already x DMG_INFLATE-free) against a hero with `maxHp`;
 *  `mit` = the hero's overall mitigation factor on a flat hit (inflate x defence x reduction), see enemies.bossDmgScale. */
export function bossHitScale(raw: number, mit: number, maxHp: number, trial: boolean): number {
  const share = (raw * mit) / Math.max(1, maxHp);
  const k = Math.pow((trial ? HIT_TARGET_TRIAL : HIT_TARGET) / Math.max(1e-6, share), HIT_EXP);
  return Math.max(HIT_MIN, Math.min(HIT_MAX, k));
}
/** Boss Trials: share-of-max-HP boss hits (`pct`, the Herald / phase kits) land this much harder (they bypass defence, so the flat-hit scale above cannot reach them). Mechanic checks (`crit`) are untouched. */
export const TRIAL_PCT_MUL = 1.5;
