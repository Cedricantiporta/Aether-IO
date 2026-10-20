import { useInputMode } from '../lib/inputMode';
import { ControllerMap } from '../components/ControllerMap';
import React, { useState } from 'react';
import { Layers, Play, Settings, BookOpen, Flag, Pause, Maximize, Swords, Monitor, Volume2, Gamepad2, UserRound, Bug, Repeat } from '../components/GoldIcons';
import { useShallow } from 'zustand/react/shallow';
import { GameStatus } from '../../types';
import { activeChar } from '../../characters';
import { ClassEmblem } from './CharacterSelect';
import { HERO_META } from '../lib/heroes';
import { RecordsPanel } from './MainMenu';
import { device } from '../../engine/device';
import { toggleFullscreen } from '../layout';
import { useGameStore } from '../../store';
import { Modal } from '../components/Modal';
import { Button, Slider, Toggle } from '../components/Button';
import { useUiStore } from '../uiStore';
import { DebugTab } from './DebugTab';
import type { GraphicsQuality, Settings as SettingsT } from '../../storeTypes';
type Settings = SettingsT;


/** Every shortcut, shown in Settings > Controls (engine/input.ts is the source of truth). */
const KEYS_KB: [string, string][] = [
  ['WASD', 'Move'], ['Mouse', 'Aim'], ['Left click', 'Target an enemy (click-to-move: walk there)'], ['Right drag', 'Rotate camera'],
  ['Space', 'Class dash'], ['1 2 3', 'Abilities (hold to aim)'], ['R', 'Ultimate'], ['F', 'Hold: attack manually · accept a quest offer'],
  ['Z / X', 'Health / mana potion'], ['E', 'Interact / talk / loot (hold: harvest)'], ['G', 'Auto-path to the tracked quest'], ['V', 'Reset camera'],
  ['I', 'Bag'], ['C', 'Hero'], ['J', 'Quests'], ['O', 'Achievements'], ['Tab', 'Run upgrades (in a run)'], ['Esc', 'Pause / Settings · close a window'],
];
export const PauseMenu: React.FC = () => {
  const open = useGameStore((s) => s.isPauseMenuOpen);
  const togglePause = useGameStore((s) => s.togglePause);
  const abandonRun = useGameStore((s) => s.abandonRun);
  const openSettings = useUiStore((s) => s.openSettings);
  const openCodex = useUiStore((s) => s.openCodex);
  const openRunUpgrades = useUiStore((s) => s.openRunUpgrades);
  const askConfirm = useUiStore((s) => s.askConfirm);
  const blocked = useUiStore((s) => s.settingsOpen || s.runUpgradesOpen || s.codexOpen || s.goalsOpen || !!s.confirm);
  return (
    <Modal open={open} title="Paused" ribbon tone="gold" width="21rem" z={150} onClose={() => !blocked && togglePause()} onConfirm={blocked ? undefined : togglePause}>
      <div className="flex flex-col gap-3 pt-2">
        <Button variant="primary" size="lg" onClick={togglePause}><Play size={18} fill="currentColor" /> Resume</Button>
        <Button onClick={() => openSettings(true)}><Settings size={16} /> Settings</Button>
        <Button onClick={() => openRunUpgrades(true)}><Layers size={16} /> Run Upgrades</Button>
        <Button onClick={() => openCodex(true)}><BookOpen size={16} /> Codex</Button>
        <Button variant="danger" onClick={() => askConfirm({ title: 'Abandon run?', body: 'You return to the town. Everything you looted is kept, and your xp is kept and the room bonus gold is paid out.', confirmLabel: 'Abandon', tone: 'danger', onConfirm: abandonRun })}>
          <Flag size={16} /> Abandon run
        </Button>
        <div className="text-center rpg-label !text-[.6rem] flex items-center justify-center gap-1 kbd-hint"><Pause size={10} /> Press Esc to resume</div>
      </div>
    </Modal>
  );
};

