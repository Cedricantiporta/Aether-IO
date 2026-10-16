// Elixir Brewer (hut outside the town gate): brew elixirs from monster parts + gold. Recipe grid on top (the shop's priced
// slot grid), the selected recipe's parts / gold / quantity / Brew button below, then the elixir buffs waiting for the next
// run (or active in this run). Elixirs land in the bag; clicking one there drinks it (store.drinkElixir).
import React, { useMemo, useState } from 'react';
import { FlaskConical } from '../../components/GoldIcons';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../../../store';
import { ELIXIRS, ELIXIR_IDS, elixirItem, type ElixirId } from '../../../elixirs';
import { lootOwned } from '../../../crafting';
import { LOOT_BY_ID } from '../../../loot';
import { GameStatus, type Item } from '../../../types';
import { ItemSlot } from '../../components/ItemSlot';
import { ShopGrid } from '../../components/ShopGrid';
import { ItemArt } from '../../components/ItemArt';
import { CoinGlyph } from '../../components/SkillIcons';
import { QtyStepper } from '../../components/Modal';
import { RARITY_TEXT } from '../../lib/game';

const lootIcon = (id: string): Item => ({ id, name: LOOT_BY_ID[id].name, type: 'LOOT', rarity: LOOT_BY_ID[id].rarity, level: 1, stats: {}, price: 0, description: LOOT_BY_ID[id].desc } as Item);

export const BrewerTab: React.FC = () => {
  const { gold, inventory, next, run, brew, inRun } = useGameStore(useShallow((s) => ({
    gold: s.gold, inventory: s.inventory, next: s.elixirsNext, run: s.elixirsRun, brew: s.brewElixir, inRun: s.status !== GameStatus.MENU && s.status !== GameStatus.GAME_OVER,
  })));
  const samples = useMemo(() => Object.fromEntries(ELIXIR_IDS.map((k) => [k, elixirItem(k)])) as Record<ElixirId, Item>, []);
  const [sel, setSel] = useState<ElixirId>('might');
  const [qty, setQty] = useState(1);
  const d = ELIXIRS[sel];
  let afford = Math.floor(gold / d.gold);
  for (const p of d.parts) afford = Math.min(afford, Math.floor(lootOwned(inventory, p.id) / p.count));
  const maxQty = Math.max(1, Math.min(10, afford));
  const q = Math.min(qty, maxQty);
  const owned = (k: ElixirId) => inventory.reduce((n, i) => (i.type === 'ELIXIR' && i.name === ELIXIRS[k].name ? n + (i.quantity || 1) : n), 0);
  const missing = gold < d.gold ? 'Not enough gold' : (() => { const m = d.parts.find((p) => lootOwned(inventory, p.id) < p.count); return m ? `Missing ${LOOT_BY_ID[m.id].name}` : ''; })();
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
        <div className="rpg-label mt-3 mb-1.5">Ingredients</div>
        <div className="ws-mats">
          {d.parts.map((p) => <Mat key={p.id} art={<ItemArt item={lootIcon(p.id)} size="100%" />} name={LOOT_BY_ID[p.id].name} have={lootOwned(inventory, p.id)} need={p.count * q} />)}
          <Mat art={<CoinGlyph size={30} />} name="Gold" have={gold} need={d.gold * q} />
        </div>
        <div className="rpg-label mt-3 mb-1.5">Quantity</div>
        <QtyStepper value={q} max={maxQty} onChange={setQty} />
        <button className={`forge-btn ${missing ? 'off' : 'on'}`} disabled={!!missing} title={missing || undefined} onClick={() => brew(sel, q)} data-testid="brew-btn">
          <FlaskConical size={20} /> {q > 1 ? `Brew x${q}` : 'Brew'}
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
