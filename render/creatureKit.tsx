// ============================================================================
// Creature kit v1 loader + animation (art/blender/creature_kit_v1.py -> public/models/creatures/creature_kit_v1.glb, see docs/CREATURE_PLAN.md).
// 63 root Empties, each with joint Empties `<piece>_<joint>` (one `_mesh` child each; the joint Empty sits at the pivot, nested joints
// are children of their parent joint). The GLB is meshopt + quantized: every mesh is de-quantized to float, baked into JOINT space and
// the material colour x COLOR_0 becomes the vertex colour (`*glow*` materials go to a separate emissive geometry).
// Two consumers (both share `jointPose`, a procedural pose per joint name):
//   * monsters: `getEnemyModels(kit)` returns ModelDefs (one instanced part per joint) that drop into render/Enemies.tsx unchanged;
//   * pets: `makeRig` builds a small Object3D joint tree (shared geometry / materials) that render/Pet.tsx animates with `animateRig`.
// The table of which game kind uses which piece is render/creatureMap.ts. Loading is NOT suspending: until the GLB is in, every kind keeps
// its old procedural model (useCreatureKit() returns null, then the data once, which re-renders the users).
// ============================================================================
import { useEffect, useState } from 'react';
import { BufferGeometry, Euler, Float32BufferAttribute, Group, Material, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Quaternion, Vector3, Color } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { BASE } from './models';
import { ENEMY_DEFS } from '../engine/enemyDefs';
import { MELEE_WINDUP, meleeT, strikeT } from '../engine/systems/enemies';
import type { Enemy, EnemyKind } from '../engine/types';
import type { ModelDef, Part } from './enemyModels';
import { MONSTER_KIT, type Arch, type CreatureCfg } from './creatureMap';

export const CREATURE_URL = `${BASE}models/creatures/creature_kit_v1.glb`;

export interface KitJoint { key: string; parent: number; px: number; py: number; pz: number; lit: BufferGeometry | null; glow: BufferGeometry | null }
export interface KitPiece { joints: KitJoint[]; minY: number; maxY: number; w: number; d: number }
export interface CreatureKit { P: Record<string, KitPiece> }

// ------------------------------------------------------------------ loading (module singleton, no Suspense)
let kitData: CreatureKit | null = null, loading = false;
const listeners = new Set<() => void>();
export function loadCreatureKit(): void {
  if (kitData || loading) return;
  loading = true;
  const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder as any);
  l.load(CREATURE_URL, (g) => { kitData = bakeKit(g.scene); listeners.forEach((f) => f()); }, undefined, (err) => { loading = false; console.warn('creature kit failed to load', err); });
}
/** The baked kit once loaded (null before: callers keep the old models). Starts the load on first use. */
export function useCreatureKit(): CreatureKit | null {
  const [k, set] = useState<CreatureKit | null>(kitData);
  useEffect(() => {
    if (kitData) { set(kitData); return; }
    const f = () => set(kitData);
    listeners.add(f); loadCreatureKit();
    return () => { listeners.delete(f); };
  }, []);
  return k;
}
loadCreatureKit();

// ------------------------------------------------------------------ baking
const _inv = new Matrix4(), _rel = new Matrix4(), _full = new Matrix4(), _v = new Vector3(), _n = new Vector3(), _col = new Color();

