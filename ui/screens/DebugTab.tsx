import { playNextDream } from './DreamOverlay';
import { markDreamSeen } from '../../dreams';
// Settings > Debug: cheats for testing (god mode, currencies, skills, rank) and jumping to any biome / room / boss.
import React, { useState } from 'react';
import { useGameStore } from '../../store';
import { Button, Toggle } from '../components/Button';
import { useUiStore } from '../uiStore';
import { debug, setDebug } from '../../engine/debug';
import { debugJump, debugMalakar, debugHumanBoss, debugDarkHero, debugTowerHuman } from '../../engine/systems/director';
import { HUMAN_KINDS, HUMAN_INFO } from '../../engine/systems/humanBosses';
import { DARK_CLASSES, DARK_NAMES } from '../../engine/systems/darkHero';
import { ally, debugAlly } from '../../engine/systems/ally';
import { riruru } from '../../engine/systems/riruru';
import { world } from '../../engine/world';
import { runInfo } from '../../engine/runMods';
import { BIOMES, BOSS_INDEX, ROOMS_PER_BIOME } from '../../engine/roomDefs';
import { BOSS_ROTATION, BOSS_NAMES } from '../../engine/enemyDefs';
import { talentsOf } from '../../talents';
import { gateOpen, storyIdx, STORY_V } from '../../story';
import { GameStatus } from '../../types';
import type { RoomType } from '../../engine/types';

const BIG = 999_999_999;
const ROOM_TYPES: { v: RoomType; l: string }[] = [
  { v: 'COMBAT', l: 'Skirmish' }, { v: 'ELITE', l: 'Elite hunt' }, { v: 'MINIBOSS', l: 'Champion (mini-boss)' }, { v: 'TREASURE', l: 'Treasure' },
  { v: 'FOUNTAIN', l: 'Fountain' }, { v: 'MERCHANT', l: 'Merchant' }, { v: 'SHRINE', l: 'Shrine' }, { v: 'CRYSTAL', l: 'Crystal cavern' }, { v: 'BOSS', l: 'Boss' },
  { v: 'DUEL', l: 'Dark champion duel' }, { v: 'GATEKEEPER', l: 'Gatekeeper (5 gates)' },
];

const Line: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="flex items-center gap-4 py-2" style={{ minHeight: '2.6rem' }}>
    <div className="shrink-0" style={{ width: '9.5rem' }}>
      <div className="rpg-label !text-[.72rem]">{label}</div>
      {hint && <div style={{ fontSize: '.58rem', color: 'var(--text-dim)', lineHeight: 1.2, marginTop: '.1rem' }}>{hint}</div>}
    </div>
    <div className="flex-1 flex flex-wrap items-center justify-end gap-2">{children}</div>
  </div>
);

const toast = (msg: string) => useGameStore.getState().addNotification(msg, '#7dd3fc', 'SYSTEM');

