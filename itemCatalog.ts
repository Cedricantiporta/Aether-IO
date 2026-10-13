// ============================================================================
// Generated gear catalog: class weapon alternatives, light/medium/heavy/arcane
// armour pieces, class starter gear and item-set pieces. Merged into ITEMS_POOL
// (constants.ts). Each entry also gets an ART spec used by ui/components/ItemArt.
// Pure data; no store / React imports.
// ============================================================================
import type { HeroClass, Item, PlayerStats, Rarity, ProjectileType, AbilityType } from './types';
import { SETS, SET_SLOTS, setPieceId, setPieceName, type SetSlot } from './itemSets';

type St = keyof PlayerStats;
const RAR: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];

/** stat key -> [stat, value by rarity] */
const T: Record<string, [St, number[]]> = {
  hp: ['maxHealth', [12, 22, 40, 70, 130]], def: ['defense', [4, 7, 12, 19, 30]], crit: ['critRate', [.02, .03, .05, .07, .1]],
  critd: ['critDamage', [.1, .15, .22, .32, .5]], aspd: ['fireRate', [.1, .16, .24, .36, .55]], move: ['moveSpeed', [.15, .25, .4, .6, .9]],
  dodge: ['dodge', [.02, .03, .05, .07, .1]], dmg: ['damage', [2, 4, 7, 11, 18]], skill: ['skillDamage', [.08, .12, .18, .28, .45]],
  mana: ['maxMana', [20, 35, 60, 100, 160]], mregen: ['manaRegen', [.5, .8, 1.2, 1.8, 2.8]], regen: ['regen', [.4, .7, 1.1, 1.7, 2.6]],
  cdr: ['cooldownReduction', [.02, .03, .05, .07, .1]], kb: ['knockback', [.3, .5, .8, 1.2, 1.8]], dashcd: ['dashCooldown', [-.1, -.2, -.3, -.5, -.8]],
  mag: ['magnetRadius', [1, 1.5, 2.2, 3, 4.5]],
};
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
  ARCHER: { swift: ['aspd', 'move', 'crit', 'dodge'], deadly: ['crit', 'critd', 'kb', 'aspd'] },
  WIZARD: { arcane: ['skill', 'cdr', 'mregen', 'crit'], fury: ['crit', 'critd', 'skill', 'mana'] },
  BARBARIAN: { bulwark: ['def', 'hp', 'regen', 'kb'], rampage: ['aspd', 'critd', 'kb', 'hp'] },
};
const WDMG: Record<HeroClass, number[]> = { ARCHER: [8, 15, 30, 50, 100], WIZARD: [15, 25, 60, 120, 200], BARBARIAN: [18, 35, 70, 150, 300] };
const WMETA: Record<HeroClass, { projectileType: ProjectileType; ability: AbilityType }> = {
  ARCHER: { projectileType: 'ARROW', ability: 'ARROW_RAIN' }, WIZARD: { projectileType: 'MAGIC', ability: 'FIREBALL' }, BARBARIAN: { projectileType: 'AXE', ability: 'AXE_SPIN' },
};
const WPRICE = [100, 600, 1500, 3000, 5000];
const GPRICE = [120, 560, 1300, 2200, 4500];

