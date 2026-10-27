// Co-op STEP 4: the host's room traps, biome hazards, room-event spike tiles and boss-phase props as COSMETIC MIRRORS on the guest's screen.
// The guest builds the host's room from the same seed but runs none of the host's logic, so these pieces would be missing (while still hurting him through the host's
// forwarded hits). The host describes them in three kinds of message (MSG.HAZ):
//   [HAZ, rv, 0, sig, hzKind, rows[]]      LAYOUT  every static + dynamic field of every pooled piece (sent when the room's set of pieces changes, and re-sent
//                                          after 0.7 s / 1.5 s / 4 s ... so a guest that was still loading the room catches it); a piece is a row in a pool of
//                                          engine/systems/roomTraps.rt, biomeHazards.hz or world.roomEvt.traps
//   [HAZ, rv, 1, sig, rows[]]              STATE   only the dynamic fields (state machines, timers, angles, hp), ~5 Hz, skipped when nothing changed
//   [HAZ, rv, 2, scalars[], props[], hands[], tiles[]?, text[]?]   boss PHASE (bossPhaseState.bp): safe circles / rocks / pillars / pods / lava tiles / hands / wind
//   [HAZ, rv, 3, scalars[]]                room EVENT (totem / cage hp, timers, twist)
// The guest advances the clocks between messages (t += dt, angles extrapolated) and smooths the moving parts, so ~5 Hz is enough. A mirrored stationary that the guest
// hits is claimed on the host (roomTraps.hitOne -> TRAPHIT in MSG.USE). No allocation per frame: descriptor tables, preallocated target arrays; the per-message arrays are
// built at ~5 Hz only while something exists.
import { world } from '../engine/world';
import { rt, trapAim, trapLock, trapAt, trapCount, damageTrap } from '../engine/systems/roomTraps';
import { hz, HZ } from '../engine/systems/biomeHazards';
import { bp, MAX_PROPS, MAX_HANDS, MAX_TILES, LAVA_HITS, type PhaseKind } from '../engine/systems/bossPhaseState';
import { addTempCollider, removeTempCollider, type Collider } from '../engine/mapgen';
import { mirrorTrapTuning, resetRoomEvent, trapPeriod } from '../engine/systems/roomEvents';
import { coopRoom } from './coopRoom';
import { rate } from './coopRate';
import { MSG, isNum } from './protocol';

export interface HazIO { send(m: unknown[]): void; rv(): number; connected(): boolean }
let io: HazIO | null = null;
export function hazBind(h: HazIO): void { io = h; }
export const hazStats = { layouts: 0, states: 0, got: 0, applied: 0, bp: 0, evt: 0, trapHits: 0 };

