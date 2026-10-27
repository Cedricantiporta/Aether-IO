// Co-op STEP 2, HOST side. The host runs the whole world (monsters, bosses, hazards); the guest runs ONLY his own hero locally and claims
// his hits on the host's monsters. This module
//  - keeps a stand-in hero for the guest (`coopRoom.ally`, a PlayerRuntime that follows the guest's position) so monsters can pick /
//    attack either hero (engine/systems/enemies.ts swaps `world.player` to it), and forwards every blow on it to the guest (HIT / DEBUF / KNOCK),
//  - applies the guest's hit claims (DMG) with the normal damageEnemy / applyStatus code,
//  - streams the world to the guest ~15 Hz (SNAP: monsters + shots + hostile zones, META: the slow half, RST / BOSS: room + boss bar, EVT: FX moments),
//  - pays the guest the same kill XP / gold (KILL).
// No per-frame allocation: records are written into one preallocated Uint16Array; a message string is the only per-send allocation.
import { world, makePlayerRuntime, MAX_ENEMIES, MAX_ENEMY_PROJECTILES, MAX_ZONES } from '../engine/world';
import { events, type GameEvents } from '../engine/events';
import { coopRoom } from './coopRoom';
import { damageEnemy, applyStatus, type DamageOpts, type PlayerDebuff } from '../engine/systems/combat';
import { Vector3 } from 'three';
import {
  MSG, HIT_STRIDE, STAT_STRIDE, DMG_KINDS, STATUS_TYPES, DEBUFF_TYPES, ENEMY_STATES, ROOM_PHASES, EP_KINDS,
  F_ALIVE, F_DASH, HF_DOT, HF_ENV, HF_NODOT, HF_PROJ, HF_CRIT, DF_CRIT, DF_DOT, DF_BASIC, DF_ABREAK, DF_FROST, DF_NOBACK, DF_KNOCK, DF_LAUNCH, isNum, clampInt,
} from './protocol';
import { u16ToB64, EV_H2G, EV_G2H, encodeEvent, decodeEvent } from './coopWire';
import { packGhosts, applyGhosts, ghostReset } from './coopGhosts';
import { zonesTick, applyZones } from './coopZones';

export interface HostIO { send(m: unknown[]): void; rv(): number; connected(): boolean }
let io: HostIO | null = null;
export function hostBind(h: HostIO): void { io = h; }

const SNAP_MS = 1000 / 15;
const U = new Uint16Array(16384);
const proxy = makePlayerRuntime();   // the guest's stand-in
/** QA counters (window.__coop.stats()) */
export const hostStats = { hitsApplied: 0, dmgApplied: 0, statusApplied: 0, blowsForwarded: 0, kills: 0 };
let guestSeen = false;               // a POS of this run arrived: the guest is fighting beside us
let lastSnap = 0, seq = 0, lastRst = 0, lastBossSent = 0, rstKey = '', bossKey = '';
let prevX = 0, prevZ = 0, prevT = 0;
let applying = false;                // re-emitting a partner event: never forward it back
let fwdOn = false;

const sentKey = new Int32Array(MAX_ENEMIES);        // per monster slot: hash of the meta last sent (0 = nothing sent)
const sentZone = new Int32Array(MAX_ZONES);
const kindIds = new Map<string, number>();
const kindId = (k: string): number => { let v = kindIds.get(k); if (v === undefined) { v = kindIds.size + 1; kindIds.set(k, v); } return v; };
const stateIdx: Record<string, number> = {}; ENEMY_STATES.forEach((s, i) => { stateIdx[s] = i; });
const epIdx: Record<string, number> = {}; EP_KINDS.forEach((s, i) => { epIdx[s] = i; });
const metaE: unknown[][] = [], metaZ: unknown[][] = [];
const evtQ: unknown[][] = [];

/** The guest's POS of the current run arrived (coop.ts): from now on this run has two players. */
export function hostGuestSeen(): void { guestSeen = true; }
export const hostTwo = (): boolean => coopRoom.two;

/** New room / run / disconnect: forget what the guest was sent. */
export function hostReset(full: boolean): void {
  sentKey.fill(0); sentZone.fill(0); evtQ.length = 0; rstKey = ''; bossKey = ''; lastSnap = 0; ghostReset();
  if (full) { guestSeen = false; coopRoom.ally = null; coopRoom.two = false; fwdOn = false; }
}

