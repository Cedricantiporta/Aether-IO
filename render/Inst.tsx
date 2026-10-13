import React, { useLayoutEffect, useRef } from 'react';
import { BufferGeometry, InstancedMesh, Material } from 'three';

/** Static instanced mesh filled once by `fill` (re-run when `fill` identity changes). */
export function Inst({ geo, mat, count, fill, cast = false, receive = false, culled = true }: {
  geo: BufferGeometry; mat: Material | Material[]; count: number; fill: (m: InstancedMesh) => void; cast?: boolean; receive?: boolean; culled?: boolean;
}) {
  const ref = useRef<InstancedMesh>(null!);
  useLayoutEffect(() => {
    const m = ref.current;
    fill(m);
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [fill]);
  return <instancedMesh ref={ref} args={[geo, mat as any, count]} castShadow={cast} receiveShadow={receive} frustumCulled={culled} />;
}
