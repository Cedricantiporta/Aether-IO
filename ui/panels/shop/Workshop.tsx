// Blacksmith Workshop (crafting window, MMO style): a category tree on the left (gear slots -> rarity recipes, craftable
// ones marked), the anvil preview in the middle (possible items, stat ranges and the gain over what is equipped), and
// the materials / rates / quantity / Craft button on the right. Crafting plays the forge cinematic: Success, Great
// Success (+1 / +2) or Failure (gold + shards lost, monster loot kept).
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ChevronDown, Hammer, Lock, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore, calculateItemCP } from '../../../store';
import { CRAFT_SLOTS, CRAFT_RARITIES, CRAFT_SUCCESS, CRAFT_PLUS1_CHANCE, CRAFT_PLUS2_CHANCE, SLOT_LABEL, getRecipe, canCraft, recipeTemplates, statRange, lootOwned, type CraftSlot, type CraftOutcome } from '../../../crafting';
import { LOOT_BY_ID } from '../../../loot';
import { shardItem } from '../../../shards';
import type { Item, PlayerStats, Rarity } from '../../../types';
import { ItemSlot } from '../../components/ItemSlot';
import { ItemArt, AnvilGlyph } from '../../components/ItemArt';
import { CoinGlyph } from '../../components/SkillIcons';
import { QtyStepper } from '../../components/Modal';
import { ForgeCinematic, type ForgeOutcome } from '../../components/ForgeCinematic';
import { RARITY_COLOR, RARITY_TEXT, STAT_LABEL, fmtItemStat } from '../../lib/game';

const RNAME: Record<Rarity, string> = { COMMON: 'Common', RARE: 'Rare', EPIC: 'Epic', LEGENDARY: 'Legendary', MYTHIC: 'Mythic' };
const pc = (v: number) => `${Math.round(v * 100)}%`;
const lootItem = (id: string): Item => ({ id, name: LOOT_BY_ID[id].name, type: 'LOOT', rarity: LOOT_BY_ID[id].rarity, level: 1, stats: {}, price: 0, description: LOOT_BY_ID[id].desc } as Item);

