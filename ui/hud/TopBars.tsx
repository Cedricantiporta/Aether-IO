import { keyHint } from '../lib/inputMode';
import { PadHint } from '../components/PadBtn';
import { attrPointsTotal, attrSpent } from '../../attributes';
import { GameStatus } from '../../types';
import { CuteHero, CuteBag, CuteStar, CuteScroll, CuteMapPin, CuteShop, CuteGear, CuteTrophy, CuteBook, CuteLayers, CuteCalendar, CuteTower, CuteWaves } from '../components/CuteIcons';
import { useBagAlert, useCodexAlert, useSkillAlert, useGoalsAlert } from '../lib/alerts';
import { device } from '../../engine/device';
import { toggleFullscreen } from '../layout';
import React, { useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ELIXIRS, ELIXIR_IDS, elixirItem, type ElixirId } from '../../elixirs';
import { ItemArt } from '../components/ItemArt';
import { StatusIcon } from '../components/StatusIcon';
import type { LucideIcon } from '../components/GoldIcons';
import { motion } from 'framer-motion';
import { ScrollText, User, Backpack, BookOpen, Store, Settings, Crosshair, Wand2, Axe, Sword, Swords, Wind, Megaphone, Mountain, Star, Anchor, VolumeX, ShieldOff, EyeOff, Flame, Droplet, Skull, ChevronsDown, Trophy } from '../components/GoldIcons';
import { envSlow } from '../../engine/systems/zones';
import { CoinGlyph, GemGlyph } from '../components/SkillIcons';
import { OrnateRing } from '../components/Ornate';
import { titleOf } from '../../achievements';
import { useUiStore } from '../uiStore';
import { UNLOCK_LV } from '../../unlocks';
import { dayKey } from '../../dailyChallenge';
import { events } from '../../engine/events';
import { useGameStore, calculateTotalCP } from '../../store';
import { world } from '../../engine/world';
import { offerTeleport } from './QuestTracker';
import { reachable } from './UpgradeNotice';
import { useRaf } from '../hooks/useRaf';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';
import { HERO_COLOR } from '../lib/game';
import type { HeroClass, Item } from '../../types';

export const HERO_ICON: Record<HeroClass, LucideIcon> = { ARCHER: Crosshair, WIZARD: Wand2, BARBARIAN: Axe, KNIGHT: Sword, NECROMANCER: Skull };

const BuffSlot: React.FC<{ id: string; icon: React.ReactNode; label: string; color: string; refs: React.MutableRefObject<Record<string, HTMLElement | null>> }> = ({ id, icon, label, color, refs }) => (
  <div ref={(el) => { refs.current[id] = el; }} className="buff-slot" data-on="0" style={{ color }} {...tip(<SimpleTip title={label} sub="Active buff" color={color} />)}>
    <span data-ic style={{ display: 'grid', width: '100%', height: '100%', placeItems: 'center' }}><StatusIcon type={id} size="88%" fallback={icon} /></span><span data-t />
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
  { id: 'atkdown', icon: <Swords size={14} />, color: '#cbd5e1', label: 'Weakened', body: 'Your attack is reduced.', get: () => (world.player.buffDmg < 0 ? world.player.buffT : 0) },
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
          <span style={{ display: 'grid', width: '100%', height: '100%', placeItems: 'center' }}><StatusIcon type={d.id} size="100%" fallback={d.icon} /></span><span data-t />
        </div>
      ))}
    </div>
  );
};

export const PlayerPlate: React.FC = () => {
  const hero = useGameStore((s) => s.hero);
  const title = useGameStore((s) => titleOf(s.meta.title));
  const level = useGameStore((s) => s.level);
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
      <div className="flex flex-col gap-[.3rem]" >
        {/* (owner: compact - one name row, no Lv / CP row; buff slots only while active) */}
        {title && <div className="pp-name"><span className="tp-title" data-testid="hero-title">{title}</span></div>}
        <div className="pp-buffs">
          <BuffSlot id="cry" refs={refs} color="#ffb04a" label="Battle Cry (+30% damage)" icon={<Megaphone size={15} />} />
          <BuffSlot id="rage" refs={refs} color="#ff6a5a" label="Rage" icon={<Swords size={15} />} />
          <BuffSlot id="whirl" refs={refs} color="#ffd27a" label="Whirlwind" icon={<Wind size={15} />} />
          <BuffSlot id="titan" refs={refs} color="#ff8a3a" label="Titan's Wrath" icon={<Mountain size={15} />} />
        </div>
        <DebuffRow />
        <ElixirRow />
      </div>
    </div>
  );
};

