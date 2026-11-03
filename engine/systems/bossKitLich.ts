// THE LICH KING (owner 2026-11-03: a secret final boss; ~20% of Adventure runs meet him on the Undying Throne instead of the Void Herald).
// Same Undying-Lich body (BOSS_LICH; `bossForms.lk.id` marks which one is the king), 1.6x bigger, TWO FORMS like the Herald
// (bossForms.ts FORMS.BOSS_LICH: bone-white / dark violet -> huge green-teal Soulfire; two full 10-bar stacks; the flow lives in bossForm.ts).
// Called from bosses.updateBoss. Kit = 8 skills + the signature mechanic, one skill at a time, wind-ups 0.5-1.0 s with red telegraphs, aim locked
// at wind-up begin (enemies.ts AIM LOCK) and a slow turn cap (radius >= 2.5):
//   Bone Spiral   rotating bone bullets (3 arms, 5 in Soulfire, reversing)        Skull Seekers   3 (4) homing skulls, 7 -> 16 u/s
//   Soul Beam     CONTINUOUS rotating beam (two in Soulfire), slows + ticks harder the longer you stay (bossFx.spawnRamp)
//   Bone Cage     ring of bone slams closes first (the middle is safe), THEN the middle slams: step out through the spent ring
//   Raise the Dead  skeleton warriors + mages (capped)   Grave Cleave  3 (5) cone slams with knockdown   Soul Lances  lane, then flanking lanes
//   Bone Burst    close-range slam, only when you hug him
//   PHYLACTERY (signature, design doc 'Phylactery'): at ~88 / 58 / 28% of each form's HP he raises a soul jar (two in Soulfire) bound to him by a
//   tether and is IMMUNE while it holds. Smash the jar (stationary, soft) OR cut the cord by running through it (a 7% soul backlash, he is open for
//   5.5 s, then the jar binds him again). Skeleton guards protect the jar. A broken jar staggers him.
// No allocation in the per-frame paths (scratch vectors, module state `K`).
import { Vector3 } from 'three';
import { world } from '../world';
import { events } from '../events';
import type { Enemy } from '../types';
import { BOSS_SKILL_MUL, ENEMY_DEFS } from '../enemyDefs';
import { damagePlayer, KB } from './combat';
import { enter, spawnEnemy, fireEnemyProjectile } from './enemies';
import { BT, spawnRamp, stat, clampToVoid, endBossFx } from './bossFx';
import { S, stand, keepRange, circle, lane, cone, fan, pwr, spawnAdd, poofAdd, clampArena, notify, voidStage } from './bosses2';
import { bf, lk, isKing, kingHooks, initBossForm, KING_TITLE } from './bossForms';
import { SEEKER } from './bossPhaseState';
import { spawnRune } from './voidFx';
import { proxBegin } from './bossMech';

const tv = new Vector3(), dirV = new Vector3();
const RED = 0xff4b4b, GREEN = 0x3dffb4, BONE = 0xe8e0c8, PURPLE = 0xa07bff;
const hz = (e: Enemy, m: number): number => (pwr(e) * m) / BOSS_SKILL_MUL;
const f2 = (e: Enemy): boolean => bf.form[e.id] === 1;
const BODY_MUL = 1.6;   // the king's body vs the crypt Lich

/** Kit state (read by render/LichKingFx.tsx). */
export const K = {
  jars: [-1, -1] as number[], tether: false, cut: 0, step: 0, aim: 0, n: 0, burstCd: 6, jarT: 0, backlash: 0, cages: 0,
  stat: { jars: 0, cuts: 0, smashed: 0, raised: 0 },
};
const TH = [0.88, 0.58, 0.28];   // HP fractions (of the current form's stack) at which the phylactery rises
const JAR_KILL_S = 5, FIGHT_REF_S = 90, CUT_OPEN_T = 5.5, BACKLASH_PCT = 0.07;

