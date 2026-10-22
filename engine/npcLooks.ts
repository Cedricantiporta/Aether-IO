// Look table of the town's NPCs: which KayKit rig they stand on, their skin / hair / shirt / trousers colours and the soft pieces of the
// npc_wear_v1 kit (art/blender/npc_wear_v1.py -> public/models/characters/npc_wear_v1.glb) they wear. Data only (render/npcBuild.ts builds it).
//
//  base   KayKit rig of the BODY (arms, legs, torso): ARCHER = plain shirt + boots (the default villager), WIZARD = robe-ish, BARBARIAN = bare
//         arms (miners, smiths), KNIGHT = armour (guards only), ROGUE = the hooded hermit.
//  face   KayKit rig the HEAD comes from: ARCHER = round friendly eyes + nose, KNIGHT = soft smile, WIZARD = stern brows (elders, grumps, kids that glare).
//  skin / hair / shirt (sleeves) / pants (legs)  colours; armor = steel colour of a KNIGHT body; acc = the Ranger scarf / Knight tabard accent.
//  wear   pieces of the kit in draw order: [piece, A, B]; A = the piece's main colour, B = its trim colour (white / fixed-colour parts ignore them).
//         Hair pieces take `hair`; beards too. The KayKit hair / helmets / hats / capes are never shown: the kit supplies every bit of head wear.
import type { NpcModel } from './townData';

export type WearItem = [piece: string, a?: string, b?: string];
export interface NpcLook {
  base: NpcModel; face: NpcModel;
  skin: string; hair: string; shirt: string; pants: string;
  armor?: string; acc?: string;
  wear: WearItem[];
}

// ---- palette (bright, soft, toy-like)
const SKIN = { fair: '#ffdcc2', light: '#fbcfa8', tan: '#e9ad80', brown: '#c78a5c', deep: '#9a6340', rosy: '#ffc8b0' };
const HAIR = { black: '#2e2433', dark: '#4a2f20', brown: '#6a4024', chestnut: '#8d4a22', auburn: '#b0482f', ginger: '#dc6a30', blonde: '#e9c35c', pale: '#f3e0a0', grey: '#a2a2a8', white: '#ebe8e2', violet: '#4a3568', ash: '#7c746e' };
const STEEL = '#c3d0e0';