function unlockAdventure() {
  const st = useGameStore.getState();
  if (gateOpen(st.story)) { toast('Debug: the adventure is already open'); return; }
  useGameStore.setState({ story: { step: storyIdx('king') + 1, p: 0, v: STORY_V } });   // no step rewards (direct set)
  toast('Debug: adventure unlocked');
}
function maxCurrencies() {
  const s = useGameStore.getState();
  useGameStore.setState({ gold: BIG, gems: BIG, materials: { COMMON: 99_999, UNCOMMON: 0, RARE: 99_999, EPIC: 99_999, LEGENDARY: 99_999, MYTHIC: 99_999 } });
  void s; toast('Debug: gold, gems and shards maxed');
}
function maxRankAndTalents() {
  useGameStore.getState().debugSetLevel(Math.max(useGameStore.getState().level, 40));
  const nodes = talentsOf(useGameStore.getState().hero);
  for (let pass = 0; pass < 12; pass++) {
    let any = false;
    for (const n of nodes) while (useGameStore.getState().allocateTalent(n.id)) any = true;
    if (!any) break;
  }
  toast('Debug: Lv 40 + every talent maxed');
}
const MAX_RANK = 50;   // = classLevels MAX_LEVEL
function setRank(r: number) {
  useGameStore.getState().debugSetLevel(Math.max(1, Math.min(MAX_RANK, r)));
  toast(`Debug: class level ${useGameStore.getState().level}`);
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
    if (!inRun) st.startMode('ADVENTURE');
    if (st.isPauseMenuOpen) st.togglePause();
    debugJump(biome, type === 'BOSS' ? BOSS_INDEX : room, type);
    useUiStore.getState().openSettings(false);
  };
  const fight = (jump: () => void) => {
    const st = useGameStore.getState();
    if (!inRun) st.startMode('ADVENTURE');
    if (st.isPauseMenuOpen) st.togglePause();
    jump();
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
    <Line label="Town time" hint="Sets the town's time of day (the clock keeps running). The next run snapshots it as its time of day (Greenwood d1-10, Desert, Isles, Frostpeak).">
      {([['Morning', 0.15], ['Noon', 0.25], ['Dusk', 0.5], ['Night', 0.75]] as const).map(([l, t]) => <Button key={l} size="sm" data-testid={`dbg-time-${l.toLowerCase()}`} onClick={() => { world.townTime = t; toast(`Debug: town time ${l.toLowerCase()}`); }}>{l}</Button>)}
    </Line>
    <Line label="Unlock adventure" hint="Skips the opening story steps so the Adventure Portal is open right away (main quest jumps to the King's first task).">
      <Button size="sm" onClick={unlockAdventure} data-testid="dbg-unlock-adv">Unlock now</Button>
    </Line>
    <Line label="Boss shortcuts">
      <Button size="sm" data-testid="dbg-biomes-done" onClick={() => { const s = useGameStore.getState(); useGameStore.setState({ progress: { ...s.progress, biomesDone: BIOMES.map((_, i) => i), shortcutSeen: false } }); toast('Debug: all biomes completed (shortcut door in room 5 or 7)'); }}>Mark all biomes completed</Button>
      <Button size="sm" onClick={() => { const s = useGameStore.getState(); useGameStore.setState({ progress: { ...s.progress, biomesDone: [], shortcutSeen: false } }); toast('Debug: biome completions cleared'); }}>Clear</Button>
    </Line>
    <Line label="Currencies"><Button size="sm" onClick={maxCurrencies} data-testid="dbg-money">Max gold / gems / shards</Button></Line>
    <Line label="Class level" hint="Unlocks every rank-gated item and enough talent points for all talents.">
      <Button size="sm" onClick={() => setRank(useGameStore.getState().heroRank + 1)}>+1</Button>
      <Button size="sm" onClick={() => setRank(useGameStore.getState().heroRank + 10)}>+10</Button>
      <Button size="sm" onClick={() => setRank(MAX_RANK)} data-testid="dbg-max-rank">Max level ({MAX_RANK})</Button>
    </Line>
    <Line label="Level & talents"><Button size="sm" onClick={maxRankAndTalents}>Lv 40 + all talents</Button></Line>
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
    <Line label="Special fights" hint="Malakar: the Void throne room. Riruru: a Greenwood room; the blue slime hops in once you clear it.">
      <Button size="sm" data-testid="dbg-malakar" onClick={() => fight(() => debugMalakar())}>Fight Malakar</Button>
      <Button size="sm" data-testid="dbg-riruru" onClick={() => fight(() => { riruru.force = true; debugJump(0, 1, 'COMBAT'); useGameStore.getState().addNotification('Debug: clear this room and Riruru appears.', '#6cc4ff', 'SYSTEM'); })}>Fight Riruru</Button>
    </Line>
    <Line label="Humanoid mini boss" hint="Fight Varn / Sable / Rook in a champion room of the biome and room chosen above.">
      {HUMAN_KINDS.map((k) => <Button key={k} size="sm" data-testid={`dbg-human-${k.toLowerCase()}`} onClick={() => fight(() => debugHumanBoss(biome, room, k))}>Fight humanoid mini boss: {HUMAN_INFO[k].name}</Button>)}
    </Line>
    <Line label="Tower humanoid mini boss" hint="Starts the Endless Tower (if needed) and jumps to floor 15 (a champion floor) with a humanoid mini boss.">
      {HUMAN_KINDS.map((k) => <Button key={k} size="sm" data-testid={`dbg-tower-human-${k.toLowerCase()}`} onClick={() => { const st = useGameStore.getState(); if (!(inRun && runInfo.mode === 'TOWER')) st.startMode('TOWER'); if (st.isPauseMenuOpen) st.togglePause(); debugTowerHuman(15, k); useUiStore.getState().openSettings(false); }}>Tower floor 15: {HUMAN_INFO[k].name}</Button>)}
    </Line>
    <Line label="Fight Dark Hero" hint="A dark champion duel of the class you pick, in the biome and room chosen above.">
      {DARK_CLASSES.map((c) => <Button key={c} size="sm" data-testid={`dbg-dark-${c.toLowerCase()}`} onClick={() => fight(() => debugDarkHero(biome, room, c))}>{DARK_NAMES[c].name.replace('The ', '')}</Button>)}
    </Line>
    <Line label="Ally encounter" hint="An adventurer fights beside you for one combat room (normally once per biome). Fight: a fresh Greenwood room with the ally. Join now: adds the ally to the fight you are in (or, between fights, to the next combat room).">
      <Button size="sm" data-testid="dbg-ally" onClick={() => fight(() => { ally.force = true; debugJump(0, 1, 'COMBAT'); })}>Fight with ally</Button>
      <Button size="sm" disabled={!inRun} data-testid="dbg-ally-now" onClick={() => { toast(debugAlly() ? 'Debug: ally joined the fight' : 'Debug: ally will join the next combat room'); }}>Join now</Button>
    </Line>
    <Line label="Erin's rockfall" hint="Break the boulders on the old miners' road now (Erin's Lv 30 quest chain marked done), or put them back.">
      <Button size="sm" onClick={() => { const s = useGameStore.getState(); useGameStore.setState({ npcQuests: { ...s.npcQuests, q: { ...s.npcQuests.q, erin_boulder: { s: 2, p: 1 }, erin_frost: { s: 2, p: 0 } } } }); toast('Debug: the rockfall is broken'); }}>Break it</Button>
      <Button size="sm" onClick={() => { const s = useGameStore.getState(), q = { ...s.npcQuests.q }; delete q.erin_boulder; delete q.erin_frost; useGameStore.setState({ npcQuests: { ...s.npcQuests, q } }); toast('Debug: rockfall restored (re-enter town)'); }}>Restore</Button>
    </Line>
    <Line label="Dreams" hint="In town: play the next Font dream now (ignores its milestone), or forget all of them.">
      <Button size="sm" disabled={inRun} onClick={() => { useUiStore.getState().openSettings(false); setTimeout(() => playNextDream(), 200); }}>Play next dream</Button>
      <Button size="sm" onClick={() => markDreamSeen(0)}>Reset dreams</Button>
    </Line>
    <div className="py-2"><Button className="w-full" variant="primary" onClick={go} data-testid="dbg-go">{inRun ? 'Jump now' : 'Start run here'}</Button></div>
  </>);
};
