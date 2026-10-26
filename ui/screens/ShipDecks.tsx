import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRaf } from '../hooks/useRaf';
import { shipState } from '../../engine/runMods';
import { SHIP_DECKS, deckRecipe, deckRarityMix } from '../../engine/runCards';
import { useGameStore } from '../../store';
const DECK_URL = (((import.meta as any).env?.BASE_URL as string) || '/') + 'art/decks/';

const DECK_COLOR: Record<string, string> = { OFFENSE: '#ff8a6a', DEFENSE: '#6fb7ff', BALANCED: '#8fd96a', STRATEGIST: '#b99bff', RESOURCEFUL: '#ffcf5a' };
/** (owner 2026-10-26) painted deck cards: public/art/decks/<deck>.webp fronts + back.webp (the ship's-wheel card back) */
const deckFront = (id: string): string => `${DECK_URL}${id.toLowerCase()}.webp`;
const RARITY_NAMES = ['Common', 'Rare', 'Epic', 'Legendary'];

/** Captain Rhea's deck window (the ship start): five ready-made card decks, one tap gives the whole set. */
export const ShipDecks: React.FC = () => {
  const [open, setOpen] = useState(false);
  useRaf(() => { const o = shipState.open && shipState.lock; if (o !== open) setOpen(o); });   // a discrete flag, polled
  const choose = useGameStore((s) => s.chooseShipDeck);
  const count = 4 * Math.max(1, shipState.skipped), mix = deckRarityMix(count);
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="decks" className="absolute inset-0 grid place-items-center pe" style={{ zIndex: 126, background: 'radial-gradient(ellipse at center, rgba(20,60,80,.45), rgba(6,16,26,.88))' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="ship-decks">
          <motion.div className="shipdeck-panel"
            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
            <div className="text-center" style={{ color: '#fff6e0' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-title)' }}>Captain Rhea's Decks</div>
              <div style={{ fontSize: '.95rem', opacity: 0.85 }}>Pick one. All {count} cards are yours at once ({mix.map((n, i) => `${n} ${RARITY_NAMES[i]}`).join(', ')}).</div>
            </div>
            <div className="shipdeck-grid">
              {SHIP_DECKS.map((d) => {
                const c = DECK_COLOR[d.id] ?? '#6fd0e0';
                return (
                  <button key={d.id} className="shipdeck" onClick={() => choose(d.id)} data-testid={`deck-${d.id}`} style={{ ['--dc' as any]: c }}>
                    <span className="shipdeck-stack">
                      <img className="shipdeck-card back b3" src={`${DECK_URL}back.webp`} alt="" draggable={false} />
                      <img className="shipdeck-card back b2" src={`${DECK_URL}back.webp`} alt="" draggable={false} />
                      <img className="shipdeck-card front" src={deckFront(d.id)} alt="" draggable={false} />
                    </span>
                    <span className="shipdeck-front">
                      <span className="shipdeck-name">{d.name}</span>
                      <span className="shipdeck-flav">{d.flavour}</span>
                      <ul>
                        {deckRecipe(d, count).map(([n, k]) => (
                          <li key={n}><span>{n}</span><b>x{k}</b></li>
                        ))}
                      </ul>
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
