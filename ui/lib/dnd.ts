// Item drag & drop between UI panels (desktop HTML5 DnD; clicks still work everywhere, incl. touch).
// Sources: bag items, equipped items, warehouse items. Targets: paper-doll slots (equip), the bag (unequip /
// withdraw), the warehouse (store) and shop windows (sell / pick for the blacksmith).
import React, { useState } from 'react';
import type { Item } from '../../types';
import type { EquipSlot } from '../../storeTypes';
import { hideTip } from '../components/Tooltip';

export type DragFrom = 'BAG' | 'EQUIP' | 'WAREHOUSE';
export interface DragSrc { from: DragFrom; item: Item; slot?: EquipSlot }

let current: DragSrc | null = null;
export const dragging = (): DragSrc | null => current;

/** Props that make an element a drag source. */
export function dragProps(src: DragSrc | null): React.HTMLAttributes<HTMLElement> & { draggable?: boolean } {
  if (!src) return {};
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      current = src; hideTip();
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', src.item.id); } catch { /* ignore */ }
      document.body.classList.add('is-dragging');
    },
    onDragEnd: () => { current = null; document.body.classList.remove('is-dragging'); },
  };
}

/** Drop target hook: `accept` decides per drag source; `hot` is true while an accepted item hovers. */
export function useDrop(accept: (s: DragSrc) => boolean, onDrop: (s: DragSrc) => void) {
  const [hot, setHot] = useState(false);
  const ok = () => !!current && accept(current);
  const props = {
    onDragOver: (e: React.DragEvent) => { if (ok()) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!hot) setHot(true); } },
    onDragEnter: (e: React.DragEvent) => { if (ok()) { e.preventDefault(); setHot(true); } },
    onDragLeave: (e: React.DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setHot(false); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation(); setHot(false);
      const s = current; current = null; document.body.classList.remove('is-dragging');
      if (s && accept(s)) onDrop(s);
    },
  };
  return { hot, props };
}
