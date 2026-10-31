// Co-op STEP 2, GUEST side. The guest simulates ONLY his own hero (movement, attacks, skills, dash, pet, summons all run locally with the normal
// code, so every class works and the controls stay instant). The monsters on his screen are a read-only MIRROR of the host's world:
//  - SNAP / META / RST / BOSS / EVT from the host fill `world.enemies`, `world.enemyProjectiles`, hostile `world.zones` (ghost zones) and the room /
//    boss state; engine/game.ts calls `coopRoom.mirror(dt)` instead of the enemy AI (positions interpolated ~100 ms behind the newest snapshot),
//  - his hits and statuses on mirrored monsters are not applied here (combat.guestHit / applyStatus): they are sent to the host (DMG, ~30 Hz),
//  - blows on his hero come back as HIT / DEBUF / KNOCK and go through his own damagePlayer (his defence, shields, dodge, Ankh ...),
//  - a kill pays him the same XP / gold (KILL).
import { Vector3 } from 'three';
import { world, allocZone, resetEnemySlot, MAX_ENEMIES, MAX_ENEMY_PROJECTILES, MAX_ZONES } from '../engine/world';
import { events, type GameEvents } from '../engine/events';
import { ENEMY_DEFS } from '../engine/enemyDefs';
import { isUntargetable } from '../engine/systems/enemies';
import { damagePlayer, applyPlayerDebuff, freezePlayer, slowHero, knockHero, grantKillXp, type DamageOpts, type StatusEffect } from '../engine/systems/combat';
import { grantGoldCoin } from '../engine/systems/pickups';
import type { Enemy, EnemyKind, EnemyState, EliteAffix, EnemyProjectileKind, RoomPhase, ZoneKind, RoomPlan } from '../engine/types';
import { coopRoom } from './coopRoom';
import { useGameStore } from '../store';
import { GameStatus } from '../types';
import {
  MSG, HIT_STRIDE, DMG_KINDS, STATUS_TYPES, DEBUFF_TYPES, ENEMY_STATES, ROOM_PHASES, EP_KINDS, isNum,
  HF_DOT, HF_ENV, HF_NODOT, HF_PROJ, HF_CRIT, DF_CRIT, DF_DOT, DF_BASIC, DF_ABREAK, DF_FROST, DF_NOBACK, DF_PLAYER, DF_KNOCK, DF_LAUNCH,
} from './protocol';
import { b64ToU16, EV_G2H, EV_H2G, encodeEvent, decodeEvent } from './coopWire';
import { packGhosts, applyGhosts, ghostReset } from './coopGhosts';
import { zonesTick, applyZones } from './coopZones';
import { onDrop, onReward } from './coopLoot';
import { onPull, pullStep } from './coopPull';
import { hazOnMessage, hazStep } from './coopHaz';
import { minTick } from './coopMinions';
import { rate } from './coopRate';
import { bf, BEAT_T } from '../engine/systems/bossForms';

export interface GuestIO { send(m: unknown[]): void; rv(): number; connected(): boolean }
let io: GuestIO | null = null;
/** QA counters (window.__coop.stats()) */
export const guestStats = { claims: 0, blowsIn: 0, dmgIn: 0, killsPaid: 0, snaps: 0 };
export function guestBind(g: GuestIO): void { io = g; }

const INTERP_MS = 100;
const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const IN = new Uint16Array(16384);