type Rec = Record<string, unknown>;
interface Grp {
  id: number;
  n: () => number; set: (n: number) => void;
  pool: Rec[]; stat: string[]; dyn: string[];
  /** fields the guest eases toward the newest value; `ang` = angles (shortest way round) and extrapolated with the measured speed */
  sm?: string[]; ang?: boolean;
  /** clock field the guest advances itself between messages (+dt; clouds count down) and the field that must be truthy (or > 0) for it to run */
  adv?: string; advIf?: string; down?: boolean;
  /** a solid collider with this radius per piece (destructible stationaries) */
  col?: boolean;
}
const R = rt as unknown as Record<string, unknown>;
const poolOf = (k: string): Rec[] => R[k] as Rec[];
const DEST = ['x', 'z', 'rad', 'maxHp'];
const GROUPS: Grp[] = [
  { id: 0, n: () => rt.nSiege, set: (n) => { rt.nSiege = n; }, pool: poolOf('siege'), stat: ['kind', 'tier', ...DEST], dyn: ['yaw', 'state', 't', 'locked', 'lx', 'lz', 'dead', 'hp'], sm: ['yaw'], ang: true, adv: 't', advIf: 'state', col: true },
  { id: 1, n: () => rt.nTower, set: (n) => { rt.nTower = n; }, pool: poolOf('tower'), stat: ['tier', ...DEST], dyn: ['state', 't', 'a0', 'glow', 'dead', 'hp', 'volley'], adv: 't', advIf: 'state', col: true },
  { id: 2, n: () => rt.nStatue, set: (n) => { rt.nStatue = n; }, pool: poolOf('statue'), stat: ['kind', 'tier', ...DEST], dyn: ['yaw', 'state', 't', 'lock', 'sw', 'glow', 'dead', 'hp'], sm: ['yaw'], ang: true, adv: 't', advIf: 'state', col: true },
  { id: 3, n: () => rt.nLaser, set: (n) => { rt.nLaser = n; }, pool: poolOf('laser'), stat: ['tier', ...DEST], dyn: ['yaw', 'state', 't', 'lock', 'glow', 'dead', 'hp'], sm: ['yaw'], ang: true, adv: 't', advIf: 'state', col: true },
  { id: 4, n: () => rt.nShrine, set: (n) => { rt.nShrine = n; }, pool: poolOf('shrine'), stat: DEST, dyn: ['glow', 't', 'nG', 'dead', 'hp'], adv: 't', col: true },
  { id: 5, n: () => rt.nObelisk, set: (n) => { rt.nObelisk = n; }, pool: poolOf('obelisk'), stat: DEST, dyn: ['glow', 't', 'dead', 'hp'], adv: 't', col: true },
  { id: 6, n: () => rt.nBar, set: (n) => { rt.nBar = n; }, pool: poolOf('bar'), stat: ['x', 'z', 'w', 'len'], dyn: ['a'], sm: ['a'], ang: true },
  { id: 7, n: () => rt.nBeam, set: (n) => { rt.nBeam = n; }, pool: poolOf('beam'), stat: ['x', 'z', 'w', 'len', 'n', 'off'], dyn: ['a', 'state', 't'], sm: ['a'], ang: true, adv: 't', advIf: 'state' },
  { id: 8, n: () => rt.nJet, set: (n) => { rt.nJet = n; }, pool: poolOf('jet'), stat: ['x', 'z', 'ang', 'len', 'off'], dyn: ['state', 't'], adv: 't', advIf: 'state' },
  { id: 9, n: () => rt.nVine, set: (n) => { rt.nVine = n; }, pool: poolOf('vine'), stat: ['x', 'z', 'r', 'seed'], dyn: ['state', 't', 'touch'], adv: 't', advIf: 'state' },
  { id: 10, n: () => rt.nPool, set: (n) => { rt.nPool = n; }, pool: poolOf('pool'), stat: ['x', 'z', 'r'], dyn: [] },
  { id: 11, n: () => rt.ghost.length, set: () => { /* fixed */ }, pool: poolOf('ghost'), stat: [], dyn: ['on', 'own', 'x', 'z', 'state', 't', 'ph', 'poof'], sm: ['x', 'z'], adv: 't', advIf: 'on' },
  { id: 12, n: () => rt.boulders.length, set: () => { /* fixed */ }, pool: poolOf('boulders'), stat: [], dyn: ['on', 'sx', 'sz', 'tx', 'tz', 't', 'T'], adv: 't', advIf: 'on' },
  { id: 13, n: () => hz.nBr, set: (n) => { hz.nBr = n; }, pool: hz.br as unknown as Rec[], stat: ['x', 'z', 'r', 'rot'], dyn: [] },
  { id: 14, n: () => hz.nMu, set: (n) => { hz.nMu = n; }, pool: hz.mu as unknown as Rec[], stat: ['x', 'z', 'rot', 'auto'], dyn: ['cd'] },
  { id: 15, n: () => hz.nIce, set: (n) => { hz.nIce = n; }, pool: hz.ice as unknown as Rec[], stat: ['x', 'z', 'r'], dyn: [] },
  { id: 16, n: () => hz.clouds.length, set: () => { /* fixed */ }, pool: hz.clouds as unknown as Rec[], stat: [], dyn: ['on', 'x', 'z', 't', 'seed'], adv: 't', advIf: 'on', down: true },
  { id: 17, n: () => hz.ic.length, set: () => { /* fixed */ }, pool: hz.ic as unknown as Rec[], stat: [], dyn: ['on', 'x', 'z', 't', 'hit', 'seed'], adv: 't', advIf: 'on' },
  { id: 18, n: () => hz.nRift, set: (n) => { hz.nRift = n; }, pool: hz.rift as unknown as Rec[], stat: ['x', 'z', 'life', 's', 'vis', 'follow'], dyn: ['age', 'k'], sm: ['x', 'z'], adv: 'age' },
  { id: 19, n: () => world.roomEvt.nTraps, set: (n) => { world.roomEvt.nTraps = n; }, pool: world.roomEvt.traps as unknown as Rec[], stat: ['x', 'z'], dyn: ['t', 'hit'], adv: 't', advIf: 't' },
];
const NG = GROUPS.length;
const dynIf = (g: Grp, o: Rec): boolean => !g.advIf || (typeof o[g.advIf] === 'number' ? (o[g.advIf] as number) > 0 : !!o[g.advIf]);

