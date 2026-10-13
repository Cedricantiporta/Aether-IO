// Visible-ground-rectangle helpers (the rect itself is written by CameraRig into world.view).
import { world } from '../engine/world';

/** True when the world point (x,z) is inside the visible ground rect, expanded by `m` world units. */
export function inView(x: number, z: number, m = 0): boolean {
  const v = world.view;
  return x >= v.minX - m && x <= v.maxX + m && z >= v.minZ - m && z <= v.maxZ + m;
}