// ---- per monster slot: interpolation ends (older -> newer), arrival times, bookkeeping
const X0 = new Float32Array(MAX_ENEMIES), Z0 = new Float32Array(MAX_ENEMIES), Y0 = new Float32Array(MAX_ENEMIES), F0 = new Float32Array(MAX_ENEMIES);
const X1 = new Float32Array(MAX_ENEMIES), Z1 = new Float32Array(MAX_ENEMIES), Y1 = new Float32Array(MAX_ENEMIES), F1 = new Float32Array(MAX_ENEMIES);
const T0 = new Float64Array(MAX_ENEMIES), T1 = new Float64Array(MAX_ENEMIES);
const seen = new Uint16Array(MAX_ENEMIES), known = new Uint8Array(MAX_ENEMIES);
const pSeen = new Uint16Array(MAX_ENEMY_PROJECTILES);
const zmap = new Int16Array(MAX_ZONES).fill(-1), zSeen = new Uint16Array(MAX_ZONES);
const zmeta: (unknown[] | null)[] = new Array(MAX_ZONES).fill(null);
const zmetaAt = new Float64Array(MAX_ZONES);
let stamp = 0;
const AFFIX: readonly EliteAffix[] = ['NONE', 'HASTED', 'VAMPIRIC', 'FROZEN', 'VOLATILE', 'SHIELDED'];
const ZONES: ReadonlySet<string> = new Set(['CURSE', 'FIRE', 'BLACKHOLE', 'FROST_NOVA', 'TELEGRAPH_CIRCLE', 'TELEGRAPH_LINE', 'TELEGRAPH_CONE', 'POISON_POOL', 'TORNADO', 'FROST_FIELD', 'METEOR_SHADOW',
  'SHOCKWAVE', 'GOO', 'CALTROPS', 'FIREPATCH', 'ACID', 'PLAGUE', 'SMOKE']);
const wrapPi = (a: number): number => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));

export function guestReset(): void {
  known.fill(0); seen.fill(0); pSeen.fill(0); zmap.fill(-1); zSeen.fill(0); zmeta.fill(null); hq.length = 0; sq.length = 0; evtQ.length = 0; ghostReset();
  for (const e of world.enemies) e.active = false;
  for (const p of world.enemyProjectiles) p.active = false;
  for (const z of world.zones) if (z.ghost) { z.active = false; z.ghost = false; }
}

// ----------------------------------------------------------- guest -> host ---
const hq: number[] = [], sq: number[] = [], evtQ: unknown[][] = [];
const DK: Record<string, number> = {}; DMG_KINDS.forEach((k, i) => { DK[k] = i; });
const ST: Record<string, number> = {}; STATUS_TYPES.forEach((k, i) => { ST[k] = i; });
let applying = false;
let lastFlush = 0, lastGp = 0;

coopRoom.sendHit = (e: Enemy, amount: number, o: DamageOpts, knockRoll: boolean, fx: number, fz: number): void => {
  if (hq.length >= HIT_STRIDE * 300) return;
  let fl = (o.crit ? DF_CRIT : 0) | (o.dot ? DF_DOT : 0) | (o.basic ? DF_BASIC : 0) | (o.armorBreak ? DF_ABREAK : 0) | (o.frost ? DF_FROST : 0) | (o.noBackstab ? DF_NOBACK : 0) | (o.source === 'PLAYER' ? DF_PLAYER : 0);
  let kx = 0, kz = 0, kb = 0, launch = 0, slam = 0;
  if (o.knockDir && knockRoll) {
    kx = o.knockDir.x; kz = o.knockDir.z;
    if (o.launch) { fl |= DF_LAUNCH; launch = o.launch; slam = o.slam ?? 0; } else if (o.knockback) { fl |= DF_KNOCK; kb = o.knockback; }
  }
  guestStats.claims++;
  hq.push(e.id, Math.round(amount * 10), DK[o.kind] ?? 0, fl, Math.round((o.fromX ?? fx) * 10), Math.round((o.fromZ ?? fz) * 10), Math.round(kx * 100), Math.round(kz * 100), Math.round(kb * 100), Math.round(launch * 100), Math.round(slam * 10));
};
let lastUse = 0;
/** (STEP 4) I pressed E at a chest / the fountain / the shrine: the host runs the world side for both of us. */
coopRoom.sendUse = (what: number, a: number): boolean => {
  const now = nowMs();
  if (!io || !io.connected() || now - lastUse < 400) return false;
  lastUse = now; io.send([MSG.USE, io.rv(), what, a]); return true;
};
coopRoom.sendStatus = (e: Enemy, effect: StatusEffect): void => {
  if (sq.length >= 4 * 300) return;
  sq.push(e.id, ST[effect.type] ?? 0, Math.round(effect.duration * 100), Math.round((effect.value ?? 0) * 100));
};

