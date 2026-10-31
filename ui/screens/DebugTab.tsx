import { playNextDream } from './DreamOverlay';
import { markDreamSeen } from '../../dreams';
// Settings > Debug: cheats for testing in collapsible sections (Hero, Items & currency, Run / rooms, Story & world, Toggles).
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGameStore, instantiate, makeItemById } from '../../store';
import { Button, Toggle } from '../components/Button';
import { useUiStore } from '../uiStore';
import { debug, setDebug } from '../../engine/debug';
import { debugJump, debugHerald, debugHumanBoss, debugDarkHero, debugTowerHuman } from '../../engine/systems/director';
import { HUMAN_KINDS, HUMAN_INFO } from '../../engine/systems/humanBosses';
import { DARK_CLASSES, DARK_NAMES } from '../../engine/systems/darkHero';
import { ally, debugAlly } from '../../engine/systems/ally';
import { riruru } from '../../engine/systems/riruru';
import { world } from '../../engine/world';
import { runInfo } from '../../engine/runMods';
import { BIOMES, BOSS_INDEX, ROOMS_PER_BIOME } from '../../engine/roomDefs';
import { BOSS_ROTATION, BOSS_NAMES } from '../../engine/enemyDefs';
import { talentsOf } from '../../talents';
import { STORY } from '../../story';
import { killEnemy } from '../../engine/systems/combat';
import { CRAFT_MAT_NAMES } from '../../crafting';
import { LOOT_BY_NAME, LOOT_STACK_LIMIT, lootItem } from '../../loot';
import { ITEMS_POOL, WAREHOUSE_LIMIT, POTION_STACK_LIMIT } from '../../constants';
import { canUseClass } from '../../itemClass';
import { techLv } from '../../tech';
import { GameStatus } from '../../types';
import type { RoomType } from '../../engine/types';
import type { Item, ItemGrade, Rarity } from '../../types';

const BIG = 999_999_999;
const ROOM_TYPES: { v: RoomType; l: string }[] = [
  { v: 'COMBAT', l: 'Skirmish' }, { v: 'ELITE', l: 'Elite hunt' }, { v: 'MINIBOSS', l: 'Champion (mini-boss)' }, { v: 'TREASURE', l: 'Treasure' },
  { v: 'FOUNTAIN', l: 'Fountain' }, { v: 'MERCHANT', l: 'Merchant' }, { v: 'SHRINE', l: 'Shrine' }, { v: 'CRYSTAL', l: 'Crystal cavern' }, { v: 'BOSS', l: 'Boss' },
  { v: 'DUEL', l: 'Dark champion duel' }, { v: 'GATEKEEPER', l: 'Gatekeeper (5 gates)' }, { v: 'HALL', l: 'Hall of the Undying' },
];

const Line: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="dbg-row">
    <div className="dbg-lbl">{label}{hint && <em>{hint}</em>}</div>
    <div className="dbg-ctl">{children}</div>
  </div>
);
const Sec: React.FC<{ title: string; sub?: string; open: boolean; onToggle: () => void; children: React.ReactNode }> = ({ title, sub, open, onToggle, children }) => (
  <div className={`dbg-sec ${open ? 'open' : ''}`}>
    <button className="dbg-h pe" onClick={onToggle} aria-expanded={open}><span>{title}{sub && <small>{sub}</small>}</span><span className="car">&#9654;</span></button>
    {open && <div className="dbg-body">{children}</div>}
  </div>
);

const toast = (msg: string) => useGameStore.getState().addNotification(msg, '#7dd3fc', 'SYSTEM');

const MAX_RANK = 50;   // = classLevels MAX_LEVEL
const RARITIES: Rarity[] = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
const GEAR_TYPES = ['WEAPON', 'HELMET', 'ARMOR', 'GLOVES', 'BOOTS', 'ACCESSORY'];
const SLOTS: { v: string; l: string }[] = [
  { v: '', l: 'Any slot' }, { v: 'WEAPON', l: 'Weapon' }, { v: 'HELMET', l: 'Helmet' }, { v: 'ARMOR', l: 'Armor' },
  { v: 'GLOVES', l: 'Gloves' }, { v: 'BOOTS', l: 'Boots' }, { v: 'ACCESSORY', l: 'Accessory' },
];
const cap1 = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const clampN = (n: number, lo = 1, hi = BIG) => Math.max(lo, Math.min(hi, Math.floor(Number.isFinite(n) ? n : lo)));

