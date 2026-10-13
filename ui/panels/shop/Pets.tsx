import React from 'react';
import { Coins } from 'lucide-react';
import { PETS_POOL } from '../../../constants';
import { useGameStore } from '../../../store';
import { ItemSlot } from '../../components/ItemSlot';
import { Button } from '../../components/Button';
import { STAT_LABEL, fmtItemStat, RARITY_TEXT } from '../../lib/game';
import type { PlayerStats } from '../../../types';

export const PetsTab: React.FC = () => {
  const gold = useGameStore((s) => s.gold);
  const buyItem = useGameStore((s) => s.buyItem);
  return (
    <div className="flex flex-col gap-2.5">
      {PETS_POOL.map((p) => {
        const can = gold >= p.price;
        return (
          <div key={p.id} className="rpg-frame flex items-center gap-3 p-2.5">
            <ItemSlot item={p} size="4rem" iconSize={30} tooltip="buy" compare={false} />
            <div className="flex-1 min-w-0">
              <div className="font-bold leading-tight" style={{ color: RARITY_TEXT[p.rarity], fontFamily: 'var(--font-title)' }}>{p.name}</div>
              <div className="text-[.72rem] text-[var(--text-dim)] leading-snug">{p.description}</div>
              <div className="flex flex-wrap gap-x-2 gap-y-0 mt-1">
                {(Object.keys(p.stats) as (keyof PlayerStats)[]).map((k) => (
                  <span key={k} className="text-[.65rem] text-[var(--good)] font-semibold">{fmtItemStat(k, p.stats[k]!)} {STAT_LABEL[k]}</span>
                ))}
              </div>
            </div>
            <Button size="sm" variant={can ? 'primary' : 'default'} disabled={!can} onClick={() => buyItem(p)} style={{ flexDirection: 'column', gap: 0 }}>
              <span>Buy</span><span className="flex items-center gap-1 rpg-num"><Coins size={10} />{p.price.toLocaleString()}</span>
            </Button>
          </div>
        );
      })}
    </div>
  );
};