/** Elixir buffs: active this run (solid) and drunk in town, waiting for the next run (dashed). Changes rarely (selectors only). */
const ElixirRow: React.FC = () => {
  const { run, next } = useGameStore(useShallow((s) => ({ run: s.elixirsRun, next: s.elixirsNext })));
  const samples = useMemo(() => Object.fromEntries(ELIXIR_IDS.map((k) => [k, elixirItem(k)])) as Record<ElixirId, Item>, []);
  if (!run.length && !next.length) return null;
  return (
    <div className="elixir-hud" data-testid="elixir-hud">
      {run.map((k) => <span key={'r' + k} {...tip(<SimpleTip title={ELIXIRS[k].name} sub="Active this run" color={ELIXIRS[k].color} body={ELIXIRS[k].effect} />)}><ItemArt item={samples[k]} size={22} /></span>)}
      {next.map((k) => <span key={'n' + k} className="next" {...tip(<SimpleTip title={ELIXIRS[k].name} sub="Next run" color={ELIXIRS[k].color} body={`${ELIXIRS[k].effect} when your next run starts`} />)}><ItemArt item={samples[k]} size={22} /></span>)}
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

const HINT_CODE: Record<string, string> = { C: 'KeyC', I: 'KeyI', J: 'KeyJ', O: 'KeyO', Esc: 'Escape' };
const MenuBtn: React.FC<{ icon: React.ReactNode; label: string; hint: string; onClick: () => void; active?: boolean; dot?: boolean; caption?: string; mini?: boolean; locked?: boolean; testid?: string }> = ({ icon, label, hint, onClick, active, dot, caption, mini, locked, testid }) => (
  <button data-testid={testid} data-locked={locked ? '1' : undefined} className={`sqbtn pe relative ${active ? 'is-active' : ''} ${caption ? 'mb-cap' : ''} ${mini ? 'mb-mini' : ''} ${locked ? 'is-locked' : ''}`} onClick={onClick} aria-label={label} {...tip(<div className="tip-pill">{label}{hint && <kbd>{keyHint(hint)}</kbd>}</div>)}>
    <span className="mb-ic">{icon}{dot && !locked && <i className="red-dot" />}{locked && <i className="mb-lock" aria-hidden />}</span>
    {caption && <span className="mb-lbl">{caption}</span>}
    {HINT_CODE[hint] && <PadHint code={HINT_CODE[hint]} className="pad-corner" style={{ top: 'auto', bottom: '-.45rem', right: '-.4rem' }} />}
  </button>
);

/** Opens a town service from anywhere: straight away in town / at a camp, otherwise offers the trip home first. */
function openTownShop(tab: 'SKILLS' | 'SUMMON'): void {
  const g = useGameStore.getState();
  const open = () => useGameStore.getState().openSpecificShop(tab);
  if (g.status === GameStatus.MENU || (tab === 'SKILLS' && reachable('skill'))) open(); else offerTeleport(open);
}

export const MenuButtons: React.FC = () => {
  const toggleCharacterSheet = useGameStore((s) => s.toggleCharacterSheet);
  const toggleInventory = useGameStore((s) => s.toggleInventory);
  const togglePause = useGameStore((s) => s.togglePause);
  const openCodex = useUiStore((s) => s.openCodex);
  const c = useGameStore((s) => s.isCharacterSheetOpen);
  const i = useGameStore((s) => s.isInventoryOpen);
  const shopOpen = useGameStore((s) => s.isShopOpen);
  const showMap = useGameStore((s) => s.settings.showMinimap !== false);
  const updateSettings = useGameStore((s) => s.updateSettings);
  const bagDot = useBagAlert(), codexDot = useCodexAlert(), skillDot = useSkillAlert(), goalsDot = useGoalsAlert();
  const attrDot = useGameStore((s) => attrPointsTotal(s.classProg[s.hero]?.lv ?? 1) > attrSpent(s.attrs[s.hero]));   // unspent attribute points
  return (
    <div className="menu-row">
      <MenuBtn caption="Character" icon={<CuteHero size={30} />} label="Character" hint="C" onClick={toggleCharacterSheet} active={c} dot={attrDot} />
      <MenuBtn caption="Bag" icon={<CuteBag size={30} />} label="Bag" hint="I" onClick={toggleInventory} active={i} dot={bagDot} />
      <MenuBtn caption="Skills" icon={<CuteStar size={30} />} label="Skill Trainer" hint="" onClick={() => openTownShop('SKILLS')} dot={skillDot} />
      <MenuBtn caption="Quest" icon={<CuteScroll size={30} />} label="Quests" hint="J" onClick={() => useUiStore.getState().openQuestLog(true)} />
      {/* (no big map exists: this shows / hides the minimap) */}
      <MenuBtn caption="Map" icon={<CuteMapPin size={30} />} label={showMap ? 'Hide minimap' : 'Show minimap'} hint="" onClick={() => updateSettings({ showMinimap: !showMap })} active={showMap} />
      <MenuBtn caption="Shop" icon={<CuteShop size={30} />} label="Summon shop" hint="" onClick={() => openTownShop('SUMMON')} active={shopOpen} />
      <MenuBtn caption="Menu" icon={<CuteGear size={30} />} label="Settings" hint="Esc" onClick={() => (useGameStore.getState().status === GameStatus.PLAYING ? togglePause() : useUiStore.getState().openSettings(true))} />
    </div>
  );
};

/** Corner icons for the three tower-hub modes (Daily Trial, Endless Tower, Endless Waves): open their start window from anywhere in
 *  town (not in a run), greyed with a small lock while the level / ending unlock is missing. */
const ModeIcons: React.FC = () => {
  const level = useGameStore((s) => s.level), endings = useGameStore((s) => s.progress.endings);
  const dailyDot = useGameStore((s) => s.level >= UNLOCK_LV.DAILY && s.progress.daily.claimed !== dayKey());
  const go = (tab: 'RUN' | 'DAILY' | 'WAVES') => {
    const g = useGameStore.getState();
    if (g.status !== GameStatus.MENU) { g.addNotification('The trials are started from the town.', '#fff3c4', 'SYSTEM'); return; }
    events.emit('openSetOut', { mode: 'TOWER', tab, remote: true });
  };
  const dLock = level < UNLOCK_LV.DAILY, wLock = level < UNLOCK_LV.WAVES, tLock = endings <= 0;
  return (<>
    <MenuBtn mini testid="cb-daily" icon={<CuteCalendar size={22} />} label={dLock ? `Daily Trial (unlocks at Lv ${UNLOCK_LV.DAILY})` : 'Daily Trial'} hint="" onClick={() => go('DAILY')} dot={dailyDot} locked={dLock} />
    <MenuBtn mini testid="cb-tower" icon={<CuteTower size={22} />} label={tLock ? 'Endless Tower (finish one adventure to open it)' : 'Endless Tower'} hint="" onClick={() => go('RUN')} locked={tLock} />
    <MenuBtn mini testid="cb-waves" icon={<CuteWaves size={22} />} label={wLock ? `Endless Waves (unlocks at Lv ${UNLOCK_LV.WAVES})` : 'Endless Waves'} hint="" onClick={() => go('WAVES')} locked={wLock} />
  </>);
};

/** Small icon row under the area pill: Run Upgrades (runs only) + the two entries the 7-button row has no room for. */
export const SubMenuButtons: React.FC = () => {
  const inRun = useGameStore((s) => s.status === GameStatus.PLAYING || s.status === GameStatus.PAUSED || s.status === GameStatus.LEVEL_UP);
  const upCount = useGameStore((s) => s.runPicks.length);
  const upOpen = useUiStore((s) => s.runUpgradesOpen);
  const goalsDot = useGoalsAlert(), codexDot = useCodexAlert();
  return (
    <div className="submenu-row">
      {inRun && <MenuBtn mini icon={<CuteLayers size={22} />} label={`Run Upgrades${upCount ? ` (${upCount})` : ''}`} hint="Tab" onClick={() => useUiStore.getState().openRunUpgrades(!upOpen)} active={upOpen} />}
      <ModeIcons />
      <MenuBtn mini icon={<CuteTrophy size={22} />} label="Achievements" hint="O" onClick={() => useUiStore.getState().openGoals(true, 'ACHIEVEMENTS')} dot={goalsDot} />
      <MenuBtn mini icon={<CuteBook size={22} />} label="Codex" hint="Bestiary" onClick={() => useUiStore.getState().openCodex(true)} dot={codexDot} />
    </div>
  );
};

/** (owner) Gold / gems stay visible above any open panel, shop, popup or summon (the HUD copy sits under the backdrops). */
export const CurrencyFloat: React.FC = () => {
  const panel = useGameStore((s) => s.isShopOpen || s.isInventoryOpen || s.isCharacterSheetOpen);
  const overlay = useUiStore((s) => s.settingsOpen || s.codexOpen || s.goalsOpen || s.questLogOpen || !!s.confirm || !!s.sellItem || !!s.buyItem || !!s.summonResults);
  if (!panel && !overlay) return null;
  return <div className="cur-float hud-cur pe"><Currency /></div>;
};
