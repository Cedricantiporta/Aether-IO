// Town NPCs (shared KayKit GLTFs cloned per NPC, tinted / scaled / props in hand), wandering animals and the
// projection of speech-bubble anchors to screen space (the DOM layer ui/hud/SpeechBubbles.tsx does the drawing).
import { CanvasTexture, SRGBColorSpace, SpriteMaterial } from 'three';
import { questNpc } from '../engine/systems/npcQuestLogic';
import { eggReady, catHidden } from '../engine/systems/village';
import { NESTS, HIDDEN_CAT } from '../engine/townData';
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AnimationAction, AnimationMixer, BufferGeometry, Color, Group, InstancedMesh, LoopOnce, Mesh, MeshBasicMaterial, SkinnedMesh, Sprite, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { world } from '../engine/world';
import { NPCS, ANIMALS } from '../engine/townData';
import { npcs, animals, bubbles } from '../engine/systems/npcs';
import { STORY } from '../story';
import { useGameStore } from '../store';
import { npcMarkers } from '../engine/systems/npcQuestLogic';
import { GB, angleLerp, litMat, setInst } from './util';
import { useCharacterInstance, useClips } from './characters';
import { HANDSLOT_QUAT } from './weapons';
import { labelMaterial } from './label';
import type { NpcProp } from '../engine/townData';

// ------------------------------------------------------------------- props ---
const propMat = litMat({ roughness: 0.7 });
const propGlow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.6, 1.4, 1.1) });
const propCache = new Map<NpcProp, { b: BufferGeometry; g: BufferGeometry }>();
function propGeo(kind: NpcProp) {
  let p = propCache.get(kind);
  if (p) return p;
  const b = new GB([0.85, 1.05]), g = new GB([1, 1]);
  if (kind === 'staff') { b.cyl(0.035, 0.04, 1.7, 6, [0, 0.2, 0], '#6e4b2b'); b.sph(0.1, [0, 1.1, 0], '#8a5a30', 1, 5); g.octa(0.1, [0, 1.12, 0], '#9ad8ff'); }
  else if (kind === 'hammer') { b.cyl(0.035, 0.04, 1.0, 6, [0, 0.15, 0], '#6e4b2b'); b.box(0.34, 0.2, 0.2, [0, 0.7, 0], '#6e7480'); }
  else if (kind === 'basket') { b.cyl(0.2, 0.15, 0.2, 8, [0, 0.05, 0], '#b88a4e'); b.torus(0.17, 0.02, [0, 0.2, 0], '#8a5a30', [0, 0, 0], 1, 8, Math.PI); for (let i = 0; i < 3; i++) b.sph(0.07, [-0.07 + i * 0.07, 0.17, 0.02], ['#e0443a', '#ff9a2a', '#7ac04a'][i], 1, 4); }
  else if (kind === 'lantern') { b.box(0.14, 0.03, 0.14, [0, 0.0, 0], '#2a2a2e'); b.box(0.14, 0.03, 0.14, [0, 0.2, 0], '#2a2a2e'); g.box(0.1, 0.16, 0.1, [0, 0.1, 0], '#ffd070'); }
  else if (kind === 'spear') { b.cyl(0.03, 0.035, 2.0, 6, [0, 0.3, 0], '#6e4b2b'); b.cone(0.07, 0.3, 5, [0, 1.45, 0], '#c4cad4'); }
  p = { b: b.build(), g: g.build() };
  propCache.set(kind, p);
  return p;
}

const crownMat = litMat({ roughness: 0.3, metalness: 0.7, emissive: new Color('#7a5200'), emissiveIntensity: 0.6 });
let _crown: BufferGeometry | null = null;
/** King's crown: gold band, five spikes with red / blue gems (merged vertex-coloured geometry). */
function crownGeo(): BufferGeometry {
  if (_crown) return _crown;
  const b = new GB([0.9, 1.1]);
  b.cyl(0.19, 0.2, 0.1, 12, [0, 0, 0], '#ffd24a');
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; b.cone(0.045, 0.16, 4, [Math.cos(a) * 0.17, 0.12, Math.sin(a) * 0.17], '#ffd24a'); b.sph(0.03, [Math.cos(a) * 0.17, 0.21, Math.sin(a) * 0.17], i % 2 ? '#4aa8ff' : '#ff4a5a', 1, 4); }
  return (_crown = b.build());
}

