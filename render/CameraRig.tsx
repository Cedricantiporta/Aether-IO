import { bp } from '../engine/systems/bossPhaseState';
import { useRef } from 'react';
import { liftAt } from './lift';
import { currentTarget } from '../engine/systems/combat';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3 } from 'three';
import { world, TOWN_CENTER, CAM_PITCH0 } from '../engine/world';
import { camRel } from '../engine/camera';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { damp, clamp } from './util';
import { useUiStore } from '../ui/uiStore';
import { feel } from '../engine/game';
import { bossCamZoom, ENEMY_DEFS } from '../engine/enemyDefs';
import { device } from '../engine/device';

/** World height just above a boss's head: big bosses (Hydra, Colossus...) are sized by radius, not scale. */
function bossTop(e: { scale: number; radius: number }): number { return 2 + Math.max(e.scale * 2.1, e.radius * 2.6); }
import { clickReq, selectAt, clickMoveTo, pickEnemyAt, clickMark } from '../engine/systems/target';
import { walkTo, walkStamp } from '../engine/systems/village';

let curState = '';
/** An open room portal within reach of a ground point (click / hover target). */
const portalAt = (x: number, z: number): { x: number; z: number } | null => {
  for (const po of world.room.portals) if (po.active && (po.x - x) ** 2 + (po.z - z) ** 2 < 5 * 5) return po;   // (wide: a click on the tall arch lands on the ground behind it)
  return null;
};
const mark = (x: number, z: number, attack: boolean): void => { clickMark.x = x; clickMark.z = z; clickMark.attack = attack; clickMark.t = performance.now(); };

const CAM_DIST0 = Math.hypot(32, 22);
/** Closer camera (owner: Echoes-of-Wisdom framing, hero ~1.5x bigger); interiors (dist < 1) are scaled less so they do not get too tight. */
const CAM_CLOSE = 0.55, CAM_CLOSE_IN = 0.8;   // view distance hero->camera (kept: the hero stays the same size on screen)
const LOOK_AHEAD = 2.8, LOOK_Y = 1.15;   // look-at: a bit ahead of the hero (hero sits below centre) and at chest/face height
/** Diorama camera: FOV 26 instead of 40, pushed back so the hero area keeps the same size on screen. */
const FOV0 = 40, FOV_TELE = 26, TELE = Math.tan((FOV0 / 2) * Math.PI / 180) / Math.tan((FOV_TELE / 2) * Math.PI / 180);
const _rel = { x: 0, z: 0 };
const _tgt = new Vector3(), _pos = new Vector3(), _v = new Vector3(), _d = new Vector3();

/** Cinematic (non-interactive) states: title screen and game over. The village itself uses the follow camera. */
export function isLobbyStatus(s: GameStatus) {
  return s === GameStatus.HERO_SELECT || s === GameStatus.GAME_OVER || (s === GameStatus.MENU && !useUiStore.getState().titleDone);
}

