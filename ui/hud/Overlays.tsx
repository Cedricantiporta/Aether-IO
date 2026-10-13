import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { create } from 'zustand';
import { Flame } from 'lucide-react';
import { useGameStore } from '../../store';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { useGameEvent } from '../hooks/useEvent';
import type { GameNotification } from '../../types';
import { feel } from '../../engine/game';
import { biomeOf } from '../../engine/roomDefs';

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

const KIND_STYLE: Record<Banner['kind'], { bg: string; color: string }> = {
  wave: { bg: 'rgba(15,18,28,.72)', color: '#ffd98a' }, boss: { bg: 'rgba(110,20,24,.78)', color: '#ffb3aa' }, elite: { bg: 'rgba(60,30,100,.75)', color: '#dcc3ff' },
  level: { bg: 'rgba(24,50,100,.75)', color: '#bcd6ff' }, info: { bg: 'rgba(15,18,28,.72)', color: '#f3f1ea' },
};

export const Announcer: React.FC = () => {
  const cur = useBannerStore((s) => s.current);
  const clear = useBannerStore((s) => s.clear);
  const push = useBannerStore((s) => s.push);
  useGameEvent('roomEnter', (e) => {
    if (e.boss) return; // the boss gets its own banner on bossSpawn
    if (e.index === 0) push({ kind: 'wave', title: e.name, sub: e.biome >= 6 ? 'The cycle begins anew... harder' : 'Biome ' + (e.biome % 6 + 1), ms: 2400 });
    else if (e.type === 'ELITE') push({ kind: 'elite', title: 'Elite Hunt', sub: 'Champions guard this room', ms: 2000 });
    else if (e.type === 'SHRINE') push({ kind: 'elite', title: 'Shrine', sub: 'Touch the altar for a challenge - or leave', ms: 2200 });
    else if (e.type === 'TREASURE') push({ kind: 'info', title: 'Treasure', sub: 'Defeat the guards to unlock the chest', ms: 2000 });
    else if (e.type === 'FOUNTAIN') push({ kind: 'info', title: 'Healing Fountain', sub: 'A quiet moment', ms: 1800 });
    else if (e.type === 'MERCHANT') push({ kind: 'info', title: 'Travelling Merchant', sub: 'Spend your gold', ms: 1800 });
  });
  useEffect(() => { // the first roomEnter fires inside startRun, before this HUD mounts
    const r = world.room;
    if (r.active && r.index === 0 && r.biome === 0 && world.director.phaseT < 1) push({ kind: 'wave', title: biomeOf(0).name, sub: 'Biome 1', ms: 2400 });
  }, [push]);
  useGameEvent('pickup', (e) => {
    if (e.kind === 'ITEM' && e.name && (e.rarity === 'LEGENDARY' || e.rarity === 'MYTHIC')) push({ kind: e.rarity === 'MYTHIC' ? 'boss' : 'wave', title: e.name, sub: `${e.rarity.charAt(0) + e.rarity.slice(1).toLowerCase()} loot!`, ms: 2200 });
  });
  useGameEvent('bossSpawn', (e) => push({ kind: 'boss', title: e.name, sub: e.title, ms: 3800 }));
  useGameEvent('levelUp', (e) => push({ kind: 'level', title: 'Level Up', sub: `You reached level ${e.level}`, ms: 1800 }));
  useEffect(() => {
    if (!cur) return;
    const t = setTimeout(() => clear(cur.id), cur.ms);
    return () => clearTimeout(t);
  }, [cur, clear]);

  return (
    <div className="absolute left-0 right-0 flex justify-center pointer-events-none" style={{ top: '24%', zIndex: 60 }}>
      <AnimatePresence mode="wait">
        {cur && (
          <motion.div key={cur.id} className="banner" style={{ ['--bt' as any]: KIND_STYLE[cur.kind].bg, ['--bc' as any]: KIND_STYLE[cur.kind].color }}
            initial={{ scale: cur.kind === 'boss' ? 1.6 : 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0, y: -16 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
            <div className="bt">{cur.title}</div>
            {cur.sub && <div className="bs">{cur.sub}</div>}
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
  const gold = useRef<HTMLDivElement>(null);
  const hurt = useRef<HTMLDivElement>(null);
  const lastG = useRef(-1), lastH = useRef(-1);
  useRaf(() => {
    const g = Math.round(feel.gold * 30) / 30, h = Math.round(feel.hurt * 30) / 30;
    if (g !== lastG.current && gold.current) { lastG.current = g; gold.current.style.opacity = String(g * 0.55); }
    if (h !== lastH.current && hurt.current) {
      lastH.current = h;
      const e = hurt.current.style;
      e.opacity = String(h);
      e.boxShadow = `inset 0 0 140px 30px rgba(255,20,40,${0.55 * h}), inset 7px 0 50px rgba(0,255,255,${0.35 * h}), inset -7px 0 50px rgba(255,0,60,${0.35 * h})`;
    }
  });
  useGameEvent('playerHit', () => {
    const el = hit.current; if (!el) return;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  });
  return (
    <>
      <div ref={low} className="vignette-low" data-on="0" />
      <div ref={hit} className="vignette-hit" />
      <div ref={hurt} className="absolute inset-0 pointer-events-none" style={{ opacity: 0, zIndex: 9 }} />
      <div ref={gold} className="absolute inset-0 pointer-events-none" style={{ opacity: 0, zIndex: 9, background: 'radial-gradient(ellipse at center, rgba(255,230,140,0) 30%, rgba(255,200,60,.75) 100%)', mixBlendMode: 'screen' }} />
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

      {/* pickup feed: small fading rows on the left */}
      <div className="hud-feed" style={{ flexDirection: 'column-reverse', justifyContent: 'flex-end' }}>
        <AnimatePresence initial={false}>
          {items.slice(-4).reverse().map((n) => (
            <motion.div key={n.id} layout initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="feed-row">
              <i className="bar" style={{ background: n.color }} />
              <span className="truncate">{n.message}</span>
              {n.action && (
                <button className="rpg-btn rpg-btn-green rpg-btn-sm pe" style={{ minHeight: 28, padding: '0 .6rem', fontSize: 12 }}
                  onClick={() => { n.action!.onClick(); remove(n.id); }}>{n.action.label}</button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* warnings */}
      <div className="absolute left-0 right-0 flex flex-col items-center gap-1 pointer-events-none" style={{ top: '34%', zIndex: 70 }}>
        <AnimatePresence>
          {warnings.map((n) => (
            <motion.div key={n.id} initial={{ y: -20, opacity: 0, scale: .8 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -12, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 26 }}
              className="text-xl font-extrabold" style={{ color: '#ff8a82', textShadow: '0 2px 10px rgba(0,0,0,.7)' }}>
              {n.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* system toasts */}
      <div className="absolute left-0 right-0 flex flex-col items-center gap-2 pointer-events-none" style={{ top: 'calc(var(--sat) + 110px)', zIndex: 65 }}>
        <AnimatePresence>
          {system.map((n) => (
            <motion.div key={n.id} initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} className="cap-pill pe">
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
