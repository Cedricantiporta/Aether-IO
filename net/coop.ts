// Online 2-player co-op session (host-authoritative). STEP 1: lobby + link, shared room plan (seed), remote hero positions.
// The HOST runs the whole simulation; the GUEST builds the host's rooms from the same seed, spawns no enemies and just walks
// beside the host (combat sync is step 2). See docs/HANDOFF.md "Co-op".
//
// Per-frame state lives in `world.remote` (preallocated); the Zustand slice (net/coopStore.ts) only changes at discrete moments.
import { world } from '../engine/world';
import { events } from '../engine/events';
import { runInfo } from '../engine/runMods';
import { useGameStore } from '../store';
import { useUiStore } from '../ui/uiStore';
import { activeChar } from '../characters';
import { GameStatus } from '../types';
import { trialAccess, TICKET_NAME, TRIAL_BOSSES } from '../bossTrials';
import { trialBossCleared } from '../engine/systems/trialRun';
import { reviveByFriend } from '../engine/systems/combat';
import { collectAllPickups } from '../engine/systems/pickups';
import type { RoomPlan } from '../engine/types';
import { coopRoom } from './coopRoom';
import { hostBind, hostTick, hostReset, hostOnMessage, hostGuestSeen, hostStats } from './coopHost';
import { zonesReset, zonesBind, zoneStats } from './coopZones';
import { lootBind, lootStats } from './coopLoot';
import { pullBind, pullReset, pullStats } from './coopPull';
import { guestBind, guestTick, guestReset, guestOnMessage, guestStats } from './coopGuest';
import { useCoop, coopSet } from './coopStore';
import { pickTransport, type Conn, type Handle, type Transport } from './transport';
import { COOP_VERSION, MSG, F_ALIVE, F_ATTACK, F_CAST, F_DASH, F_DOWN, F_PAUSED, PARTNER_GRACE_MS, REVIVE_TIME, REVIVE_RANGE, clampInt, isNum, makeCode, normaliseCode, sanitizePlan, sanitizeSnap, type HeroSnap } from './protocol';

const POS_HZ = 16, POS_EVERY_MS = 1000 / POS_HZ;
const INTERP_MS = 100;          // render the partner this far in the past (buffer for jitter)
const BEAT_MS = 1000;           // ping interval
// no message for this long = connection lost (`?coopTimeout=ms` raises it for headless tests, where software GL starves the page)
const TIMEOUT_MS = (() => { try { const v = Number(new URLSearchParams(location.search).get('coopTimeout')); return v >= 3000 ? v : 10000; } catch { return 10000; } })();
const SETUP_MS = 12000;         // hosting / joining must succeed within this

let tr: Transport = pickTransport();
let handle: Handle | null = null;
let conn: Conn | null = null;
let role: 'host' | 'guest' | null = null;
let code = '';
let lastRx = 0, lastTx = 0, beat: ReturnType<typeof setInterval> | null = null, setupT: ReturnType<typeof setTimeout> | null = null;
let rv = 0;                     // room counter: host bumps it per room, guest copies it; POS of another room is ignored
let runFresh = false;           // the next room the host enters opens a run
let pending: { rv: number; b: number; idx: number; plan: RoomPlan; seed: number; first: boolean; trial: boolean } | null = null;

// ---- the partner's last known state (survives room changes: a downed hero must not give up while the friend is only loading a room)
let pFlags = 0, pSeen = 0, reviveGot = 0, lastRevAt = 0;

// ---- remote position ring buffer (no allocation after load): t, x, z, facing, blend, flags, hp
const N = 16, W = 7;
const ring = new Float64Array(N * W);
let head = 0, count = 0;

const notify = (msg: string, color = '#9be7ff'): void => { useGameStore.getState().addNotification(msg, color, 'SYSTEM'); };
const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const connected = (): boolean => !!conn && useCoop.getState().state === 'connected';
export const coopRole = (): 'host' | 'guest' | null => role;
export const coopConnected = connected;

