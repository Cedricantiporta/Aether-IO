// (owner) The stable horses (townData ANIMALS 'HORSE') are nature_kit_v1 round horses drawn by render/KitAnimals.tsx (instanced, posed in
// the vertex shader: walk = four-beat leg cycle, gallop (ridden at speed) = bounding gait with body pitch, idle = grazing, tail swish,
// head toss when petted). This component only adds the dash dust: a burst at the start of a horse dash and a trail of puffs while charging.
import { useFrame } from '@react-three/fiber';
import { ANIMALS } from '../engine/townData';
import { animals } from '../engine/systems/npcs';
import { world } from '../engine/world';
import { dustPuff } from './fx';

export function Horses() {
  useFrame(() => {
    const rd = world.village.ride;
    if (!rd.on || rd.horse < 0) return;
    const a = animals[rd.horse]; if (!a || !a.ridden || ANIMALS[rd.horse].kind !== 'HORSE') return;
    if (rd.puff) { rd.puff = false; dustPuff(a.x, a.z, 6, 1.0, 0xcdbd98, 1.6); }
    else if (rd.dashT > 0 && Math.sin(a.hop * 2) > 0.9) dustPuff(a.x - Math.sin(a.yaw) * 0.8, a.z - Math.cos(a.yaw) * 0.8, 1, 0.7, 0xcdbd98, 0.8);
  });
  return null;
}
