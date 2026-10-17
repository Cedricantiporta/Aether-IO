import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Points, PointsMaterial, SRGBColorSpace } from 'three';
import { RIVER } from '../engine/townData';
import { townFx } from './biomeLook';
import { mulberry32 } from './util';
import type { QualityCfg } from './quality';

/** Night fireflies along the river banks: one Points draw (<= 30 motes), only built / drawn on the mid and high quality tiers and only at night. */
export function Fireflies({ q }: { q: QualityCfg }) {
  const n = q.fxScale >= 0.7 ? 30 : q.fxScale >= 0.5 ? 16 : 0;
  const pts = useRef<Points>(null!);
  const { geo, base, mat } = useMemo(() => {
    const r = mulberry32(77), pos = new Float32Array(n * 3), base = new Float32Array(n * 5);   // x, y, z, phase, speed
    for (let i = 0; i < n; i++) {
      const bank = r() < 0.5 ? RIVER.z0 - 2 - r() * 7 : RIVER.z1 + 2 + r() * 7;
      base[i * 5] = RIVER.x0 + 8 + r() * (RIVER.x1 - RIVER.x0 - 30); base[i * 5 + 1] = 0.7 + r() * 1.6; base[i * 5 + 2] = bank; base[i * 5 + 3] = r() * 6.283; base[i * 5 + 4] = 0.4 + r() * 0.6;
    }
    const geo = new BufferGeometry(); geo.setAttribute('position', new BufferAttribute(pos, 3));
    const cv = document.createElement('canvas'); cv.width = cv.height = 32; const x = cv.getContext('2d')!;
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,200,1)'); g.addColorStop(0.35, 'rgba(210,255,110,0.55)'); g.addColorStop(1, 'rgba(180,255,80,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
    const map = new CanvasTexture(cv); map.colorSpace = SRGBColorSpace;
    const mat = new PointsMaterial({ map, size: 0.7, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, toneMapped: false, fog: false });
    return { geo, base, mat };
  }, [n]);
  useEffect(() => () => { geo.dispose(); mat.map?.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame(({ clock }) => {
    const p = pts.current; if (!p) return;
    const k = townFx.lamp; p.visible = k > 0.05; if (!p.visible) return;
    mat.opacity = k * (0.65 + 0.35 * Math.sin(clock.elapsedTime * 3));
    const t = clock.elapsedTime, a = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const b = i * 5, ph = base[b + 3] + t * base[b + 4];
      a[i * 3] = base[b] + Math.sin(ph) * 2.4 + Math.sin(ph * 2.3) * 0.8; a[i * 3 + 1] = base[b + 1] + Math.sin(ph * 1.7) * 0.5; a[i * 3 + 2] = base[b + 2] + Math.cos(ph * 0.9) * 2.4;
    }
    geo.attributes.position.needsUpdate = true;
  });
  if (n === 0) return null;
  return <points ref={pts} geometry={geo} material={mat} frustumCulled={false} visible={false} renderOrder={6} />;
}
