import React, { useRef, useState } from 'react';
import { Skull, Home, ChevronsDown } from 'lucide-react';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { Button } from '../components/Button';
import { Panel, Ribbon } from '../components/Frame';
import { SkullGlyph } from '../components/SkillIcons';
import { ROOMS_PER_BIOME, BIOMES, BOSS_INDEX, PREBOSS_INDEX, biomeOf, loopOf, shownDepth } from '../../engine/roomDefs';
import { bossKeyState, descend, finishRunVictory, towerState } from '../../engine/systems/director';
import { runInfo } from '../../engine/runMods';
import { useGameStore } from '../../store';
import { GameStatus } from '../../types';
import { GATES, GATE_KEYS_NEEDED, gateState } from '../../engine/gates';

/** Short sub-line under the pips. */
function subText(): string {
  const d = world.director, r = world.room, t = r.plan.type;
  if (d.phase === 'BIOME_DONE') return `${biomeOf(r.biome).name} conquered`;
  if (d.phase === 'LEAVING') return '';
  if (t === 'GATEKEEPER') return gateState.keys >= GATE_KEYS_NEEDED ? `Gate Keys ${gateState.keys}/${GATE_KEYS_NEEDED} · the Dark Castle is open` : `Gate Keys ${gateState.keys}/${GATE_KEYS_NEEDED} · enter a gate (E)`;
  if (d.phase === 'CLEARED') {
    if (r.plan.gate !== undefined) return `Gate Keys ${gateState.keys}/${GATE_KEYS_NEEDED} · press E at the portal`;
    if (t === 'FOUNTAIN' || t === 'MERCHANT') return 'Take a breath, then pick an exit';
    if (t === 'TREASURE' && r.station.kind === 'CHEST' && !r.station.used) return 'Open the chest, then pick an exit';
    if (t === 'CRYSTAL') return 'Harvest the crystals, then press E at an exit';
    if (t === 'CAMP') return 'Rest: store loot, train skills, then pick an exit';
    if (t === 'SHRINE' && !r.shrineOn && !r.station.used) return 'Touch the altar for a challenge, or leave';
    return 'Room cleared - pick an exit';
  }
  if (r.plan.gate !== undefined) { const g = GATES[r.plan.gate]; return `Trial ${(r.plan.step ?? 0) + 1}/${g.steps.length}${t === 'BOSS' ? '' : ` · Enemies left: ${r.enemiesLeft}`}`; }
  if (t === 'BOSS') return r.enemiesLeft > 0 ? 'Boss fight' : '';
  if (t === 'DUEL') return r.enemiesLeft > 0 ? 'Champion duel' : '';
  return `Enemies left: ${r.enemiesLeft}`;
}

/** Top-centre run plaque: biome name, room-progress pips (boss skull at the end), enemies left. Pure ref/DOM updates. */
export const RoomPlaque: React.FC = () => {
  const name = useRef<HTMLSpanElement>(null);
  const depth = useRef<HTMLSpanElement>(null);
  const sub = useRef<HTMLSpanElement>(null);
  const pips = useRef<(HTMLElement | null)[]>([]);
  const sig = useRef('');
  const pipSig = useRef('');

  useRaf(() => {
    const r = world.room, d = world.director;
    if (!r.active) return;
    const text = subText();
    const key = `${r.biome}|${r.index}|${d.wave}|${text}|${towerState.floor}|${world.boss.name}|${bossKeyState.has}|${r.plan.type}|${r.plan.gate}`;
    if (key !== sig.current) {
      sig.current = key;
      const loop = loopOf(r.biome);
      const tower = runInfo.mode === 'TOWER', throne = r.plan.type === 'BOSS' && r.biome === BIOMES.length - 1 && world.boss.name === 'Malakar the Undying';
      const gname = r.plan.type === 'GATEKEEPER' ? 'The Gatekeeper' : r.plan.gate !== undefined ? GATES[r.plan.gate].name : '';
      if (name.current) name.current.textContent = tower ? 'Endless Tower' : throne ? 'The Undying Throne' : gname || biomeOf(r.biome).name + (loop > 0 ? ` +${loop}` : '');
      if (depth.current) depth.current.textContent = tower ? `Floor ${towerState.floor}` : `Depth ${shownDepth(r.biome % BIOMES.length, r.plan.type === 'BOSS' ? BOSS_INDEX : r.index)}${runInfo.ascension > 0 ? ` · Ascension ${runInfo.ascension}` : ''}`;
      if (sub.current) sub.current.textContent = text + (bossKeyState.has && r.plan.type !== 'BOSS' ? '  ·  Boss Key ✓' : '');
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
    <div className="wplaque room-pill pe" data-testid="room-plaque">
      <svg className="bg" viewBox="0 0 400 110" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="wp-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a2c22" /><stop offset=".5" stopColor="#1c1511" /><stop offset="1" stopColor="#0d0a08" /></linearGradient>
          <linearGradient id="wp-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8b5a16" /><stop offset=".3" stopColor="#fff0b0" /><stop offset=".5" stopColor="#c8962e" /><stop offset=".7" stopColor="#fff0b0" /><stop offset="1" stopColor="#8b5a16" /></linearGradient>
        </defs>
        <path d="M20 8 H380 L394 22 L388 40 L398 58 L380 96 H20 L2 58 L12 40 L6 22Z" fill="url(#wp-w)" stroke="#050304" strokeWidth="5" strokeLinejoin="round" />
        <path d="M20 8 H380 L394 22 L388 40 L398 58 L380 96 H20 L2 58 L12 40 L6 22Z" fill="none" stroke="url(#wp-g)" strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M30 15 H370 L382 28 L378 82 L366 90 H34 L22 82 L18 28Z" fill="none" stroke="#c8962e" strokeOpacity=".35" strokeWidth="1" />
      </svg>
      <div className="wtitle"><span ref={name}>Meadow</span></div>
      <div className="wdepth"><span ref={depth}>Depth 1</span></div>
      <div className="pips" aria-hidden>
        {Array.from({ length: ROOMS_PER_BIOME }, (_, i) => <i key={i} className={`pip ${i === PREBOSS_INDEX ? 'mini' : ''}`} data-s="todo" ref={(el) => { pips.current[i] = el; }} />)}
        <i className="pip boss" data-s="todo" ref={(el) => { pips.current[ROOMS_PER_BIOME] = el; }}><Skull size={11} /></i>
      </div>
      <div className="wsub"><span ref={sub} data-testid="room-sub">Enemies left: 0</span></div>
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
    <div className="absolute inset-0 pe flex items-center justify-center" style={{ zIndex: 90, background: 'radial-gradient(ellipse at center, rgba(20,12,4,.6), rgba(5,3,2,.88))' }} data-testid="biome-choice">
      <div className="flex flex-col items-center" style={{ width: 'min(26rem, 94vw)' }}>
        <div className="z-10 -mb-3"><Ribbon tone="gold" className="!text-[1.05rem]">{cur.name} conquered</Ribbon></div>
        <Panel className="w-full p-5 pt-6">
          <div className="text-center text-sm mb-4" style={{ color: 'var(--text-dim)' }}>The way onward is open. Bank your spoils, or press deeper for better loot.</div>
          <div className="flex flex-col gap-3">
            <Button variant="primary" size="lg" onClick={descend} pulse data-testid="descend"><ChevronsDown size={18} /> Descend to {next.name}</Button>
            <Button size="lg" onClick={finishRunVictory} data-testid="return-town"><Home size={18} /> Return to town</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
};
