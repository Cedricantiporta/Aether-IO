// Co-op STEP 4: my summons (necromancer skeletons / golem / bowmen) and my pet as COSMETIC GHOSTS on the partner's screen. Both ways, ~8 Hz, one flat number array;
// the receiver keeps them in `world.ghostMinions` / `world.ghostPet` (nothing in the simulation reads these: monsters never target them, no damage) and eases them toward
// the newest position (render/Minions.tsx draws the ghost pool half transparent). No allocation per frame; one small array per message while something exists.
import { Vector3 } from 'three';
import { world } from '../engine/world';
import { events } from '../engine/events';
import { coopRoom } from './coopRoom';
import { useGameStore } from '../store';
import { MSG, isNum } from './protocol';
import { PETS_POOL } from '../constants';
import { rate } from './coopRate';

export interface MinIO { send(m: unknown[]): void; rv(): number; connected(): boolean }
let io: MinIO | null = null;
export function minBind(h: MinIO): void { io = h; }
export const minStats = { sent: 0, got: 0 };

const STRIDE = 10;
const RAR = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
let lastSend = 0, sentAny = false, lastKey = 0;

// my pet's attacks (world.petAtk, written by engine/systems/pets.ts petAtk): an attack whose attackT stretch rises without a specific record
// (leech bite, chomp, zap, slam, heal pulse...) is sent as kind 6 = stretch only. The partner replays them on his ghost of my pet.
let prevAtkT = 0, seqSeen = -1;
events.on('playerRevive', (e) => {
  if (e.source !== 'PHOENIX' || e.pos !== world.player.pos) return;
  const q = world.petAtk; q.seq = (q.seq + 1) & 0xffff; q.kind = 8; q.x = e.pos.x; q.z = e.pos.z; q.el = 0; q.dx = 0; q.dz = 1; q.a = 0; q.tier = 0;
});
function watchAttack(): void {
  const q = world.petAtk, a = world.pet.attackT;
  if (a > 0.8 && prevAtkT <= 0.8 && q.seq === seqSeen) { q.seq = (q.seq + 1) & 0xffff; q.kind = 6; q.el = 0; q.x = world.pet.pos.x; q.z = world.pet.pos.z; q.dx = Math.sin(world.pet.facing); q.dz = Math.cos(world.pet.facing); q.a = 0; q.tier = 0; }
  seqSeen = q.seq; prevAtkT = a;
}

/** every frame (host: hostTick, guest: guestTick) while both heroes are in the room */
export function minTick(now: number, dt: number): void {
  step(dt);
  watchAttack();
  if (!io || !io.connected() || now - lastSend < 125 * rate.mul) return;
  lastSend = now;
  const flat: number[] = [];
  const M = world.minions;
  for (let i = 0; i < M.length && flat.length < STRIDE * 16; i++) {
    const m = M[i];
    if (!m.active || m.src === 6) continue;
    flat.push(m.kind, Math.round(m.x * 10), Math.round(m.z * 10), Math.round(m.facing * 100), Math.round(m.mv * 100), Math.round(m.swing * 100), Math.round(Math.max(0, Math.min(1, m.maxHp > 0 ? m.hp / m.maxHp : 1)) * 100), m.shield > 0 ? 1 : 0, Math.round(m.spin * 100), Math.round(m.rise * 100));
  }
  const eq = useGameStore.getState().equipment as unknown as Record<string, { rarity?: string; name?: string; id?: string } | null | undefined>;
  const pet = eq?.pet, p = world.pet.pos;
  const petRow = pet ? [1, Math.round(p.x * 10), Math.round(p.z * 10), Math.max(0, RAR.indexOf(pet.rarity ?? '')), PETS_POOL.find((x) => x.name === pet.name)?.id ?? PETS_POOL.find((x) => x.id === pet.id)?.id ?? '', world.pet.stage, world.pet.stars, world.petAtk.seq, world.petAtk.kind, world.petAtk.el, Math.round(world.petAtk.x * 10), Math.round(world.petAtk.z * 10), Math.round(world.petAtk.dx * 100), Math.round(world.petAtk.dz * 100), Math.round(world.petAtk.a * 10), world.petAtk.tier] : null;   // (id / stage / stars: the partner draws the real pet)
  if (flat.length === 0 && !petRow && !sentAny) return;
  let key = flat.length * 7 + (petRow ? 1 : 0);
  for (let i = 0; i < flat.length; i++) key = (Math.imul(key, 31) + flat[i]) | 0;
  if (petRow) key = (Math.imul(key, 31) + (petRow[1] as number) * 3 + (petRow[2] as number) + (petRow[7] as number) * 977) | 0;
  if (key === lastKey && now % 1000 > 300) return;   // nothing moved (a heartbeat gets through about once a second)
  lastKey = key; sentAny = flat.length > 0 || !!petRow;
  minStats.sent++;
  io.send([MSG.MIN, io.rv(), flat, petRow ?? 0]);
}

