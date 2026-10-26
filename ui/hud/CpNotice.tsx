// (owner 2026-10-26) Combat power change notice: whenever the hero's combat power goes up or down (gear, talents, pets, cards ...)
// a small pill pops above the skill bar: "10,232 > 23,772" with a green up / red down arrow. Changes within 400 ms are merged
// (Auto equip, a talent reset) so one action shows one notice from the first old value to the final one.
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore, calculateTotalCP } from '../../store';

interface Shown { from: number; to: number; key: number }

export const CpNotice: React.FC = () => {
  const cp = useGameStore((s) => Math.round(calculateTotalCP(s.stats)));
  const hero = useGameStore((s) => s.hero);   // switching characters is not a power change
  const heroRef = useRef(hero);
  const last = useRef<number | null>(null), base = useRef<number | null>(null);
  const merge = useRef<ReturnType<typeof setTimeout> | null>(null), hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    if (last.current === null || heroRef.current !== hero) { heroRef.current = hero; last.current = cp; base.current = null; return; }   // first value after load / a character switch: no notice
    if (cp === last.current) return;
    if (base.current === null) base.current = last.current;
    last.current = cp;
    if (merge.current) clearTimeout(merge.current);
    merge.current = setTimeout(() => {
      const from = base.current ?? cp; base.current = null;
      if (from === cp) return;
      setShown({ from, to: cp, key: Date.now() });
      if (hide.current) clearTimeout(hide.current);
      hide.current = setTimeout(() => setShown(null), 2600);
    }, 400);
  }, [cp, hero]);
  useEffect(() => () => { if (merge.current) clearTimeout(merge.current); if (hide.current) clearTimeout(hide.current); }, []);

  const up = shown ? shown.to > shown.from : true;
  return (
    <div className="absolute left-0 right-0 flex justify-center pointer-events-none" style={{ bottom: '8.2rem', zIndex: 4 }}>
      <AnimatePresence>
        {shown && (
          <motion.div key={shown.key} className="cp-notice" data-testid="cp-notice"
            initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
            <span className="cp-lbl">CP</span>
            <span className="cp-from">{shown.from.toLocaleString()}</span>
            <span className="cp-sep">›</span>
            <b className={up ? 'cp-up' : 'cp-down'}>{shown.to.toLocaleString()} {up ? '▲' : '▼'}</b>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
