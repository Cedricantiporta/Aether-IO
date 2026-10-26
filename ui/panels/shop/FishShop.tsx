import { sellUnit } from '../../../constants';
// Fishmonger (stall on the lakeside beach, shop tab 'FISH'): buys the fish from the bag (sell all, or click a stack for the
// usual sell dialog), sells better fishing rods (engine/systems/fishing.ts RODS) and lists the lake's fish with prices.
import React, { useEffect, useMemo, useState } from 'react';
import { Fish } from '../../components/GoldIcons';
import { useGameStore } from '../../../store';
import { LOOT_BY_ID, FISH_IDS, isFishName } from '../../../loot';
import type { Item } from '../../../types';
import { ItemSlot } from '../../components/ItemSlot';
import { ShopGrid } from '../../components/ShopGrid';
import { Button } from '../../components/Button';
import { useUiStore } from '../../uiStore';
import { RARITY_TEXT } from '../../lib/game';
import { RODS, rodLevel, buyRod, sellAllFish, fishLog, fishCaught, onFishSave, canPayTool, toolCostText } from '../../../engine/systems/fishing';

const fishIcon = (id: string): Item => ({ id, name: LOOT_BY_ID[id].name, type: 'LOOT', rarity: LOOT_BY_ID[id].rarity, level: 1, stats: {}, price: LOOT_BY_ID[id].price, description: LOOT_BY_ID[id].desc } as Item);

export const FishShopTab: React.FC = () => {
  const gold = useGameStore((s) => s.gold), gems = useGameStore((s) => s.gems), crystals = useGameStore((s) => s.crystals ?? 0);
  const inventory = useGameStore((s) => s.inventory);
  const setSell = useUiStore((s) => s.setSellItem);
  const ask = useUiStore((s) => s.askConfirm);
  const [, bump] = useState(0);
  useEffect(() => onFishSave(() => bump((n) => n + 1)), []);
  const stacks = inventory.filter((i) => i.type === 'LOOT' && isFishName(i.name));
  const count = stacks.reduce((n, i) => n + (i.quantity || 1), 0);
  const value = stacks.reduce((n, i) => n + sellUnit(i) * (i.quantity || 1), 0);
  const guide = useMemo(() => FISH_IDS.map(fishIcon), []);
  const lv = rodLevel(), rod = RODS[lv], next = RODS[lv + 1];
  const pct = (x: number) => `${x >= 1 ? '+' : ''}${Math.round((x - 1) * 100)}%`;

  return (
    <div className="flex flex-col gap-4" data-testid="fish-shop">
      <div>
        <div className="rpg-label mb-2">Your catch</div>
        {stacks.length > 0 ? (
          <ShopGrid>
            {stacks.map((it) => <ItemSlot key={it.id} item={it} fluid size="100%" iconSize="78%" price={it.price} tooltip="sell" compare={false} onClick={() => setSell(it)} />)}
          </ShopGrid>
        ) : <div className="muted text-[.78rem]">No fish in your bag yet. Cast a line from the pier or the shore (walk up to the water and press E).</div>}
        <Button className="w-full mt-2" variant="green" disabled={count === 0} onClick={() => sellAllFish()} data-testid="sell-all-fish">
          Sell all fish · {count} · {value.toLocaleString()} G
        </Button>
      </div>
      <div>
        <div className="rpg-label mb-2">Fishing rod</div>
        <div className="brew-card">
          <div className="brew-name"><Fish size={16} /> <span style={{ color: RARITY_TEXT[rod.tier] }}>{rod.name}</span> <span className="muted text-[.65rem]">({rod.tier.charAt(0) + rod.tier.slice(1).toLowerCase()} tier)</span></div>
          <div className="brew-fx">{rod.desc}</div>
          <div className="muted text-[.7rem] mt-1">Bite wait {pct(rod.wait)} · reel zone {pct(rod.zone)} · luck {pct(rod.luck)} · {fishCaught()} fish caught</div>
          {next ? (
            <button className="forge-btn on mt-3" disabled={!canPayTool(next.cost)} data-testid="buy-rod" data-have={`${gold}/${gems}/${crystals}`}
              onClick={() => ask({ title: `Buy the ${next.name}?`, body: `${next.tier.charAt(0) + next.tier.slice(1).toLowerCase()} tier. ${next.desc} (${toolCostText(next.cost)})`, confirmLabel: 'Buy', onConfirm: () => { buyRod(); } })}>
              <Fish size={18} /> {`Upgrade to ${next.name} (${next.tier.charAt(0) + next.tier.slice(1).toLowerCase()}) · ${toolCostText(next.cost)}`}
            </button>
          ) : <div className="rpg-label !text-[.6rem] mt-2 opacity-80">The finest rod on the lake.</div>}
        </div>
      </div>
      <div>
        <div className="rpg-label mb-2">Fish of the lake</div>
        <div className="flex flex-col gap-1">
          {guide.map((f) => (
            <div key={f.id} className="flex items-center gap-2" style={{ fontSize: '.78rem' }}>
              <div style={{ width: '2.2rem', height: '2.2rem' }}><ItemSlot item={f} fluid size="100%" iconSize="80%" tooltip="none" compare={false} qty={1} dim={fishLog(f.id) === 0} /></div>
              <span style={{ color: RARITY_TEXT[f.rarity], flex: 1 }}>{fishLog(f.id) > 0 ? f.name : '???'}</span>
              <span className="muted">{f.rarity.toLowerCase()}</span>
              <span className="rpg-num" style={{ minWidth: '4.5rem', textAlign: 'right' }}>{f.price.toLocaleString()} G</span>
            </div>
          ))}
        </div>
        <div className="rpg-label !text-[.55rem] mt-1.5 opacity-70">The pier end reaches deeper water: rarer fish bite there.</div>
      </div>
    </div>
  );
};