const enc = (v: unknown): number => (typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'number' ? (v === Infinity ? -1 : Math.round(v * 100) / 100) : 0);
const put = (o: Rec, f: string, v: number): void => { const cur = o[f]; o[f] = typeof cur === 'boolean' ? v !== 0 : f === 'life' && v < 0 ? Infinity : v; };
let hh = 0;
const mix = (v: number): void => { hh = (Math.imul(hh, 31) + Math.round(v * 10)) | 0; };

// ====================================================================== HOST ===
let lastTick = 0, lastSig = 0, sigSent = 0, layoutAge = 0, lastLayoutAt = 0, lastHash = 0, lastBeat = 0, lastBp = 0, lastEvt = 0, bpHash = 0, evtHash = 0, tileKey = 0, bpSentOn = false, textKey = '';
let evtSentOn = false;
const rows: unknown[][] = [];

function signature(): number {
  hh = rt.nSiege * 7 + rt.nTower * 11 + rt.nStatue * 13 + rt.nLaser * 17 + rt.nShrine * 19 + rt.nObelisk * 23 + hz.kind * 29;
  for (let gi = 0; gi < NG; gi++) {
    const g = GROUPS[gi], n = g.stat.length ? g.n() : 0;
    mix(n + gi * 1000);
    for (let i = 0; i < n; i++) { const o = g.pool[i]; for (let k = 0; k < g.stat.length; k++) { const v = o[g.stat[k]]; mix(typeof v === 'number' ? (v === Infinity ? -1 : v) : v ? 1 : 0); } }
  }
  return hh;
}
function anyPiece(): boolean {
  if (rt.nSiege + rt.nTower + rt.nStatue + rt.nLaser + rt.nShrine + rt.nObelisk + rt.nBar + rt.nBeam + rt.nJet + rt.nVine + rt.nPool > 0) return true;
  if (hz.nBr + hz.nMu + hz.nIce + hz.nRift > 0 || world.roomEvt.nTraps > 0) return true;
  for (let i = 0; i < hz.ic.length; i++) if (hz.ic[i].on) return true;
  for (let i = 0; i < hz.clouds.length; i++) if (hz.clouds[i].on) return true;
  return false;
}
function buildLayout(): unknown[][] {
  rows.length = 0;
  for (let gi = 0; gi < NG; gi++) {
    const g = GROUPS[gi], n = g.n();
    if (g.stat.length === 0 && g.dyn.length === 0) continue;
    if (n === 0) continue;
    const flat: number[] = [];
    for (let i = 0; i < n; i++) { const o = g.pool[i]; for (let k = 0; k < g.stat.length; k++) flat.push(enc(o[g.stat[k]])); for (let k = 0; k < g.dyn.length; k++) flat.push(enc(o[g.dyn[k]])); }
    rows.push([g.id, n, flat]);
  }
  return rows;
}
function buildState(): unknown[][] {
  rows.length = 0; hh = 0;
  for (let gi = 0; gi < NG; gi++) {
    const g = GROUPS[gi];
    if (g.dyn.length === 0) continue;
    const n = g.n(); if (n === 0) continue;
    const flat: number[] = [];
    for (let i = 0; i < n; i++) { const o = g.pool[i]; for (let k = 0; k < g.dyn.length; k++) { const v = enc(o[g.dyn[k]]); flat.push(v); mix(v * 4); } }
    rows.push([g.id, flat]);
  }
  return rows;
}

