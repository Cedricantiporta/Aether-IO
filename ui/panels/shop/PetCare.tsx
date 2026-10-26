import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../../../store';
import { ItemSlot } from '../../components/ItemSlot';
import { Button } from '../../components/Button';
import { CoinGlyph } from '../../components/SkillIcons';
import { STAT_LABEL, fmtItemStat, RARITY_TEXT } from '../../lib/game';
import {
  petLv, petStage, petStars, petXp, petXpNeed, petLvCap, petPowerAt, petDisplayName, petCanEvolve, PET_EVOLVE_COST,
  PET_SHARD_XP, petEats, PET_STAGE_LABEL, PET_STAGE_PREFIX, PET_MAX_LV,
} from '../../../petGrowth';
import { feedLoot, feedShards, evolvePet, lootFoodXp, canAffordEvolve } from '../../../petActions';
import type { PlayerStats, Rarity } from '../../../types';

const RARITIES: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
const RLABEL: Record<Rarity, string> = { COMMON: 'Common', UNCOMMON: 'Uncommon', RARE: 'Rare', EPIC: 'Epic', LEGENDARY: 'Legendary', MYTHIC: 'Mythic' };
const BAD = '#ff6b5e';

/** Pet Stable "Care" section: level bar, next-level stat preview, feeding (crystal/ore loot, shards) and evolution. Equipped pet only. */
export const PetCare: React.FC = () => {
  const { pet, gold, mats, inv } = useGameStore(useShallow((s) => ({ pet: s.equipment.pet, gold: s.gold, mats: s.materials, inv: s.inventory })));
  if (!pet) {
    return <div className="rpg-frame p-3 text-[.78rem]" style={{ color: 'var(--text-dim)' }} data-testid="pet-care">Pet Care: equip a pet to feed and evolve it.</div>;
  }
  const lv = petLv(pet), st = petStage(pet), cap = petLvCap(st), xp = petXp(pet), need = petXpNeed(lv);
  const atCap = lv >= cap;
  const evolving = petCanEvolve(pet);
  const nextLv = atCap ? lv : lv + 1;
  const cur = petPowerAt(lv, st, petStars(pet));
  const nxt = evolving ? petPowerAt(lv, st + 1, petStars(pet)) : petPowerAt(nextLv, st, petStars(pet));
  const keys = Object.keys(pet.stats ?? {}) as (keyof PlayerStats)[];
  const food = inv.filter((i) => lootFoodXp(i) > 0 && petEats(pet, i.rarity));   // (owner) tiered feeding
  const cost = PET_EVOLVE_COST[st];
  const can = canAffordEvolve(pet, gold, mats);
  const hasShards = RARITIES.some((r) => (mats[r] ?? 0) > 0 && petEats(pet, r));

  return (
    <div className="rpg-frame p-3 flex flex-col gap-2.5" data-testid="pet-care">
      <div className="flex items-center gap-3">
        <ItemSlot item={pet} size="4rem" iconSize={30} compare={false} tooltip="none" />
        <div className="flex-1 min-w-0">
          <div className="rpg-label">Pet Care</div>
          <div className="font-bold leading-tight" style={{ color: RARITY_TEXT[pet.rarity], fontFamily: 'var(--font-title)' }} data-testid="pet-care-name">{petDisplayName(pet)}</div>
          <div className="text-[.72rem]" style={{ color: st > 1 ? '#c58bff' : 'var(--text-dim)' }}>{PET_STAGE_LABEL[st]} · Lv {lv} / {cap}{cap < PET_MAX_LV ? ` (evolve to reach Lv ${PET_MAX_LV})` : ''}</div>
        </div>
      </div>

      <div>
        <div className="rpg-bar thin" style={{ ['--bc' as any]: atCap ? '#c58bff' : '#e9b949', ['--fill' as any]: atCap ? 1 : Math.min(1, xp / need) }}><div className="fill" /></div>
        <div className="flex justify-between text-[.68rem] rpg-num mt-0.5" style={{ color: 'var(--text-dim)' }} data-testid="pet-xp-line">
          <span>{atCap ? (st < 3 ? 'Level cap - evolve to continue' : 'Max level') : `${xp.toLocaleString()} / ${need.toLocaleString()} XP`}</span>
          <span>Kills during runs grant XP</span>
        </div>
      </div>

      <div className="text-[.74rem]" data-testid="pet-preview">
        <div className="rpg-label mb-0.5">{evolving ? 'After evolving' : atCap ? 'Current bonuses' : `At Lv ${nextLv}`}</div>
        {keys.map((k) => {
          const base = pet.stats[k] as number;
          const a = base * cur, b = base * nxt;
          return (
            <div key={k} className="flex justify-between">
              <span style={{ color: 'var(--text-dim)' }}>{STAT_LABEL[k]}</span>
              <span className="rpg-num">{fmtItemStat(k, +a.toFixed(3))}{b !== a && <span style={{ color: 'var(--good)' }}> {'->'} {fmtItemStat(k, +b.toFixed(3))}</span>}</span>
            </div>
          );
        })}
        <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>Pet skill power</span>
          <span className="rpg-num">x{cur.toFixed(2)}{nxt !== cur && <span style={{ color: 'var(--good)' }}> {'->'} x{nxt.toFixed(2)}</span>}</span></div>
      </div>

      <div>
        <div className="rpg-label mb-1">Feed</div>
        <div className="text-[.68rem] mb-1" style={{ color: 'var(--text-dim)' }}>Eats only <b style={{ color: RARITY_TEXT[pet.rarity] }}>{RLABEL[pet.rarity] ?? pet.rarity}</b> shards and food (its own tier).</div>
        {food.length === 0 && !hasShards && <div className="text-[.72rem]" style={{ color: 'var(--text-dim)' }}>No {RLABEL[pet.rarity] ?? pet.rarity} shards or food to feed.</div>}
        <div className="flex flex-col gap-1" data-testid="pet-feed-list">
          {food.map((i) => (
            <div key={i.id} className="flex items-center gap-2 text-[.74rem]">
              <span className="flex-1 min-w-0 truncate" style={{ color: RARITY_TEXT[i.rarity] }}>{i.name} <span className="rpg-num" style={{ color: 'var(--text-dim)' }}>x{i.quantity ?? 1}</span></span>
              <span className="rpg-num" style={{ color: 'var(--text-dim)' }}>+{lootFoodXp(i)} XP</span>
              <Button size="sm" disabled={atCap} onClick={() => feedLoot(i.id, 1)} data-testid="feed-loot-1">Feed 1</Button>
              <Button size="sm" disabled={atCap} onClick={() => feedLoot(i.id, 999)}>All</Button>
            </div>
          ))}
          {RARITIES.filter((r) => (mats[r] ?? 0) > 0 && petEats(pet, r)).map((r) => (
            <div key={r} className="flex items-center gap-2 text-[.74rem]">
              <span className="flex-1 min-w-0 truncate" style={{ color: RARITY_TEXT[r] }}>{RLABEL[r]} shards <span className="rpg-num" style={{ color: 'var(--text-dim)' }}>x{mats[r].toLocaleString()}</span></span>
              <span className="rpg-num" style={{ color: 'var(--text-dim)' }}>+{PET_SHARD_XP[r]} XP</span>
              <Button size="sm" disabled={atCap} onClick={() => feedShards(r, 10)} data-testid={`feed-shard-${r}`}>Feed 10</Button>
              <Button size="sm" disabled={atCap} onClick={() => feedShards(r, 99999)}>All</Button>
            </div>
          ))}
        </div>
      </div>

      {st < 3 && cost && (
        <div className="flex items-center gap-3 pt-1" >
          <div className="flex-1 min-w-0 text-[.72rem]" data-testid="pet-evolve-cost">
            <div className="rpg-label">Evolve to {PET_STAGE_PREFIX[st]}{pet.name}</div>
            <div className="flex flex-wrap gap-x-3 rpg-num" style={{ color: 'var(--text-dim)' }}>
              <span className="flex items-center gap-1" style={{ color: gold >= cost.gold ? undefined : BAD }}><CoinGlyph size={13} />{cost.gold.toLocaleString()}</span>
              {(Object.keys(cost.shards) as Rarity[]).map((r) => (
                <span key={r} style={{ color: mats[r] >= (cost.shards[r] ?? 0) ? RARITY_TEXT[r] : BAD }}>{RLABEL[r]} {mats[r]}/{cost.shards[r]}</span>
              ))}
            </div>
            <div style={{ color: 'var(--text-dim)' }}>Needs Lv {petLvCap(st)}. Bigger form, glow aura, big stat jump.</div>
          </div>
          <Button variant={can ? 'primary' : 'default'} disabled={!can} onClick={() => evolvePet()} data-testid="pet-evolve-btn">Evolve</Button>
        </div>
      )}
    </div>
  );
};
