// Settings > Debug: cheats for testing (god mode, currencies, skills, rank) and jumping to any biome / room / boss.
import React, { useState } from 'react';
import { useGameStore } from '../../store';
import { Button, Toggle } from '../components/Button';
import { useUiStore } from '../uiStore';
import { debug, setDebug } from '../../engine/debug';
import { debugJump } from '../../engine/systems/director';
import { world } from '../../engine/world';
import { BIOMES, BOSS_INDEX, ROOMS_PER_BIOME } from '../../engine/roomDefs';
import { BOSS_ROTATION, BOSS_NAMES } from '../../engine/enemyDefs';
import { talentsOf } from '../../talents';
import { GameStatus } from '../../types';
import type { RoomType } from '../../engine/types';

const BIG = 999_999_999;
const ROOM_TYPES: { v: RoomType; l: string }[] = [
  { v: 'COMBAT', l: 'Skirmish' }, { v: 'ELITE', l: 'Elite hunt' }, { v: 'MINIBOSS', l: 'Champion (mini-boss)' }, { v: 'TREASURE', l: 'Treasure' },
  { v: 'FOUNTAIN', l: 'Fountain' }, { v: 'MERCHANT', l: 'Merchant' }, { v: 'SHRINE', l: 'Shrine' }, { v: 'CRYSTAL', l: 'Crystal cavern' }, { v: 'BOSS', l: 'Boss' },
];

const Line: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="flex items-center gap-4 py-2 border-b border-black/30 last:border-0" style={{ minHeight: '2.6rem' }}>
    <div className="shrink-0" style={{ width: '9.5rem' }}>
      <div className="rpg-label !text-[.72rem]">{label}</div>
      {hint && <div style={{ fontSize: '.58rem', color: 'var(--text-dim)', lineHeight: 1.2, marginTop: '.1rem' }}>{hint}</div>}
    </div>
    <div className="flex-1 flex flex-wrap items-center justify-end gap-2">{children}</div>
  </div>
);

const toast = (msg: string) => useGameStore.getState().addNotification(msg, '#7dd3fc', 'SYSTEM');

function maxCurrencies() {
  const s = useGameStore.getState();
  useGameStore.setState({ gold: BIG, gems: BIG, materials: { COMMON: 99_999, RARE: 99_999, EPIC: 99_999, LEGENDARY: 99_999, MYTHIC: 99_999 } });
  void s; toast('Debug: gold, gems and shards maxed');
}
function maxRankAndTalents() {
  useGameStore.setState({ heroRank: Math.max(useGameStore.getState().heroRank, 40) });
  const nodes = talentsOf(useGameStore.getState().hero);
  for (let pass = 0; pass < 12; pass++) {
    let any = false;
    for (const n of nodes) while (useGameStore.getState().allocateTalent(n.id)) any = true;
    if (!any) break;
  }
  toast('Debug: hero rank 40 + every talent maxed');
}
function levelUp(n: number) {
  const st = useGameStore.getState();
  for (let i = 0; i < n; i++) st.addExperience(useGameStore.getState().experienceToNextLevel);
}

export const DebugTab: React.FC = () => {
  const [, force] = useState(0);
  const flip = (k: 'god' | 'oneHit' | 'maxSkills', v: boolean) => { setDebug({ [k]: v }); force((x) => x + 1); };
  const status = useGameStore((s) => s.status);
  const inRun = status === GameStatus.PLAYING || status === GameStatus.PAUSED || status === GameStatus.LEVEL_UP;
  const [biome, setBiome] = useState(Math.max(0, world.room.biome || 0));
  const [room, setRoom] = useState(0);
  const [type, setType] = useState<RoomType>('COMBAT');
  const [boss, setBoss] = useState<string>(debug.bossOverride);

  const go = () => {
    setDebug({ bossOverride: (boss || '') as typeof debug.bossOverride });
    const st = useGameStore.getState();
    if (!inRun) st.startGame();
    if (st.isPauseMenuOpen) st.togglePause();
    debugJump(biome, type === 'BOSS' ? BOSS_INDEX : room, type);
    useUiStore.getState().openSettings(false);
  };
  const sel = (v: string | number, on: (v: string) => void, opts: { v: string | number; l: string }[], tid: string) => (
    <select className="wh-search pe" style={{ width: 'auto', minWidth: '8.5rem' }} value={v} onChange={(e) => on(e.target.value)} data-testid={tid}>
      {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );

  return (<>
    <div className="py-1.5" style={{ fontSize: '.7rem', color: '#7dd3fc' }}>Testing tools. They change your real save (currencies, rank, talents).</div>
    <Line label="God mode" hint="Your hero takes no damage."><Toggle checked={debug.god} onChange={(v) => flip('god', v)} label="God mode" /></Line>
    <Line label="One-hit kills" hint="Every hit kills, bosses included."><Toggle checked={debug.oneHit} onChange={(v) => flip('oneHit', v)} label="One-hit kills" /></Line>
    <Line label="Max skills" hint="Every run starts with all of this hero's skills at max level."><Toggle checked={debug.maxSkills} onChange={(v) => { flip('maxSkills', v); if (v && inRun) useGameStore.getState().debugMaxSkills(); }} label="Max skills" /></Line>
    <Line label="Currencies"><Button size="sm" onClick={maxCurrencies} data-testid="dbg-money">Max gold / gems / shards</Button></Line>
    <Line label="Rank & talents"><Button size="sm" onClick={maxRankAndTalents}>Rank 40 + all talents</Button></Line>
    <Line label="This run" hint={inRun ? undefined : 'Start a run first.'}>
      <Button size="sm" disabled={!inRun} onClick={() => useGameStore.getState().debugMaxSkills()}>Max skills now</Button>
      <Button size="sm" disabled={!inRun} onClick={() => useGameStore.setState((s) => ({ skillPoints: s.skillPoints + 99 }))}>+99 SP</Button>
      <Button size="sm" disabled={!inRun} onClick={() => levelUp(10)}>+10 levels</Button>
    </Line>
    <div className="rpg-label !text-[.66rem] mt-3 mb-1">Jump to</div>
    <Line label="Biome">{sel(biome, (v) => setBiome(+v), BIOMES.map((b, i) => ({ v: i, l: `${i + 1}. ${b.name}` })), 'dbg-biome')}</Line>
    <Line label="Room">
      {sel(type, (v) => setType(v as RoomType), ROOM_TYPES, 'dbg-type')}
      {type !== 'BOSS' && sel(room, (v) => setRoom(+v), Array.from({ length: ROOMS_PER_BIOME }, (_, i) => ({ v: i, l: `Room ${i + 1}` })), 'dbg-room')}
    </Line>
    <Line label="Boss" hint="Used by boss rooms (Default = the biome's own boss).">
      {sel(boss, setBoss, [{ v: '', l: 'Default' }, ...BOSS_ROTATION.map((k) => ({ v: k, l: BOSS_NAMES[k].name }))], 'dbg-boss')}
    </Line>
    <div className="py-2"><Button className="w-full" variant="primary" onClick={go} data-testid="dbg-go">{inRun ? 'Jump now' : 'Start run here'}</Button></div>
  </>);
};
