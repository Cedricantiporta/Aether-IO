// Item drag & drop between UI panels (desktop HTML5 DnD; clicks still work everywhere, incl. touch).
// Sources: bag items, equipped items, warehouse items. Targets: paper-doll slots (equip), the bag (unequip /
// withdraw), the warehouse (store) and shop windows (sell / pick for the blacksmith).
import React, { useState } from 'react';
import type { Item } from '../../types';
import type { EquipSlot } from '../../storeTypes';
import { hideTip } from '../components/Tooltip';
import { Vector3 } from 'three';
import { useGameStore } from '../../store';
import { world } from '../../engine/world';
import { spawnPickup, droppedItems } from '../../engine/systems/pickups';

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
      setHot(false);
      const s = current;
      if (!s || !accept(s)) return;            // not ours: let it bubble to an outer target (e.g. the whole bag panel)
      e.preventDefault(); e.stopPropagation();
      current = null; document.body.classList.remove('is-dragging');
      onDrop(s);
    },
  };
  return { hot, props };
}

/** New order for `list` after dropping item `dragId` on the slot holding `targetId` (swap) or on an empty slot (to the end). */
export function reorder<T extends { id: string }>(list: T[], dragId: string, targetId: string | null): T[] {
  const a = list.slice(), i = a.findIndex((x) => x.id === dragId);
  if (i < 0) return list;
  if (targetId === null) { const [x] = a.splice(i, 1); a.push(x); return a; }
  const j = a.findIndex((x) => x.id === targetId);
  if (j < 0 || j === i) return list;
  [a[i], a[j]] = [a[j], a[i]];
  return a;
}

// ---- drag an item out of a panel onto the game view: it drops on the ground in front of the hero (pick it up again with E)
const isWorld = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || el.tagName !== 'CANVAS') return false;
  const r = el.getBoundingClientRect();
  return r.width * r.height > window.innerWidth * window.innerHeight * 0.6;   // the main 3D view, not a preview canvas
};
const dropPos = new Vector3();
function dropToGround(s: DragSrc): void {
  if (s.from === 'WAREHOUSE') return;
  const st = useGameStore.getState(), p = world.player;
  if (s.from === 'EQUIP' && s.slot) st.unequipItem(s.slot);
  if (!useGameStore.getState().inventory.some((i) => i.id === s.item.id)) return;
  st.deleteItems([s.item.id]);
  dropPos.set(p.pos.x + Math.sin(p.facing) * 1.6, 0, p.pos.z + Math.cos(p.facing) * 1.6);
  droppedItems.add(s.item.id);
  spawnPickup('ITEM', dropPos, 0, s.item);
  st.addNotification(`Dropped ${s.item.name}`, '#d6c08a', 'ITEM');
}
if (typeof document !== 'undefined') {
  document.addEventListener('dragover', (e) => { if (current && current.from !== 'WAREHOUSE' && isWorld(e.target)) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; } });
  document.addEventListener('drop', (e) => {
    const s = current;
    if (!s || s.from === 'WAREHOUSE' || !isWorld(e.target)) return;
    e.preventDefault();
    current = null; document.body.classList.remove('is-dragging');
    dropToGround(s);
  });
}
