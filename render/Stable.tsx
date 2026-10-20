// (owner) The horse stable on the green east of the gate (townData STABLE): the building is nature_kit_v1 'stable' (an open-fronted shed
// with a blue roof, drawn by render/NatureScenery.tsx); this adds the paddock's water trough and a few hay bales in the paddock. The
// paddock fence is a FENCES run; the horses are ANIMALS 'HORSE' (render/KitAnimals.tsx), rideable (engine/systems/village.ts mount / dismount).
import React, { useEffect, useMemo } from 'react';
import { STABLE } from '../engine/townData';
import { GB, litMat } from './util';

export function Stable() {
  const geo = useMemo(() => {
    const b = new GB([0.82, 1.06]), WOOD = '#9a6a40';
    const { paddock: P } = STABLE, tx = P.x1 - 0.9, tz = P.z1 - 1.4;                                // water trough
    b.box(0.8, 0.5, 1.7, [tx, 0.25, tz], WOOD); b.box(0.62, 0.04, 1.5, [tx, 0.48, tz], '#5b8de0');
    for (const [hx, hz] of [[P.x0 + 1.0, P.z1 - 0.9], [P.x0 + 1.9, P.z1 - 0.9]] as const) { b.box(0.9, 0.58, 0.8, [hx, 0.3, hz], '#e0c05e'); b.box(0.92, 0.04, 0.82, [hx, 0.4, hz], '#b8963c'); }   // hay bales
    return b.build();
  }, []);
  const mat = useMemo(() => litMat({ roughness: 0.9 }), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  return <mesh geometry={geo} material={mat} castShadow receiveShadow />;
}
