// The cute flower-on-mound patch (nature_kit_v1 `flower_patch`: olive grass mound + chunky red / orange / pink / blue / white flowers) drawn as ONE
// chunked, culled instanced set. Every flower in the game that is not a harvestable uses this model (run rooms, plaza planters, dream garden ...);
// the town's own patches go through the town batch (render/natureLayout.ts). `places` is built once (no per-frame work).
import React from 'react';
import { KitSet, natureLit, useNatureKit, type Place } from './natureKit';

/** Flower patches at `places` (y = ground height). Suspends until the nature kit is loaded: wrap in <Suspense>. */
export function FlowerPatches({ places, shadows = false }: { places: Place[]; shadows?: boolean }) {
  const kit = useNatureKit();
  if (!places.length) return null;
  return <KitSet piece={kit.S.flower_patch} places={places} lit={natureLit()} receive={shadows} chunk={64} />;
}
