// ============================================================================
// Draws every static piece of the nature kit (render/natureLayout.ts: trees, forest ring, shore palms, rocks, bushes, flower patches,
// grass tufts, mushrooms, benches, fences, park pieces, crops, the fronts-south outskirts buildings, the pier, boats) with ONE batched
// mesh: a three.BatchedMesh holds one geometry per kit piece and one instance per placement, frustum-culled instance by instance and
// drawn with a single multi-draw call (+ a second one for the emissive window glow). That is what keeps the outskirts within the
// draw-call budget: before, every piece x every 24 m chunk was its own draw. Without the WEBGL_multi_draw extension a batched mesh
// falls back to one draw call PER instance, so those devices get the older chunked path (<Inst> per piece, one-off pieces baked into
// one merged mesh per 48 m chunk). The windmill's blades are a separate mesh (they spin).
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BatchedMesh, BufferGeometry, Color, Euler, Group, Material, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cullRegister } from './distCull';
import { nightGlow, forgetNightGlow } from './biomeLook';
import { WINDMILL } from '../engine/townData';
import { QualityCfg } from './quality';
import { Place, KitPiece, KitSet, useNatureKit, natureLit, type NatureKitData } from './natureKit';
import { natureLayout, groundAt, type Sets } from './natureLayout';

const _q = new Quaternion(), _e = new Euler(), _p = new Vector3(), _s = new Vector3(), _m = new Matrix4();
const matOf = (p: Place): Matrix4 => { _q.setFromEuler(_e.set(0, p.ry, 0)); return _m.compose(_p.set(p.x, p.y ?? 0, p.z), _q, _s.set(p.sx, p.sy, p.sz)); };

/** One BatchedMesh for the lit bodies, one for the window glow. */
function buildBatches(sets: Sets, kit: NatureKitData, lit: Material, glow: Material, shadows: boolean): { body: BatchedMesh; glow: BatchedMesh | null } {
  let nInst = 0, nVert = 0, nGInst = 0, nGVert = 0;
  const names = Array.from(sets.keys()).filter((k) => kit.S[k] && sets.get(k)!.length);
  for (const k of names) {
    const l = sets.get(k)!, pc = kit.S[k];
    nInst += l.length; nVert += pc.body.attributes.position.count;
    if (pc.glow) { nGInst += l.length; nGVert += pc.glow.attributes.position.count; }
  }
  const body = new BatchedMesh(nInst, nVert, 0, lit), gl = nGInst ? new BatchedMesh(nGInst, nGVert, 0, glow) : null;
  for (const k of names) {
    const l = sets.get(k)!, pc = kit.S[k], gid = body.addGeometry(pc.body), ggid = pc.glow && gl ? gl.addGeometry(pc.glow) : -1;
    for (const p of l) {
      const m = matOf(p);
      body.setMatrixAt(body.addInstance(gid), m);
      if (ggid >= 0) gl!.setMatrixAt(gl!.addInstance(ggid), m);
    }
  }
  for (const b of gl ? [body, gl] : [body]) { b.sortObjects = false; b.perObjectFrustumCulled = true; b.frustumCulled = false; }
  body.castShadow = shadows; body.receiveShadow = shadows;
  return { body, glow: gl };
}

