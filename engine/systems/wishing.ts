// ============================================================================
// Wishing Fountain runtime (owner 2026-10-31; data + table in /wishing.ts). The town plaza fountain takes one coin a day:
// E "Make a wish" -> store.makeWish() rolls + saves today's buff at once, then a short cute show plays (coin arc into the
// basin, sparkle burst, floating name, chime) and the result popup (ui/screens/WishWindow) opens. Allocation-free per frame:
// `wishFx` is a tiny mutable singleton read by render/PlazaFountain; the rest is events.
// Co-op: every player has his own wish. Drops a guest hit-claims are re-rolled on HIS client with HIS luck (net/coopLoot),
// drops the host rolls use the host's luck; gold / fishing / mining / crafting are local to each player.
// ============================================================================
import { Vector3 } from 'three';
import { events } from '../events';
import { world } from '../world';
import { useGameStore } from '../../store';
import { dayKey } from '../../dailyChallenge';
import { PLAZA_FOUNTAIN } from '../townData';
import { WISH_BY_ID, liveFx, wishedToday, type WishFx, type WishId, type WishTarget } from '../../wishing';

/** Reach (m from the fountain centre) of the "Make a wish" pill. */
export const WISH_REACH = 5.6;
/** The wish show: t < 0 idle, else seconds since the toss; id = the revealed buff. */
export const wishFx = { t: -1, id: '' as WishId | '', sx: 0, sz: 0, tossed: false, revealed: false, ver: 0 };
export const WISH_SHOW = { toss: 0.95, reveal: 1.05, end: 3.4 };   // coin lands at `toss`, sparkles + name at `reveal`, show over at `end`
const _p = new Vector3();

let dayAt = -1e9, dayCache = '';
/** Today's day key, re-read at most once a second (the pill scan / minimap call this every frame: no Date allocation then). */
function todayCached(): string { const n = performance.now(); if (n - dayAt > 1000) { dayAt = n; dayCache = dayKey(); } return dayCache; }
/** True when the hero can still make today's wish. */
export const canWishToday = (): boolean => !wishedToday(useGameStore.getState().progress.wish, todayCached());

/** Live effect numbers of one target for today (or null). Read when the activity starts. */
export function wishNow(t: WishTarget): WishFx | null { return liveFx(useGameStore.getState().progress.wish, dayKey(), t); }
/** Marks one use of a target (fish bite / craft / run start / cave trip). */
export function wishSpend(t: WishTarget, n = 1): void { useGameStore.getState().wishUse(t, n); }

/** E at the fountain: toss the coin (once a day) or just show today's buff again. */
export function makeWishHere(): void {
  const st = useGameStore.getState(), p = world.player;
  if (wishFx.t >= 0 && wishFx.t < WISH_SHOW.end) return;   // the show is still playing
  const id = st.makeWish();
  if (!id) {
    events.emit('openWish', { id: '', again: true });
    st.addNotification('The fountain is quiet today. Come back tomorrow for a new wish!', '#bfe9ff', 'WARNING');
    return;
  }
  wishFx.t = 0; wishFx.id = id; wishFx.sx = p.pos.x; wishFx.sz = p.pos.z; wishFx.tossed = false; wishFx.revealed = false; wishFx.ver++;
  p.vel.x = p.vel.z = 0; p.anim.castT = Math.max(p.anim.castT, 0.6);
  p.facing = Math.atan2(PLAZA_FOUNTAIN.x - p.pos.x, PLAZA_FOUNTAIN.z - p.pos.z);
  events.emit('wishToss', { stage: 'throw', id });
}

/** Per render frame (PlazaFountain): advances the show and fires its moments once. */
export function tickWish(dt: number): void {
  if (wishFx.t < 0) return;
  wishFx.t += dt;
  const id = wishFx.id as WishId, def = id ? WISH_BY_ID[id] : null;
  if (!wishFx.tossed && wishFx.t >= WISH_SHOW.toss) {
    wishFx.tossed = true;
    events.emit('wishToss', { stage: 'splash', id });
  }
  if (!wishFx.revealed && wishFx.t >= WISH_SHOW.reveal && def) {
    wishFx.revealed = true;
    _p.set(PLAZA_FOUNTAIN.x, 3.2, PLAZA_FOUNTAIN.z);
    events.emit('floatText', { pos: _p, text: def.name, color: parseInt(def.color.slice(1), 16), scale: 1.7 });
    events.emit('wishToss', { stage: 'reveal', id });
  }
  if (wishFx.t >= WISH_SHOW.end) {
    wishFx.t = -1; wishFx.ver++;
    if (def) events.emit('openWish', { id, again: false });
  }
}
