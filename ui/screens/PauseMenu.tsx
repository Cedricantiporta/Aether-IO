import React, { useState } from 'react';
import { Play, Settings, BookOpen, Flag, Pause, Maximize } from 'lucide-react';
import { device } from '../../engine/device';
import { toggleFullscreen } from '../layout';
import { useGameStore } from '../../store';
import { Modal } from '../components/Modal';
import { Button, Slider, Toggle } from '../components/Button';
import { useUiStore } from '../uiStore';
import type { GraphicsQuality, Settings as SettingsT } from '../../storeTypes';
type Settings = SettingsT;

export const PauseMenu: React.FC = () => {
  const open = useGameStore((s) => s.isPauseMenuOpen);
  const togglePause = useGameStore((s) => s.togglePause);
  const abandonRun = useGameStore((s) => s.abandonRun);
  const openSettings = useUiStore((s) => s.openSettings);
  const openCodex = useUiStore((s) => s.openCodex);
  const askConfirm = useUiStore((s) => s.askConfirm);
  const blocked = useUiStore((s) => s.settingsOpen || s.codexOpen || !!s.confirm);
  return (
    <Modal open={open} title="Paused" ribbon tone="gold" width="21rem" z={150} onClose={() => !blocked && togglePause()} onConfirm={blocked ? undefined : togglePause}>
      <div className="flex flex-col gap-3 pt-2">
        <Button variant="primary" size="lg" onClick={togglePause}><Play size={18} fill="currentColor" /> Resume</Button>
        <Button onClick={() => openSettings(true)}><Settings size={16} /> Settings</Button>
        <Button onClick={() => openCodex(true)}><BookOpen size={16} /> Codex</Button>
        <Button variant="danger" onClick={() => askConfirm({ title: 'Abandon run?', body: 'You return to the town. Everything you looted is kept, and rank xp and the room bonus gold are paid out.', confirmLabel: 'Abandon', tone: 'danger', onConfirm: abandonRun })}>
          <Flag size={16} /> Abandon run
        </Button>
        <div className="text-center rpg-label !text-[.6rem] flex items-center justify-center gap-1"><Pause size={10} /> Press Esc to resume</div>
      </div>
    </Modal>
  );
};

const Row: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="flex items-center gap-4 py-2 border-b border-black/30 last:border-0" style={{ minHeight: '2.6rem' }}>
    <div className="shrink-0" style={{ width: '9.5rem' }}>
      <div className="rpg-label !text-[.72rem]">{label}</div>
      {hint && <div style={{ fontSize: '.58rem', color: 'var(--text-dim)', lineHeight: 1.2, marginTop: '.1rem' }}>{hint}</div>}
    </div>
    <div className="flex-1 flex items-center justify-end gap-3">{children}</div>
  </div>
);

type Tab = 'GAMEPLAY' | 'GRAPHICS' | 'AUDIO' | 'CONTROLS';
const TABS: { id: Tab; label: string }[] = [{ id: 'GAMEPLAY', label: 'Gameplay' }, { id: 'GRAPHICS', label: 'Graphics' }, { id: 'AUDIO', label: 'Audio' }, { id: 'CONTROLS', label: 'Controls' }];

function Seg<T extends string | number>({ value, opts, onChange, tid }: { value: T; opts: { v: T; l: string }[]; onChange: (v: T) => void; tid?: string }) {
  return (
    <div className="flex gap-1.5" data-testid={tid}>
      {opts.map((o) => <button key={String(o.v)} className={`rpg-subtab pe ${value === o.v ? 'is-active' : ''}`} onClick={() => onChange(o.v)}>{o.l}</button>)}
    </div>
  );
}

