// The hidden treasure chests of the town hub (engine/townChests.ts): cute toy chests (warm wood, cream bands, a little blue gem
// lock) drawn as three tiny instanced meshes: bodies (static), lids (swing open when world.village.chestT starts counting) and a
// few twinkling sparkles over every UNOPENED chest the hero is near (subtle: small, slow, only within SPARK_R metres).
// Opened chests keep the lid up and stop twinkling. Nothing allocates per frame (module scratch objects).
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, CylinderGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Object3D, OctahedronGeometry, Quaternion, Vector3 } from 'three';
import { TOWN_CHESTS, CHEST_OPEN_S } from '../engine/townChests';
import { world } from '../engine/world';
import { GB, litMat } from './util';
import { groundY } from './terrainFn';
import { chunks, dustPuff } from './fx';

const N = TOWN_CHESTS.length, SPARK_N = 3, SPARK_R = 38, HINGE_Y = 0.62, HINGE_Z = -0.5, OPEN_ANG = 1.95;
const WOOD = '#d9954f', WOOD2 = '#b9753a', CREAM = '#fff0c8', GOLD = '#f5c542', GEM = '#6fc4ee';

/** Chest body (origin = centre of the floor, front toward +z) and lid (origin = the hinge, the lid reaches forward to +z). */
function buildBody(): BufferGeometry {
  const b = new GB([0.84, 1.08]);
  b.box(1.5, 0.62, 1.0, [0, 0.31, 0], WOOD);
  b.box(1.58, 0.13, 1.08, [0, 0.07, 0], WOOD2);                                  // base rim
  for (const sx of [-0.52, 0.52]) b.box(0.16, 0.64, 1.04, [sx, 0.32, 0], CREAM);  // two cream bands round the body
  b.box(0.32, 0.34, 0.07, [0, 0.46, 0.52], GOLD);                                // lock plate
  b.octa(0.11, [0, 0.46, 0.58], GEM, [1, 1.25, 0.8]);                            // the gem
  for (const sx of [-0.7, 0.7]) for (const sz of [-0.44, 0.44]) b.sph(0.085, [sx, 0.58, sz], GOLD, 1, 6);   // corner studs
  b.box(1.36, 0.02, 0.86, [0, 0.63, 0], '#5a3a1e');                              // dark inside (seen once the lid is up)
  return b.build();
}
function buildLid(): BufferGeometry {
  const b = new GB([0.88, 1.1]);
  b.add(new CylinderGeometry(0.5, 0.5, 1.5, 14, 1, false, 0, Math.PI), [0, 0, 0.5], [0, 0, Math.PI / 2], 1, WOOD);   // the half-round lid (arc up, flat side down)
  for (const sx of [-0.52, 0.52]) b.add(new CylinderGeometry(0.535, 0.535, 0.16, 14, 1, false, 0, Math.PI), [sx, 0, 0.5], [0, 0, Math.PI / 2], 1, CREAM);
  b.box(0.34, 0.1, 0.08, [0, 0.03, 1.0], GOLD);                                  // the catch
  b.sph(0.1, [0, 0.55, 0.5], GOLD, [1, 0.7, 1], 8);                              // a little knob on top
  return b.build();
}

const _o = new Object3D(), _base = new Matrix4(), _hinge = new Matrix4(), _lid = new Matrix4(), _q = new Quaternion(), _one = new Vector3(1, 1, 1), _p = new Vector3(), _up = new Vector3(0, 1, 0);

