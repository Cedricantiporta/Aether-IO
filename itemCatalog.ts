// ============================================================================
// Generated gear catalog: class weapon alternatives, light/medium/heavy/arcane
// armour pieces, class starter gear and item-set pieces. Merged into ITEMS_POOL
// (constants.ts). Each entry also gets an ART spec used by ui/components/ItemArt.
// Pure data; no store / React imports.
// ============================================================================
import type { HeroClass, Item, PlayerStats, Rarity, ProjectileType, AbilityType } from './types';
import { SETS, SET_SLOTS, setPieceId, setPieceName, type SetSlot } from './itemSets';

type St = keyof PlayerStats;
const RAR: Rarity[] = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
/** Id suffix per tier: the five original tiers keep their old ids (saves, recipes); Uncommon pieces get 'u'. */
const IDX = ['0', 'u', '1', '2', '3', '4'];

/** stat key -> [stat, value by rarity] */
const T: Record<string, [St, number[]]> = {
  hp: ['maxHealth', [12, 22, 40, 70, 130]], def: ['defense', [4, 7, 12, 19, 30]], crit: ['critRate', [.02, .03, .05, .07, .1]],
  critd: ['critDamage', [.1, .15, .22, .32, .5]], aspd: ['fireRate', [.1, .16, .24, .36, .55]], move: ['moveSpeed', [.15, .25, .4, .6, .9]],
  dodge: ['dodge', [.02, .03, .05, .07, .1]], dmg: ['damage', [2, 4, 7, 11, 18]], skill: ['skillDamage', [.08, .12, .18, .28, .45]],
  mana: ['maxMana', [20, 35, 60, 100, 160]], mregen: ['manaRegen', [.5, .8, 1.2, 1.8, 2.8]], regen: ['regen', [.4, .7, 1.1, 1.7, 2.6]],
  cdr: ['cooldownReduction', [.02, .03, .05, .07, .1]], kb: ['knockback', [.3, .5, .8, 1.2, 1.8]], dashcd: ['dashCooldown', [-.1, -.2, -.3, -.5, -.8]],
  mag: ['magnetRadius', [1, 1.5, 2.2, 3, 4.5]],
  thorn: ['thorns', [4, 7, 12, 19, 30]], steal: ['lifeSteal', [.006, .01, .015, .022, .032]],
  gold: ['goldFind', [.05, .08, .12, .18, .27]], xp: ['xpBonus', [.04, .06, .09, .13, .2]],
};
/** (owner) wear (helmet / armor / gloves / boots) base stats are defensive only, Defense first; accessories carry the
 *  less common utility stats; weapons the attack stats. */
const DEF_KEYS = new Set(['def', 'hp', 'regen', 'dodge', 'move', 'mana', 'mregen', 'thorn', 'mag']);
const UTIL_KEYS = new Set(['steal', 'cdr', 'move', 'regen', 'mregen', 'dodge', 'mag', 'gold', 'xp']);
const WEAR_TYPES = new Set(['HELMET', 'ARMOR', 'GLOVES', 'BOOTS']);
function statList(type: string, list: string[]): string[] {
  if (WEAR_TYPES.has(type)) { const l = ['def', ...list.filter((k) => DEF_KEYS.has(k) && k !== 'def')]; for (const f of ['hp', 'regen', 'dodge', 'thorn', 'mregen']) if (!l.includes(f)) l.push(f); return l; }
  if (type === 'ACCESSORY') { const l = list.filter((k) => UTIL_KEYS.has(k)); for (const f of ['regen', 'cdr', 'steal', 'move', 'mregen']) if (!l.includes(f)) l.push(f); return l; }
  return list;
}
/** Tier steps (owner): each rarity is a clear jump over the one below - Rare +25%, Epic +40%, Legendary +75%,
 *  Mythic +120% - anchored on the Epic value of every stat. Uncommon (green) sits halfway between Common and Rare. */
