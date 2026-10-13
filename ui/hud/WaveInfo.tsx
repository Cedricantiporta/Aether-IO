import React, { useRef, useState } from 'react';
import { Skull, Home, ChevronsDown } from 'lucide-react';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { Button } from '../components/Button';
import { ROOMS_PER_BIOME, BIOMES, biomeOf, loopOf } from '../../engine/roomDefs';
import { descend, finishRunVictory } from '../../engine/systems/director';
import { useGameStore } from '../../store';
import { GameStatus } from '../../types';

/** Short sub-line under the pips. */
function subText(): string {
  const d = world.director, r = world.room, t = r.plan.type;
  if (d.phase === 'BIOME_DONE') return `${biomeOf(r.biome).name} conquered`;
  if (d.phase === 'LEAVING') return '';
  if (d.phase === 'CLEARED') {
    if (t === 'FOUNTAIN' || t === 'MERCHANT') return 'Take a breath, then pick an exit';
    if (t === 'TREASURE' && r.station.kind === 'CHEST' && !r.station.used) return 'Open the chest, then pick an exit';
    if (t === 'SHRINE' && !r.shrineOn && !r.station.used) return 'Touch the altar for a challenge, or leave';
    return 'Room cleared - pick an exit';
  }
  if (t === 'BOSS') return r.enemiesLeft > 0 ? 'Boss fight' : '';
  return `Enemies left: ${r.enemiesLeft}`;
}

/** Top-centre run plaque: biome name, room-progress pips (boss skull at the end), enemies left. Pure ref/DOM updates. */
export const RoomPlaque: React.FC = () => {
  const name = useRef<HTMLSpanElement>(null);
  const depth = useRef<HTMLSpanElement>(null);
  const sub = useRef<HTMLDivElement>(null);
  const pips = useRef<(HTMLElement | null)[]>([]);
  const sig = useRef('');
  const pipSig = useRef('');

  useRaf(() => {
    const r = world.room, d = world.director;
    if (!r.active) return;
    const text = subText();
    const key = `${r.biome}|${d.wave}|${text}`;
    if (key !== sig.current) {
      sig.current = key;
      const loop = loopOf(r.biome);
      if (name.current) name.current.textContent = biomeOf(r.biome).name + (loop > 0 ? ` +${loop}` : '');
      if (depth.current) depth.current.textContent = `Depth ${d.wave}`;
      if (sub.current) sub.current.textContent = text;
    }
    const done = d.phase === 'CLEARED' || d.phase === 'BIOME_DONE';
    const pk = `${r.biome}|${r.index}|${done ? 1 : 0}`;
    if (pk !== pipSig.current) {
      pipSig.current = pk;
      for (let i = 0; i <= ROOMS_PER_BIOME; i++) {
        const el = pips.current[i]; if (!el) continue;
        el.dataset.s = i < r.index || (i === r.index && done) ? 'done' : i === r.index ? 'cur' : 'todo';
      }
    }
  });

  return (
    <div className="wave-pill room-pill glass pe" data-testid="room-plaque">
      <div className="wt"><span ref={name}>Meadow</span><span className="tm" ref={depth}>Depth 1</span></div>
      <div className="pips" aria-hidden>
        {Array.from({ length: ROOMS_PER_BIOME }, (_, i) => <i key={i} className="pip" data-s="todo" ref={(el) => { pips.current[i] = el; }} />)}
        <i className="pip boss" data-s="todo" ref={(el) => { pips.current[ROOMS_PER_BIOME] = el; }}><Skull size={11} /></i>
      </div>
      <div className="wsub" ref={sub} data-testid="room-sub">Enemies left: 0</div>
    </div>
  );
};

/** Full-screen black overlay for the 0.4 s room transitions (opacity follows world.room.fade). */
export const RoomFade: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(-1);
  useRaf(() => {
    const f = Math.round(world.room.fade * 100) / 100;
    if (f === last.current || !ref.current) return;
    last.current = f;
    ref.current.style.opacity = String(f);
    ref.current.style.visibility = f > 0 ? 'visible' : 'hidden';
  });
  return <div ref={ref} className="room-fade" style={{ opacity: 1 }} />;
};

/** After a boss: bank the run or descend into the next biome. Shown once the loot has been collected. */
export const BiomeChoice: React.FC = () => {
  const [show, setShow] = useState(false);
  const shown = useRef(false);
  const status = useGameStore((s) => s.status);
  useRaf(() => {
    const on = world.director.phase === 'BIOME_DONE' && world.director.phaseT > 1.6 && world.room.fade < 0.05;
    if (on !== shown.current) { shown.current = on; setShow(on); }
  });
  if (!show || status !== GameStatus.PLAYING) return null;
  const b = world.room.biome;
  const cur = biomeOf(b), next = BIOMES[(b + 1) % BIOMES.length];
  return (
    <div className="absolute inset-0 pe go-root" style={{ zIndex: 90 }} data-testid="biome-choice">
      <div className="go-card paper" style={{ width: 'min(26rem, 100%)' }}>
        <div className="px-5 pt-5 pb-2 text-center">
          <div className="text-2xl font-extrabold leading-tight">{cur.name} conquered</div>
          <div className="text-sm font-semibold text-[var(--fg-2)] mt-1">The way onward is open. Bank your spoils, or press deeper for better loot.</div>
        </div>
        <div className="flex flex-col gap-3 p-5">
          <Button variant="primary" size="lg" onClick={descend} pulse data-testid="descend"><ChevronsDown size={18} /> Descend to {next.name}</Button>
          <Button size="lg" onClick={finishRunVictory} data-testid="return-town"><Home size={18} /> Return to town</Button>
        </div>
      </div>
    </div>
  );
};
