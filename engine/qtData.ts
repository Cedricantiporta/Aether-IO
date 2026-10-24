// ============================================================================
// Quaternius "Stylized Nature MegaKit" pieces (CC0) as pure data: public/models/nature_qt.glb, built by art/blender/quaternius_nature.py,
// loaded + drawn by render/qtNature.tsx. Layout code (render/natureLayout.ts, engine/townFill.ts, render/Props.tsx) names a piece `qt_<node>`
// (QT_PREFIX) so it can live in the same placement tables as the other kits; the node names are the GLB's (CommonTree_1, Bush_Common ...).
// Heights are the GLB's (scale 1) so a placement can size a qt tree to the old piece it replaces without waiting for the file.
// ============================================================================
export const QT_PREFIX = 'qt_';
export const isQt = (piece: string): boolean => piece.startsWith(QT_PREFIX);
export const qtNode = (piece: string): string => piece.slice(QT_PREFIX.length);

/** height (m, scale 1) of every piece in the GLB */
export const QT_H: Record<string, number> = {
  CommonTree_1: 4.17, CommonTree_2: 4.44, CommonTree_3: 5.33, CommonTree_4: 5.34, CommonTree_5: 3.86,
  Pine_1: 4.24, Pine_2: 4.28, Pine_3: 4.27, Pine_4: 5.99, Pine_5: 5.09,
  TwistedTree_1: 6.19, TwistedTree_2: 6.34, TwistedTree_3: 6.49, TwistedTree_4: 6.38, TwistedTree_5: 6.29,
  DeadTree_1: 5.5, DeadTree_2: 6.69, DeadTree_3: 7.77, DeadTree_4: 7.46, DeadTree_5: 9.66,
  Bush_Common: 0.8, Bush_Common_Flowers: 0.8, Fern_1: 0.59, Flower_3_Group: 1.23, Flower_3_Single: 1.23, Flower_4_Group: 1.45, Flower_4_Single: 1.43,
  Grass_Common_Short: 0.79, Grass_Common_Tall: 1.1, Grass_Wispy_Short: 0.59, Grass_Wispy_Tall: 0.98, Clover_1: 0.68, Clover_2: 0.76,
  Mushroom_Common: 0.27, Mushroom_Laetiporus: 0.36, Plant_1: 0.59, Plant_1_Big: 2.22, Plant_7: 0.2, Plant_7_Big: 0.18,
  Pebble_Round_1: 0.05, Pebble_Round_2: 0.05, Pebble_Round_3: 0.06, Pebble_Square_1: 0.08, Pebble_Square_2: 0.08, Pebble_Square_3: 0.09,
  Rock_Medium_1: 1.19, Rock_Medium_2: 1.11, Rock_Medium_3: 1.2,
  RockPath_Round_Small_1: 0.07, RockPath_Round_Small_2: 0.06, RockPath_Round_Small_3: 0.07, RockPath_Round_Thin: 0.07, RockPath_Round_Wide: 0.07,
  RockPath_Square_Small_1: 0.09, RockPath_Square_Small_2: 0.09, RockPath_Square_Small_3: 0.1, RockPath_Square_Thin: 0.1, RockPath_Square_Wide: 0.12,
};
/** half width (m, scale 1) of the rocks (their layout scale is the old rock's radius) */
export const QT_R: Record<string, number> = { Rock_Medium_1: 0.97, Rock_Medium_2: 0.91, Rock_Medium_3: 1.04 };

export const QT_COMMON = [1, 2, 3, 4, 5].map((i) => `CommonTree_${i}`);
export const QT_PINE = [1, 2, 3, 4, 5].map((i) => `Pine_${i}`);
export const QT_TWISTED = [1, 2, 3, 4, 5].map((i) => `TwistedTree_${i}`);
export const QT_DEAD = [1, 2, 3, 4, 5].map((i) => `DeadTree_${i}`);
export const QT_ROCKS = ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'];
export const QT_PEBBLES = ['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3', 'Pebble_Square_1', 'Pebble_Square_2', 'Pebble_Square_3'];
/** flat stepping stones (footprint ~0.6-1.3 m at scale 1) */
export const QT_PATH = ['RockPath_Round_Small_1', 'RockPath_Round_Small_2', 'RockPath_Round_Small_3', 'RockPath_Round_Thin', 'RockPath_Round_Wide', 'RockPath_Square_Small_1', 'RockPath_Square_Small_2', 'RockPath_Square_Small_3', 'RockPath_Square_Thin', 'RockPath_Square_Wide'];
export const QT_FLOWERS = ['Flower_3_Group', 'Flower_4_Group', 'Flower_3_Single', 'Flower_4_Single'];
export const QT_GRASS = ['Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short', 'Grass_Wispy_Tall'];
export const QT_CLOVER = ['Clover_1', 'Clover_2'];

/** far-forest LOD (~700 triangles) of a tree piece name; others have none */
export const qtLod = (node: string): string => (/^(CommonTree|Pine)_\d$/.test(node) ? node + '_lo' : node);

/** Deterministic 0..1 hash (variant picks that must not consume a random stream). */
export const qtHash = (x: number, z: number, k = 0): number => { const v = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };
export const qtPick = <T,>(l: readonly T[], r: number): T => l[Math.min(l.length - 1, Math.floor(r * l.length))];
