import { HelmGlyph, BagGlyph, BookGlyph, GearGlyph, SkillGlyph } from '../components/MenuGlyphs';
import { useBagAlert, useCodexAlert, useSkillAlert, useGoalsAlert } from '../lib/alerts';
import { device } from '../../engine/device';
import { toggleFullscreen } from '../layout';
import { Maximize } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { ScrollText, User, Backpack, BookOpen, Store, Settings, Crosshair, Wand2, Axe, Sword, Swords, Wind, Megaphone, Mountain, Star, Anchor, VolumeX, ShieldOff, EyeOff, Flame, Droplet, Skull, ChevronsDown, Trophy } from 'lucide-react';
import { envSlow } from '../../engine/systems/zones';
import { CoinGlyph, GemGlyph } from '../components/SkillIcons';
import { OrnateRing } from '../components/Ornate';
import { titleOf } from '../../achievements';
import { useUiStore } from '../uiStore';
import { useGameStore, calculateTotalCP } from '../../store';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';
import { HERO_COLOR } from '../lib/game';
import type { HeroClass } from '../../types';

export const HERO_ICON: Record<HeroClass, LucideIcon> = { ARCHER: Crosshair, WIZARD: Wand2, BARBARIAN: Axe, KNIGHT: Sword, NECROMANCER: Skull };

const BuffSlot: React.FC<{ id: string; icon: React.ReactNode; label: string; color: string; refs: React.MutableRefObject<Record<string, HTMLElement | null>> }> = ({ id, icon, label, color, refs }) => (
  <div ref={(el) => { refs.current[id] = el; }} className="buff-slot" data-on="0" style={{ color }} {...tip(<SimpleTip title={label} sub="Active buff" color={color} />)}>
    <span data-ic style={{ display: 'grid' }}>{icon}</span><span data-t />
  </div>
);

const DEBUFFS: { id: string; icon: React.ReactNode; color: string; label: string; body: string; get: () => number }[] = [
  { id: 'stun', icon: <Star size={14} />, color: '#ffd23a', label: 'Stunned', body: 'Cannot move, attack or use skills.', get: () => world.player.stunT },
  { id: 'root', icon: <Anchor size={14} />, color: '#c8a050', label: 'Rooted', body: 'Cannot move. Dash cleanses it.', get: () => world.player.rootT },
  { id: 'silence', icon: <VolumeX size={14} />, color: '#c084fc', label: 'Silenced', body: 'Skills and ultimate disabled. Basic attacks still work.', get: () => world.player.silenceT },
  { id: 'defdown', icon: <ShieldOff size={14} />, color: '#a855f7', label: 'Cursed', body: 'Defense reduced by 30%.', get: () => world.player.defDownT },
  { id: 'blind', icon: <EyeOff size={14} />, color: '#9ca3af', label: 'Blinded', body: 'Your vision is darkened.', get: () => world.player.blindT },
  { id: 'burn', icon: <Flame size={14} />, color: '#ff7a1a', label: 'Burning', body: 'Taking fire damage over time.', get: () => world.player.burnT },
  { id: 'poison', icon: <Skull size={14} />, color: '#84cc16', label: 'Poisoned', body: 'Taking poison damage over time.', get: () => world.player.poisonT },
  { id: 'bleed', icon: <Droplet size={14} />, color: '#ef4444', label: 'Bleeding', body: 'Taking bleed damage over time.', get: () => world.player.bleedT },
  { id: 'slow', icon: <ChevronsDown size={14} />, color: '#60a5fa', label: 'Slowed', body: 'Movement speed reduced. Dash cleanses it.', get: () => (world.player.slowT > 0 ? world.player.slowT : envSlow < 0.99 ? 0.01 : 0) },
];

/** Debuff icons with remaining-time under the HP strip (compact on phones). */
const DebuffRow: React.FC = () => {
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const last = useRef<Record<string, string>>({});
  useRaf(() => {
    for (const d of DEBUFFS) {
      const el = refs.current[d.id]; if (!el) continue;
      const v = d.get();
      const text = v > 0.05 ? v.toFixed(1) : v > 0 ? '' : '';
      const key = v > 0 ? `1${text}` : '0';
      if (last.current[d.id] === key) continue;
      last.current[d.id] = key;
      el.dataset.on = v > 0 ? '1' : '0';
      const t = el.querySelector('[data-t]'); if (t) t.textContent = text;
    }
  });
  return (
    <div className="debuff-row" data-testid="debuff-row">
      {DEBUFFS.map((d) => (
        <div key={d.id} ref={(el) => { refs.current[d.id] = el; }} className="debuff-slot" data-on="0" data-debuff={d.id} style={{ ['--dc' as any]: d.color }} {...tip(<SimpleTip title={d.label} sub="Debuff" color={d.color} body={d.body} />)}>
          <span style={{ display: 'grid' }}>{d.icon}</span><span data-t />
        </div>
      ))}
    </div>
  );
};

