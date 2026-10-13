import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { create } from 'zustand';
import { Skull, ArrowUpCircle, Swords, Flame } from 'lucide-react';
import { useGameStore } from '../../store';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { useGameEvent } from '../hooks/useEvent';
import type { GameNotification } from '../../types';

// ---------------------------------------------------------------- banners
interface Banner { id: number; kind: 'wave' | 'boss' | 'elite' | 'level' | 'info'; title: string; sub?: string; ms: number; }
interface BannerState { current: Banner | null; push: (b: Omit<Banner, 'id'>) => void; clear: (id: number) => void; }
let bid = 0;
let lastKey = ''; let lastAt = 0;
export const useBannerStore = create<BannerState>((set) => ({
  current: null,
  push: (b) => {
    const key = `${b.kind}:${b.title}`;
    const now = performance.now();
    if (key === lastKey && now - lastAt < 1500) return;   // de-dupe event + notification for the same moment
    lastKey = key; lastAt = now;
    const id = ++bid;
    set({ current: { ...b, id } });
  },
  clear: (id) => set((s) => (s.current?.id === id ? { current: null } : s)),
}));

const KIND_STYLE: Record<Banner['kind'], { tone: 'red' | 'gold' | 'purple' | 'blue' | 'dark'; color: string }> = {
  wave: { tone: 'gold', color: '#ffe69a' }, boss: { tone: 'red', color: '#ff8a80' }, elite: { tone: 'purple', color: '#d9b3ff' }, level: { tone: 'blue', color: '#a8c8ff' }, info: { tone: 'dark', color: '#f6e8c8' },
};

