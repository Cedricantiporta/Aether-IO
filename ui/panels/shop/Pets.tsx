import React, { useState } from 'react';
import { CoinGlyph } from '../../components/SkillIcons';
import { PETS_POOL } from '../../../constants';
import { useGameStore, shopPrice } from '../../../store';
import { ItemSlot } from '../../components/ItemSlot';
import { ItemArt } from '../../components/ItemArt';
import { Button } from '../../components/Button';
import { STAT_LABEL, fmtItemStat, RARITY_TEXT } from '../../lib/game';
import { Stars } from '../../components/Stars';
import { RARITY_LIGHT } from '../../theme';
import { getPetProfile } from '../../../engine/systems/pets';
import type { PlayerStats } from '../../../types';

const PET_SKILL_NAME: Record<string, string> = {
  HEAL: 'Healer', ATTACK_RANGED: 'Ranged attacker', ATTACK_MELEE: 'Melee attacker', COLLECT: 'Collector', REVIVE: 'Revive',
  FIRE_TRAIL: 'Fire Trail', CHILL_SWOOP: 'Chilling Swoop', LOOT_BURP: 'Loot Burp', CHAIN_ZAP: 'Chain Lightning', SHIELD: 'Guardian Shield',
  MARK: 'Hunter\'s Mark', SLAM: 'Armor-Shatter Slam', TIDAL_BEAM: 'Tidal Beam',
};

const PetBadges: React.FC<{ name: string }> = ({ name }) => {
  const pr = getPetProfile(name);
  const speed = pr.moveSpeed < 0.7 ? 'Slow' : pr.moveSpeed > 1.2 ? 'Fast' : 'Normal';
  const on = (v: boolean) => (v ? { color: 'var(--good)' } : { color: 'var(--fg-2)', opacity: 0.6 });
  return (
    <div className="flex flex-wrap gap-1 mt-1" data-testid="pet-badges">
      <span className="rpg-badge" style={on(pr.attacks)}>{pr.attacks ? `Attacks (${pr.attackMode === 'ranged' ? 'ranged' : 'melee'})` : 'No attack'}</span>
      <span className="rpg-badge" style={on(pr.fetches)}>{pr.fetches ? `Fetches (${pr.fetchSpeed >= 25 ? 'fast' : pr.fetchSpeed <= 9 ? 'slow' : 'medium'})` : 'No fetch'}</span>
      <span className="rpg-badge" style={{ color: 'var(--fg-2)' }}>Size x{pr.size.toFixed(2)}</span>
      {pr.heals && <span className="rpg-badge" style={on(true)}>Heals</span>}
      <span className="rpg-badge" style={{ color: 'var(--fg-2)' }}>{speed} mover</span>
    </div>
  );
};


export const PetsTab: React.FC = () => {
  const gold = useGameStore((s) => s.gold);
  const sales = useGameStore((s) => s.shopSales);
  const buyItem = useGameStore((s) => s.buyItem);
  const [sel, setSel] = useState(PETS_POOL[0].id);
  const [hov, setHov] = useState('');
  const cur = PETS_POOL.find((p) => p.id === sel) ?? PETS_POOL[0];
  return (
    <div className="flex flex-col gap-2.5">
      <div className="rpg-frame flex flex-wrap gap-3 p-3" data-testid="pet-preview">
        <div style={{ width: 'min(200px, 40vw)', height: 'min(200px, 40vw)', flex: 'none', borderRadius: 16, display: 'grid', placeItems: 'center', background: `radial-gradient(circle at 50% 40%, ${RARITY_LIGHT[cur.rarity]}55, var(--paper-2) 72%)`, filter: cur.summonOnly ? 'drop-shadow(0 0 12px rgba(197,139,255,.5))' : undefined }} data-testid="pet-portrait">
          <div style={{ filter: 'drop-shadow(0 6px 8px rgba(0,0,0,.7))' }}><ItemArt item={cur} size="85%" /></div>
        </div>
        <div className="flex-1 min-w-[12rem] flex flex-col gap-1">
          <div className="font-bold text-lg leading-tight" style={{ color: RARITY_TEXT[cur.rarity],  }}>{cur.name}</div>
          <div className="flex items-center gap-2 flex-wrap"><Stars rarity={cur.rarity} /><span className="rpg-label">{cur.rarity}{cur.summonOnly ? ' · Summon only' : ''} · {PET_SKILL_NAME[cur.petSkill ?? ''] ?? 'Companion'}</span></div>
          <div className="text-xs text-[var(--fg-2)] leading-snug">{cur.description}</div>
          <PetBadges name={cur.name} />
          <div className="flex flex-col mt-1">
            {(Object.keys(cur.stats) as (keyof PlayerStats)[]).map((k) => (
              <span key={k} className="text-xs text-[var(--good)] font-semibold">{fmtItemStat(k, cur.stats[k]!)} {STAT_LABEL[k]}</span>
            ))}
          </div>
        </div>
      </div>
      {PETS_POOL.map((p) => {
        const price = shopPrice(p), sale = sales[p.id], can = !p.summonOnly && gold >= price;
        return (
          <div key={p.id} className="rpg-frame flex items-center gap-3 p-2.5" style={{ cursor: 'pointer', ...(sel === p.id ? { boxShadow: '0 0 0 3px var(--ac)' } : hov === p.id ? { filter: 'brightness(.97)' } : {}) }}
            data-testid={`pet-row-${p.id}`} onMouseEnter={() => setHov(p.id)} onMouseLeave={() => setHov('')} onClick={() => setSel(p.id)}>
            <div style={p.summonOnly ? { filter: 'brightness(0) contrast(.6) opacity(.7)' } : undefined}><ItemSlot item={p} size="4rem" iconSize={30} tooltip="buy" compare={false} sale={p.summonOnly ? undefined : sale} /></div>
            <div className="flex-1 min-w-0">
              <div className="font-bold leading-tight" style={{ color: RARITY_TEXT[p.rarity],  }}>{p.name}</div>
              <div className="text-xs text-[var(--fg-2)] leading-snug">{p.description}</div>
            </div>
            {p.summonOnly ? (
              <span className="rpg-badge" style={{ color: 'var(--r3-ink)' }}>Summon only</span>
            ) : (
              <Button size="sm" variant={can ? 'primary' : 'default'} disabled={!can} onClick={() => buyItem(p)} style={{ flexDirection: 'column', gap: 0 }}>
                <span>Buy</span>
                {sale ? <span className="text-xs opacity-70 line-through rpg-num">{p.price.toLocaleString()}</span> : null}
                <span className="flex items-center gap-1 rpg-num"><CoinGlyph size={14} />{price.toLocaleString()}</span>
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
};
