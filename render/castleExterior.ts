// ============================================================================
// Castle exterior (Town Plan v6, owner 2026-10-31: "make the castle bigger on the exterior, matching the interior").
// The keep itself is the kit piece 'castle_keep' (render/townKit.tsx, scale CASTLE_S 1.3); everything else here is code-built and merged into the town chunks (no per-frame cost):
// two WINGS (west / east, crenellated, two floors of lit arched windows, blue banners), round corner TOWERS with blue cone roofs + pennants, a gatehouse PORCH with pillars,
// a lintel and a gold-trimmed gable, a red carpet runner down the castle way, the keep's skirt, the statue plinths of the gardens and the Royal Yard's dirt floor.
// Geometry is built at y = 0 in WORLD x / z (the caller lifts it onto Castle Hill). Cute Zelda palette: cream stone, royal-blue slate, gold, warm window glow.
// ============================================================================
import type { GB } from './util';
import { CASTLE, CASTLE_WING, CASTLE_PORCH } from '../engine/townData';
import { CG_STATUES, CG_YARD } from '../engine/castleGrounds';

const STONE = '#efe6d0', STONE2 = '#e1d7bd', STONE3 = '#c9bea4', COURSE = '#cfc4a9', ROOF = '#3c56a8', ROOF_D = '#2d4488', GOLD = '#e6b43c', DARK = '#4d2e1c', WARM = '#ffd070', BLUE = '#2f4ea8', RED = '#c8453b';

/** One arched, lit window on a wall facing +z (dir 1) or -z (dir -1) or +-x: frame + glow + a small sill. `u`/`v` = position, face = which way the wall looks. */
function windowAt(b: GB, g: GB, x: number, y: number, z: number, face: 'S' | 'N' | 'E' | 'W', big = 1): void {
  const w = 0.95 * big, h = 1.55 * big, sx = face === 'E' || face === 'W';
  const o = face === 'S' || face === 'E' ? 1 : -1, d = 0.1;
  const P = (dx: number, dy: number, dz: number): [number, number, number] => sx ? [x + o * dz, y + dy, z + dx] : [x + dx, y + dy, z + o * dz];
  b.box(sx ? 0.16 : w + 0.34, h + 0.34, sx ? w + 0.34 : 0.16, P(0, 0, 0.02), STONE3);
  b.box(sx ? d : w, h, sx ? w : d, P(0, 0, 0.1), DARK);
  b.cyl(w / 2 + 0.17, w / 2 + 0.17, 0.16, 10, P(0, h / 2 + 0.17, 0.02), STONE3, sx ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]);
  b.cyl(w / 2, w / 2, d, 10, P(0, h / 2, 0.1), DARK, sx ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]);
  g.box(sx ? 0.06 : w - 0.14, h - 0.14, sx ? w - 0.14 : 0.06, P(0, 0, 0.16), WARM);
  g.cyl((w - 0.14) / 2, (w - 0.14) / 2, 0.06, 10, P(0, h / 2 - 0.07, 0.16), WARM, sx ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]);
  b.box(sx ? 0.28 : w + 0.5, 0.12, sx ? w + 0.5 : 0.28, P(0, -h / 2 - 0.06, 0.12), STONE3);
  b.box(sx ? 0.06 : 0.07, h, sx ? 0.07 : 0.06, P(0, 0, 0.19), DARK);   // (the window bar)
}

/** Crenellation (merlons) along a straight run at height y: from (x1, z1) to (x2, z2), merlons every 1.7 m. */
function merlons(b: GB, x1: number, z1: number, x2: number, z2: number, y: number, color = STONE): void {
  const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 1.7)), yaw = -Math.atan2(z2 - z1, x2 - x1);
  b.box(len + 0.4, 0.34, 0.62, [(x1 + x2) / 2, y + 0.17, (z1 + z2) / 2], STONE2, [0, yaw, 0]);   // the parapet cap
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; b.box(Math.min(1.0, len / n * 0.58), 0.7, 0.62, [x1 + (x2 - x1) * t, y + 0.34 + 0.35, z1 + (z2 - z1) * t], color, [0, yaw, 0]); }
}