// ---- fallback (no multi-draw): the chunked path
const MERGE_CH = 48;
function MergedChunk({ body, glow, lit, glowMat, cast, receive }: { body: BufferGeometry; glow: BufferGeometry | null; lit: Material; glowMat: Material; cast: boolean; receive: boolean }) {
  const g = useRef<Group>(null!);
  useEffect(() => { if (!body.boundingSphere) body.computeBoundingSphere(); const sp = body.boundingSphere!; return cullRegister(g.current, sp.center.x, sp.center.z, sp.radius, false); }, [body]);
  useEffect(() => () => { body.dispose(); glow?.dispose(); }, [body, glow]);
  return (
    <group ref={g}>
      <mesh geometry={body} material={lit} castShadow={cast} receiveShadow={receive} />
      {glow && <mesh geometry={glow} material={glowMat} />}
    </group>
  );
}
function bakeMerged(sets: [string, Place[]][], kit: { S: Record<string, KitPiece> }): { body: BufferGeometry; glow: BufferGeometry | null }[] {
  const by = new Map<string, { b: BufferGeometry[]; g: BufferGeometry[] }>();
  for (const [name, places] of sets) {
    const piece = kit.S[name]; if (!piece) continue;
    for (const p of places) {
      const m = matOf(p), key = Math.floor(p.x / MERGE_CH) + ',' + Math.floor(p.z / MERGE_CH);
      let e = by.get(key); if (!e) by.set(key, (e = { b: [], g: [] }));
      e.b.push(piece.body.clone().applyMatrix4(m)); if (piece.glow) e.g.push(piece.glow.clone().applyMatrix4(m));
    }
  }
  return Array.from(by.values()).map((e) => {
    const body = mergeGeometries(e.b, false)!, glow = e.g.length ? mergeGeometries(e.g, false) : null;
    for (const x of [...e.b, ...e.g]) x.dispose();
    return { body, glow };
  });
}
function ChunkedNature({ sets, kit, lit, glow, shadows }: { sets: Sets; kit: NatureKitData; lit: Material; glow: Material; shadows: boolean }) {
  const { inst, merged } = useMemo(() => {
    const all = Array.from(sets.entries());
    return { inst: all.filter(([, l]) => l.length >= 5), merged: bakeMerged(all.filter(([, l]) => l.length < 5), kit) };
  }, [sets, kit]);
  return (
    <>
      {inst.map(([name, places]) => { const piece = kit.S[name]; return piece ? <KitSet key={name} piece={piece} places={places} lit={lit} glow={glow} cast={shadows} receive={shadows} chunk={/fence|crop/.test(name) ? 40 : 48} /> : null; })}
      {merged.map((c, i) => <MergedChunk key={i} body={c.body} glow={c.glow} lit={lit} glowMat={glow} cast={shadows} receive={shadows} />)}
    </>
  );
}

/** The windmill's blades, turning slowly about the hub on the building's south face. */
function WindmillBlades({ lit }: { lit: Material }) {
  const kit = useNatureKit();
  const ref = useRef<Mesh>(null!);
  const s = WINDMILL.s, y = groundAt(WINDMILL.x, WINDMILL.z);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.z += Math.min(dt, 0.05) * 0.42; });
  return <mesh ref={ref} geometry={kit.blades} material={lit} position={[WINDMILL.x + kit.hub[0] * s, y + kit.hub[1] * s, WINDMILL.z + kit.hub[2] * s]} scale={s} castShadow />;
}

export function NatureBatch({ q }: { q: QualityCfg }) {
  const kit = useNatureKit();
  const gl = useThree((s) => s.gl);
  const lit = natureLit();
  const glowMat = useMemo(() => nightGlow(new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.4, 1.1) })), []);
  useEffect(() => () => { forgetNightGlow(glowMat); glowMat.dispose(); }, [glowMat]);
  const shadows = q.shadowMap > 0;
  const multi = useMemo(() => !!gl.extensions.has('WEBGL_multi_draw'), [gl]);
  const sets = useMemo(() => natureLayout(q), [q.name, q.forest, q.flowers]);   // eslint-disable-line react-hooks/exhaustive-deps
  // (built in an effect, not a memo: dispose() empties a BatchedMesh for good, and React strict mode runs mount -> cleanup -> mount)
  const [batches, setBatches] = useState<{ body: BatchedMesh; glow: BatchedMesh | null } | null>(null);
  useEffect(() => {
    if (!multi) { setBatches(null); return; }
    const b = buildBatches(sets, kit, lit, glowMat, shadows);
    setBatches(b);
    return () => { b.body.dispose(); b.glow?.dispose(); };
  }, [multi, sets, kit, lit, glowMat, shadows]);
  return (
    <group>
      {multi ? (batches && <><primitive object={batches.body} />{batches.glow && <primitive object={batches.glow} />}</>) : <ChunkedNature sets={sets} kit={kit} lit={lit} glow={glowMat} shadows={shadows} />}
      <WindmillBlades lit={lit} />
    </group>
  );
}