export const TIER_STEP = [1.25, 1.4, 1.75, 2.2];
const tierRow = (epic: number): number[] => { const r = epic / TIER_STEP[1], c = r / TIER_STEP[0], l = epic * TIER_STEP[2]; return [c, Math.sqrt(c * r), r, epic, l, l * TIER_STEP[3]].map((v) => parseFloat(v.toPrecision(3))); };
for (const k of Object.keys(T)) T[k][1] = tierRow(T[k][1][2]);
const FL: Record<string, string[]> = {
  light: ['crit', 'aspd', 'dodge', 'move', 'critd'],
  medium: ['hp', 'critd', 'dmg', 'crit', 'regen'],
  heavy: ['def', 'hp', 'regen', 'kb', 'dmg'],
  arcane: ['skill', 'mana', 'mregen', 'cdr', 'crit'],
  swift: ['move', 'dodge', 'dashcd', 'aspd', 'cdr'],
  vital: ['hp', 'regen', 'def', 'mag', 'dodge'],
};
const TAG: Record<string, string> = { light: 'Light and quick.', medium: 'Balanced craftsmanship.', heavy: 'Heavy and protective.', arcane: 'Hums with arcane power.', swift: 'Built for speed.', vital: 'Brims with vitality.' };

/** weapon secondary stat lists per class and flavour */
const WSEC: Record<HeroClass, Record<string, string[]>> = {
  // (owner: weapons carry attack stats only)
  ARCHER: { swift: ['aspd', 'crit', 'critd', 'kb'], deadly: ['crit', 'critd', 'kb', 'aspd'] },
  WIZARD: { arcane: ['skill', 'crit', 'critd', 'aspd'], fury: ['crit', 'critd', 'skill', 'aspd'] },
  BARBARIAN: { bulwark: ['kb', 'critd', 'aspd', 'crit'], rampage: ['aspd', 'critd', 'kb', 'crit'] },
  KNIGHT: { aegis: ['crit', 'kb', 'critd', 'aspd'], valor: ['crit', 'critd', 'aspd', 'kb'] },
  NECROMANCER: { grave: ['skill', 'crit', 'critd', 'aspd'], blight: ['crit', 'critd', 'skill', 'aspd'] },
};
const WDMG_RAW: Record<HeroClass, number[]> = { ARCHER: [8, 15, 30, 50, 100], WIZARD: [15, 25, 60, 120, 200], BARBARIAN: [18, 35, 70, 150, 300], KNIGHT: [17, 33, 66, 140, 280], NECROMANCER: [14, 26, 58, 115, 210] };
const WDMG = Object.fromEntries(Object.entries(WDMG_RAW).map(([h, v]) => [h, tierRow(v[2]).map((x) => Math.round(x))])) as Record<HeroClass, number[]>;   // (6 tiers)
const WMETA: Record<HeroClass, { projectileType: ProjectileType; ability: AbilityType }> = {
  ARCHER: { projectileType: 'ARROW', ability: 'ARROW_RAIN' }, WIZARD: { projectileType: 'MAGIC', ability: 'FIREBALL' }, BARBARIAN: { projectileType: 'AXE', ability: 'AXE_SPIN' }, KNIGHT: { projectileType: 'SWORD', ability: 'AXE_SPIN' }, NECROMANCER: { projectileType: 'SOUL', ability: 'NONE' },
};
const WPRICE = [100, 300, 600, 1500, 3000, 5000];
const GPRICE = [120, 300, 560, 1300, 2200, 4500];

