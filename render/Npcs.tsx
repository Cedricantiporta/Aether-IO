// Town NPCs (shared KayKit GLTFs cloned per NPC, tinted / scaled / props in hand), wandering animals and the
// projection of speech-bubble anchors to screen space (the DOM layer ui/hud/SpeechBubbles.tsx does the drawing).
import { CanvasTexture, SRGBColorSpace, SpriteMaterial } from 'three';
import { liftAt } from './lift';
import { questNpc } from '../engine/systems/npcQuestLogic';
import { eggReady, pinHidden } from '../engine/systems/village';
import { NESTS, WHEEL_PIN } from '../engine/townData';
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AnimationAction, AnimationMixer, BufferGeometry, Color, Group, InstancedMesh, LoopOnce, Mesh, Object3D, MeshBasicMaterial, Sprite, Vector3 } from 'three';
import { world } from '../engine/world';
import { NPCS, ANIMALS } from '../engine/townData';
import { npcs, animals, bubbles, npcInStory } from '../engine/systems/npcs';
import { STORY } from '../story';
import { bagCount } from '../npcQuests';
import { useGameStore } from '../store';
import { canTrainSkill, canBuyTalent, canCraftAny } from '../ui/lib/alerts';
import { npcMarkers } from '../engine/systems/npcQuestLogic';
import { GB, angleLerp, litMat, setInst } from './util';
import { Horses } from './Horses';
import { KitAnimals } from './KitAnimals';
import { disposeMerged, mergeCharacter, useCharacterInstance, useClips } from './characters';
import { HANDSLOT_QUAT } from './weapons';
import { labelMaterial } from './label';
import type { NpcProp } from '../engine/townData';
import { liveStep } from '../questUnlocks';

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

/** Clothing overlays (king's cape, priest's robe + mitre), white / coloured vertex colours tinted per NPC. */
const clothMat = litMat({ roughness: 0.85 });
function capeGeo(col: string): BufferGeometry {   // on the chest bone: shoulders to the ankles, flaring out behind
  const b = new GB([0.75, 1.05]);
  b.sph(0.4, [0, 0.02, 0], col, [1.05, 0.38, 0.8], 12);                                    // red mantle over the shoulders (reads from the front)
  b.box(0.62, 0.08, 0.3, [0, 0.12, -0.08], '#f2efe6');                                     // ermine collar
  b.cone(0.62, 1.55, 10, [0, -0.62, -0.2], col, [0.12, 0, 0], [1, 1, 0.42]);                  // the cape
  return b.build();
}
function robeGeo(col: string): BufferGeometry {    // on the hips bone: a long robe to the floor
  const b = new GB([0.82, 1.08]);
  b.cyl(0.3, 0.5, 0.95, 12, [0, -0.32, 0], col);
  b.cyl(0.31, 0.31, 0.36, 12, [0, 0.32, 0], col);
  b.box(0.08, 1.2, 0.02, [0, -0.1, 0.33], '#d8b45a', [0.18, 0, 0]);                          // gold stole down the front
  return b.build();
}
function mitreGeo(col: string): BufferGeometry {
  const b = new GB([0.85, 1.08]);
  b.cyl(0.2, 0.22, 0.12, 12, [0, 0, 0], col);
  b.box(0.36, 0.42, 0.16, [0, 0.24, 0], col); b.cone(0.2, 0.2, 4, [0, 0.52, 0], col, [0, Math.PI / 4, 0], [1, 1, 0.45]);
  b.box(0.05, 0.5, 0.17, [0, 0.26, 0.002], '#d8b45a');                                       // gold band
  return b.build();
}

/** Villager hair (on the head bone): a cap over the crown; long hair adds a fall down the back. */
function hairGeo(col: string, long: boolean): BufferGeometry {
  const b = new GB([0.85, 1.08]);
  b.sph(0.6, [0, 0.72, -0.1], col, [1.04, 0.62, 1.0], 12);
  for (const sx of [-1, 1]) b.sph(0.22, [sx * 0.46, 0.5, -0.12], col, [0.7, 1.2, 1], 7);   // side locks
  if (long) { b.box(0.86, 0.9, 0.24, [0, 0.2, -0.42], col); b.sph(0.4, [0, -0.2, -0.42], col, [1.1, 0.8, 0.5], 8); }
  return b.build();
}
/** Villager tunic (on the chest bone): a plain shirt + belt; the hips get a short skirt / trouser band. */
function tunicGeo(col: string): BufferGeometry {
  const b = new GB([0.8, 1.06]);
  b.cyl(0.36, 0.4, 0.62, 12, [0, -0.06, 0], col, [0, 0, 0], [1, 1, 0.82]);
  b.cyl(0.41, 0.41, 0.08, 12, [0, -0.36, 0], '#5a3a22', [0, 0, 0], [1, 1, 0.84]);
  return b.build();
}