export const Workshop: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { materials, gold, inventory, heroRank, hero, maxInventorySlots, equipment, craftItem } = useGameStore(useShallow((s) => ({
    materials: s.materials, gold: s.gold, inventory: s.inventory, heroRank: s.heroRank, hero: s.hero, maxInventorySlots: s.maxInventorySlots, equipment: s.equipment, craftItem: s.craftItem,
  })));
  const [open, setOpen] = useState<CraftSlot>('weapon');
  const [slot, setSlot] = useState<CraftSlot>('weapon');
  const [rarity, setRarity] = useState<Rarity>('COMMON');
  const [qty, setQty] = useState(1);
  const [cine, setCine] = useState<{ preview: Item; run: () => ForgeOutcome } | null>(null);
  const st = { materials, gold, inventory, heroRank, maxInventorySlots };
  const recipe = getRecipe(slot, rarity, hero);
  const missing = canCraft(st, recipe);
  const templates = recipeTemplates(recipe);
  const equipped = equipment[slot] as Item | null;
  // how many crafts the materials cover
  let afford = Math.floor(materials[recipe.rarity] / recipe.shards);
  afford = Math.min(afford, Math.floor(gold / Math.max(1, recipe.gold)));
  for (const l of recipe.loot) afford = Math.min(afford, Math.floor(lootOwned(inventory, l.id) / l.count));
  const maxQty = Math.max(1, Math.min(10, afford));
  const q = Math.min(qty, maxQty);
  const succ = CRAFT_SUCCESS[rarity], great = succ * (CRAFT_PLUS1_CHANCE + CRAFT_PLUS2_CHANCE);
  const reason = missing.length === 0 ? '' : missing[0].kind === 'rank' ? `Requires Lv ${recipe.rankReq}` : missing[0].kind === 'space' ? 'Bag full' : `Missing ${missing[0].label}`;

  const craft = () => {
    if (missing.length) return;
    const preview = templates[0];
    setCine({
      preview,
      run: () => {
        const got: { item: Item | null; outcome: CraftOutcome }[] = [];
        for (let i = 0; i < q; i++) { const r = useGameStore.getState().craftItem(recipe); if (!r) break; got.push(r); }
        const ok = got.filter((g) => g.item), greats = got.filter((g) => g.outcome === 'GREAT').length, fails = got.length - ok.length;
        const best = ok.map((g) => g.item!).sort((a, b) => calculateItemCP(b) - calculateItemCP(a))[0];
        if (!best) return { success: false, item: preview, title: got.length > 1 ? `All ${got.length} crafts failed` : 'Crafting Failed', sub: 'The metal cracked on the anvil. Gold and shards were lost; your monster loot is safe.' };
        const title = greats > 0 ? 'Great Success!' : 'Success!';
        const sub = got.length > 1 ? `${ok.length} crafted${greats ? ` · ${greats} great` : ''}${fails ? ` · ${fails} failed` : ''}` : `${best.name}${best.level > 1 ? ` +${best.level - 1}` : ''}`;
        return { success: true, item: best, title, sub };
      },
    });
  };
  void craftItem;

  return createPortal(
    <div className="ws-backdrop pe" onClick={onClose} data-testid="workshop">
      <motion.div className="ws-win" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }} onClick={(e) => e.stopPropagation()}>
        <div className="ws-head"><Hammer size={20} /> Workshop <em>Forge new gear from shards, gold and monster loot</em><button className="sw-x" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <div className="ws-body">
          {/* category tree */}
          <div className="ws-tree rpg-scroll" data-testid="craft-slots">
            {CRAFT_SLOTS.map((sl) => (
              <div key={sl} className={`ws-cat ${open === sl ? 'open' : ''}`}>
                <button className="ws-cat-h pe" onClick={() => setOpen(open === sl ? ('' as CraftSlot) : sl)}><span>{SLOT_LABEL[sl]}</span><ChevronDown size={14} /></button>
                {open === sl && CRAFT_RARITIES.map((r) => {
                  const rc = getRecipe(sl, r, hero), lk = heroRank < rc.rankReq, can = canCraft(st, rc).length === 0;
                  return (
                    <button key={r} className={`ws-rec pe ${slot === sl && rarity === r ? 'sel' : ''} ${lk ? 'lk' : ''}`} style={{ ['--rc' as any]: RARITY_COLOR[r] }}
                      onClick={() => { setSlot(sl); setRarity(r); setQty(1); }} data-testid={`craft-${sl}-${r}`}>
                      <i /><span>{RNAME[r]} {SLOT_LABEL[sl]}</span>{lk ? <Lock size={11} /> : can ? <b className="ws-can" title="Craftable" /> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          {/* anvil preview */}
          <div className="ws-anvil" data-testid="craft-preview">
            <div className="ws-title" style={{ color: RARITY_TEXT[rarity] }}>{RNAME[rarity]} {SLOT_LABEL[slot]}{slot === 'weapon' ? ` · ${hero.charAt(0) + hero.slice(1).toLowerCase()}` : ''}</div>
            <div className="ws-stage">
              <div className="ws-glow" style={{ ['--rc' as any]: RARITY_COLOR[rarity] }} />
              <div className="ws-anvil-art"><AnvilGlyph size={150} glow /></div>
              <div className="ws-result">{templates[0] && <ItemSlot item={{ ...templates[0], rarity }} size="5.4rem" iconSize="78%" tooltip="none" compare={false} />}</div>
            </div>
            {heroRank < recipe.rankReq && <div className="ws-lock" data-testid="craft-lock"><Lock size={12} /> Needs Lv {recipe.rankReq} (you are Lv {heroRank})</div>}
            <div className="ws-stats">
              <div className="ws-sec">Possible stats {equipped && <em>vs equipped {equipped.name}</em>}</div>
              {templates.slice(0, 1).map((t) => (Object.keys(t.stats) as (keyof PlayerStats)[]).map((k) => {
                const [lo, hi] = statRange(t.stats[k]!), cur = (equipped?.stats?.[k] as number | undefined) ?? 0, mid = (lo + hi) / 2, d = mid - cur;
                return (
                  <div key={k} className="ws-stat"><span>{STAT_LABEL[k]}</span><b>{fmtItemStat(k, lo)} – {fmtItemStat(k, hi)}</b>
                    {equipped && Math.abs(d) > 1e-6 && <i className={d > 0 ? 'up' : 'down'}>{d > 0 ? '▲' : '▼'} {fmtItemStat(k, Math.abs(d))}</i>}</div>
                );
              }))}
              {templates.length > 1 && <div className="ws-note">One of {templates.length} designs: {templates.map((t) => t.name).join(', ')}</div>}
              <div className="ws-note">Stats roll ±15% and may carry random affixes.</div>
            </div>
          </div>
          {/* materials + rates + craft */}
          <div className="ws-side">
            <div className="ws-sec">Materials</div>
            <div className="ws-mats">
              <Mat art={<ItemArt item={shardItem(rarity, 1)} size="100%" />} name={`${RNAME[rarity]} Shard`} have={materials[rarity]} need={recipe.shards * q} />
              <Mat art={<CoinGlyph size={30} />} name="Gold" have={gold} need={recipe.gold * q} />
              {recipe.loot.map((l) => <Mat key={l.id} art={<ItemArt item={lootItem(l.id)} size="100%" />} name={LOOT_BY_ID[l.id].name} have={lootOwned(inventory, l.id)} need={l.count * q} />)}
            </div>
            <div className="ws-sec">Rates</div>
            <div className="ws-rates">
              <div><span>Success</span><b style={{ color: '#9be8a8' }}>{pc(succ)}</b></div>
              <div><span>Great success (+1/+2)</span><b style={{ color: '#ffd45a' }}>{pc(great)}</b></div>
              <div><span>Failure</span><b style={{ color: '#f87171' }}>{pc(1 - succ)}</b></div>
              {succ < 1 && <em>On failure the gold and shards are lost; monster loot is kept.</em>}
            </div>
            <div className="ws-sec">Quantity</div>
            <QtyStepper value={q} max={maxQty} onChange={setQty} />
            <button className="forge-btn on ws-go" disabled={missing.length > 0} onClick={craft} data-testid="craft-btn"><Hammer size={20} /> {missing.length ? reason : q > 1 ? `Craft x${q}` : 'Craft'}</button>
          </div>
        </div>
      </motion.div>
      {cine && <ForgeCinematic item={cine.preview} run={cine.run} heading="Crafting Result" onDone={() => setCine(null)} />}
    </div>,
    (document.querySelector('.hud-root') as HTMLElement) ?? document.body,
  );
};

const Mat: React.FC<{ art: React.ReactNode; name: string; have: number; need: number }> = ({ art, name, have, need }) => (
  <div className={`ws-mat ${have >= need ? 'ok' : 'no'}`} data-testid="craft-need">
    <span className="ws-mat-art">{art}</span>
    <span className="ws-mat-n">{name}</span>
    <b>{have.toLocaleString()} / {need.toLocaleString()}</b>
  </div>
);