// ------------------------------------------------------------------ art -----
export interface Pal { a: string; b: string; gem: string }
export interface ArtSpec { f: 'bow' | 'staff' | 'axe' | 'sword' | 'helm' | 'armor' | 'gloves' | 'boots' | 'acc'; s: number; pal: Pal }
export const ART: Record<string, ArtSpec> = {};
const PALS: Pal[][] = [
  [{ a: 'leather', b: 'wood', gem: '#f0d8a0' }, { a: 'wood', b: 'leather', gem: '#9ad07a' }, { a: 'steel', b: 'dark', gem: '#e8e8e8' }],
  [{ a: 'green', b: 'leather', gem: '#8af0a0' }, { a: 'wood', b: 'green', gem: '#c8ff8a' }, { a: 'steel', b: 'green', gem: '#7ee08a' }],
  [{ a: 'steel', b: 'blue', gem: '#6ea8ff' }, { a: 'green', b: 'gold', gem: '#8af0a0' }, { a: 'leather', b: 'steel', gem: '#ffcf5a' }],
  [{ a: 'purp', b: 'gold', gem: '#e8a6ff' }, { a: 'blue', b: 'steel', gem: '#7ff0ff' }, { a: 'dark', b: 'purp', gem: '#ff7ad0' }],
  [{ a: 'gold', b: 'red', gem: '#ff6a3c' }, { a: 'fire', b: 'dark', gem: '#fff2a0' }, { a: 'red', b: 'gold', gem: '#ffd24a' }],
  [{ a: 'white', b: 'gold', gem: '#7ff0ff' }, { a: 'void', b: 'purp', gem: '#c58bff' }, { a: 'fire', b: 'gold', gem: '#fff6b0' }],
];
export const SET_PAL: Record<string, Pal> = {
  gale: { a: 'green', b: 'wood', gem: '#c8ff8a' }, regalia: { a: 'blue', b: 'gold', gem: '#9fe6ff' }, bulwark: { a: 'steel', b: 'red', gem: '#ffb347' },
  oath: { a: 'white', b: 'gold', gem: '#ffe08a' }, shadowstep: { a: 'dark', b: 'leather', gem: '#8ad0ff' }, dragonbone: { a: 'white', b: 'red', gem: '#ff7a2e' }, sovereign: { a: 'void', b: 'gold', gem: '#7ff0ff' },
};

// -------------------------------------------------------------- builders ----
const out: Item[] = [];
/** Stat lines per tier (Uncommon has as many as Rare, at lower values). */
const NSTAT = [1, 2, 2, 3, 4, 5];
const pick = (list: string[], ri: number): Partial<PlayerStats> => {
  const s: Partial<PlayerStats> = {};
  for (let i = 0; i < NSTAT[ri] && i < list.length; i++) { const [k, v] = T[list[i]]; s[k] = (s[k] ?? 0) + v[ri]; }
  return s;
};
const r3 = (n: number) => parseFloat(n.toFixed(3));

function gear(id: string, name: string, type: Item['type'], ri: number, flav: string, spec: ArtSpec, extra: Partial<Item> = {}, scale = 1, own?: string[]): void {
  const list = statList(type, own ?? FL[flav]);
  const stats = pick(list, ri);
  if (type === 'ARMOR' && stats.defense) stats.defense *= 2; // armour defense is halved in calculateStats
  if (scale !== 1) for (const k of Object.keys(stats) as St[]) stats[k] = r3(stats[k]! * scale);
  for (const k of Object.keys(stats) as St[]) stats[k] = Math.abs(stats[k]!) >= 10 ? Math.round(stats[k]!) : r3(stats[k]!);
  out.push({ id, name, type, rarity: RAR[ri], price: GPRICE[ri], level: 1, stats, description: TAG[flav], ...extra });
  ART[id] = spec;
}
function weapon(id: string, name: string, hero: HeroClass, ri: number, flav: string, s: number, pal: Pal, extra: Partial<Item> = {}, scale = 1): void {
  const sec = WSEC[hero][flav] ?? Object.values(WSEC[hero])[1];
  const stats: Partial<PlayerStats> = { damage: r3(WDMG[hero][ri] * (flav === 'swift' || flav === 'arcane' || flav === 'bulwark' || flav === 'aegis' ? 0.9 : 0.95) * scale) };
  stats.damage = Math.round(stats.damage!);
  for (let i = 0; i < NSTAT[ri] - 1 && i < sec.length; i++) { const [k, v] = T[sec[i]]; stats[k] = r3((stats[k] ?? 0) + v[ri] * scale); }
  const f = hero === 'ARCHER' ? 'bow' : hero === 'WIZARD' ? 'staff' : hero === 'KNIGHT' ? 'sword' : hero === 'NECROMANCER' ? 'staff' : 'axe';
  out.push({ id, name, type: 'WEAPON', rarity: RAR[ri], price: WPRICE[ri], level: 1, classType: hero, ...WMETA[hero], stats, description: `${flav[0].toUpperCase()}${flav.slice(1)} ${hero.toLowerCase()} weapon.`, ...extra });
  ART[id] = { f, s, pal };
}
const P = (ri: number, v: number): Pal => PALS[ri][v % 3];

