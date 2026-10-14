import React from 'react';
import { PlayerPlate, Currency, MenuButtons } from './TopBars';
import { RoomPlaque, RoomFade, BiomeChoice } from './WaveInfo';
import { BossBar } from './BossBar';
import { TargetFrame } from './TargetFrame';
import { Minimap } from './Minimap';
import { ActionBar } from './ActionBar';
import { VitalBars, ExpStrip, SkillRow } from './Vitals';
import { Announcer, Vignettes } from './Overlays';
import { UltOverlay } from './UltOverlay';
import { ComboMeter } from './ComboMeter';
import { BlindOverlay } from './BlindOverlay';
import { device } from '../../engine/device';
import { useGameStore } from '../../store';

/** In-game HUD. Re-renders only on store changes; per-frame values go through refs. */
export const HUD: React.FC = () => {
  const showMap = useGameStore((s) => s.settings.showMinimap !== false);
  return (
  <>
    <UltOverlay />
    <BlindOverlay />
    <Vignettes />
    <RoomFade />
    <BiomeChoice />

    {/* top-left */}
    <div className="absolute hud-tl flex flex-col gap-2" style={{ left: '1.2rem', top: '1rem' }}><VitalBars /><PlayerPlate /></div>

    {/* top-centre */}
    <div className="absolute left-0 right-0 flex flex-col items-center gap-3 hud-tc" style={{ top: '.8rem' }}>
      <div className="pe"><RoomPlaque /></div>
      <BossBar />
      <ComboMeter touch={device.touch} />
      <TargetFrame />
    </div>

    {/* top-right */}
    <div className="absolute flex flex-col items-end gap-3 hud-tr" style={{ right: '1.2rem', top: '1rem' }}>
      <Currency />
      <MenuButtons />
    </div>

    {/* bottom-right minimap */}
    {showMap && <div className="absolute hud-mm" style={{ right: '2.8rem', bottom: '2.6rem' }}><Minimap /></div>}

    {/* bottom-centre: individual skill slots (ult first) + EXP strip along the screen edge */}
    <div className="absolute left-0 right-0 flex justify-center pointer-events-none hud-bottom" style={{ bottom: '1.5rem' }}>
      <SkillRow><ActionBar /></SkillRow>
    </div>
    <ExpStrip />

    <Announcer />
  </>
  );
};
