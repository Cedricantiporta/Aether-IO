// Thin "Korean MMO" ground arrows: a slim chevron head (two thin arms) + an optional thin shaft, flat on the ground
// (XZ plane, y = 0), pointing +z. `t` = stroke thickness; build a slightly thicker copy as the coloured rim underlay.
import { BufferGeometry, Float32BufferAttribute } from 'three';

function quad(out: number[], ax: number, az: number, bx: number, bz: number, t: number): void {
  const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = (-dz / l) * t * 0.5, nz = (dx / l) * t * 0.5;
  out.push(ax + nx, 0, az + nz, bx + nx, 0, bz + nz, bx - nx, 0, bz - nz, ax + nx, 0, az + nz, bx - nx, 0, bz - nz, ax - nx, 0, az - nz);
}

/** w = half width of the head, h = head depth, len = total length (shaft from 0 to the tip; 0 = head only). */
export function thinArrowGeo(w: number, h: number, len: number, t: number): BufferGeometry {
  const v: number[] = [], tip = Math.max(len, h);
  quad(v, 0, tip + t * 0.35, -w, tip - h, t);   // left arm (the tip slightly overlapped so the point stays sharp)
  quad(v, 0, tip + t * 0.35, w, tip - h, t);    // right arm
  if (len > h) quad(v, 0, 0, 0, tip - t * 0.5, t * 0.75);   // shaft
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(v, 3));
  return g;
}

/** Flat arrowhead ("semi triangle") on the ground pointing +z with a CURVED, concave back edge: tip at z = l, back
 *  corners at z = 0 (+-w), the back curving in to z = notch at the middle. Triangle fan from the tip. */
export function triArrowGeo(w: number, l: number, notch: number, seg = 10): BufferGeometry {
  const v: number[] = [];
  const px = (t: number) => (1 - t) * (1 - t) * w + t * t * -w;              // quadratic curve (w,0) -> (-w,0), control (0, 2 notch)
  const pz = (t: number) => 2 * (1 - t) * t * (2 * notch);
  for (let i = 0; i < seg; i++) {
    const a = i / seg, b = (i + 1) / seg;
    v.push(0, 0, l, px(a), 0, pz(a), px(b), 0, pz(b));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(v, 3));
  return g;
}
