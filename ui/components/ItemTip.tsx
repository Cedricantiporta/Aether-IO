import React from 'react';
import { ankhCooldownLeft } from '../../engine/systems/combat';
import type { Item, PlayerStats } from '../../types';
import { useGameStore, calculateItemCP, RANK_REQ, shopPrice, potionKind, potionCount, POTION_CAP } from '../../store';
import { fmtItemStat, STAT_LABEL, TYPE_LABEL, sellPrice, slotOf, isGear } from '../lib/game';
import { lootCraftUse } from '../../crafting';
import { LOOT_BY_NAME } from '../../loot';
import { elixirOf, elixirUses } from '../../elixirs';
import { HERO_STATS } from '../../constants';
import { classTag, canUseClass } from '../../itemClass';
import { charmText } from '../../accessoryCharms';
import { affixText, isUnique } from '../../affixes';
import { emptyAffixSlots } from '../../reforge';
import { gradeLabel, gradeOf } from '../../grade';
import { Lock } from './GoldIcons';
import { weaponPerk, perkText } from '../../weaponPerks';
import { petPower, petStatMul, petLv, petStage, petXp, petXpNeed, petLvCap, petDisplayName, PET_STAGE_LABEL } from '../../petGrowth';
import { SET_BY_NAME, setProgress, equippedSetCounts, SET_COLOR } from '../../itemSets';

const statKeys = (a: Partial<PlayerStats>, b?: Partial<PlayerStats>) => {
  const set = new Set<string>([...Object.keys(a), ...(b ? Object.keys(b) : [])]);
  return [...set] as (keyof PlayerStats)[];
};