export const SettingsDialog: React.FC = () => {
  const open = useUiStore((s) => s.settingsOpen);
  const close = useUiStore((s) => s.openSettings);
  const settings = useGameStore((s) => s.settings);
  const update = useGameStore((s) => s.updateSettings);
  const resetProfile = useGameStore((s) => s.resetProfile);
  const askConfirm = useUiStore((s) => s.askConfirm);
  const [tab, setTab] = useState<Tab>('GAMEPLAY');
  const vol = (k: 'masterVolume' | 'sfxVolume' | 'musicVolume', label: string) => (
    <Row label={label}>
      <div className="flex-1"><Slider value={settings[k]} onChange={(v) => update({ [k]: v })} /></div>
      <span className="rpg-num text-sm w-10 text-right text-[var(--gold-light)]">{Math.round(settings[k] * 100)}</span>
    </Row>
  );
  const tog = (label: string, k: keyof Settings, hint?: string) => (
    <Row label={label} hint={hint}><Toggle checked={!!settings[k]} onChange={(v) => update({ [k]: v } as Partial<Settings>)} label={label} /></Row>
  );
  return (
    <Modal open={open} onClose={() => close(false)} title="Settings" ribbon tone="blue" width="31rem" z={250}>
      <div className="flex gap-1.5 mt-2" role="tablist" data-testid="settings-tabs">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} data-testid={`tab-${t.id}`} className={`rpg-subtab bevel pe flex-1 ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      <div className="rpg-frame px-4 py-1 mt-2 allow-scroll" style={{ minHeight: '17rem' }}>
        {tab === 'GAMEPLAY' && (<>
          {tog('Auto-aim', 'autoAim', 'Lock the nearest enemy. Off: mouse aim, or the right aim stick on touch.')}
          {tog('Auto skills', 'autoSkills', 'Skills 1/2/3 and the ultimate cast themselves at nearby enemies. Dash stays manual.')}
          {tog('Aim skills at mouse', 'aimAtCursor', 'Off: skills and dash go where your hero is facing. On: hold the key to aim at the mouse cursor.')}
          {tog('Auto potions', 'autoPotions', 'Drink below 30% HP / MP.')}
          {tog('Damage numbers', 'showDamageNumbers')}
          {tog('Enemy health bars', 'showEnemyBars')}
          {tog('Screen shake', 'screenShake')}
          {tog('Show minimap', 'showMinimap')}
          {tog('Vibration on hit', 'vibration', 'Phones only.')}
          {tog('Unlock camera zoom', 'zoomUnlocked', 'Off: the camera stays at zoom 1.0. On: mouse wheel / pinch and the slider below change it.')}
          {settings.zoomUnlocked && <Row label="Camera zoom" hint="Close to far">
            <div className="flex-1"><Slider value={(settings.cameraZoom - 0.8) / 0.5} onChange={(v) => update({ cameraZoom: Math.round((0.8 + v * 0.5) * 100) / 100 })} /></div>
            <span className="rpg-num text-sm w-10 text-right text-[var(--gold-light)]">{settings.cameraZoom.toFixed(2)}</span>
          </Row>}
        </>)}
        {tab === 'GRAPHICS' && (<>
          <Row label="Graphics" hint={settings.batterySaver ? 'Locked to LOW by Battery saver.' : undefined}>
            <Seg tid="seg-quality" value={settings.batterySaver ? 'LOW' : settings.quality} opts={(['LOW', 'MEDIUM', 'HIGH'] as GraphicsQuality[]).map((q) => ({ v: q, l: q }))} onChange={(v) => update({ quality: v })} />
          </Row>
          {tog('Auto quality', 'autoQuality', 'Lowers resolution / particles when the frame rate drops, restores when stable.')}
          <Row label="FPS limit" hint={settings.batterySaver ? 'Battery saver caps at 30.' : undefined}>
            <Seg tid="seg-fps" value={settings.batterySaver ? 30 : settings.fpsLimit} opts={[{ v: 30, l: '30' }, { v: 60, l: '60' }, { v: 0, l: 'Unlimited' }]} onChange={(v) => update({ fpsLimit: v as Settings['fpsLimit'] })} />
          </Row>
          {tog('Show FPS counter', 'showFps')}
          {tog('Battery saver', 'batterySaver', '30 FPS + LOW graphics.')}
          <Row label="UI scale"><Seg tid="seg-ui" value={settings.uiScale} opts={[{ v: 'SMALL', l: 'Small' }, { v: 'NORMAL', l: 'Normal' }, { v: 'LARGE', l: 'Large' }]} onChange={(v) => update({ uiScale: v })} /></Row>
        </>)}
        {tab === 'AUDIO' && (<>
          {vol('masterVolume', 'Master volume')}
          {vol('sfxVolume', 'Effects')}
          {vol('musicVolume', 'Music')}
        </>)}
        {tab === 'CONTROLS' && (<>
          <Row label="Skill casting" hint="Aimed: hold the key to show the indicator, release to cast (right-click / Esc cancels). Quick: instant at the cursor. Auto: instant at the auto-target. Touch: tap = auto-target, drag = aim.">
            <Seg tid="seg-cast" value={settings.castMode ?? 'AIMED'} opts={[{ v: 'AIMED', l: 'Aimed' }, { v: 'QUICK', l: 'Quick' }, { v: 'AUTO', l: 'Auto' }]} onChange={(v) => update({ castMode: v })} />
          </Row>
          <Row label="Joystick side" hint="Touch: move stick and ability buttons swap sides."><Seg tid="seg-joy" value={settings.joystickSide} opts={[{ v: 'LEFT', l: 'Left' }, { v: 'RIGHT', l: 'Right' }]} onChange={(v) => update({ joystickSide: v })} /></Row>
          {device.fullscreenOk && <Row label="Fullscreen"><Button size="sm" onClick={() => { void toggleFullscreen(); }}><Maximize size={14} /> Toggle</Button></Row>}
          <div className="py-2" style={{ fontSize: '.72rem', lineHeight: 1.7, color: 'var(--text-dim)' }}>
            <div className="rpg-label !text-[.66rem] mb-1">Keyboard</div>
            <div><b>WASD</b> move · <b>Mouse</b> aim · <b>Space</b> class dash · <b>1 2 3</b> abilities (hold to aim, release to cast) · <b>R</b> ultimate</div>
            <div><b>Z / X</b> potions · <b>I</b> bag · <b>C</b> hero · <b>Esc</b> pause · <b>E / F</b> interact / harvest (village)</div>
            <div className="rpg-label !text-[.66rem] mt-2 mb-1">Touch</div>
            <div>Drag on the {settings.joystickSide === 'LEFT' ? 'left' : 'right'} side to move. Ability buttons sit on the {settings.joystickSide === 'LEFT' ? 'right' : 'left'}: tap a button to cast at the auto-target, or drag from it to aim (release to cast, drag back to the button or to the top zone to cancel). With Auto-aim off, drag on the opposite upper side to aim.</div>
          </div>
        </>)}
      </div>
      <div className="mt-3"><Button className="w-full" variant="danger" size="sm" data-testid="reset-profile"
        onClick={() => askConfirm({ title: 'Reset profile?', body: 'This permanently erases your gold, gems, items, hero rank, quests and records. A fresh profile with the welcome gift is created.', confirmLabel: 'Reset everything', tone: 'danger', onConfirm: () => { resetProfile(); close(false); } })}>Reset profile</Button></div>
      <div className="mt-3"><Button className="w-full" variant="primary" onClick={() => close(false)}>Done</Button></div>
    </Modal>
  );
};
