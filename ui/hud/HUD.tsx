import React from 'react';
import { PlayerPlate, Currency, MenuButtons } from './TopBars';
import { WavePlaque, Countdown, RespiteBar, SiegeSkip } from './WaveInfo';
import { BossBar } from './BossBar';
import { Minimap } from './Minimap';
import { ActionBar } from './ActionBar';
import { VitalOrb, XpBar } from './Vitals';
import { Announcer, Vignettes } from './Overlays';
import { UltOverlay } from './UltOverlay';
import { useGameStore } from '../../store';

/** In-game HUD. Re-renders only on store changes; per-frame values go through refs. */
export const HUD: React.FC = () => {
  const showMap = useGameStore((s) => s.settings.showMinimap !== false);
  return (
  <>
    <UltOverlay />
    <Vignettes />
    <Countdown />
    <RespiteBar />
    <SiegeSkip />

    {/* top-left */}
    <div className="absolute hud-tl" style={{ left: '1.2rem', top: '1rem' }}><PlayerPlate /></div>

    {/* top-centre */}
    <div className="absolute left-0 right-0 flex flex-col items-center gap-3 hud-tc" style={{ top: '.8rem' }}>
      <div className="pe"><WavePlaque /></div>
      <BossBar />
    </div>

    {/* top-right */}
    <div className="absolute flex flex-col items-end gap-3 hud-tr" style={{ right: '1.2rem', top: '1rem' }}>
      <Currency />
      <MenuButtons />
    </div>

    {/* bottom-right minimap */}
    {showMap && <div className="absolute hud-mm" style={{ right: '2.8rem', bottom: '2.6rem' }}><Minimap /></div>}

    {/* bottom-centre: orbs + (xp + action bar) plate */}
    <div className="absolute left-0 right-0 flex justify-center items-end pointer-events-none hud-bottom" style={{ bottom: '.2rem' }}>
      <div className="flex items-end" style={{ gap: 0 }}>
        <div style={{ marginRight: '-2.2rem', position: 'relative', zIndex: 5 }}><VitalOrb kind="hp" /></div>
        <div className="bar-plate" style={{ marginBottom: '.9rem' }}>
          <XpBar />
          <ActionBar />
        </div>
        <div style={{ marginLeft: '-2.2rem', position: 'relative', zIndex: 5 }}><VitalOrb kind="mp" /></div>
      </div>
    </div>

    <Announcer />
  </>
  );
};
