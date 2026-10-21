// Builds a town NPC as ONE SkinnedMesh (1 draw call): the KayKit body parts re-coloured by their palette-atlas cell (skin / sleeves / trousers /
// armour ...), the KayKit head with its baked hair removed, plus the rigidly skinned soft pieces of the npc_wear_v1 kit (hair, beards, hats,
// clothes: render/npcWear.ts). The look comes from engine/npcLooks.ts. No texture is used: everything is vertex colours on one shared material.
//
// The KayKit atlas (512 px) is an 8 x 8 grid of flat swatches (each swatch = 2 cells: bright over dark). A vertex's UV cell tells what it is:
// the CELLS table maps (rig, part, cell) -> role; role colour x (cell brightness / the role's reference cell brightness) keeps the baked shading.
import { Color, DoubleSide, Float32BufferAttribute, Matrix4, MeshStandardMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute, Uint32BufferAttribute, Vector3, BufferGeometry } from 'three';
import type { Bone, Mesh } from 'three';
import type { CharInstance } from './characters';
import type { NpcLook } from '../engine/npcLooks';
import type { NpcModel } from '../engine/townData';
import type { WearKit } from './npcWear';

/** the 64 atlas cells (row-major, row 0 = top) of each rig, sRGB hex (read once from the shipped KayKit textures) */
const ATLAS: Record<NpcModel, string[]> = {
  ARCHER: 'f8c7a5 a9674e 20292c 9ba7ac 555b60 f4e6d9 f4e6d9 926a53 f3b18a 8a4835 080a0b 677074 41474c ddb58e ddb58e 694b3e 27a0d7 7b6b60 e9eeee 9ba7ac a29a94 c07d5a ab684f 7a6a5f 214f96 5b4f47 bfcacd 687175 7c726c a2624a 884935 5b4f47 e8eced 279dd5 f1e6da 926a53 a29a94 a29a94 c6c6c6 936b54 c1ccd2 235097 ddb58e 6a4c40 7c726c 7c726c 555555 694c3c c6c6c6 c7c7c7 c7c7c7 c7c7c7 c7c7c7 c7c7c7 c7c7c7 c7c7c7 575855 565754 565754 565754 565754 565754 565754 565754'.split(' '),
  KNIGHT: 'f8c7a5 e4bc8e 1f272b 9ba7ac 545a5f bf7b59 ab684f 9ba7ac f3b18a d19e6b 070908 687175 41474c a2624a 894a37 687175 ea5859 e9eeee 99a6ab 99a6ab f1d97f ab684f 79695e 545a5f a81e33 bfcacf 697276 687175 e19836 884734 5d514a 41474c e8eced a29a94 e85959 ac6950 a19993 a29a94 c6c6c6 c6c6c6 c0cbd0 7b716b a81e33 874834 7c726c 7c726c 565754 565754 c6c6c6 c7c7c7 c7c7c7 c7c7c7 c7c7c7 c7c7c7 c7c7c7 c7c7c7 575855 565754 565754 565754 565754 565754 565754 565754'.split(' '),
  BARBARIAN: 'f8c7a5 a29a94 1f272b 9ba7ac 555b60 c07d5a ab684f 7a6a5f f3b18a 7c726c 07090a 687175 42484d a2624a 894a37 5b4f47 a29a94 c6c6c6 e8eced 9ba7ac a29a94 a9674e 926a53 a29a94 9a554f 565754 bfcacf 687175 7b716b 8a4835 694b3e 7b716b e9eeee e7b757 587a96 79695e a29a94 a29a94 c2c2c2 a29a94 c1ccd2 ba7833 435d70 5c5049 7c726c 7c726c 565656 7e736e c6c6c6 f5e8d8 c5c5c5 c4c4c4 c5c5c5 c5c5c5 c5c5c5 c5c5c5 565754 ddb590 555553 565754 565754 565754 565754 565754'.split(' '),
  WIZARD: 'f8c7a5 2e292d 20292c 9ba7ac 9ba7ac d46f2f a9674e 7a6a5f f4b28b 090909 070908 687175 677074 92411d 874834 5c5049 615c8d 615c8d be1963 9ba7ac 555b60 ab684f 7a6a5f 39345d 2e2b4e 2e2b4e 891c50 687175 41474c 8a4835 5c5049 1f1c3d e8eced be1963 2b7c7e a9674e a29a94 a29a94 9ecb5e f8c7a5 bfcacf 8a1b50 305d65 884734 7c726c 7e736e 369b86 f2b288 fbc05b d16e30 e6b656 5d7d99 f04b25 e4be8f f6c8a5 f8c7a5 f59242 944321 ba7735 405d6c c4122e d1a06c ef9467 c59d7f'.split(' '),
  ROGUE: 'f8c7a5 a9674e 20292c 9ba7ac 545a5f bf7b59 ab684f 7a6a5f f3b18a 884935 07090a 687175 41474c a2624a 874834 5b4f47 077960 009a58 9ca9ad 9ca9ad 555b60 c07d5a a9674e 79695e 084b47 006e4f 687175 687175 41474c a3634b 8b4937 5c5049 f4e8dc 009a58 9ecb5c ab684f c07d5a ab684f 7a6a5f ab684f ddb58e 006e4f 339b83 884935 a3634b 884734 5c5049 884734 9dce59 fec220 cd5aff 01ebf0 ef4823 e4be8d f8c7a5 f8c7a5 349a85 d05709 6f05b4 0f72a2 c51331 d29f6c ed9567 c69a80'.split(' '),
};

