// ============================================================================
// The town's animals (townData ANIMALS: cows, sheep, pigs, chickens, cats, dogs, ducks, horses) drawn from the nature kit's round
// jointed animals (render/natureKit.tsx). One InstancedMesh per species (<= 8 draw calls for the whole zoo); the instance matrix
// carries position / yaw / body bob / pitch / roll, and a per-instance pose (gait phase + amplitude, head yaw + pitch, tail wag, wing
// flap, gallop) is turned into joint rotations by the pose shader (the joint Empties of the kit rotate about their pivots, never
// the `_mesh` children). The AI + state stay in engine/systems/npcs.ts (animals[]): wander, pet (E), milk, ride, dash; this file
// only reads that state. Nothing allocates per frame (module-level typed arrays).
// ============================================================================
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, InstancedBufferAttribute, InstancedMesh } from 'three';
import { ANIMALS, HIDDEN_CAT, townLift } from '../engine/townData';
import { animals } from '../engine/systems/npcs';
import { catHidden } from '../engine/systems/village';
import { world } from '../engine/world';
import { liftAt } from './lift';
import { inView } from './view';
import { setInst } from './util';
import { animalMats, ANIMAL_KINDS, AnimalKind, useNatureKit } from './natureKit';

const KIND: Record<string, AnimalKind> = { COW: 'cow', SHEEP: 'sheep', PIG: 'pig', CHICKEN: 'chicken', CAT: 'cat', DOG: 'dog', DUCK: 'duck', HORSE: 'horse' };
interface Look { scale: number; amp: number; bob: number; joy: number; tail: number; graze: boolean; peck: boolean; waddle: boolean; flap: boolean }
const LOOK: Record<AnimalKind, Look> = {
  cow:     { scale: 1.1, amp: 0.42, bob: 0.03, joy: 0.1,  tail: 0.3,  graze: true,  peck: false, waddle: false, flap: false },
  sheep:   { scale: 1.1, amp: 0.5,  bob: 0.03, joy: 0.12, tail: 0.25, graze: true,  peck: false, waddle: false, flap: false },
  pig:     { scale: 1.1, amp: 0.55, bob: 0.03, joy: 0.12, tail: 0.3,  graze: true,  peck: false, waddle: false, flap: false },
  chicken: { scale: 1.15, amp: 0.8, bob: 0.07, joy: 0.22, tail: 0.15, graze: false, peck: true,  waddle: false, flap: true },
  cat:     { scale: 1.2, amp: 0.6,  bob: 0.03, joy: 0.22, tail: 0.4,  graze: false, peck: false, waddle: false, flap: false },
  dog:     { scale: 1.15, amp: 0.65, bob: 0.05, joy: 0.2, tail: 0.6,  graze: false, peck: false, waddle: false, flap: false },
  duck:    { scale: 1.15, amp: 0.7, bob: 0.03, joy: 0.2,  tail: 0.3,  graze: false, peck: true,  waddle: true,  flap: true },
  horse:   { scale: 1.0, amp: 0.38, bob: 0.05, joy: 0.1,  tail: 0.28, graze: true,  peck: false, waddle: false, flap: false },
};
const _c = new Color();

interface Group { kind: AnimalKind; ids: number[]; extra: boolean; poseA: Float32Array; poseB: Float32Array; tint: Float32Array; mesh: InstancedMesh | null }