interface Atk {
  name: string;
  wind(e: Enemy): number; act(e: Enemy): number; rec(e: Enemy): number;
  begin(e: Enemy, ux: number, uz: number, dist: number): void;
  fire(e: Enemy, ux: number, uz: number): void;
  tick?(e: Enemy, dt: number): void;
  done?(e: Enemy): boolean;
  end?(e: Enemy): void;
}
const aimAt = (e: Enemy): number => Math.atan2(world.player.pos.x - e.pos.x, world.player.pos.z - e.pos.z);
const liveJar = (id: number): Enemy | null => { if (id < 0) return null; const j = world.enemies[id]; return j.active && j.kind === 'BOSS_CRYSTAL' && j.state !== 'DYING' ? j : null; };
const addsAlive = (): number => { let n = 0; for (const a of world.enemies) if (a.active && a.state !== 'DYING' && (a.kind === 'SKELETON_WARRIOR' || a.kind === 'SKELETON_MAGE') && a.bossAdd) n++; return n; };

const L_SPIRAL = 0, L_SEEK = 1, L_BEAM = 2, L_CAGE = 3, L_RAISE = 4, L_CLEAVE = 5, L_LANCES = 6, L_BURST = 7, L_JAR = 8;
const LIST: Atk[] = [
  { // Bone Spiral: a rotating spiral of bone bullets. Slip through the gaps; Soulfire adds arms and reverses halfway.
    name: 'Bone Spiral!', wind: () => 0.7, act: (e) => (f2(e) ? 3.6 : 3.0), rec: () => 0.9,
    begin(e) { circle(e.pos.x, e.pos.z, 5, 0.7, BT.VISUAL, 0, PURPLE); e.angle = Math.random() * 6.283; e.patternT = 0; },
    fire() { /* bullets in tick */ },
    tick(e, dt) {
      stand(e);
      const arms = f2(e) ? 5 : 3, dir = f2(e) && e.stateT > 1.8 ? -1 : 1;
      e.angle += 1.0 * dt * dir;
      if (e.stateT >= e.patternT * 0.22) {
        e.patternT++;
        for (let k = 0; k < arms; k++) {
          const a = e.angle + (k * 6.2832) / arms;
          dirV.set(Math.sin(a), 0, Math.cos(a));
          fireEnemyProjectile(e.pos, dirV, 'BOSS_ORB', 9.5, pwr(e) * 0.5, { life: 4.8, radius: 0.75, dark: true });
        }
      }
    },
  },
  { // Skull Seekers: homing skulls that speed up as they live. Sidestep late or dash through.
    name: 'Skull Seekers!', wind: () => 0.7, act: () => 0.5, rec: () => 0.8,
    begin(e) { circle(e.pos.x, e.pos.z, 4.5, 0.7, BT.VISUAL, 0, PURPLE); },
    fire(e, ux, uz) {
      const n = f2(e) ? 4 : 3, base = Math.atan2(ux, uz);
      for (let i = 0; i < n; i++) {
        const a = base + fan(i, 0.75);
        dirV.set(Math.sin(a), 0, Math.cos(a));
        fireEnemyProjectile(e.pos, dirV, 'BOSS_ORB', SEEKER.v0, pwr(e) * 0.95, { homing: SEEKER.turn, accel: SEEKER.acc, vmax: SEEKER.vmax, life: 6, radius: 0.95, dark: true });
      }
      events.emit('shockwave', { pos: e.pos.clone(), radius: 5, color: PURPLE });
    },
  },
  { // Soul Beam (CONTINUOUS): a thin line telegraph, then a rotating beam sweeps the arena. Staying in it slows and burns harder every tick. Dash across.
    name: 'Soul Beam!', wind: () => 1.0, act: () => 4.2, rec: () => 0.9,
    begin(e) {
      const side = (K.n++ & 1) ? 1 : -1, base = aimAt(e) + side * 0.9;
      for (let k = 0; k < (f2(e) ? 2 : 1); k++) spawnRamp(true, e.pos.x, e.pos.z, 3.0, 1.0, 4.2, 0.022, GREEN, base + k * Math.PI, -side * 0.6, 44);
    },
    fire() { /* live from here */ },
    done: (e) => e.stateT >= 4.0,
  },
  { // Bone Cage: bone slams ring the spot you stand on (the middle is SAFE); the ring resolves first, then the middle slams: step out through the spent ring.
    name: 'Bone Cage!', wind: () => 0.5, act: () => 1.55, rec: () => 1.0,
    begin(e) {
      const p = world.player;
      tv.set(p.pos.x + p.vel.x * 0.25, 0, p.pos.z + p.vel.z * 0.25); clampArena(tv, 11); clampToVoid(tv, 11);
      K.aim = tv.x; K.n++; e.angle = tv.z;   // (cage centre kept in K.aim / e.angle)
      const n = f2(e) ? 8 : 7, a0 = Math.random() * 6.283;
      for (let i = 0; i < n; i++) { const a = a0 + (i / n) * 6.2832; circle(tv.x + Math.sin(a) * 7, tv.z + Math.cos(a) * 7, 2.8, 1.1, BT.ECHO_SLAM, hz(e, 1.15), RED); }
      circle(tv.x, tv.z, 4.2, 0.4, BT.VISUAL, 0, BONE);
    },
    fire(e) { circle(K.aim, e.angle, 4.3, 1.45, BT.ECHO_SLAM, hz(e, 2.4), RED); events.emit('trick', { pos: tv.set(K.aim, 0, e.angle).clone(), kind: 'RIFT', radius: 6 }); },
  },
  { // Raise the Dead: skeleton warriors and mages claw out of the floor round him (capped). Kill them or kite them.
    name: 'Raise the Dead!', wind: () => 0.9, act: () => 0.4, rec: () => 1.1,
    begin(e) { circle(e.pos.x, e.pos.z, e.radius + 5, 0.9, BT.VISUAL, 0, BONE); spawnRune(e.pos.x, e.pos.z, 5, 1.2); },
    fire(e) {
      if (addsAlive() >= 7) return;
      const w = f2(e) ? 4 : 3, m = f2(e) ? 2 : 1, a0 = Math.random() * 6.283;
      for (let i = 0; i < w + m; i++) {
        const a = a0 + (i / (w + m)) * 6.2832, r = e.radius + 3 + (i & 1) * 2;
        const x = e.pos.x + Math.sin(a) * r, z = e.pos.z + Math.cos(a) * r;
        if (spawnAdd(i < w ? 'SKELETON_WARRIOR' : 'SKELETON_MAGE', x, z, i < w ? 0.9 : 0.8, 1.15, 12)) K.stat.raised++;
      }
      events.emit('shockwave', { pos: e.pos.clone(), radius: 9, color: BONE });
      notify('The dead rise at the Lich King\'s call!', '#cfeedd');
    },
  },
  { // Grave Cleave: a fan of cone slams (knockdown). Walk into a gap between the cones.
    name: 'Grave Cleave!', wind: () => 0.85, act: () => 0.6, rec: () => 0.9,
    begin(e, ux, uz) {
      K.aim = Math.atan2(ux, uz);
      const n = f2(e) ? 5 : 3;
      for (let i = 0; i < n; i++) { const a = K.aim + fan(i, 0.95); cone(e, Math.sin(a), Math.cos(a), 17, 0.36, 0.85, BT.VCONE, hz(e, 1.4), RED); }
    },
    fire() { /* the cones resolve themselves */ },
  },
  { // Soul Lances: a lane at you, then (0.7 s later) flanking lanes: the safe spot is BETWEEN them.
    name: 'Soul Lances!', wind: () => 0.8, act: () => 1.0, rec: () => 0.9,
    begin(e, ux, uz) {
      K.aim = Math.atan2(ux, uz);
      const z = lane(e, Math.sin(K.aim), Math.cos(K.aim), 40, 3.4, 0.9, BT.VLANE, hz(e, 1.15), RED); if (z) z.aux = 0;
    },
    fire(e) {
      const offs = f2(e) ? [-0.95, -0.4, 0.4, 0.95] : [-0.55, 0.55];
      for (const o of offs) { const a = K.aim + o; const z = lane(e, Math.sin(a), Math.cos(a), 40, 3.4, 0.75, BT.VLANE, hz(e, 1.25), RED); if (z) z.aux = 1; }
    },
  },
  { // Bone Burst: only when you hug him: a heavy slam round his feet.
    name: 'Bone Burst!', wind: () => 0.75, act: () => 0.3, rec: () => 0.9,
    begin(e) { circle(e.pos.x, e.pos.z, e.radius + 6.5, 0.75, BT.ECHO_SLAM, hz(e, 1.7), RED); },
    fire(e) { events.emit('shockwave', { pos: e.pos.clone(), radius: e.radius + 9, color: BONE }); },
  },
  { // (signature) The Phylactery rises: soul jar(s) bound to him by a tether; he is immune while it holds.
    name: 'The Phylactery!', wind: () => 1.2, act: () => 0.6, rec: () => 0.7,
    begin(e) { circle(e.pos.x, e.pos.z, e.radius + 7, 1.2, BT.VISUAL, 0, GREEN); spawnRune(e.pos.x, e.pos.z, 7, 1.6); events.emit('floatText', { pos: e.pos, text: 'THE PHYLACTERY RISES!', color: GREEN, scale: 1.3, dy: e.radius * 2 + 3 }); },
    fire(e) { raiseJars(e); },
  },
];
const F1 = [L_CLEAVE, L_SEEK, L_LANCES, L_SPIRAL, L_CAGE, L_RAISE, L_BEAM, L_SEEK, L_CLEAVE, L_LANCES, L_CAGE, L_SPIRAL];
const F2 = [L_BEAM, L_CLEAVE, L_CAGE, L_SEEK, L_LANCES, L_SPIRAL, L_RAISE, L_CLEAVE, L_CAGE, L_BEAM, L_LANCES, L_SEEK];
const TETHERED = [L_SEEK, L_RAISE, L_CLEAVE, L_SPIRAL, L_SEEK, L_LANCES];   // while bound: lighter skills, the guards and bullets keep you busy

