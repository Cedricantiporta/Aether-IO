import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Skull, Sparkles } from '../components/GoldIcons';
import { ankhOffer, reviveWithAnkh } from '../../engine/systems/combat';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { Button } from '../components/Button';

/** Death with an Ankh of Life ready: choose to rise again (consumes it, 15 min cooldown) or fall. */
export const AnkhPrompt: React.FC = () => {
  const [open, setOpen] = useState(false);
  useRaf(() => { if (ankhOffer.open !== open) setOpen(ankhOffer.open); });   // a discrete flag, polled (no per-frame setState unless it flips)
  const use = () => { if (!reviveWithAnkh()) { ankhOffer.declined = true; ankhOffer.open = false; } setOpen(false); };
  const down = open && world.player.downed;   // co-op: down, not dead: the choice is the Ankh now or waiting for my friend
  const fall = () => { ankhOffer.declined = true; ankhOffer.open = false; setOpen(false); };
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="ankh" className="absolute inset-0 grid place-items-center pe" style={{ zIndex: 125, background: 'radial-gradient(ellipse at center, rgba(60,40,5,.35), rgba(5,0,0,.85))' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="ankh-prompt">
          <motion.div className="rpg-frame text-center" style={{ width: 'min(28rem, 92vw)', padding: '1.6rem 1.4rem 1.2rem' }}
            initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
            <div style={{ fontSize: '3.2rem', lineHeight: 1, color: '#ffd76a', textShadow: '0 0 18px #ffb020, 0 0 36px #ff8a00' }}>&#9765;</div>
            <div className="rpg-title mt-2" style={{ fontSize: '1.5rem', color: '#ffe7a0' }}>{down ? 'You are down' : 'You have fallen'}</div>
            <div className="rpg-label mt-2 !normal-case" style={{ color: '#d9c9a8', letterSpacing: '.02em' }}>{down ? 'Your friend can revive you if he stands next to you for 3 seconds. Or use the Ankh of Life in your pack to rise right now with half your health?' : 'The Ankh of Life in your pack hums with light. Use it to rise again with half your health?'}</div>
            <div className="flex gap-3 mt-5">
              <Button className="flex-1 whitespace-nowrap" variant="primary" size="lg" pulse onClick={use} data-testid="ankh-use"><Sparkles size={18} /> Rise Again</Button>
              <Button className="flex-1 whitespace-nowrap" variant="danger" size="lg" onClick={fall} data-testid="ankh-decline"><Skull size={18} /> {down ? 'Wait for my friend' : 'Give up'}</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
