import React from 'react';
import { Play, Settings, BookOpen, Flag, Pause } from 'lucide-react';
import { useGameStore } from '../../store';
import { Modal } from '../components/Modal';
import { Button, Slider, Toggle } from '../components/Button';
import { useUiStore } from '../uiStore';
import type { GraphicsQuality } from '../../storeTypes';

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
        <Button variant="danger" onClick={() => askConfirm({ title: 'Abandon run?', body: 'You return to the village. Everything you looted is kept, and rank xp and wave gold are paid out.', confirmLabel: 'Abandon', tone: 'danger', onConfirm: abandonRun })}>
          <Flag size={16} /> Abandon run
        </Button>
        <div className="text-center rpg-label !text-[.6rem] flex items-center justify-center gap-1"><Pause size={10} /> Press Esc to resume</div>
      </div>
    </Modal>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center gap-4 py-2 border-b border-black/30 last:border-0">
    <div className="rpg-label !text-[.72rem] w-32 shrink-0">{label}</div>
    <div className="flex-1 flex items-center justify-end gap-3">{children}</div>
  </div>
);

export const SettingsDialog: React.FC = () => {
  const open = useUiStore((s) => s.settingsOpen);
  const close = useUiStore((s) => s.openSettings);
  const settings = useGameStore((s) => s.settings);
  const update = useGameStore((s) => s.updateSettings);
  const resetProfile = useGameStore((s) => s.resetProfile);
  const askConfirm = useUiStore((s) => s.askConfirm);
  const Q: GraphicsQuality[] = ['LOW', 'MEDIUM', 'HIGH'];
  const vol = (k: 'masterVolume' | 'sfxVolume' | 'musicVolume', label: string) => (
    <Row label={label}>
      <div className="flex-1"><Slider value={settings[k]} onChange={(v) => update({ [k]: v })} /></div>
      <span className="rpg-num text-sm w-10 text-right text-[var(--gold-light)]">{Math.round(settings[k] * 100)}</span>
    </Row>
  );
  return (
    <Modal open={open} onClose={() => close(false)} title="Settings" ribbon tone="blue" width="29rem" z={250}>
      <div className="rpg-frame px-4 py-1 mt-2">
        {vol('masterVolume', 'Master volume')}
        {vol('sfxVolume', 'Effects')}
        {vol('musicVolume', 'Music')}
        <Row label="Graphics">
          <div className="flex gap-1.5">
            {Q.map((q) => <button key={q} className={`rpg-subtab pe ${settings.quality === q ? 'is-active' : ''}`} onClick={() => update({ quality: q })}>{q}</button>)}
          </div>
        </Row>
        <Row label="Damage numbers"><Toggle checked={settings.showDamageNumbers} onChange={(v) => update({ showDamageNumbers: v })} label="Damage numbers" /></Row>
        <Row label="Screen shake"><Toggle checked={settings.screenShake} onChange={(v) => update({ screenShake: v })} label="Screen shake" /></Row>
        <Row label="Auto potions"><Toggle checked={settings.autoPotions} onChange={(v) => update({ autoPotions: v })} label="Auto potions" /></Row>
      </div>
      <div className="mt-3"><Button className="w-full" variant="danger" size="sm" data-testid="reset-profile"
        onClick={() => askConfirm({ title: 'Reset profile?', body: 'This permanently erases your gold, gems, items, hero rank, quests and records. A fresh profile with the welcome gift is created.', confirmLabel: 'Reset everything', tone: 'danger', onConfirm: () => { resetProfile(); close(false); } })}>Reset profile</Button></div>
      <div className="mt-3"><Button className="w-full" variant="primary" onClick={() => close(false)}>Done</Button></div>
    </Modal>
  );
};