// ------------------------------------------------------------ forwarders ---
// A blow that lands on the stand-in is sent to the guest, who applies it with his own defence / shields / dodge (engine/systems/combat.ts hooks).
const DK: Record<string, number> = {}; DMG_KINDS.forEach((k, i) => { DK[k] = i; });
coopRoom.fwdHit = (amount, o) => {
  if (!io || !io.connected()) return;
  hostStats.blowsForwarded++;
  const fl = (o?.dot ? HF_DOT : 0) | (o?.env ? HF_ENV : 0) | (o?.noDotMul ? HF_NODOT : 0) | (o?.proj ? HF_PROJ : 0) | (o?.crit ? HF_CRIT : 0);
  const srcId = o?.src ? o.src.id : o?.srcId ?? -1;
  io.send([MSG.HIT, io.rv(), Math.round(amount * 100) / 100, Math.round((o?.pct ?? 0) * 1000), DK[o?.kind ?? 'PHYSICAL'] ?? 0, fl, Math.round((o?.kb ?? 0) * 100), Math.round((o?.down ?? 0) * 100),
    o?.slow ? 1 : 0, o?.tr ?? o?.src?.traits ?? 0, o?.pos ? Math.round(o.pos.x * 10) : 0, o?.pos ? Math.round(o.pos.z * 10) : 0, srcId]);
};
const DB: Record<string, number> = {}; DEBUFF_TYPES.forEach((k, i) => { DB[k] = i; });
coopRoom.fwdDebuff = (type: PlayerDebuff, dur, val, mode) => { if (io?.connected()) io.send([MSG.DEBUF, io.rv(), DB[type] ?? 0, Math.round(dur * 100), Math.round(val * 100), mode]); };
coopRoom.fwdKnock = (fx, fz, force, down, cancel) => { if (io?.connected()) io.send([MSG.KNOCK, io.rv(), Math.round(fx * 10), Math.round(fz * 10), Math.round(force * 100), Math.round(down * 100), cancel ? 1 : 0]); };
coopRoom.onKill = (e, xp, gold) => {
  if (!io || !io.connected() || !coopRoom.two) return;
  hostStats.kills++;
  io.send([MSG.KILL, io.rv(), Math.round(xp * 100) / 100, 0 /* gold: the coins the host's kill dropped are forwarded as the guest's OWN pickups (net/coopLoot.ts) */, (e.elite ? 1 : 0) | (e.boss ? 2 : 0), Math.round(e.pos.x * 10), Math.round(e.pos.z * 10)]);
};

// ------------------------------------------------------- event forwarding ---
const noXpText = /XP|^\+|LEVEL|NO MANA|POTION|INVENTORY|^HP |^MP /i;   // the host's own HUD-ish floaters (his XP / pickups) are not for the guest
function hookEvents(): void {
  EV_H2G.forEach((d, idx) => {
    events.on(d.name as keyof GameEvents, ((p: Record<string, unknown>) => {
      if (!fwdOn || applying || evtQ.length > 90) return;
      if (d.name === 'damage' && p.toPlayer) return;
      if (d.name === 'floatText' && noXpText.test(String(p.text))) return;
      const m = encodeEvent(EV_H2G, idx, p);
      if (m) evtQ.push(m);
    }) as never);
  });
}
hookEvents();

const mkVec = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);
function onEvt(d: unknown[]): void {
  applying = true;
  try {
    for (let i = 2; i < d.length && i < 40; i++) {
      const a = d[i]; if (!Array.isArray(a)) continue;
      const ev = decodeEvent(EV_G2H, a, mkVec); if (!ev) continue;
      events.emit(ev.name as keyof GameEvents, ev.payload as never);
    }
  } finally { applying = false; }
}