// --------------------------------------------------------------------- npc ---
/** Quest markers above NPCs. Side quests are blue: "!" = new quest, "?" = ready to turn in, grey "?" = in progress
 *  (index = npcMarkers()). Index 4: the gold "!" of the main quest's current NPC (always wins). */
const MARKS = [null, labelMaterial('!', '#5fb8ff', { size: 120 }), labelMaterial('?', '#9aa0aa', { size: 120 }), labelMaterial('?', '#5fb8ff', { size: 120 }), labelMaterial('!', '#ffd24a', { size: 120 })];
const _p = new Vector3();
const WHITE = new Color(1, 1, 1);

/**
 * A KayKit character is ~8 skinned meshes (arms, legs, head, cape...) that share one texture atlas. Merging them into a single
 * SkinnedMesh on the same skeleton turns 8 draw calls (x2 with shadows) per NPC into 1. Falls back to the original meshes.
 */
/** True when both skinned meshes deform with exactly the same bones in the same order (vertex skin indices are then interchangeable). */
function sameSkin(a: SkinnedMesh, b: SkinnedMesh): boolean {
  const A = a.skeleton, B = b.skeleton;
  if (A === B) return true;
  if (A.bones.length !== B.bones.length) return false;
  for (let i = 0; i < A.bones.length; i++) if (A.bones[i] !== B.bones[i] || !A.boneInverses[i].equals(B.boneInverses[i])) return false;
  return true;
}

function mergeSkinned(ch: { meshes: Mesh[] }): Mesh[] {
  const sk = ch.meshes.filter((m) => (m as SkinnedMesh).isSkinnedMesh) as SkinnedMesh[];
  if (sk.length < 2 || sk.length !== ch.meshes.length) return ch.meshes;
  const map = (sk[0].material as any).map;
  // meshes must share atlas, parent AND bind matrix, otherwise merging would distort the pose (-> fall back to separate meshes)
  if (sk.some((m) => (m.material as any).map !== map || !m.geometry.attributes.skinIndex || m.parent !== sk[0].parent || !m.bindMatrix.equals(sk[0].bindMatrix) || !m.matrix.equals(sk[0].matrix) || !sameSkin(m, sk[0]))) return ch.meshes;
  const g = mergeGeometries(sk.map((m) => m.geometry), false);
  if (!g) return ch.meshes;
  const merged = new SkinnedMesh(g, sk[0].material);
  merged.frustumCulled = false; merged.castShadow = true; merged.receiveShadow = true;
  sk[0].parent!.add(merged);
  merged.bind(sk[0].skeleton, sk[0].bindMatrix);
  for (const m of sk) m.parent!.remove(m);
  return [merged];
}

