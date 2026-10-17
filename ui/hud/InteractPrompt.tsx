import { useInputMode, keyHint } from '../lib/inputMode';
import React, { useRef } from 'react';
import { nearby, interact, MAX_NEARBY, farmHold, FARM_HOLD_S } from '../../engine/systems/village';
import { roomNearby, interactRoom } from '../../engine/systems/director';
import { useGameStore } from '../../store';
import { GameStatus } from '../../types';
import { useUiStore } from '../uiStore';
import { useRaf } from '../hooks/useRaf';
import { world } from '../../engine/world';
import { device } from '../../engine/device';

/**
 * Genshin-style interact prompts: up to 3 floating pills (nearest first) for whatever is in reach
 * (town: shops, quest board, altar, trainer, harvest nodes; run: exit portals, fountain, merchant, chest, shrine). Reads the engine's preallocated `nearby` list in
 * the shared rAF loop and writes the DOM through refs, so there is no per-frame React state.
 * Tapping a pill runs the same action as E / F.
 */
export const InteractPrompt: React.FC = () => {
  const blocked = useGameStore((s) => s.isShopOpen || s.isInventoryOpen || s.isCharacterSheetOpen || s.isPauseMenuOpen);
  const ui = useUiStore((s) => s.settingsOpen || s.codexOpen || s.goalsOpen || !!s.confirm || !!s.sellItem || !!s.buyItem || !!s.summonResults || s.recordsOpen);
  const els = useRef<(HTMLButtonElement | null)[]>([]);
  const sig = useRef<string[]>(['', '', '']);
  const hold = useRef<number[]>([0, 0, 0]);
  const list = () => (useGameStore.getState().status === GameStatus.MENU ? nearby : roomNearby);
  useRaf(() => {
    const src = list();
    for (let i = 0; i < MAX_NEARBY; i++) {
      const el = els.current[i]; if (!el) continue;
      const n = src[i];
      if (src === nearby) {   // hold ring (farm chores): fills while E is held on this pill's thing
        const h = n.active && n.act === 'farm' && farmHold.node === n.node ? Math.min(1, farmHold.t / FARM_HOLD_S) : 0;
        if (h !== hold.current[i]) { hold.current[i] = h; (el.children[0] as HTMLElement).style.setProperty('--hold', String(h)); }
      }
      const pad = useInputMode.getState().pad;
      const key = n.active ? `${n.key}|${n.verb}|${n.label}|${n.color ?? ''}|${pad}` : '';
      if (key === sig.current[i]) continue;
      sig.current[i] = key;
      el.style.display = n.active ? 'flex' : 'none';
      if (n.active) {
        const k0 = el.children[0] as HTMLElement, kh = keyHint(n.key, pad);
        k0.textContent = kh;
        k0.className = pad && kh !== n.key ? 'pbtn pb-face hold-key' : 'rpg-key hold-key';   // (owner) controller: the coloured button badge
        k0.dataset.b = kh;
        (el.children[1] as HTMLElement).textContent = n.verb;
        (el.children[2] as HTMLElement).textContent = n.label;
        (el.children[2] as HTMLElement).style.color = n.color || '';   // loot: rarity colour
      }
    }
  });
  // E-type prompts fire once; harvest is held like the E key so the node keeps getting hit
  const press = (i: number, e: React.PointerEvent) => {
    const inTown = useGameStore.getState().status === GameStatus.MENU;
    const n = (inTown ? nearby : roomNearby)[i];
    if (n.act === 'harvest' || n.act === 'farm') { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); world.input.keys.KeyE = true; } else if (inTown) interact(n); else interactRoom(n);
  };
  const release = () => { world.input.keys.KeyE = false; };
  if (blocked || ui) { sig.current = ['', '', '']; return null; }
  return (
    <div className={`interact-stack ${device.touch ? 'touch' : ''}`} data-testid="interact-stack">
      {Array.from({ length: MAX_NEARBY }, (_, i) => (
        <button key={i} ref={(el) => { els.current[i] = el; }} className="interact-pill pe" style={{ display: 'none' }} data-testid={`interact-${i}`}
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); press(i, e); }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
          <span className="rpg-key hold-key" />
          <span className="iv" />
          <span className="il" />
        </button>
      ))}
    </div>
  );
};
