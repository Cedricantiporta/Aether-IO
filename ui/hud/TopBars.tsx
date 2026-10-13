import { device } from '../../engine/device';
import { toggleFullscreen } from '../layout';
import { Maximize } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { User, Backpack, BookOpen, Store, Settings, Crosshair, Wand2, Axe, Swords, Wind, Megaphone, Mountain } from 'lucide-react';
import { CoinGlyph, GemGlyph } from '../components/SkillIcons';
import { OrnateRing } from '../components/Ornate';
import { useUiStore } from '../uiStore';
import { useGameStore, calculateTotalCP } from '../../store';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';
import { HERO_COLOR } from '../lib/game';
import type { HeroClass } from '../../types';

export const HERO_ICON: Record<HeroClass, LucideIcon> = { ARCHER: Crosshair, WIZARD: Wand2, BARBARIAN: Axe };

const BuffSlot: React.FC<{ id: string; icon: React.ReactNode; label: string; color: string; refs: React.MutableRefObject<Record<string, HTMLElement | null>> }> = ({ id, icon, label, color, refs }) => (
  <div ref={(el) => { refs.current[id] = el; }} className="buff-slot" data-on="0" style={{ color }} {...tip(<SimpleTip title={label} sub="Active buff" color={color} />)}>
    <span data-ic style={{ display: 'grid' }}>{icon}</span><span data-t />
  </div>
);

export const PlayerPlate: React.FC = () => {
  const hero = useGameStore((s) => s.hero);
  const level = useGameStore((s) => s.level);
  const cp = useGameStore((s) => calculateTotalCP(s.stats));
  const maxHp = useGameStore((s) => s.stats.maxHealth);
  const maxRef = useRef(maxHp); maxRef.current = maxHp;
  const Icon = HERO_ICON[hero];
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const hpEl = useRef<HTMLDivElement>(null);
  const last = useRef<Record<string, string>>({});
  useRaf(() => {
    const p = world.player;
    const f = (Math.min(1, Math.max(0, p.hp / Math.max(1, maxRef.current)))).toFixed(3);
    if (hpEl.current && last.current.hp !== f) { last.current.hp = f; hpEl.current.style.setProperty('--fill', f); }
    const vals: Record<string, number> = { cry: p.cryT, rage: p.rageT, whirl: p.whirlT, titan: p.titanT };
    for (const k in vals) {
      const el = refs.current[k]; if (!el) continue;
      const v = vals[k];
      const text = v > 0 ? v.toFixed(1) : '';
      if (last.current[k] === text) continue;
      last.current[k] = text;
      el.dataset.on = v > 0 ? '1' : '0';
      const t = el.querySelector('[data-t]'); if (t) t.textContent = text;
    }
  });
  return (
    <div className="pplate pe">
      <div className="relative" style={{ width: '5.4rem', height: '5.4rem', flex: 'none', marginLeft: '-.2rem' }}>
        <div className="absolute grid place-items-center rounded-full" style={{ inset: '15%', background: `radial-gradient(circle at 40% 30%, ${HERO_COLOR[hero]}, #2a0c0c 80%)`, color: '#fff4d0' }}>
          <Icon size={30} strokeWidth={2.2} style={{ filter: 'drop-shadow(0 2px 2px #000)' }} />
        </div>
        <OrnateRing id="pp" spikes={6} />
      </div>
      <div className="flex flex-col gap-[.3rem]" style={{ minWidth: '10.5rem' }}>
        <div className="rpg-title text-[1.05rem] leading-none text-[#f4e6c0]">{hero}</div>
        <motion.div key={level} initial={{ scale: 1.15 }} animate={{ scale: 1 }} className="text-[.82rem] text-[#e8dcc0] flex items-center gap-2" style={{ transformOrigin: 'left' }}
          {...tip(<SimpleTip title="Combat Power" body="Total strength of your hero from stats and equipment." />)}>
          <span>Lv. {level}</span><span style={{ width: 1, height: '.8rem', background: '#8a7240' }} /><span>CP <span className="rpg-num text-white">{cp.toLocaleString()}</span></span>
        </motion.div>
        <div ref={hpEl} className="hp-strip"><i /></div>
        <div className="flex gap-[.35rem] mt-[.1rem]">
          <BuffSlot id="cry" refs={refs} color="#ffb04a" label="Battle Cry (+30% damage)" icon={<Megaphone size={15} />} />
          <BuffSlot id="rage" refs={refs} color="#ff6a5a" label="Rage" icon={<Swords size={15} />} />
          <BuffSlot id="whirl" refs={refs} color="#ffd27a" label="Whirlwind" icon={<Wind size={15} />} />
          <BuffSlot id="titan" refs={refs} color="#ff8a3a" label="Titan's Wrath" icon={<Mountain size={15} />} />
        </div>
      </div>
    </div>
  );
};

const Counter: React.FC<{ icon: React.ReactNode; value: number; label: string}> = ({ icon, value, label }) => {
  const el = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const e = el.current; if (!e) return;
    e.classList.remove('num-pop'); void e.offsetWidth; e.classList.add('num-pop');
  }, [value]);
  return (
    <div className="cpill pe" {...tip(<SimpleTip title={label} />)}>
      {icon}
      <span ref={el} className="val">{value.toLocaleString()}</span>
          </div>
  );
};

export const Currency: React.FC = () => {
  const gold = useGameStore((s) => s.gold);
  const gems = useGameStore((s) => s.gems);
  return (
    <div className="flex gap-3 items-center">
      <Counter icon={<CoinGlyph size={30} />} value={gold} label="Gold" />
      <Counter icon={<GemGlyph size={30} />} value={gems} label="Gems" />
    </div>
  );
};

const MenuBtn: React.FC<{ icon: React.ReactNode; label: string; hint: string; onClick: () => void; active?: boolean }> = ({ icon, label, hint, onClick, active }) => (
  <button className={`sqbtn pe ${active ? 'is-active' : ''}`} onClick={onClick} aria-label={label} {...tip(<SimpleTip title={label} sub={`Hotkey: ${hint}`} />)}>
    {icon}
  </button>
);

export const MenuButtons: React.FC = () => {
  const toggleCharacterSheet = useGameStore((s) => s.toggleCharacterSheet);
  const toggleInventory = useGameStore((s) => s.toggleInventory);
  const togglePause = useGameStore((s) => s.togglePause);
  const openCodex = useUiStore((s) => s.openCodex);
  const c = useGameStore((s) => s.isCharacterSheetOpen);
  const i = useGameStore((s) => s.isInventoryOpen);
  return (
    <div className="flex gap-[.6rem] pb-1">
      <MenuBtn icon={<User size={24} />} label="Hero" hint="C" onClick={toggleCharacterSheet} active={c} />
      <MenuBtn icon={<Backpack size={24} />} label="Bag" hint="I" onClick={toggleInventory} active={i} />
      <MenuBtn icon={<BookOpen size={24} />} label="Codex" hint="Bestiary" onClick={() => openCodex(true)} />
      <MenuBtn icon={<Settings size={24} />} label="Settings" hint="Esc" onClick={togglePause} />
      {device.fullscreenOk && <MenuBtn icon={<Maximize size={24} />} label="Fullscreen" hint="F11" onClick={() => { void toggleFullscreen(); }} />}
    </div>
  );
};