function NpcActor({ i }: { i: number }) {
  const def = NPCS[i], st = npcs[i];
  const ch = useCharacterInstance(def.model);
  const clips = useClips();
  const group = useRef<Group>(null!), tag = useRef<Sprite>(null!), mark = useRef<Sprite>(null!), qicon = useRef<Sprite>(null!);
  const label = useMemo(() => labelMaterial(def.name, def.accent, { size: 46, plate: 'mini' }), [def]);
  const meshes = useRef<Mesh[]>(ch.meshes);
  const S = useRef({ mixer: null as AnimationMixer | null, idle: null as AnimationAction | null, walk: null as AnimationAction | null, talk: null as AnimationAction | null, w: 0, yaw: 0, wasTalking: false, tick: i, acc: 0, shadow: true, quest: false });

  useEffect(() => {
    if (!(ch as any).__merged) { (ch as any).__merged = mergeSkinned(ch); }
    meshes.current = (ch as any).__merged;
    // light tints only: blend the authored tint 45% towards white so the KayKit atlas stays bright and readable
    const tint = new Color(def.tint).lerp(WHITE, 0.45);
    ch.mats.forEach((m: any) => { if (m.color) m.color.copy(tint); });
    const m = new AnimationMixer(ch.root), s = S.current;
    // same proven clips as the hero (Idle_A / a regular Walking_A), so every NPC stands upright and walks normally
    const idleClip = clips['Idle_A'] || clips['Idle_B'];
    const walkClip = clips['Walking_A'] || clips['Walking_B'];
    s.idle = m.clipAction(idleClip); s.idle.play(); s.idle.time = Math.random() * 3;
    if (walkClip) { s.walk = m.clipAction(walkClip); s.walk.setEffectiveWeight(0); s.walk.play(); s.walk.timeScale = Math.max(0.7, (def.speed ?? 1.4) / 1.4); }
    s.talk = clips['Interact'] ? m.clipAction(clips['Interact']) : null;
    if (s.talk) { s.talk.setLoop(LoopOnce, 1); s.talk.clampWhenFinished = false; }
    s.mixer = m; s.yaw = st.yaw; s.w = 0;
    // prop in the right hand
    let propRoot: Group | null = null;
    if (def.prop !== 'none' && ch.handR) {
      const pg = propGeo(def.prop);
      propRoot = new Group();
      propRoot.quaternion.copy(HANDSLOT_QUAT);
      const a = new Mesh(pg.b, propMat), b = new Mesh(pg.g, propGlow);
      a.castShadow = true;
      propRoot.add(a, b);
      ch.handR.add(propRoot);
    }
    // gold crown on the head bone
    let crown: Mesh | null = null;
    const head = def.crown ? ch.root.getObjectByName('head') : null;
    if (head) { crown = new Mesh(crownGeo(), crownMat); crown.position.set(0, 0.34, 0.02); crown.scale.setScalar(1.3); head.add(crown); }
    return () => { m.stopAllAction(); m.uncacheRoot(ch.root); s.mixer = null; if (propRoot) ch.handR?.remove(propRoot); if (crown) head?.remove(crown); };
  }, [ch, clips, def, i, st]);

  useFrame((_, dt0) => {
    const g = group.current, s = S.current; if (!g || !s.mixer) return;
    const V = world.view;
    // world.view already carries a 6 unit margin; skinned meshes are never frustum-culled by three, so cull here
    const pd2 = (st.x - world.player.pos.x) ** 2 + (st.z - world.player.pos.z) ** 2;
    const vis = !V.on || (pd2 < 1200 && st.x >= V.minX + 1 && st.x <= V.maxX - 1 && st.z >= V.minZ + 1 && st.z <= V.maxZ - 1);
    if (g.visible !== vis) g.visible = vis;
    if (!vis) { s.acc = 0; return; }
    const dt = Math.min(dt0, 0.05);
    // only nearby NPCs cast shadows (skinned shadow draws are the expensive part)
    const sh = pd2 < 324;
    if (sh !== s.shadow) { s.shadow = sh; for (const m of meshes.current) m.castShadow = sh; }
    g.position.set(st.x, def.y ?? 0, st.z);
    s.yaw = angleLerp(s.yaw, st.yaw, 1 - Math.exp(-9 * dt));
    g.rotation.y = s.yaw;
    s.w += ((st.moving ? 1 : 0) - s.w) * Math.min(1, dt * 8);
    if (s.walk) { s.walk.setEffectiveWeight(s.w + 1e-4); s.idle!.setEffectiveWeight(1 - s.w + 1e-4); }
    if (st.talking && !s.wasTalking && s.talk) s.talk.reset().setEffectiveWeight(2).play();
    s.wasTalking = st.talking;
    // animation LOD: far-away NPCs tick their mixer every 2nd / 3rd frame
    s.acc += dt;
    const every = pd2 > 400 ? 3 : pd2 > 144 ? 2 : 1;
    if (++s.tick % every === 0) { s.mixer.update(s.acc); s.acc = 0; }
    // quest marker (bobs gently, hidden while talking)
    if (mark.current) {
      const k = st.talking ? 0 : STORY[useGameStore.getState().story.step]?.npc === def.name ? 4 : npcMarkers()[i], mk = mark.current;
      if (k) {
        const l = MARKS[k]!;
        if (mk.material !== l.mat) { mk.material = l.mat; mk.scale.set(l.aspect * 1.3, 1.3, 1); }
        mk.position.y = 3.6 * def.scale + Math.sin(world.time * 3 + i) * 0.08;
      }
      if (mk.visible !== !!k) mk.visible = !!k;
    }
    // name tag only when close
    if (tag.current) { const on = pd2 < 100 && !st.talking; if (tag.current.visible !== on) tag.current.visible = on; }
    // quest icon beside the name while this NPC matters to an active quest (re-checked a few times a second)
    if (qicon.current) {
      if (s.tick % 20 === 0) s.quest = questNpc(def.name);
      const on = pd2 < 100 && !st.talking && !!s.quest; if (qicon.current.visible !== on) qicon.current.visible = on;
    }
  });

  return (
    <group ref={group} position={[st.x, def.y ?? 0, st.z]} visible={false}>
      {/* NPCs use the hero's scale (1) so they match the player's size */}
      <group scale={def.scale}><primitive object={ch.root} /></group>
      <sprite ref={mark} material={MARKS[1]!.mat} position={[0, 3.6 * def.scale, 0]} scale={[MARKS[1]!.aspect * 1.3, 1.3, 1]} visible={false} renderOrder={6} />
      <sprite ref={tag} material={label.mat} position={[0, 2.85 * def.scale, 0]} scale={[label.aspect * 0.5, 0.5, 1]} visible={false} />
      <sprite ref={qicon} material={questIconMat()} position={[-(label.aspect * 0.25) - 0.3, 2.85 * def.scale, 0]} scale={[0.46, 0.46, 1]} visible={false} />
    </group>
  );
}

