// Wishing Fountain result popup (owner 2026-10-31): opens after the toss show (engine/systems/wishing.ts) with the revealed Luck buff:
// name, rarity, what it does per activity and how long it lasts. Also reopened by E at the fountain when today's wish is already made.
// Own soft markup (no Modal), styles in wish.css. Closes on tap / Esc / walking away from the fountain.
import React, { useState } from 'react';
import { useGameStore } from '../../store';
import { useGameEvent } from '../hooks/useEvent';
import { useRaf } from '../hooks/useRaf';
import { world } from '../../engine/world';
import { PLAZA_FOUNTAIN } from '../../engine/townData';
import { WISH_BY_ID, WISH_TARGET, WISH_TARGETS, fxLines, liveTargets, type WishId } from '../../wishing';
import { dayKey } from '../../dailyChallenge';
import './wish.css';

const TIER_WORD: Record<string, string> = { RARE: 'Nice wish', EPIC: 'Lucky wish', LEGENDARY: 'JACKPOT' };

export const WishWindow: React.FC = () => {
  const [open, setOpen] = useState(false);
  const wish = useGameStore((s) => s.progress.wish);
  useGameEvent('openWish', () => setOpen(true));
  useRaf(() => { if (!open) return; const p = world.player.pos; if ((p.x - PLAZA_FOUNTAIN.x) ** 2 + (p.z - PLAZA_FOUNTAIN.z) ** 2 > 12 * 12) setOpen(false); });
  if (!open) return null;
  const today = dayKey(), def = wish && wish.day === today && wish.id ? WISH_BY_ID[wish.id as WishId] : null;
  if (!def) return null;
  const live = liveTargets(wish, today);
  return (
    <div className="wish-shade pe" data-testid="wish-window" style={{ zIndex: 160 }} onPointerDown={() => setOpen(false)}>
      <div className="wish-card" style={{ ['--wc' as string]: def.color }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="wish-star" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((i) => <i key={i} style={{ ['--a' as string]: `${i * 60}deg`, animationDelay: `${i * 0.12}s` }} />)}
        </div>
        <div className="wish-tier">{TIER_WORD[def.tier] ?? 'Your wish'}</div>
        <h2 data-testid="wish-name">{def.name}</h2>
        <p className="wish-blurb">{def.blurb}</p>
        <ul className="wish-rows">
          {WISH_TARGETS.filter((t) => def.fx[t]).map((t) => {
            const done = !live.includes(t);
            const extra = t === 'FISH' ? ` (${wish!.fishLeft} left)` : t === 'CRAFT' ? ` (${wish!.craftLeft} left)` : '';
            return (
              <li key={t} className={done ? 'done' : ''} data-testid={`wish-row-${t}`}>
                <b>{WISH_TARGET[t].label}</b>
                <span>{fxLines(t, def.fx[t]!).join(', ')}</span>
                <em>{done ? 'Used up' : `${WISH_TARGET[t].when}${extra}`}</em>
              </li>
            );
          })}
        </ul>
        <p className="wish-note">Unused luck is gone at tomorrow's reset. Come back for a new wish then!</p>
        <button className="wish-ok" onClick={() => setOpen(false)}>Thank you, fountain!</button>
      </div>
    </div>
  );
};