// my hero's cosmetic moments for the host's screen
EV_G2H.forEach((d, idx) => {
  events.on(d.name as keyof GameEvents, ((p: Record<string, unknown>) => {
    if (!coopRoom.guest || applying || evtQ.length > 60) return;
    const m = encodeEvent(EV_G2H, idx, p);
    if (m) evtQ.push(m);
  }) as never);
});

let lastG = 0;
const gdt = (now: number): number => { const d = lastG ? Math.min(0.1, (now - lastG) / 1000) : 0; lastG = now; return d; };
/** Per frame (coopTick, guest): flush my hit claims at ~30 Hz, my FX moments and my projectiles at ~15 Hz. */
export function guestTick(now: number, inRun: boolean): void {
  if (inRun) { pullStep(now); hazStep(now); minTick(now, gdt(now)); }
  if (!io || !inRun) { if (hq.length) hq.length = 0; if (sq.length) sq.length = 0; if (evtQ.length) evtQ.length = 0; return; }
  if (now - lastFlush >= 33 * rate.mul) {
    lastFlush = now;
    if (hq.length || sq.length) { io.send([MSG.DMG, io.rv(), hq.slice(), sq.slice()]); hq.length = 0; sq.length = 0; }
    if (evtQ.length) { io.send([MSG.EVT, io.rv(), ...evtQ]); evtQ.length = 0; }
  }
  if (now - lastGp >= 66 * rate.mul) {
    lastGp = now;
    const gp = packGhosts();
    if (gp) io.send([MSG.GP, io.rv(), gp]);
  }
  zonesTick(now, true);   // (STEP 3) my own ground skill zones as harmless copies on his screen
}

// ----------------------------------------------------------- host -> guest ---
const mkVec = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);

function onMeta(d: unknown[]): void {
  const es = d[2], zs = d[3];
  if (Array.isArray(es)) {
    for (let k = 0; k < es.length && k < 400; k++) {
      const r = es[k];
      if (!Array.isArray(r) || r.length < 10) continue;
      const id = r[0], kind = r[1], fl = r[2], maxHp = r[3], sc = r[4], rad = r[5], aff = r[6], tr = r[7], tk = r[8], spd = r[9];
      if (!isNum(id) || id < 0 || id >= MAX_ENEMIES || typeof kind !== 'string' || !(kind in ENEMY_DEFS) || !isNum(fl) || !isNum(maxHp) || !isNum(sc) || !isNum(rad) || !isNum(tr) || !isNum(tk) || !isNum(spd)) continue;
      const e = world.enemies[id | 0];
      if (!e.active || e.kind !== kind) { resetEnemySlot(e); e.state = 'SPAWN'; }
      e.kind = kind as EnemyKind;
      e.elite = (fl & 1) !== 0; e.boss = (fl & 2) !== 0; e.mini = (fl & 4) !== 0; e.corrupt = (fl & 8) !== 0; e.decoy = (fl & 16) !== 0; e.rooted = (fl & 32) !== 0; e.bossAdd = (fl & 64) !== 0;
      e.maxHp = Math.max(1, maxHp); e.scale = sc / 100; e.radius = rad / 100; e.affix = (AFFIX.includes(aff as EliteAffix) ? aff : 'NONE') as EliteAffix;
      e.traits = tr | 0; e.trickKind = tk | 0; e.speed = spd / 100;
      known[id | 0] = 1;
    }
  }
  if (Array.isArray(zs)) {
    const t = nowMs();
    for (let k = 0; k < zs.length && k < 256; k++) {
      const r = zs[k];
      if (!Array.isArray(r) || r.length < 14 || !isNum(r[0]) || r[0] < 0 || r[0] >= MAX_ZONES || typeof r[1] !== 'string' || !ZONES.has(r[1])) continue;
      const id = r[0] | 0;
      if (zmap[id] >= 0) { world.zones[zmap[id]].active = false; world.zones[zmap[id]].ghost = false; zmap[id] = -1; }   // shape changed: recreate
      zmeta[id] = r; zmetaAt[id] = t;
    }
  }
}