export function KitAnimals() {
  const kit = useNatureKit();
  const mats = animalMats();
  const groups = useMemo(() => {
    const out: Group[] = [];
    for (const kind of ANIMAL_KINDS) {
      const ids: number[] = [];
      ANIMALS.forEach((a, i) => { if (KIND[a.kind] === kind) ids.push(i); });
      const extra = kind === 'cat';   // + Biscuit, Pip's hidden cat (shown only while her quest needs it)
      const n = ids.length + (extra ? 1 : 0);
      if (!n) continue;
      const tint = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) { _c.set(k < ids.length ? ANIMALS[ids[k]].tint : '#ff9a4a'); tint[k * 3] = _c.r; tint[k * 3 + 1] = _c.g; tint[k * 3 + 2] = _c.b; }
      out.push({ kind, ids, extra, poseA: new Float32Array(n * 4), poseB: new Float32Array(n * 4), tint, mesh: null });
    }
    return out;
  }, []);
  // per-animal smoothed grazing 0..1 + a tiny per-frame scratch (module state, no allocation)
  const graze = useRef(new Float32Array(ANIMALS.length + 1));
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05), tt = world.time, gz = graze.current;
    for (const g of groups) {
      const m = g.mesh; if (!m) continue;
      const L = LOOK[g.kind], n = g.ids.length + (g.extra ? 1 : 0), A = g.poseA, B = g.poseB;
      let shown = 0;
      for (let k = 0; k < n; k++) {
        const bis = k >= g.ids.length;   // Biscuit
        let x: number, z: number, yaw: number, moving = false, joy = 0, ph = 0, ridden = false;
        if (bis) {
          const vis = catHidden(); x = HIDDEN_CAT.x; z = HIDDEN_CAT.z; yaw = 2.2 + Math.sin(tt * 0.7) * 0.4; ph = tt * 3;
          if (!vis) { setInst(m, k, 0, -50, 0, 0, 0.0001); continue; }
          shown++;
          const y = townLift(x, z);
          setInst(m, k, x, y, z, yaw, L.scale * 1.05);
          A[k * 4] = ph; A[k * 4 + 1] = 0; A[k * 4 + 2] = Math.sin(tt * 0.6) * 0.5; A[k * 4 + 3] = 0.1; B[k * 4] = Math.sin(tt * 3.2) * L.tail; B[k * 4 + 1] = 0; B[k * 4 + 2] = 0;
          continue;
        }
        const id = g.ids[k], a = animals[id]; if (!a) continue;
        ridden = a.ridden; moving = a.moving; joy = a.joy; ph = a.hop; x = a.x; z = a.z; yaw = a.yaw;
        if (!ridden && !inView(x, z, 3)) { setInst(m, k, x, -50, z, yaw, 0.0001); continue; }   // (perf: out of the visible ground rect: no pose work)
        shown++;
        const t = tt + id * 3.7, gallop = g.kind === 'horse' && ridden && moving;
        // ---- body: bob (walk hop, happy hops when petted, a slow breath at rest), gallop pitch, duck waddle roll
        let bob = 0, pitch = 0, roll = 0;
        if (moving) bob = Math.abs(Math.sin(ph)) * (g.kind === 'horse' ? (ridden ? 0.12 : 0.05) : L.bob);
        else if (joy > 0) bob = Math.abs(Math.sin(ph * 2)) * L.joy;
        else bob = Math.sin(t * 1.7) * 0.012 + 0.012;
        if (gallop) pitch = Math.sin(ph * 2) * 0.07;
        if (L.waddle && moving) roll = Math.sin(ph) * 0.16;
        setInst(m, k, x, bob + liftAt(x, z), z, yaw, L.scale, L.scale, L.scale, pitch, roll);
        // ---- gait
        A[k * 4] = ph * (gallop ? 2 : 1); A[k * 4 + 1] = !moving ? 0 : gallop ? 0.75 : L.amp;
        // ---- head: graze / peck / head toss (petted) / the occasional look-around
        const look = Math.max(0, Math.sin(t * 0.37)) ** 3;
        let hy = 0, hp = 0;
        if (L.graze) {
          const want = !moving && !ridden && joy <= 0 && Math.sin(t * 0.21) > 0.35 ? 1 : 0;
          gz[id] += (want - gz[id]) * Math.min(1, dt * 1.8);
          const toss = joy > 0 ? Math.sin(Math.min(1, joy) * Math.PI) * 0.45 : 0;
          hp = gz[id] * (g.kind === 'horse' ? 0.75 : 0.85) - toss + (moving ? Math.sin(ph) * 0.07 : Math.sin(t * 1.1) * 0.03);
          hy = (1 - gz[id]) * look * Math.sin(t * 1.3) * 0.5;
        } else if (L.peck) {
          if (moving) { hp = Math.sin(ph * 2) * 0.12; } else if (joy <= 0) { hp = Math.max(0, Math.sin(ph * 2.4)) ** 3 * 0.9; hy = look * Math.sin(t * 2.1) * 0.5; } else hp = -0.2;
        } else {
          hy = look * Math.sin(t * 1.3) * 0.55; hp = joy > 0 ? -0.25 : moving ? Math.sin(ph) * 0.06 : Math.sin(t * 0.8) * 0.04;
        }
        A[k * 4 + 2] = hy; A[k * 4 + 3] = hp;
        // ---- tail wag (faster + wider when moving / happy), wings (flutter at rest, flap when petted)
        const wagK = joy > 0 ? 1.6 : 1;
        B[k * 4] = Math.sin(t * (moving ? 9 : joy > 0 ? 14 : 3.2)) * L.tail * wagK * (g.kind === 'horse' ? (moving ? 0.5 : 1) : 1);
        B[k * 4 + 1] = L.flap ? (joy > 0 ? 0.35 + Math.abs(Math.sin(t * 20)) * 0.7 : moving ? 0.12 + Math.sin(ph * 2) * 0.05 : Math.max(0, Math.sin(t * 0.9 + id)) ** 6 * 0.3) : 0;
        B[k * 4 + 2] = gallop ? 1 : 0;
      }
      m.visible = shown > 0;
      m.instanceMatrix.needsUpdate = true;
      (m.geometry.attributes.aPoseA as InstancedBufferAttribute).needsUpdate = true; (m.geometry.attributes.aPoseB as InstancedBufferAttribute).needsUpdate = true;
    }
  });
  return (
    <>
      {groups.map((g) => (
        <instancedMesh key={g.kind} ref={(m) => { g.mesh = m; if (m) { m.geometry.setAttribute('aPoseA', new InstancedBufferAttribute(g.poseA, 4)); m.geometry.setAttribute('aPoseB', new InstancedBufferAttribute(g.poseB, 4)); m.geometry.setAttribute('aTint', new InstancedBufferAttribute(g.tint, 3)); } }}
          args={[kit.A[g.kind], mats.lit, g.ids.length + (g.extra ? 1 : 0)]} customDepthMaterial={mats.depth} frustumCulled={false} castShadow receiveShadow />
      ))}
    </>
  );
}

/** Saddle height of the ridden kit horse (render/Hero.tsx seats the rider there). */
export function useHorseSeatY(): number { return useNatureKit().seatY; }