type PartType = 'head' | 'body' | 'arm' | 'leg';
type Role = 'skin' | 'hair' | 'shirt' | 'pants' | 'acc' | 'armor';
const I = (c: number, r: number) => r * 8 + c;
/** cells (first one = the role's reference brightness) per rig and body part */
const CELLS: Record<NpcModel, Partial<Record<PartType, Partial<Record<Role, number[]>>>>> = {
  ARCHER: { head: { skin: [I(0, 0), I(0, 1)], hair: [I(1, 0), I(1, 1)] }, body: { acc: [I(0, 2), I(0, 3)], shirt: [I(5, 0), I(5, 1), I(6, 0), I(6, 1)] },
    arm: { skin: [I(0, 0), I(0, 1)], shirt: [I(6, 0), I(6, 1)] }, leg: { pants: [I(3, 4), I(3, 5)] } },
  WIZARD: { head: { skin: [I(0, 0), I(0, 1)], hair: [I(1, 0), I(1, 1)] }, body: { shirt: [I(0, 2), I(0, 3), I(7, 2), I(7, 3)] },
    arm: { shirt: [I(0, 2), I(0, 3)], skin: [I(7, 5)] }, leg: { pants: [I(7, 2), I(7, 3)] } },
  KNIGHT: { head: { skin: [I(0, 0), I(0, 1)], hair: [I(1, 0), I(1, 1)] }, body: { armor: [I(3, 0), I(3, 1), I(7, 0), I(7, 1), I(2, 2), I(2, 3)], acc: [I(0, 2), I(0, 3)] },
    arm: { armor: [I(3, 0), I(3, 1), I(7, 0)] }, leg: { armor: [I(3, 0), I(3, 1), I(7, 0)] } },
  BARBARIAN: { head: { skin: [I(0, 0), I(0, 1)], hair: [I(1, 0), I(1, 1)] }, body: { skin: [I(0, 0), I(0, 1)] }, arm: { skin: [I(0, 0), I(0, 1)] }, leg: { pants: [I(3, 4), I(3, 5)] } },
  ROGUE: { head: { skin: [I(0, 0), I(0, 1)], shirt: [I(1, 2), I(1, 3)], hair: [I(1, 0), I(1, 1)] }, body: { shirt: [I(0, 2), I(0, 3), I(1, 2), I(1, 3)] },
    arm: { shirt: [I(0, 2), I(0, 3), I(1, 2), I(1, 3)], skin: [I(0, 1)] }, leg: {} },
};

