// Draw-distance culling (owner: don't draw far-away things). Static scenery chunks (Inst chunks, the town's merged
// chunks) register here with their world-space bounding sphere; every few frames anything farther from the hero than
// the fog's end is hidden, and small detail (grass, flowers, pebbles: tiny geometry) already from a bit past the fog's
// start. The camera's far plane also follows the fog end (biomeLook.LookDriver), so fully-fogged geometry is never drawn.
import type { Object3D } from 'three';
import { world } from '../engine/world';
import { look, FOG_K } from './biomeLook';

interface Item { o: Object3D; x: number; z: number; r: number; small: boolean }
const items: Item[] = [];

/** Registers a static object (its world-space centre x / z and radius); returns the unregister function. */
export function cullRegister(o: Object3D, x: number, z: number, r: number, small: boolean): () => void {
  const it: Item = { o, x, z, r, small };
  items.push(it);
  return () => { const i = items.indexOf(it); if (i >= 0) items.splice(i, 1); if (!o.visible) o.visible = true; };
}

let tick = 0;
/** Called once per frame (render/Scene.tsx CullDriver); does the work every 6th frame. */
export function updateDistCull(): void {
  if (++tick % 6 !== 0 || items.length === 0) return;
  const px = world.player.pos.x, pz = world.player.pos.z;
  const far = look.far * FOG_K + 8, near = Math.min(far, look.near * FOG_K + 40);
  for (let i = 0; i < items.length; i++) {
    const it = items[i], dx = it.x - px, dz = it.z - pz, lim = (it.small ? near : far) + it.r;
    const vis = dx * dx + dz * dz < lim * lim;
    if (it.o.visible !== vis) it.o.visible = vis;
  }
}
export const distCullCount = (): number => items.length;