/** Host, every frame (from coopHost.hostTick while the guest is in the room): ships the mirrors. */
export function hazTick(now: number): void {
  if (!io || !io.connected() || !world.room.active) return;
  const mul = rate.mul;
  // ---- traps / hazards: layout when the set of pieces changed (or on the re-send schedule), else state when something moved
  if (now - lastTick >= 200 * mul) {
    lastTick = now;
    const any = anyPiece();
    if (any || sigSent !== 0) {
      const sig = signature() || 1;
      const age = now - lastLayoutAt;
      const resend = layoutAge < 3 ? age >= (layoutAge === 0 ? 700 : 1500) : age >= 4000;
      if (sig !== lastSig || resend || sigSent === 0) {
        lastSig = sig; sigSent = sig; lastLayoutAt = now; layoutAge++;
        hazStats.layouts++;
        io.send([MSG.HAZ, io.rv(), 0, sig, hz.kind, buildLayout()]);
        lastHash = 0;
      } else {
        const r = buildState(), changed = hh !== lastHash;
        if (changed || now - lastBeat > 1200) { lastHash = hh; lastBeat = now; hazStats.states++; io.send([MSG.HAZ, io.rv(), 1, sig, r]); }
      }
      if (!any) sigSent = 0;
    }
  }
  // ---- boss phase props
  if (now - lastBp >= 200 * mul) {
    lastBp = now;
    const on = bp.on || bp.tail < 2.5;
    if (on || bpSentOn) {
      const sc = [bp.on ? 1 : 0, bp.immune ? 1 : 0, bp.id, PH.indexOf(bp.kind), bp.t, bp.count, bp.countMax, bp.tint, bp.flash, bp.floor, bp.wx, bp.wz, bp.wave, bp.windOn ? 1 : 0, bp.nx, bp.nz, bp.shiftT,
        bp.dark ? 1 : 0, bp.ball ? 1 : 0, bp.crackT, bp.spin, bp.rx, bp.rz, bp.tail, bp.nt, bp.tileHalf, bp.xformId, bp.bannerT];
      const props: number[] = [], hands: number[] = [];
      for (let i = 0; i < MAX_PROPS; i++) { const q = bp.props[i]; props.push(q.on ? 1 : 0, Math.round(q.x * 100) / 100, Math.round(q.z * 100) / 100, Math.round(q.r * 100) / 100, Math.round(q.h * 100) / 100); }
      for (let i = 0; i < MAX_HANDS; i++) { const h = bp.hands[i]; hands.push(h.on ? 1 : 0, Math.round(h.x * 100) / 100, Math.round(h.z * 100) / 100, Math.round(h.t * 100) / 100, Math.round(h.T * 100) / 100); }
      hh = 0; for (let i = 0; i < sc.length; i++) mix(sc[i] * 10); for (let i = 0; i < props.length; i++) mix(props[i] * 10); for (let i = 0; i < hands.length; i++) mix(hands[i] * 10);
      if (hh !== bpHash || now - lastBeat > 1200 || !bpSentOn) {
        bpHash = hh;
        const m: unknown[] = [MSG.HAZ, io.rv(), 2, sc, props, hands];
        let tiles: number[] | null = null;
        const tk = bp.nt > 0 ? bp.nt * 1000 + Math.round(bp.tx[0] + bp.tz[bp.nt - 1]) : 0;
        if (tk !== tileKey) { tileKey = tk; tiles = []; for (let i = 0; i < bp.nt; i++) { tiles.push(Math.round(bp.tx[i] * 10), Math.round(bp.tz[i] * 10)); for (let k = 0; k < LAVA_HITS; k++) tiles.push(Math.round(bp.te[i * LAVA_HITS + k] * 100)); } }
        m.push(tiles ?? 0);
        const text = bp.name + '|' + bp.sub + '|' + bp.color;
        m.push(text !== textKey ? (textKey = text, [bp.name, bp.sub, bp.color]) : 0);
        hazStats.bp++;
        io.send(m);
      }
      bpSentOn = bp.on || bp.tail < 2.5;
    }
  }
  // ---- room event (totem / cage hp, timers)
  if (now - lastEvt >= 250 * mul) {
    lastEvt = now;
    const e = world.roomEvt, on = !!(e.obj || e.twist);
    if (on || evtSentOn) {
      const sc = [e.x, e.z, e.hp, e.maxHp, e.t, e.tmax, e.state, e.hurtT, OBJ.indexOf(e.obj), TW.indexOf(e.twist), e.enemy, e.darkId, e.darkT, e.lifted ? 1 : 0].map((v) => Math.round(v * 100) / 100);
      hh = 0; for (let i = 0; i < sc.length; i++) mix(sc[i] * 10);
      if (hh !== evtHash || !evtSentOn) { evtHash = hh; hazStats.evt++; io.send([MSG.HAZ, io.rv(), 3, sc]); }
      evtSentOn = on;
    }
  }
}
const PH: PhaseKind[] = ['', 'AVALANCHE', 'SPLIT', 'PINBALL', 'SPORES', 'TIDAL', 'LAVA', 'SAND', 'DARK'];
const OBJ = ['', 'DEFEND', 'RESCUE', 'GOBLIN', 'HUNT', 'SPEED'], TW = ['', 'DARK', 'CURSED', 'TRAPS', 'GOLDEN'];