const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const _atlas = new Map<NpcModel, Float32Array>();
function atlasRgb(model: NpcModel): Float32Array {
  let a = _atlas.get(model);
  if (a) return a;
  a = new Float32Array(64 * 3);
  const c = new Color();
  ATLAS[model].forEach((h, i) => { c.set('#' + h); a![i * 3] = c.r; a![i * 3 + 1] = c.g; a![i * 3 + 2] = c.b; });
  _atlas.set(model, a);
  return a;
}
/** per (rig, part): cell -> role index (0 keep, 1 skin ... ) and brightness ratio against the role's reference cell */
const ROLES: Role[] = ['skin', 'hair', 'shirt', 'pants', 'acc', 'armor'];
const _lut = new Map<string, { role: Int8Array; k: Float32Array }>();
function lutOf(model: NpcModel, pt: PartType) {
  const key = model + pt;
  let l = _lut.get(key);
  if (l) return l;
  const role = new Int8Array(64).fill(-1), k = new Float32Array(64).fill(1), at = atlasRgb(model);
  const tab = CELLS[model][pt] || {};
  for (const r of Object.keys(tab) as Role[]) {
    const cells = tab[r]!, ref = lum(at[cells[0] * 3], at[cells[0] * 3 + 1], at[cells[0] * 3 + 2]) || 1e-4;
    for (const c of cells) { role[c] = ROLES.indexOf(r); k[c] = Math.min(1.05, Math.max(0.3, lum(at[c * 3], at[c * 3 + 1], at[c * 3 + 2]) / ref)); }
  }
  l = { role, k };
  _lut.set(key, l);
  return l;
}

/** one shared lit material for every NPC (vertex colours, soft shading) */
export const npcMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, side: DoubleSide });

const PART_RE: [RegExp, PartType][] = [[/_Head$/, 'head'], [/_Body$/, 'body'], [/_Arm(Left|Right)$/, 'arm'], [/_Leg(Left|Right)$/, 'leg']];
const _v = new Vector3(), _m = new Matrix4(), _inv = new Matrix4(), _hInv = new Matrix4();
const _skin = new Color(), _hair = new Color(), _shirt = new Color(), _pants = new Color(), _acc = new Color(), _armor = new Color();

export interface NpcBuilt { mesh: SkinnedMesh; dispose(): void }

/**
 * Merge a cloned KayKit character (`ch`, the BODY rig) + the head of `face` (another clone, or `ch` itself) + the kit pieces of `look.wear`
 * into one SkinnedMesh that replaces every original part of `ch`. The original meshes are removed from the hierarchy.
 */