export function mySnap(): HeroSnap {
  const s = useGameStore.getState(), eq = (s.equipment ?? {}) as unknown as Record<string, { rarity?: string; name?: string } | null>, ch = activeChar();
  return {
    n: ch?.name || 'Hero', c: s.hero as HeroSnap['c'], t: ch?.tint ?? '#ffffff', l: s.level || 1,
    w: eq.weapon?.rarity || '', g: ['helmet', 'armor', 'gloves', 'boots', 'accessory'].map((k) => eq[k]?.rarity || ''),
    p: eq.pet?.name || '', pr: eq.pet?.rarity || '',
  };
}

// ---------------------------------------------------------------- lifecycle ---
function clearTimers(): void {
  if (beat) { clearInterval(beat); beat = null; }
  if (setupT) { clearTimeout(setupT); setupT = null; }
}
function resetRemote(): void { count = 0; head = 0; world.remote.active = false; world.remote.reviveIn = 0; }
/** the world of the co-op combat layer (monster mirror, stand-in hero, queues): `full` = also forget that a partner joined this run */
function resetCombat(full: boolean): void { hostReset(full); zonesReset(); pullReset(); if (role === 'guest') guestReset(); }   // (guestReset wipes the monster pools: only ever on the guest, whose monsters are a mirror)
function teardown(): void {
  clearTimers();
  const c = conn; conn = null;
  if (c) { c.onClose = undefined; c.onData = undefined; try { c.close(); } catch { /* ignore */ } }
  const h = handle; handle = null;
  try { h?.close(); } catch { /* ignore */ }
  resetRemote(); resetCombat(true); pending = null; invite = null; pFlags = 0; pSeen = 0; coopRoom.reviveOut = 0; coopRoom.hl = -1;
}
function toTown(msg: string): void {
  const was = coopRoom.guest;
  coopRoom.guest = false; coopRoom.forced = null;
  const st = useGameStore.getState();
  if (was && st.status !== GameStatus.MENU) {
    // the host is gone: everything this hero already picked up is his (his loot went straight into HIS bag / purse); loot still on the floor is banked too
    if (st.status === GameStatus.PLAYING || st.status === GameStatus.PAUSED || st.status === GameStatus.LEVEL_UP) { try { collectAllPickups(); } catch { /* ignore */ } st.abandonRun(); }
    else st.resetGame();
  }
  if (msg) notify(msg, '#ffd08a');
}
function fail(msg: string): void {
  teardown(); const was = role; role = null;
  if (was === 'guest') coopRoom.guest = false;
  coopSet({ state: 'error', role: null, code: '', ready: false, error: msg, ping: 0, partner: null });
}
/** The other player is gone (or we leave): back to idle. The host just carries on solo; a guest in a co-op run goes home. */
function partnerGone(msg: string): void {
  const was = role;
  teardown(); role = null;
  coopSet({ state: 'idle', role: null, code: '', ready: false, error: msg, ping: 0, partner: null });
  if (was === 'guest') toTown(msg); else if (was === 'host') notify(msg + ' You carry on solo.', '#ffd08a');
}

export function hostCoop(): void {
  const st = useCoop.getState().state;
  if (st === 'hosting' || st === 'connected' || st === 'joining') return;
  teardown(); tr = pickTransport(); role = 'host';
  tryHost(0);
}
function tryHost(attempt: number): void {
  code = makeCode();
  coopSet({ state: 'hosting', role: 'host', code, ready: false, error: '', ping: 0, partner: null, transport: tr.name });
  if (setupT) clearTimeout(setupT);
  setupT = setTimeout(() => { if (!useCoop.getState().ready) fail('Could not reach the matchmaking service. Check your internet and try again.'); }, SETUP_MS);
  handle = tr.host(code, {
    onReady: () => { if (setupT) { clearTimeout(setupT); setupT = null; } coopSet({ ready: true }); },
    onConn: (c) => onLink(c),
    onError: (kind, m) => {
      if (kind === 'taken' && attempt < 4) { try { handle?.close(); } catch { /* ignore */ } handle = null; tryHost(attempt + 1); }
      else fail(kind === 'taken' ? 'Could not open a room. Try again.' : `Matchmaking problem (${m}). Try again.`);
    },
  });
}

