// Co-op STEP 3: the partner's ground skill effects (fire fields, blizzard / frost fields, curses, black holes, tornadoes + the falling arrows, meteors,
// spikes ... of the ground-fx list) are COSMETIC copies on the other screen. Each side periodically sends its OWN live friendly zones + ground fx
// (PZ, ~8 Hz, flat number arrays); the receiver draws them as `ghost` entries (aged only: no damage, no status, no pulls) and removes the ones the
// sender no longer has. Used by both the host and the guest (the host's hostile zones travel in SNAP, see coopHost / coopGuest).
import { world, allocZone, allocFx, MAX_ZONES, MAX_FX } from '../engine/world';
import type { ZoneKind, GroundFxKind } from '../engine/types';
import { isNum, MSG } from './protocol';

export interface ZonesIO { send(m: unknown[]): void; rv(): number; connected(): boolean }
let io: ZonesIO | null = null;
export function zonesBind(h: ZonesIO): void { io = h; }

/** zone kinds a hero's own skills create (the receiver only accepts these) */
const ZKINDS: ZoneKind[] = ['CURSE', 'FIRE', 'BLACKHOLE', 'FROST_NOVA', 'TORNADO', 'FROST_FIELD', 'METEOR_SHADOW', 'SHOCKWAVE'];
const FKINDS: GroundFxKind[] = ['RAIN_ARROW', 'METEOR', 'SPIKE', 'ARROW_STICK', 'CRYSTAL', 'TRAP', 'ROCK', 'BIG_METEOR', 'RING', 'GOLEM_DROP', 'BOSS_METEOR'];
const zIdx: Record<string, number> = {}; ZKINDS.forEach((k, i) => { zIdx[k] = i; });
const fIdx: Record<string, number> = {}; FKINDS.forEach((k, i) => { fIdx[k] = i; });
const ZS = 12, FS = 10;
const MAXZ = 40, MAXF = 60;
const zmap = new Int16Array(MAX_ZONES).fill(-1), zSeen = new Uint16Array(MAX_ZONES);
const fmap = new Int16Array(MAX_FX).fill(-1), fSeen = new Uint16Array(MAX_FX);
let stamp = 0, lastSend = 0, hadAny = false;
/** QA counters */
export const zoneStats = { sent: 0, got: 0 };

export function zonesReset(): void {
  zmap.fill(-1); fmap.fill(-1); hadAny = false; lastSend = 0;
  for (const z of world.zones) if (z.ghost && !z.hostile) { z.active = false; z.ghost = false; }
  for (const f of world.fx) if (f.ghost) { f.active = false; f.ghost = false; }
}

const r1 = (v: number): number => Math.round(v * 10), r2 = (v: number): number => Math.round(v * 100);

/** Called every frame while both heroes are in the same room: ships my own zones / ground fx at ~8 Hz. */
export function zonesTick(now: number, inRun: boolean): void {
  if (!io || !inRun || !io.connected() || now - lastSend < 125) return;
  lastSend = now;
  const zs: number[] = [], fs: number[] = [];
  const zl = world.zones;
  for (let i = 0; i < zl.length && zs.length < MAXZ * ZS; i++) {
    const z = zl[i];
    if (!z.active || z.ghost || z.hostile || z.permanent) continue;
    const k = zIdx[z.kind]; if (k === undefined) continue;
    zs.push(i, k, r1(z.pos.x), r1(z.pos.z), r2(z.dir.x), r2(z.dir.z), r2(z.radius), r2(z.length), r1(Math.max(0, z.life)), r1(z.maxLife), z.color | 0, r2(z.aux));
  }
  const fl = world.fx;
  for (let i = 0; i < fl.length && fs.length < MAXF * FS; i++) {
    const f = fl[i];
    if (!f.active || f.ghost || f.hostile) continue;
    const k = fIdx[f.kind]; if (k === undefined) continue;
    fs.push(i, k, r1(f.x), r1(f.z), r2(f.t), r2(f.delay), r2(f.life), r2(f.radius), r2(f.aux), f.color | 0);
  }
  if (!zs.length && !fs.length && !hadAny) return;
  hadAny = zs.length > 0 || fs.length > 0;
  zoneStats.sent++;
  io.send([MSG.PZ, io.rv(), zs, fs]);
}