function tower(b: GB, g: GB, x: number, z: number, r: number, h: number, pennant: string): void {
  b.cyl(r + 0.35, r + 0.5, 0.7, 14, [x, 0.35, z], STONE3);                       // foot
  b.cyl(r, r + 0.1, h, 14, [x, h / 2, z], STONE);                                // shaft
  for (let k = 1; k < 4; k++) b.cyl(r + 0.05, r + 0.05, 0.1, 14, [x, (h * k) / 4, z], COURSE);   // courses
  b.cyl(r + 0.5, r + 0.3, 0.7, 14, [x, h + 0.2, z], STONE2);                     // the overhanging crown
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.box(0.62, 0.55, 0.5, [x + Math.cos(a) * (r + 0.42), h + 0.8, z + Math.sin(a) * (r + 0.42)], STONE, [0, -a + Math.PI / 2, 0]); }
  b.cone(r + 0.55, 4.2, 14, [x, h + 0.55 + 2.1, z], ROOF);                       // blue cone roof
  b.cone(r + 0.62, 0.5, 14, [x, h + 0.78, z], ROOF_D);
  b.sph(0.22, [x, h + 4.9, z], GOLD, 1, 6);                                      // finial
  b.cyl(0.04, 0.04, 1.6, 4, [x, h + 5.4, z], DARK);
  b.box(1.1, 0.55, 0.05, [x + 0.58, h + 5.9, z], pennant); g.box(1.1, 0.07, 0.04, [x + 0.58, h + 6.12, z], GOLD);
  // arrow slits + lit windows on the south and outward faces
  for (const [yy, a] of [[h * 0.45, Math.PI / 2], [h * 0.45, 0], [h * 0.72, Math.PI / 2], [h * 0.72, Math.PI]] as [number, number][]) {
    const px = x + Math.cos(a) * (r + 0.02), pz = z + Math.sin(a) * (r + 0.02);
    b.box(0.34, 1.1, 0.34, [px, yy, pz], DARK, [0, -a + Math.PI / 2, 0]);
    g.box(0.16, 0.8, 0.16, [x + Math.cos(a) * (r + 0.12), yy, z + Math.sin(a) * (r + 0.12)], WARM, [0, -a + Math.PI / 2, 0]);
  }
}