const Row: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="st-row">
    <div className="st-lbl"><b>{label}</b>{hint && <em>{hint}</em>}</div>
    <div className="st-ctl">{children}</div>
  </div>
);
const Sec: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="st-sec"><div className="st-sec-h"><span>{title}</span><i /></div>{children}</div>
);

type Tab = 'GAMEPLAY' | 'GRAPHICS' | 'AUDIO' | 'CONTROLS' | 'PROFILE' | 'DEBUG';
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'GAMEPLAY', label: 'Gameplay', icon: <Swords size={17} /> }, { id: 'GRAPHICS', label: 'Graphics', icon: <Monitor size={17} /> },
  { id: 'AUDIO', label: 'Audio', icon: <Volume2 size={17} /> }, { id: 'CONTROLS', label: 'Controls', icon: <Gamepad2 size={17} /> },
  { id: 'PROFILE', label: 'Character', icon: <UserRound size={17} /> }, { id: 'DEBUG', label: 'Debug', icon: <Bug size={17} /> },
];

function Seg<T extends string | number>({ value, opts, onChange, tid }: { value: T; opts: { v: T; l: string }[]; onChange: (v: T) => void; tid?: string }) {
  return (
    <div className="st-seg" data-testid={tid}>
      {opts.map((o) => <button key={String(o.v)} className={`pe ${value === o.v ? 'on' : ''}`} onClick={() => onChange(o.v)}>{o.l}</button>)}
    </div>
  );
}