export const Announcer: React.FC = () => {
  const cur = useBannerStore((s) => s.current);
  const clear = useBannerStore((s) => s.clear);
  const push = useBannerStore((s) => s.push);
  useGameEvent('waveStart', (e) => {
    if (e.boss) return; // boss gets its own banner on bossSpawn
    push({ kind: e.elite ? 'elite' : 'wave', title: `Wave ${e.wave}`, sub: e.elite ? 'Elite champions approach' : 'Survive the onslaught', ms: 2200 });
  });
  useGameEvent('siegeStart', () => push({ kind: 'boss', title: 'THE VILLAGE IS UNDER ATTACK!', sub: 'Defend the villagers - the shops are closing', ms: 2400 }));
  useGameEvent('fastClear', (e) => push({ kind: 'wave', title: 'FAST CLEAR!', sub: `Bonus +${e.gold} gold`, ms: 2000 }));
  useGameEvent('respiteStart', (e) => push({ kind: 'info', title: 'Respite', sub: 'Shops are open', ms: 1800 }));
  useGameEvent('pickup', (e) => {
    if (e.kind === 'ITEM' && e.name && (e.rarity === 'LEGENDARY' || e.rarity === 'MYTHIC')) push({ kind: e.rarity === 'MYTHIC' ? 'boss' : 'wave', title: e.name, sub: `${e.rarity.charAt(0) + e.rarity.slice(1).toLowerCase()} loot!`, ms: 2200 });
  });
  useGameEvent('bossSpawn', (e) => push({ kind: 'boss', title: e.name, sub: e.title, ms: 3800 }));
  useGameEvent('levelUp', (e) => push({ kind: 'level', title: 'Level Up', sub: `You reached level ${e.level}`, ms: 1800 }));
  useEffect(() => { // the siege event fires before this HUD mounts: show the banner if we are still in the cutscene
    if (world.director.phase === 'SIEGE') push({ kind: 'boss', title: 'THE VILLAGE IS UNDER ATTACK!', sub: 'Defend the villagers - the shops are closing', ms: 2400 });
  }, [push]);
  useEffect(() => {
    if (!cur) return;
    const t = setTimeout(() => clear(cur.id), cur.ms);
    return () => clearTimeout(t);
  }, [cur, clear]);

  return (
    <div className="absolute left-0 right-0 flex justify-center pointer-events-none" style={{ top: '22%', zIndex: 60 }}>
      <AnimatePresence mode="wait">
        {cur && (
          <motion.div key={cur.id} className="flex flex-col items-center"
            initial={{ scale: cur.kind === 'boss' ? 2.2 : 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0, y: -30, scale: .95 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
            {cur.kind === 'boss' && (
              <div className="absolute -z-10" style={{ width: '120vw', height: '12rem', top: '-3rem', background: 'linear-gradient(90deg, transparent, rgba(120,10,10,.75) 25%, rgba(120,10,10,.75) 75%, transparent)', filter: 'blur(2px)' }} />
            )}
            <div className="flex items-center gap-4">
              {cur.kind === 'boss' && <Skull size={44} color="#ff6b5e" style={{ filter: 'drop-shadow(0 0 12px #f00)' }} />}
              {cur.kind === 'level' && <ArrowUpCircle size={34} color="#a8c8ff" />}
              <div className="rpg-ribbon" data-tone={KIND_STYLE[cur.kind].tone} style={{ fontSize: cur.kind === 'boss' ? '2.6rem' : cur.kind === 'level' ? '1.5rem' : '2.1rem' }}>{cur.title}</div>
              {cur.kind === 'boss' && <Skull size={44} color="#ff6b5e" style={{ filter: 'drop-shadow(0 0 12px #f00)' }} />}
            </div>
            {cur.sub && <div className="rpg-title mt-3 text-lg" style={{ color: KIND_STYLE[cur.kind].color, letterSpacing: '.2em' }}>{cur.sub}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// -------------------------------------------------------- vignette layers
export const Vignettes: React.FC = () => {
  const low = useRef<HTMLDivElement>(null);
  const hit = useRef<HTMLDivElement>(null);
  const maxHp = useGameStore((s) => s.stats.maxHealth);
  const maxRef = useRef(maxHp); maxRef.current = maxHp;
  const on = useRef(false);
  useRaf(() => {
    const l = world.player.alive && world.player.hp / Math.max(1, maxRef.current) < 0.3;
    if (l !== on.current && low.current) { on.current = l; low.current.dataset.on = l ? '1' : '0'; }
  });
  useGameEvent('playerHit', () => {
    const el = hit.current; if (!el) return;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  });
  return (
    <>
      <div ref={low} className="vignette-low" data-on="0" />
      <div ref={hit} className="vignette-hit" />
    </>
  );
};

// ----------------------------------------------------------- notifications
const NOTE_MS: Record<GameNotification['type'], number> = { ITEM: 3000, WARNING: 2000, BOSS: 3500, SYSTEM: 3000 };

const NoteTimer: React.FC<{ id: string; ms: number; onDone: (id: string) => void }> = ({ id, ms, onDone }) => {
  useEffect(() => { const t = setTimeout(() => onDone(id), ms); return () => clearTimeout(t); }, [id, ms, onDone]);
  return null;
};

export const Notifications: React.FC = () => {
  const notes = useGameStore((s) => s.notifications);
  const remove = useGameStore((s) => s.removeNotification);
  const push = useBannerStore((s) => s.push);

  useEffect(() => {
    const last = notes[notes.length - 1];
    if (last && last.type === 'BOSS') push({ kind: 'boss', title: last.message, ms: 3500 });
  }, [notes, push]);

  const items = notes.filter((n) => n.type === 'ITEM');
  const warnings = notes.filter((n) => n.type === 'WARNING');
  const system = notes.filter((n) => n.type === 'SYSTEM');
  return (
    <>
      {notes.map((n) => <NoteTimer key={n.id} id={n.id} ms={NOTE_MS[n.type]} onDone={remove} />)}

      {/* loot feed: text only, no container, color coded, fades out */}
      <div className="absolute flex flex-col-reverse gap-[.2rem] items-start pointer-events-none" style={{ left: '1.2rem', bottom: '10.5rem', maxWidth: '20rem', zIndex: 20 }}>
        <AnimatePresence initial={false}>
          {items.slice(-6).reverse().map((n) => (
            <motion.div key={n.id} layout initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ opacity: 0, x: -10 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="flex items-center gap-2 pointer-events-none">
              <span className="font-bold text-[.9rem] text-outline" style={{ color: n.color }}>{n.message}</span>
              {n.action && (
                <button className="rpg-btn rpg-btn-green rpg-btn-sm pe" style={{ minHeight: '1.4rem', padding: '.05rem .5rem', fontSize: '.6rem' }}
                  onClick={() => { n.action!.onClick(); remove(n.id); }}>{n.action.label}</button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* warnings */}
      <div className="absolute left-0 right-0 flex flex-col items-center gap-1 pointer-events-none" style={{ top: '7.5rem', zIndex: 70 }}>
        <AnimatePresence>
          {warnings.map((n) => (
            <motion.div key={n.id} initial={{ y: -30, opacity: 0, scale: .6 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -20, opacity: 0, scale: .8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className="rpg-title text-[2rem]" style={{ color: '#ff6b5e', WebkitTextStroke: '1px #2a0505', textShadow: '0 3px 0 #4a0d0d, 0 0 18px rgba(255,60,40,.7)' }}>
              {n.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* system toasts */}
      <div className="absolute left-0 right-0 flex flex-col items-center gap-2 pointer-events-none" style={{ top: '10.5rem', zIndex: 65 }}>
        <AnimatePresence>
          {system.map((n) => (
            <motion.div key={n.id} initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }} className="rpg-panel slim flat-shadow px-4 py-1.5 flex items-center gap-2 pe">
              <Flame size={14} style={{ color: n.color }} />
              <span className="font-semibold text-sm">{n.message}</span>
              {n.action && <button className="rpg-btn rpg-btn-sm" onClick={() => { n.action!.onClick(); remove(n.id); }}>{n.action.label}</button>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
};
export { Swords };