function onSnap(d: unknown[]): void {
  if (typeof d[3] !== 'string') return;
  const n = b64ToU16(d[3], IN);
  if (n < 3) return;
  stamp = (stamp + 1) & 0xffff || 1;
  guestStats.snaps++;
  const now = nowMs();
  let o = 0;
  // ---- monsters
  const ec = IN[o++];
  if (o + ec * 10 > n) return;
  const list = world.enemies;
  for (let k = 0; k < ec; k++, o += 10) {
    const w0 = IN[o], id = w0 & 511;
    if (id >= MAX_ENEMIES || !known[id]) continue;
    const e = list[id];
    const x = IN[o + 1] / 100 - 300, z = IN[o + 2] / 100 - 300, y = IN[o + 3] / 1000 - 20, yaw = IN[o + 4] / 10000 - Math.PI;
    seen[id] = stamp;
    if (!e.active) {
      e.active = true; e.animT = Math.random() * 10; e.stateT = 0; e.deathT = 0;
      X0[id] = X1[id] = x; Z0[id] = Z1[id] = z; Y0[id] = Y1[id] = y; F0[id] = F1[id] = yaw; T0[id] = T1[id] = now;
      e.pos.set(x, y, z); e.facing = yaw;
    } else {
      X0[id] = X1[id]; Z0[id] = Z1[id]; Y0[id] = Y1[id]; F0[id] = F1[id]; T0[id] = T1[id];
      X1[id] = x; Z1[id] = z; Y1[id] = y; F1[id] = yaw; T1[id] = now;
    }
    const si = (w0 >> 9) & 7, st: EnemyState = (ENEMY_STATES[si] ?? 'CHASE') as EnemyState;
    if (st === 'DYING' && e.state !== 'DYING') { e.deathT = 0; e.stateT = 0; }
    e.state = st;
    e.phase = (w0 >> 12) & 3;
    if ((w0 >> 14) & 1) e.hitFlash = Math.max(e.hitFlash, 0.8);
    e.hp = (IN[o + 5] / 65535) * e.maxHp;
    e.vel.set(((IN[o + 6] & 255) - 128) / 2, 0, ((IN[o + 6] >> 8) - 128) / 2);
    const w7 = IN[o + 7], sb = w7 >> 6;
    e.pattern = w7 & 63;
    e.freezeT = sb & 1 ? 1 : 0; e.burnT = sb & 2 ? 1 : 0; e.poisonT = sb & 4 ? 1 : 0; e.stunT = sb & 8 ? 1 : 0; e.fearT = sb & 16 ? 1 : 0; e.slowT = sb & 32 ? 1 : 0; e.winT = sb & 64 ? 1 : 0;
    e.hideT = sb & 128 ? 1 : 0; e.armorBreakT = sb & 256 ? 1 : 0; e.staggerT = sb & 512 ? 1 : 0;
    if (st !== 'DYING') e.stateT = IN[o + 8] / 50;
    e.shield = (IN[o + 9] / 65535) * e.maxHp;
  }
  for (let i = 0; i < MAX_ENEMIES; i++) { const e = list[i]; if (e.active && seen[i] !== stamp) { e.active = false; known[i] = 0; } }
  // ---- monster shots
  if (o >= n) return;
  const pc = IN[o++];
  if (o + pc * 7 > n) return;
  const pl = world.enemyProjectiles;
  for (let k = 0; k < pc; k++, o += 7) {
    const w0 = IN[o], id = w0 & 1023;
    if (id >= MAX_ENEMY_PROJECTILES) continue;
    const p = pl[id], kind = EP_KINDS[(w0 >> 10) & 15];
    if (!kind) continue;
    pSeen[id] = stamp;
    p.active = true; p.kind = kind as EnemyProjectileKind; p.dark = ((w0 >> 14) & 1) === 1;
    p.pos.set(IN[o + 1] / 100 - 300, IN[o + 3] / 1000 - 20, IN[o + 2] / 100 - 300);
    p.vel.set((IN[o + 4] - 32768) / 50, 0, (IN[o + 5] - 32768) / 50);
    p.radius = IN[o + 6] / 10000; p.life = 5; p.damage = 0; p.homing = 0; p.trail = 0;
  }
  for (let i = 0; i < MAX_ENEMY_PROJECTILES; i++) if (pl[i].active && pSeen[i] !== stamp) pl[i].active = false;
  // ---- hostile zones (ids; the shape came in META)
  if (o >= n) return;
  const zc = IN[o++];
  if (o + zc > n) return;
  for (let k = 0; k < zc; k++, o++) {
    const id = IN[o];
    if (id >= MAX_ZONES) continue;
    zSeen[id] = stamp;
    if (zmap[id] >= 0 && world.zones[zmap[id]].active && world.zones[zmap[id]].ghost) continue;
    const r = zmeta[id];
    if (!r) continue;
    const life = (r[8] as number) / 100 - (now - zmetaAt[id]) / 1000;
    if (life <= 0) continue;
    const z = allocZone();
    if (!z) continue;
    z.active = true; z.ghost = true; z.hostile = true; z.kind = r[1] as ZoneKind;
    z.pos.set((r[2] as number) / 100, 0, (r[3] as number) / 100); z.dir.set((r[4] as number) / 1000, 0, (r[5] as number) / 1000);
    z.radius = (r[6] as number) / 100; z.length = (r[7] as number) / 100; z.life = life; z.maxLife = (r[9] as number) / 100; z.color = r[10] as number;
    z.aux = (r[11] as number) / 1000; z.trick = r[12] as number; z.damage = r[13] as number; z.permanent = false; z.tickT = 0;
    zmap[id] = z.id;
  }
  for (let i = 0; i < MAX_ZONES; i++) {
    if (zmap[i] < 0 || zSeen[i] === stamp) continue;
    const z = world.zones[zmap[i]]; zmap[i] = -1;
    if (z.ghost) { z.active = false; z.ghost = false; }
  }
}