/** New room / run / disconnect (host side). */
export function hazReset(): void {
  lastTick = lastBp = lastEvt = lastBeat = 0; lastSig = 0; sigSent = 0; layoutAge = 0; lastLayoutAt = 0; lastHash = 0; bpHash = 0; evtHash = 0; tileKey = 0; bpSentOn = false; evtSentOn = false; textKey = '';
}

/** HOST: the guest claimed a hit on stationary `index` of the host's list. */
export function onTrapHit(d: unknown[]): void {   // [USE, rv, 2, index, dmg]
  if (!isNum(d[3]) || !isNum(d[4])) return;
  const i = d[3] | 0, dmg = Math.min(1e7, Math.max(0, d[4]));
  if (i < 0 || i >= trapCount() || !(dmg > 0)) return;
  hazStats.trapHits++;
  damageTrap(trapAt(i), dmg / 0.5);   // (the guest sent the post-defence value; damageTrap applies TRAP_DEF again)
}

// ===================================================================== GUEST ===
let gSig = 0, gRoomVer = -1;
const anon: Collider[] = [];
const tgt: Float64Array[] = GROUPS.map((g) => new Float64Array(g.pool.length * (g.sm ? g.sm.length : 0)));
const vel: Float64Array[] = GROUPS.map((g) => new Float64Array(g.pool.length * (g.sm ? g.sm.length : 0)));
const tgtAt = new Float64Array(NG);
const byId: (Grp | undefined)[] = []; for (const g of GROUPS) byId[g.id] = g;
const wrapPi = (a: number): number => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function dropColliders(): void {
  for (const g of GROUPS) if (g.col) for (const o of g.pool) { const c = o.col as Collider | null; if (c) { removeTempCollider(c); o.col = null; } }
  for (const c of anon) removeTempCollider(c);
  anon.length = 0;
}
/** Guest: room change / run end: forget the mirrored pieces (the host's logic is not running here, so nothing else clears them). */
function clearMirror(): void {
  dropColliders();
  rt.on = false; rt.nSiege = rt.nTower = rt.nStatue = rt.nLaser = rt.nShrine = rt.nObelisk = rt.nBar = rt.nBeam = rt.nJet = rt.nVine = rt.nPool = 0;
  for (const g of rt.ghost) { g.on = false; g.poof = 0; }
  for (const b of rt.boulders) b.on = false;
  trapAim.obj = null; trapLock.obj = null; rt.ver++;
  hz.kind = HZ.NONE; hz.nBr = hz.nMu = hz.nIce = hz.nRift = 0;
  for (const c of hz.clouds) c.on = false;
  for (const c of hz.ic) c.on = false;
  hz.ver++;
  resetRoomEvent(); world.roomEvt.nTraps = 0;
  bp.on = false; bp.immune = false; bp.kind = ''; bp.count = -1; bp.dark = false; bp.ball = false; bp.floor = 0; bp.flash = 0; bp.tint = 0; bp.bannerT = 0; bp.windOn = false; bp.wave = 2; bp.nt = 0; bp.id = -1; bp.crackT = 0; bp.shiftT = 0; bp.tail = 9; bp.xformId = -1;
  for (let i = 0; i < MAX_PROPS; i++) bp.props[i].on = false;
  for (let i = 0; i < MAX_HANDS; i++) bp.hands[i].on = false;
  gSig = 0; gRoomVer = -1; tgtAt.fill(0);
}
coopRoom.clearMirror = clearMirror;