// --------------------------------------------------------------- quest icon ---
let qMat: SpriteMaterial | null = null;
/** Small gold scroll icon (canvas) shown beside the name of quest NPCs. */
export function questIconMat(): SpriteMaterial {
  if (qMat) return qMat;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.lineJoin = 'round'; g.lineWidth = 6; g.strokeStyle = '#1a1208';
  const scroll = () => { g.beginPath(); g.roundRect(14, 10, 36, 44, 6); };
  scroll(); g.stroke(); g.fillStyle = '#f6dc8e'; scroll(); g.fill();
  g.fillStyle = '#c9962e'; g.fillRect(10, 8, 44, 8); g.fillRect(10, 48, 44, 8);
  g.fillStyle = '#7a5a20'; for (const y of [24, 31, 38]) g.fillRect(21, y, 22, 3);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace;
  qMat = new SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false });
  return qMat;
}

// ----------------------------------------------------------------- animals ---
function buildChicken(): BufferGeometry {
  const b = new GB([0.85, 1.05]);
  b.sph(0.26, [0, 0.34, 0], '#ffffff', [0.85, 0.95, 1.2], 7); b.sph(0.14, [0, 0.62, 0.22], '#ffffff', 1, 6);
  b.cone(0.05, 0.14, 4, [0, 0.6, 0.38], '#f0a030', [Math.PI / 2, 0, 0]); b.box(0.04, 0.1, 0.12, [0, 0.76, 0.2], '#e03a3a');
  b.box(0.06, 0.26, 0.26, [0, 0.46, -0.3], '#e8e8e8', [0.7, 0, 0]);
  b.cyl(0.015, 0.015, 0.2, 4, [-0.08, 0.1, 0.02], '#f0a030'); b.cyl(0.015, 0.015, 0.2, 4, [0.08, 0.1, 0.02], '#f0a030');
  b.sph(0.02, [0.07, 0.65, 0.3], '#1a1a1a', 1, 4); b.sph(0.02, [-0.07, 0.65, 0.3], '#1a1a1a', 1, 4);
  return b.build();
}
function buildCat(): BufferGeometry {
  const b = new GB([0.85, 1.05]);
  b.sph(0.22, [0, 0.3, 0], '#ffffff', [0.8, 0.85, 1.7], 7); b.sph(0.16, [0, 0.46, 0.38], '#ffffff', 1, 7);
  b.cone(0.06, 0.13, 4, [-0.09, 0.62, 0.38], '#ffffff'); b.cone(0.06, 0.13, 4, [0.09, 0.62, 0.38], '#ffffff');
  b.sph(0.025, [-0.06, 0.48, 0.53], '#2a2a2a', 1, 4); b.sph(0.025, [0.06, 0.48, 0.53], '#2a2a2a', 1, 4); b.sph(0.02, [0, 0.43, 0.54], '#e07a8a', 1, 4);
  b.cyl(0.035, 0.03, 0.5, 5, [0, 0.45, -0.52], '#ffffff', [-0.9, 0, 0]);
  for (const x of [-0.1, 0.1]) for (const z of [-0.22, 0.24]) b.cyl(0.04, 0.035, 0.22, 5, [x, 0.11, z], '#f2f2f2');
  return b.build();
}