function setRank(r: number) {
  useGameStore.getState().debugSetLevel(Math.max(1, Math.min(MAX_RANK, r)));
  toast(`Debug: class level ${useGameStore.getState().heroRank}`);
}
function levelUp(n: number) {
  const st = useGameStore.getState();
  for (let i = 0; i < n; i++) st.addExperience(useGameStore.getState().experienceToNextLevel);
}
function allTalents() {
  const st = useGameStore.getState();
  if (st.heroRank < MAX_RANK) st.debugSetLevel(MAX_RANK);   // enough talent points for every node
  const nodes = talentsOf(useGameStore.getState().hero);
  for (let pass = 0; pass < 12; pass++) {
    let any = false;
    for (const n of nodes) while (useGameStore.getState().allocateTalent(n.id)) any = true;
    if (!any) break;
  }
  toast('Debug: every talent of this hero maxed (level 50)');
}
function resetTalents() {   // free (the real respec costs gold)
  const s = useGameStore.getState();
  useGameStore.setState({ talents: { ...s.talents, [s.hero]: {} } });
  toast('Debug: talents reset (free). Start a run or re-select the hero to refresh stats.');
}
function healFull() {
  const st = useGameStore.getState().stats, p = world.player;
  p.hp = st.maxHealth; p.mana = st.maxMana;
  toast('Debug: full HP and mana');
}
function killAll() {
  let n = 0;
  for (const e of world.enemies) if (e.active && e.state !== 'DYING') { killEnemy(e); n++; }
  toast(`Debug: ${n} enem${n === 1 ? 'y' : 'ies'} defeated`);
}

/** Stack-aware fill of `list` (tops up stacks of the same name + type, then opens new slots up to `cap`).
 *  Returns the new list and how many units did not fit. */