/** MIN arrived (either direction). */
export function onMinions(d: unknown[]): void {
  const flat = d[2], pet = d[3];
  if (!Array.isArray(flat)) return;
  minStats.got++;
  const G = world.ghostMinions, n = Math.min(G.length, Math.floor(flat.length / STRIDE));
  for (let i = 0; i < G.length; i++) {
    const g = G[i];
    if (i >= n) { g.active = false; continue; }
    const o = i * STRIDE, v = (k: number): number => (isNum(flat[o + k]) ? (flat[o + k] as number) : 0);
    const kind = v(0) | 0;
    g.tx = v(1) / 10; g.tz = v(2) / 10;
    if (!g.active) { g.x = g.tx; g.z = g.tz; }
    g.active = true; g.kind = kind >= 0 && kind <= 3 ? kind : 0; g.facing = v(3) / 100; g.mv = v(4) / 100; g.swing = Math.max(0, Math.min(1, v(5) / 100));
    g.maxHp = 100; g.hp = Math.max(1, v(6)); g.shield = v(7) ? 1 : 0; g.spin = Math.max(0, v(8) / 100); g.rise = Math.max(0, v(9) / 100); g.life = 9; g.src = 1;
  }
  const gp = world.ghostPet;
  if (Array.isArray(pet) && pet[0] === 1 && isNum(pet[1]) && isNum(pet[2])) {
    gp.tx = pet[1] / 10; gp.tz = pet[2] / 10; gp.rar = isNum(pet[3]) ? pet[3] | 0 : 0;
    gp.id = typeof pet[4] === 'string' && pet[4].length <= 40 ? pet[4] : '';
    gp.stage = isNum(pet[5]) ? Math.max(1, Math.min(3, pet[5] | 0)) : 1; gp.stars = isNum(pet[6]) ? Math.max(0, Math.min(5, pet[6] | 0)) : 0;
    if (!gp.on) { gp.x = gp.tx; gp.z = gp.tz; gp.seq = -1; }
    gp.on = true;
    if (isNum(pet[7]) && isNum(pet[8])) {   // my partner's pet attacked: replay it (cosmetic only)
      const seq = pet[7] | 0;
      if (gp.seq >= 0 && seq !== gp.seq) petAttackFx(pet[8] | 0, nv(pet[9]), nv(pet[10]) / 10, nv(pet[11]) / 10, nv(pet[12]) / 100, nv(pet[13]) / 100, nv(pet[14]) / 10, nv(pet[15]));
      gp.seq = seq;   // (the first message after the pet appears only syncs the counter)
    }
  } else gp.on = false;
}

const nv = (v: unknown): number => (isNum(v) ? v : 0);
const fxPos = new Vector3();
/** Replays the partner's pet attack on his ghost pet with the same FX the owner sees (no damage, nothing simulated). Shockwaves / lightning /
 *  blink / frost nova / floating words of the pet arrive through the ordinary event forwarding; this adds the rest. */