function onRst(d: unknown[]): void {
  const ph = d[2], wave = d[3], left = d[4], alive = d[5], portals = d[6];
  if (!isNum(ph) || !isNum(wave) || !isNum(left) || !isNum(alive)) return;
  const dr = world.director, r = world.room;
  dr.phase = (ROOM_PHASES[ph | 0] ?? 'FIGHT') as RoomPhase; dr.wave = wave | 0; dr.aliveCount = alive | 0; r.enemiesLeft = Math.max(0, left | 0);
  const sb = isNum(d[8]) ? d[8] | 0 : 0, ch = d[9];
  r.station.used = (sb & 1) !== 0; r.station.ready = r.station.ready || (sb & 2) !== 0; r.shrineOn = (sb & 4) !== 0; r.shrineDone = (sb & 8) !== 0;   // (STEP 4) station / shrine state of the host
  if (Array.isArray(ch)) for (let i = 0; i < r.chests.length && i * 5 + 4 < ch.length; i++) {
    const c = r.chests[i], o = i * 5;
    if (!isNum(ch[o]) || !isNum(ch[o + 1]) || !isNum(ch[o + 2])) continue;
    c.on = ch[o] === 1; c.x = (ch[o + 1] as number) / 10; c.z = (ch[o + 2] as number) / 10; c.pocket = ch[o + 3] === 1; c.used = ch[o + 4] === 1;
  }
  coopRoom.hl = isNum(d[7]) ? d[7] | 0 : -1;   // the door the host stands at ("Host is choosing..." text, ui/hud/CoopHud.tsx)
  const was = r.portals.map((p) => p.active);
  for (const po of r.portals) { po.active = false; po.pre = false; }
  if (Array.isArray(portals)) {
    for (const a of portals) {
      if (!Array.isArray(a) || a.length < 9) continue;
      const i = a[0];
      if (!isNum(i) || i < 0 || i >= r.portals.length || !isNum(a[1]) || !isNum(a[2]) || typeof a[3] !== 'string' || typeof a[4] !== 'string') continue;
      const po = r.portals[i | 0];
      po.x = a[1] / 10; po.z = a[2] / 10; po.plan = { type: a[3], reward: a[4] } as unknown as RoomPlan; po.big = a[5] === 1; po.pre = a[6] === 1; po.active = a[7] === 1;
      if (po.active && !was[i | 0]) po.t = isNum(a[8]) ? a[8] / 10 : 0;
    }
  }
}

