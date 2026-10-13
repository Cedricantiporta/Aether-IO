import React from 'react';
import type { Item, PlayerStats } from '../../types';
import { useGameStore, calculateItemCP, RANK_REQ } from '../../store';
import { fmtItemStat, STAT_LABEL, TYPE_LABEL, sellPrice, slotOf, isGear } from '../lib/game';
import { lootCraftUse } from '../../crafting';
import { LOOT_BY_NAME } from '../../loot';
import { HERO_STATS } from '../../constants';
import { affixText, isUnique } from '../../affixes';
import { SET_BY_NAME, setProgress, equippedSetCounts, SET_COLOR } from '../../itemSets';

const statKeys = (a: Partial<PlayerStats>, b?: Partial<PlayerStats>) => {
  const set = new Set<string>([...Object.keys(a), ...(b ? Object.keys(b) : [])]);
  return [...set] as (keyof PlayerStats)[];
};

/** Parchment item tooltip content. `compare` shows green/red deltas vs the equipped item. */
export const ItemTip: React.FC<{ item: Item; compare?: boolean; price?: 'sell' | 'buy' | 'none' }> = ({ item, compare = true, price = 'sell' }) => {
  const equipment = useGameStore((s) => s.equipment);
  const heroClass = useGameStore((s) => s.hero);
  const level = useGameStore((s) => s.heroRank);
  const inventory = useGameStore((s) => s.inventory);
  const slot = slotOf(item);
  const equipped = compare && slot ? equipment[slot] : null;
  const isEquippedItself = equipped === item;
  const req = RANK_REQ[item.rarity];
  const wrongClass = item.classType && item.classType !== heroClass;
  const cp = calculateItemCP(item);
  const cpDelta = equipped && !isEquippedItself ? cp - calculateItemCP(equipped) : 0;
  const keys = statKeys(item.stats, equipped && !isEquippedItself ? equipped.stats : undefined).filter((k) => item.stats[k] !== undefined || (equipped && equipped.stats[k] !== undefined));

  return (
    <div style={{ width: '16rem' }}>
      <div className="tt-name" data-rt={item.rarity}>
        {item.name}{item.level > 1 && isGear(item) && <span className="ml-1" style={{ color: '#a85d00' }}>+{item.level - 1}</span>}
      </div>
      <div className="tt-sub">
        {TYPE_LABEL[item.type]}{item.classType ? ` · ${item.classType}` : ''}
        {item.type !== 'POTION' && item.type !== 'CORE' && item.type !== 'REVIVE' && (
          <span className={level < req ? 'neg' : ''}> · Req Rank {req}</span>
        )}
      </div>
      {wrongClass && <div className="neg text-[.7rem] font-bold">Cannot be used by {HERO_STATS[heroClass] ? heroClass : 'this hero'}</div>}
      {item.description && <><div className="tt-sep" /><div className="italic muted">{item.description}</div></>}
      {item.type === 'LOOT' && LOOT_BY_NAME[item.name] && lootCraftUse(LOOT_BY_NAME[item.name].id) && <div className="muted text-[.68rem]">{lootCraftUse(LOOT_BY_NAME[item.name].id)}</div>}
      {keys.length > 0 && <div className="tt-sep" />}
      {keys.map((k) => {
        const v = item.stats[k];
        const ev = equipped && !isEquippedItself ? equipped.stats[k] : undefined;
        const diff = equipped && !isEquippedItself ? (v ?? 0) - (ev ?? 0) : 0;
        const dir = diff > 0.0001 ? 'pos' : diff < -0.0001 ? 'neg' : '';
        return (
          <div key={k} className="tt-row">
            <span className="muted">{STAT_LABEL[k]}</span>
            <span className={v === undefined ? 'neg' : (v ?? 0) < 0 ? 'neg' : ''}>
              {v !== undefined ? fmtItemStat(k, v) : '—'}
              {equipped && !isEquippedItself && diff !== 0 && <span className={`ml-1 ${dir}`} style={{ fontSize: '.68rem' }}>{diff > 0 ? '▲' : '▼'}</span>}
            </span>
          </div>
        );
      })}
      {item.affixes && item.affixes.length > 0 && (
        <>
          <div className="tt-sep" />
          {item.affixes.map((a, i) => (
            <div key={i} data-testid="affix-line" style={{ color: isUnique(a) ? '#b8570a' : '#1f5fbf', fontWeight: 700, fontSize: '.78rem' }}>{isUnique(a) ? '★ ' : '◆ '}{affixText(a)}</div>
          ))}
        </>
      )}
      {item.setName && SET_BY_NAME[item.setName] && (() => {
        const def = SET_BY_NAME[item.setName!];
        const counts = equippedSetCounts(equipment);
        const n = counts[def.name] || 0;
        const prog = setProgress(def, heroClass, equipment, inventory);
        return (
          <div data-testid="set-block">
            <div className="tt-sep" />
            <div style={{ color: SET_COLOR, fontWeight: 800 }}>{def.name} ({n}/6)</div>
            {prog.map((p) => (
              <div key={p.slot} style={{ fontSize: '.72rem', color: p.state === 'equipped' ? SET_COLOR : p.state === 'owned' ? '#6a5a3a' : '#9a8f78', fontWeight: p.state === 'equipped' ? 700 : 500 }}>
                {p.state === 'equipped' ? '✔' : p.state === 'owned' ? '●' : '○'} {p.name}{p.state === 'owned' ? ' (in bag)' : ''}
              </div>
            ))}
            <div style={{ marginTop: 3 }}>
              {def.bonuses.map((b) => (
                <div key={b.pieces} style={{ fontSize: '.72rem', color: n >= b.pieces ? SET_COLOR : '#9a8f78', fontWeight: n >= b.pieces ? 700 : 500 }}>({b.pieces}) {b.text}</div>
              ))}
            </div>
          </div>
        );
      })()}
      {item.onHitEffect && (
        <>
          <div className="tt-sep" />
          <div style={{ color: '#7a2ec2', fontWeight: 700 }}>
            On hit: {item.onHitEffect.chance !== undefined && item.onHitEffect.chance < 1 ? `${Math.round(item.onHitEffect.chance * 100)}% chance to ` : ''}
            {item.onHitEffect.type.toLowerCase()} for {item.onHitEffect.duration}s
          </div>
        </>
      )}
      {item.petSkill && <div className="muted mt-1">Pet skill: {item.petSkill.replace('_', ' ').toLowerCase()}{item.petCooldown ? ` (${item.petCooldown}s)` : ''}</div>}
      {cp > 0 && (
        <div className="tt-row mt-1"><span className="muted">Power</span>
          <span>{cp.toLocaleString()}{cpDelta !== 0 && <span className={`ml-1 ${cpDelta > 0 ? 'pos' : 'neg'}`}>({cpDelta > 0 ? '+' : ''}{Math.round(cpDelta)})</span>}</span></div>
      )}
      {price !== 'none' && (
        <div className="tt-row mt-1" style={{ color: '#8a5a00', fontWeight: 800 }}>
          <span>{price === 'sell' ? 'Sell value' : 'Price'}</span><span>{(price === 'sell' ? sellPrice(item) : item.price).toLocaleString()} G</span>
        </div>
      )}
      {isEquippedItself && <div className="tt-sub mt-1" style={{ color: '#1f7a2e' }}>Equipped</div>}
    </div>
  );
};

export const SimpleTip: React.FC<{ title: string; sub?: string; color?: string; lines?: React.ReactNode[]; body?: string }> = ({ title, sub, color, lines, body }) => (
  <div style={{ width: '15rem' }}>
    <div className="tt-name" style={color ? { color } : undefined}>{title}</div>
    {sub && <div className="tt-sub">{sub}</div>}
    {body && <><div className="tt-sep" /><div className="muted italic">{body}</div></>}
    {lines && lines.length > 0 && <div className="tt-sep" />}
    {lines?.map((l, i) => <div key={i} className="tt-row">{l}</div>)}
  </div>
);