function bakeMesh(m: Mesh, rel: Matrix4, full: Matrix4, box: { minY: number; maxY: number; minX: number; maxX: number; minZ: number; maxZ: number }): BufferGeometry {
  const g0 = m.geometry, p = g0.attributes.position, nr = g0.attributes.normal, cl = g0.attributes.color, idx = g0.index;
  const cnt = idx ? idx.count : p.count;
  const pos = new Float32Array(cnt * 3), nrm = new Float32Array(cnt * 3), col = new Float32Array(cnt * 3);
  const mt = m.material as MeshStandardMaterial; _col.copy(mt.color);
  for (let t = 0; t < cnt; t++) {
    const i = idx ? idx.getX(t) : t;
    _v.set(p.getX(i), p.getY(i), p.getZ(i));   // de-quantized by getX
    _n.set(nr ? nr.getX(i) : 0, nr ? nr.getY(i) : 1, nr ? nr.getZ(i) : 0);
    _v.clone().applyMatrix4(full).toArray(_tmp); const wy = _tmp[1];
    if (wy < box.minY) box.minY = wy; if (wy > box.maxY) box.maxY = wy;
    if (_tmp[0] < box.minX) box.minX = _tmp[0]; if (_tmp[0] > box.maxX) box.maxX = _tmp[0];
    if (_tmp[2] < box.minZ) box.minZ = _tmp[2]; if (_tmp[2] > box.maxZ) box.maxZ = _tmp[2];
    _v.applyMatrix4(rel); _n.transformDirection(rel);
    pos[t * 3] = _v.x; pos[t * 3 + 1] = _v.y; pos[t * 3 + 2] = _v.z;
    nrm[t * 3] = _n.x; nrm[t * 3 + 1] = _n.y; nrm[t * 3 + 2] = _n.z;
    const cr = cl ? cl.getX(i) : 1, cg = cl ? cl.getY(i) : 1, cb = cl ? cl.getZ(i) : 1;
    col[t * 3] = _col.r * cr; col[t * 3 + 1] = _col.g * cg; col[t * 3 + 2] = _col.b * cb;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new Float32BufferAttribute(nrm, 3)); g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}
const _tmp: number[] = [0, 0, 0];

function merge(list: BufferGeometry[]): BufferGeometry | null {
  if (!list.length) return null;
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const g = new BufferGeometry();
  for (const a of ['position', 'normal', 'color'] as const) {
    const arr = new Float32Array(n * 3); let o = 0;
    for (const s of list) { arr.set(s.attributes[a].array as Float32Array, o); o += s.attributes[a].array.length; }
    g.setAttribute(a, new Float32BufferAttribute(arr, 3));
  }
  g.computeBoundingSphere();
  return g;
}

function bakePiece(root: Object3D): KitPiece {
  const joints: KitJoint[] = [], box = { minY: 1e9, maxY: -1e9, minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9 };
  _inv.copy(root.matrixWorld).invert();
  const walk = (node: Object3D, parent: number) => {
    for (const c of node.children) {
      if (c.name.endsWith('_mesh') || !c.name.startsWith(root.name + '_')) continue;
      const lit: BufferGeometry[] = [], glow: BufferGeometry[] = [];
      const ji = joints.length;
      joints.push({ key: c.name.slice(root.name.length + 1), parent, px: c.position.x, py: c.position.y, pz: c.position.z, lit: null, glow: null });
      _rel.copy(c.matrixWorld).invert();
      for (const mn of c.children) {
        if (!mn.name.endsWith('_mesh')) continue;
        mn.traverse((o: any) => {
          if (!o.isMesh) return;
          _full.multiplyMatrices(_inv, o.matrixWorld);
          const rel = new Matrix4().multiplyMatrices(_rel, o.matrixWorld);
          (((o.material as Material).name || '').includes('glow') ? glow : lit).push(bakeMesh(o, rel, _full.clone(), box));
        });
      }
      joints[ji].lit = merge(lit); joints[ji].glow = merge(glow);
      walk(c, ji);
    }
  };
  walk(root, -1);
  return { joints, minY: box.minY, maxY: box.maxY, w: box.maxX - box.minX, d: box.maxZ - box.minZ };
}

function bakeKit(scene: Object3D): CreatureKit {
  scene.updateMatrixWorld(true);
  const P: Record<string, KitPiece> = {};
  for (const root of scene.children) if (root.name) P[root.name] = bakePiece(root);
  return { P };
}

// ------------------------------------------------------------------ joint animation (shared by monsters and pets)
export interface Ctx { t: number; ph: number; mv: number; wu: number; st: number; wind: number; atk: number; id: number; caster: boolean; flap: number; amp: number }
interface Out { rx: number; ry: number; rz: number; sx: number; sy: number; sz: number }
const sin = Math.sin, abs = Math.abs, max = Math.max;
const SPIN: Record<string, number> = { orbit: 1.4, ring: 1.1, ringA: 1.6, ringB: -1.2, halo: 1.0, sparkles: 2.0, shards: 1.2, crystal: 0.7, orb: 1.8, tentacles: 0.0 };

