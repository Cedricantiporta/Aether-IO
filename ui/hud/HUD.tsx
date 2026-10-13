import React from 'react';
import { PlayerPlate, Currency, MenuButtons } from './TopBars';
import { WavePlaque, Countdown, RespiteBar, SiegeSkip } from './WaveInfo';
import { BossBar } from './BossBar';
import { TargetFrame } from './TargetFrame';
import { Minimap } from './Minimap';
import { ActionBar } from './ActionBar';
import { Announcer, Vignettes } from './Overlays';
import { UltOverlay } from './UltOverlay';
import { ComboMeter } from './ComboMeter';
import { BlindOverlay } from './BlindOverlay';
import { useGameStore } from '../../store';
import { device } from '../../engine/device';

/** In-combat HUD. Minimal: vitals top-left, wave top-centre, menu + minimap top-right. Skills live in
 *  TouchControls (touch) or the ActionBar (desktop). Re-renders only on store changes; per-frame values go through refs. */
export const HUD: React.FC = () => {
  const showMap = useGameStore((s) => s.settings.showMinimap !== false);
  return (
    <>
      <UltOverlay />
      <BlindOverlay />
      {!device.touch && <ComboMeter />}
      <Vignettes />
      <Countdown />
      <RespiteBar />
      <SiegeSkip />

      <div className="hud-tl"><PlayerPlate /></div>

      <div className="hud-tc">
        <WavePlaque />
        <BossBar />
        <TargetFrame />
      </div>

      <div className="hud-tr">
        <div className="hud-row"><Currency /><MenuButtons /></div>
        {showMap && <Minimap />}
      </div>

      {!device.touch && <ActionBar />}
      <Announcer />
    </>
  );
};
