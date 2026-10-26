// Blacksmith > Fuse > Potions: 3 potions of a tier -> 1 of the next (potionFusion.ts, store.fusePotions). Gold cost, always succeeds.
import React from 'react';
import { useGameStore } from '../../../store';
import { ItemSlot } from '../../components/ItemSlot';
import { ITEMS_POOL } from '../../../constants';
import { POTION_FUSE_COUNT, POTION_LADDER } from '../../../potionFusion';

const tpl = (id: string) => ITEMS_POOL.find((i) => i.id === id)!;

export const PotionFuse: React.FC = () => {
  const inventory = useGameStore((s) => s.inventory);
  const gold = useGameStore((s) => s.gold);
  const fusePotions = useGameStore((s) => s.fusePotions);
  return (
    <div className="flex flex-col gap-2" data-testid="potion-fuse">
      <div className="rpg-label">Potions</div>
      <div className="rpg-parchment p-3 text-[.8rem] leading-snug">Fuse {POTION_FUSE_COUNT} potions of one kind into 1 of the next size (Health, Big, Grand; same for Mana). It always works and costs a little gold.</div>
      {Object.entries(POTION_LADDER).map(([id, step]) => {
        const have = inventory.filter((i) => i.type === 'POTION' && i.name === step.fromName).reduce((a, i) => a + (i.quantity || 1), 0);
        const max = Math.min(Math.floor(have / POTION_FUSE_COUNT), Math.floor(gold / step.gold));
        const to = tpl(step.toId);
        return (
          <div key={id} className="flex items-center gap-2" data-testid={`potion-fuse-${id}`}>
            <div style={{ width: 52 }}><ItemSlot item={{ ...tpl(id), quantity: have }} fluid size="100%" iconSize="78%" tooltip="none" /></div>
            <span className="text-[.8rem]">x{POTION_FUSE_COUNT} {'->'}</span>
            <div style={{ width: 52 }}><ItemSlot item={to} fluid size="100%" iconSize="78%" tooltip="none" /></div>
            <div className="flex-1 text-[.72rem] muted">{to.name}<br />{step.gold.toLocaleString()} gold each</div>
            <button className="rpg-btn bevel pe px-3 py-1.5" disabled={max < 1} onClick={() => fusePotions(id, 1)} data-testid={`potion-fuse-1-${id}`}>Fuse x1</button>
            <button className="rpg-btn bevel pe px-3 py-1.5" disabled={max < 2} onClick={() => fusePotions(id, max)} data-testid={`potion-fuse-max-${id}`}>Fuse x{Math.max(max, 1)}</button>
          </div>
        );
      })}
    </div>
  );
};
