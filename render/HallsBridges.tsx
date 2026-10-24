// Coral Isles HALLS rooms (owner): every chamber is a sandy island in the sea and the passages between them are WOODEN PLANK BRIDGES.
// The walkable mask is unchanged (render/Room.tsx sinks the ground under the passages and outside the chambers; the sea plane shows); this draws
// the decks: planks every ~0.5 m along each bridge segment (engine/roomHalls bridgeSegs), side rails, posts with rope caps. One merged static mesh.
import React, { useEffect, useMemo } from 'react';
import { Mesh } from 'three';
import { halls } from '../engine/roomHalls';
import { GB, litMat } from './util';

export function HallsBridges() {
  const built = useMemo(() => {
    const S = halls.bridgeSegs;
    if (!S.length) return null;
    const g = new GB([0.75, 1.1]);
    const wood = '#9a7448', wood2 = '#7a5834', rail = '#6a4828', rope = '#e0cc98';
    let post = 0;
    for (let q = 0; q < S.length; q += 5) {
      const ax = S[q], az = S[q + 1], bx = S[q + 2], bz = S[q + 3], hw = S[q + 4] + 0.15, dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
      const yaw = Math.atan2(dx, dz), ux = dx / len, uz = dz / len, px = uz, pz = -ux;
      const n = Math.max(1, Math.round(len / 0.5));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, x = ax + dx * t, z = az + dz * t;
        g.box(hw * 2 + (i % 3 === 0 ? 0.25 : 0), 0.1, len / n - 0.06, [x, 0.07, z], i % 2 ? wood : wood2, [0, yaw + ((i % 5) - 2) * 0.012, 0]);
      }
      for (const sd of [-1, 1]) {
        g.box(0.16, 0.16, len + 0.1, [ax + dx * 0.5 + px * sd * hw, 0.95, az + dz * 0.5 + pz * sd * hw], rail, [0, yaw, 0]);
        g.box(0.12, 0.12, len + 0.1, [ax + dx * 0.5 + px * sd * hw, 0.42, az + dz * 0.5 + pz * sd * hw], rail, [0, yaw, 0]);
      }
      if (post++ % 3 === 0) for (const sd of [-1, 1]) {   // a post (down into the sea) every ~4 m, with a rope-wrapped cap
        const x = ax + px * sd * hw, z = az + pz * sd * hw;
        g.box(0.3, 2.2, 0.3, [x, 0.0, z], rail); g.cyl(0.22, 0.22, 0.18, 8, [x, 1.1, z], rope);
      }
    }
    const geo = g.build();
    const m = new Mesh(geo, litMat({ roughness: 0.9 }));
    m.castShadow = true; m.receiveShadow = true;
    return { m, geo };
  }, [halls.version]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { built?.geo.dispose(); }, [built]);
  return built ? <primitive object={built.m} /> : null;
}