export function joinCoop(raw: string): void {
  const st = useCoop.getState().state;
  if (st === 'hosting' || st === 'connected' || st === 'joining') return;
  const c = normaliseCode(raw);
  if (!c) { coopSet({ state: 'error', error: 'Enter the 4-letter code from your friend.' }); return; }
  teardown(); tr = pickTransport(); role = 'guest'; code = c;
  coopSet({ state: 'joining', role: 'guest', code: c, ready: false, error: '', ping: 0, partner: null, transport: tr.name });
  setupT = setTimeout(() => fail('No answer from that room. Check the code and that your friend is hosting.'), SETUP_MS);
  handle = tr.join(c, {
    onOpen: (cn) => onLink(cn),
    onError: (m) => fail(m === 'nohost' ? 'No room with that code. Check the letters.' : m === 'full' ? 'That room already has two players.' : `Could not connect (${m}).`),
  });
}

/** Leave / cancel co-op from anywhere (lobby cancel, HUD, pause menu). */
export function leaveCoop(): void {
  const was = role, wasConnected = connected();
  if (conn) { try { conn.send([MSG.BYE, was === 'host' ? 'Your friend closed the room.' : 'Your friend left the co-op.']); } catch { /* ignore */ } }
  teardown(); role = null;
  coopSet({ state: 'idle', role: null, code: '', ready: false, error: '', ping: 0, partner: null });
  if (was === 'guest' && wasConnected) toTown('You left the co-op.');
}

/** A data link to the other player is open: swap hellos, start the heartbeat. */
function onLink(c: Conn): void {
  if (conn) { try { c.send([MSG.BYE, 'This room already has two players.']); } catch { /* ignore */ } try { c.close(); } catch { /* ignore */ } return; }
  conn = c;
  c.onData = onData;
  c.onClose = () => { if (conn === c) partnerGone('Your friend lost connection.'); };
  lastRx = nowMs(); lastTx = 0; lastBeat = 0; gotHello = false;
  if (setupT) { clearTimeout(setupT); setupT = null; }
  if (role === 'host' && handle) { /* keep the broker handle: it is released on teardown */ }
  send([MSG.HELLO, COOP_VERSION, mySnap()]);
  if (beat) clearInterval(beat);
  beat = setInterval(heartbeat, BEAT_MS);
}
let lastBeat = 0;
let gotHello = false;   // first HELLO of this link seen (we answer it once: a HELLO sent before the other side attached its handler is not lost)
function heartbeat(): void {
  if (!conn) return;
  const now = nowMs();
  // our own thread was frozen (a long room build / backgrounded tab): the partner's queued messages have not been read yet, so do not blame them
  if (lastBeat && now - lastBeat > BEAT_MS * 2.5) lastRx = now;
  lastBeat = now;
  if (now - lastRx > TIMEOUT_MS) { partnerGone('Connection to your friend timed out.'); return; }
  send([MSG.PING, nowMs()]);
}
function send(m: unknown[]): void {
  if (stats.on) { try { const n = JSON.stringify(m).length; stats.tx += n; const k = String(m[0]); stats.txBy[k] = (stats.txBy[k] ?? 0) + n; } catch { /* ignore */ } }
  try { conn?.send(m); } catch { /* link gone: the close handler cleans up */ }
}
// bandwidth meter (dev / QA: `?coopStats=1` or window.__coop.stats()): JSON bytes of every message sent / received
const stats = { on: (() => { try { return new URLSearchParams(location.search).get('coopStats') === '1' || !!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV; } catch { return false; } })(), tx: 0, rx: 0, t0: 0, txBy: {} as Record<string, number>, rxBy: {} as Record<string, number> };
const io = { send, rv: () => rv, connected };
hostBind(io); guestBind(io); lootBind(io); zonesBind(io); pullBind(io);

