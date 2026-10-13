import React, { useLayoutEffect, useRef } from 'react';
import { BufferGeometry, Group, InstancedBufferAttribute, InstancedMesh, Material } from 'three';

/** World-space chunk edge (units). Static scenery is split into chunks so three's frustum / shadow-frustum culling drops whole chunks. */
export const CHUNK = 24;
/** Instance count from which a static set is split into chunks. */
const CHUNK_MIN = 2;

/**
 * Static instanced mesh filled once by `fill` (re-run when `fill` identity changes).
 * The fill result is bucketed into 24x24 spatial chunks; each chunk is its own InstancedMesh with a tight bounding sphere
 * (frustumCulled = true), so only on-screen chunks are drawn (and only chunks inside the bounded shadow camera cast).
 */
export function Inst({ geo, mat, count, fill, cast = false, receive = false }: {
  geo: BufferGeometry; mat: Material | Material[]; count: number; fill: (m: InstancedMesh) => void; cast?: boolean; receive?: boolean; culled?: boolean;
}) {
  const ref = useRef<Group>(null!);
  useLayoutEffect(() => {
    const group = ref.current;
    const tmp = new InstancedMesh(geo, mat as any, count);
    fill(tmp);
    const n = Math.min(tmp.count, count);
    const src = tmp.instanceMatrix.array as Float32Array;
    const col = tmp.instanceColor ? (tmp.instanceColor.array as Float32Array) : null;
    const buckets = new Map<number, number[]>();
    // sparse sets stay one mesh (one draw call beats several tiny chunks); dense sets are chunked
    const chunked = n >= CHUNK_MIN;
    for (let i = 0; i < n; i++) {
      const key = !chunked ? 0 : (Math.floor(src[i * 16 + 12] / CHUNK) + 512) * 1024 + (Math.floor(src[i * 16 + 14] / CHUNK) + 512);
      let b = buckets.get(key);
      if (!b) { b = []; buckets.set(key, b); }
      b.push(i);
    }
    const made: InstancedMesh[] = [];
    buckets.forEach((ids) => {
      const m = new InstancedMesh(geo, mat as any, ids.length);
      const dst = m.instanceMatrix.array as Float32Array;
      for (let k = 0; k < ids.length; k++) dst.set(src.subarray(ids[k] * 16, ids[k] * 16 + 16), k * 16);
      if (col) {
        m.instanceColor = new InstancedBufferAttribute(new Float32Array(ids.length * 3), 3);
        const cd = m.instanceColor.array as Float32Array;
        for (let k = 0; k < ids.length; k++) { cd[k * 3] = col[ids[k] * 3]; cd[k * 3 + 1] = col[ids[k] * 3 + 1]; cd[k * 3 + 2] = col[ids[k] * 3 + 2]; }
      }
      m.instanceMatrix.needsUpdate = true;
      m.castShadow = cast; m.receiveShadow = receive; m.frustumCulled = true;
      m.computeBoundingSphere();
      group.add(m);
      made.push(m);
    });
    tmp.dispose();
    return () => { for (const m of made) { group.remove(m); m.dispose(); } };
  }, [fill, geo, mat, count, cast, receive]);
  return <group ref={ref} />;
}
