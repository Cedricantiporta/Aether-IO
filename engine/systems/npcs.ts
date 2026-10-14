// ============================================================================
// Town population: NPC patrols / idling, wandering animals and ambient speech bubbles.
// Pure state (preallocated, no per-frame allocation). render/Npcs.tsx draws it; the DOM bubble layer
// reads `bubbles` (screen positions are written by render/Npcs.tsx each frame).
// ============================================================================
import { world } from '../world';
import { NPCS, ANIMALS, GENERIC_BUBBLES } from '../townData';
import { useDialogue } from './dialogue';

export interface NpcState {
  x: number; z: number;
  /** desired facing; render smooths towards it */
  yaw: number;
  moving: boolean; talking: boolean; wp: number; wait: number;
  lastBubble: number;
}
export const npcs: NpcState[] = NPCS.map((d) => ({ x: d.home[0], z: d.home[1], yaw: 0, moving: false, talking: false, wp: 0, wait: Math.random() * 3, lastBubble: -1 }));

export interface AnimalState { x: number; z: number; yaw: number; moving: boolean; tx: number; tz: number; wait: number; hop: number }
export const animals: AnimalState[] = ANIMALS.map((a) => ({ x: a.x, z: a.z, yaw: Math.random() * 6.28, moving: false, tx: a.x, tz: a.z, wait: Math.random() * 2, hop: 0 }));

export const MAX_BUBBLES = 3;
export interface Bubble { active: boolean; npc: number; text: string; t: number; life: number; sx: number; sy: number; onScreen: boolean }
export const bubbles: Bubble[] = Array.from({ length: MAX_BUBBLES }, () => ({ active: false, npc: -1, text: '', t: 0, life: 3.2, sx: 0, sy: 0, onScreen: false }));
let bubbleCd = 6;

export const TALK_R = 3.8;
const BUBBLE_R = 14;

/** Reset positions when the village is (re)entered. */
export function resetNpcs(): void {
  for (let i = 0; i < npcs.length; i++) {
    const n = npcs[i], d = NPCS[i];
    n.x = d.home[0]; n.z = d.home[1]; n.moving = false; n.talking = false; n.wp = 0; n.wait = Math.random() * 3; n.lastBubble = -1;
    n.yaw = d.area === 'CASTLE' ? 0 : Math.atan2(-n.x, 2 - n.z); // idle town NPCs face the spawn plaza, castle NPCs the hall door
  }
  for (let i = 0; i < animals.length; i++) { const a = animals[i], d = ANIMALS[i]; a.x = d.x; a.z = d.z; a.tx = d.x; a.tz = d.z; a.wait = Math.random() * 2; a.moving = false; }
  for (const b of bubbles) b.active = false;
  bubbleCd = 5 + Math.random() * 5;
}

function inVisible(x: number, z: number, m: number): boolean {
  const v = world.view;
  return x >= v.minX + m && x <= v.maxX - m && z >= v.minZ + m && z <= v.maxZ - m;
}

/** Town NPCs live in the town, castle NPCs in the throne hall: only the current area simulates. */
const inArea = (i: number): boolean => (NPCS[i].area ?? 'TOWN') === world.village.area;

export function updateNpcs(dt: number): void {
  const p = world.player;
  const town = world.village.area === 'TOWN';
  const talkNpc = useDialogue.getState().open ? useDialogue.getState().npc : -1;

  // ---- NPCs
  for (let i = 0; i < npcs.length; i++) {
    const n = npcs[i], d = NPCS[i];
    if (!inArea(i)) { n.talking = false; continue; }
    n.talking = i === talkNpc;
    if (n.talking) { n.moving = false; n.yaw = Math.atan2(p.pos.x - n.x, p.pos.z - n.z); continue; }
    const path = d.patrol;
    if (!path || path.length < 2) { n.moving = false; continue; }
    if (n.wait > 0) { n.wait -= dt; n.moving = false; continue; }
    const tgt = path[n.wp];
    const dx = tgt[0] - n.x, dz = tgt[1] - n.z, dist = Math.sqrt(dx * dx + dz * dz);
    const step = (d.speed ?? 1.4) * dt;
    if (dist <= step + 0.05) {
      n.x = tgt[0]; n.z = tgt[1]; n.wp = (n.wp + 1) % path.length;
      n.wait = 1.2 + Math.random() * 4; n.moving = false;
    } else {
      n.x += (dx / dist) * step; n.z += (dz / dist) * step; n.moving = true; n.yaw = Math.atan2(dx, dz);
    }
  }

  // ---- animals (cheap random wander inside an ellipse around their home)
  for (let i = 0; i < animals.length && town; i++) {
    const a = animals[i], d = ANIMALS[i];
    a.hop += dt * (a.moving ? 9 : 3);
    if (a.wait > 0) { a.wait -= dt; a.moving = false; continue; }
    const dx = a.tx - a.x, dz = a.tz - a.z, dist = Math.sqrt(dx * dx + dz * dz), step = d.speed * dt;
    if (dist <= step + 0.05) {
      a.moving = false; a.wait = 0.8 + Math.random() * 3.5;
      const ang = Math.random() * 6.283, rr = Math.sqrt(Math.random());
      a.tx = d.x + Math.cos(ang) * d.rx * rr; a.tz = d.z + Math.sin(ang) * d.rz * rr;
    } else { a.x += (dx / dist) * step; a.z += (dz / dist) * step; a.moving = true; a.yaw = Math.atan2(dx, dz); }
  }

  // ---- ambient speech bubbles
  let active = 0;
  for (let i = 0; i < MAX_BUBBLES; i++) {
    const b = bubbles[i]; if (!b.active) continue;
    b.t += dt;
    const n = npcs[b.npc];
    if (b.t >= b.life || n.talking || (n.x - p.pos.x) ** 2 + (n.z - p.pos.z) ** 2 > 24 * 24) b.active = false; else active++;
  }
  bubbleCd -= dt;
  if (bubbleCd <= 0 && talkNpc < 0) {
    // random NPC near the player and on screen (start the scan at a random index to avoid favourites)
    const start = (Math.random() * npcs.length) | 0;
    let pick = -1;
    for (let k = 0; k < npcs.length && pick < 0; k++) {
      const i = (start + k) % npcs.length, n = npcs[i];
      if (!inArea(i) || n.talking || (n.x - p.pos.x) ** 2 + (n.z - p.pos.z) ** 2 > BUBBLE_R * BUBBLE_R) continue;
      if (world.view.on && !inVisible(n.x, n.z, 9)) continue;
      let busy = false;
      for (let j = 0; j < MAX_BUBBLES; j++) if (bubbles[j].active && bubbles[j].npc === i) busy = true;
      if (!busy) pick = i;
    }
    if (pick >= 0 && active < MAX_BUBBLES) {
      for (let j = 0; j < MAX_BUBBLES; j++) {
        const b = bubbles[j]; if (b.active) continue;
        const d = NPCS[pick], pool = d.bubbles;
        let ti = (Math.random() * (pool.length + 1)) | 0; // last slot = generic line
        if (ti === n_last(pick)) ti = (ti + 1) % (pool.length + 1);
        npcs[pick].lastBubble = ti;
        b.text = ti < pool.length ? pool[ti] : GENERIC_BUBBLES[(Math.random() * GENERIC_BUBBLES.length) | 0];
        b.npc = pick; b.t = 0; b.life = 3.2; b.active = true; b.onScreen = false;
        break;
      }
      bubbleCd = 15 + Math.random() * 25;
    } else bubbleCd = 2.5;
  }
}
const n_last = (i: number) => npcs[i].lastBubble;