// ---- weapons: 2 alternatives per rarity per class ----
const W: Record<HeroClass, [string, string, string][]> = {   // [rarity][name A, flav A, name B] ; flavours fixed per column
  ARCHER: [['Hunter\'s Bow', 'Willow Longbow', ''], ['Greenwood Bow', 'Ranger\'s Shortbow', ''], ['Hornet Recurve', 'Falconer\'s Bow', ''], ['Stormpiercer', 'Frostfang Bow', ''], ['Skyreaver', 'Phoenix Longbow', ''], ['Starfall Arc', 'Eclipse Bow', '']],
  WIZARD: [['Twig Wand', 'Ember Rod', ''], ['Mossy Staff', 'Spark Wand', ''], ['Sage\'s Staff', 'Cinder Wand', ''], ['Tidecaller', 'Stormglass Rod', ''], ['Moonlit Scepter', 'Cataclysm Staff', ''], ['Astral Scepter', 'Oblivion Rod', '']],
  BARBARIAN: [['Woodcutter Axe', 'Bone Cleaver', ''], ['Iron Hatchet', 'Tribal Axe', ''], ['Battle Axe', 'Raider Hatchet', ''], ['Bearded Greataxe', 'Bloodletter', ''], ['Juggernaut Axe', 'Ragnarok Axe', ''], ['Colossus Cleaver', 'Doomcleaver', '']],
  NECROMANCER: [['Bone Wand', 'Grave Rod', ''], ['Mourner\'s Staff', 'Ghoul Wand', ''], ['Ossuary Staff', 'Wraith Wand', ''], ['Soulreaper', 'Plaguebringer', ''], ['Lichbane Scepter', 'Deathknell', ''], ['Crown of Bones', 'Requiem', '']],
  KNIGHT: [['Militia Sword', 'Arming Sword', ''], ['Footman\'s Blade', 'Squire\'s Sabre', ''], ['Knight\'s Longsword', 'Silver Sabre', ''], ['Oathkeeper', 'Dawnblade', ''], ['Lionheart', 'Radiant Claymore', ''], ['Excalibur', 'Seraph\'s Edge', '']],
};
const WFLAV: Record<HeroClass, [string, string]> = { ARCHER: ['swift', 'deadly'], WIZARD: ['arcane', 'fury'], BARBARIAN: ['bulwark', 'rampage'], KNIGHT: ['aegis', 'valor'], NECROMANCER: ['grave', 'blight'] };
for (const hero of ['ARCHER', 'WIZARD', 'BARBARIAN', 'KNIGHT', 'NECROMANCER'] as HeroClass[]) {
  W[hero].forEach((row, ri) => {
    weapon(`w_${hero.toLowerCase()}_${IDX[ri]}a`, row[0], hero, ri, WFLAV[hero][0], 1 + (ri % 3), P(ri, 1));
    weapon(`w_${hero.toLowerCase()}_${IDX[ri]}b`, row[1], hero, ri, WFLAV[hero][1], 2 + (ri % 2), P(ri, 2), { retired: true });   // (owner: one weapon per class per rarity)
  });
}

