import React from 'react';
import { PlayerPlate, Currency, MenuButtons, SubMenuButtons } from './TopBars';
import { TownClock } from './TownClock';
import { CornerButtons } from './CornerButtons';
import { RoomPlaque, RoomFade } from './WaveInfo';
import { BossBar } from './BossBar';
import { RoomEventHud } from './RoomEventHud';
import { BossPhaseHud } from './BossPhaseHud';
import { StageTimer } from './StageTimer';
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

    {/* top-left: vitals, plate, quest tracker · top-centre: gold + gems · top-right: menu icons, minimap */}
    <div className="absolute hud-tl flex flex-col gap-2" style={{ left: '1.2rem', top: '1rem' }}><VitalBars /><PlayerPlate /><div className="qt-left"><QuestTracker /></div></div>

    {/* top-centre */}
    <div className="absolute left-0 right-0 flex flex-col items-center gap-3 hud-tc" style={{ top: '.8rem' }}>
      <div className="pe hud-cur"><Currency /></div>
      {/* (owner: the room plaque is gone; this spot shows the targeted monster's HP) */}
      <TargetFrame docked />
      <DailyBadge />
      <ComboMeter touch={device.touch} />
    </div>

    {/* top-right */}
    <div className="absolute flex flex-col items-end gap-3 hud-tr" style={{ right: '1.2rem', top: '1rem' }}>
      <MenuButtons />
      {showMap && <div className="hud-mm hud-mm-top"><Minimap /></div>}
      <TownClock />
      <SubMenuButtons />
    </div>

    {/* bottom-centre: individual skill slots (ult first) + EXP strip along the screen edge */}
    <div className="absolute left-0 right-0 flex justify-center pointer-events-none hud-bottom" style={{ bottom: '1.5rem' }}>
      <SkillRow><ActionBar /></SkillRow>
    </div>
    <ExpStrip />
    {!device.touch && <CornerButtons />}

    {/* boss bar floats above the boss (positioned every frame) */}
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 3 }}><BossBar /><BossBar illusion={0} /><BossBar illusion={1} /></div>
    <RoomEventHud />
    <BossPhaseHud />
    <StageTimer />
    <LevelUpBurst />

    <Announcer />
  </>
  );
};
