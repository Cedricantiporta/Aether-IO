import React, { useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { User, Backpack, Menu, Crosshair, Wand2, Axe, Swords, Wind, Megaphone, Mountain, Star, Anchor, VolumeX, ShieldOff, EyeOff, Flame, Droplet, Skull, ChevronsDown } from 'lucide-react';
import { envSlow } from '../../engine/systems/zones';
import { CoinGlyph, GemGlyph } from '../components/SkillIcons';
import { useGameStore } from '../../store';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';
import { HERO_COLOR } from '../lib/game';
import type { HeroClass } from '../../types';

export const HERO_ICON: Record<HeroClass, LucideIcon> = { ARCHER: Crosshair, WIZARD: Wand2, BARBARIAN: Axe };

const BuffSlot: React.FC<{ id: string; icon: React.ReactNode; label: string; color: string; refs: React.MutableRefObject<Record<string, HTMLElement | null>> }> = ({ id, icon, label, color, refs }) => (
  <div ref={(el) => { refs.current[id] = el; }} className="buff-slot" data-on="0" style={{ ['--dc' as any]: color }} {...tip(<SimpleTip title={label} sub="Active buff" color={color} />)}>
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
  const level = useGameStore((s) => s.level);
  const maxHp = useGameStore((s) => s.stats.maxHealth);
  const maxMp = useGameStore((s) => s.stats.maxMana);
  const xp = useGameStore((s) => s.experience);
  const need = useGameStore((s) => s.experienceToNextLevel);
  const openHero = useGameStore((s) => s.toggleCharacterSheet);
  const maxRef = useRef([maxHp, maxMp]); maxRef.current = [maxHp, maxMp];
  const Icon = HERO_ICON[hero];
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const plate = useRef<HTMLDivElement>(null);
  const hpEl = useRef<HTMLDivElement>(null);
  const mpEl = useRef<HTMLDivElement>(null);
  const last = useRef<Record<string, string>>({});
  useRaf(() => {
    const p = world.player;
    const f = (Math.min(1, Math.max(0, p.hp / Math.max(1, maxRef.current[0])))).toFixed(3);
    if (hpEl.current && last.current.hp !== f) { last.current.hp = f; hpEl.current.style.setProperty('--fill', f); }
    const m = (Math.min(1, Math.max(0, p.mana / Math.max(1, maxRef.current[1])))).toFixed(3);
    if (mpEl.current && last.current.mp !== m) { last.current.mp = m; mpEl.current.style.setProperty('--fill', m); }
    const low = p.alive && +f < 0.3 ? '1' : '0';
    if (plate.current && last.current.low !== low) { last.current.low = low; plate.current.dataset.low = low; }
    const vals: Record<string, number> = { cry: p.cryT, rage: p.rageT, whirl: p.whirlT, titan: p.titanT };
    for (const k in vals) {
      const el = refs.current[k]; if (!el) continue;
      const v = vals[k];
      const text = v > 0 ? v.toFixed(0) : '';
      if (last.current[k] === text) continue;
      last.current[k] = text;
      el.dataset.on = v > 0 ? '1' : '0';
      const t = el.querySelector('[data-t]'); if (t) t.textContent = text;
    }
  });
  return (
    <div>
      <div ref={plate} className="vitals glass pe" data-low="0" role="button" aria-label="Hero sheet" onClick={openHero} style={{ ['--hc' as any]: HERO_COLOR[hero], cursor: 'pointer' }}>
        <div className="av"><Icon size={20} strokeWidth={2.2} /><span className="lv">{level}</span></div>
        <div className="bars">
          <div ref={hpEl} className="vbar" style={{ ['--bc' as any]: 'var(--hp)' }}><i /></div>
          <div ref={mpEl} className="vbar sm" style={{ ['--bc' as any]: 'var(--mp)' }}><i /></div>
        </div>
        <div className="xp" style={{ ['--fill' as any]: Math.min(1, Math.max(0, xp / Math.max(1, need))) }}><i /></div>
      </div>
      <div className="status-row">
        <BuffSlot id="cry" refs={refs} color="#ffb04a" label="Battle Cry (+30% damage)" icon={<Megaphone size={14} />} />
        <BuffSlot id="rage" refs={refs} color="#ff6a5a" label="Rage" icon={<Swords size={14} />} />
        <BuffSlot id="whirl" refs={refs} color="#ffd27a" label="Whirlwind" icon={<Wind size={14} />} />
        <BuffSlot id="titan" refs={refs} color="#ff8a3a" label="Titan's Wrath" icon={<Mountain size={14} />} />
        <DebuffRow />
      </div>
    </div>
  );
};

const Counter: React.FC<{ icon: React.ReactNode; value: number; label: string }> = ({ icon, value, label }) => {
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
      <span ref={el}>{value.toLocaleString()}</span>
    </div>
  );
};

export const Currency: React.FC<{ gems?: boolean }> = ({ gems: showGems }) => {
  const gold = useGameStore((s) => s.gold);
  const gems = useGameStore((s) => s.gems);
  return (
    <div className="flex gap-2 items-center">
      <Counter icon={<CoinGlyph size={24} />} value={gold} label="Gold" />
      {showGems && <Counter icon={<GemGlyph size={24} />} value={gems} label="Gems" />}
    </div>
  );
};

const MenuBtn: React.FC<{ icon: React.ReactNode; label: string; hint: string; onClick: () => void; active?: boolean; id?: string }> = ({ icon, label, hint, onClick, active, id }) => (
  <button className={`iconbtn pe ${active ? 'is-active' : ''}`} onClick={onClick} aria-label={label} data-testid={id} {...tip(<SimpleTip title={label} sub={`Hotkey: ${hint}`} />)}>
    {icon}
  </button>
);

/** Combat shortcuts: Hero sheet, Bag and the menu (pause, settings, codex, fullscreen all live in the pause menu). */
export const MenuButtons: React.FC = () => {
  const toggleCharacterSheet = useGameStore((s) => s.toggleCharacterSheet);
  const toggleInventory = useGameStore((s) => s.toggleInventory);
  const togglePause = useGameStore((s) => s.togglePause);
  const c = useGameStore((s) => s.isCharacterSheetOpen);
  const i = useGameStore((s) => s.isInventoryOpen);
  return (
    <div className="hud-row">
      <MenuBtn icon={<User size={22} />} label="Hero" hint="C" onClick={toggleCharacterSheet} active={c} />
      <MenuBtn icon={<Backpack size={22} />} label="Bag" hint="I" onClick={toggleInventory} active={i} />
      <MenuBtn icon={<Menu size={22} />} label="Menu" hint="Esc" onClick={togglePause} id="open-menu" />
    </div>
  );
};