// --------------------------------------------------------------------- npc ---
/** Main-quest marker for an NPC (0 none, 4 gold "!", 5 gold "?" delivery ready, 6 dim "?" delivery pending); the
 *  delivery check reads the bag only a few times a second (cached by store identity). */
let mmInv: unknown = null, mmStep = -1, mmReady = false;
function mainMark(name: string): number {
  const st = useGameStore.getState(), step = liveStep(st);
  if (!step || step.npc !== name) return 0;
  if (!step.deliver) return 4;
  if (st.inventory !== mmInv || st.story.step !== mmStep) { mmInv = st.inventory; mmStep = st.story.step; mmReady = bagCount(st.inventory, step.deliver.id) >= step.deliver.count; }
  return mmReady ? 5 : 6;
}
/** Quest markers above NPCs. Side quests are blue: "!" = new quest, "?" = ready to turn in, grey "?" = in progress
 *  (index = npcMarkers()). Index 4: the gold "!" of the main quest's current NPC (always wins); a main-quest delivery
 *  shows a gold "?" (5) once the goods are in the bag, a dim gold "?" (6) while they are still being gathered. */
const MARKS = [null, labelMaterial('!', '#5fb8ff', { size: 120 }), labelMaterial('?', '#9aa0aa', { size: 120 }), labelMaterial('?', '#5fb8ff', { size: 120 }), labelMaterial('!', '#ffd24a', { size: 120 }), labelMaterial('?', '#ffd24a', { size: 120 }), labelMaterial('?', '#a08a50', { size: 120 })];
const _p = new Vector3();
const WHITE = new Color(1, 1, 1);