// ---------------------------------------------------------- guest -> host ---
const hitOpts: DamageOpts = { kind: 'PHYSICAL' };
const knockDir = new Vector3();
const statFx: { type: (typeof STATUS_TYPES)[number]; duration: number; value: number } = { type: 'SLOW', duration: 0, value: 0 };
function onDmg(d: unknown[]): void {
  const hits = d[2], stats = d[3];
  if (Array.isArray(hits)) {
    const n = Math.min(hits.length, HIT_STRIDE * 300);
    for (let i = 0; i + HIT_STRIDE <= n; i += HIT_STRIDE) {
      const id = hits[i], amt = hits[i + 1];
      if (!isNum(id) || !isNum(amt) || id < 0 || id >= MAX_ENEMIES || !(amt > 0)) continue;
      const e = world.enemies[id | 0];
      if (!e.active || e.state === 'DYING') continue;
      const kind = hits[i + 2], fl = hits[i + 3];
      if (!isNum(kind) || !isNum(fl)) continue;
      const o = hitOpts;
      o.kind = DMG_KINDS[kind | 0] ?? 'PHYSICAL';
      o.crit = (fl & DF_CRIT) !== 0; o.dot = (fl & DF_DOT) !== 0; o.basic = (fl & DF_BASIC) !== 0;
      o.armorBreak = (fl & DF_ABREAK) !== 0; o.frost = (fl & DF_FROST) !== 0; o.noBackstab = (fl & DF_NOBACK) !== 0;
      o.source = 'PET';   // not the host's own hit: no host combo / cards / ult charge / life steal (the guest did his own on his side)
      o.fromX = num(hits[i + 4]) / 10; o.fromZ = num(hits[i + 5]) / 10;
      o.knockDir = undefined; o.knockback = undefined; o.launch = undefined; o.slam = undefined;
      if (fl & (DF_KNOCK | DF_LAUNCH)) {
        knockDir.set(num(hits[i + 6]) / 100, 0, num(hits[i + 7]) / 100); o.knockDir = knockDir;
        if (fl & DF_KNOCK) o.knockback = Math.min(8, num(hits[i + 8]) / 100);
        if (fl & DF_LAUNCH) { o.launch = Math.min(20, num(hits[i + 9]) / 100); o.slam = Math.max(0, num(hits[i + 10]) / 10); }
      }
      hostStats.hitsApplied++; hostStats.dmgApplied += amt / 10;
      damageEnemy(e, Math.min(5e7, amt / 10), o);
    }
  }
  if (Array.isArray(stats)) {
    const n = Math.min(stats.length, STAT_STRIDE * 300);
    for (let i = 0; i + STAT_STRIDE <= n; i += STAT_STRIDE) {
      const id = stats[i], t = stats[i + 1], dur = stats[i + 2], val = stats[i + 3];
      if (!isNum(id) || !isNum(t) || !isNum(dur) || !isNum(val) || id < 0 || id >= MAX_ENEMIES) continue;
      const e = world.enemies[id | 0], type = STATUS_TYPES[t | 0];
      if (!e.active || !type) continue;
      statFx.type = type; statFx.duration = Math.min(30, dur / 100); statFx.value = val / 100;
      hostStats.statusApplied++;
      applyStatus(e, statFx);
    }
  }
}
const num = (v: unknown): number => (isNum(v) ? v : 0);

/** Messages of the guest that carry combat meaning (coop.ts routes them here, after its rv check). */
export function hostOnMessage(d: unknown[]): void {
  switch (d[0]) {
    case MSG.DMG: if (coopRoom.two) onDmg(d); return;
    case MSG.EVT: onEvt(d); return;
    case MSG.GP: if (typeof d[2] === 'string') applyGhosts(d[2]); return;
    case MSG.PZ: applyZones(d); return;
    default: return;
  }
}

// -------------------------------------------------------------- per frame ---
/** coopTick (host): keeps the stand-in in step with the guest's position and streams the world. `inRun` = host in an adventure room. */
export function hostTick(now: number, inRun: boolean, R: typeof world.remote): void {
  const live = inRun && guestSeen && R.active && !!io && io.connected();
  fwdOn = inRun && guestSeen;
  coopRoom.two = inRun && guestSeen;
  if (!live) { if (coopRoom.ally) coopRoom.ally = null; return; }
  const p = proxy;
  const dt = prevT ? Math.max(0.001, (now - prevT) / 1000) : 0;
  if (dt > 0) { p.vel.x = p.vel.x * 0.6 + ((R.x - prevX) / dt) * 0.4; p.vel.z = p.vel.z * 0.6 + ((R.z - prevZ) / dt) * 0.4; }
  prevX = R.x; prevZ = R.z; prevT = now;
  p.pos.set(R.x, 0, R.z); p.facing = R.facing;
  p.alive = (R.flags & F_ALIVE) !== 0;
  p.anim.dashing = (R.flags & F_DASH) !== 0; p.dashIframes = true; p.dashT = p.anim.dashing ? 0.1 : 0;
  p.hp = Math.max(1, R.hp * 1000);
  p.invulnT = 0;
  coopRoom.ally = p;
  if (now - lastSnap >= SNAP_MS) { lastSnap = now; sendSnap(now); }
  zonesTick(now, true);   // (STEP 3) my own ground skill zones as harmless copies on his screen
}

