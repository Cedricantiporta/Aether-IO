// Co-op STEP 4: my summons (necromancer skeletons / golem / bowmen) and my pet as COSMETIC GHOSTS on the partner's screen. Both ways, ~8 Hz, one flat number array;
// the receiver keeps them in `world.ghostMinions` / `world.ghostPet` (nothing in the simulation reads these: monsters never target them, no damage) and eases them toward
// the newest position (render/Minions.tsx draws the ghost pool half transparent). No allocation per frame; one small array per message while something exists.
import { world } from '../engine/world';
import { useGameStore } from '../store';
import { MSG, isNum } from './protocol';
import { rate } from './coopRate';

export interface MinIO { send(m: unknown[]): void; rv(): number; connected(): boolean }
let io: MinIO | null = null;
export function minBind(h: MinIO): void { io = h; }
export const minStats = { sent: 0, got: 0 };

const STRIDE = 10;
const RAR = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
let lastSend = 0, sentAny = false, lastKey = 0;

/** every frame (host: hostTick, guest: guestTick) while both heroes are in the room */
export function minTick(now: number, dt: number): void {
  step(dt);
  if (!io || !io.connected() || now - lastSend < 125 * rate.mul) return;
  lastSend = now;
  const flat: number[] = [];
  const M = world.minions;
  for (let i = 0; i < M.length && flat.length < STRIDE * 16; i++) {
    const m = M[i];
    if (!m.active || m.src === 6) continue;
    flat.push(m.kind, Math.round(m.x * 10), Math.round(m.z * 10), Math.round(m.facing * 100), Math.round(m.mv * 100), Math.round(m.swing * 100), Math.round(Math.max(0, Math.min(1, m.maxHp > 0 ? m.hp / m.maxHp : 1)) * 100), m.shield > 0 ? 1 : 0, Math.round(m.spin * 100), Math.round(m.rise * 100));
  }
  const eq = useGameStore.getState().equipment as unknown as Record<string, { rarity?: string } | null | undefined>;
  const pet = eq?.pet, p = world.pet.pos;
  const petRow = pet ? [1, Math.round(p.x * 10), Math.round(p.z * 10), Math.max(0, RAR.indexOf(pet.rarity ?? ''))] : null;
  if (flat.length === 0 && !petRow && !sentAny) return;
  let key = flat.length * 7 + (petRow ? 1 : 0);
  for (let i = 0; i < flat.length; i++) key = (Math.imul(key, 31) + flat[i]) | 0;
  if (petRow) key = (Math.imul(key, 31) + petRow[1] * 3 + petRow[2]) | 0;
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
    if (!gp.on) { gp.x = gp.tx; gp.z = gp.tz; }
    gp.on = true;
  } else gp.on = false;
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
  if (gp.on) { gp.x += (gp.tx - gp.x) * k; gp.z += (gp.tz - gp.z) * k; }
}

export function minReset(): void {
  for (const g of world.ghostMinions) g.active = false;
  world.ghostPet.on = false; lastSend = 0; sentAny = false; lastKey = 0;
}
