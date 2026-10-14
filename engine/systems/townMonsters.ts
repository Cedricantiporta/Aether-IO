// Stationary monsters on the path to the hermit (town hub, outside the walls). Real enemies (killable with attacks and
// skills, drop loot / xp), but they never move and can't hurt the hero (damagePlayer is off outside runs).
// Each spot respawns its monster 60 s after it dies; nothing is spawned while the hero is inside the castle.
import { Vector3 } from 'three';
import { world } from '../world';
import { TOWN_MONSTERS } from '../townData';
import { spawnEnemy } from './enemies';

const RESPAWN = 60;
const slots = TOWN_MONSTERS.map(() => ({ id: -1, t: 0 }));
const v = new Vector3();

export function spawnTownMonsters(): void {
  world.director.wave = 3;   // their strength (town: no director)
  for (let i = 0; i < slots.length; i++) { slots[i].id = -1; slots[i].t = 0; spawnSlot(i); }
}
function spawnSlot(i: number): void {
  const m = TOWN_MONSTERS[i];
  const e = spawnEnemy(m.kind, v.set(m.x, 0, m.z));
  if (!e) return;
  e.speed = 0; e.facing = Math.atan2(-m.x, -m.z);
  slots[i].id = e.id;
}
/** True while any town monster is alive (the village loop then runs the enemy simulation). */
export function updateTownMonsters(dt: number): boolean {
  const town = world.village.area === 'TOWN';
  let any = false;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const e = s.id >= 0 ? world.enemies[s.id] : null;
    if (!town) { if (e && e.active) e.active = false; s.id = -1; s.t = 3; continue; }
    if (e && e.active) { e.speed = 0; const m = TOWN_MONSTERS[i]; if (e.state !== 'DYING') { e.pos.x += (m.x - e.pos.x) * Math.min(1, dt * 4); e.pos.z += (m.z - e.pos.z) * Math.min(1, dt * 4); } any = true; continue; }
    if (s.id >= 0) { s.id = -1; s.t = RESPAWN; }
    s.t -= dt;
    if (s.t <= 0) { world.director.wave = 3; spawnSlot(i); any = true; }
  }
  return any;
}