const wrapPi = (a: number): number => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
const q16 = (v: number): number => (v < 0 ? 0 : v > 65535 ? 65535 : Math.round(v));

function sendSnap(now: number): void {
  if (!io) return;
  const rv = io.rv();
  let n = 0;
  // ---- monsters: [count, 10 u16 each]
  const eCountAt = n++; let ec = 0;
  const list = world.enemies;
  metaE.length = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.active) { sentKey[i] = 0; continue; }
    const fl = (e.elite ? 1 : 0) | (e.boss ? 2 : 0) | (e.mini ? 4 : 0) | (e.corrupt ? 8 : 0) | (e.decoy ? 16 : 0) | (e.rooted ? 32 : 0) | (e.bossAdd ? 64 : 0);
    const key = (((kindId(e.kind) * 131 + fl) * 100003 + Math.round(e.maxHp)) * 31 + Math.round(e.scale * 100) + (e.affix.length << 8) + e.trickKind * 977 + e.traits * 7) | 0 || 1;
    if (sentKey[i] !== key) {
      sentKey[i] = key;
      metaE.push([i, e.kind, fl, Math.round(e.maxHp), Math.round(e.scale * 100), Math.round(e.radius * 100), e.affix, e.traits | 0, e.trickKind | 0, Math.round(e.speed * 100)]);
    }
    const si = stateIdx[e.state] ?? 1;
    const hpF = e.maxHp > 0 ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 0;
    const st = (e.freezeT > 0 ? 1 : 0) | (e.burnT > 0 ? 2 : 0) | (e.poisonT > 0 ? 4 : 0) | (e.stunT > 0 ? 8 : 0) | (e.fearT > 0 ? 16 : 0) | (e.slowT > 0.05 ? 32 : 0) | (e.winT > 0 ? 64 : 0)
      | (e.hideT > 0 ? 128 : 0) | (e.armorBreakT > 0 ? 256 : 0) | (e.staggerT > 0 ? 512 : 0);
    U[n++] = (i & 511) | (si << 9) | ((e.phase & 3) << 12) | (e.hitFlash > 0.6 ? 1 << 14 : 0);
    U[n++] = q16((e.pos.x + 300) * 100); U[n++] = q16((e.pos.z + 300) * 100); U[n++] = q16((e.pos.y + 20) * 1000);
    U[n++] = q16((wrapPi(e.facing) + Math.PI) * 10000);
    U[n++] = q16(hpF * 65535);
    U[n++] = (Math.max(0, Math.min(255, Math.round(e.vel.x * 2) + 128))) | (Math.max(0, Math.min(255, Math.round(e.vel.z * 2) + 128)) << 8);
    U[n++] = (e.pattern & 63) | (st << 6);
    U[n++] = q16(e.stateT * 50);
    U[n++] = q16((e.maxHp > 0 ? Math.min(1, e.shield / e.maxHp) : 0) * 65535);
    ec++;
  }
  U[eCountAt] = ec;
  // ---- enemy shots: [count, 7 u16 each]
  const pCountAt = n++; let pc = 0;
  const pl = world.enemyProjectiles;
  for (let i = 0; i < pl.length && n < 12000; i++) {
    const p = pl[i];
    if (!p.active) continue;
    U[n++] = (i & 1023) | ((epIdx[p.kind] ?? 0) << 10) | (p.dark ? 1 << 14 : 0);
    U[n++] = q16((p.pos.x + 300) * 100); U[n++] = q16((p.pos.z + 300) * 100); U[n++] = q16((p.pos.y + 20) * 1000);
    U[n++] = q16(p.vel.x * 50 + 32768); U[n++] = q16(p.vel.z * 50 + 32768);
    U[n++] = q16(p.radius * 10000);
    pc++;
  }
  U[pCountAt] = pc;
  // ---- hostile zones: only the ids (the shape rides in META once)
  const zCountAt = n++; let zc = 0;
  const zl = world.zones;
  metaZ.length = 0;
  for (let i = 0; i < zl.length; i++) {
    const z = zl[i];
    if (!z.active || !z.hostile || z.permanent || z.ghost) { sentZone[i] = 0; continue; }
    const key = ((kindId(z.kind) * 100003 + Math.round(z.pos.x * 10)) * 1009 + Math.round(z.pos.z * 10) * 31 + Math.round(z.maxLife * 100) + Math.round(z.radius * 10) * 7 + z.trick) | 0 || 1;
    if (sentZone[i] !== key) {
      sentZone[i] = key;
      metaZ.push([i, z.kind, Math.round(z.pos.x * 100), Math.round(z.pos.z * 100), Math.round(z.dir.x * 1000), Math.round(z.dir.z * 1000), Math.round(z.radius * 100), Math.round(z.length * 100),
        Math.round(Math.max(0, z.life) * 100), Math.round(z.maxLife * 100), z.color, Math.round(z.aux * 1000), z.trick, Math.round(z.damage)]);
    }
    U[n++] = i; zc++;
  }
  U[zCountAt] = zc;
  if (metaE.length || metaZ.length) io.send([MSG.META, rv, metaE, metaZ]);
  io.send([MSG.SNAP, rv, ++seq & 0xffff, u16ToB64(U, n)]);
  // ---- FX moments since the last snapshot
  if (evtQ.length) { io.send([MSG.EVT, rv, ...evtQ]); evtQ.length = 0; }
  // ---- room state (on change, and once a second)
  const d = world.director, r = world.room;
  let pk = '';
  for (let i = 0; i < r.portals.length; i++) { const po = r.portals[i]; if (po.active || po.pre) pk += `${Math.round(po.x * 10)},${Math.round(po.z * 10)},${po.plan.type},${po.plan.reward},${po.big ? 1 : 0},${po.pre ? 1 : 0},${po.active ? 1 : 0};`; }
  const key = `${d.phase}|${d.wave}|${r.enemiesLeft}|${d.aliveCount}|${pk}`;
  if (key !== rstKey || now - lastRst > 1000) {
    rstKey = key; lastRst = now;
    const portals: unknown[][] = [];
    for (let i = 0; i < r.portals.length; i++) { const po = r.portals[i]; if (po.active || po.pre) portals.push([i, Math.round(po.x * 10), Math.round(po.z * 10), po.plan.type, po.plan.reward, po.big ? 1 : 0, po.pre ? 1 : 0, po.active ? 1 : 0, Math.round(po.t * 10)]); }
    io.send([MSG.RST, rv, ROOM_PHASES.indexOf(d.phase), d.wave, r.enemiesLeft, d.aliveCount, portals]);
  }
  // ---- boss bar (<= 10 Hz, on change)
  const b = world.boss;
  const bk = `${b.active ? 1 : 0}|${Math.round(b.hp / Math.max(1, b.maxHp) * 400)}|${Math.round(b.maxHp)}|${b.phase}|${b.ability}|${Math.round(b.stagger * 100)}|${b.staggered ? 1 : 0}|${Math.round(b.interrupt * 50)}|${Math.round(b.shield)}|${b.stage}|${d.bossId}|${b.name}`;
  if (bk !== bossKey && now - lastBossSent >= 100) {
    bossKey = bk; lastBossSent = now;
    io.send([MSG.BOSS, rv, b.active ? 1 : 0, Math.round(b.hp), Math.round(b.maxHp), b.phase, Math.round(b.stagger * 100), b.staggered ? 1 : 0, b.ability, Math.round(b.abilityT * 10), b.name, b.title,
      Math.round(b.interrupt * 100), b.interruptOn ? 1 : 0, b.interruptLabel, Math.round(b.shield), Math.round(b.shieldMax), b.final ? 1 : 0, b.stage, d.bossId]);
  }
  // ---- my own shots / zones as harmless copies on his screen
  const gp = packGhosts();
  if (gp) io.send([MSG.GP, rv, gp]);
}

// Dev / test: the clamp helper is re-exported so coop.ts can sanitise rv the same way.
export { clampInt };
