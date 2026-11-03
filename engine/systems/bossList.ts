// Multi-boss HUD data (owner 2026-11-03 'with 2 bosses in Endless Waves I can only see one'): every live non-mini boss owns a STABLE slot of
// `world.bosses` (4 slots) for as long as it lives; the HUD (ui/hud/BossBar.tsx) draws one bar per active slot and CameraRig projects each boss's
// head for the floating bars. `world.boss` stays the room's main boss (the director's bossId) so every old consumer keeps working; the main boss's
// slot mirrors it, the other slots are filled here straight from the enemy (host AND co-op guest: the guest has the enemy list, no protocol growth).
// A dead boss's slot keeps `fade` seconds so its bar can fade out while the others stay. No allocation: fixed slots, one pass over the pool.
import { world } from '../world';
import type { Enemy, BossSlot } from '../types';
import { bossNameIn } from '../roomDefs';
import type { BossKind } from '../enemyDefs';
import { bossWarded } from './bossMech';
import { bossLayers } from './enemies';
import { formName, isKing, lk, KING_NAME, KING_TITLE } from './bossForms';

export const BOSS_FADE_T = 0.9;
/** A boss that gets a bar of its own: a real boss (not a mini-boss, not a Herald illusion), alive. */
export function isBossLike(e: Enemy): boolean { return e.active && e.boss && !e.mini && !e.decoy && e.state !== 'DYING'; }

function fill(s: BossSlot, e: Enemy, main: boolean): void {
  const hud = world.boss;
  if (main && hud.active) { s.name = hud.name; s.title = hud.title; s.layers = hud.layers; }
  else {
    const n = isKing(e) ? { name: KING_NAME, title: KING_TITLE } : bossNameIn(e.kind as BossKind, world.room.biome);
    s.name = formName(e, n.name); s.title = n.title; s.layers = isKing(e) ? 10 : Math.max(1, hud.layers | 0, bossLayers());
  }
  s.hp = e.hp; s.maxHp = Math.max(1, e.maxHp);
  s.shield = e.shield > 1 ? e.shield : 0;
  if (s.shield <= 0) s.shieldMax = 0; else if (s.shield > s.shieldMax) s.shieldMax = s.shield;
  s.ward = bossWarded(e) || (isKing(e) && (lk.tether || (main && world.boss.title.startsWith('INVULNERABLE'))));   // (the Lich King's soul tether: immune until it is cut / the jar breaks; the guest reads it from the bar title)
}

export function updateBossList(dt: number): void {
  const L = world.bosses, En = world.enemies, d = world.director;
  const main = d.bossId >= 0 ? d.bossId : -1;
  let live = 0;
  for (let k = 0; k < L.length; k++) {
    const s = L[k];
    if (s.id < 0) continue;
    const e = En[s.id];
    if (e.kind === s.kind && isBossLike(e)) { fill(s, e, s.id === main); s.active = true; live++; }
    else if (s.active) { s.active = false; s.fade = BOSS_FADE_T; s.hp = 0; }   // died / despawned: the bar fades out, the others stay
    else if (s.fade > 0) s.fade -= dt;
    else s.id = -1;
  }
  // new bosses (the room's main boss first): the first free slot, then it keeps it
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < En.length; i++) {
      const e = En[i];
      if (!isBossLike(e) || (pass === 0) !== (i === main)) continue;
      let have = false;
      for (let k = 0; k < L.length; k++) if (L[k].id === i && L[k].kind === e.kind && (L[k].active || L[k].fade > 0)) { have = true; break; }
      if (have) continue;
      for (let k = 0; k < L.length; k++) {
        const s = L[k];
        if (s.id >= 0 && (s.active || s.fade > 0)) continue;
        s.id = i; s.kind = e.kind; s.active = true; s.fade = 0; s.shieldMax = 0; fill(s, e, i === main); live++;
        break;
      }
    }
  }
  world.bossLive = live; world.bossMain = main;
}