// ------------------------------------------------------------------ art -----
export interface Pal { a: string; b: string; gem: string }
export interface ArtSpec { f: 'bow' | 'staff' | 'axe' | 'helm' | 'armor' | 'gloves' | 'boots' | 'acc'; s: number; pal: Pal }
export const ART: Record<string, ArtSpec> = {};
const PALS: Pal[][] = [
  [{ a: 'leather', b: 'wood', gem: '#f0d8a0' }, { a: 'wood', b: 'leather', gem: '#9ad07a' }, { a: 'steel', b: 'dark', gem: '#e8e8e8' }],
  [{ a: 'steel', b: 'blue', gem: '#6ea8ff' }, { a: 'green', b: 'gold', gem: '#8af0a0' }, { a: 'leather', b: 'steel', gem: '#ffcf5a' }],
  [{ a: 'purp', b: 'gold', gem: '#e8a6ff' }, { a: 'blue', b: 'steel', gem: '#7ff0ff' }, { a: 'dark', b: 'purp', gem: '#ff7ad0' }],
  [{ a: 'gold', b: 'red', gem: '#ff6a3c' }, { a: 'fire', b: 'dark', gem: '#fff2a0' }, { a: 'red', b: 'gold', gem: '#ffd24a' }],
  [{ a: 'white', b: 'gold', gem: '#7ff0ff' }, { a: 'void', b: 'purp', gem: '#c58bff' }, { a: 'fire', b: 'gold', gem: '#fff6b0' }],
];
export const SET_PAL: Record<string, Pal> = {
  gale: { a: 'green', b: 'wood', gem: '#c8ff8a' }, regalia: { a: 'blue', b: 'gold', gem: '#9fe6ff' }, bulwark: { a: 'steel', b: 'red', gem: '#ffb347' },
  shadowstep: { a: 'dark', b: 'leather', gem: '#8ad0ff' }, dragonbone: { a: 'white', b: 'red', gem: '#ff7a2e' }, sovereign: { a: 'void', b: 'gold', gem: '#7ff0ff' },
};

// -------------------------------------------------------------- builders ----
const out: Item[] = [];
const pick = (list: string[], n: number): Partial<PlayerStats> => {
  const s: Partial<PlayerStats> = {};
  for (let i = 0; i < n && i < list.length; i++) { const [k, v] = T[list[i]]; s[k] = (s[k] ?? 0) + v[Math.min(4, Math.max(0, n - 1))]; }
  return s;
};
const r3 = (n: number) => parseFloat(n.toFixed(3));

function gear(id: string, name: string, type: Item['type'], ri: number, flav: string, spec: ArtSpec, extra: Partial<Item> = {}, scale = 1): void {
  const list = FL[flav];
  const stats = pick(list, ri + 1);
  if (type === 'ARMOR' && stats.defense) stats.defense *= 2; // armour defense is halved in calculateStats
  if (scale !== 1) for (const k of Object.keys(stats) as St[]) stats[k] = r3(stats[k]! * scale);
  for (const k of Object.keys(stats) as St[]) stats[k] = Math.abs(stats[k]!) >= 10 ? Math.round(stats[k]!) : r3(stats[k]!);
  out.push({ id, name, type, rarity: RAR[ri], price: GPRICE[ri], level: 1, stats, description: TAG[flav], ...extra });
  ART[id] = spec;
}
function weapon(id: string, name: string, hero: HeroClass, ri: number, flav: string, s: number, pal: Pal, extra: Partial<Item> = {}, scale = 1): void {
  const sec = WSEC[hero][flav] ?? Object.values(WSEC[hero])[1];
  const stats: Partial<PlayerStats> = { damage: r3(WDMG[hero][ri] * (flav === 'swift' || flav === 'arcane' || flav === 'bulwark' ? 0.9 : 0.95) * scale) };
  stats.damage = Math.round(stats.damage!);
  for (let i = 0; i < ri && i < sec.length; i++) { const [k, v] = T[sec[i]]; stats[k] = r3((stats[k] ?? 0) + v[ri] * scale); }
  const f = hero === 'ARCHER' ? 'bow' : hero === 'WIZARD' ? 'staff' : 'axe';
  out.push({ id, name, type: 'WEAPON', rarity: RAR[ri], price: WPRICE[ri], level: 1, classType: hero, ...WMETA[hero], stats, description: `${flav[0].toUpperCase()}${flav.slice(1)} ${hero.toLowerCase()} weapon.`, ...extra });
  ART[id] = { f, s, pal };
}
const P = (ri: number, v: number): Pal => PALS[ri][v % 3];

