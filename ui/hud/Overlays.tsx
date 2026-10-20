import { runInfo } from '../../engine/runMods';
import { towerState } from '../../engine/systems/director';
import { climbTitle, climbFloor } from '../../dailyChallenge';
import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { create } from 'zustand';
import { Skull, ArrowUpCircle, Swords } from '../components/GoldIcons';
import { useGameStore } from '../../store';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { useGameEvent } from '../hooks/useEvent';
import type { GameNotification } from '../../types';
import { feel } from '../../engine/game';
import { biomeOf, BIOMES } from '../../engine/roomDefs';
import { questBanner } from './QuestBanner';

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
  useGameEvent('roomEnter', (e) => {
    if (e.boss) return; // the boss gets its own banner on bossSpawn
    if (runInfo.mode === 'TOWER') { push({ kind: 'wave', title: climbTitle(), sub: climbFloor(towerState.floor), ms: 1800 }); return; }
    if (e.index === 0) push({ kind: 'wave', title: e.name, sub: e.biome >= BIOMES.length ? 'The cycle begins anew... harder' : 'Biome ' + (e.biome % BIOMES.length + 1), ms: 2400 });
    else if (e.type === 'ELITE') push({ kind: 'elite', title: 'Elite Hunt', sub: 'Champions guard this room', ms: 2000 });
    else if (e.type === 'SHRINE') push({ kind: 'elite', title: 'Shrine', sub: 'Touch the altar for a challenge - or leave', ms: 2200 });
    else if (e.type === 'TREASURE') push({ kind: 'info', title: 'Treasure', sub: 'Defeat the guards to unlock the chest', ms: 2000 });
    else if (e.type === 'FOUNTAIN') push({ kind: 'info', title: 'Healing Fountain', sub: 'A quiet moment', ms: 1800 });
    else if (e.type === 'MERCHANT') push({ kind: 'info', title: 'Travelling Merchant', sub: 'Spend your gold', ms: 1800 });
  });
  useEffect(() => { // the first roomEnter fires inside startRun, before this HUD mounts
    const r = world.room;
    if (r.active && runInfo.mode === 'TOWER' && world.director.phaseT < 1) push({ kind: 'wave', title: climbTitle(), sub: climbFloor(towerState.floor), ms: 2400 });
    else if (r.active && r.index === 0 && r.biome === 0 && world.director.phaseT < 1) push({ kind: 'wave', title: biomeOf(0).name, sub: 'Biome 1', ms: 2400 });
  }, [push]);
  useGameEvent('pickup', (e) => {
    if (e.kind === 'ITEM' && e.name && (e.rarity === 'LEGENDARY' || e.rarity === 'MYTHIC')) push({ kind: e.rarity === 'MYTHIC' ? 'boss' : 'wave', title: e.name, sub: `${e.rarity.charAt(0) + e.rarity.slice(1).toLowerCase()} loot!`, ms: 2200 });
  });
  useGameEvent('bossSpawn', (e) => push({ kind: 'boss', title: e.name, sub: e.title, ms: 3800 }));
  // level ups: LevelUpBurst (golden ring + stat gains)
  useEffect(() => {
    if (!cur) return;
    const t = setTimeout(() => clear(cur.id), cur.ms);
    return () => clearTimeout(t);
  }, [cur, clear]);

  return (
    <div className="absolute left-0 right-0 flex justify-center pointer-events-none" style={{ top: cur?.kind === 'boss' ? '15%' : '22%', zIndex: 60 }}>
      <AnimatePresence mode="wait">
        {cur && (
          <motion.div key={cur.id} className="flex flex-col items-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}>{/* banners fade in place: no sliding / scaling over the fight */}
            {cur.kind === 'boss' && (
              <div className="absolute -z-10" style={{ width: '72vw', height: '5.4rem', top: '-1.1rem', background: 'linear-gradient(90deg, transparent, rgba(110,10,10,.55) 22%, rgba(110,10,10,.55) 78%, transparent)', filter: 'blur(2px)' }} />
            )}
            <div className="flex items-center gap-4">
              {cur.kind === 'boss' && <Skull size={26} color="#ff6b5e" style={{ filter: 'drop-shadow(0 0 8px #f00)' }} />}
              {cur.kind === 'level' && <ArrowUpCircle size={34} color="#a8c8ff" />}
              <div className="k-title" data-tone={KIND_STYLE[cur.kind].tone} style={{ letterSpacing: cur.kind === 'boss' ? '.08em' : undefined, fontSize: cur.kind === 'boss' ? (cur.title.length > 22 ? '1.35rem' : '1.9rem') : cur.kind === 'level' ? '1.7rem' : '2.5rem' }}><i /><span>{cur.title}</span><i /></div>
              {cur.kind === 'boss' && <Skull size={26} color="#ff6b5e" style={{ filter: 'drop-shadow(0 0 8px #f00)' }} />}
            </div>
            {cur.sub && <div className="k-sub">{cur.sub}</div>}
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

  useEffect(() => {   // quest accepted: the wide quest banner replaces the toast
    const last = notes[notes.length - 1];
    const m = last && last.type === 'SYSTEM' ? /^Quest accepted: (.+)$/.exec(last.message) : null;
    if (m) { questBanner('side', m[1], 'accepted'); remove(last.id); }
  }, [notes, remove]);

  const items = notes.filter((n) => n.type === 'ITEM');
  const warnings = notes.filter((n) => n.type === 'WARNING');
  const system = notes.filter((n) => n.type === 'SYSTEM');
  return (
    <>
      {notes.map((n) => <NoteTimer key={n.id} id={n.id} ms={n.action ? 9000 : NOTE_MS[n.type]} onDone={remove} />)}{/* equip suggestions stay 9 s */}

      {/* loot feed: text only, no container, color coded, fades out */}
      <div className="absolute flex flex-col-reverse gap-[.2rem] items-start pointer-events-none" style={{ left: '1.2rem', bottom: '12.6rem', maxWidth: '20rem', zIndex: 20 }}>
        <AnimatePresence initial={false}>
          {items.slice(-6).reverse().map((n) => (
            <motion.div key={n.id} layout initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ opacity: 0, x: -10 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="toast-pill pointer-events-none">
              <i className="toast-dot" style={{ background: n.color }} />
              <span>{n.message}</span>
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
              className="toast-pill warn">
              <i className="toast-dot" style={{ background: '#ff7b72' }} />
              <span>{n.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* system toasts */}
      <div className="absolute left-0 right-0 flex flex-col items-center gap-2 pointer-events-none" style={{ top: '10.5rem', zIndex: 65 }}>
        <AnimatePresence>
          {system.map((n) => (
            <motion.div key={n.id} initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }} className="toast-pill pe">
              <i className="toast-dot" style={{ background: n.color }} />
              <span>{n.message}</span>
              {n.action && <button className="rpg-btn rpg-btn-sm" onClick={() => { n.action!.onClick(); remove(n.id); }}>{n.action.label}</button>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
};
export { Swords };