function buildCow(): BufferGeometry {
  const b = new GB([0.82, 1.06]);
  b.box(0.9, 0.62, 1.55, [0, 0.95, 0], '#ffffff');                       // body
  for (const [x, z, s] of [[0.3, 0.3, 0.32], [-0.25, -0.35, 0.28], [0.1, -0.1, 0.2]] as number[][]) b.box(s, 0.05, s * 1.3, [x, 1.27, z], '#2a2420');   // spots
  b.box(0.5, 0.48, 0.55, [0, 1.15, 0.95], '#ffffff'); b.box(0.42, 0.24, 0.2, [0, 1.0, 1.25], '#f0b0a8');   // head + muzzle
  for (const s of [-1, 1]) { b.cone(0.05, 0.22, 5, [s * 0.2, 1.48, 0.95], '#e8dcc0', [0, 0, s * -0.6]); b.box(0.16, 0.08, 0.1, [s * 0.32, 1.25, 0.9], '#ffffff'); b.sph(0.04, [s * 0.14, 1.22, 1.23], '#1a1a1a', 1, 4); }
  for (const x of [-0.3, 0.3]) for (const z of [-0.55, 0.55]) b.cyl(0.09, 0.08, 0.66, 6, [x, 0.33, z], '#e8e8e8');
  b.cyl(0.03, 0.02, 0.6, 4, [0, 1.0, -0.9], '#ffffff', [0.5, 0, 0]); b.sph(0.12, [0, 0.62, 0.2], '#f0b0a8', [1.2, 0.6, 1.2], 6);   // tail, udder
  return b.build();
}
/** Egg nests in front of the coop (an egg shows when one is ready) + Pip's hidden cat while her quest is on. */
function FarmBits() {
  const geos = useMemo(() => {
    const n = new GB([0.8, 1.05]); n.cyl(0.42, 0.34, 0.16, 10, [0, 0.08, 0], '#c9a050'); n.cyl(0.3, 0.3, 0.05, 10, [0, 0.16, 0], '#8a6a30');
    const e = new GB([0.85, 1.1]); e.sph(0.12, [0, 0.27, 0], '#fff6e6', [0.85, 1.15, 0.85], 7);
    return { nest: n.build(), egg: e.build(), cat: buildCat() };
  }, []);
  const mat = useMemo(() => litMat({ roughness: 0.9 }), []);
  const catMat = useMemo(() => litMat({ roughness: 0.9, color: '#ff9a4a' }), []);
  const eggs = useRef<(Mesh | null)[]>([]), cat = useRef<Mesh>(null!);
  useFrame(({ clock }) => {
    for (let k = 0; k < NESTS.length; k++) { const m = eggs.current[k]; if (m) m.visible = eggReady(k); }
    if (cat.current) { cat.current.visible = catHidden(); cat.current.rotation.y = 2.2 + Math.sin(clock.elapsedTime * 0.7) * 0.4; }
  });
  return (
    <>
      {NESTS.map(([x, z], k) => (
        <group key={k} position={[x, 0, z]}>
          <mesh geometry={geos.nest} material={mat} receiveShadow />
          <mesh ref={(m) => { eggs.current[k] = m; }} geometry={geos.egg} material={mat} />
        </group>
      ))}
      <mesh ref={cat} geometry={geos.cat} material={catMat} position={[HIDDEN_CAT.x, 0, HIDDEN_CAT.z]} scale={1.25} visible={false} castShadow />
    </>
  );
}