// ---- armour pieces: [name, flavour, shape] per rarity ----
type Row = [string, string, number];
const HELM: Row[][] = [
  [['Padded Coif', 'light', 1]],
  [['Ranger Hood', 'light', 1], ['Iron Cap', 'heavy', 3]],
  [['Scout Bandana', 'light', 7], ['Acolyte Circlet', 'arcane', 5]],
  [['Bastion Greathelm', 'heavy', 3], ['Sage Cowl', 'arcane', 6]],
  [['Wraithveil Hood', 'light', 1], ['Warden Visage', 'heavy', 3]],
  [['Voidcrown', 'arcane', 5], ['Titan Greathelm', 'heavy', 4]],
];
const ARMOR: Row[][] = [
  [],
  [['Leafweave Tunic', 'light', 0], ['Studded Vest', 'medium', 0]],
  [['Mystic Vestments', 'arcane', 1]],
  [['Shadow Cloak', 'light', 2], ['Runed Robes', 'arcane', 1], ['Warden Brigandine', 'medium', 0]],
  [['Stormweave Jerkin', 'light', 0], ['Archon Raiment', 'arcane', 1]],
  [['Phantom Shroud', 'light', 2], ['Celestial Vestments', 'arcane', 1]],
];
const GLOVE: Row[][] = [
  [['Cloth Wraps', 'light', 0]],
  [['Archer\'s Bracers', 'light', 1], ['Chain Mitts', 'heavy', 2]],
  [['Thief\'s Gloves', 'light', 1], ['Stoneguard Gauntlets', 'heavy', 2]],
  [['Spellweave Gloves', 'arcane', 1], ['Ironfist Gauntlets', 'heavy', 2]],
  [['Gale Grips', 'light', 1], ['Bulwark Gauntlets', 'heavy', 2]],
  [['Starweaver Gloves', 'arcane', 1], ['Worldbreaker Fists', 'heavy', 3]],
];
const BOOT: Row[][] = [
  [['Leather Sandals', 'swift', 0]],
  [['Traveler Boots', 'swift', 1], ['Mossy Treads', 'vital', 0]],
  [['Marsh Walkers', 'vital', 1], ['Iron Greaves', 'heavy', 2]],
  [['Sentinel Sabatons', 'heavy', 2], ['Mystic Slippers', 'arcane', 3]],
  [['Dragonhide Boots', 'vital', 1], ['Stormtread', 'swift', 1]],
  [['Voidwalkers', 'swift', 3], ['Colossus Treads', 'heavy', 2]],
];
const ACC: Row[][] = [
  [['Hunter\'s Charm', 'light', 2], ['Apprentice Pendant', 'arcane', 1]],
  [['Clover Charm', 'vital', 2], ['Copper Ring', 'medium', 0]],
  [['Silver Signet', 'medium', 0], ['Jade Talisman', 'vital', 2]],
  [['Eagle Brooch', 'light', 2]],
  [['Ember Pendant', 'medium', 1], ['Guardian Seal', 'heavy', 0]],
  [['Heart of the Storm', 'arcane', 1], ['Eclipse Locket', 'light', 1]],
];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
function fill(rows: Row[][], type: Item['type'], f: ArtSpec['f'], prefix: string): void {
  rows.forEach((list, ri) => list.forEach(([name, flav, shape], i) => gear(`${prefix}_${slug(name)}`, name, type, ri, flav, { f, s: shape, pal: P(ri, i + shape) }, { retired: true })));   // (owner: replaced by the class catalog below)
}
fill(HELM, 'HELMET', 'helm', 'h'); fill(ARMOR, 'ARMOR', 'armor', 'a'); fill(GLOVE, 'GLOVES', 'gloves', 'g'); fill(BOOT, 'BOOTS', 'boots', 'b'); fill(ACC, 'ACCESSORY', 'acc', 'x');