export function addCastleExterior(b: GB, g: GB): void {
  const W = CASTLE_WING, K = CASTLE, P = CASTLE_PORCH, kz1 = K.z + K.d / 2;
  // ---- the keep's skirt (the kit piece stands on it)
  b.box(K.w + 1.2, 0.4, K.d + 1.2, [K.x, 0.2, K.z], STONE3);
  // ---- the wings
  for (const sx of [-1, 1]) {
    const x0 = Math.min(sx * W.x0, sx * W.x1), x1 = Math.max(sx * W.x0, sx * W.x1), cx = (x0 + x1) / 2, wz = (W.z0 + W.z1) / 2, wd = W.z1 - W.z0, ww = x1 - x0;
    b.box(ww, 0.5, wd + 0.6, [cx, 0.25, wz], STONE3);                                                        // plinth
    b.box(ww, W.h, wd, [cx, W.h / 2, wz], STONE, [0, 0, 0], [0.97, 1.03]);                                   // the body
    for (const yy of [W.h * 0.33, W.h * 0.66]) { b.box(ww + 0.12, 0.12, wd + 0.12, [cx, yy, wz], COURSE); }  // floor bands
    b.box(ww + 0.5, 0.4, wd + 0.5, [cx, W.h + 0.2, wz], STONE2);                                              // the cornice
    for (const [ax, az, bx, bz] of [[x0, W.z1 + 0.15, x1, W.z1 + 0.15], [x0, W.z0 - 0.15, x1, W.z0 - 0.15]] as [number, number, number, number][]) merlons(b, ax, az, bx, bz, W.h + 0.4);
    merlons(b, sx * W.x1 + sx * 0.15, W.z0, sx * W.x1 + sx * 0.15, W.z1, W.h + 0.4);                        // outer end
    b.box(ww - 1.0, 0.2, wd - 1.0, [cx, W.h + 0.45, wz], '#d8cdb3');                                          // roof walk
    // windows: two floors, every 4.2 m along the front (south) and the back (north) faces; one on the outer face
    for (let wx = x0 + 2.4; wx < x1 - 1.6; wx += 3.6) {
      if (Math.abs(wx) < K.w / 2 + 1.0) continue;
      for (const yy of [W.h * 0.2 + 0.7, W.h * 0.53 + 0.7]) { windowAt(b, g, wx, yy, W.z1, 'S'); windowAt(b, g, wx, yy, W.z0, 'N'); }
    }
    for (const yy of [W.h * 0.2 + 0.7, W.h * 0.53 + 0.7]) windowAt(b, g, sx * W.x1, yy, wz, sx > 0 ? 'E' : 'W');
    // two banners on the front between the window pairs
    for (const bx of [x0 + 4.2, x1 - 4.2]) {
      if (Math.abs(bx) < K.w / 2 + 1.5) continue;
      b.box(0.1, 0.1, 0.1, [bx, W.h - 0.5, W.z1 + 0.14], GOLD); b.box(0.9, 0.08, 0.1, [bx, W.h - 0.55, W.z1 + 0.16], GOLD);
      b.box(0.78, 2.7, 0.05, [bx, W.h - 2.0, W.z1 + 0.14], BLUE); g.box(0.78, 0.08, 0.04, [bx, W.h - 2.6, W.z1 + 0.18], GOLD); b.box(0.78, 0.5, 0.05, [bx, W.h - 3.45, W.z1 + 0.14], BLUE, [0, 0, 0.0]);
    }
    // corner towers on the outer corners, a smaller turret where the wing meets the keep
    tower(b, g, sx * (W.x1 - 0.3), W.z0 + 0.9, W.towerR, W.towerH, BLUE);
    tower(b, g, sx * (W.x1 - 0.3), W.z1 - 0.9, W.towerR, W.towerH, RED);
    tower(b, g, sx * (K.w / 2 + 0.6), W.z1 + 0.2, 1.6, W.h + 2.6, GOLD);
  }
  // ---- gatehouse porch (the keep door stands in it): pillars, lintel with a blue gable, gold trim, two lanterns
  { const z0 = kz1, z1 = kz1 + P.d;
    for (const sx of [-1, 1]) {
      const px = sx * P.hw;
      b.box(1.1, P.h, 1.1, [px, P.h / 2, z1 - 0.55], STONE, [0, 0, 0], [0.97, 1.03]);
      b.box(1.5, 0.35, 1.5, [px, 0.18, z1 - 0.55], STONE3); b.box(1.4, 0.3, 1.4, [px, P.h + 0.15, z1 - 0.55], STONE2);
      b.cyl(0.07, 0.07, 1.4, 6, [px + sx * 0.6, 3.1, z1 - 0.05], DARK); b.box(0.36, 0.5, 0.36, [px + sx * 0.6, 2.2, z1 - 0.05], DARK); g.box(0.24, 0.38, 0.24, [px + sx * 0.6, 2.2, z1 - 0.05], WARM);
    }
    b.box(2 * P.hw + 1.4, 0.9, P.d, [0, P.h + 0.75, (z0 + z1) / 2], STONE);                                   // lintel block
    b.box(2 * P.hw + 1.7, 0.2, P.d + 0.3, [0, P.h + 0.3, (z0 + z1) / 2], GOLD);                               // gold trim
    b.prism(P.d + 0.9, 1.9, 2 * P.hw + 2.0, [0, P.h + 1.2, (z0 + z1) / 2], ROOF, [0, Math.PI / 2, 0]);        // the gable (ridge along x)
    g.sph(0.2, [0, P.h + 1.0, z1 + 0.05], GOLD, 1, 6);
    // steps up to the door: two shallow steps and the red runner down the castle way to the avenue
    b.box(2 * P.hw - 0.6, 0.16, 1.0, [0, 0.08, z1 + 0.5], STONE2); b.box(2 * P.hw - 1.2, 0.3, 0.7, [0, 0.15, z1 + 0.25], STONE3);
    { const za = z1 + 1.0, zb = -52.2; b.box(3.0, 0.04, Math.abs(zb - za), [0, 0.1, (za + zb) / 2], RED); b.box(3.3, 0.03, Math.abs(zb - za), [0, 0.09, (za + zb) / 2], GOLD); }   // the red runner down the castle way
  }
  // ---- keep: a gold ridge banner pair either side of the door
  for (const sx of [-1, 1]) { b.box(0.06, 3.4, 0.06, [sx * 2.3, 4.4, kz1 + 0.12], DARK); b.box(1.0, 2.4, 0.05, [sx * 2.3 + sx * 0.0, 3.2, kz1 + 0.16], BLUE); g.box(0.9, 0.08, 0.04, [sx * 2.3, 2.2, kz1 + 0.2], GOLD); }
  // ---- statue plinths + the yard
  for (const [x, z] of CG_STATUES) {
    b.cyl(1.0, 1.12, 0.14, 20, [x, 0.07, z], STONE3); b.cyl(0.78, 0.9, 0.42, 20, [x, 0.35, z], STONE2); b.torus(0.8, 0.045, [x, 0.55, z], GOLD, [Math.PI / 2, 0, 0], 1, 24);
  }
  { const Y = CG_YARD;
    b.box(Y.hx * 2 + 0.5, 0.05, Y.hz * 2 + 0.5, [Y.cx, 0.025, Y.cz], '#b9a07a');                                // packed rim
    b.box(Y.hx * 2, 0.07, Y.hz * 2, [Y.cx, 0.04, Y.cz], '#d6bf94');                                              // sand floor
    for (let i = 0; i < 6; i++) b.box(0.5 + (i % 3) * 0.2, 0.02, 0.4, [Y.cx - 8 + i * 3.1, 0.08, Y.cz + ((i * 7) % 5) * 0.5 - 1], '#c8ad82');   // scuffs
  }
}