// ------------------------------------------------------------------ receive ---
function onData(d: unknown): void {
  lastRx = nowMs();
  if (!Array.isArray(d)) return;
  if (stats.on) { try { const n = JSON.stringify(d).length; stats.rx += n; const k = String(d[0]); stats.rxBy[k] = (stats.rxBy[k] ?? 0) + n; } catch { /* ignore */ } }
  switch (d[0]) {
    case MSG.HELLO: {
      if (d[1] !== COOP_VERSION) {
        const theirs = isNum(d[1]) ? d[1] : '?';
        send([MSG.BYE, `Different game versions (yours ${COOP_VERSION}, theirs ${theirs}). Update the game on both devices.`]);
        const msg = `Your friend has a different game version (yours ${COOP_VERSION}, theirs ${theirs}). Update the game on both devices and try again.`;
        if (role === 'host') {   // keep the room open for someone with the right version
          const c = conn; conn = null; if (beat) { clearInterval(beat); beat = null; }
          if (c) { c.onClose = undefined; c.onData = undefined; setTimeout(() => { try { c.close(); } catch { /* ignore */ } }, 100); }
          coopSet({ error: msg }); notify(msg, '#ffd08a');
        } else setTimeout(() => fail(msg), 50);
        return;
      }
      const snap = sanitizeSnap(d[2]);
      if (!snap) { fail('Your friend sent an unreadable hero. Try again.'); return; }
      const first = useCoop.getState().state !== 'connected';
      if (!gotHello) { gotHello = true; send([MSG.HELLO, COOP_VERSION, mySnap()]); }
      coopSet({ state: 'connected', partner: snap, error: '' });
      if (first) notify(`${snap.n} (Lv ${snap.l} ${snap.c.charAt(0) + snap.c.slice(1).toLowerCase()}) joined the co-op!`, '#9be7ff');
      return;
    }
    case MSG.BYE: partnerGone(typeof d[1] === 'string' ? d[1].slice(0, 120) : 'Your friend left.'); return;
    case MSG.PING: send([MSG.PONG, d[1]]); return;
    case MSG.PONG: {
      if (!isNum(d[1])) return;
      const rtt = Math.max(1, Math.round(nowMs() - d[1])), cur = useCoop.getState().ping;
      const sm = cur ? Math.round(cur * 0.6 + rtt * 0.4) : rtt;
      if (sm !== cur) coopSet({ ping: sm });
      return;
    }
    case MSG.ROOM: if (role === 'guest') onRoomMsg(d); return;
    case MSG.LEAVING: if (role === 'guest' && coopRoom.guest && world.room.active) world.room.fadeTarget = 1; return;
    case MSG.POS: onPos(d); return;
    case MSG.END: if (role === 'guest' && coopRoom.guest && useGameStore.getState().status !== GameStatus.GAME_OVER) toTown('The host\'s adventure is over.'); return;   // (a guest looking at his own game-over summary goes home by himself)
    // ---- STEP 2 (combat): a message of another room is dropped
    case MSG.SNAP: case MSG.META: case MSG.RST: case MSG.BOSS: case MSG.HIT: case MSG.DEBUF: case MSG.KNOCK: case MSG.KILL: case MSG.DROP: case MSG.REWARD: case MSG.PULL:
      if (role === 'guest' && coopRoom.guest && d[1] === rv) guestOnMessage(d);
      return;
    case MSG.REVIVE:   // (STEP 3) my friend finished reviving me
      if (d[1] === rv && world.player.downed) reviveByFriend();
      return;
    case MSG.EVT: case MSG.GP: case MSG.PZ:
      if (d[1] !== rv) return;
      if (role === 'guest' && coopRoom.guest) guestOnMessage(d); else if (role === 'host') hostOnMessage(d);
      return;
    case MSG.DMG: if (role === 'host' && d[1] === rv) hostOnMessage(d); return;
    // ---- STEP 4
    case MSG.TRIAL: if (role === 'guest') onTrialInvite(d); return;
    case MSG.TRIALR: if (role === 'host') onTrialReply(d); return;
    case MSG.TWIN: if (role === 'guest' && coopRoom.guest && d[1] === rv) trialBossCleared(true); return;
    default: return;
  }
}

