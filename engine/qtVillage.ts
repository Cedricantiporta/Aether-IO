// ============================================================================
// Quaternius "Medieval Village" houses + dungeon props (CC0) as pure data: public/models/village_qt.glb, built by art/blender/quaternius_village.mjs,
// drawn by render/qtVillage.tsx. Every piece stands on the ground at the origin with its FRONT (door) on +z, sizes in metres (the scale is baked).
// ============================================================================
/** house pieces: footprint of the body (w x d), height, chimney cap (piece space, for the smoke FX) */
export const QV_HOUSES: Record<string, { w: number; d: number; h: number; chimney: [number, number, number] | null }> = {
  House_1: { w: 4.93, d: 6.12, h: 7.8, chimney: [-0.46, 7.9, -1.7] },
  House_2: { w: 5.11, d: 7.87, h: 7.47, chimney: [-2.07, 7.0, -0.8] },
  Inn: { w: 9.27, d: 9.25, h: 8.02, chimney: null },
};
/** HOUSES[].kit names of the new houses ('vh_' + piece) */
export const QV_KIT_PREFIX = 'vh_';
export const isQvKit = (kit?: string): boolean => !!kit && kit.startsWith(QV_KIT_PREFIX);
export const qvPiece = (kit: string): string => kit.slice(QV_KIT_PREFIX.length);
/** the Statue_Horse on a Pedestal in front of the portal (x, z, yaw of the horse; the statue + base are one stack) */
export const HORSE_STATUES: { x: number; z: number; ry: number; r: number }[] = [{ x: -4.9, z: 7.8, ry: 0.35, r: 1.1 }, { x: 4.9, z: 7.8, ry: -0.35, r: 1.1 }];
export const PEDESTAL_H = 1.84;
