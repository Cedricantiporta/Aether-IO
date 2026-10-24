// ============================================================================
// ONE table: which Quaternius pieces (node names of public/models/nature_qt.glb, see engine/qtData.ts) dress the edge and the islands of a
// HALLS room, per biome (render/HallsBorder.tsx reads it). Swap names here when new pieces are baked into the GLB (cactus, snowy pines,
// snowy rocks, autumn trees ...); a name that is not in the GLB is skipped at draw time.
//   tall      trees / big plants for the far side and the islands (the `_lo` variant is used away from the edge)
//   tallDeep  replaces `tall` in the deepest depth tier of the biome (variant 2)
//   low       bushes for the camera side near the edge (they never hide monsters)
//   rocks     rocks (also low, used on the camera side too); pebbles scatter by the rocks
//   rockP / lowP  chance per border cell to add a rock / a bush instead of a tree
// ============================================================================
import { QT_COMMON, QT_PINE, QT_TWISTED, QT_DEAD, QT_ROCKS, QT_PEBBLES, N2 } from './qtData';

export interface HallsKit { tall: string[]; tallDeep?: string[]; low: string[]; rocks: string[]; pebbles: string[]; rockP: number; lowP: number;
  /** islands in the sea (Coral Isles): dress only the sand rim of each chamber (a few palms + beach rocks); the rest of the ground is water */
  shore?: boolean }

const ROCKS = QT_ROCKS, PEB = QT_PEBBLES;
export const HALLS_BORDER: Record<string, HallsKit> = {
  Greenwood: { tall: [...QT_COMMON, ...QT_COMMON, ...QT_PINE], tallDeep: [...QT_TWISTED, ...QT_PINE, ...QT_DEAD.slice(0, 2)], low: ['Bush_Common', 'Bush_Common', 'Bush_Common_Flowers'], rocks: ROCKS, pebbles: PEB, rockP: 0.06, lowP: 0.18 },
  Frostpeak: { tall: QT_PINE, low: [], rocks: ROCKS, pebbles: PEB, rockP: 0.14, lowP: 0 },
  'Sunscorch Desert': { tall: QT_DEAD, low: [], rocks: ROCKS, pebbles: PEB, rockP: 0.24, lowP: 0 },
  'Ember Wastes': { tall: QT_DEAD, low: [], rocks: ROCKS, pebbles: PEB, rockP: 0.26, lowP: 0 },
  'Coral Isles': { tall: N2.palm, low: [], rocks: ROCKS, pebbles: PEB, rockP: 0.2, lowP: 0, shore: true },   // (owner) palms (pack 2's is the only palm), sand, beach rocks - never twisted trees
  default: { tall: QT_DEAD, low: [], rocks: ROCKS, pebbles: PEB, rockP: 0.16, lowP: 0 },
};
export const hallsKit = (biomeName: string, v: number): HallsKit => {
  const k = HALLS_BORDER[biomeName] ?? HALLS_BORDER.default;
  return v >= 2 && k.tallDeep ? { ...k, tall: k.tallDeep } : k;
};