export function TownChests() {
  const mat = useMemo(() => litMat({ roughness: 0.8 }), []);
  const spMat = useMemo(() => new MeshBasicMaterial({ color: 0xfff2b0, toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false }), []);
  const bodyGeo = useMemo(buildBody, []), lidGeo = useMemo(buildLid, []), spGeo = useMemo(() => new OctahedronGeometry(1, 0), []);
  const body = useRef<InstancedMesh>(null!), lid = useRef<InstancedMesh>(null!), spark = useRef<InstancedMesh>(null!);
  const ys = useMemo(() => TOWN_CHESTS.map((c) => groundY(c.x, c.z) - 0.02), []);
  const ang = useMemo(() => new Float32Array(N).fill(-1), []);      // last drawn lid angle (-1 = not drawn yet)
  const burst = useMemo(() => new Uint8Array(N), []);               // opening burst already played
  const sparkOn = useMemo(() => new Uint8Array(N), []);             // sparkles currently drawn for this chest

  useLayoutEffect(() => {   // bodies never move: place them once
    for (let i = 0; i < N; i++) {
      const c = TOWN_CHESTS[i];
      _o.position.set(c.x, ys[i], c.z); _o.rotation.set(0, c.yaw, 0); _o.scale.set(1, 1, 1); _o.updateMatrix();
      body.current.setMatrixAt(i, _o.matrix);
    }
    body.current.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < N * SPARK_N; i++) { _o.position.set(0, -50, 0); _o.scale.set(0, 0, 0); _o.updateMatrix(); spark.current.setMatrixAt(i, _o.matrix); }
    spark.current.instanceMatrix.needsUpdate = true;
    ang.fill(-1);
  }, [ys, ang]);

  useFrame(() => {
    const t = world.village.chestT, px = world.player.pos.x, pz = world.player.pos.z, now = world.time;
    let lidDirty = false, spDirty = false;
    for (let i = 0; i < N; i++) {
      const c = TOWN_CHESTS[i], ti = t[i];
      // ---- lid: swings up with a little overshoot, then stays
      let a = 0;
      if (ti >= 0) {
        const k = Math.min(1, ti / CHEST_OPEN_S), e = 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2);   // ease-out-back
        a = OPEN_ANG * e;
        if (!burst[i]) { burst[i] = 1; if (ti < 0.4) { chunks(c.x, ys[i] + 0.9, c.z, 14, 0xffd24a, 0xfff1b0, 4, 0.17); dustPuff(c.x, c.z, 2, 0.6, 0xfff1b8, 1.2); } }
      } else burst[i] = 0;
      if (Math.abs(a - ang[i]) > 1e-4) {
        ang[i] = a;
        _q.setFromAxisAngle(_up, TOWN_CHESTS[i].yaw); _p.set(c.x, ys[i], c.z); _base.compose(_p, _q, _one);
        _hinge.makeRotationX(-a); _hinge.setPosition(0, HINGE_Y, HINGE_Z);
        _lid.multiplyMatrices(_base, _hinge); lid.current.setMatrixAt(i, _lid); lidDirty = true;
      }
      // ---- sparkles: only unopened chests near the hero
      const near = ti < 0 && (c.x - px) * (c.x - px) + (c.z - pz) * (c.z - pz) < SPARK_R * SPARK_R;
      if (near) {
        for (let k = 0; k < SPARK_N; k++) {
          const ph = (now * 0.45 + k / SPARK_N + i * 0.37) % 1, tw = Math.sin(ph * Math.PI), s = 0.05 + 0.09 * tw * tw, ang2 = i * 1.7 + k * 2.1 + now * 0.5;
          _o.position.set(c.x + Math.cos(ang2) * (0.55 + 0.15 * k), ys[i] + 0.55 + ph * 1.1 + k * 0.1, c.z + Math.sin(ang2) * (0.55 + 0.15 * k));
          _o.rotation.set(0, now * 2 + k, 0); _o.scale.set(s, s * 1.5, s); _o.updateMatrix();
          spark.current.setMatrixAt(i * SPARK_N + k, _o.matrix);
        }
        sparkOn[i] = 1; spDirty = true;
      } else if (sparkOn[i]) {
        for (let k = 0; k < SPARK_N; k++) { _o.position.set(0, -50, 0); _o.scale.set(0, 0, 0); _o.updateMatrix(); spark.current.setMatrixAt(i * SPARK_N + k, _o.matrix); }
        sparkOn[i] = 0; spDirty = true;
      }
    }
    if (lidDirty) lid.current.instanceMatrix.needsUpdate = true;
    if (spDirty) spark.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={body} args={[bodyGeo, mat, N]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={lid} args={[lidGeo, mat, N]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={spark} args={[spGeo, spMat, N * SPARK_N]} frustumCulled={false} />
    </group>
  );
}