/** The partner's zones arrived: create / refresh my ghost copies, drop the ones he no longer has. */
export function applyZones(d: unknown[]): void {
  const zs = d[2], fs = d[3];
  stamp = (stamp + 1) & 0xffff || 1;
  zoneStats.got++;
  if (Array.isArray(zs)) {
    for (let o = 0; o + ZS <= zs.length && o < MAXZ * ZS; o += ZS) {
      const id = zs[o], k = zs[o + 1];
      if (!isNum(id) || id < 0 || id >= MAX_ZONES || !isNum(k) || !ZKINDS[k | 0]) continue;
      let ok = true; for (let j = 2; j < ZS; j++) if (!isNum(zs[o + j])) { ok = false; break; }
      if (!ok) continue;
      const i = id | 0;
      let z = zmap[i] >= 0 ? world.zones[zmap[i]] : null;
      if (!z || !z.active || !z.ghost) {
        z = allocZone();
        if (!z) continue;
        zmap[i] = z.id;
        z.active = true; z.ghost = true; z.hostile = false; z.permanent = false; z.tickT = 0; z.damage = 0;
        z.kind = ZKINDS[k | 0];
      }
      zSeen[i] = stamp;
      z.pos.set((zs[o + 2] as number) / 10, 0, (zs[o + 3] as number) / 10);
      z.dir.set((zs[o + 4] as number) / 100, 0, (zs[o + 5] as number) / 100);
      z.radius = Math.min(60, (zs[o + 6] as number) / 100); z.length = Math.min(120, (zs[o + 7] as number) / 100);
      z.life = Math.min(60, (zs[o + 8] as number) / 10); z.maxLife = Math.min(60, (zs[o + 9] as number) / 10);
      z.color = (zs[o + 10] as number) | 0; z.aux = (zs[o + 11] as number) / 100;
    }
  }
  for (let i = 0; i < MAX_ZONES; i++) {
    const m = zmap[i];
    if (m < 0 || zSeen[i] === stamp) continue;
    zmap[i] = -1;
    const z = world.zones[m];
    if (z.ghost && !z.hostile) { z.active = false; z.ghost = false; }
  }
  if (Array.isArray(fs)) {
    for (let o = 0; o + FS <= fs.length && o < MAXF * FS; o += FS) {
      const id = fs[o], k = fs[o + 1];
      if (!isNum(id) || id < 0 || id >= MAX_FX || !isNum(k) || !FKINDS[k | 0]) continue;
      let ok = true; for (let j = 2; j < FS; j++) if (!isNum(fs[o + j])) { ok = false; break; }
      if (!ok) continue;
      const i = id | 0;
      fSeen[i] = stamp;
      const cur = fmap[i] >= 0 ? world.fx[fmap[i]] : null;
      if (cur && cur.active && cur.ghost) continue;   // already running: it ages by itself
      const f = allocFx();
      if (!f) continue;
      fmap[i] = f.id;
      f.active = true; f.ghost = true; f.hostile = false; f.kind = FKINDS[k | 0];
      f.x = (fs[o + 2] as number) / 10; f.z = (fs[o + 3] as number) / 10; f.t = (fs[o + 4] as number) / 100; f.delay = (fs[o + 5] as number) / 100;
      f.life = Math.min(30, (fs[o + 6] as number) / 100); f.radius = Math.min(60, (fs[o + 7] as number) / 100); f.aux = (fs[o + 8] as number) / 100; f.color = (fs[o + 9] as number) | 0;
      f.dmg = 0; f.done = false; f.launch = false; f.sx = f.x; f.sz = f.z;
    }
  }
  for (let i = 0; i < MAX_FX; i++) {   // (the sender's slot is gone: let the ghost play out on its own, just forget the mapping)
    if (fmap[i] >= 0 && fSeen[i] !== stamp) fmap[i] = -1;
  }
}