/** Pose of one joint (rotation + scale about its pivot) for the archetype; the whole-body bob / lean is applied elsewhere. */
export function jointPose(key: string, arch: Arch, c: Ctx, o: Out): void {
  o.rx = o.ry = o.rz = 0; o.sx = o.sy = o.sz = 1;
  const { t, ph, mv, wu, st, wind, id } = c;
  const raise = c.caster ? max(wind, c.atk, wu) * 1.5 : wind * 1.8;
  switch (key) {
    case 'head':
      o.rx = sin(ph * 2) * 0.05 * mv - wu * 0.2 + st * 0.35 - wind * 0.1 + sin(t * 1.3 + id) * 0.03;
      o.ry = sin(t * 0.8 + id) * 0.22 * (1 - mv);
      break;
    case 'jaw': o.rx = max(0, sin(t * 3 + id)) * 0.12 + st * 0.5 + wind * 0.4; break;
    case 'armL': case 'armR': {
      const s = key === 'armL' ? 1 : -1;
      if (arch === 'crawl') { o.rx = -0.2 - st * 1.2 + sin(t * 2.5 + id + (s > 0 ? 0 : 1.7)) * 0.1; o.ry = s * (0.1 + sin(t * 3 + id) * 0.08); break; }
      const swing = arch === 'float' ? 0 : sin(ph) * 0.7 * mv * -s;
      o.rx = swing - raise - st * 1.7 + wu * 0.5 + sin(t * 1.8 + id + s) * 0.04 - (arch === 'float' ? 0.3 : 0);
      o.rz = s * (0.04 + (c.caster ? raise * 0.1 : 0));
      break;
    }
    case 'legL': case 'legR': {
      const s = key === 'legL' ? 1 : -1;
      o.rx = sin(ph) * (arch === 'crawl' ? 0.35 : 0.75) * mv * s;
      break;
    }
    case 'legFL': case 'legBR': o.rx = sin(ph) * 0.7 * mv; break;
    case 'legFR': case 'legBL': o.rx = -sin(ph) * 0.7 * mv; break;
    case 'tail': o.ry = sin(t * 4 + id) * 0.3 + sin(ph) * 0.2 * mv; o.rx = sin(t * 2 + id) * 0.08 - st * 0.7; break;
    case 'wingL': case 'wingR': {
      const s = key === 'wingL' ? 1 : -1, f = sin(t * (c.flap || 12)) * (c.amp || 0.6);
      o.rz = s * (f + 0.15);
      break;
    }
    case 'finL': case 'finR': { const s = key === 'finL' ? 1 : -1; o.rz = s * (0.2 + sin(t * 3 + id) * 0.2); break; }
    case 'neck1': o.rx = sin(t * 1.5 + id) * 0.08 - wind * 0.25; o.rz = sin(t * 1.1 + id) * 0.06; break;
    case 'neck2': o.rx = sin(t * 1.5 + id + 1) * 0.1 - wind * 0.2; break;
    case 'core': { const k = 1 + sin(t * 4 + id) * 0.08 + wind * 0.2; o.sx = o.sy = o.sz = k; break; }
    case 'cap': o.rx = sin(t * 2 + id) * 0.04; o.sy = 1 + sin(t * 3 + id) * 0.04 + wind * 0.12; break;
    case 'tentacles': o.ry = sin(t * 0.9 + id) * 0.3; o.sy = 1 + sin(t * 2.5 + id) * 0.05; break;
    case 'face': break;
    default: {
      const sp = SPIN[key];
      if (sp !== undefined) { o.ry = t * sp * (1 + wind * 2); if (key === 'ring') o.rx = sin(t * 1.3) * 0.15; }
    }
  }
}