// ---- (owner) the catalog: per class one helmet / armor / gloves / boots of every rarity (Defense first, class
// flavoured defensive secondaries), plus a ring and an amulet of every rarity (utility stats) for everyone.
const HEROES: HeroClass[] = ['ARCHER', 'WIZARD', 'BARBARIAN', 'KNIGHT', 'NECROMANCER'];
const WEAR_SEC: Record<HeroClass, string[]> = {
  ARCHER: ['dodge', 'move', 'hp', 'regen'], WIZARD: ['mana', 'mregen', 'hp', 'dodge'], BARBARIAN: ['hp', 'regen', 'thorn', 'dodge'],
  KNIGHT: ['hp', 'thorn', 'regen', 'mregen'], NECROMANCER: ['hp', 'mana', 'mregen', 'regen'],
};
const WEAR_NAME: Record<HeroClass, [string, string, string, string]> = {
  ARCHER: ['Ranger Hood', 'Ranger Jerkin', 'Ranger Bracers', 'Ranger Boots'], WIZARD: ['Mage Hat', 'Mage Robe', 'Mage Gloves', 'Mage Slippers'],
  BARBARIAN: ['Raider Helm', 'Raider Harness', 'Raider Wraps', 'Raider Treads'], KNIGHT: ['Guard Helm', 'Guard Plate', 'Guard Gauntlets', 'Guard Sabatons'],
  NECROMANCER: ['Grave Cowl', 'Grave Shroud', 'Grave Grips', 'Grave Boots'],
};
const WEAR_SHAPE: Record<HeroClass, [number, number, number, number]> = { ARCHER: [1, 0, 1, 1], WIZARD: [6, 1, 1, 3], BARBARIAN: [4, 0, 3, 2], KNIGHT: [3, 3, 2, 2], NECROMANCER: [5, 2, 1, 0] };
const ADJ = ['Worn', 'Sturdy', 'Fine', 'Masterwork', 'Heroic', 'Ascendant'];
/** class armour weight: Defense multiplier */
const CLASS_DEF: Record<HeroClass, number> = { ARCHER: 0.85, WIZARD: 0.75, BARBARIAN: 1.3, KNIGHT: 1.35, NECROMANCER: 0.8 };
const SLOT_DEF: Record<string, number> = { HELMET: 0.8, ARMOR: 1, GLOVES: 0.6, BOOTS: 0.6 };
const WEAR: [Item['type'], ArtSpec['f']][] = [['HELMET', 'helm'], ['ARMOR', 'armor'], ['GLOVES', 'gloves'], ['BOOTS', 'boots']];
/** id of a class catalog piece (slot = HELMET / ARMOR / GLOVES / BOOTS, ri = rarity index 0..5) */
export const classWearId = (hero: HeroClass, slot: string, ri: number): string => `c_${hero.toLowerCase()}_${slot.toLowerCase()}_${ri}`;
function classWear(hero: HeroClass, k: number, ri: number, id: string, name: string, extra: Partial<Item> = {}): void {
  const [type, f] = WEAR[k];
  const sec = WEAR_SEC[hero], own = type === 'BOOTS' ? ['def', 'move', ...sec.filter((s) => s !== 'move')] : ['def', ...sec];
  gear(id, name, type, ri, 'heavy', { f, s: WEAR_SHAPE[hero][k], pal: P(ri, HEROES.indexOf(hero)) }, { classType: hero, description: `${ADJ[ri]} ${hero.toLowerCase()} gear.`, ...extra }, 1, own);
  const it = out[out.length - 1];
  if (it.stats.defense) it.stats.defense = Math.max(1, Math.round(it.stats.defense * CLASS_DEF[hero] * SLOT_DEF[type]));
}
for (const hero of HEROES) for (let k = 0; k < WEAR.length; k++) for (let ri = 0; ri < RAR.length; ri++)
  classWear(hero, k, ri, classWearId(hero, WEAR[k][0], ri), `${ADJ[ri]} ${WEAR_NAME[hero][k]}`);
const ACC2: [string, string[], string[]][] = [
  ['ring', ['steal', 'cdr', 'move', 'regen', 'mregen'], ['Copper Band', 'Jade Ring', 'Silver Signet', 'Sapphire Loop', 'Sunfire Ring', 'Ring of Eternity']],
  ['amulet', ['regen', 'dodge', 'mregen', 'cdr', 'steal'], ['Bone Charm', 'Clover Amulet', 'Moonstone Pendant', 'Wardstone Amulet', 'Phoenix Locket', 'Heart of Aether']],
];
for (const [kind, list, names] of ACC2) for (let ri = 0; ri < RAR.length; ri++)
  gear(`acc_${kind}_${ri}`, names[ri], 'ACCESSORY', ri, 'vital', { f: 'acc', s: kind === 'ring' ? 0 : 1, pal: P(ri, kind === 'ring' ? 0 : 1) }, { description: kind === 'ring' ? 'A band of quiet power.' : 'Worn close to the heart.' }, 1, list);