function NpcActor({ i }: { i: number }) {
  const def = NPCS[i], st = npcs[i];
  const ch = useCharacterInstance(def.model);
  const clips = useClips();
  const group = useRef<Group>(null!), tag = useRef<Sprite>(null!), mark = useRef<Sprite>(null!), qicon = useRef<Sprite>(null!);
  const dot = useGameStore((s) => def.opens === 'SKILLS' ? canTrainSkill(s) || canBuyTalent(s) : def.opens === 'BLACKSMITH' ? canCraftAny(s) : false);   // red dot: something to do here
  const label = useMemo(() => labelMaterial(def.name, def.accent, { size: 46, dot }), [def, dot]);
  const meshes = useRef<Mesh[]>(ch.meshes);
  const S = useRef({ mixer: null as AnimationMixer | null, idle: null as AnimationAction | null, walk: null as AnimationAction | null, talk: null as AnimationAction | null, w: 0, yaw: 0, wasTalking: false, tick: i, acc: 0, shadow: true, quest: false });

  useEffect(() => () => disposeMerged(ch), [ch]);
  useEffect(() => {
    if (def.noHat) for (const m of ch.meshes) if (/hat|helm|hood|cap|crown|visor/i.test(m.name.split("_").pop() ?? "")) m.visible = false;   // (merging then keeps the parts separate)
    if (def.noCape) for (const m of ch.meshes) if (/cape|quiver|mask/i.test(m.name)) m.visible = false;
    meshes.current = mergeCharacter(ch);   // 1 draw call per NPC instead of 7-9
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
    if (head) { crown = new Mesh(crownGeo(), crownMat); crown.position.set(0, def.noHat ? 0.92 : 0.34, 0.02); crown.scale.setScalar(def.noHat ? 2.7 : 1.3); head.add(crown); }   // (a big gold crown)
    const extra: [Object3D, Mesh][] = [];
    const wear = (bone: string, geo: BufferGeometry, x = 0, y = 0, z = 0, sc = 1) => { const b = ch.root.getObjectByName(bone); if (!b) return; const mm = new Mesh(geo, clothMat); mm.position.set(x, y, z); mm.scale.setScalar(sc); mm.castShadow = true; b.add(mm); extra.push([b, mm]); };
    if (def.cape) wear('chest', capeGeo(def.cape), 0, 0.2, -0.05, 1.25);
    if (def.robe) wear('hips', robeGeo(def.robe), 0, 0, 0, 1.25);
    if (def.mitre) wear('head', mitreGeo(def.mitre), 0, 0.86, 0, 1.9);
    if (def.hair) wear('head', hairGeo(def.hair, !!def.longHair), 0, 0, 0, 1);
    if (def.tunic) wear('chest', tunicGeo(def.tunic), 0, 0, 0, 1.25);
    return () => { m.stopAllAction(); m.uncacheRoot(ch.root); s.mixer = null; if (propRoot) ch.handR?.remove(propRoot); if (crown) head?.remove(crown); for (const [b, mm] of extra) { b.remove(mm); mm.geometry.dispose(); } };
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
    g.position.set(st.x, def.y ?? (def.area ? 0 : liftAt(st.x, st.z)), st.z);
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
      const k = st.talking ? 0 : mainMark(def.name) || npcMarkers()[i], mk = mark.current;
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
      <sprite ref={mark} material={MARKS[1]!.mat} position={[0, 3.95 * def.scale, 0]} scale={[MARKS[1]!.aspect * 1.3, 1.3, 1]} visible={false} renderOrder={6} />
      <sprite ref={tag} material={label.mat} position={[0, 2.85 * def.scale, 0]} scale={[label.aspect * 0.78, 0.78, 1]} visible={false} />   {/* (owner) as big as the hero's name */}
      <sprite ref={qicon} material={questIconMat()} position={[-(label.aspect * 0.39) - 0.4, 2.85 * def.scale, 0]} scale={[0.62, 0.62, 1]} visible={false} />
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
// (the animals themselves are nature_kit_v1 round animals, render/KitAnimals.tsx; the AI is engine/systems/npcs.ts)
/** Bubble anchor height per animal (petting lines). */
const ANIMAL_BUBBLE_Y: Record<string, number> = { CHICKEN: 1.6, CAT: 1.5, COW: 2.6, HORSE: 3.0, SHEEP: 2.2, PIG: 1.8, DOG: 1.7, DUCK: 1.4 };
/** Egg nests (spread over the free-range grass east of the pen) (an egg shows when one is ready) + Pip's wheel-pin mate: Corin's lost wheel pin (Biscuit the cat is a KitAnimals instance). */
function FarmBits() {
  const geos = useMemo(() => {
    const e = new GB([0.85, 1.1]); e.sph(0.3, [0, 0.34, 0], '#fff6e6', [0.85, 1.15, 0.85], 10);   // (owner 2026-10-31) no nest: just a big egg lying on the grass
    const pn = new GB([0.9, 1.1]); pn.cyl(0.07, 0.07, 0.62, 6, [0, 0.07, 0], '#c8ccd4', [0, 0, Math.PI / 2]); pn.cyl(0.13, 0.13, 0.06, 8, [0.33, 0.07, 0], '#e8ecf2', [0, 0, Math.PI / 2]);   // Corin's wheel pin, lying in the grass
    return { egg: e.build(), pin: pn.build() };
  }, []);
  const mat = useMemo(() => litMat({ roughness: 0.9 }), []);
  const pinMat = useMemo(() => litMat({ roughness: 0.25, metalness: 0.8, emissive: new Color('#fff2c0'), emissiveIntensity: 0.35 }), []);
  const eggs = useRef<(Mesh | null)[]>([]), pin = useRef<Mesh>(null!);
  useFrame(({ clock }) => {
    for (let k = 0; k < NESTS.length; k++) { const m = eggs.current[k]; if (m) m.visible = eggReady(k); }
    if (pin.current) { pin.current.visible = pinHidden(); pinMat.emissiveIntensity = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 4)); }   // glints
  });
  return (
    <>
      {NESTS.map(([x, z], k) => (
        <group key={k} position={[x, 0, z]}>
          <mesh ref={(m) => { eggs.current[k] = m; }} geometry={geos.egg} material={mat} castShadow />
        </group>
      ))}
      <mesh ref={pin} geometry={geos.pin} material={pinMat} position={[WHEEL_PIN.x, 0, WHEEL_PIN.z]} rotation={[0, 0.7, 0]} scale={1.4} visible={false} />
    </>
  );
}

function Animals() {
  return (
    <>
      <React.Suspense fallback={null}><KitAnimals /></React.Suspense>
      <Horses />
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
      if (b.animal >= 0) { const a = animals[b.animal]; _p.set(a.x, ANIMAL_BUBBLE_Y[ANIMALS[b.animal].kind] ?? 1.4, a.z).project(camera); }
      else { const n = npcs[b.npc]; _p.set(n.x, 2.8 * (NPCS[b.npc].scale || 1) + (NPCS[b.npc].y ?? liftAt(n.x, n.z)), n.z).project(camera); }
      b.sx = (_p.x * 0.5 + 0.5) * size.width; b.sy = (-_p.y * 0.5 + 0.5) * size.height;
      b.onScreen = _p.z < 1 && _p.x > -1.05 && _p.x < 1.05 && _p.y > -1.05 && _p.y < 1.05;
    }
  });
  return null;
}

/** `area` picks which cast is mounted: the town's villagers (+ animals) or the castle court. */
export function Npcs({ area = 'TOWN', deep = false }: { area?: 'TOWN' | 'CASTLE' | 'CAVE' | 'CHURCH' | 'TAVERN'; deep?: boolean }) {
  useGameStore((s) => s.story.step);   // story-gated NPCs (the King / the Queen) swap when the chain moves on
  return (
    <>
      {NPCS.map((d, i) => ((d.area ?? 'TOWN') === area && !!d.deep === deep && npcInStory(i) ? <NpcActor key={i} i={i} /> : null))}
      {area === 'TOWN' && <Animals />}
      <BubbleProjector />
    </>
  );
}
