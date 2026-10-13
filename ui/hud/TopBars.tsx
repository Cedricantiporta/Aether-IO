import React, { useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Coins, Gem, User, Backpack, BookOpen, Pause, Crosshair, Wand2, Axe, Swords, Wind, Heart } from 'lucide-react';
import { useGameStore, calculateTotalCP } from '../../store';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';
import { HERO_COLOR } from '../lib/game';
import type { HeroClass } from '../../types';

export const HERO_ICON: Record<HeroClass, LucideIcon> = { ARCHER: Crosshair, WIZARD: Wand2, BARBARIAN: Axe };

const Buff: React.FC<{ id: string; icon: React.ReactNode; label: string; color: string; refs: React.MutableRefObject<Record<string, HTMLElement | null>> }> = ({ id, icon, label, color, refs }) => (
  <div ref={(el) => { refs.current[id] = el; }} className="rpg-frame gold items-center gap-1 px-1.5 py-[2px]" style={{ display: 'none', color }} {...tip(<SimpleTip title={label} sub="Active buff" color={color} />)}>
    {icon}<span data-t className="rpg-num text-[.7rem] text-white" />
  </div>
);

export const PlayerPlate: React.FC = () => {
  const hero = useGameStore((s) => s.hero);
  const level = useGameStore((s) => s.level);
  const cp = useGameStore((s) => calculateTotalCP(s.stats));
  const Icon = HERO_ICON[hero];
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const last = useRef<Record<string, string>>({});
  useRaf(() => {
    const p = world.player;
    const vals: Record<string, number> = { rage: p.rageT, sprint: p.sprintT, vitality: p.vitalityT };
    for (const k in vals) {
      const el = refs.current[k]; if (!el) continue;
      const v = vals[k];
      const text = v > 0 ? v.toFixed(1) : '';
      if (last.current[k] === text) continue;
      last.current[k] = text;
      el.style.display = v > 0 ? 'flex' : 'none';
      const t = el.querySelector('[data-t]'); if (t) t.textContent = text;
    }
  });
  return (
    <div className="flex items-start gap-2 pe">
      <div className="rpg-medallion" style={{ width: '4.4rem', height: '4.4rem', ['--mc' as any]: HERO_COLOR[hero] }}>
        <Icon size={30} />
        <motion.div key={level} initial={{ scale: 1.7 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 12 }}
          className="rpg-badge absolute -bottom-2 left-1/2 -translate-x-1/2 !text-[.75rem]">Lv {level}</motion.div>
      </div>
      <div className="flex flex-col gap-1 pt-1">
        <div className="rpg-title text-base leading-none">{hero}</div>
        <div className="rpg-badge !normal-case self-start" {...tip(<SimpleTip title="Combat Power" body="Total strength of your hero from stats and equipment." />)}>
          <Swords size={11} /> CP <span className="rpg-num text-white">{cp.toLocaleString()}</span>
        </div>
        <div className="flex gap-1">
          <Buff id="rage" refs={refs} color="#ff6a5a" label="Rage" icon={<Swords size={13} />} />
          <Buff id="sprint" refs={refs} color="#6ee7a0" label="Wind Sprint" icon={<Wind size={13} />} />
          <Buff id="vitality" refs={refs} color="#ff8a8a" label="War Vitality" icon={<Heart size={13} />} />
        </div>
      </div>
    </div>
  );
};

const Counter: React.FC<{ icon: React.ReactNode; value: number; label: string; color: string }> = ({ icon, value, label, color }) => {
  const el = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const e = el.current; if (!e) return;
    e.classList.remove('num-pop'); void e.offsetWidth; e.classList.add('num-pop');
  }, [value]);
  return (
    <div className="rpg-frame gold flex items-center gap-2 pr-3 pl-1 py-1 pe" style={{ minWidth: '7rem' }} {...tip(<SimpleTip title={label} />)}>
      <div className="rpg-medallion" style={{ width: '1.9rem', height: '1.9rem', ['--mc' as any]: color }}>{icon}</div>
      <span ref={el} className="rpg-num text-base text-[var(--gold-light)] text-outline ml-auto">{value.toLocaleString()}</span>
    </div>
  );
};

export const Currency: React.FC = () => {
  const gold = useGameStore((s) => s.gold);
  const gems = useGameStore((s) => s.gems);
  return (
    <div className="flex flex-col gap-2 items-end">
      <Counter icon={<Coins size={15} />} value={gold} label="Gold" color="#d9a23a" />
      <Counter icon={<Gem size={15} />} value={gems} label="Gems" color="#22b88a" />
    </div>
  );
};

const MenuBtn: React.FC<{ icon: React.ReactNode; label: string; hint: string; onClick: () => void; active?: boolean }> = ({ icon, label, hint, onClick, active }) => (
  <button className={`rpg-btn rpg-btn-icon pe ${active ? 'is-active' : ''}`} onClick={onClick} aria-label={label} {...tip(<SimpleTip title={label} sub={`Hotkey: ${hint}`} />)}>
    {icon}
    <span className="rpg-key" style={{ top: 'auto', bottom: '-.55rem' }}>{hint}</span>
  </button>
);

export const MenuButtons: React.FC = () => {
  const toggleCharacterSheet = useGameStore((s) => s.toggleCharacterSheet);
  const toggleInventory = useGameStore((s) => s.toggleInventory);
  const openSpecificShop = useGameStore((s) => s.openSpecificShop);
  const togglePause = useGameStore((s) => s.togglePause);
  const c = useGameStore((s) => s.isCharacterSheetOpen);
  const i = useGameStore((s) => s.isInventoryOpen);
  const sh = useGameStore((s) => s.isShopOpen && s.activeShopTab === 'SKILLS');
  const skillPoints = useGameStore((s) => s.skillPoints);
  return (
    <div className="flex gap-2 pb-3">
      <MenuBtn icon={<User size={20} />} label="Hero" hint="C" onClick={toggleCharacterSheet} active={c} />
      <MenuBtn icon={<Backpack size={20} />} label="Bag" hint="I" onClick={toggleInventory} active={i} />
      <div className="relative">
        <MenuBtn icon={<BookOpen size={20} />} label="Skills" hint="K" onClick={() => openSpecificShop('SKILLS')} active={sh} />
        {skillPoints > 0 && <span className="slot-plus" style={{ left: 'auto', right: '-.3rem', top: '-.35rem', zIndex: 8 }}>{skillPoints}</span>}
      </div>
      <MenuBtn icon={<Pause size={20} />} label="Pause" hint="Esc" onClick={togglePause} />
    </div>
  );
};