/** Parchment item tooltip content. `compare` shows green/red deltas vs the equipped item. */
const tip_ok = (price: string) => price !== 'buy'; // shop templates have no growth
/** The tooltip: the hovered item, and (owner) the equipped item of that slot side by side for comparison. */
export const ItemTip: React.FC<{ item: Item; compare?: boolean; price?: 'sell' | 'buy' | 'none' }> = ({ item, compare = true, price = 'sell' }) => {
  const equipment = useGameStore((s) => s.equipment);
  const slot = slotOf(item);
  const equipped = compare && slot ? equipment[slot] : null;
  if (!equipped || equipped === item || equipped.id === item.id) return <ItemTipCard item={item} compare={compare} price={price} />;
  return (
    <div className="flex items-start gap-3" data-testid="tip-compare">
      <div style={{ paddingRight: '.75rem' }}>   {/* (owner: the equipped item on the left) */}
        <div className="tt-sub" style={{ color: '#7be38f', fontWeight: 800, marginBottom: '.15rem' }}>Currently equipped</div>
        <ItemTipCard item={equipped} compare={false} price="none" />
      </div>
      <ItemTipCard item={item} compare price={price} />
    </div>
  );
};
const ItemTipCard: React.FC<{ item: Item; compare?: boolean; price?: 'sell' | 'buy' | 'none' }> = ({ item, compare = true, price = 'sell' }) => {
  const equipment = useGameStore((s) => s.equipment);
  const heroClass = useGameStore((s) => s.hero);
  const level = useGameStore((s) => s.heroRank);
  const inventory = useGameStore((s) => s.inventory);
  const slot = slotOf(item);
  const equipped = compare && slot ? equipment[slot] : null;
  const isEquippedItself = equipped === item;
  const req = RANK_REQ[item.rarity];
  const tag = classTag(item);
  const wrongClass = isGear(item) && !canUseClass(item, heroClass);
  const cp = calculateItemCP(item);
  const cpDelta = equipped && !isEquippedItself ? cp - calculateItemCP(equipped) : 0;
  const pm = petPower(item), epm = equipped ? petPower(equipped) : 1; // pet growth scales displayed stats
  const keys = statKeys(item.stats, equipped && !isEquippedItself ? equipped.stats : undefined).filter((k) => item.stats[k] !== undefined || (equipped && equipped.stats[k] !== undefined));

  return (
    <div style={{ width: '16rem' }}>
      <div className="tt-name" data-rt={item.rarity}>
        {petDisplayName(item)}{item.level > 1 && isGear(item) && <span className="ml-1" style={{ color: '#a85d00' }}>+{item.level - 1}</span>}
        {isGear(item) && item.type !== 'PET' && <span className={`tt-grade ${gradeOf(item) === 'HIGH' ? 'is-high' : ''}`} data-testid="grade-tag">{gradeOf(item) === 'HIGH' ? '★ ' : ''}{gradeLabel(item)}</span>}
      </div>
      <div className="tt-sub">
        {TYPE_LABEL[item.type]}
        {item.type !== 'POTION' && item.type !== 'CORE' && item.type !== 'REVIVE' && item.type !== 'ELIXIR' && (
          <span className={level < req ? 'neg' : ''}> · Req Lv {req}</span>
        )}
      </div>
      {potionKind(item) && <div className="text-[.7rem] font-bold">Carried: {potionCount(inventory, potionKind(item)!)}/{POTION_CAP}</div>}
      {tag && <div className={`text-[.7rem] font-bold ${wrongClass ? 'neg' : ''}`}>{tag}</div>}
      {item.description && <><div className="tt-sep" /><div className="italic muted">{item.type === 'REVIVE' ? 'Auto-revive on death (50% HP). Long cooldown: 15 minutes between revives.' : item.description}</div></>}
      {item.type === 'REVIVE' && (() => { const ms = ankhCooldownLeft(); return <div style={{ color: ms > 0 ? '#ff8a7a' : 'var(--good)', fontWeight: 700 }}>{ms > 0 ? `Recharging: ${Math.ceil(ms / 60000)} min left` : 'Ready'}</div>; })()}
      {item.type === 'ELIXIR' && elixirOf(item) && <div style={{ color: elixirOf(item)!.color, fontWeight: 700 }}>{elixirOf(item)!.effect} · one run · click in the bag to drink</div>}
      {item.type === 'LOOT' && LOOT_BY_NAME[item.name] && elixirUses(LOOT_BY_NAME[item.name].id) && <div className="muted text-[.68rem]">{elixirUses(LOOT_BY_NAME[item.name].id)}</div>}
      {item.type === 'LOOT' && LOOT_BY_NAME[item.name] && lootCraftUse(LOOT_BY_NAME[item.name].id) && <div className="muted text-[.68rem]">{lootCraftUse(LOOT_BY_NAME[item.name].id)}</div>}
      {keys.length > 0 && <div className="tt-sep" />}
      {keys.map((k) => {
        const v = item.stats[k] === undefined ? undefined : (item.stats[k] as number) * (item.type === 'PET' ? petStatMul(item, k) : pm);
        const ev = equipped && !isEquippedItself && equipped.stats[k] !== undefined ? (equipped.stats[k] as number) * (equipped.type === 'PET' ? petStatMul(equipped, k) : epm) : undefined;
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
      {(() => {   // weapon perk (weaponPerks.ts): class-specific, strength by rarity
        const wp = weaponPerk(item);
        if (!wp) return null;
        const t = perkText(wp);
        return (<>
          <div className="tt-sep" />
          <div data-testid="perk-line" style={{ color: '#b0560a', fontWeight: 800, fontSize: '.8rem' }}>✦ {t.name}</div>
          <div style={{ fontSize: '.72rem', opacity: 0.85 }}>{t.desc}</div>
        </>);
      })()}
      {((item.affixes && item.affixes.length > 0) || emptyAffixSlots(item) > 0) && (
        <>
          <div className="tt-sep" />
          {(item.affixes ?? []).map((a, i) => (
            <div key={i} data-testid="affix-line" style={{ color: isUnique(a) ? '#ff9a3c' : a.perfect ? '#ffd24a' : '#6fa8ff', fontWeight: 700, fontSize: '.78rem', ...(a.perfect ? { textShadow: '0 0 6px rgba(255, 210, 60, .55)' } : {}) }}>{isUnique(a) ? '★ ' : a.perfect ? '✦ ' : '◆ '}{affixText(a)}{a.perfect ? ' (perfect)' : ''}{a.locked && <span data-testid="affix-lock" title="Sealed" style={{ marginLeft: 4, verticalAlign: '-2px', display: 'inline-block' }}><Lock size={11} /></span>}</div>
          ))}
          {Array.from({ length: emptyAffixSlots(item) }).map((_, i) => <div key={'e' + i} className="affix-empty" data-testid="affix-empty">◇ Empty bonus slot (Augment Rune)</div>)}
        </>
      )}
      {charmText(item) && <div data-testid="charm-line" style={{ color: '#d2691e', fontWeight: 800, fontSize: '.78rem', marginTop: '.15rem' }}>✸ {charmText(item)}</div>}
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
      {item.type === 'PET' && tip_ok(price) && (
        <div data-testid="pet-growth-tip">
          <div className="tt-sep" />
          <div className="tt-row"><span style={{ color: petStage(item) > 1 ? '#7a2ec2' : undefined, fontWeight: 800 }}>{PET_STAGE_LABEL[petStage(item)]} · Lv {petLv(item)}/{petLvCap(petStage(item))}</span>
            <span className="muted">{petLv(item) >= petLvCap(petStage(item)) ? (petStage(item) < 3 ? 'Ready to evolve' : 'MAX') : `${petXp(item)}/${petXpNeed(petLv(item))} XP`}</span></div>
          <div className="muted text-[.68rem]">Health / damage / defense and skill power x{pm.toFixed(2)} · % stats x{petStatMul(item, 'critRate').toFixed(2)}</div>
        </div>
      )}
      {item.petSkill && <div className="muted mt-1">Pet skill: {item.petSkill.replace('_', ' ').toLowerCase()}{item.petCooldown ? ` (${item.petCooldown}s)` : ''}</div>}
      {cp > 0 && (
        <div className="tt-row mt-1"><span className="muted">Power</span>
          <span>{cp.toLocaleString()}{cpDelta !== 0 && <span className={`ml-1 ${cpDelta > 0 ? 'pos' : 'neg'}`}>({cpDelta > 0 ? '+' : ''}{Math.round(cpDelta)})</span>}</span></div>
      )}
      {price !== 'none' && (
        <div className="tt-row mt-1" style={{ color: '#8a5a00', fontWeight: 800 }}>
          <span>{price === 'sell' ? 'Sell value' : 'Price'}</span><span>{(price === 'sell' ? sellPrice(item) : shopPrice(item)).toLocaleString()} G</span>
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