const _eul = new Euler(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _out: Out = { rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ------------------------------------------------------------------ monsters -> ModelDef
/** Whole-body bob / lean / squash per archetype, as args of Poser.body (dy in model units, pitch, roll, sxz, sy). */
function bodyArgs(arch: Arch, cfg: CreatureCfg, c: Ctx, out: number[]): void {
  const { t, ph, mv, wu, st, wind, id } = c, lift = cfg.lift ?? 0;
  switch (arch) {
    case 'biped': out[0] = lift + abs(sin(ph)) * 0.07 * mv + sin(t * 2.4 + id) * 0.012; out[1] = 0.1 * mv - wu * 0.15 + st * 0.15; out[2] = sin(ph) * 0.04 * mv; out[3] = 1; out[4] = 1 + sin(t * 2.2 + id) * 0.012; break;
    case 'quad': out[0] = lift + abs(sin(ph)) * 0.05 * mv; out[1] = sin(ph) * 0.05 * mv - wu * 0.1 + st * 0.12; out[2] = 0; out[3] = 1; out[4] = 1; break;
    case 'blob': {
      const h = cfg.piece === 'slime' ? max(0, sin(t * 5)) : 0.5 + 0.5 * sin(t * 2.4 + id);
      const k = cfg.piece === 'slime' ? 0.45 : 0.12;
      out[0] = lift + h * k; out[1] = 0; out[2] = 0; out[3] = 1.06 - 0.14 * h - wind * 0.1; out[4] = 0.92 + 0.3 * h + wind * 0.08; break;
    }
    case 'fly': out[0] = lift + sin(t * 3 + id) * 0.14 + abs(sin(t * (cfg.flap ?? 12) * 0.5)) * 0.04; out[1] = 0.15 * mv + st * 0.3; out[2] = sin(t * 2.3 + id) * 0.15; out[3] = 1; out[4] = 1; break;
    case 'float': out[0] = lift + sin(t * 2.2 + id) * 0.12; out[1] = 0.1 * mv + st * 0.4; out[2] = sin(t * 1.5 + id) * 0.05; out[3] = 1 - wind * 0.15; out[4] = 1 + wind * 0.08; break;
    case 'crawl': out[0] = lift + abs(sin(ph)) * 0.02 * mv; out[1] = sin(ph) * 0.02 * mv + st * 0.1 - wu * 0.08; out[2] = sin(ph * 0.5) * 0.02 * mv; out[3] = 1; out[4] = 1; break;
    default: out[0] = lift + sin(t * 2 + id) * 0.02; out[1] = -0.05 * wind; out[2] = 0; out[3] = 1; out[4] = 1;
  }
}

const _ctx: Ctx = { t: 0, ph: 0, mv: 0, wu: 0, st: 0, wind: 0, atk: 0, id: 0, caster: false, flap: 12, amp: 0.6 };
const _ba = [0, 0, 0, 1, 1];

export function kitModelDef(kind: EnemyKind, cfg: CreatureCfg, piece: KitPiece): ModelDef {
  const defScale = ENEMY_DEFS[kind].scale || 1, inv = 1 / defScale, lift = cfg.lift ?? 0;
  const parts: Part[] = [], litIdx: number[] = [], glowIdx: number[] = [];
  for (const j of piece.joints) {
    litIdx.push(j.lit ? parts.length : -1); if (j.lit) parts.push({ geo: j.lit.clone(), mat: 'kit' });
    glowIdx.push(j.glow ? parts.length : -1); if (j.glow) parts.push({ geo: j.glow.clone(), mat: 'glow' });
  }
  const W = piece.joints.map(() => new Matrix4()), L = new Matrix4(), gait = cfg.gait ?? 9;
  const sizeXZ = Math.sqrt(Math.max(0.01, piece.w * piece.d));
  return {
    parts, headY: (piece.maxY + Math.max(0, lift)) * inv, shadow: Math.min(2.2, Math.max(0.3, sizeXZ * 0.5 * 0.85 * inv)),
    pose(e: Enemy, P, t) {
      const c = _ctx;
      c.t = t; c.id = e.id; c.caster = !!cfg.caster; c.flap = cfg.flap ?? 12; c.amp = cfg.amp ?? 0.6;
      const alive = e.state !== 'DYING' && e.state !== 'SPAWN';
      c.mv = alive && e.freezeT <= 0 && e.stunT <= 0 ? clamp01(Math.hypot(e.vel.x, e.vel.z) / 2.5) : 0;
      c.ph = t * gait;
      const mt = meleeT[e.id];
      c.wu = alive && mt > 0 ? 1 - mt / MELEE_WINDUP : 0; c.st = alive ? strikeT[e.id] : 0;
      c.wind = e.state === 'WINDUP' ? clamp01(e.stateT / 0.6) : e.state === 'ATTACK' ? 1 : 0; c.atk = e.state === 'ATTACK' ? 1 : 0;
      P.sc *= inv;   // the kit is authored at ENEMY_DEFS.scale already: Enemies hands in e.scale (= def scale x size multipliers)
      bodyArgs(cfg.arch, cfg, c, _ba);
      P.body(_ba[0], _ba[1], _ba[2], _ba[3], _ba[4]);
      for (let i = 0; i < piece.joints.length; i++) {
        const j = piece.joints[i];
        jointPose(j.key, cfg.arch, c, _out);
        _eul.set(_out.rx, _out.ry, _out.rz, 'YXZ'); _q.setFromEuler(_eul);
        _p.set(j.px, j.py, j.pz); _s.set(_out.sx, _out.sy, _out.sz);
        L.compose(_p, _q, _s);
        if (j.parent < 0) W[i].copy(L); else W[i].multiplyMatrices(W[j.parent], L);
        if (litIdx[i] >= 0) P.partM(litIdx[i], W[i]);
        if (glowIdx[i] >= 0) P.partM(glowIdx[i], W[i]);
      }
      P.glow = 1.5 + sin(t * 4 + e.id) * 0.2 + c.wind * 0.8;
    },
  };
}

let built: { kit: CreatureKit; defs: Partial<Record<EnemyKind, ModelDef>> } | null = null;
/** The enemy ModelDefs with every kit-mapped kind replaced by its creature-kit model (`base` = the old procedural defs, kept for the rest). */
export function getEnemyModels(base: Partial<Record<EnemyKind, ModelDef>>, kit: CreatureKit | null): Partial<Record<EnemyKind, ModelDef>> {
  if (!kit) return base;
  if (!built || built.kit !== kit) {
    const defs: Partial<Record<EnemyKind, ModelDef>> = { ...base };
    for (const k of Object.keys(MONSTER_KIT) as EnemyKind[]) {
      const cfg = MONSTER_KIT[k]!, piece = kit.P[cfg.piece];
      if (piece && piece.joints.some((j) => j.lit || j.glow)) defs[k] = kitModelDef(k, cfg, piece);
    }
    built = { kit, defs };
  }
  return built.defs;
}

// ------------------------------------------------------------------ pets (small joint rig, shared geometry / materials)
let _lit: MeshStandardMaterial | null = null, _glow: MeshBasicMaterial | null = null;
const petLit = () => (_lit ??= new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.0, flatShading: false }));
const petGlow = () => (_glow ??= new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.6, 1.6) }));

