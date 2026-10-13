import React, { useRef } from 'react';
import { bubbles, MAX_BUBBLES } from '../../engine/systems/npcs';
import { useRaf } from '../hooks/useRaf';
import { useGameStore } from '../../store';

/**
 * Ambient NPC speech bubbles: ONE overlay layer with MAX_BUBBLES pooled elements. The engine decides who talks
 * (engine/systems/npcs.ts), render/Npcs.tsx projects the anchors to screen space, and this component only moves
 * DOM nodes in the shared rAF loop (no React state per frame).
 */
export const SpeechBubbles: React.FC = () => {
  const blocked = useGameStore((s) => s.isShopOpen || s.isInventoryOpen || s.isCharacterSheetOpen || s.isPauseMenuOpen);
  const els = useRef<(HTMLDivElement | null)[]>([]);
  const txt = useRef<string[]>(['', '', '']);
  useRaf(() => {
    for (let i = 0; i < MAX_BUBBLES; i++) {
      const el = els.current[i]; if (!el) continue;
      const b = bubbles[i];
      if (!b.active || !b.onScreen) { if (el.style.display !== 'none') el.style.display = 'none'; continue; }
      if (txt.current[i] !== b.text) { txt.current[i] = b.text; el.textContent = b.text; }
      const k = Math.min(1, b.t / 0.18, Math.max(0, (b.life - b.t) / 0.4));
      el.style.display = 'block';
      el.style.opacity = String(k);
      el.style.transform = `translate(${b.sx.toFixed(1)}px, ${(b.sy + (1 - k) * 6).toFixed(1)}px) translate(-50%, -100%)`;
    }
  });
  if (blocked) return null;
  return (
    <div className="npc-bubbles" data-testid="npc-bubbles" aria-hidden>
      {Array.from({ length: MAX_BUBBLES }, (_, i) => <div key={i} ref={(el) => { els.current[i] = el; }} className="npc-bubble" data-testid={`bubble-${i}`} style={{ display: 'none' }} />)}
    </div>
  );
};