export const NPC_LOOKS: Record<string, NpcLook> = {
  // ------------------------------------------------------------------ the square
  'Mira': { base: 'WIZARD', face: 'KNIGHT', skin: SKIN.fair, hair: '#5d3a2e', shirt: '#8a68d8', pants: '#5a4a8a',
    wear: [['hair_long_straight'], ['face_blush'], ['dress', '#8a68d8', '#ffd36a'], ['hat_witch', '#6a4cc0', '#ffd36a']] },
  'Elder Tobin': { base: 'BARBARIAN', face: 'WIZARD', skin: SKIN.light, hair: HAIR.white, shirt: '#b99a68', pants: '#7a6a50',
    wear: [['hair_bald_fringe'], ['beard_full'], ['robe_long', '#b99a68', '#e6d3a0']] },
  'Pip': { base: 'ARCHER', face: 'KNIGHT', skin: SKIN.rosy, hair: HAIR.ginger, shirt: '#f1e6d2', pants: '#5a7aa8',
    wear: [['hair_spiky_kid'], ['face_blush'], ['vest', '#ff8fb8', '#8a5a34']] },
  'Brenna': { base: 'ARCHER', face: 'KNIGHT', skin: SKIN.fair, hair: HAIR.chestnut, shirt: '#f3e6c8', pants: '#7a5a3a',
    wear: [['hair_braid'], ['face_blush'], ['smock', '#f3e6c8', '#d9b56a'], ['apron', '#6bb868', '#f6ecd2'], ['hat_straw_farmer', '#f3d27a', '#e5483f']] },
  'Garrick': { base: 'KNIGHT', face: 'ARCHER', skin: SKIN.tan, hair: HAIR.ash, shirt: '#4a6bc0', pants: '#4a5a7a', armor: STEEL, acc: '#3d5fc0',
    wear: [['mustache_walrus'], ['tabard', '#3d5fc0', '#f7c548'], ['pauldrons'], ['helm_kettle', '#3d5fc0', '#f7c548']] },
  'Sir Aldo': { base: 'KNIGHT', face: 'KNIGHT', skin: SKIN.light, hair: HAIR.blonde, shirt: '#c0392b', pants: '#4a5a7a', armor: '#d0dbea', acc: '#c0392b',
    wear: [['face_blush'], ['tabard', '#d0463a', '#f7c548'], ['pauldrons'], ['helm_kettle', '#d0463a', '#f7c548']] },
  'Sir Bram': { base: 'KNIGHT', face: 'ARCHER', skin: SKIN.tan, hair: HAIR.dark, shirt: '#c0392b', pants: '#4a5a7a', armor: '#d0dbea', acc: '#c0392b',
    wear: [['hair_short_tousled'], ['beard_goatee'], ['tabard', '#d0463a', '#f7c548'], ['pauldrons']] },
  'Lysa': { base: 'WIZARD', face: 'KNIGHT', skin: SKIN.fair, hair: '#7a4a2a', shirt: '#5aa25c', pants: '#4a7a4a',
    wear: [['hair_long_straight'], ['face_blush'], ['dress', '#5fb26a', '#f6ecd2'], ['hat_bonnet', '#a8dcae', '#ffffff']] },
  'Dorn': { base: 'BARBARIAN', face: 'ARCHER', skin: SKIN.tan, hair: '#3a2a20', shirt: '#8a5a3a', pants: '#6a5038',
    wear: [['hair_short_tousled'], ['beard_full'], ['vest', '#8a5a3a', '#c9a46a'], ['pouch_belt'], ['bandana', '#e5483f', '#fff0d0']] },
  'Sera': { base: 'ARCHER', face: 'KNIGHT', skin: SKIN.light, hair: HAIR.violet, shirt: '#c08ae8', pants: '#6a4a8a',
    wear: [['hair_bob'], ['face_blush'], ['dress', '#c08ae8', '#ffd36a'], ['sash', '#ffd36a']] },
  'Fenn': { base: 'ARCHER', face: 'ARCHER', skin: SKIN.fair, hair: HAIR.blonde, shirt: '#f1e6d2', pants: '#4a6a9a',
    wear: [['hair_short_tousled'], ['beard_goatee'], ['tunic', '#d94f6a', '#f7c548'], ['hat_bard', '#3f9bd0', '#f7c548']] },
  'Wren': { base: 'WIZARD', face: 'ARCHER', skin: SKIN.light, hair: '#33293a', shirt: '#5a74c0', pants: '#3a4a8a',
    wear: [['hair_side_part'], ['glasses_round'], ['robe_long', '#5a74c0', '#f7c548']] },
  'Hodge': { base: 'ARCHER', face: 'WIZARD', skin: SKIN.fair, hair: HAIR.grey, shirt: '#efe4cc', pants: '#6a5a4a',
    wear: [['hair_bald_fringe'], ['mustache_curly'], ['glasses_round'], ['smock', '#efe4cc', '#c9a46a'], ['vest', '#6f5a96', '#8a5a34']] },
  'Maeve': { base: 'WIZARD', face: 'WIZARD', skin: SKIN.light, hair: '#cfc4dd', shirt: '#b085c8', pants: '#6a4a8a',
    wear: [['hair_curly'], ['dress', '#b085c8', '#f6ecd2'], ['cape_short', '#e8a0c8', '#fff0f6'], ['hat_bonnet', '#e8b0d8', '#ffffff']] },
  // ------------------------------------------------------------------ the castle
  'Queen Aelia': { base: 'WIZARD', face: 'KNIGHT', skin: SKIN.fair, hair: '#f0d68a', shirt: '#f4ecd8', pants: '#d8c8a8',
    wear: [['hair_long_straight'], ['face_blush'], ['cape_long', '#3a5fa8', '#f6f1e6'], ['dress', '#f6eedc', '#d8b45a'], ['tiara_queen']] },
  'King Aldric': { base: 'ARCHER', face: 'ARCHER', skin: SKIN.light, hair: '#c9c4bc', shirt: '#a8141e', pants: '#6a1018',
    wear: [['hair_swept_elder'], ['beard_full'], ['cape_long', '#8a1018', '#f6f1e6'], ['robe_long', '#b0182a', '#f7c548'], ['collar_ruff'], ['crown_king', '#b0182a']] },
  'Captain Roan': { base: 'KNIGHT', face: 'ARCHER', skin: SKIN.tan, hair: '#2a2a30', shirt: '#2f4fa8', pants: '#3a4a7a', armor: STEEL, acc: '#2f4fa8',
    wear: [['mustache_curly'], ['cape_short', '#2f4fa8', '#f7c548'], ['tabard', '#2f4fa8', '#f7c548'], ['pauldrons'], ['helm_kettle', '#2f4fa8', '#f7c548']] },
  'Guard Tamsin': { base: 'KNIGHT', face: 'KNIGHT', skin: SKIN.light, hair: HAIR.auburn, shirt: '#2f4fa8', pants: '#3a4a7a', armor: STEEL, acc: '#2f4fa8',
    wear: [['hair_ponytail'], ['face_blush'], ['tabard', '#2f4fa8', '#f7c548'], ['pauldrons']] },
  'Steward Maren': { base: 'WIZARD', face: 'WIZARD', skin: SKIN.light, hair: '#8a7466', shirt: '#4d3f7a', pants: '#3a2f5a',
    wear: [['hair_braid'], ['dress', '#4d3f7a', '#f7c548'], ['collar_ruff']] },
  'Lady Isolde': { base: 'ARCHER', face: 'KNIGHT', skin: SKIN.fair, hair: HAIR.blonde, shirt: '#f27fa8', pants: '#b04a70',
    wear: [['hair_long_straight'], ['face_blush'], ['dress', '#f27fa8', '#fff0f4'], ['collar_ruff'], ['tiara_queen']] },
  // ------------------------------------------------------------------ chapel, graveyard
  'Sister Elowen': { base: 'WIZARD', face: 'KNIGHT', skin: SKIN.fair, hair: HAIR.pale, shirt: '#f4f1ea', pants: '#d8d4c8',
    wear: [['face_blush'], ['robe_long', '#f6f3ec', '#9fd2f2'], ['veil_nun', '#3a4d78', '#f7c548']] },
  'Mortimer': { base: 'BARBARIAN', face: 'WIZARD', skin: SKIN.fair, hair: HAIR.ash, shirt: '#5b5446', pants: '#44403a',
    wear: [['hair_bald_fringe'], ['beard_goatee'], ['smock', '#5b5446', '#8a8070'], ['scarf', '#7a7060'], ['hat_hood', '#4a4a44', '#8a8a7c']] },
  // ------------------------------------------------------------------ villagers
  'Tomas': { base: 'ARCHER', face: 'ARCHER', skin: SKIN.light, hair: HAIR.brown, shirt: '#d8c4a0', pants: '#7a6a50',
    wear: [['hair_short_tousled'], ['tunic', '#d8c4a0', '#8a6a4a']] },
  'Greta': { base: 'ARCHER', face: 'KNIGHT', skin: SKIN.fair, hair: '#b85a2a', shirt: '#e08a6a', pants: '#7a5a3a',
    wear: [['hair_ponytail'], ['face_blush'], ['dress', '#e08a6a', '#fff0d8']] },
  'Bram': { base: 'ARCHER', face: 'ARCHER', skin: SKIN.tan, hair: '#2a1c14', shirt: '#d8c4a0', pants: '#6a5a4a',
    wear: [['hair_side_part'], ['smock', '#d8c4a0', '#c9a77a'], ['vest', '#8a5a34', '#c9a46a']] },
  'Lina': { base: 'WIZARD', face: 'KNIGHT', skin: SKIN.fair, hair: '#e3c470', shirt: '#7fb8d8', pants: '#4a6a8a',
    wear: [['hair_braid'], ['face_blush'], ['dress', '#7fb8d8', '#ffffff']] },
  'Oskar': { base: 'ARCHER', face: 'WIZARD', skin: SKIN.light, hair: HAIR.grey, shirt: '#b89870', pants: '#6a5a4a',
    wear: [['hair_swept_elder'], ['mustache_walrus'], ['tunic', '#b89870', '#7a5a3a'], ['hat_flat_cap', '#6a5a4a', '#4a3a2a']] },
  "Mira's sister Elsa": { base: 'ARCHER', face: 'KNIGHT', skin: SKIN.fair, hair: '#3a2416', shirt: '#a98ae0', pants: '#6a4a8a',
    wear: [['hair_twin_buns'], ['face_blush'], ['dress', '#a98ae0', '#fff0c0']] },
  'Tam': { base: 'ARCHER', face: 'KNIGHT', skin: SKIN.rosy, hair: '#c27a3a', shirt: '#e0cfa8', pants: '#5a6a8a',
    wear: [['hair_short_tousled'], ['face_blush'], ['tunic', '#e0cfa8', '#4aa0d0'], ['hat_beanie', '#4aa0d0', '#ffffff']] },
  'Wenna': { base: 'WIZARD', face: 'ARCHER', skin: SKIN.light, hair: HAIR.brown, shirt: '#d8c7a6', pants: '#6a5a4a',
    wear: [['hair_bob'], ['face_blush'], ['smock', '#d8c7a6', '#b85a4a'], ['apron', '#b85a4a', '#ffffff'], ['hat_toque_chef', '#ffffff', '#e5483f']] },
  'Old Garth': { base: 'ARCHER', face: 'WIZARD', skin: SKIN.light, hair: HAIR.white, shirt: '#a89070', pants: '#6a5a4a',
    wear: [['hair_bald_fringe'], ['beard_full'], ['tunic', '#a89070', '#7a5a3a'], ['hat_flat_cap', '#7a6a50', '#4a3a2a']] },
  'Ned': { base: 'BARBARIAN', face: 'ARCHER', skin: SKIN.tan, hair: '#3a2a1c', shirt: '#9ab0b8', pants: '#4a5a6a',
    wear: [['beard_full'], ['vest', '#9ab0b8', '#e0c070'], ['scarf', '#e5a83a'], ['hat_beanie', '#2f4f6a', '#ffffff']] },
  'Marta Goldtap': { base: 'ARCHER', face: 'KNIGHT', skin: SKIN.fair, hair: '#b0482f', shirt: '#f0e0b8', pants: '#7a5a3a',
    wear: [['hair_curly'], ['face_blush'], ['dress', '#e0a850', '#fff0d0'], ['apron', '#fff6e6', '#b0482f']] },
  'Rodric the Tipsy': { base: 'ARCHER', face: 'ARCHER', skin: SKIN.rosy, hair: '#7a5a3a', shirt: '#efe4cc', pants: '#6a5a4a',
    wear: [['hair_short_tousled'], ['beard_full'], ['face_blush'], ['cape_short', '#a8452f', '#c9a46a'], ['vest', '#7a4a2a', '#c9a46a'], ['pouch_belt']] },
  'Captain Rhea Saltwind': { base: 'ARCHER', face: 'ARCHER', skin: SKIN.tan, hair: '#1f1f2a', shirt: '#2f4a7f', pants: '#2a3a5a',
    wear: [['hair_ponytail'], ['tunic', '#2f4a7f', '#f7c548'], ['sash', '#e5483f'], ['cape_short', '#2f4a7f', '#f7c548'], ['hat_tricorn', '#2a3f6a', '#f7c548']] },
  'Hollis': { base: 'BARBARIAN', face: 'ARCHER', skin: SKIN.tan, hair: '#6a4a2a', shirt: '#a8c0e0', pants: '#6a5a4a',
    wear: [['beard_goatee'], ['smock', '#a8c0e0', '#e8e0c8'], ['pouch_belt'], ['hat_straw_farmer', '#f3d27a', '#3f8a4f']] },
  'Dalla': { base: 'ARCHER', face: 'KNIGHT', skin: SKIN.fair, hair: '#d98a2a', shirt: '#f0e0c0', pants: '#7a5a3a',
    wear: [['hair_braid'], ['face_blush'], ['smock', '#f0e0c0', '#f0b070'], ['apron', '#f0b070', '#fff6e6'], ['bandana', '#e8736a', '#ffffff']] },
  'Old Wend': { base: 'ROGUE', face: 'ROGUE', skin: SKIN.light, hair: HAIR.white, shirt: '#8a7a5a', pants: '#5a4a3a',
    wear: [['beard_wizard_long'], ['robe_long', '#8a7a5a', '#c9b08a']] },
  'Master Varek': { base: 'BARBARIAN', face: 'WIZARD', skin: SKIN.deep, hair: '#2a2420', shirt: '#f1e6d2', pants: '#4a3a2a',
    wear: [['beard_goatee'], ['vest', '#e0822b', '#8a4a1a'], ['sash', '#e5483f'], ['bandana', '#e5483f', '#fff0d0']] },
  'Tilda': { base: 'ARCHER', face: 'KNIGHT', skin: SKIN.tan, hair: '#8a4a2a', shirt: '#f3e6c8', pants: '#7a5a3a',
    wear: [['hair_braid'], ['face_blush'], ['smock', '#f3e6c8', '#e07a3a'], ['cape_short', '#e8883a', '#fff0d0'], ['hat_feather_cap', '#e8883a', '#f7c548']] },
  'Corin': { base: 'BARBARIAN', face: 'ARCHER', skin: SKIN.light, hair: '#6a4a2a', shirt: '#d8c4a0', pants: '#6a5a4a',
    wear: [['hair_curly'], ['mustache_curly'], ['vest', '#6a9a5a', '#c9a46a'], ['pouch_belt'], ['hat_flat_cap', '#7a6a4a', '#4a3a2a']] },
  'Cabbage Man': { base: 'BARBARIAN', face: 'ARCHER', skin: SKIN.light, hair: '#5a4a3a', shirt: '#cfe0a0', pants: '#5a6a3a',
    wear: [['tunic', '#7fc24a', '#cfeea0'], ['hat_beanie', '#6fbf4a', '#cfeea0']] },
  'Erin': { base: 'ARCHER', face: 'WIZARD', skin: SKIN.light, hair: '#3a2616', shirt: '#cfe0a0', pants: '#4f6a3a',
    wear: [['hair_pigtails'], ['tunic', '#4f7a3a', '#ffd36a']] },
  'Hilda': { base: 'BARBARIAN', face: 'ARCHER', skin: SKIN.tan, hair: '#8a4a22', shirt: '#f1e2cf', pants: '#6a4a2a',
    wear: [['hair_ponytail'], ['face_blush'], ['vest', '#7a4a2a', '#c9a46a'], ['pouch_belt'], ['hat_flat_cap', '#9a6a3a', '#5a3a1a']] },
  'Nell': { base: 'ARCHER', face: 'KNIGHT', skin: SKIN.fair, hair: HAIR.brown, shirt: '#e8f0f8', pants: '#4a6a8a',
    wear: [['face_blush'], ['smock', '#e8f0f8', '#8fd0ff'], ['cape_short', '#4f8fc0', '#e8f4ff'], ['hat_hood', '#4f8fc0', '#bfe0ff']] },
  'Grit': { base: 'BARBARIAN', face: 'WIZARD', skin: SKIN.tan, hair: HAIR.ash, shirt: '#6a5a4a', pants: '#4a4036',
    wear: [['beard_full'], ['vest', '#6a5a4a', '#c9a46a'], ['pouch_belt'], ['helm_kettle', '#ffb84a', '#ffb84a']] },
  'Steve': { base: 'BARBARIAN', face: 'ARCHER', skin: SKIN.light, hair: '#4a3020', shirt: '#3fb8d0', pants: '#3a4fa8',
    wear: [['hair_short_tousled'], ['smock', '#3fb8d0', '#2a8aa0']] },
  'Marlo': { base: 'ARCHER', face: 'ARCHER', skin: SKIN.tan, hair: '#c8a060', shirt: '#f3e6c8', pants: '#5a6a8a',
    wear: [['hair_short_tousled'], ['vest', '#4aa0d0', '#e8e0c8'], ['hat_straw_farmer', '#f3d27a', '#4aa0d0']] },
};

/** Fallback for an NPC without an entry: a plain villager in the NPC's tint colour. */
export function defaultLook(model: NpcModel, tint: string): NpcLook {
  return { base: model === 'KNIGHT' ? 'ARCHER' : model, face: 'ARCHER', skin: SKIN.light, hair: HAIR.brown, shirt: tint, pants: '#7a6a50', wear: [['hair_short_tousled'], ['tunic', tint, '#c9a46a']] };
}
