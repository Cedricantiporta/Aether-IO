// (owner) The horse stable on the green east of the gate (townData STABLE): an open-fronted timber shed with a lean-to roof,
// stall dividers, straw and hay, and a water trough in the paddock. The paddock fence is a FENCES run; the horses are
// ANIMALS 'HORSE' (render/Npcs.tsx), rideable (engine/systems/village.ts mount / dismount).
import React, { useEffect, useMemo } from 'react';
import { STABLE } from '../engine/townData';
import { GB, litMat } from './util';

export function Stable() {
  const geo = useMemo(() => {
    const b = new GB([0.82, 1.06]), { x, z, w, d } = STABLE, z0 = z - d / 2, z1 = z + d / 2, WOOD = '#8a5a34', DARK = '#5e3a22';
    b.box(w, 0.06, d, [x, 0.03, z], '#c9a85a');                                                     // straw floor
    b.box(w + 0.2, 2.5, 0.2, [x, 1.25, z0], WOOD);                                                  // back wall
    for (let y = 0.45; y < 2.5; y += 0.55) b.box(w + 0.24, 0.05, 0.24, [x, y, z0], DARK);              // plank seams
    for (const sx of [-1, 1]) { b.box(0.2, 2.5, d, [x + sx * w / 2, 1.25, z], WOOD); b.box(0.24, 0.05, d, [x + sx * w / 2, 1.2, z], DARK); }
    for (const o of [-w / 2, -w / 6, w / 6, w / 2]) b.box(0.26, 2.75, 0.26, [x + o, 1.37, z1], DARK);   // front posts
    b.box(w + 0.3, 0.22, 0.22, [x, 2.68, z1], DARK);                                                // lintel
    b.box(w + 1.0, 0.16, d + 1.3, [x, 2.95, z + 0.3], '#6a3428', [-0.12, 0, 0]);                   // lean-to roof (falls to the front)
    for (let k = -w / 2; k <= w / 2 + 0.01; k += 1) b.box(0.08, 0.06, d + 1.3, [x + k, 3.04, z + 0.3], '#4e241c', [-0.12, 0, 0]);   // roof battens
    for (const o of [-w / 6, w / 6]) b.box(0.12, 1.3, d - 0.6, [x + o, 0.65, z - 0.2], WOOD);       // stall dividers
    for (const [hx, hz, hy] of [[x - w / 2 + 0.7, z0 + 0.6, 0.3], [x - w / 2 + 0.7, z0 + 1.45, 0.3], [x - w / 2 + 0.7, z0 + 1.0, 0.9], [x + w / 2 - 0.7, z0 + 0.6, 0.3]] as const) {
      b.box(0.9, 0.58, 0.8, [hx, hy, hz], '#dcbc5c'); b.box(0.92, 0.04, 0.82, [hx, hy + 0.1, hz], '#b8963c');   // hay bales (+ twine)
    }
    for (const o of [-w / 3, 0, w / 3]) { b.box(0.8, 0.35, 0.36, [x + o, 0.9, z0 + 0.3], DARK); b.box(0.7, 0.12, 0.28, [x + o, 1.08, z0 + 0.3], '#cfae4e'); }   // mangers
    { const tx = STABLE.paddock.x1 - 0.9, tz = STABLE.paddock.z1 - 1.3;                             // water trough
      b.box(0.8, 0.5, 1.7, [tx, 0.25, tz], WOOD); b.box(0.62, 0.04, 1.5, [tx, 0.48, tz], '#4a86b0'); }
    b.box(1.6, 0.5, 0.08, [x, 2.4, z1 + 0.16], '#e8d8a8'); b.box(1.7, 0.6, 0.06, [x, 2.4, z1 + 0.13], DARK);   // name board
    for (const sx of [-1, 1]) b.cyl(0.05, 0.05, 0.12, 6, [x + sx * 0.35, 2.4, z1 + 0.22], '#6a4a2a', [Math.PI / 2, 0, 0]);   // (horseshoe studs)
    return b.build();
  }, []);
  const mat = useMemo(() => litMat({ roughness: 0.9 }), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  return <mesh geometry={geo} material={mat} castShadow receiveShadow />;
}