export interface Rig { root: Group; joints: Object3D[]; keys: string[]; arch: Arch; flap: number; amp: number }
export function makeRig(kit: CreatureKit, piece: string, arch: Arch, cast: boolean, flap = 12, amp = 0.6): Rig | null {
  const kp = kit.P[piece]; if (!kp) return null;
  const root = new Group(), joints: Object3D[] = [];
  for (const j of kp.joints) {
    const o = new Object3D(); o.position.set(j.px, j.py, j.pz); o.rotation.order = 'YXZ';
    if (j.parent < 0) root.add(o); else joints[j.parent].add(o);
    joints.push(o);
    if (j.lit) { const m = new Mesh(j.lit, petLit()); m.castShadow = cast; o.add(m); }
    if (j.glow) { const m = new Mesh(j.glow, petGlow()); o.add(m); }
  }
  return { root, joints, keys: kp.joints.map((j) => j.key), arch, flap, amp };
}
const _pc: Ctx = { t: 0, ph: 0, mv: 0, wu: 0, st: 0, wind: 0, atk: 0, id: 0, caster: false, flap: 12, amp: 0.6 };
/** Pose a pet rig: `mv` 0..1 movement, `ph` gait phase (rad), `atk` 1 -> 0 after a strike. */
export function animateRig(r: Rig, t: number, mv: number, ph: number, atk: number): void {
  const c = _pc; c.t = t; c.mv = mv; c.ph = ph; c.st = atk; c.wu = 0; c.wind = 0; c.atk = 0; c.id = 0; c.caster = false; c.flap = r.flap; c.amp = r.amp;
  for (let i = 0; i < r.joints.length; i++) {
    jointPose(r.keys[i], r.arch, c, _out);
    const o = r.joints[i];
    o.rotation.set(_out.rx, _out.ry, _out.rz); o.scale.set(_out.sx, _out.sy, _out.sz);
  }
}