// ---------------------------------------------------------------- phylactery ---
function raiseJars(e: Enemy): void {
  const n = f2(e) ? 2 : 1, a0 = Math.random() * 6.283;
  K.jars[0] = K.jars[1] = -1;
  for (let i = 0; i < n; i++) {
    const a = a0 + i * 3.1416 + (i ? 0.4 : 0), r = 12 + Math.random() * 3;
    tv.set(e.pos.x + Math.sin(a) * r, 0, e.pos.z + Math.cos(a) * r); clampArena(tv, 4); clampToVoid(tv, 3);
    const j = spawnEnemy('BOSS_CRYSTAL', tv);
    if (!j) continue;
    j.armor = 0; j.shield = 0;
    j.maxHp = Math.max(1, Math.round(e.maxHp * (JAR_KILL_S / FIGHT_REF_S) * (n > 1 ? 0.7 : 1))); j.hp = j.maxHp;   // (a hero who needs 90 s for the whole stack breaks a jar in ~5 s)
    K.jars[i] = j.id; K.stat.jars++;
  }
  K.tether = K.jars[0] >= 0 || K.jars[1] >= 0; K.cut = 0; lk.tether = K.tether;
  if (K.tether) {
    world.boss.title = 'INVULNERABLE - break the soul tether!';
    events.emit('shake', { amount: 0.5 });
    notify('The Lich King is bound to his phylactery - cut the tether or smash the jar!', '#7dffc4');
    // two skeleton guards beside the jar
    for (let i = 0; i < 2; i++) { const j = liveJar(K.jars[0]); if (j) spawnAdd('SKELETON_WARRIOR', j.pos.x + (i ? 2.2 : -2.2), j.pos.z + 1.5, 0.9, 1.1, 12); }
  }
  e.attackCd = 1.5;
}
/** The cord is cut / the jar breaks: back to the normal fight. `broken` = every jar is gone (he staggers). */
function unbind(e: Enemy, broken: boolean): void {
  K.tether = false; lk.tether = false; world.boss.title = KING_TITLE;
  if (broken) {
    K.cut = 0; K.jars[0] = K.jars[1] = -1;
    hooks_stagger(e);
    e.staggerT = Math.max(e.staggerT, 2.4);
    events.emit('floatText', { pos: e.pos, text: 'THE PHYLACTERY SHATTERS!', color: GREEN, scale: 1.4, dy: e.radius * 2 + 3 });
    events.emit('shockwave', { pos: e.pos.clone(), radius: 14, color: GREEN });
    events.emit('shake', { amount: 0.7 });
    K.stat.smashed++; stat('JarSmashed');
  }
}
function hooks_stagger(e: Enemy): void { if (e.state === 'WINDUP' || e.state === 'ATTACK') { const a = LIST[e.pattern]; if (a && a.end) a.end(e); } if (e.state !== 'SPAWN' && e.state !== 'DYING') { enter(e, 'CHASE'); e.attackCd = 1.4; } stand(e); }

