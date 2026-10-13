import React, { useRef } from 'react';
import { nearby, interact, MAX_NEARBY } from '../../engine/systems/village';
import { useGameStore } from '../../store';
import { useUiStore } from '../uiStore';
import { useRaf } from '../hooks/useRaf';
import { world } from '../../engine/world';
import { device } from '../../engine/device';

/**
 * Genshin-style interact prompts: up to 3 floating pills (nearest first) for whatever is in reach
 * (shops, quest board, altar, trainer, harvest nodes). Reads the engine's preallocated `nearby` list in
 * the shared rAF loop and writes the DOM through refs, so there is no per-frame React state.
 * Tapping a pill runs the same action as E / F.
 */
export const InteractPrompt: React.FC = () => {
  const blocked = useGameStore((s) => s.isShopOpen || s.isInventoryOpen || s.isCharacterSheetOpen || s.isPauseMenuOpen);
  const ui = useUiStore((s) => s.settingsOpen || s.codexOpen || !!s.confirm || !!s.sellItem || !!s.buyItem || !!s.summonResults || s.recordsOpen);
  const els = useRef<(HTMLButtonElement | null)[]>([]);
  const sig = useRef<string[]>(['', '', '']);
  useRaf(() => {
    for (let i = 0; i < MAX_NEARBY; i++) {
      const el = els.current[i]; if (!el) continue;
      const n = nearby[i];
      const key = n.active ? `${n.key}|${n.verb}|${n.label}` : '';
      if (key === sig.current[i]) continue;
      sig.current[i] = key;
      el.style.display = n.active ? 'flex' : 'none';
      if (n.active) {
        (el.children[0] as HTMLElement).textContent = n.key;
        (el.children[1] as HTMLElement).textContent = n.verb;
        (el.children[2] as HTMLElement).textContent = n.label;
      }
    }
  });
  // E-type prompts fire once; harvest is held like the E key so the node keeps getting hit
  const press = (i: number, e: React.PointerEvent) => {
    const n = nearby[i];
    if (n.act === 'harvest') { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); world.input.keys.KeyE = true; } else interact(n);
  };
  const release = () => { world.input.keys.KeyE = false; };
  if (blocked || ui) { sig.current = ['', '', '']; return null; }
  return (
    <div className={`interact-stack ${device.touch ? 'touch' : ''}`} data-testid="interact-stack">
      {Array.from({ length: MAX_NEARBY }, (_, i) => (
        <button key={i} ref={(el) => { els.current[i] = el; }} className="interact-pill pe" style={{ display: 'none' }} data-testid={`interact-${i}`}
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); press(i, e); }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
          <span className="rpg-key" />
          <span className="iv" />
          <span className="il" />
        </button>
      ))}
    </div>
  );
};