/** Free-orbit follow camera (MMORPG style: yaw / pitch / zoom from engine/input), screen shake, ground-plane aim, and a cinematic lobby orbit. */
export function CameraRig() {
  const cam = useThree((s) => s.camera) as PerspectiveCamera;
  const st = useRef({ csBlend: 0, yaw: 0, pitch: CAM_PITCH0, dist: 1, tgt: new Vector3(0, 1, 0), pos: new Vector3(0, 30, 22), init: false, zoom: 1, uz: 1, t: 0, look: new Vector3(), lobbyBlend: 0, lift: 0, tele: TELE, bossK: 1 });

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    const status = useGameStore.getState().status;
    const lobby = isLobbyStatus(status);
    s.t += dt;
    s.lobbyBlend = damp(s.lobbyBlend, lobby ? 1 : 0, 2.5, dt);
    const p = world.player;

    // ---- play camera target
    let lx = 0, lz = 0;
    // camera lead toward the mouse aim point: opt-in (Settings > Camera follows mouse); touch aims never move it
    if (!lobby && useGameStore.getState().settings?.cameraLead) {
      const ax = p.aim.x - p.pos.x, az = p.aim.z - p.pos.z;
      const d = Math.hypot(ax, az);
      const k = d > 0.001 ? Math.min(d, 14) / d * 0.22 : 0;
      lx = ax * k; lz = az * k;
    }
    const setts = useGameStore.getState().settings;
    s.zoom = damp(s.zoom, world.camera.zoom || 1, 2.5, dt);   // (cinematic zoom only: abilities / bosses; the player has no zoom)
    s.lift = damp(s.lift, liftAt(p.pos.x, p.pos.z), 6, dt);
    _tgt.set(p.pos.x + lx, LOOK_Y + s.lift, p.pos.z + lz);
    // free orbit camera: yaw / pitch / orbit around the hero
    const C = world.camera;
    const free = !!setts?.freeCamera;
    void free;   // (owner) the player may always tilt the camera up / down (drag); V resets yaw, tilt and zoom
    if (status === GameStatus.MENU && world.village.area !== 'TOWN' && C.dist > 0.85) C.dist = 0.85;   // indoors (castle hall, crystal cave): keep the camera close so the walls do not block the view
    if (Math.abs(C.yaw - s.yaw) > 2) s.yaw = C.yaw;   // big jumps (spawn facing the gate) snap instead of spinning
    s.yaw = damp(s.yaw, C.yaw, 14, dt); s.pitch = damp(s.pitch, C.pitch, 14, dt); s.dist = damp(s.dist, C.dist, 10, dt);
    s.tele = damp(s.tele, free || lobby || useUiStore.getState().charSelect ? 1 : TELE, 3, dt);   // long lens: farther away + narrower FOV (same framing, flatter look)
    _tgt.x -= Math.sin(s.yaw) * LOOK_AHEAD; _tgt.z -= Math.cos(s.yaw) * LOOK_AHEAD;   // away from the camera = north when yaw 0
    s.uz = damp(s.uz, C.uz ?? 1, 10, dt);
    // the giant guardians (Colossus-sized, enemyDefs.bossCamZoom): pull the camera back during their fight so the boss, its telegraphs and the hero all fit
    const bId = world.director.bossId, bE = bId >= 0 ? world.enemies[bId] : null;
    s.bossK = damp(s.bossK, world.room.active && world.room.plan.type === 'HALL' ? 1.12 : bE && bE.active && bE.state !== 'DYING' && !bE.mini && status === GameStatus.PLAYING ? bossCamZoom(bE.kind, bE.radius / ENEMY_DEFS[bE.kind].radius) : 1, 1.5, dt);   // every giant guardian: eased in on spawn, out on death; the live body size drives the zoom (form 2 is bigger)
    const R = CAM_DIST0 * s.bossK * s.zoom * s.uz * s.dist * s.tele * (CAM_CLOSE + (CAM_CLOSE_IN - CAM_CLOSE) * clamp((1 - s.dist) / 0.2, 0, 1)), hr = Math.cos(s.pitch) * R;
    _pos.set(_tgt.x + Math.sin(s.yaw) * hr, Math.sin(s.pitch) * R, _tgt.z + Math.cos(s.yaw) * hr);

    // ---- lobby orbit: sweep around the hero/town
    if (s.lobbyBlend > 0.001) {
      const ang = Math.sin(s.t * 0.11) * 0.75 + 0.15;
      const cx = 0, cz = -8 + TOWN_CENTER.z * 0.0;
      const r = 20;
      _v.set(cx + Math.sin(ang) * r, 5.2 + Math.sin(s.t * 0.17) * 0.8, cz + Math.cos(ang) * r + 6);
      const lt = _d.set(-4, 2.4, -8);
      _pos.lerp(_v, s.lobbyBlend);
      _tgt.lerp(lt, s.lobbyBlend);
    }

    // ---- class selection: close-up of the hero standing in the plaza, facing the camera
    const cs = useUiStore.getState().charSelect;
    s.csBlend = damp(s.csBlend, cs ? 1 : 0, 3, dt);
    if (s.csBlend > 0.001) {
      if (cs) p.facing = 0;
      _v.set(p.pos.x - 0.3, 1.8, p.pos.z + 4.6);
      _d.set(p.pos.x - 0.3, 1.05, p.pos.z);
      _pos.lerp(_v, s.csBlend); _tgt.lerp(_d, s.csBlend);
    }

    // a big jump of the hero (room start in a halls layout, teleports) snaps the camera: gliding 50 m across the dark void between chambers read as a black frame
    if (!s.init || (_tgt.x - s.tgt.x) ** 2 + (_tgt.z - s.tgt.z) ** 2 > 22 * 22) { s.pos.copy(_pos); s.tgt.copy(_tgt); s.init = true; }
    const kf = s.csBlend > 0.05 ? 5 : lobby ? 2.2 : 7;
    s.pos.x = damp(s.pos.x, _pos.x, kf, dt); s.pos.y = damp(s.pos.y, _pos.y, kf, dt); s.pos.z = damp(s.pos.z, _pos.z, kf, dt);
    s.tgt.x = damp(s.tgt.x, _tgt.x, kf, dt); s.tgt.y = damp(s.tgt.y, _tgt.y, kf, dt); s.tgt.z = damp(s.tgt.z, _tgt.z, kf, dt);

    // ---- shake
    let sx = 0, sy = 0, roll = 0;
    const tr = world.camera.trauma;
    if (tr > 0.001) {
      const enabled = useGameStore.getState().settings?.screenShake !== false;
      if (enabled && status !== GameStatus.PAUSED) {
        const sh = tr * tr, t = s.t;
        sx = (Math.sin(t * 53.1) + Math.sin(t * 31.7 + 1.3) * 0.6) * 0.55 * sh * 2.2;
        sy = (Math.sin(t * 47.3 + 2.1) + Math.sin(t * 27.9) * 0.6) * 0.45 * sh * 2.2;
        roll = Math.sin(t * 39.1) * 0.012 * sh * 3;
      }
    }
    // ---- FOV punch (big explosions / boss slams): quick zoom-in that eases back
    const fk = feel.fov, fovT = (FOV0 + (FOV_TELE - FOV0) * (TELE - s.tele) / (TELE - 1)) * (1 - fk * fk * 0.11);
    if (Math.abs(cam.fov - fovT) > 0.01) { cam.fov = fovT; cam.updateProjectionMatrix(); }
    cam.position.set(s.pos.x + sx, s.pos.y + sy, s.pos.z);
    cam.lookAt(s.tgt);
    if (roll) cam.rotateZ(roll);
    cam.updateMatrixWorld();

    // ---- boss bar anchor: screen position just above the boss's head (the HUD bar follows it)
    {
      const B = world.boss, id = world.director.bossId;
      let e = id >= 0 ? world.enemies[id] : null;
      if (B.active && !(e && e.active)) {   // mini-bosses (champions, the Slime King) use the bar too: find the live one
        e = null;
        for (let i = 0; i < world.enemies.length; i++) { const m = world.enemies[i]; if (m.active && m.mini && m.state !== 'DYING') { e = m; break; } }
      }
      if (B.active && e && e.active) {
        _d.set(e.pos.x, bossTop(e), e.pos.z).project(cam);
        B.onScreen = _d.z < 1 && Math.abs(_d.x) < 1.15 && Math.abs(_d.y) < 1.15;
        B.sx = (_d.x * 0.5 + 0.5) * window.innerWidth; B.sy = (-_d.y * 0.5 + 0.5) * window.innerHeight;
      } else B.onScreen = false;
      // the Void Herald's illusions: identical bars over each decoy
      let n = 0;
      if (B.active) for (let i = 0; i < world.enemies.length && n < 4; i++) {
        const m = world.enemies[i];
        if (!m.active || !m.decoy || m.trickKind !== 1 || m.state === 'DYING') continue;
        const I = world.illusionBars[n++];
        I.active = true; I.hp = m.hp; I.maxHp = m.maxHp;
        _d.set(m.pos.x, bossTop(m), m.pos.z).project(cam);
        I.onScreen = _d.z < 1 && Math.abs(_d.x) < 1.15 && Math.abs(_d.y) < 1.15;
        I.sx = (_d.x * 0.5 + 0.5) * window.innerWidth; I.sy = (-_d.y * 0.5 + 0.5) * window.innerHeight;
      }
      for (; n < 4; n++) world.illusionBars[n].active = false;
      // dark hero squad: a small bar over each hero's head
      for (let k = 0; k < world.darkBars.length; k++) {
        const D = world.darkBars[k];
        const m = D.active && D.id >= 0 ? world.enemies[D.id] : null;
        if (!m || !m.active || m.state === 'DYING') { D.onScreen = false; continue; }
        _d.set(m.pos.x, 2 + m.scale * 1.6, m.pos.z).project(cam);
        D.onScreen = _d.z < 1 && Math.abs(_d.x) < 1.15 && Math.abs(_d.y) < 1.15;
        D.sx = (_d.x * 0.5 + 0.5) * window.innerWidth; D.sy = (-_d.y * 0.5 + 0.5) * window.innerHeight;
      }
    }

    // ---- Lights Out (Void Herald phase): where the Herald is on screen, the darkness keeps a dim hole round it
    {
      const m = bp.dark && bp.id >= 0 ? world.enemies[bp.id] : null;
      if (m && m.active && m.state !== 'DYING') { _d.set(m.pos.x, 2.2, m.pos.z).project(cam); bp.dOn = _d.z < 1; bp.dsx = (_d.x * 0.5 + 0.5) * window.innerWidth; bp.dsy = (-_d.y * 0.5 + 0.5) * window.innerHeight; } else bp.dOn = false;
    }
    // ---- darkness twist: where the Shadowcaster is on screen (the overlay lights a small hole around it)
    {
      const R = world.roomEvt, m = R.darkId >= 0 ? world.enemies[R.darkId] : null;
      if (m && m.active && m.state !== 'DYING') {
        _d.set(m.pos.x, 1, m.pos.z).project(cam);
        R.dOn = _d.z < 1; R.dsx = (_d.x * 0.5 + 0.5) * window.innerWidth; R.dsy = (-_d.y * 0.5 + 0.5) * window.innerHeight;
      } else R.dOn = false;
    }
    // ---- target anchor: the name + hp plate floats just above the targeted enemy's head
    {
      const A = world.targetAnchor, e = currentTarget();
      if (e && !e.boss) {
        _d.set(e.pos.x, 1.2 + e.scale * 1.5, e.pos.z).project(cam);
        A.on = _d.z < 1 && Math.abs(_d.x) < 1.1 && Math.abs(_d.y) < 1.1;
        A.sx = (_d.x * 0.5 + 0.5) * window.innerWidth; A.sy = (-_d.y * 0.5 + 0.5) * window.innerHeight;
      } else A.on = false;
    }

    // ---- visible ground rectangle (frustum ∩ y=0) + margin; used for culling, shadows and AI LOD
    const V = world.view;
    if (lobby || s.lobbyBlend > 0.01) {
      V.minX = V.minZ = -1e5; V.maxX = V.maxZ = 1e5; V.cx = 0; V.cz = 0; V.r = 1e5; V.on = false;
    } else {
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (let c = 0; c < 4; c++) {
        _v.set(c & 1 ? 1 : -1, c & 2 ? 1 : -1, 0.5).unproject(cam).sub(cam.position);
        const hl = Math.max(1e-3, Math.hypot(_v.x, _v.z));
        const t = _v.y < -1e-3 ? Math.min(-cam.position.y / _v.y, 150 / hl) : 150 / hl;
        const gx = cam.position.x + _v.x * t, gz = cam.position.z + _v.z * t;
        if (gx < minX) minX = gx; if (gx > maxX) maxX = gx; if (gz < minZ) minZ = gz; if (gz > maxZ) maxZ = gz;
      }
      const M = 6;
      V.minX = minX - M; V.maxX = maxX + M; V.minZ = minZ - M; V.maxZ = maxZ + M;
      V.cx = (V.minX + V.maxX) / 2; V.cz = (V.minZ + V.maxZ) / 2;
      V.r = Math.max(V.maxX - V.minX, V.maxZ - V.minZ) / 2; V.on = true;
    }

    // ---- aim point on ground plane
    const inp = world.input;
    const settings = useGameStore.getState().settings;
    if (inp.aimStick.active && Math.hypot(inp.aimStick.x, inp.aimStick.z) > 0.25) {
      // touch right stick: aim in the stick direction
      camRel(inp.aimStick.x, inp.aimStick.z, _rel);
      p.aim.set(p.pos.x + _rel.x * 10, 0, p.pos.z + _rel.z * 10);
    } else if (device.touch && !lobby) {
      // touch without an aim stick: aim along facing (auto-aim overrides this when enabled)
      p.aim.set(p.pos.x + Math.sin(p.facing) * 10, 0, p.pos.z + Math.cos(p.facing) * 10);
    } else {
      const nd = inp.pointerNdc;
      _v.set(clamp(nd.x, -1, 1), clamp(nd.y, -1, 1), 0.5).unproject(cam);
      _v.sub(cam.position);
      if (_v.y < -1e-4) {
        const t = -cam.position.y / _v.y;
        p.aim.set(cam.position.x + _v.x * t, 0, cam.position.z + _v.z * t);
      }
    }
    void settings;

    // ---- (owner) sword cursor while the mouse is over an enemy in a run (DOM write only on change)
    const run = !device.touch && status === GameStatus.PLAYING && !lobby;
    const hov = run && pickEnemyAt(p.aim.x, p.aim.z) ? 'attack' : run && portalAt(p.aim.x, p.aim.z) ? 'hand' : '';
    if (hov !== curState) { curState = hov; if (hov) document.body.dataset.cur = hov; else delete document.body.dataset.cur; }

    // ---- click / tap target selection: pointer ray -> ground plane -> nearest enemy
    if (clickReq.pending) {
      clickReq.pending = false;
      const move = !!useGameStore.getState().settings.clickMove;
      const town = status === GameStatus.MENU && useUiStore.getState().titleDone;
      if ((status === GameStatus.PLAYING && !lobby) || (town && move)) {
        _v.set(clamp(clickReq.nx, -1, 1), clamp(clickReq.ny, -1, 1), 0.5).unproject(cam);
        _v.sub(cam.position);
        if (_v.y < -1e-4) {
          const t = -cam.position.y / _v.y, gx = cam.position.x + _v.x * t, gz = cam.position.z + _v.z * t;
          if (town) { if (performance.now() - walkStamp.t > 250) { walkTo(gx, gz, 'none', '', 0.5); if (world.village.go.on) mark(gx, gz, false); } }   // (a building / NPC click already walks there)
          else {
            const po = portalAt(gx, gz);
            if (po) { clickMoveTo.on = true; clickMoveTo.x = po.x; clickMoveTo.z = po.z; mark(po.x, po.z, false); return; }   // (owner) click a portal: walk to it (any movement setting; E to enter)
            const en = pickEnemyAt(gx, gz);
            const locked = selectAt(gx, gz);
            if (en) mark(en.pos.x, en.pos.z, true);
            else if (locked) mark(gx, gz, true);   // a stationary / barrel: attack it (no walk-to marker)
            else if (move) { clickMoveTo.on = true; clickMoveTo.x = gx; clickMoveTo.z = gz; mark(gx, gz, false); }   // (owner setting) left-click the ground to walk there
          }
        }
      }
    }
  }, -0.5);
  return null;
}
