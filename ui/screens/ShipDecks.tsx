import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRaf } from '../hooks/useRaf';
import { shipState } from '../../engine/runMods';
import { SHIP_DECKS, deckRecipe, deckRarityMix } from '../../engine/runCards';
import { useGameStore } from '../../store';

const DECK_COLOR: Record<string, string> = { OFFENSE: '#ff8a6a', DEFENSE: '#6fb7ff', BALANCED: '#8fd96a', STRATEGIST: '#b99bff', RESOURCEFUL: '#ffcf5a' };
const DECK_EMOJI: Record<string, string> = { OFFENSE: '⚔️', DEFENSE: '🛡️', BALANCED: '⚖️', STRATEGIST: '✨', RESOURCEFUL: '🧪' };
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
          <motion.div style={{ width: 'min(60rem, 96vw)', maxHeight: '94vh', overflowY: 'auto', padding: '1rem', borderRadius: 28, background: 'linear-gradient(#fff7e4,#fdeccb)', border: '4px solid #6fd0e0', boxShadow: '0 10px 0 #3a8fa0, 0 18px 40px rgba(0,0,0,.45)' }}
            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
            <div className="text-center" style={{ color: '#3b5a66' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>Captain Rhea's Decks</div>
              <div style={{ fontSize: '.95rem', opacity: 0.85 }}>Pick one. All {count} cards are yours at once ({mix.map((n, i) => `${n} ${RARITY_NAMES[i]}`).join(', ')}).</div>
            </div>
            <div className="mt-3" style={{ display: 'grid', gap: '.7rem', gridTemplateColumns: 'repeat(auto-fit, minmax(10.5rem, 1fr))' }}>
              {SHIP_DECKS.map((d) => {
                const c = DECK_COLOR[d.id] ?? '#6fd0e0';
                return (
                  <button key={d.id} onClick={() => choose(d.id)} data-testid={`deck-${d.id}`}
                    style={{ textAlign: 'left', padding: '.7rem .75rem', borderRadius: 20, background: '#fffdf6', border: `3px solid ${c}`, boxShadow: `0 5px 0 ${c}`, color: '#3b3a36', cursor: 'pointer' }}>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800 }}><span style={{ marginRight: 6 }}>{DECK_EMOJI[d.id]}</span>{d.name}</div>
                    <div style={{ fontSize: '.78rem', fontStyle: 'italic', margin: '.15rem 0 .45rem', color: '#6b665b' }}>{d.flavour}</div>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: '.85rem', lineHeight: 1.45 }}>
                      {deckRecipe(d, count).map(([n, k]) => (
                        <li key={n} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{n}</span><b style={{ color: '#5a5448' }}>x{k}</b></li>
                      ))}
                    </ul>
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
