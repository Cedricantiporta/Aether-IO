import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3 } from 'three';
import { world, TOWN_CENTER } from '../engine/world';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { damp, clamp } from './util';
import { useUiStore } from '../ui/uiStore';
import { feel } from '../engine/game';

const _tgt = new Vector3(), _pos = new Vector3(), _v = new Vector3(), _d = new Vector3();

/** Cinematic (non-interactive) states: title screen and game over. The village itself uses the follow camera. */
export function isLobbyStatus(s: GameStatus) {
  return s === GameStatus.HERO_SELECT || s === GameStatus.GAME_OVER || (s === GameStatus.MENU && !useUiStore.getState().titleDone);
}

/** Isometric-ish follow camera, screen shake, ground-plane aim, and a cinematic lobby orbit. */
export function CameraRig() {
  const cam = useThree((s) => s.camera) as PerspectiveCamera;
  const st = useRef({ tgt: new Vector3(0, 1, 0), pos: new Vector3(0, 30, 22), init: false, zoom: 1, t: 0, look: new Vector3(), lobbyBlend: 0 });

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
    if (!lobby) {
      const ax = p.aim.x - p.pos.x, az = p.aim.z - p.pos.z;
      const d = Math.hypot(ax, az);
      const k = d > 0.001 ? Math.min(d, 14) / d * 0.22 : 0;
      lx = ax * k; lz = az * k;
    }
    s.zoom = damp(s.zoom, world.camera.zoom || 1, 2.5, dt);
    _tgt.set(p.pos.x + lx, 0.8, p.pos.z + lz);
    _pos.set(_tgt.x, 32 * s.zoom, _tgt.z + 22 * s.zoom);

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

    if (!s.init) { s.pos.copy(_pos); s.tgt.copy(_tgt); s.init = true; }
    const kf = lobby ? 2.2 : 7;
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
    const fk = feel.fov, fovT = 40 - fk * fk * 4.5;
    if (Math.abs(cam.fov - fovT) > 0.01) { cam.fov = fovT; cam.updateProjectionMatrix(); }
    cam.position.set(s.pos.x + sx, s.pos.y + sy, s.pos.z);
    cam.lookAt(s.tgt);
    if (roll) cam.rotateZ(roll);
    cam.updateMatrixWorld();

    // ---- aim point on ground plane
    const nd = world.input.pointerNdc;
    _v.set(clamp(nd.x, -1, 1), clamp(nd.y, -1, 1), 0.5).unproject(cam);
    _v.sub(cam.position);
    if (_v.y < -1e-4) {
      const t = -cam.position.y / _v.y;
      p.aim.set(cam.position.x + _v.x * t, 0, cam.position.z + _v.z * t);
    }
  }, 0);
  return null;
}
