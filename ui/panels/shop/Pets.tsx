import React, { useState } from 'react';
import { CoinGlyph } from '../../components/SkillIcons';
import { PETS_POOL } from '../../../constants';
import { useGameStore, shopPrice } from '../../../store';
import { ItemSlot } from '../../components/ItemSlot';
import { ItemArt } from '../../components/ItemArt';
import { Button } from '../../components/Button';
import { PetCare } from './PetCare';
import { STAT_LABEL, fmtItemStat, RARITY_TEXT } from '../../lib/game';
import { getPetProfile } from '../../../engine/systems/pets';
import type { PlayerStats } from '../../../types';

const RARITY_STARS: Record<string, number> = { COMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, MYTHIC: 5 };
const PET_SKILL_NAME: Record<string, string> = {
  HEAL: 'Healer', ATTACK_RANGED: 'Ranged attacker', ATTACK_MELEE: 'Melee attacker', COLLECT: 'Collector', REVIVE: 'Revive',
  FIRE_TRAIL: 'Fire Trail', CHILL_SWOOP: 'Chilling Swoop', LOOT_BURP: 'Loot Burp', CHAIN_ZAP: 'Chain Lightning', SHIELD: 'Guardian Shield',
  MARK: 'Hunter\'s Mark', SLAM: 'Armor-Shatter Slam', TIDAL_BEAM: 'Tidal Beam',
};

const PetBadges: React.FC<{ name: string }> = ({ name }) => {
  const pr = getPetProfile(name);
  const speed = pr.moveSpeed < 0.7 ? 'Slow' : pr.moveSpeed > 1.2 ? 'Fast' : 'Normal';
  const on = (v: boolean) => (v ? { color: 'var(--good)' } : { color: 'var(--text-dim)', opacity: 0.6 });
  return (
    <div className="flex flex-wrap gap-1 mt-1" data-testid="pet-badges">
      <span className="rpg-badge" style={on(pr.attacks)}>{pr.attacks ? `Attacks (${pr.attackMode === 'ranged' ? 'ranged' : 'melee'})` : 'No attack'}</span>
      <span className="rpg-badge" style={on(pr.fetches)}>{pr.fetches ? `Fetches (${pr.fetchSpeed >= 25 ? 'fast' : pr.fetchSpeed <= 9 ? 'slow' : 'medium'})` : 'No fetch'}</span>
      <span className="rpg-badge" style={{ color: 'var(--text-dim)' }}>Size x{pr.size.toFixed(2)}</span>
      {pr.heals && <span className="rpg-badge" style={on(true)}>Heals</span>}
      <span className="rpg-badge" style={{ color: 'var(--text-dim)' }}>{speed} mover</span>
    </div>
  );
};


/** Pet House: Shop (bag-style grid; click a pet for details + Buy) and Care (feed / evolve the equipped pet) tabs. */
export const PetsTab: React.FC = () => {
  const gold = useGameStore((s) => s.gold);
  const sales = useGameStore((s) => s.shopSales);
  const buyItem = useGameStore((s) => s.buyItem);
  const [tab, setTab] = useState<'SHOP' | 'CARE'>('SHOP');
  const [selId, setSel] = useState(PETS_POOL[0]?.id ?? '');
  const p = PETS_POOL.find((x) => x.id === selId) ?? PETS_POOL[0];
  const price = shopPrice(p), sale = sales[p.id], can = !p.summonOnly && gold >= price;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {(['SHOP', 'CARE'] as const).map((t) => <button key={t} className={`rpg-subtab bevel pe ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)} data-testid={`pets-${t.toLowerCase()}`}>{t === 'SHOP' ? 'Shop' : 'Pet Care'}</button>)}
      </div>
      {tab === 'CARE' ? <PetCare /> : (<>
        <div className="pet-grid" data-testid="pet-grid">
          {PETS_POOL.map((q) => (
            <div key={q.id} className="pet-cell" style={q.summonOnly ? { filter: 'grayscale(1) brightness(.45)' } : undefined} data-testid={`pet-row-${q.id}`}>
              <ItemSlot item={q} fluid iconSize={30} tooltip="buy" compare={false} selected={q.id === p.id} sale={q.summonOnly ? undefined : sales[q.id]}
                price={q.summonOnly ? undefined : shopPrice(q)} cantAfford={!q.summonOnly && gold < shopPrice(q)} onClick={() => setSel(q.id)} />
            </div>
          ))}
        </div>
        <div className="rpg-frame p-3 flex flex-col gap-1.5" data-testid="pet-detail">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-bold leading-tight" style={{ color: RARITY_TEXT[p.rarity], fontFamily: 'var(--font-title)' }}>{p.name} <span className="text-[.7rem]" style={{ color: '#ffd24a' }}>{'★'.repeat(RARITY_STARS[p.rarity] ?? 1)}</span></div>
              <div className="text-[.72rem] text-[var(--text-dim)] leading-snug">{p.description}</div>
            </div>
            {p.summonOnly ? <span className="rpg-badge" style={{ color: '#c58bff' }}>Summon only</span> : (
              <Button size="sm" variant={can ? 'primary' : 'default'} disabled={!can} onClick={() => buyItem(p)} style={{ flexDirection: 'column', gap: 0 }} data-testid="pet-buy">
                <span>Buy</span>
                {sale ? <span className="text-[.6rem] opacity-70 line-through rpg-num">{p.price.toLocaleString()}</span> : null}
                <span className="flex items-center gap-1 rpg-num"><CoinGlyph size={14} />{price.toLocaleString()}</span>
              </Button>
            )}
          </div>
          {!p.summonOnly && <PetBadges name={p.name} />}
          {PET_SKILL_NAME[p.petSkill as string] && <div className="text-[.7rem]" style={{ color: 'var(--text-dim)' }}>Skill: <b style={{ color: '#f6e6bd' }}>{PET_SKILL_NAME[p.petSkill as string]}</b></div>}
          <div className="text-[.72rem]">{(Object.keys(p.stats ?? {}) as (keyof PlayerStats)[]).map((k) => <span key={k} className="mr-3"><span style={{ color: 'var(--text-dim)' }}>{STAT_LABEL[k]}</span> <span className="rpg-num">{fmtItemStat(k, p.stats[k] as number)}</span></span>)}</div>
        </div>
      </>)}
    </div>
  );
};