function onPos(d: unknown[]): void {
  if (d.length < 8 || d[1] !== rv) return;
  const rin = isNum(d[8]) ? d[8] / 100 : 0;
  const x = d[2], z = d[3], f = d[4], b = d[5], fl = d[6], hp = d[7];
  if (!isNum(x) || !isNum(z) || !isNum(f) || !isNum(b) || !isNum(fl) || !isNum(hp)) return;
  const o = head * W;
  ring[o] = nowMs(); ring[o + 1] = x / 100; ring[o + 2] = z / 100; ring[o + 3] = f / 100; ring[o + 4] = b / 100; ring[o + 5] = fl | 0; ring[o + 6] = hp / 100;
  head = (head + 1) % N; if (count < N) count++;
  pFlags = fl | 0; pSeen = nowMs(); world.remote.reviveIn = rin > 0 ? Math.min(1, rin) : 0;
  world.remote.rx++;
  if (role === 'host') hostGuestSeen();
}

// ------------------------------------------------------------ run / rooms ---
function onRoomMsg(d: unknown[]): void {
  const plan = sanitizePlan(d[4]);
  if (!plan || !isNum(d[5])) return;
  if (d[7] !== 'ADVENTURE' && d[7] !== 'BOSS_TRIAL') { notify('Your friend started a mode that co-op does not support yet.', '#ffd08a'); return; }
  pending = { rv: clampInt(d[1], 0, 1e9), b: clampInt(d[2], 0, 20), idx: clampInt(d[3], 0, 40), plan: plan as unknown as RoomPlan, seed: (d[5] as number) >>> 0, first: d[6] === 1, trial: d[7] === 'BOSS_TRIAL' };
  applyPending();
}
function applyPending(): void {
  const p = pending; if (!p || role !== 'guest') return;
  const st = useGameStore.getState(), status = st.status;
  if (p.first) {
    if (status !== GameStatus.MENU || !useUiStore.getState().titleDone || useUiStore.getState().charSelect) {
      if (status === GameStatus.PLAYING || status === GameStatus.PAUSED) { pending = null; notify('Your friend set out. Return to town and ask them to set out again to join.', '#ffd08a'); }
      return;
    }
    pending = null;
    coopRoom.guest = true; rv = p.rv; resetRemote();
    coopRoom.forced = { b: p.b, idx: p.idx, plan: p.plan, seed: p.seed };
    if (p.trial) {   // (STEP 4) a co-op Boss Trial: my own daily try / ticket rules apply (the host asked first, TRIAL / TRIALR)
      if (!st.startBossTrial(p.b)) { coopRoom.guest = false; coopRoom.forced = null; notify('Could not join the Boss Trial (already won today, or no ticket).', '#ffd08a'); }
      return;
    }
    st.startMode('ADVENTURE', 0);
    return;
  }
  if (!coopRoom.guest) { pending = null; return; }
  if (status !== GameStatus.PLAYING && status !== GameStatus.LEVEL_UP && status !== GameStatus.PAUSED) return;   // (a card pick / the pause menu do not hold the room change back: the world runs on)
  pending = null;
  rv = p.rv; resetRemote(); guestReset();
  coopRoom.forced = { b: p.b, idx: p.idx, plan: p.plan, seed: p.seed };
  world.room.fade = 1;
  coopRoom.enter?.(p.b, p.idx, p.plan);
}