function applyLayout(d: unknown[]): void {
  const sig = d[3], kind = d[4], rs = d[5];
  if (!isNum(sig) || !isNum(kind) || !Array.isArray(rs) || !world.room.active) return;
  if (sig === gSig && gRoomVer === world.room.version) return;   // (a re-send of what I already show)
  dropColliders();
  // groups the message does not list are empty
  for (const g of GROUPS) if (g.stat.length) g.set(0);
  world.roomEvt.nTraps = 0;
  for (const row of rs) {
    if (!Array.isArray(row) || !isNum(row[0]) || !isNum(row[1]) || !Array.isArray(row[2])) continue;
    const g = byId[row[0] | 0]; if (!g) continue;
    const n = Math.max(0, Math.min(g.pool.length, row[1] | 0)), flat = row[2] as unknown[], stride = g.stat.length + g.dyn.length;
    if (flat.length < n * stride) continue;
    g.set(n);
    for (let i = 0; i < n; i++) {
      const o = g.pool[i]; let k = i * stride;
      for (let f = 0; f < g.stat.length; f++) { const v = flat[k++]; if (isNum(v)) put(o, g.stat[f], v); }
      for (let f = 0; f < g.dyn.length; f++) { const v = flat[k++]; if (isNum(v)) put(o, g.dyn[f], v); }
      if (g.sm) { const x = gi(g); for (let f = 0; f < g.sm.length; f++) { tgt[x][i * g.sm.length + f] = o[g.sm[f]] as number; vel[x][i * g.sm.length + f] = 0; } }
      if (g.col && !o.dead) o.col = addTempCollider(o.x as number, o.z as number, (o.rad as number) || 1.5, false);
      else if (g.col) o.col = null;
      if (g.col) { o.flash = 0; o.hitSeq = 0; }
      if (g.id === 6) { const c = addTempCollider(o.x as number, o.z as number, 1.0, false); if (c) anon.push(c); }
    }
  }
  // (bars / jets: solid pedestals too; added once above for bars, jets here)
  for (let i = 0; i < rt.nJet; i++) { const j = rt.jet[i], c = addTempCollider(j.x, j.z, 1.1, false); if (c) anon.push(c); }
  hz.kind = kind | 0;
  rt.on = rt.nSiege + rt.nTower + rt.nStatue + rt.nLaser + rt.nShrine + rt.nObelisk + rt.nBar + rt.nBeam + rt.nJet + rt.nVine + rt.nPool > 0;
  rt.ver++; hz.ver++;
  if (world.roomEvt.nTraps > 0) mirrorTrapTuning();
  gSig = sig; gRoomVer = world.room.version;
  hazStats.applied++;
}
const gi = (g: Grp): number => GROUPS.indexOf(g);