export const PlayerPlate: React.FC = () => {
  const hero = useGameStore((s) => s.hero);
  const title = useGameStore((s) => titleOf(s.meta.title));
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
      <div className="flex flex-col gap-[.3rem]" style={{ minWidth: '10.5rem' }}>
        <div className="rpg-title text-[1.05rem] leading-none text-[#f4e6c0]">{hero}</div>
        {title && <div className="tp-title" data-testid="hero-title">{title}</div>}
        <motion.div key={level} initial={{ scale: 1.15 }} animate={{ scale: 1 }} className="text-[.82rem] text-[#e8dcc0] flex items-center gap-2" style={{ transformOrigin: 'left' }}
          {...tip(<SimpleTip title="Combat Power" body="Total strength of your hero from stats and equipment." />)}>
          <span>Lv. {level}</span><span style={{ width: 1, height: '.8rem', background: '#8a7240' }} /><span>CP <span className="rpg-num text-white">{cp.toLocaleString()}</span></span>
        </motion.div>
        <div className="flex gap-[.35rem] mt-[.1rem]">
          <BuffSlot id="cry" refs={refs} color="#ffb04a" label="Battle Cry (+30% damage)" icon={<Megaphone size={15} />} />
          <BuffSlot id="rage" refs={refs} color="#ff6a5a" label="Rage" icon={<Swords size={15} />} />
          <BuffSlot id="whirl" refs={refs} color="#ffd27a" label="Whirlwind" icon={<Wind size={15} />} />
          <BuffSlot id="titan" refs={refs} color="#ff8a3a" label="Titan's Wrath" icon={<Mountain size={15} />} />
        </div>
        <DebuffRow />
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

const MenuBtn: React.FC<{ icon: React.ReactNode; label: string; hint: string; onClick: () => void; active?: boolean; dot?: boolean }> = ({ icon, label, hint, onClick, active, dot }) => (
  <button className={`sqbtn pe ${active ? 'is-active' : ''}`} onClick={onClick} aria-label={label} {...tip(<SimpleTip title={label} sub={`Hotkey: ${hint}`} />)}>
    {icon}{dot && <i className="red-dot" />}
  </button>
);

export const MenuButtons: React.FC = () => {
  const toggleCharacterSheet = useGameStore((s) => s.toggleCharacterSheet);
  const toggleInventory = useGameStore((s) => s.toggleInventory);
  const togglePause = useGameStore((s) => s.togglePause);
  const openCodex = useUiStore((s) => s.openCodex);
  const c = useGameStore((s) => s.isCharacterSheetOpen);
  const i = useGameStore((s) => s.isInventoryOpen);
  const openShop = useGameStore((s) => s.openSpecificShop);
  const bagDot = useBagAlert(), codexDot = useCodexAlert(), skillDot = useSkillAlert(), goalsDot = useGoalsAlert();
  return (
    <div className="flex gap-[.6rem] pb-1">
      <MenuBtn icon={<HelmGlyph />} label="Hero" hint="C" onClick={toggleCharacterSheet} active={c} />
      <MenuBtn icon={<BagGlyph />} label="Bag" hint="I" onClick={toggleInventory} active={i} dot={bagDot} />
      <MenuBtn icon={<ScrollText size={24} />} label="Quests" hint="J" onClick={() => useUiStore.getState().openQuestLog(true)} />
      <MenuBtn icon={<Trophy size={24} />} label="Achievements" hint="O" onClick={() => useUiStore.getState().openGoals(true, 'ACHIEVEMENTS')} dot={goalsDot} />
      <MenuBtn icon={<BookGlyph />} label="Codex" hint="Bestiary" onClick={() => openCodex(true)} dot={codexDot} />
      <MenuBtn icon={<GearGlyph />} label="Settings" hint="Esc" onClick={togglePause} />
    </div>
  );
};