function petAttackFx(kind: number, el: number, x: number, z: number, dx: number, dz: number, a: number, tier: number): void {
  const gp = world.ghostPet;
  gp.attackT = 1;
  if (kind >= 1 && kind <= 5 && kind !== 3) gp.facing = Math.atan2(x - gp.x, z - gp.z);
  switch (kind) {
    case 1: if (el) events.emit('petStrike', { pos: new Vector3(x, 0, z), el: el | 0, dx, dz, big: a > 0 }); break;   // melee bite / slam: the element hit
    case 3: events.emit('petBurst', { pos: new Vector3(x, 0, z), el: el | 0, r: Math.max(2, Math.min(9, a)), tier: tier | 0 }); break;   // Legendary / Mythic burst
    case 4: {   // Aether Leviathan tidal beam: sweeps ~1.1 rad across the target over 1.2 s from the pet
      const a0 = Math.atan2(x - gp.x, z - gp.z) - 0.55;
      gp.beamT = 1.2; gp.bx = gp.x; gp.bz = gp.z; gp.bdx = Math.sin(a0); gp.bdz = Math.cos(a0);
      break;
    }
    case 5: {   // Shadow Cat mark: a gem above the enemy
      let k = 0;
      for (let i = 0; i < 3; i++) { if (gp.marks[i].t <= 0) { k = i; break; } if (gp.marks[i].t < gp.marks[k].t) k = i; }
      gp.marks[k].x = x; gp.marks[k].z = z; gp.marks[k].t = 6;
      break;
    }
    case 7: events.emit('petStrike', { pos: new Vector3(x, 0, z), el: 3, dx: 0, dz: 1, big: true }); break;   // Shield Turtle shield: a light flash round the hero
    case 8: { const al = coopRoom.ally; fxPos.set(al ? al.pos.x : gp.x, 0, al ? al.pos.z : gp.z); events.emit('playerRevive', { pos: fxPos.clone(), source: 'PHOENIX' }); break; }   // Phoenix revive
    default: break;
  }
}

function step(dt: number): void {
  if (!(dt > 0)) return;
  const G = world.ghostMinions, k = Math.min(1, dt * 12);
  for (let i = 0; i < G.length; i++) {
    const g = G[i]; if (!g.active) continue;
    g.x += (g.tx - g.x) * k; g.z += (g.tz - g.z) * k;
    g.walk += dt * 9 * g.mv;
  }
  const gp = world.ghostPet;
  if (gp.attackT > 0) gp.attackT = Math.max(0, gp.attackT - dt * 3);
  if (gp.beamT > 0) {   // the Leviathan's beam keeps sweeping from the pet (same rotation as the owner's)
    gp.beamT -= dt;
    const ba = Math.atan2(gp.bdx, gp.bdz) + dt * 0.9;
    gp.bdx = Math.sin(ba); gp.bdz = Math.cos(ba); gp.bx = gp.x; gp.bz = gp.z;
  }
  const mk = gp.marks;
  for (let i = 0; i < 3; i++) {
    const m = mk[i]; if (m.t <= 0) continue;
    m.t -= dt;
    let bd = 9, bx = m.x, bz = m.z;   // a mark sticks to the enemy it was put on: the nearest one within 3 m
    const E = world.enemies;
    for (let j = 0; j < E.length; j++) { const e = E[j]; if (!e.active || e.state === 'DYING') continue; const d = (e.pos.x - m.x) ** 2 + (e.pos.z - m.z) ** 2; if (d < bd) { bd = d; bx = e.pos.x; bz = e.pos.z; } }
    m.x = bx; m.z = bz;
  }
  if (gp.on) {
    const dx = gp.tx - gp.x, dz = gp.tz - gp.z;
    if (dx * dx + dz * dz > 0.01) gp.facing = Math.atan2(dx, dz);
    gp.x += dx * k; gp.z += dz * k;
  }
}

export function minReset(): void {
  for (const g of world.ghostMinions) g.active = false;
  world.ghostPet.on = false; world.ghostPet.attackT = 0; world.ghostPet.beamT = 0; world.ghostPet.seq = -1; for (const m of world.ghostPet.marks) m.t = 0;
  lastSend = 0; sentAny = false; lastKey = 0;
}