function fillStacks(list: Item[], cap: number, make: () => Item, qty: number, limit: number): { list: Item[]; left: number } {
  const out = list.slice();
  const proto = make();
  let left = qty;
  for (let i = 0; i < out.length && left > 0; i++) {
    const it = out[i];
    if (it.name !== proto.name || it.type !== proto.type) continue;
    const q = it.quantity || 1;
    if (q >= limit) continue;
    const add = Math.min(left, limit - q);
    out[i] = { ...it, quantity: q + add }; left -= add;
  }
  while (left > 0 && out.length < cap) {
    const add = Math.min(left, limit);
    out.push({ ...make(), quantity: add }); left -= add;
  }
  return { list: out, left };
}
const whCap = (s: { tech: Parameters<typeof techLv>[0] }) => WAREHOUSE_LIMIT + 25 * techLv(s.tech, 'warehouse');
/** Adds `qty` of an item to the bag; what does not fit goes to the warehouse; anything still left is dropped. Says so in a notification. */
function giveStack(make: () => Item, qty: number, limit: number, what: string) {
  const s = useGameStore.getState();
  const a = fillStacks(s.inventory, s.maxInventorySlots, make, qty, limit);
  let wh = 0, lost = a.left;
  const patch: { inventory: Item[]; warehouse?: Item[] } = { inventory: a.list };
  if (a.left > 0) {
    const b = fillStacks(s.warehouse, whCap(s), make, a.left, limit);
    patch.warehouse = b.list; wh = a.left - b.left; lost = b.left;
  }
  useGameStore.setState(patch);
  toast(`Debug: ${what}: ${qty - wh - lost} in the bag${wh ? `, ${wh} overflowed to the warehouse` : ''}${lost ? `, ${lost} lost (bag + warehouse full)` : ''}`);
}
function giveMaterials(n: number) {
  const defs = [...CRAFT_MAT_NAMES].map((name) => LOOT_BY_NAME[name]).filter(Boolean);
  const s = useGameStore.getState();
  let inv = s.inventory, wh = s.warehouse, toWh = 0, lost = 0;
  for (const def of defs) {
    const mk = () => lootItem(def);
    const a = fillStacks(inv, s.maxInventorySlots, mk, n, LOOT_STACK_LIMIT);
    inv = a.list;
    if (a.left > 0) { const b = fillStacks(wh, whCap(s), mk, a.left, LOOT_STACK_LIMIT); wh = b.list; toWh += a.left - b.left; lost += b.left; }
  }
  useGameStore.setState({ inventory: inv, warehouse: wh });
  toast(`Debug: ${n} of each of ${defs.length} crafting materials added${toWh ? ` (${toWh} overflowed to the warehouse)` : ''}${lost ? ` (${lost} lost: bag + warehouse full)` : ''}`);
}
function giveRandomItem(rarity: Rarity, grade: ItemGrade, slot: string) {
  const hero = useGameStore.getState().hero;
  const pool = ITEMS_POOL.filter((i) => (slot ? i.type === slot : GEAR_TYPES.includes(i.type))
    && i.rarity === rarity && !i.retired && i.id !== 'tool_pickaxe' && canUseClass(i, hero));
  if (!pool.length) { toast(`Debug: no ${cap1(rarity)} ${slot ? slot.toLowerCase() : 'gear'} for this hero`); return; }
  const it = instantiate(pool[Math.floor(Math.random() * pool.length)], grade);
  const s = useGameStore.getState();
  if (s.addItemToInventory(it)) toast(`Debug: ${it.name} (${cap1(grade)} ${cap1(rarity)}) added to the bag`);
  else { useGameStore.setState({ warehouse: [...s.warehouse, it] }); toast(`Debug: bag full, ${it.name} went to the warehouse`); }
}
function giveCurrency(kind: 'gold' | 'gems' | 'crystals' | 'shards' | 'core' | 'core2', n: number) {
  const s = useGameStore.getState();
  if (kind === 'gold') { useGameStore.setState({ gold: s.gold + n }); toast(`Debug: +${n.toLocaleString()} gold`); }
  else if (kind === 'gems') { useGameStore.setState({ gems: s.gems + n }); toast(`Debug: +${n.toLocaleString()} gems`); }
  else if (kind === 'crystals') { useGameStore.setState({ crystals: s.crystals + n }); toast(`Debug: +${n.toLocaleString()} Aether Crystals`); }
  else if (kind === 'shards') {
    const m = { ...s.materials }; for (const r of RARITIES) m[r] = (m[r] || 0) + n;
    useGameStore.setState({ materials: m }); toast(`Debug: +${n.toLocaleString()} shards of every rarity`);
  } else {
    const id = kind === 'core' ? 'upgrade_core' : 'upgrade_core_2';
    giveStack(() => makeItemById(id, 1)[0], n, POTION_STACK_LIMIT, kind === 'core' ? 'Upgrade Cores' : 'Refined Cores');
  }
}

const OPEN_KEY = 'aether-debug-open-v1';
const loadOpen = (): Record<string, boolean> => {
  try { const r = localStorage.getItem(OPEN_KEY); if (r) return JSON.parse(r); } catch { /* ignore */ }
  return { hero: true, items: true };
};

