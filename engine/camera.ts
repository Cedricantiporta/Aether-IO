import { world } from './world';

/** Rotates a screen-relative vector (x = right, z = down/back) into world space by the free-camera yaw. */
export function camRel(x: number, z: number, out: { x: number; z: number }): void {
  const y = world.camera.yaw, c = Math.cos(y), s = Math.sin(y);
  out.x = x * c + z * s;
  out.z = -x * s + z * c;
}
