// Ascension: after the ending (Malakar defeated) the hero can climb Ascension levels 1..10. Every level stacks one more
// hardship on top of the chosen difficulty and pays more (gold / loot luck / rank xp). Unlocked one level per clear.
export interface AscensionLevel { lv: number; name: string; hardship: string }
export const ASCENSION_MAX = 10;
export const ASCENSIONS: AscensionLevel[] = [
  { lv: 1, name: 'Tempered', hardship: 'Enemies have +20% health' },
  { lv: 2, name: 'Bloodied', hardship: 'Enemies deal +15% damage' },
  { lv: 3, name: 'Swarming', hardship: '+15% more enemies per room' },
  { lv: 4, name: 'Parched', hardship: 'All healing is 25% weaker' },
  { lv: 5, name: 'Tyrants', hardship: 'Bosses have +25% health' },
  { lv: 6, name: 'Relentless', hardship: 'Enemies move 8% faster' },
  { lv: 7, name: 'Ironhide', hardship: 'Enemies have another +20% health' },
  { lv: 8, name: 'Merciless', hardship: 'Enemies deal another +15% damage' },
  { lv: 9, name: 'Champions', hardship: 'Elite rooms bring one more elite' },
  { lv: 10, name: 'Apotheosis', hardship: 'Bosses +25% health, +15% more enemies' },
];
export interface AscMods { hp: number; dmg: number; spawn: number; heal: number; bossHp: number; speed: number; elites: number; reward: number }
/** Cumulative modifiers of Ascension `lv` (0 = none). `reward` multiplies gold / loot luck / rank xp. */
export function ascensionMods(lv: number, out: AscMods): AscMods {
  out.hp = 1; out.dmg = 1; out.spawn = 1; out.heal = 1; out.bossHp = 1; out.speed = 1; out.elites = 0;
  if (lv >= 1) out.hp *= 1.2;
  if (lv >= 2) out.dmg *= 1.15;
  if (lv >= 3) out.spawn *= 1.15;
  if (lv >= 4) out.heal *= 0.75;
  if (lv >= 5) out.bossHp *= 1.25;
  if (lv >= 6) out.speed *= 1.08;
  if (lv >= 7) out.hp *= 1.2;
  if (lv >= 8) out.dmg *= 1.15;
  if (lv >= 9) out.elites += 1;
  if (lv >= 10) { out.bossHp *= 1.25; out.spawn *= 1.15; }
  out.reward = 1 + 0.12 * lv;
  return out;
}
