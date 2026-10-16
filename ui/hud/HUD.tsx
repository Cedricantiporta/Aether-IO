import React from 'react';
import { PlayerPlate, Currency, MenuButtons } from './TopBars';
import { RoomPlaque, RoomFade } from './WaveInfo';
import { BossBar } from './BossBar';
import { RoomEventHud } from './RoomEventHud';
import { LevelUpBurst } from './LevelUpBurst';
import { TargetFrame } from './TargetFrame';
import { Minimap } from './Minimap';
import { ActionBar } from './ActionBar';
import { VitalBars, ExpStrip, SkillRow } from './Vitals';
import { Announcer, Vignettes } from './Overlays';
import { UltOverlay } from './UltOverlay';
import { ComboMeter } from './ComboMeter';
import { QuestTracker } from './QuestTracker';
import { BlindOverlay } from './BlindOverlay';
import { DailyBadge } from './DailyBadge';
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

    {/* top-left: vitals, plate, minimap · top-centre: gold + gems · top-right: menu icons, quest tracker */}
    <div className="absolute hud-tl flex flex-col gap-2" style={{ left: '1.2rem', top: '1rem' }}><VitalBars /><PlayerPlate />{showMap && <div className="hud-mm hud-mm-top hud-mm-left"><Minimap /></div>}</div>

    {/* top-centre */}
    <div className="absolute left-0 right-0 flex flex-col items-center gap-3 hud-tc" style={{ top: '.8rem' }}>
      <div className="pe hud-cur"><Currency /></div>
      <div className="pe"><RoomPlaque /></div>
      <DailyBadge />
      <ComboMeter touch={device.touch} />
    </div>
    {/* the target plate floats over the targeted enemy (screen anchor from CameraRig) */}
    <div className="absolute left-0 top-0 pointer-events-none" style={{ zIndex: 4 }}><TargetFrame /></div>

    {/* top-right */}
    <div className="absolute flex flex-col items-end gap-3 hud-tr" style={{ right: '1.2rem', top: '1rem' }}>
      <MenuButtons />
      <div className="qt-right"><QuestTracker /></div>
    </div>

    {/* bottom-centre: individual skill slots (ult first) + EXP strip along the screen edge */}
    <div className="absolute left-0 right-0 flex justify-center pointer-events-none hud-bottom" style={{ bottom: '1.5rem' }}>
      <SkillRow><ActionBar /></SkillRow>
    </div>
    <ExpStrip />

    {/* boss bar floats above the boss (positioned every frame) */}
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 3 }}><BossBar /><BossBar illusion={0} /><BossBar illusion={1} /></div>
    <RoomEventHud />
    <LevelUpBurst />

    <Announcer />
  </>
  );
};
