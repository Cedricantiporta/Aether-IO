// (owner) The rockfall on the old miners' road (townData ROCKFALL): big mossy boulders until Erin's quest chain is done,
// then the middle one bursts into rubble and frost dust and is gone, leaving a gap (colliders: engine/systems/village.ts).
import React, { useEffect, useMemo, useRef } from 'react';
import { useGameStore } from '../store';
import { ROCKFALL, ROCKFALL_BREAK, rockfallCleared } from '../engine/townData';
import { FX, CELL } from './fx';
import { QtBatch } from './qtNature';
import { rockPut, groundAt, type Sets } from './natureLayout';

export function Rockfall() {
  const cleared = useGameStore((s) => rockfallCleared(s.npcQuests));
  const was = useRef(cleared);
  const sets = useMemo(() => {   // (owner 2026-10-24) real rock formations (Quaternius Rock_Medium), not the old mossy blobs: the ones that always stay + the one that breaks
    const keep: Sets = new Map(), brk: Sets = new Map();
    ROCKFALL.forEach(([x, z, , sc], i) => rockPut(i === ROCKFALL_BREAK ? brk : keep, x, groundAt(x, z), z, sc * 0.95, 1700 + i, 6));
    return { keep, brk };
  }, []);
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
    <QtBatch sets={sets.keep} shadows />
    {!cleared && <QtBatch sets={sets.brk} shadows />}
  </>);
}