function onBoss(d: unknown[]): void {
  if (d.length < 20) return;
  const b = world.boss;
  const n = (i: number): number => (isNum(d[i]) ? (d[i] as number) : 0), s = (i: number): string => (typeof d[i] === 'string' ? (d[i] as string).slice(0, 60) : '');
  b.active = n(2) === 1; b.hp = n(3); b.maxHp = Math.max(1, n(4)); b.phase = n(5); b.stagger = n(6) / 100; b.staggered = n(7) === 1; b.ability = s(8); b.abilityT = n(9) / 10;
  b.name = s(10); b.title = s(11); b.interrupt = n(12) / 100; b.interruptOn = n(13) === 1; b.interruptLabel = s(14); b.shield = n(15); b.shieldMax = n(16); b.final = n(17) === 1; b.stage = n(18) || 1;
  world.director.bossId = n(19); b.layers = Math.max(1, Math.min(12, n(20) | 0)) || 1;
  const bi = world.director.bossId;   // (form switch, bossForms.ts: form index + beat seconds*100; absent from older hosts = form 0)
  if (bi >= 0 && bi < bf.form.length) { bf.form[bi] = n(21) === 1 ? 1 : 0; bf.beat[bi] = Math.max(0, Math.min(BEAT_T, n(22) / 100)); }
}

const hitPos = new Vector3(), hitOpts2: { pct?: number; pos?: Vector3; kind?: (typeof DMG_KINDS)[number]; slow?: number; dot?: boolean; src?: Enemy; kb?: number; down?: number; tr?: number; env?: boolean; noDotMul?: boolean; proj?: boolean; srcId?: number; crit?: boolean } = {};
function onHit(d: unknown[]): void {
  if (d.length < 13) return;
  const v = (i: number): number => (isNum(d[i]) ? (d[i] as number) : 0);
  const amount = v(2);
  if (!(amount >= 0) || amount > 1e8) return;
  const fl = v(5), o = hitOpts2;
  o.pct = v(3) > 0 ? Math.min(1, v(3) / 1000) : undefined;
  o.kind = DMG_KINDS[v(4) | 0] ?? 'PHYSICAL';
  o.dot = (fl & HF_DOT) !== 0; o.env = (fl & HF_ENV) !== 0; o.noDotMul = (fl & HF_NODOT) !== 0; o.proj = (fl & HF_PROJ) !== 0; o.crit = (fl & HF_CRIT) !== 0;
  o.kb = v(6) > 0 ? Math.min(8, v(6) / 100) : undefined; o.down = v(7) > 0 ? Math.min(5, v(7) / 100) : undefined;
  o.slow = v(8) ? 1 : undefined; o.tr = v(9) | 0 || undefined;
  hitPos.set(v(10) / 10, 0, v(11) / 10); o.pos = hitPos;
  const sid = v(12) | 0; o.srcId = sid; o.src = sid >= 0 && sid < MAX_ENEMIES ? world.enemies[sid] : undefined;
  if (o.src && !o.src.active) o.src = undefined;
  guestStats.blowsIn++; guestStats.dmgIn += amount;
  damagePlayer(amount, o);
}

function onKill(d: unknown[]): void {
  guestStats.killsPaid++;
  const xp = isNum(d[2]) ? d[2] : 0, gold = isNum(d[3]) ? d[3] : 0, fl = isNum(d[4]) ? d[4] : 0;
  hitPos.set((isNum(d[5]) ? d[5] : 0) / 10, 0, (isNum(d[6]) ? d[6] : 0) / 10);
  const run = world.run;
  run.kills++; if (fl & 1) run.eliteKills++; if (fl & 2) run.bossKills++;
  if (xp > 0 && xp < 1e7) grantKillXp(xp, hitPos);
  if (gold > 0 && gold < 1e7) grantGoldCoin(gold);
}