/** director.enterRoom -> here (hook): the host tells the guest which room to build. */
coopRoom.onEnter = (b, idx, plan, seed) => {
  if (role !== 'host') return;
  rv++; resetRemote(); resetCombat(false);
  const first = runFresh; runFresh = false;
  if (!connected() || (runInfo.mode !== 'ADVENTURE' && runInfo.mode !== 'BOSS_TRIAL')) return;
  send([MSG.ROOM, rv, b, idx, plan, seed, first ? 1 : 0, runInfo.mode]);
};
coopRoom.trialWin = () => { if (role === 'host' && connected()) send([MSG.TWIN, rv]); };
coopRoom.onLeaving = () => { if (role === 'host' && connected()) send([MSG.LEAVING, rv]); };
events.on('runStart', () => { runFresh = true; resetRemote(); resetCombat(true); pFlags = 0; pSeen = 0; coopRoom.reviveOut = 0; });
events.on('runEnd', () => {
  runFresh = false; resetRemote(); resetCombat(true); pFlags = 0; pSeen = 0; coopRoom.reviveOut = 0;
  if (role === 'host' && connected()) send([MSG.END]);
  else if (role === 'guest') { coopRoom.guest = false; coopRoom.forced = null; }
});

// ------------------------------------------------------------ boss trials ---
// (STEP 4) The host picks a Boss Trial in the purple portal's window and asks his friend (TRIAL). The friend checks HIS OWN rules (the portal is open for him, the
// daily try of that boss is free or he holds a ticket) and answers (TRIALR); only when he says yes does the host start the trial and the friend is pulled in by the
// usual ROOM message (mode BOSS_TRIAL). Each side then runs the normal trial rules for himself; on the win the host sends TWIN and both roll their own loot.
let invite: { boss: number; at: number } | null = null;
const ticketsOf = (): number => useGameStore.getState().inventory.reduce((n, i) => (i.type === 'LOOT' && i.name === TICKET_NAME ? n + (i.quantity || 1) : n), 0);
const myAccess = (boss: number) => { const s = useGameStore.getState(); return trialAccess(s.progress.endings, s.progress.trialDay, ticketsOf(), boss); };
/** HOST: ask the friend to take part in the trial of `boss` (the window then waits for his answer). Returns false when it cannot be asked. */
export function coopInviteTrial(boss: number): boolean {
  if (role !== 'host' || !connected() || !(boss >= 0 && boss < TRIAL_BOSSES.length)) return false;
  const a = myAccess(boss);
  if (a === 'locked' || a === 'asleep') { notify('You cannot start this trial right now.', '#ffd08a'); return false; }
  invite = { boss, at: nowMs() };
  send([MSG.TRIAL, boss]);
  notify(`Asking ${useCoop.getState().partner?.n ?? 'your friend'} to join the Boss Trial...`, '#c58cff');
  return true;
}
function onTrialInvite(d: unknown[]): void {
  const boss = isNum(d[1]) ? d[1] | 0 : -1;
  const st = useGameStore.getState();
  let reason = 0;
  if (!(boss >= 0 && boss < TRIAL_BOSSES.length)) reason = 3;
  else if (st.status !== GameStatus.MENU || !useUiStore.getState().titleDone || useUiStore.getState().charSelect) reason = 3;
  else { const a = myAccess(boss); reason = a === 'asleep' ? 1 : a === 'locked' ? 2 : 0; }
  send([MSG.TRIALR, boss, reason === 0 ? 1 : 0, reason]);
  if (reason === 0) notify(`${useCoop.getState().partner?.n ?? 'Your friend'} is starting a Boss Trial. Get ready!`, '#c58cff');
}
function onTrialReply(d: unknown[]): void {
  const iv = invite; if (!iv || d[1] !== iv.boss) return;
  invite = null;
  const who = useCoop.getState().partner?.n ?? 'Your friend';
  if (d[2] === 1) { if (!useGameStore.getState().startBossTrial(iv.boss)) notify('Could not start the trial.', '#ffd08a'); return; }
  const why = d[3] === 1 ? 'has not opened the Boss Portal yet' : d[3] === 2 ? 'already won this trial today and has no ticket' : 'cannot join right now (busy or not in town)';
  notify(`${who} ${why}.`, '#ffd08a');
}

