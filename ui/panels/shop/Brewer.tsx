// Elixir Brewer (hut outside the town gate): brew elixirs from monster parts + gold. Recipe grid on top (the shop's priced
// slot grid), the selected recipe's parts / gold / quantity / Brew button below, then the elixir buffs waiting for the next
// run (or active in this run). Elixirs land in the bag; clicking one there drinks it (store.drinkElixir).
import React, { useMemo, useState } from 'react';
import { FlaskConical } from '../../components/GoldIcons';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore, brewGemCost, questFree } from '../../../store';
import { ELIXIRS, ELIXIR_IDS, elixirItem, type ElixirId } from '../../../elixirs';
import { lootOwned } from '../../../crafting';
import { LOOT_BY_ID } from '../../../loot';
import { GameStatus, type Item } from '../../../types';
import { ItemSlot } from '../../components/ItemSlot';
import { ShopGrid } from '../../components/ShopGrid';
import { ItemArt } from '../../components/ItemArt';
import { CoinGlyph, GemGlyph } from '../../components/SkillIcons';
import { QtyStepper } from '../../components/Modal';
import { RARITY_TEXT } from '../../lib/game';

const lootIcon = (id: string): Item => ({ id, name: LOOT_BY_ID[id].name, type: 'LOOT', rarity: LOOT_BY_ID[id].rarity, level: 1, stats: {}, price: 0, description: LOOT_BY_ID[id].desc } as Item);

export const BrewerTab: React.FC = () => {
  const { gold, gems, inventory, next, run, brew, inRun } = useGameStore(useShallow((s) => ({
    gold: s.gold, gems: s.gems, inventory: s.inventory, next: s.elixirsNext, run: s.elixirsRun, brew: s.brewElixir, inRun: s.status !== GameStatus.MENU && s.status !== GameStatus.GAME_OVER,
  })));
  const samples = useMemo(() => Object.fromEntries(ELIXIR_IDS.map((k) => [k, elixirItem(k)])) as Record<ElixirId, Item>, []);
  const [sel, setSel] = useState<ElixirId>('might');
  const [qty, setQty] = useState(1);
  const d = ELIXIRS[sel];
  const freeBrew = useGameStore((s) => questFree(s, 'elixir')) && sel === 'might';   // tutorial: one free Elixir of Might
  let afford = Math.min(10, Math.floor(gold / d.gold));
  while (afford > 1 && brewGemCost(inventory, sel, afford) > gems) afford--;   // (missing ingredients are paid with gems)
  const maxQty = Math.max(1, afford);
  const q = Math.min(qty, maxQty);
  const gemCost = freeBrew ? 0 : brewGemCost(inventory, sel, q);
  const owned = (k: ElixirId) => inventory.reduce((n, i) => (i.type === 'ELIXIR' && i.name === ELIXIRS[k].name ? n + (i.quantity || 1) : n), 0);
  const missing = freeBrew ? '' : gold < d.gold * q ? 'Not enough gold' : gemCost > gems ? `Missing ingredients cost ${gemCost} gems` : '';
  const active = inRun ? run : next;

  return (
    <div className="flex flex-col gap-4" data-testid="brewer">
      <div>
        <div className="rpg-label mb-2">Elixirs</div>
        <ShopGrid>
          {ELIXIR_IDS.map((k) => (
            <ItemSlot key={k} item={samples[k]} fluid size="100%" iconSize="78%" price={ELIXIRS[k].gold} cantAfford={gold < ELIXIRS[k].gold} tooltip="none" compare={false}
              selected={sel === k} qty={owned(k)} onClick={() => { setSel(k); setQty(1); }} />
          ))}
        </ShopGrid>
      </div>
      <div className="brew-card">
        <div className="brew-name" style={{ color: RARITY_TEXT[d.rarity] }}><FlaskConical size={16} /> {d.name}</div>
        <div className="brew-fx" style={{ color: d.color }}>{d.effect} <em>· lasts one run</em></div>
        {freeBrew && <div className="rpg-frame gold p-2 mt-2 text-[.8rem] text-center" data-testid="brew-free">Your first Elixir of Might is on the house: no ingredients, no gold.</div>}
        <div className="rpg-label mt-3 mb-1.5">Ingredients</div>
        <div className="ws-mats">
          {d.parts.map((p) => <Mat key={p.id} art={<ItemArt item={lootIcon(p.id)} size="100%" />} name={LOOT_BY_ID[p.id].name} have={lootOwned(inventory, p.id)} need={p.count * q} />)}
          <Mat art={<CoinGlyph size={30} />} name="Gold" have={gold} need={d.gold * q} />
          {gemCost > 0 && <Mat art={<GemGlyph size={30} />} name="Gems for the missing ingredients" have={gems} need={gemCost} />}
        </div>
        <div className="rpg-label mt-3 mb-1.5">Quantity</div>
        <QtyStepper value={q} max={maxQty} onChange={setQty} />
        <button className={`forge-btn ${missing ? 'off' : 'on'}`} disabled={!!missing} title={missing || undefined} onClick={() => brew(sel, q)} data-testid="brew-btn">
          <FlaskConical size={20} /> {freeBrew ? 'Brew (Free)' : q > 1 ? `Brew x${q}` : 'Brew'}{gemCost > 0 && <span className="ml-2 inline-flex items-center gap-1 text-[.8em]"><GemGlyph size={14} /> {gemCost}</span>}
        </button>
      </div>
      <div>
        <div className="rpg-label mb-2">{inRun ? 'Active this run' : 'Ready for your next run'}</div>
        {active.length === 0
          ? <div className="rpg-label !text-[.6rem] opacity-70">None yet. Click an elixir in your bag to drink it.</div>
          : <div className="flex flex-wrap gap-1.5">{active.map((k) => <span key={k} className="brew-chip" style={{ borderColor: ELIXIRS[k].color }}><ItemArt item={samples[k]} size={20} /> {ELIXIRS[k].effect}</span>)}</div>}
        <div className="rpg-label !text-[.55rem] mt-2 opacity-70">Drink an elixir in town and its buff lasts through your next adventure; drink it during a run and it lasts until that run ends. One of each kind at a time.</div>
      </div>
    </div>
  );
};

const Mat: React.FC<{ art: React.ReactNode; name: string; have: number; need: number }> = ({ art, name, have, need }) => (
  <div className={`ws-mat ${have >= need ? 'ok' : 'no'}`}>
    <span className="ws-mat-art">{art}</span>
    <span className="ws-mat-n">{name}</span>
    <b>{have.toLocaleString()} / {need.toLocaleString()}</b>
  </div>
);