export function buildNpc(ch: CharInstance, faceCh: CharInstance, look: NpcLook, kit: WearKit): NpcBuilt | null {
  const cached = (ch as CharInstance & { __npc?: NpcBuilt }).__npc;      // idempotent per instance (effects may run twice)
  if (cached) return cached;
  const roleCol = [_skin.set(look.skin), _hair.set(look.hair), _shirt.set(look.shirt), _pants.set(look.pants), _acc.set(look.acc || '#ffffff'), _armor.set(look.armor || '#ffffff')];
  const roleOn = [true, true, true, true, !!look.acc, !!look.armor];
  const bald = look.wear.some((w) => w[0] === 'hair_bald_fringe');

  const bodyMesh = ch.meshes.find((m) => /_Body$/.test(m.name)) as SkinnedMesh | undefined;
  if (!bodyMesh) return null;
  const baseBones = new Map<string, Bone>();
  ch.root.traverse((o) => { if ((o as Bone).isBone) baseBones.set(o.name, o as Bone); });

  const bones: Bone[] = [], inverses: Matrix4[] = [];
  const slot = (b: Bone, inv: Matrix4): number => {
    let j = 0;
    while (j < bones.length && !(bones[j] === b && inverses[j].equals(inv))) j++;
    if (j === bones.length) { bones.push(b); inverses.push(inv.clone()); }
    return j;
  };

  // ---- KayKit parts
  const parts: [SkinnedMesh, PartType, NpcModel, boolean][] = [];
  for (const m of ch.meshes as SkinnedMesh[]) {
    const pt = PART_RE.find(([re]) => re.test(m.name));
    if (pt && pt[1] !== 'head') parts.push([m, pt[1], look.base, false]);
  }
  const headMesh = (faceCh.meshes as SkinnedMesh[]).find((m) => /_Head$/.test(m.name));
  if (headMesh) parts.push([headMesh, 'head', look.face, true]);
  // typed output buffers sized for the worst case (every vertex / triangle kept), trimmed with subarray at the end
  let maxV = 0, maxI = 0;
  for (const name of look.wear) { const pc = kit[name[0]]; if (pc) { maxV += pc.n; maxI += pc.idx.length; } }
  for (const [m] of parts) { maxV += m.geometry.attributes.position.count; maxI += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
  const pos = new Float32Array(maxV * 3), nrm = new Float32Array(maxV * 3), col = new Float32Array(maxV * 3), sIdx = new Uint16Array(maxV * 4), sWgt = new Float32Array(maxV * 4), index = new Uint32Array(maxI);
  let nv = 0, ni = 0;

  for (const [m, pt, model, isHead] of parts) {
    const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, ix = g.index;
    if (!P || !U || !SI || !SW) continue;
    const at = atlasRgb(model), lut = lutOf(model, pt), n = P.count;
    // bone slots for this part's skeleton (names re-resolved on the BODY rig's clone, so a head borrowed from another rig works)
    const sb = m.skeleton.bones, remap = new Int32Array(sb.length).fill(-1);   // (resolved lazily: only bones that carry vertices enter the skeleton)
    const rm = (i: number) => remap[i] >= 0 ? remap[i] : (remap[i] = slot(baseBones.get(sb[i].name) || sb[i], m.skeleton.boneInverses[i]));
    const cellOf = new Int16Array(n), dropV = new Uint8Array(n), skullV = new Uint8Array(n);
    // The ARCHER / KNIGHT / WIZARD heads have NO skull under their baked hair (back, top and sides of the head all use the hair cell), so dropping it
    // left a hollow face mask that showed from behind / above (hats and hair looked detached). Those hair triangles are kept as the skull instead:
    // squashed into the skull box the kit was fitted to (head-bone local x +-0.53, y 0.02..0.72, z -0.39..0.46) and painted hair (skin for bald looks).
    // BARBARIAN has a complete skin skull (its baked hair cells are only a fringe: dropped); ROGUE keeps its hood.
    const keepSkull = isHead && (model === 'ARCHER' || model === 'KNIGHT' || model === 'WIZARD');
    const hi = isHead ? sb.findIndex((b) => b.name === 'head') : -1;
    const hInv = hi >= 0 ? m.skeleton.boneInverses[hi] : null;
    if (hInv) _hInv.copy(hInv).invert();
    for (let v = 0; v < n; v++) {
      const c = Math.min(7, Math.max(0, Math.floor(U.getX(v) * 8))), r = Math.min(7, Math.max(0, Math.floor(U.getY(v) * 8)));
      cellOf[v] = r * 8 + c;
      if (isHead && lut.role[cellOf[v]] === 1 && model !== 'ROGUE') { if (keepSkull && hInv) skullV[v] = 1; else dropV[v] = 1; }
    }
    const newIndex = new Int32Array(n).fill(-1);
    const add = (v: number) => {
      if (newIndex[v] >= 0) return newIndex[v];
      const o = nv++;
      newIndex[v] = o;
      pos[o * 3] = P.getX(v); pos[o * 3 + 1] = P.getY(v); pos[o * 3 + 2] = P.getZ(v);
      nrm[o * 3] = N.getX(v); nrm[o * 3 + 1] = N.getY(v); nrm[o * 3 + 2] = N.getZ(v);
      if (skullV[v]) {      // squash into the skull box (bone-local = inverse-bind x raw position), then back to raw
        _v.set(pos[o * 3], pos[o * 3 + 1], pos[o * 3 + 2]).applyMatrix4(hInv!);
        _v.set(Math.max(-0.53, Math.min(0.53, _v.x)), Math.max(0.02, Math.min(0.72, _v.y)), Math.max(-0.39, Math.min(0.46, _v.z))).applyMatrix4(_hInv);
        pos[o * 3] = _v.x; pos[o * 3 + 1] = _v.y; pos[o * 3 + 2] = _v.z;
      }
      const cell = cellOf[v], ro = lut.role[cell];
      if (skullV[v]) { const rc = bald ? roleCol[0] : roleCol[1], k = lut.k[cell]; col[o * 3] = rc.r * k; col[o * 3 + 1] = rc.g * k; col[o * 3 + 2] = rc.b * k; }
      else if (ro >= 0 && roleOn[ro]) { const rc = roleCol[ro], k = lut.k[cell]; col[o * 3] = rc.r * k; col[o * 3 + 1] = rc.g * k; col[o * 3 + 2] = rc.b * k; }
      else { col[o * 3] = at[cell * 3]; col[o * 3 + 1] = at[cell * 3 + 1]; col[o * 3 + 2] = at[cell * 3 + 2]; }
      for (let q = 0; q < 4; q++) { { const w = SW.getComponent(v, q); sIdx[o * 4 + q] = w > 0 ? rm(SI.getComponent(v, q)) : 0; } sWgt[o * 4 + q] = SW.getComponent(v, q); }
      return o;
    };
    const tris = ix ? ix.count : n;
    for (let t = 0; t < tris; t += 3) {
      const a = ix ? ix.getX(t) : t, b = ix ? ix.getX(t + 1) : t + 1, c = ix ? ix.getX(t + 2) : t + 2;
      if (dropV[a] + dropV[b] + dropV[c] >= 2) continue;
      index[ni++] = add(a); index[ni++] = add(b); index[ni++] = add(c);
    }
  }

  // ---- kit pieces, rigidly skinned to their bone (the vertices are in the bone's local frame)
  const bodyBones = bodyMesh.skeleton.bones;
  const bindInv = bodyMesh.bindMatrixInverse;
  for (const [name, a, b] of look.wear) {
    const pc = kit[name];
    if (!pc) continue;
    const bone = baseBones.get(pc.bone), bi = bone ? bodyBones.indexOf(bone) : -1;
    if (!bone || bi < 0) continue;
    const inv = bodyMesh.skeleton.boneInverses[bi], s = slot(bone, inv);
    _m.copy(bindInv).multiply(_inv.copy(inv).invert());      // bone-local -> mesh space (at the bind pose)
    const A = new Color(a || '#ffffff'), B = new Color(b || '#ffffff');
    const base = nv;
    for (let v = 0; v < pc.n; v++) {
      const o = nv++;
      _v.set(pc.pos[v * 3], pc.pos[v * 3 + 1], pc.pos[v * 3 + 2]).applyMatrix4(_m);
      pos[o * 3] = _v.x; pos[o * 3 + 1] = _v.y; pos[o * 3 + 2] = _v.z;
      _v.set(pc.nrm[v * 3], pc.nrm[v * 3 + 1], pc.nrm[v * 3 + 2]).transformDirection(_m);
      nrm[o * 3] = _v.x; nrm[o * 3 + 1] = _v.y; nrm[o * 3 + 2] = _v.z;
      const ro = pc.role[v], rc = ro === 1 ? A : ro === 2 ? B : ro === 3 ? roleCol[1] : ro === 4 ? roleCol[0] : null;
      col[o * 3] = pc.col[v * 3] * (rc ? rc.r : 1); col[o * 3 + 1] = pc.col[v * 3 + 1] * (rc ? rc.g : 1); col[o * 3 + 2] = pc.col[v * 3 + 2] * (rc ? rc.b : 1);
      sIdx[o * 4] = s; sWgt[o * 4] = 1;
    }
    for (let i = 0; i < pc.idx.length; i++) index[ni++] = base + pc.idx[i];
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos.slice(0, nv * 3), 3));
  geo.setAttribute('normal', new Float32BufferAttribute(nrm.slice(0, nv * 3), 3));
  geo.setAttribute('color', new Float32BufferAttribute(col.slice(0, nv * 3), 3));
  geo.setAttribute('skinIndex', new Uint16BufferAttribute(sIdx.slice(0, nv * 4), 4));
  geo.setAttribute('skinWeight', new Float32BufferAttribute(sWgt.slice(0, nv * 4), 4));
  geo.setIndex(nv > 65535 ? new Uint32BufferAttribute(index.slice(0, ni), 1) : new Uint16BufferAttribute(index.slice(0, ni), 1));
  geo.computeBoundingSphere();
  const merged = new SkinnedMesh(geo, npcMat);
  merged.name = 'npcMerged';
  merged.position.copy(bodyMesh.position); merged.quaternion.copy(bodyMesh.quaternion); merged.scale.copy(bodyMesh.scale);
  merged.frustumCulled = false; merged.castShadow = true; merged.receiveShadow = true;
  const parent = bodyMesh.parent!;
  parent.add(merged);
  merged.updateMatrixWorld(true);
  merged.bind(new Skeleton(bones, inverses), bodyMesh.bindMatrix);
  for (const m of ch.meshes as Mesh[]) m.parent?.remove(m);
  const sk = merged.skeleton;
  const built: NpcBuilt = { mesh: merged, dispose() { geo.dispose(); sk.dispose(); } };
  (ch as CharInstance & { __npc?: NpcBuilt }).__npc = built;
  return built;
}