/** Per-frame jar / tether upkeep (host only): jar deaths, the hero cutting the cord, the cord binding him again, new threshold. */
function tickTether(e: Enemy, dt: number): void {
  let live = 0, lj: Enemy | null = null;
  for (let i = 0; i < 2; i++) { const j = liveJar(K.jars[i]); if (j) { live++; lj = j; } else K.jars[i] = -1; }
  if (K.tether || K.cut > 0) {
    if (live === 0) { unbind(e, true); return; }
    const p = world.player;
    if (K.tether && p.alive) {
      for (let i = 0; i < 2; i++) {
        const j = liveJar(K.jars[i]); if (!j) continue;
        const sx = j.pos.x - e.pos.x, sz = j.pos.z - e.pos.z, len2 = sx * sx + sz * sz || 1;
        let t = ((p.pos.x - e.pos.x) * sx + (p.pos.z - e.pos.z) * sz) / len2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = p.pos.x - (e.pos.x + sx * t), dz = p.pos.z - (e.pos.z + sz * t);
        if (dx * dx + dz * dz < 1.1 * 1.1 && t > 0.1 && t < 0.92) {   // ran through the cord
          K.tether = false; lk.tether = false; K.cut = CUT_OPEN_T; K.stat.cuts++; stat('TetherCut');
          damagePlayer(1, { pct: BACKLASH_PCT, kind: 'MAGIC', pos: j.pos, noDotMul: true });
          events.emit('floatText', { pos: tv.set(e.pos.x + sx * t, 2, e.pos.z + sz * t).clone(), text: 'TETHER SNAPPED!', color: GREEN, scale: 1.2, dy: 1 });
          events.emit('shockwave', { pos: e.pos.clone(), radius: 8, color: GREEN });
          break;
        }
      }
    } else if (K.cut > 0) {
      K.cut -= dt;
      if (K.cut <= 0 && live > 0 && e.state !== 'DYING') {   // the jar binds him again
        K.cut = 0; K.tether = true; lk.tether = true;
        events.emit('floatText', { pos: e.pos, text: 'BOUND AGAIN!', color: GREEN, scale: 1.1, dy: e.radius * 2 + 3 });
      }
    }
  }
  void lj;
}