// ---- class starter gear (COMMON, given by the welcome gift / first class switch) ----
export const STARTER_GEAR: Record<HeroClass, Record<Exclude<SetSlot, 'weapon'>, string>> = {
  ARCHER: { helmet: 'start_archer_helmet', armor: 'start_archer_armor', gloves: 'start_archer_gloves', boots: 'start_archer_boots', accessory: 'start_archer_accessory' },
  WIZARD: { helmet: 'start_wizard_helmet', armor: 'start_wizard_armor', gloves: 'start_wizard_gloves', boots: 'start_wizard_boots', accessory: 'start_wizard_accessory' },
  BARBARIAN: { helmet: 'start_barbarian_helmet', armor: 'start_barbarian_armor', gloves: 'start_barbarian_gloves', boots: 'start_barbarian_boots', accessory: 'start_barbarian_accessory' },
  NECROMANCER: { helmet: 'start_necromancer_helmet', armor: 'start_necromancer_armor', gloves: 'start_necromancer_gloves', boots: 'start_necromancer_boots', accessory: 'start_necromancer_accessory' },
  KNIGHT: { helmet: 'start_knight_helmet', armor: 'start_knight_armor', gloves: 'start_knight_gloves', boots: 'start_knight_boots', accessory: 'start_knight_accessory' },
};
{
  const S: Record<HeroClass, [string, string, string, string, string, string, Pal]> = {
    ARCHER: ["Hunter's Cap", "Hunter's Jerkin", "Hunter's Wraps", "Scout Boots", "Hunter's Whistle", 'light', { a: 'wood', b: 'leather', gem: '#9ad07a' }],
    WIZARD: ['Apprentice Hood', 'Apprentice Robe', 'Initiate Gloves', 'Soft Slippers', 'Apprentice Charm', 'arcane', { a: 'blue', b: 'leather', gem: '#9fe6ff' }],
    BARBARIAN: ['Hide Helm', 'Hide Cuirass', 'Wolf Fists', 'Furred Boots', 'Tusk Necklace', 'heavy', { a: 'leather', b: 'dark', gem: '#ff9a6a' }],
    NECROMANCER: ['Grave Hood', 'Shroud of Ash', 'Bone Grips', 'Crypt Boots', 'Skull Charm', 'arcane', { a: 'dark', b: 'leather', gem: '#b08aff' }],
    KNIGHT: ['Squire Helm', 'Squire Mail', 'Squire Gauntlets', 'Squire Sabatons', 'Oath Pendant', 'heavy', { a: 'steel', b: 'blue', gem: '#ffe08a' }],
  };
  (Object.keys(S) as HeroClass[]).forEach((h) => {
    const [hn, an, gn, bn, xn, flav, pal] = S[h];
    const id = STARTER_GEAR[h];
    void flav; void pal;
    // (owner) starter wear = the class Common pieces (Defense first); no helmet at the start (store.starterEquipment)
    classWear(h, 0, 0, id.helmet, hn, { retired: true }); classWear(h, 1, 0, id.armor, an, { retired: true });
    classWear(h, 2, 0, id.gloves, gn, { retired: true }); classWear(h, 3, 0, id.boots, bn, { retired: true });
    gear(id.accessory, xn, 'ACCESSORY', 0, 'vital', { f: 'acc', s: h === 'BARBARIAN' ? 2 : 1, pal: P(0, 0) }, { retired: true }, 1, ACC2[0][1]);
  });
}

// ---- set pieces (3-6 stats by rarity, +12% over the base roll) ----
const SET_SHAPES: Record<SetSlot, number> = { weapon: 3, helmet: 3, armor: 3, gloves: 2, boots: 2, accessory: 1 };
for (const set of SETS) {
  const ri = RAR.indexOf(set.rarity);
  const pal = SET_PAL[set.id];
  for (const slot of SET_SLOTS) {
    const type = slot.toUpperCase() as Item['type'];
    const heroes: (HeroClass | undefined)[] = slot === 'weapon' ? (set.hero ? [set.hero] : ['ARCHER', 'WIZARD', 'BARBARIAN']) : [undefined];
    for (const h of heroes) {
      const id = setPieceId(set, slot, set.hero ? undefined : h);
      const name = setPieceName(set, slot, h ?? set.hero ?? 'ARCHER');
      if (slot === 'weapon' && h) {
        const flav = WSEC[h][set.flavour.weapon] ? set.flavour.weapon : Object.keys(WSEC[h])[1];
        weapon(id, name, h, ri, flav, SET_SHAPES.weapon, pal, { setName: set.name, description: set.blurb }, 1.12);
      } else {
        gear(id, name, type, ri, set.flavour[slot], { f: slot === 'accessory' ? 'acc' : slot === 'armor' ? 'armor' : slot === 'helmet' ? 'helm' : slot as 'gloves' | 'boots', s: SET_SHAPES[slot], pal }, { setName: set.name, description: set.blurb, price: Math.round(GPRICE[ri] * 1.2) }, 1.12);
      }
    }
  }
}

export const GENERATED_ITEMS: Item[] = out;