function applyState(d: unknown[]): void {
  if (d[3] !== gSig || gRoomVer !== world.room.version || !Array.isArray(d[4])) return;
  const now = nowMs();
  for (const row of d[4] as unknown[]) {
    if (!Array.isArray(row) || !isNum(row[0]) || !Array.isArray(row[1])) continue;
    const g = byId[row[0] | 0]; if (!g) continue;
    const n = g.n(), flat = row[1] as unknown[], stride = g.dyn.length;
    if (flat.length < n * stride) continue;
    const idx = gi(g);
    for (let i = 0; i < n; i++) {
      const o = g.pool[i];
      const wasDead = o.dead === true;
      for (let f = 0; f < stride; f++) {
        const v = flat[i * stride + f]; if (!isNum(v)) continue;
        const name = g.dyn[f], si = g.sm ? g.sm.indexOf(name) : -1;
        if (si >= 0) {
          const k = i * g.sm!.length + si, prev = tgt[idx][k], dtS = tgtAt[idx] ? Math.max(0.05, (now - tgtAt[idx]) / 1000) : 0;
          if (g.ang) { const df = wrapPi(v - prev); vel[idx][k] = dtS ? Math.max(-12, Math.min(12, df / dtS)) : 0; }
          else vel[idx][k] = 0;
          tgt[idx][k] = v;
          if (!dtS || Math.abs(wrapPi(v - (o[name] as number))) > 1.2 || (!g.ang && Math.abs(v - (o[name] as number)) > 6)) o[name] = v;   // first value / a jump: snap
        } else put(o, name, v);
      }
      if (g.col && !wasDead && o.dead === true) { const c = o.col as Collider | null; if (c) { removeTempCollider(c); o.col = null; } if (trapAim.obj === (o as never)) trapAim.obj = null; if (trapLock.obj === (o as never)) trapLock.obj = null; }
    }
    tgtAt[idx] = now;
  }
  hazStats.got++;
}

function applyBp(d: unknown[]): void {
  const sc = d[3], props = d[4], hands = d[5], tiles = d[6], text = d[7];
  if (!Array.isArray(sc) || sc.length < 28 || !Array.isArray(props) || !Array.isArray(hands)) return;
  const v = (i: number): number => (isNum(sc[i]) ? (sc[i] as number) : 0);
  bp.on = v(0) === 1; bp.immune = v(1) === 1; bp.id = v(2) | 0; bp.kind = PH[v(3) | 0] ?? ''; bp.t = v(4); bp.count = v(5); bp.countMax = v(6) || 1; bp.tint = v(7); bp.flash = v(8); bp.floor = v(9);
  bp.wx = v(10); bp.wz = v(11); bp.wave = v(12); bp.windOn = v(13) === 1; bp.nx = v(14); bp.nz = v(15); bp.shiftT = v(16); bp.dark = v(17) === 1; bp.ball = v(18) === 1; bp.crackT = v(19); bp.spin = v(20);
  bp.rx = v(21); bp.rz = v(22); bp.tail = v(23); bp.nt = Math.max(0, Math.min(MAX_TILES, v(24) | 0)); bp.tileHalf = v(25) || 2.5; bp.xformId = v(26) | 0; bp.bannerT = v(27);
  for (let i = 0; i < MAX_PROPS && i * 5 + 4 < props.length; i++) { const q = bp.props[i], o = i * 5; q.on = props[o] === 1; q.x = (props[o + 1] as number) || 0; q.z = (props[o + 2] as number) || 0; q.r = (props[o + 3] as number) || 2; q.h = (props[o + 4] as number) || 0; }
  for (let i = 0; i < MAX_HANDS && i * 5 + 4 < hands.length; i++) { const h = bp.hands[i], o = i * 5; h.on = hands[o] === 1; h.x = (hands[o + 1] as number) || 0; h.z = (hands[o + 2] as number) || 0; h.t = (hands[o + 3] as number) || 0; h.T = (hands[o + 4] as number) || 1; }
  if (Array.isArray(tiles)) {
    const stride = 2 + LAVA_HITS;
    for (let i = 0; i < bp.nt && i * stride + stride - 1 < tiles.length; i++) {
      bp.tx[i] = ((tiles[i * stride] as number) || 0) / 10; bp.tz[i] = ((tiles[i * stride + 1] as number) || 0) / 10;
      for (let k = 0; k < LAVA_HITS; k++) bp.te[i * LAVA_HITS + k] = ((tiles[i * stride + 2 + k] as number) || 0) / 100;
    }
  }
  if (Array.isArray(text) && typeof text[0] === 'string' && typeof text[1] === 'string') { bp.name = text[0].slice(0, 40); bp.sub = text[1].slice(0, 80); bp.color = isNum(text[2]) ? text[2] : 0xffffff; }
  hazStats.bp++;
}
function applyEvt(d: unknown[]): void {
  const sc = d[3];
  if (!Array.isArray(sc) || sc.length < 14) return;
  const v = (i: number): number => (isNum(sc[i]) ? (sc[i] as number) : 0), e = world.roomEvt;
  e.x = v(0); e.z = v(1); e.hp = v(2); e.maxHp = v(3) || 1; e.t = v(4); e.tmax = v(5); e.state = v(6) | 0; e.hurtT = v(7);
  e.obj = (OBJ[v(8) | 0] ?? '') as typeof e.obj; e.twist = (TW[v(9) | 0] ?? '') as typeof e.twist; e.enemy = v(10) | 0; e.darkId = v(11) | 0; e.darkT = v(12); e.lifted = v(13) === 1;
}