// ---------------------------------------------------------------- entry points ---
/** Right after director.spawnBossAt built the king (kind BOSS_LICH): size, state, the Throne arena. Call BEFORE applyFormHp. */
export function initKing(e: Enemy): void {
  lk.id = e.id; lk.tether = false;
  S.id = e.id; S.phase = 0; S.cycle = 0;
  e.radius *= BODY_MUL; e.scale *= BODY_MUL;
  e.maxHp = Math.round(e.maxHp * ENEMY_DEFS.BOSS_VOID.hp / ENEMY_DEFS.BOSS_LICH.hp); e.hp = e.maxHp;   // final-boss HP: the Herald's (bossBalance totals + the form split in applyFormHp follow)
  initBossForm(e);   // form 1: the smaller body (bossForms.ts records the base size r0 / s0 first, so scale it before)
  e.pattern = 0; e.attackCd = 3.0; e.armor = Math.round(e.armor * 1.25);
  K.jars[0] = K.jars[1] = -1; K.tether = false; K.cut = 0; K.step = 0; K.n = 0; K.burstCd = 6; K.stat.jars = K.stat.cuts = K.stat.smashed = K.stat.raised = 0;
  voidStage(e);   // the Throne is the Herald's ring: a fixed safe circle, the dark void outside
}
/** The form swap (bossForm.swapForm) and the form-1 death beat (startBeat): jars and guards vanish, the kit restarts. */
export function kingReset(e: Enemy): void {
  for (let i = 0; i < 2; i++) { const j = liveJar(K.jars[i]); if (j) poofAdd(j); K.jars[i] = -1; }
  for (const a of world.enemies) if (a.active && a.state !== 'DYING' && a.bossAdd && (a.kind === 'SKELETON_WARRIOR' || a.kind === 'SKELETON_MAGE')) poofAdd(a);
  K.tether = false; K.cut = 0; K.step = 0; K.burstCd = 6; lk.tether = false;
  if (isKing(e)) world.boss.title = KING_TITLE;
}
/** The king died for good (enemies.onEnemyDeath). */
export function kingDied(e: Enemy): void {
  kingReset(e); endBossFx();
  S.id = -1; S.vform = 0; S.vformT = 0;
  lk.tether = false;
}