// ---- weapons: 2 alternatives per rarity per class ----
const W: Record<HeroClass, [string, string, string][]> = {   // [rarity][name A, flav A, name B] ; flavours fixed per column
  ARCHER: [['Hunter\'s Bow', 'Willow Longbow', ''], ['Hornet Recurve', 'Falconer\'s Bow', ''], ['Stormpiercer', 'Frostfang Bow', ''], ['Skyreaver', 'Phoenix Longbow', ''], ['Starfall Arc', 'Eclipse Bow', '']],
  WIZARD: [['Twig Wand', 'Ember Rod', ''], ['Sage\'s Staff', 'Cinder Wand', ''], ['Tidecaller', 'Stormglass Rod', ''], ['Moonlit Scepter', 'Cataclysm Staff', ''], ['Astral Scepter', 'Oblivion Rod', '']],
  BARBARIAN: [['Woodcutter Axe', 'Bone Cleaver', ''], ['Battle Axe', 'Raider Hatchet', ''], ['Bearded Greataxe', 'Bloodletter', ''], ['Juggernaut Axe', 'Ragnarok Axe', ''], ['Colossus Cleaver', 'Doomcleaver', '']],
};
const WFLAV: Record<HeroClass, [string, string]> = { ARCHER: ['swift', 'deadly'], WIZARD: ['arcane', 'fury'], BARBARIAN: ['bulwark', 'rampage'] };
for (const hero of ['ARCHER', 'WIZARD', 'BARBARIAN'] as HeroClass[]) {
  W[hero].forEach((row, ri) => {
    weapon(`w_${hero.toLowerCase()}_${ri}a`, row[0], hero, ri, WFLAV[hero][0], 1 + (ri % 3), P(ri, 1));
    weapon(`w_${hero.toLowerCase()}_${ri}b`, row[1], hero, ri, WFLAV[hero][1], 2 + (ri % 2), P(ri, 2));
  });
}

// ---- armour pieces: [name, flavour, shape] per rarity ----
type Row = [string, string, number];
const HELM: Row[][] = [
  [['Padded Coif', 'light', 1]],
  [['Scout Bandana', 'light', 7], ['Acolyte Circlet', 'arcane', 5]],
  [['Bastion Greathelm', 'heavy', 3], ['Sage Cowl', 'arcane', 6]],
  [['Wraithveil Hood', 'light', 1], ['Warden Visage', 'heavy', 3]],
  [['Voidcrown', 'arcane', 5], ['Titan Greathelm', 'heavy', 4]],
];
const ARMOR: Row[][] = [
  [],
  [['Mystic Vestments', 'arcane', 1]],
  [['Shadow Cloak', 'light', 2], ['Runed Robes', 'arcane', 1], ['Warden Brigandine', 'medium', 0]],
  [['Stormweave Jerkin', 'light', 0], ['Archon Raiment', 'arcane', 1]],
  [['Phantom Shroud', 'light', 2], ['Celestial Vestments', 'arcane', 1]],
];
const GLOVE: Row[][] = [
  [['Cloth Wraps', 'light', 0]],
  [['Thief\'s Gloves', 'light', 1], ['Stoneguard Gauntlets', 'heavy', 2]],
  [['Spellweave Gloves', 'arcane', 1], ['Ironfist Gauntlets', 'heavy', 2]],
  [['Gale Grips', 'light', 1], ['Bulwark Gauntlets', 'heavy', 2]],
  [['Starweaver Gloves', 'arcane', 1], ['Worldbreaker Fists', 'heavy', 3]],
];
const BOOT: Row[][] = [
  [['Leather Sandals', 'swift', 0]],
  [['Marsh Walkers', 'vital', 1], ['Iron Greaves', 'heavy', 2]],
  [['Sentinel Sabatons', 'heavy', 2], ['Mystic Slippers', 'arcane', 3]],
  [['Dragonhide Boots', 'vital', 1], ['Stormtread', 'swift', 1]],
  [['Voidwalkers', 'swift', 3], ['Colossus Treads', 'heavy', 2]],
];
const ACC: Row[][] = [
  [['Hunter\'s Charm', 'light', 2], ['Apprentice Pendant', 'arcane', 1]],
  [['Silver Signet', 'medium', 0], ['Jade Talisman', 'vital', 2]],
  [['Eagle Brooch', 'light', 2]],
  [['Ember Pendant', 'medium', 1], ['Guardian Seal', 'heavy', 0]],
  [['Heart of the Storm', 'arcane', 1], ['Eclipse Locket', 'light', 1]],
];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
function fill(rows: Row[][], type: Item['type'], f: ArtSpec['f'], prefix: string): void {
  rows.forEach((list, ri) => list.forEach(([name, flav, shape], i) => gear(`${prefix}_${slug(name)}`, name, type, ri, flav, { f, s: shape, pal: P(ri, i + shape) })));
}
fill(HELM, 'HELMET', 'helm', 'h'); fill(ARMOR, 'ARMOR', 'armor', 'a'); fill(GLOVE, 'GLOVES', 'gloves', 'g'); fill(BOOT, 'BOOTS', 'boots', 'b'); fill(ACC, 'ACCESSORY', 'acc', 'x');