export function hazOnMessage(d: unknown[]): void {
  if (!coopRoom.guest || !isNum(d[2])) return;
  switch (d[2]) {
    case 0: applyLayout(d); return;
    case 1: applyState(d); return;
    case 2: applyBp(d); return;
    case 3: applyEvt(d); return;
    default: return;
  }
}

// ---- guest -> host: hits on mirrored stationaries, summed per piece and sent every 100 ms
const trapAcc = new Float64Array(32);
let lastTrapFlush = 0, lastStepAt = 0;
coopRoom.sendTrapHit = (index, dmg) => { if (index >= 0 && index < trapAcc.length) trapAcc[index] += dmg; };

/** Guest, every frame (coopTick): advance the mirrored clocks and ease the moving parts toward the newest values; ship my claimed hits on stationaries. */
export function hazStep(now: number): void {
  const dt = lastStepAt ? Math.min(0.1, (now - lastStepAt) / 1000) : 0; lastStepAt = now;
  if (io && io.connected() && now - lastTrapFlush >= 100 * rate.mul) {
    lastTrapFlush = now;
    for (let i = 0; i < trapAcc.length; i++) if (trapAcc[i] > 0) { io.send([MSG.USE, io.rv(), 2, i, Math.round(trapAcc[i] * 10) / 10]); trapAcc[i] = 0; }
  }
  if (!coopRoom.guest || gRoomVer !== world.room.version || !(dt > 0)) return;
  const kE = Math.min(1, dt * 14), period = trapPeriod();
  for (let gx = 0; gx < NG; gx++) {
    const g = GROUPS[gx], n = g.n();
    if (n === 0) continue;
    const ageS = tgtAt[gx] ? Math.min(0.4, (now - tgtAt[gx]) / 1000) : 0;
    for (let i = 0; i < n; i++) {
      const o = g.pool[i];
      if (g.adv && dynIf(g, o)) {
        const cur = o[g.adv] as number;
        if (g.id === 19) { if (cur < period) o[g.adv] = cur + dt; }   // (spike tiles: hold at the end of the cycle until the host's next message)
        else o[g.adv] = g.down ? Math.max(0, cur - dt) : cur + dt;
      }
      if (g.sm) for (let f = 0; f < g.sm.length; f++) {
        const k = i * g.sm.length + f, name = g.sm[f], cur = o[name] as number;
        const want = g.ang ? tgt[gx][k] + vel[gx][k] * ageS : tgt[gx][k];
        o[name] = cur + (g.ang ? wrapPi(want - cur) : want - cur) * kE;
      }
    }
  }
  for (let i = 0; i < rt.boulders.length; i++) { const b = rt.boulders[i]; if (b.on && b.t >= b.T) b.on = false; }
  // boss phase + room event clocks
  if (bp.on) { bp.t += dt; if (bp.count >= 0) bp.count = Math.max(0, bp.count - dt); for (let i = 0; i < MAX_HANDS; i++) { const h = bp.hands[i]; if (h.on) h.t += dt; } } else if (bp.tail < 9) bp.tail += dt;
  if (bp.bannerT > 0) bp.bannerT -= dt;
  if (bp.flash > 0) bp.flash = Math.max(0, bp.flash - dt * 3);
  const e = world.roomEvt; if (e.obj || e.twist) e.t += dt;
}
