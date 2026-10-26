import { useUiStore } from '../../uiStore';
import React, { useState } from 'react';
import { PETS_POOL } from '../../../constants';
import { useGameStore, shopPrice, firstPetFree } from '../../../store';
import { ItemSlot } from '../../components/ItemSlot';
import { ShopGrid } from '../../components/ShopGrid';
import { ItemArt } from '../../components/ItemArt';
import { PetCare } from './PetCare';
import { PetFuse, PetAscend } from './PetFuse';
import { STAT_LABEL, fmtItemStat, RARITY_TEXT } from '../../lib/game';
import { getPetProfile } from '../../../engine/systems/pets';
import type { PlayerStats } from '../../../types';

const RARITY_STARS: Record<string, number> = { COMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, MYTHIC: 5 };
const PET_SKILL_NAME: Record<string, string> = {
  HEAL: 'Healer', ATTACK_RANGED: 'Ranged attacker', ATTACK_MELEE: 'Melee attacker', COLLECT: 'Collector', REVIVE: 'Revive',
  FIRE_TRAIL: 'Fire Trail', CHILL_SWOOP: 'Chilling Swoop', LOOT_BURP: 'Loot Burp', LEECH: 'Leech Bite', CHOMP: 'Chomp', CHAIN_ZAP: 'Chain Lightning', SHIELD: 'Guardian Shield',
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
/** (owner) the stable sells Common..Epic pets only; Legendary (gold) and Mythic (red) come from summons / fusion. */
const SHOP_PETS = PETS_POOL.filter((q) => !q.summonOnly && q.rarity !== 'LEGENDARY' && q.rarity !== 'MYTHIC' && (q.rarity !== 'EPIC' || q.id === 'pet_wolf'));   // (owner) the only Epic in the shop is the Spirit Wolf
export const PetsTab: React.FC = () => {
  const gold = useGameStore((s) => s.gold);
  const sales = useGameStore((s) => s.shopSales);
  const setBuy = useUiStore((s) => s.setBuyItem);
  const freeBlob = useGameStore((s) => firstPetFree(s, 'pet_blob'));   // first pet: the Green Blob is on the house
  const tab = useUiStore((s) => s.petsTab), setTab = useUiStore((s) => s.setPetsTab);
  const [selId, setSel] = useState(SHOP_PETS[0]?.id ?? '');
  const p = SHOP_PETS.find((x) => x.id === selId) ?? SHOP_PETS[0];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {(['SHOP', 'CARE', 'FUSE', 'ASCEND'] as const).map((t) => <button key={t} className={`rpg-subtab bevel pe ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)} data-testid={`pets-${t.toLowerCase()}`}>{t === 'SHOP' ? 'Shop' : t === 'CARE' ? 'Pet Care' : t === 'FUSE' ? 'Fuse' : 'Ascend'}</button>)}
      </div>
      {tab === 'ASCEND' ? <PetAscend /> : tab === 'FUSE' ? <PetFuse /> : tab === 'CARE' ? <PetCare /> : (<>
        <ShopGrid className="pet-grid" testId="pet-grid">
          {SHOP_PETS.map((q) => (
            <div key={q.id} className="pet-cell" style={q.summonOnly ? { filter: 'grayscale(1) brightness(.45)' } : undefined} data-testid={`pet-row-${q.id}`}>
              <ItemSlot item={q} fluid size="100%" iconSize="78%" tooltip="buy" compare={false} selected={q.id === p.id} sale={q.summonOnly ? undefined : sales[q.id]}
                price={q.summonOnly ? undefined : freeBlob && q.id === 'pet_blob' ? 0 : shopPrice(q)} cantAfford={!q.summonOnly && !(freeBlob && q.id === 'pet_blob') && gold < shopPrice(q)}
                onClick={() => { setSel(q.id); if (!q.summonOnly) setBuy(q, { price: freeBlob && q.id === 'pet_blob' ? 0 : shopPrice(q), max: 1 }); }} />
            </div>
          ))}
        </ShopGrid>
      </>)}
    </div>
  );
};
