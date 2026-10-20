// Shared fairy-tale kingdom palette (owner mockups): cream stone, dark timber, royal-blue slate roofs, gold trim.
import { Color } from 'three';
export const ROYAL_ROOF = '#3c56a8', ROYAL_ROOF_DARK = '#2d4488', ROYAL_ROOF_LIGHT = '#4b6bc0', TOWN_GOLD = '#e6b43c', TOWN_CREAM = '#efe4c8', TOWN_BLUE_CLOTH = '#2f4ea8';
/** Kit GLB material overrides by name: the old kit's towers (k_*, recoloured to the blue-roof palette) and the v2 kit's 12 flat materials. window_glow is left alone (emissive). */
export const KIT_RECOLOR: Record<string, string> = {
  k_roof: ROYAL_ROOF, k_roof2: ROYAL_ROOF_DARK, k_roof3: ROYAL_ROOF_LIGHT, k_roof_dark: '#243876',
  k_gold: TOWN_GOLD, k_banner: TOWN_BLUE_CLOTH, k_cloth_blue: TOWN_BLUE_CLOTH,
  k_stone: '#f0e6d0', k_stone2: '#e3d8c0', k_stone3: '#cfc3a8', k_plaster: '#f6eedb', k_stone_wall: '#eadfc6', k_stone_wall2: '#ddd1b8',
  k_wood_dark: '#3a2414', k_wood: '#5a3a22', k_water: '#3d9be0',
  // town_kit_v2 material names (same hues as the Blender palette, nudged warmer / brighter for the golden-morning grade)
  stone: '#f4ead3', stone_dark: '#bcae90', wood: '#9a6a40', timber: '#4d2e1c', roof_blue: ROYAL_ROOF, gold: TOWN_GOLD,
  flower_red: '#e24444', flower_pink: '#f580ae', leaf: '#58a63f', awning_blue: '#5b8de0', iron: '#34363d',
};
const _c = new Color();
/** Linear-space colour for a KIT_RECOLOR entry (matches how material.color is stored). */
export const kitColor = (name: string): Color | null => (KIT_RECOLOR[name] ? _c.set(KIT_RECOLOR[name]) : null);
