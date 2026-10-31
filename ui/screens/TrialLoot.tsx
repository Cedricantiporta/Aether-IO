// Boss Trial loot panel (owner 2026-10-31): after the win the drops lie on the arena floor as normal pickups. This centred panel offers "Stay a while" (dismiss, keep looting;
// a small "Return to the portal" button stays in the corner) and "Return to town". Warns when items cannot be picked up (bag full) and that leaving loses what is still on the floor.
// Reads the world through a light rAF poll; React state only changes when the counts change (no per-frame setState).
import React, { useRef, useState } from 'react';
import { useRaf } from '../hooks/useRaf';
import { trial } from '../../bossTrials';
import { leaveTrial, trialGround } from '../../engine/systems/trialRun';
import { biomeOf, bossNameIn } from '../../engine/roomDefs';
import './trials.css';

export const TrialLootPanel: React.FC = () => {
  const [v, setV] = useState({ won: false, stay: false, n: 0, full: 0, boss: 0 });
  const last = useRef(v);
  useRaf(() => {
    const g = trial.on && trial.won ? trialGround() : { n: 0, full: 0 };
    const nv = { won: trial.on && trial.won, stay: trial.stay, n: g.n, full: g.full, boss: trial.boss };
    const o = last.current;
    if (nv.won !== o.won || nv.stay !== o.stay || nv.n !== o.n || nv.full !== o.full || nv.boss !== o.boss) { last.current = nv; setV(nv); }
  });
  if (!v.won) return null;
  const nm = bossNameIn(biomeOf(v.boss).boss, v.boss).name;
  const back = leaveTrial;
  if (v.stay) {
    return <button type="button" className="tl-corner" data-testid="trial-return-corner" onClick={back}>Return to the portal{v.n > 0 && <small>{v.n} item{v.n > 1 ? 's' : ''} left on the ground</small>}</button>;
  }
  return (
    <div className="tl-wrap">
      <div className="tl-card" data-testid="trial-loot-panel">
        <h3>Trial cleared!</h3>
        <p>{nm} is down.{v.n > 0 ? ` Your loot is on the ground: walk over it to pick it up.` : ' All your loot is in your bag.'}</p>
        {v.full > 0 && <p className="tl-warn" data-testid="trial-bag-full">Your bag is full - {v.full} item{v.full > 1 ? 's' : ''} left on the ground.</p>}
        {v.n > 0 && <p className="tl-lost" data-testid="trial-lost-note">Leaving now loses the {v.n} item{v.n > 1 ? 's' : ''} still on the ground.</p>}
        <div className="bt-btns">
          <button type="button" className="bt-btn blue" data-testid="trial-stay" onClick={() => { trial.stay = true; }}>Stay a while</button>
          <button type="button" className="bt-btn go" data-testid="trial-return" onClick={back}>Return to town</button>
        </div>
      </div>
    </div>
  );
};
