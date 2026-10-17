// (owner) The rockfall on the old miners' road (townData ROCKFALL): big mossy boulders until Erin's quest chain is done,
// then the middle one bursts into rubble and frost dust and is gone, leaving a gap (colliders: engine/systems/village.ts).
import React, { useEffect, useMemo, useRef } from 'react';
import { useGameStore } from '../store';
import { ROCKFALL, ROCKFALL_BREAK, rockfallCleared } from '../engine/townData';
import { GB, litMat, mulberry32 } from './util';
import { makeRockGeo } from './models';
import { FX, CELL } from './fx';

export function Rockfall() {
  const cleared = useGameStore((s) => rockfallCleared(s.npcQuests));
  const was = useRef(cleared);
  const geo = useMemo(() => {   // the boulders that always stay + the one that breaks
    const rocks = [3, 7, 11, 19].map((k) => makeRockGeo(1200 + k, k % 2 ? '#80868e' : '#727980', '#5a8a3a', 0.8)), rr = mulberry32(919), keep = new GB([1, 1]), brk = new GB([1, 1]);
    ROCKFALL.forEach(([x, z, , sc], i) => { const s1 = sc * (0.95 + rr() * 0.2); (i === ROCKFALL_BREAK ? brk : keep).addColored(rocks[i % rocks.length], [x, -0.25 * sc, z], [0, rr() * 6, 0], [s1 * (1 + rr() * 0.25), s1 * (0.9 + rr() * 0.35), s1 * (1 + rr() * 0.25)]); });
    rocks.forEach((g) => g.dispose());
    return { keep: keep.build(), brk: brk.build() };
  }, []);
  const mat = useMemo(() => litMat({ roughness: 0.85 }), []);
  useEffect(() => () => { geo.keep.dispose(); geo.brk.dispose(); mat.dispose(); }, [geo, mat]);
  useEffect(() => {
    if (cleared && !was.current) {   // the moment it breaks: stone chips + frost dust over every boulder
      for (const [x, z, r] of [ROCKFALL[ROCKFALL_BREAK]]) for (let k = 0; k < 40; k++) {
        const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 7, ice = k % 3 === 0;
        FX.add.emit(x + Math.cos(a) * r * 0.5, 1 + Math.random() * 2, z + Math.sin(a) * r * 0.5, Math.cos(a) * s, 4 + Math.random() * 6, Math.sin(a) * s,
          1.2, ice ? 0.35 : 0.5, 0.1, ice ? 1.4 : 0.55, ice ? 1.9 : 0.55, ice ? 2.4 : 0.58, 1, CELL.GLOW, 18, 0.3, 0, 0);
      }
    }
    was.current = cleared;
  }, [cleared]);
  return (<>
    <mesh geometry={geo.keep} material={mat} castShadow receiveShadow />
    {!cleared && <mesh geometry={geo.brk} material={mat} castShadow receiveShadow />}
  </>);
}