export const SettingsDialog: React.FC = () => {
  const open = useUiStore((s) => s.settingsOpen);
  const close = useUiStore((s) => s.openSettings);
  const settings = useGameStore((s) => s.settings);
  const padMode = useInputMode((m) => m.pad);   // (owner) Controls shows the layout of the input in use
  const update = useGameStore((s) => s.updateSettings);
  const resetProfile = useGameStore((s) => s.resetProfile);
  const askConfirm = useUiStore((s) => s.askConfirm);
  const [tab, setTab] = useState<Tab>('GAMEPLAY');
  const vol = (k: 'masterVolume' | 'sfxVolume' | 'musicVolume', label: string) => (
    <Row label={label}>
      <div className="flex-1"><Slider value={settings[k]} onChange={(v) => update({ [k]: v })} /></div>
      <span className="st-num">{Math.round(settings[k] * 100)}</span>
    </Row>
  );
  const tog = (label: string, k: keyof Settings, hint?: string, locked = false) => (
    <Row label={label} hint={hint}><Toggle checked={!locked && !!settings[k]} disabled={locked} onChange={(v) => update({ [k]: v } as Partial<Settings>)} label={label} /></Row>
  );
  const hardUnlocked = useGameStore((s) => s.progress.endings > 0);
  const inRun = useGameStore((s) => s.status === GameStatus.PLAYING || s.status === GameStatus.PAUSED);
  const { hero, rank } = useGameStore(useShallow((s) => ({ hero: s.hero, rank: s.heroRank })));
  const me = activeChar();
  return (
    <Modal open={open} onClose={() => close(false)} title="Settings" ribbon tone="blue" width="min(46rem, 96vw)" z={250} full>
      <div className="st" data-testid="settings-tabs">
        <nav className="st-nav" role="tablist">
          {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} data-testid={`tab-${t.id}`} className={`st-tab pe ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>{t.icon}<span>{t.label}</span></button>)}
        </nav>
        <div className="st-body rpg-scroll allow-scroll">
        {tab === 'GAMEPLAY' && (<>
          <Sec title="Combat">
            {tog('Auto-aim', 'autoAim', 'Lock the nearest enemy. Off: mouse aim, or the right aim stick on touch.')}
            {tog('Hard mode', 'hardMode', hardUnlocked ? 'Enemies have +40% HP, deal +35% damage and come in greater numbers. Rewards: +50% gold and XP, better item and card rarity odds. Takes effect from your next run.' : 'Clear a full run to unlock', !hardUnlocked)}
            {tog('Auto skills', 'autoSkills', 'Skills 1/2/3 and the ultimate cast themselves at nearby enemies. Dash stays manual.')}
            {tog('Aim skills at mouse', 'aimAtCursor', 'Off: skills and dash go where your hero is facing. On: hold the key to aim at the mouse cursor.')}
            {tog('Auto potions', 'autoPotions', 'Drink a potion at 70% HP / MP or lower.')}
            {tog('Click to move', 'clickMove', 'Left-click the ground to walk there (in town and on adventures). WASD still works; any key press cancels the walk.')}
          </Sec>
          <Sec title="Auto loot">
            <Row label="Auto-pick gear" hint="Lowest rarity of equipment that flies to you by itself. Lower ones wait for E / a tap.">
              <Seg tid="seg-autoloot" value={settings.autoLootGear} opts={[{ v: 'OFF', l: 'Off' }, { v: 'COMMON', l: 'All' }, { v: 'UNCOMMON', l: 'Unc.+' }, { v: 'RARE', l: 'Rare+' }, { v: 'EPIC', l: 'Epic+' }, { v: 'LEGENDARY', l: 'Leg.+' }]} onChange={(v) => update({ autoLootGear: v })} />
            </Row>
            {tog('Auto-pick materials', 'autoLootMaterials', 'Monster loot, shards and potions fly to you at any rarity.')}
            <Row label="Pickup range" hint="Near: walk up to items. Far: your magnet radius pulls them in.">
              <Seg tid="seg-lootrange" value={settings.autoLootRange} opts={[{ v: 'NEAR', l: 'Near' }, { v: 'FAR', l: 'Far' }]} onChange={(v) => update({ autoLootRange: v })} />
            </Row>
            {tog('Collect all when room is cleared', 'autoLootOnClear', 'Once the fight is over every item on the floor flies to you (bag space allowing).')}
          </Sec>
          <Sec title="Camera">
            {tog('Free camera', 'freeCamera', 'Off: a fixed low-angle "diorama" view, north always up. On: drag to turn and tilt the camera.')}
            {tog('Tilt-shift blur', 'tiltShift', 'Soft blur at the top and bottom of the screen (miniature look).')}
            {tog('Camera follows mouse', 'cameraLead', 'On: the camera drifts a little toward the mouse cursor. Off: it stays centred on your hero.')}
            {tog('Screen shake', 'screenShake')}
          </Sec>
          <Sec title="Interface">
            {tog('Damage numbers', 'showDamageNumbers')}
            {tog('Enemy health bars', 'showEnemyBars')}
            {tog('Show minimap', 'showMinimap')}
            {tog('Vibration on hit', 'vibration', 'Phones only.')}
          </Sec>
        </>)}
        {tab === 'GRAPHICS' && (<>
          <Sec title="Quality">
            <Row label="Graphics" hint={settings.batterySaver ? 'Locked to LOW by Battery saver.' : undefined}>
              <Seg tid="seg-quality" value={settings.batterySaver ? 'LOW' : settings.quality} opts={(['LOW', 'MEDIUM', 'HIGH'] as GraphicsQuality[]).map((q) => ({ v: q, l: q[0] + q.slice(1).toLowerCase() }))} onChange={(v) => update({ quality: v })} />
            </Row>
            {tog('Auto quality', 'autoQuality', 'Lowers resolution / particles when the frame rate drops, restores when stable.')}
            {tog('Battery saver', 'batterySaver', '30 FPS + LOW graphics.')}
          </Sec>
          <Sec title="Display">
            <Row label="FPS limit" hint={settings.batterySaver ? 'Battery saver caps at 30.' : undefined}>
              <Seg tid="seg-fps" value={settings.batterySaver ? 30 : settings.fpsLimit} opts={[{ v: 30, l: '30' }, { v: 60, l: '60' }, { v: 0, l: 'Max' }]} onChange={(v) => update({ fpsLimit: v as Settings['fpsLimit'] })} />
            </Row>
            {tog('Show FPS counter', 'showFps')}
            <Row label="UI scale"><Seg tid="seg-ui" value={settings.uiScale} opts={[{ v: 'SMALL', l: 'Small' }, { v: 'NORMAL', l: 'Normal' }, { v: 'LARGE', l: 'Large' }]} onChange={(v) => update({ uiScale: v })} /></Row>
            {device.fullscreenOk && <Row label="Fullscreen"><Button size="sm" onClick={() => { void toggleFullscreen(); }}><Maximize size={14} /> Toggle</Button></Row>}
          </Sec>
        </>)}
        {tab === 'AUDIO' && (
          <Sec title="Volume">
            {vol('masterVolume', 'Master')}
            {vol('sfxVolume', 'Effects')}
            {vol('musicVolume', 'Music')}
          </Sec>
        )}
        {tab === 'DEBUG' && <DebugTab />}
        {tab === 'CONTROLS' && (<>
          <Sec title="Casting">
            <Row label="Skill casting" hint="Aimed: hold to show the indicator, release to cast. Quick: instant at the cursor. Auto: instant at the auto-target.">
              <Seg tid="seg-cast" value={settings.castMode ?? 'AIMED'} opts={[{ v: 'AIMED', l: 'Aimed' }, { v: 'QUICK', l: 'Quick' }, { v: 'AUTO', l: 'Auto' }]} onChange={(v) => update({ castMode: v })} />
            </Row>
            <Row label="Joystick side" hint="Touch: move stick and ability buttons swap sides."><Seg tid="seg-joy" value={settings.joystickSide} opts={[{ v: 'LEFT', l: 'Left' }, { v: 'RIGHT', l: 'Right' }]} onChange={(v) => update({ joystickSide: v })} /></Row>
          </Sec>
          {!padMode && <Sec title="Keyboard & mouse">
            <div className="st-keys">
              {KEYS_KB.map(([k, l]) => <div key={k}><kbd>{k}</kbd><span>{l}</span></div>)}
            </div>
            <p className="st-p" style={{ marginTop: '.5rem' }}>Using a controller? Press any button on it and this list switches to the controller layout.</p>
          </Sec>}
          {padMode && <Sec title="Controller">
            <ControllerMap />
            <p className="st-p" style={{ marginTop: '.6rem' }}>In menus and shops: D-pad / left stick move the highlight, A selects, B or Start goes back, LB / RB switch tabs, right stick scrolls, left / right adjust sliders. (Use the keyboard or mouse to see the keyboard list.)</p>
          </Sec>}
          <Sec title="Touch">
            <p className="st-p">Drag on the {settings.joystickSide === 'LEFT' ? 'left' : 'right'} side to move. Tap an ability to cast at the auto-target, or drag from it to aim (release to cast, drag back to cancel).</p>
          </Sec>
        </>)}
        {tab === 'PROFILE' && (<>
          <Sec title="Character">
            <div className="st-char">
              <ClassEmblem hero={hero} size="3.6rem" lit />
              <div className="flex-1 min-w-0"><b>{me?.name ?? HERO_META[hero].title}</b><em>{HERO_META[hero].title} · Level {rank}</em></div>
              <Button size="sm" variant="primary" disabled={inRun} data-testid="change-class"
                onClick={() => { close(false); useUiStore.getState().setCharSelect(true); }}><Repeat size={14} /> Change character</Button>
            </div>
            {inRun && <p className="st-p">Return to town to switch characters.</p>}
          </Sec>
          <Sec title="Records"><RecordsPanel /></Sec>
          <Sec title="Danger zone">
            <Row label="Reset profile" hint="Erases this character's gold, gems, items, levels, quests and records.">
              <Button variant="danger" size="sm" data-testid="reset-profile"
                onClick={() => askConfirm({ title: 'Reset profile?', body: 'This permanently erases your gold, gems, items, hero rank, quests and records. A fresh profile with the welcome gift is created.', confirmLabel: 'Reset everything', tone: 'danger', onConfirm: () => { resetProfile(); close(false); } })}>Reset</Button>
            </Row>
          </Sec>
        </>)}
        </div>
      </div>
      <div className="mt-3 flex justify-end"><Button variant="primary" onClick={() => close(false)} style={{ minWidth: '9rem' }}>Done</Button></div>
    </Modal>
  );
};
