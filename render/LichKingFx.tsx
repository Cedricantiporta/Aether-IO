// The Lich King's phylactery (engine/systems/bossKitLich.ts): a soul jar glows green over each ward crystal he raised, and while the tether holds
// a pulsing green cord links him to it (the cord the hero can cut by running through it). Everything is derived from the enemy list + the boss
// bar title, so the co-op guest sees it too. Two beams + two halos, written from useFrame (no allocation).
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BoxGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';
import { world } from '../engine/world';
import { lk, isKing } from '../engine/systems/bossForms';

export function LichKingFx() {
  const geo = useMemo(() => ({ box: new BoxGeometry(1, 1, 1), sph: new SphereGeometry(1, 14, 10) }), []);
  const mats = useMemo(() => ({
    cord: new MeshBasicMaterial({ color: new Color(0.4, 2.4, 1.6), transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }),
    halo: new MeshBasicMaterial({ color: new Color(0.3, 1.8, 1.2), transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
  }), []);
  const cords = useRef<(Mesh | null)[]>([null, null]), halos = useRef<(Mesh | null)[]>([null, null]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const k = lk.id >= 0 ? world.enemies[lk.id] : null;
    const kingOk = !!k && k.active && k.state !== 'DYING' && isKing(k);
    const tethered = kingOk && world.boss.title.startsWith('INVULNERABLE');
    let n = 0;
    if (kingOk) {
      for (let i = 0; i < world.enemies.length && n < 2; i++) {
        const j = world.enemies[i];
        if (!j.active || j.kind !== 'BOSS_CRYSTAL' || j.state === 'DYING' || !j.bossAdd) continue;
        const h = halos.current[n], c = cords.current[n];
        if (h) { h.visible = true; h.position.set(j.pos.x, 1.4, j.pos.z); h.scale.setScalar(2.1 + 0.35 * Math.sin(t * 4 + n)); }
        if (c) {
          if (tethered) {
            const sx = k!.pos.x, sz = k!.pos.z, ex = j.pos.x, ez = j.pos.z, dx = ex - sx, dz = ez - sz, len = Math.hypot(dx, dz) || 1, w = 0.2 + 0.07 * Math.sin(t * 9 + n * 2);
            c.visible = true; c.position.set((sx + ex) / 2, 2.6, (sz + ez) / 2); c.scale.set(w, w, len); c.rotation.set(0, Math.atan2(dx, dz), 0);
          } else c.visible = false;
        }
        n++;
      }
    }
    for (; n < 2; n++) { const h = halos.current[n], c = cords.current[n]; if (h) h.visible = false; if (c) c.visible = false; }
  });
  return (
    <group>
      {[0, 1].map((i) => <mesh key={`c${i}`} ref={(m) => { cords.current[i] = m; }} geometry={geo.box} material={mats.cord} visible={false} frustumCulled={false} />)}
      {[0, 1].map((i) => <mesh key={`h${i}`} ref={(m) => { halos.current[i] = m; }} geometry={geo.sph} material={mats.halo} visible={false} frustumCulled={false} />)}
    </group>
  );
}
