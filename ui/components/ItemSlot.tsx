import { gradeOf } from '../../grade';
/** (owner) the High-grade glow takes its tier's colour (light tints so it reads as light, not paint) */
const HIGH_GLOW: Record<string, string> = { EPIC: '#f1c8ff', LEGENDARY: '#ffe0a0', MYTHIC: '#ffb8b0' };
import React from 'react';
import { Lock } from './GoldIcons';
import type { Item } from '../../types';
import { ItemIcon } from './ItemIcon';
import { isGear, MAX_ITEM_LEVEL } from '../lib/game';
import { petLv, petStage } from '../../petGrowth';
import { tip } from './Tooltip';
import { ItemTip } from './ItemTip';
import { useGameStore } from '../../store';
import { canUseClass } from '../../itemClass';
import { dragProps, type DragSrc } from '../lib/dnd';

interface Props {
  item?: Item | null;
  size?: string;               // css length, e.g. '3.6rem'
  iconSize?: number | string;
  fluid?: boolean;             // fill grid cell, square, mockup style
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  selected?: boolean;
  locked?: boolean;            // level locked
  dim?: boolean;
  price?: number;              // shop price badge
  gemPrice?: boolean;          // the price is in gems (cyan badge)
  sale?: number;               // discount fraction -> red ribbon + struck old price
  oldPrice?: number;
  cantAfford?: boolean;
  qty?: number;
  emptyLabel?: React.ReactNode;
  tooltip?: 'sell' | 'buy' | 'none';
  compare?: boolean;
  noTip?: boolean;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
  drag?: DragSrc | null;       // makes the slot draggable (see ui/lib/dnd)
  onSeen?: () => void;         // hovered / touched (drops a bag item's "new" dot)
}

/** Metallic rarity-framed item slot. Empty when no item. */
export const ItemSlot: React.FC<Props> = ({
  item, size = '3.6rem', iconSize = 26, fluid, onClick, onContextMenu, selected, locked, dim, price, sale, oldPrice, gemPrice, cantAfford, qty, emptyLabel, tooltip = 'sell', compare = true, noTip, disabled, className = '', children, drag, onSeen,
}) => {
  const hero = useGameStore((s) => s.hero);
  const otherClass = !!item && isGear(item) && !canUseClass(item, hero);   // class-exclusive gear of another class: icon dimmed
  const q = qty ?? item?.quantity ?? 1;
  const plus = item && isGear(item) && item.level > 1 ? item.level - 1 : 0;
  const enh = plus >= MAX_ITEM_LEVEL - 1 ? 'is-plus-max' : plus >= 8 ? 'is-plus-hi' : plus >= 7 ? 'is-plus' : '';   // +7 and up: rarity-coloured glow
  const cls = `${enh} rpg-slot ${price === 0 && item ? 'is-free' : ''} ${item ? '' : 'is-empty'} ${fluid ? 'fluid' : ''} ${locked ? 'is-locked' : ''} ${selected ? 'is-selected' : ''} ${dim ? 'is-dim' : ''} ${className}`;
  const style = { ['--slot' as any]: size } as React.CSSProperties;
  const content = (
    <>
      {item && isGear(item) && gradeOf(item) === 'HIGH' && <span className="slot-highglow" data-testid="grade-badge" title="High grade" style={{ ['--hg' as any]: HIGH_GLOW[item.rarity] ?? '#ffffff' }} />}
      {item ? <span className="slot-icon" style={otherClass ? { opacity: 0.55, filter: 'saturate(.6)' } : undefined}><ItemIcon item={item} size={iconSize} /></span>
        : emptyLabel ? <span className="rpg-label !text-[.55rem] opacity-70 text-center leading-tight">{emptyLabel}</span> : fluid ? <span className="slot-plus-faint">+</span> : null}
      {item && q > 1 && <span className="slot-qty">{q}</span>}
      {item && item.type === 'PET' && tooltip !== 'buy' && <span className="slot-plus" data-testid="pet-lv-badge" style={petStage(item) > 1 ? { color: petStage(item) > 2 ? '#d8a8ff' : '#ffe08a' } : undefined}>Lv {petLv(item)}</span>}
      {locked && <span className="slot-lock"><Lock size={14} /></span>}
      {sale ? <span className="slot-sale" data-testid="sale-tag">-{Math.round(sale * 100)}%</span> : null}
      {sale && oldPrice !== undefined ? <span className="slot-old">{oldPrice.toLocaleString()}</span> : null}
      {price !== undefined && <span className={`slot-price ${cantAfford ? 'cant' : ''} ${gemPrice ? 'gem' : ''}`}>{price === 0 ? 'Free' : price.toLocaleString()}</span>}
      {price === 0 && item && <span className="slot-free-badge" data-testid="free-badge">FREE</span>}
      {children}
    </>
  );
  const tipProps = item && !noTip ? tip(<ItemTip item={item} price={tooltip} compare={compare} />) : {};
  const dnd = item && drag ? dragProps(drag) : {};
  if (onClick || onContextMenu) {
    return <button type="button" disabled={disabled} className={cls} style={style} data-rarity={item?.rarity} onClick={onClick} onContextMenu={onContextMenu} onPointerEnter={onSeen} {...tipProps} {...dnd}>{content}</button>;
  }
  return <div className={`${cls} hoverable`} style={style} data-rarity={item?.rarity} onPointerEnter={onSeen} {...tipProps} {...dnd}>{content}</div>;
};