const gap = (e: Enemy): number => Math.max(0.95, (f2(e) ? 1.25 : 1.5) * (1 - 0.12 * e.phase));

function beginK(e: Enemy, id: number, ux: number, uz: number, dist: number): void {
  const a = LIST[id];
  e.pattern = id; e.patternT = 0;
  proxBegin(e);
  enter(e, 'WINDUP');
  const b = world.boss; b.ability = a.name; b.abilityT = 2.4;
  stat(a.name);
  events.emit('trick', { pos: e.pos.clone(), kind: 'BOSS_CAST', radius: 6 });
  a.begin(e, ux, uz, dist);
}

/** Every frame (host, game.ts) whatever the king is doing - also in his free-hit 'winded' window, when his AI is not called: jar deaths, the cord being cut, the relink. */
export function tickKingFrame(dt: number): void {
  if (lk.id < 0) return;
  const e = world.enemies[lk.id];
  if (!e.active || e.state === 'DYING' || !isKing(e)) return;
  if (e.state !== 'SPAWN' && bf.beat[e.id] <= 0) tickTether(e, dt);
}

/** One frame of the king's AI (e.state is not SPAWN). */
export function updateKing(e: Enemy, dt: number, dist: number): void {
  if (S.id !== e.id) S.id = e.id;
  const inv = 1 / Math.max(dist, 0.001);
  const ux = (world.player.pos.x - e.pos.x) * inv, uz = (world.player.pos.z - e.pos.z) * inv;
  K.burstCd -= dt;
  if (e.state !== 'CHASE') {
    const a = LIST[e.pattern];
    switch (e.state) {
      case 'WINDUP': stand(e); if (e.stateT >= a.wind(e)) { enter(e, 'ATTACK'); a.fire(e, ux, uz); } return;
      case 'ATTACK': if (a.tick) a.tick(e, dt); else stand(e); if (a.done ? a.done(e) : e.stateT >= a.act(e)) { if (a.end) a.end(e); enter(e, 'RECOVER'); } return;
      case 'RECOVER': stand(e); if (e.stateT >= a.rec(e)) { enter(e, 'CHASE'); e.attackCd = gap(e) * (K.tether ? 1.35 : 1); } return;
      default: return;
    }
  }
  keepRange(e, ux, uz, dist, 10, 17, e.speed * (1 + 0.12 * e.phase), 0.45);
  { const pl = world.player; if (pl.downT > 0 || pl.knockImmuneT > 0 || pl.stunT > 0) e.attackCd = Math.max(e.attackCd, pl.downT > 0 ? 1.0 : 0.5); }   // fairness: no new skill on a hero who is down / just got up
  if (e.attackCd > 0) return;
  if (!K.tether && K.cut <= 0 && K.step < TH.length && e.hp / Math.max(1, e.maxHp) <= TH[K.step]) { K.step++; beginK(e, L_JAR, ux, uz, dist); return; }
  if (dist < 8 && K.burstCd <= 0) { K.burstCd = 7; beginK(e, L_BURST, ux, uz, dist); return; }
  if (K.tether) { beginK(e, TETHERED[S.cycle++ % TETHERED.length], ux, uz, dist); return; }
  const order = f2(e) ? F2 : F1;
  beginK(e, order[S.cycle++ % order.length], ux, uz, dist);
}

// A stagger interrupts the running skill; incoming damage is zero while the tether holds.
kingHooks.stagger = (e: Enemy): void => hooks_stagger(e);
kingHooks.mul = (e: Enemy): number => (lk.tether && isKing(e) ? 0 : 1);

if (typeof window !== 'undefined' && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {   // QA: `__lichKing` = kit state + helpers (headless tests)
  (window as unknown as Record<string, unknown>).__lichKing = {
    K, lk,
    cast: (id: number): string => {
      const e = world.enemies[lk.id]; if (!e || !e.active || !isKing(e)) return 'none';
      if (e.state !== 'CHASE') return 'busy';
      const dx = world.player.pos.x - e.pos.x, dz = world.player.pos.z - e.pos.z, d = Math.max(0.001, Math.hypot(dx, dz));
      beginK(e, id, dx / d, dz / d, d);
      return LIST[id].name;
    },
    names: LIST.map((a) => a.name),
  };
}