// ------------------------------------------------------- downed + revive ---
// A hero at 0 HP lies DOWN (combat.damagePlayer / player.ts) while the partner is up. The partner revives him by standing next to him for REVIVE_TIME seconds
// (progress shown on both screens; walking away resets it). Each side runs only the half where HE is the reviver; the downed one gets MSG.REVIVE.
coopRoom.partner = (): 0 | 1 | 2 => {
  if (!connected() || nowMs() - pSeen > PARTNER_GRACE_MS) return 0;
  return (pFlags & F_DOWN) !== 0 ? 2 : (pFlags & F_ALIVE) !== 0 ? 1 : 0;
};
coopRoom.live = (): boolean => connected() && (role === 'host' ? coopRoom.two : role === 'guest' ? coopRoom.guest : false);
coopRoom.canBeDowned = (): boolean => coopRoom.live() && coopRoom.partner() === 1;
function reviveTick(now: number, st: GameStatus): void {
  const dt = lastRevAt ? Math.min(0.1, (now - lastRevAt) / 1000) : 0; lastRevAt = now;
  const p = world.player, R = world.remote;
  const can = p.alive && !p.downed && st === GameStatus.PLAYING && R.active && (R.flags & F_DOWN) !== 0 && Math.hypot(R.x - p.pos.x, R.z - p.pos.z) <= REVIVE_RANGE;
  if (!can) { coopRoom.reviveOut = 0; return; }
  coopRoom.reviveOut = Math.min(1, coopRoom.reviveOut + dt / REVIVE_TIME);
  if (coopRoom.reviveOut >= 1) {
    coopRoom.reviveOut = 0;
    send([MSG.REVIVE, rv]);
    pFlags = F_ALIVE; pSeen = now;   // (he stands up: until his next position says so, do not start another revive)
    R.flags = F_ALIVE;
    notify(`You revived ${useCoop.getState().partner?.n ?? 'your friend'}!`, '#9be7ff');
  }
}

