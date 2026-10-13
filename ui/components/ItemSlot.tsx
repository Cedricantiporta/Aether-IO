import React from 'react';
import { Lock } from 'lucide-react';
import type { Item } from '../../types';
import { ItemIcon } from './ItemIcon';
import { isGear } from '../lib/game';
import { tip } from './Tooltip';
import { ItemTip } from './ItemTip';

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
  cantAfford?: boolean;
  qty?: number;
  emptyLabel?: React.ReactNode;
  tooltip?: 'sell' | 'buy' | 'none';
  compare?: boolean;
  noTip?: boolean;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/** Metallic rarity-framed item slot. Empty when no item. */
export const ItemSlot: React.FC<Props> = ({
  item, size = '3.6rem', iconSize = 26, fluid, onClick, onContextMenu, selected, locked, dim, price, cantAfford, qty, emptyLabel, tooltip = 'sell', compare = true, noTip, disabled, className = '', children,
}) => {
  const q = qty ?? item?.quantity ?? 1;
  const cls = `rpg-slot ${item ? '' : 'is-empty'} ${fluid ? 'fluid' : ''} ${locked ? 'is-locked' : ''} ${selected ? 'is-selected' : ''} ${dim ? 'is-dim' : ''} ${className}`;
  const style = { ['--slot' as any]: size } as React.CSSProperties;
  const content = (
    <>
      {item ? <span className="slot-icon" style={dim ? undefined : undefined}><ItemIcon item={item} size={iconSize} /></span>
        : emptyLabel ? <span className="rpg-label !text-[.55rem] opacity-70 text-center leading-tight">{emptyLabel}</span> : fluid ? <span className="slot-plus-faint">+</span> : null}
      {item && q > 1 && <span className="slot-qty">{q}</span>}
      {item && isGear(item) && item.level > 1 && <span className="slot-plus">+{item.level - 1}</span>}
      {locked && <span className="slot-lock"><Lock size={14} /></span>}
      {price !== undefined && <span className={`slot-price ${cantAfford ? 'cant' : ''}`}>{price.toLocaleString()}</span>}
      {children}
    </>
  );
  const tipProps = item && !noTip ? tip(<ItemTip item={item} price={tooltip} compare={compare} />) : {};
  if (onClick || onContextMenu) {
    return <button type="button" disabled={disabled} className={cls} style={style} data-rarity={item?.rarity} onClick={onClick} onContextMenu={onContextMenu} {...tipProps}>{content}</button>;
  }
  return <div className={`${cls} hoverable`} style={style} data-rarity={item?.rarity} {...tipProps}>{content}</div>;
};