// ---- class starter gear (COMMON, given by the welcome gift / first class switch) ----
export const STARTER_GEAR: Record<HeroClass, Record<Exclude<SetSlot, 'weapon'>, string>> = {
  ARCHER: { helmet: 'start_archer_helmet', armor: 'start_archer_armor', gloves: 'start_archer_gloves', boots: 'start_archer_boots', accessory: 'start_archer_accessory' },
  WIZARD: { helmet: 'start_wizard_helmet', armor: 'start_wizard_armor', gloves: 'start_wizard_gloves', boots: 'start_wizard_boots', accessory: 'start_wizard_accessory' },
  BARBARIAN: { helmet: 'start_barbarian_helmet', armor: 'start_barbarian_armor', gloves: 'start_barbarian_gloves', boots: 'start_barbarian_boots', accessory: 'start_barbarian_accessory' },
};
{
  const S: Record<HeroClass, [string, string, string, string, string, string, Pal]> = {
    ARCHER: ["Hunter's Cap", "Hunter's Jerkin", "Hunter's Wraps", "Scout Boots", "Hunter's Whistle", 'light', { a: 'wood', b: 'leather', gem: '#9ad07a' }],
    WIZARD: ['Apprentice Hood', 'Apprentice Robe', 'Initiate Gloves', 'Soft Slippers', 'Apprentice Charm', 'arcane', { a: 'blue', b: 'leather', gem: '#9fe6ff' }],
    BARBARIAN: ['Hide Helm', 'Hide Cuirass', 'Wolf Fists', 'Furred Boots', 'Tusk Necklace', 'heavy', { a: 'leather', b: 'dark', gem: '#ff9a6a' }],
  };
  (Object.keys(S) as HeroClass[]).forEach((h) => {
    const [hn, an, gn, bn, xn, flav, pal] = S[h];
    const id = STARTER_GEAR[h];
    gear(id.helmet, hn, 'HELMET', 0, flav, { f: 'helm', s: h === 'WIZARD' ? 6 : h === 'BARBARIAN' ? 4 : 0, pal });
    gear(id.armor, an, 'ARMOR', 0, flav, { f: 'armor', s: h === 'WIZARD' ? 1 : h === 'BARBARIAN' ? 0 : 3, pal });
    gear(id.gloves, gn, 'GLOVES', 0, flav, { f: 'gloves', s: h === 'BARBARIAN' ? 3 : h === 'WIZARD' ? 1 : 0, pal });
    gear(id.boots, bn, 'BOOTS', 0, flav === 'light' ? 'swift' : flav, { f: 'boots', s: h === 'WIZARD' ? 3 : h === 'BARBARIAN' ? 2 : 0, pal });
    gear(id.accessory, xn, 'ACCESSORY', 0, flav, { f: 'acc', s: h === 'BARBARIAN' ? 2 : 1, pal });
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