// ------------------------------------------------------------- per frame ---
/** Called once per frame from engine/game.updateGame (before the status switch): sends my position, interpolates the partner. */
export function coopTick(): void {
  if (!role) return;
  if (invite && nowMs() - invite.at > 6000) { invite = null; notify('No answer from your friend. Try again.', '#ffd08a'); }
  if (!conn || useCoop.getState().state !== 'connected') { world.remote.active = false; if (coopRoom.ally || coopRoom.two) hostReset(true); return; }
  const st = useGameStore.getState().status, now = nowMs();
  if (pending) applyPending();
  const inRun = (role === 'host' ? (runInfo.mode === 'ADVENTURE' || runInfo.mode === 'BOSS_TRIAL') && world.room.active : coopRoom.guest) && (st === GameStatus.PLAYING || st === GameStatus.PAUSED || st === GameStatus.LEVEL_UP);
  // ---- send my state
  if (inRun && now - lastTx >= POS_EVERY_MS) {
    lastTx = now;
    const p = world.player, a = p.anim, hpMax = Math.max(1, useGameStore.getState().stats.maxHealth);
    send([MSG.POS, rv, Math.round(p.pos.x * 100), Math.round(p.pos.z * 100), Math.round(p.facing * 100), Math.round(a.moveBlend * 100),
      (p.alive ? F_ALIVE : 0) | (a.attackT > 0.5 ? F_ATTACK : 0) | (a.dashing ? F_DASH : 0) | (a.castT > 0.5 ? F_CAST : 0) | (p.downed ? F_DOWN : 0) | (st === GameStatus.PAUSED ? F_PAUSED : 0), Math.round(Math.max(0, Math.min(1, p.hp / hpMax)) * 100), Math.round(coopRoom.reviveOut * 100)]);
  }
  // ---- interpolate the partner (render time = now - INTERP_MS)
  const R = world.remote;
  if (!inRun || count === 0) { R.active = false; coopRoom.reviveOut = 0; if (role === 'host') hostTick(now, inRun, R); else guestTick(now, inRun); return; }
  const newest = (head - 1 + N) % N;
  if (now - ring[newest * W] > 3000) { R.active = false; coopRoom.reviveOut = 0; if (role === 'host') hostTick(now, inRun, R); else guestTick(now, inRun); return; }
  const rt = now - INTERP_MS;
  let a = -1, b = -1;
  for (let k = 0; k < count; k++) {   // newest -> oldest
    const i = (head - 1 - k + N) % N;
    if (ring[i * W] <= rt) { a = i; break; }
    b = i;
  }
  const A = (a < 0 ? b : a) * W;
  let x = ring[A + 1], z = ring[A + 2], f = ring[A + 3], bl = ring[A + 4];
  if (a >= 0 && b >= 0) {
    const B = b * W, span = ring[B] - ring[A], u = span > 0 ? Math.min(1, Math.max(0, (rt - ring[A]) / span)) : 1;
    x += (ring[B + 1] - x) * u; z += (ring[B + 2] - z) * u; bl += (ring[B + 4] - bl) * u;
    let df = ring[B + 3] - f; df = df - Math.PI * 2 * Math.floor((df + Math.PI) / (Math.PI * 2)); f += df * u;
  }
  const L = newest * W;
  R.x = x; R.z = z; R.facing = f; R.blend = bl; R.flags = ring[L + 5]; R.hp = ring[L + 6]; R.active = true;
  reviveTick(now, st);
  if (role === 'host') hostTick(now, inRun, R); else guestTick(now, inRun);   // STEP 2: stand-in hero + world snapshots (host) / hit claims + my projectiles (guest)
}

// Dev hook for headless tests (vite dev only): drive / inspect co-op from the page.
if (typeof window !== 'undefined' && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
  setTimeout(() => { (window as unknown as Record<string, unknown>).__coop = { host: hostCoop, join: joinCoop, leave: leaveCoop, useCoop, world, events, store: useGameStore, coopRoom, ui: useUiStore, ring: () => ({ head, count, rv }), partnerState: () => ({ pFlags, pSeen, now: nowMs(), partner: coopRoom.partner(), live: coopRoom.live(), reviveOut: coopRoom.reviveOut }), stats: () => ({ tx: stats.tx, rx: stats.rx, txBy: stats.txBy, rxBy: stats.rxBy, host: hostStats, guest: guestStats, loot: lootStats, zones: zoneStats, pull: pullStats }), statsReset: () => { stats.tx = 0; stats.rx = 0; stats.txBy = {}; stats.rxBy = {}; } };
    import('../engine/game').then((m) => { (window as unknown as { __coop: Record<string, unknown> }).__coop.game = m; }).catch(() => { /* ignore */ });
    import('../engine/systems/enemies').then((m) => { (window as unknown as { __coop: Record<string, unknown> }).__coop.enemies = m; }).catch(() => { /* ignore */ });
    import('../engine/systems/combat').then((m) => { (window as unknown as { __coop: Record<string, unknown> }).__coop.combat = m; }).catch(() => { /* ignore */ });
    import('../engine/systems/bossMech').then((m) => { (window as unknown as { __coop: Record<string, unknown> }).__coop.mech = m; }).catch(() => { /* ignore */ });
    import('../engine/systems/pickups').then((m) => { (window as unknown as { __coop: Record<string, unknown> }).__coop.pickups = m; }).catch(() => { /* ignore */ });
  }, 0);   // (deferred: store.ts and engine/game.ts import each other, the store is not ready while this module loads)
}