function onEvt(d: unknown[]): void {
  applying = true;
  try {
    for (let i = 2; i < d.length && i < 100; i++) {
      const a = d[i]; if (!Array.isArray(a)) continue;
      const ev = decodeEvent(EV_H2G, a, mkVec); if (!ev) continue;
      events.emit(ev.name as keyof GameEvents, ev.payload as never);
    }
  } finally { applying = false; }
}

/** Messages from the host that carry combat meaning (coop.ts routes them here after its rv check). */
export function guestOnMessage(d: unknown[]): void {
  switch (d[0]) {
    case MSG.SNAP: onSnap(d); return;
    case MSG.META: onMeta(d); return;
    case MSG.RST: onRst(d); return;
    case MSG.BOSS: onBoss(d); return;
    case MSG.EVT: onEvt(d); return;
    case MSG.GP: if (typeof d[2] === 'string') applyGhosts(d[2]); return;
    case MSG.PZ: applyZones(d); return;
    case MSG.DROP: onDrop(d); return;
    case MSG.REWARD: onReward(d); return;
    case MSG.PULL: onPull(d); return;
    case MSG.HAZ: hazOnMessage(d); return;
    case MSG.HIT: if (coopRoom.guest) onHit(d); return;
    case MSG.KILL: if (coopRoom.guest) onKill(d); return;
    case MSG.DEBUF: {
      if (!coopRoom.guest || useGameStore.getState().status !== GameStatus.PLAYING || !isNum(d[2]) || !isNum(d[3]) || !isNum(d[4]) || !isNum(d[5])) return;
      const dur = Math.min(30, d[3] / 100), val = d[4] / 100;
      if (d[5] === 1) freezePlayer(dur);
      else if (d[5] === 2) slowHero(dur, val > 0 ? val : undefined);
      else { const t = DEBUFF_TYPES[d[2] | 0]; if (t) applyPlayerDebuff(t, dur, val); }
      return;
    }
    case MSG.KNOCK:
      if (coopRoom.guest && useGameStore.getState().status === GameStatus.PLAYING && isNum(d[2]) && isNum(d[3]) && isNum(d[4]) && isNum(d[5])) knockHero(d[2] / 10, d[3] / 10, Math.min(8, d[4] / 100), Math.min(5, d[5] / 100), d[6] === 1);
      return;
    default: return;
  }
}

// -------------------------------------------------------------- per frame ---
/** coopRoom.mirror: runs where the monster AI would (engine/game.ts). */
coopRoom.mirror = (dt: number): void => {
  const now = nowMs(), rt = now - INTERP_MS;
  const list = world.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.active) continue;
    const t0 = T0[i], t1 = T1[i];
    const u = t1 > t0 ? Math.min(1, Math.max(0, (rt - t0) / (t1 - t0))) : 1;
    e.pos.x = X0[i] + (X1[i] - X0[i]) * u; e.pos.z = Z0[i] + (Z1[i] - Z0[i]) * u; e.pos.y = Y0[i] + (Y1[i] - Y0[i]) * u;
    e.facing = F0[i] + wrapPi(F1[i] - F0[i]) * u;
    e.animT += dt;
    if (e.state === 'DYING') { e.deathT += dt; e.stateT += dt; } else e.stateT += dt;
    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 6.5);
  }
  const pl = world.enemyProjectiles;
  for (let i = 0; i < pl.length; i++) { const p = pl[i]; if (p.active) { p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt; } }
  const po = world.room.portals;
  for (let i = 0; i < po.length; i++) if (po[i].active) po[i].t += dt;
  const grid = world.enemyGrid;
  grid.clear();
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.active || e.state === 'DYING' || isUntargetable(e)) continue;
    grid.insert(e.id, e.pos.x, e.pos.z);
  }
};

// Re-exported so coop.ts needs one import.
export { HF_DOT };