function Animals() {
  const chickens = useRef<InstancedMesh>(null!), cats = useRef<InstancedMesh>(null!), cows = useRef<InstancedMesh>(null!);
  const geos = useMemo(() => ({ chicken: buildChicken(), cat: buildCat(), cow: buildCow() }), []);
  const mat = useMemo(() => litMat({ roughness: 0.9 }), []);
  const idx = useMemo(() => {
    let c = 0, k = 0, w = 0;
    return ANIMALS.map((a) => (a.kind === 'CHICKEN' ? c++ : a.kind === 'COW' ? w++ : k++));
  }, []);
  const counts = useMemo(() => ({ c: ANIMALS.filter((a) => a.kind === 'CHICKEN').length, k: ANIMALS.filter((a) => a.kind === 'CAT').length, w: ANIMALS.filter((a) => a.kind === 'COW').length }), []);
  const meshOf = (kind: string) => (kind === 'CHICKEN' ? chickens.current : kind === 'COW' ? cows.current : cats.current);
  useEffect(() => {
    const col = new Color();
    ANIMALS.forEach((a, i) => { const m = meshOf(a.kind); m.setColorAt(idx[i], col.set(a.tint)); });
    if (cows.current.instanceColor) cows.current.instanceColor.needsUpdate = true;
    if (chickens.current.instanceColor) chickens.current.instanceColor.needsUpdate = true;
    if (cats.current.instanceColor) cats.current.instanceColor.needsUpdate = true;
    return () => { geos.chicken.dispose(); geos.cat.dispose(); geos.cow.dispose(); mat.dispose(); };
  }, [geos, mat, idx]);
  useFrame(() => {
    for (let i = 0; i < animals.length; i++) {
      const a = animals[i], d = ANIMALS[i], m = meshOf(d.kind);
      if (!m) continue;
      const bob = a.moving ? Math.abs(Math.sin(a.hop)) * (d.kind === 'CHICKEN' ? 0.07 : 0.03) : 0;
      const peck = !a.moving && d.kind === 'CHICKEN' ? Math.max(0, Math.sin(a.hop * 2.4)) ** 3 * 0.55 : 0;
      setInst(m, idx[i], a.x, bob, a.z, a.yaw, d.kind === 'CHICKEN' ? 1.15 : d.kind === 'COW' ? 1.1 : 1.2, undefined, undefined, peck);
    }
    chickens.current.instanceMatrix.needsUpdate = true; cats.current.instanceMatrix.needsUpdate = true; cows.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh ref={chickens} args={[geos.chicken, mat, counts.c]} frustumCulled={false} castShadow />
      <instancedMesh ref={cats} args={[geos.cat, mat, counts.k]} frustumCulled={false} castShadow />
      <instancedMesh ref={cows} args={[geos.cow, mat, counts.w]} frustumCulled={false} castShadow />
      <FarmBits />
    </>
  );
}

// ------------------------------------------------------- bubble projection ---
/** Writes the screen position of each active bubble (read by the DOM overlay in its own rAF). */
function BubbleProjector() {
  useFrame(({ camera, size }) => {
    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i]; if (!b.active) continue;
      const n = npcs[b.npc];
      _p.set(n.x, 2.8 * (NPCS[b.npc].scale || 1) + (NPCS[b.npc].y ?? 0), n.z).project(camera);
      b.sx = (_p.x * 0.5 + 0.5) * size.width; b.sy = (-_p.y * 0.5 + 0.5) * size.height;
      b.onScreen = _p.z < 1 && _p.x > -1.05 && _p.x < 1.05 && _p.y > -1.05 && _p.y < 1.05;
    }
  });
  return null;
}

/** `area` picks which cast is mounted: the town's villagers (+ animals) or the castle court. */
export function Npcs({ area = 'TOWN' }: { area?: 'TOWN' | 'CASTLE' }) {
  return (
    <>
      {NPCS.map((d, i) => ((d.area ?? 'TOWN') === area ? <NpcActor key={i} i={i} /> : null))}
      {area === 'TOWN' && <Animals />}
      <BubbleProjector />
    </>
  );
}