export const DebugTab: React.FC = () => {
  const [, force] = useState(0);
  const flip = (k: 'god' | 'oneHit' | 'maxSkills', v: boolean) => { setDebug({ [k]: v }); force((x) => x + 1); };
  const status = useGameStore((s) => s.status);
  const hero = useGameStore((s) => s.hero);
  const stepIdx = useGameStore((s) => s.story.step);
  const inRun = status === GameStatus.PLAYING || status === GameStatus.PAUSED || status === GameStatus.LEVEL_UP;
  const [open, setOpen] = useState<Record<string, boolean>>(loadOpen);
  const tgl = (k: string) => setOpen((o) => { const n = { ...o, [k]: !o[k] }; try { localStorage.setItem(OPEN_KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const [biome, setBiome] = useState(Math.max(0, world.room.biome || 0));
  const [room, setRoom] = useState(0);
  const [type, setType] = useState<RoomType>('COMBAT');
  const [boss, setBoss] = useState<string>(debug.bossOverride);
  const [foot, setFoot] = useState<HTMLElement | null>(null);
  const [lvIn, setLvIn] = useState(MAX_RANK);
  const [matN, setMatN] = useState(50);
  const [amt, setAmt] = useState(1000);
  const [rar, setRar] = useState<Rarity>('EPIC');
  const [grade, setGrade] = useState<ItemGrade>('MID');
  const [slot, setSlot] = useState('');
  useEffect(() => { setFoot(document.getElementById('pause-footer-extra')); }, []);

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
    <select className="dbg-in pe" value={v} onChange={(e) => on(e.target.value)} data-testid={tid}>
      {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
  const num = (v: number, on: (n: number) => void, tid: string, max = BIG) => (
    <input type="number" className="dbg-in num pe" value={v} min={1} max={max} data-testid={tid}
      onChange={(e) => on(clampN(+e.target.value, 1, max))} onFocus={(e) => e.target.select()} />
  );
  const B = (label: string, onClick: () => void, tid?: string, disabled?: boolean) => <Button size="sm" onClick={onClick} data-testid={tid} disabled={disabled}>{label}</Button>;
  const step = STORY[stepIdx];

  return (<>
    <div className="py-1.5" style={{ fontSize: '.7rem', color: '#7dd3fc' }}>Testing tools. They change your real save (currencies, items, rank, talents).</div>

    <Sec title="Hero" sub={cap1(hero)} open={!!open.hero} onToggle={() => tgl('hero')}>
      <Line label="Class level" hint={`1-${MAX_RANK}. Unlocks rank-gated gear and talent points.`}>
        {num(lvIn, (n) => setLvIn(Math.min(MAX_RANK, n)), 'dbg-lv-in', MAX_RANK)}
        {B('Set', () => setRank(lvIn), 'dbg-set-lv')}
        {B('+1', () => setRank(useGameStore.getState().heroRank + 1))}
        {B('+10', () => setRank(useGameStore.getState().heroRank + 10))}
        {B(`Max (${MAX_RANK})`, () => setRank(MAX_RANK), 'dbg-max-rank')}
      </Line>
      <Line label="Talents">{B('Max all', allTalents, 'dbg-talents-max')}{B('Reset (free)', resetTalents)}</Line>
      <Line label="Skills" hint={inRun ? undefined : 'Run only (the toggle in Toggles works from town).'}>
        {B('Max all skills', () => useGameStore.getState().debugMaxSkills(), 'dbg-skills-max', !inRun)}
        {B('+99 SP', () => useGameStore.setState((s) => ({ skillPoints: s.skillPoints + 99 })), undefined, !inRun)}
        {B('+10 levels', () => levelUp(10), undefined, !inRun)}
      </Line>
      <Line label="Heal" hint={inRun ? undefined : 'Run only.'}>{B('Full HP + mana', healFull, 'dbg-heal', !inRun)}</Line>
    </Sec>

    <Sec title="Items & currency" open={!!open.items} onToggle={() => tgl('items')}>
      <Line label="Crafting materials" hint="N of EVERY crafting material (recipe loot + brewing ingredients). Overflow goes to the warehouse.">
        {num(matN, setMatN, 'dbg-mat-n', 9999)}
        {B(`Get all x ${matN}`, () => giveMaterials(matN), 'dbg-mats')}
      </Line>
      <Line label="Amount" hint="Used by the Give buttons below.">{num(amt, setAmt, 'dbg-amt')}</Line>
      <Line label="Give">
        {B('Gold', () => giveCurrency('gold', amt), 'dbg-gold')}
        {B('Gems', () => giveCurrency('gems', amt), 'dbg-gems')}
        {B('Aether Crystals', () => giveCurrency('crystals', amt), 'dbg-crystals')}
        {B('Shards (all)', () => giveCurrency('shards', amt), 'dbg-shards')}
        {B('Upgrade Cores', () => giveCurrency('core', amt), 'dbg-core')}
        {B('Refined Cores', () => giveCurrency('core2', amt), 'dbg-core2')}
      </Line>
      <Line label="Random gear" hint={`Usable by ${cap1(hero)}. Goes to the bag (warehouse if full).`}>
        {sel(rar, (v) => setRar(v as Rarity), RARITIES.map((r) => ({ v: r, l: cap1(r) })), 'dbg-rar')}
        {sel(grade, (v) => setGrade(v as ItemGrade), (['LOW', 'MID', 'HIGH'] as ItemGrade[]).map((g) => ({ v: g, l: cap1(g) })), 'dbg-grade')}
        {sel(slot, setSlot, SLOTS, 'dbg-slot')}
        {B('Give', () => giveRandomItem(rar, grade, slot), 'dbg-gear')}
      </Line>
    </Sec>

    <Sec title="Run / rooms" open={!!open.run} onToggle={() => tgl('run')}>
      <Line label="Room tools" hint={inRun ? undefined : 'Run only.'}>
        {B('Kill all enemies', killAll, 'dbg-killall', !inRun)}
      </Line>
      <Line label="Biome">{sel(biome, (v) => setBiome(+v), BIOMES.map((b, i) => ({ v: i, l: `${i + 1}. ${b.name}` })), 'dbg-biome')}</Line>
      <Line label="Room" hint="Pick, then press the Jump / Start button in the footer.">
        {sel(type, (v) => setType(v as RoomType), ROOM_TYPES, 'dbg-type')}
        {type !== 'BOSS' && sel(room, (v) => setRoom(+v), Array.from({ length: ROOMS_PER_BIOME }, (_, i) => ({ v: i, l: `Room ${i + 1}` })), 'dbg-room')}
      </Line>
      <Line label="Boss" hint="Used by boss rooms (Default = the biome's own boss).">
        {sel(boss, setBoss, [{ v: '', l: 'Default' }, ...BOSS_ROTATION.map((k) => ({ v: k, l: BOSS_NAMES[k].name }))], 'dbg-boss')}
      </Line>
      <Line label="Special fights" hint="Herald: the Void throne room (the final fight). Riruru: a Greenwood room; the blue slime hops in once you clear it.">
        {B('Void Herald (final)', () => fight(() => debugHerald()), 'dbg-herald')}
        {B('Riruru', () => fight(() => { riruru.force = true; debugJump(0, 1, 'COMBAT'); useGameStore.getState().addNotification('Debug: clear this room and Riruru appears.', '#6cc4ff', 'SYSTEM'); }), 'dbg-riruru')}
      </Line>
      <Line label="Humanoid mini boss" hint="A champion room of the biome and room chosen above.">
        {HUMAN_KINDS.map((k) => <Button key={k} size="sm" data-testid={`dbg-human-${k.toLowerCase()}`} onClick={() => fight(() => debugHumanBoss(biome, room, k))}>{HUMAN_INFO[k].name}</Button>)}
      </Line>
      <Line label="Tower mini boss" hint="Starts the Endless Tower (if needed) at floor 15, a champion floor.">
        {HUMAN_KINDS.map((k) => <Button key={k} size="sm" data-testid={`dbg-tower-human-${k.toLowerCase()}`} onClick={() => { const st = useGameStore.getState(); if (!(inRun && runInfo.mode === 'TOWER')) st.startMode('TOWER'); if (st.isPauseMenuOpen) st.togglePause(); debugTowerHuman(15, k); useUiStore.getState().openSettings(false); }}>{HUMAN_INFO[k].name}</Button>)}
      </Line>
      <Line label="Dark Hero duel" hint="A dark champion of the class you pick, in the biome and room chosen above.">
        {DARK_CLASSES.map((c) => <Button key={c} size="sm" data-testid={`dbg-dark-${c.toLowerCase()}`} onClick={() => fight(() => debugDarkHero(biome, room, c))}>{DARK_NAMES[c].name.replace('The ', '')}</Button>)}
      </Line>
      <Line label="Ally" hint="Fight: a fresh Greenwood room with an ally. Join now: adds the ally to the current fight (or the next combat room).">
        {B('Fight with ally', () => fight(() => { ally.force = true; debugJump(0, 1, 'COMBAT'); }), 'dbg-ally')}
        {B('Join now', () => { toast(debugAlly() ? 'Debug: ally joined the fight' : 'Debug: ally will join the next combat room'); }, 'dbg-ally-now', !inRun)}
      </Line>
    </Sec>

    <Sec title="Story & world" open={!!open.world} onToggle={() => tgl('world')}>
      <Line label="Story step" hint={step ? `Now: ${step.id} (${stepIdx + 1}/${STORY.length}). Pays its reward.` : 'Story finished.'}>
        {B('Complete step', () => { const st = useGameStore.getState(); if (st.story.step >= STORY.length) { toast('Debug: the story is already finished'); return; } st.setStory(st.story.step + 1); toast('Debug: story step completed'); }, 'dbg-story', !step)}
      </Line>
      <Line label="Town time" hint="The clock keeps running. The next run snapshots it as its time of day.">
        {([['Morning', 0.15], ['Noon', 0.25], ['Dusk', 0.5], ['Night', 0.75]] as const).map(([l, t]) => <Button key={l} size="sm" data-testid={`dbg-time-${l.toLowerCase()}`} onClick={() => { world.townTime = t; toast(`Debug: town time ${l.toLowerCase()}`); }}>{l}</Button>)}
      </Line>
      <Line label="Daily chests" hint="Town treasure chests can be opened again.">
        {B('Reset chests', () => { useGameStore.setState({ chestsOpened: [] }); toast('Debug: town chests reset (re-enter town)'); }, 'dbg-chests')}
      </Line>
      <Line label="Biome shortcuts" hint="Marks every biome done: the shortcut door shows in room 5 or 7.">
        {B('Mark all completed', () => { const s = useGameStore.getState(); useGameStore.setState({ progress: { ...s.progress, biomesDone: BIOMES.map((_, i) => i), shortcutSeen: false } }); toast('Debug: all biomes completed'); }, 'dbg-biomes-done')}
        {B('Clear', () => { const s = useGameStore.getState(); useGameStore.setState({ progress: { ...s.progress, biomesDone: [], shortcutSeen: false } }); toast('Debug: biome completions cleared'); })}
      </Line>
      <Line label="Erin's rockfall" hint="Break the boulders on the old miners' road, or put them back.">
        {B('Break it', () => { const s = useGameStore.getState(); useGameStore.setState({ npcQuests: { ...s.npcQuests, q: { ...s.npcQuests.q, erin_boulder: { s: 2, p: 1 }, erin_frost: { s: 2, p: 0 } } } }); toast('Debug: the rockfall is broken'); })}
        {B('Restore', () => { const s = useGameStore.getState(), q = { ...s.npcQuests.q }; delete q.erin_boulder; delete q.erin_frost; useGameStore.setState({ npcQuests: { ...s.npcQuests, q } }); toast('Debug: rockfall restored (re-enter town)'); })}
      </Line>
      <Line label="Dreams" hint="In town: play the next Font dream now, or forget all of them.">
        {B('Play next', () => { useUiStore.getState().openSettings(false); setTimeout(() => playNextDream(), 200); }, undefined, inRun)}
        {B('Reset dreams', () => markDreamSeen(0))}
      </Line>
    </Sec>

    <Sec title="Toggles" open={!!open.tog} onToggle={() => tgl('tog')}>
      <Line label="God mode" hint="Your hero takes no damage."><Toggle checked={debug.god} onChange={(v) => flip('god', v)} label="God mode" /></Line>
      <Line label="One-hit kills" hint="Every hit kills, bosses included."><Toggle checked={debug.oneHit} onChange={(v) => flip('oneHit', v)} label="One-hit kills" /></Line>
      <Line label="Max skills" hint="Every run starts with all of this hero's skills at max level."><Toggle checked={debug.maxSkills} onChange={(v) => { flip('maxSkills', v); if (v && inRun) useGameStore.getState().debugMaxSkills(); }} label="Max skills" /></Line>
    </Sec>

    {foot && createPortal(<Button variant="primary" onClick={go} data-testid="dbg-go" style={{ minWidth: '9rem' }}>{inRun ? 'Jump now' : 'Start run here'}</Button>, foot)}   {/* (owner) beside Done in the footer, only on this tab */}
  </>);
};
