// The three shops: procedural buildings, signs, shopkeepers, interaction rings, ambient FX.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, AnimationAction, AnimationMixer, Color, DoubleSide, Group, LoopOnce, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight, RingGeometry, Sprite,
} from 'three';
import { SHOP_TAB, SHOP_POSITIONS } from '../constants';
import { world, TRAINER_POS } from '../engine/world';
import { isLobbyStatus } from './CameraRig';
import { GameStatus } from '../types';
import { useGameStore } from '../store';
import { canTrainSkill, canBuyTalent, canCraftAny } from '../ui/lib/alerts';
import { CELL, FX, embers, smokePuff } from './fx';
import { GB, glowMat, litMat, TAU, angleLerp, damp } from './util';
import { disposeMerged, mergeCharacter, useCharacterInstance, useClips, CharKey } from './characters';
import { labelMaterial } from './label';
import { QualityCfg } from './quality';
import { ROYAL_ROOF, TOWN_GOLD } from './townPalette';
import { KIT_SHOPS, SHOP_CHIMNEY } from './townKit';
import { TownScenery } from './TownScenery';
import { Rockfall } from './Rockfall';
import { TownGates } from './TownGates';
import { Stable } from './Stable';
import { Npcs } from './Npcs';
import { walkAndOpen, walkTo } from '../engine/systems/village';
import { TOWER, TOWER_KNOLL, PORTAL, PORTAL_S, PLAZA_DECOR, HERO_HOUSE, townLift } from '../engine/townData';
import { useUiStore } from '../ui/uiStore';
import { nightGlow } from './biomeLook';
import { Beach } from './Beach';

type ShopType = 'SUPPLIES' | 'BLACKSMITH' | 'PETS' | 'ARMORY' | 'FORTUNE' | 'WAREHOUSE' | 'TECH' | 'BREWER' | 'FISH' | 'MINE';

// ---------------------------------------------------------------- builders ---
function lantern(b: GB, g: GB, x: number, y: number, z: number) {
  b.box(0.06, 0.55, 0.06, [x, y + 0.35, z], '#2a2a2e'); b.box(0.26, 0.05, 0.26, [x, y + 0.1, z], '#2a2a2e'); b.box(0.26, 0.05, 0.26, [x, y - 0.22, z], '#2a2a2e');
  g.sph(0.15, [x, y - 0.06, z], '#ffd070', 1, 6);
}
/** Plain (unstriped) cloth awning. */
function stripedAwning(b: GB, x0: number, x1: number, y: number, z: number, c1: string, c2: string) {
  const n = Math.round((x1 - x0) / 0.9);
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) b.box(w, 0.1, 1.7, [x0 + w * (i + 0.5), y, z], i % 2 ? c1 : c2, [0.42, 0, 0]);
  for (let i = 0; i < n; i++) b.box(w, 0.28, 0.06, [x0 + w * (i + 0.5), y - 0.62, z + 0.72], i % 2 ? c1 : c2);
}
function pole(b: GB, x: number, z: number, h: number, c = '#6e4b2b') { b.box(0.22, h, 0.22, [x, h / 2, z], c); }

/** Every shop building is a Blender kit piece: town_kit_v2 shop_stall_house for all but the Elixir Brewer (nature_kit_v1 brewer_hut), placed by render/townKit.tsx /
 *  render/NatureScenery.tsx; the Shop below adds the sign, keeper, name tags and FX. */
const TITLES: Record<ShopType, string> = { SUPPLIES: 'Potion Merchant', BLACKSMITH: 'Blacksmith', PETS: 'Pet Merchant', ARMORY: 'Armor Merchant', FORTUNE: 'Fortune Teller', WAREHOUSE: 'Warehouse Keeper', TECH: 'Tinkerer', BREWER: 'Elixir Brewer', FISH: 'Fishmonger', MINE: 'Mining Supplier' };
/** (owner) shopkeepers have their own names: the name tag shows the role on top, the name below. */
const KEEPER: Record<ShopType, string> = { SUPPLIES: 'Rosalind', BLACKSMITH: 'Brakk', PETS: 'Jev', ARMORY: 'Hald', FORTUNE: 'Madame Zora', WAREHOUSE: 'Otto', TECH: 'Quill', BREWER: 'Nessa', FISH: 'Salty Pell', MINE: 'Durgan' };
type NpcCfg = { key: CharKey; tint: string; pos: [number, number] };
/** Shop-local door the keeper runs to when the siege starts. */
const DOOR: Record<ShopType, [number, number]> = { SUPPLIES: [-2, 2.6], BLACKSMITH: [-2, 2.6], PETS: [-2, 2.6], ARMORY: [-2, 2.6], FORTUNE: [-2, 2.6], WAREHOUSE: [-2, 2.6], TECH: [-2, 2.6], BREWER: [0.3, 2.3], FISH: [-2, 2.6], MINE: [-2, 2.6] };
const NPC: Record<ShopType, NpcCfg> = {
  // (kit shops: the keeper stands just outside the awning, right of the door, so the camera always sees him; the counter is behind him)
  SUPPLIES: { key: 'ROGUE', tint: '#ffffff', pos: [1.0, 4.9] },
  BLACKSMITH: { key: 'KNIGHT', tint: '#ffffff', pos: [1.0, 4.9] },
  PETS: { key: 'ROGUE', tint: '#bfffcf', pos: [1.0, 4.9] },
  ARMORY: { key: 'KNIGHT', tint: '#e8e0d0', pos: [1.0, 4.9] },
  FORTUNE: { key: 'WIZARD', tint: '#e6dcff', pos: [1.0, 4.9] },
  WAREHOUSE: { key: 'ROGUE', tint: '#f0dcc0', pos: [1.0, 4.9] },
  TECH: { key: 'WIZARD', tint: '#cfe6ff', pos: [1.0, 4.9] },
  BREWER: { key: 'WIZARD', tint: '#d8f5d0', pos: [0.7, 3.9] },    // in front of the hut's door, by the little cauldron
  FISH: { key: 'ROGUE', tint: '#cfe4f0', pos: [1.0, 4.9] },       // (kit shop: outside the awning, right of the door)
  MINE: { key: 'BARBARIAN', tint: '#e8d2b0', pos: [1.0, 4.9] },
};
/** Bubbling liquid disc of the shops with a cauldron: shop-local [x, y, z, radius]. */
const CAULDRON: Partial<Record<ShopType, [number, number, number, number]>> = { BREWER: [-1.5, 0.8, 2.7, 0.34] };

// -------------------------------------------------------------------- signs ---
function buildSign(type: ShopType, color: string) {
  const b = new GB([0.85, 1.05]), g = new GB([1, 1]);
  b.box(2.0, 1.3, 0.16, [0, 0, 0], '#7a5230'); b.box(1.75, 1.05, 0.14, [0, 0, 0.03], '#e8d3a3');   // (back face inside the frame: no z-fighting on the sign's back)
  b.box(2.06, 0.1, 0.2, [0, 0.64, 0], '#4a3020'); b.box(2.06, 0.1, 0.2, [0, -0.64, 0], '#4a3020');
  b.cyl(0.015, 0.015, 0.5, 4, [-0.8, 0.9, 0], '#555'); b.cyl(0.015, 0.015, 0.5, 4, [0.8, 0.9, 0], '#555');
  if (type === 'SUPPLIES') {
    g.sph(0.3, [0, -0.1, 0.16], '#3fa8ff', [1, 1, 0.5], 8); g.cyl(0.1, 0.12, 0.32, 6, [0, 0.28, 0.16], '#8fd2ff');
    b.cyl(0.11, 0.11, 0.08, 6, [0, 0.47, 0.16], '#8a5a30');
    g.sph(0.06, [-0.1, 0.0, 0.3], '#ffffff', 1, 4);
  } else if (type === 'BLACKSMITH') {
    b.box(0.7, 0.2, 0.2, [0, -0.1, 0.17], '#555b66'); b.box(0.45, 0.22, 0.2, [0, -0.28, 0.17], '#555b66'); b.cone(0.12, 0.35, 4, [0.5, -0.04, 0.17], '#6e7480', [0, 0, -Math.PI / 2]);
    b.box(0.08, 0.7, 0.08, [-0.3, 0.2, 0.2], '#6a4828', [0, 0, 0.6]); b.box(0.3, 0.2, 0.14, [-0.4, 0.45, 0.2], '#888e98', [0, 0, 0.6]);
    g.box(0.5, 0.04, 0.06, [0, 0.03, 0.28], '#ff8a2a');
  } else if (type === 'ARMORY') {
    b.cyl(0.36, 0.36, 0.08, 12, [0, -0.05, 0.17], '#9aa2ae', [Math.PI / 2, 0, 0], [1, 1.2, 1]); b.box(0.08, 0.6, 0.04, [0, -0.05, 0.22], '#d9b56a'); b.box(0.5, 0.08, 0.04, [0, 0.05, 0.22], '#d9b56a');
  } else if (type === 'TECH') {
    b.cyl(0.32, 0.32, 0.1, 12, [0, -0.08, 0.17], '#c9a24a', [Math.PI / 2, 0, 0]); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; b.box(0.1, 0.1, 0.1, [Math.cos(a) * 0.36, -0.08 + Math.sin(a) * 0.36, 0.17], '#c9a24a'); }
    b.cyl(0.1, 0.1, 0.12, 8, [0, -0.08, 0.2], '#5b4a2a', [Math.PI / 2, 0, 0]);
  } else if (type === 'WAREHOUSE') {
    b.box(0.7, 0.55, 0.12, [0, -0.08, 0.17], '#9c7245'); b.box(0.74, 0.08, 0.14, [0, -0.08, 0.2], '#5a3d24'); b.box(0.08, 0.55, 0.14, [0, -0.08, 0.2], '#5a3d24');
  } else if (type === 'BREWER') {
    g.sph(0.24, [0, -0.14, 0.16], '#5fd35a', [1, 1, 0.5], 8); g.cyl(0.07, 0.09, 0.28, 6, [0, 0.18, 0.16], '#9be8a8'); b.cyl(0.09, 0.09, 0.07, 6, [0, 0.35, 0.16], '#8a5a30');
    g.sph(0.05, [-0.08, -0.06, 0.3], '#ffffff', 1, 4);
  } else if (type === 'FISH') {
    b.sph(0.26, [0.05, -0.08, 0.17], '#4fb6d8', [1.5, 0.75, 0.4], 7); b.cone(0.2, 0.3, 3, [-0.42, -0.08, 0.17], '#4fb6d8', [0, 0, Math.PI / 2], [1, 1, 0.35]);
    g.sph(0.04, [0.32, -0.02, 0.28], '#ffffff', 1, 4);
  } else if (type === 'MINE') {   // crossed pickaxes over a lantern-oil flask
    for (const sx of [-1, 1]) { b.box(0.07, 0.75, 0.05, [sx * 0.12, -0.02, 0.18], '#6a4828', [0, 0, sx * 0.75]); b.box(0.5, 0.1, 0.06, [sx * 0.3, 0.26, 0.2], '#5c6068', [0, 0, -sx * 0.35]); }
    g.sph(0.14, [0, -0.25, 0.22], '#ffb84a', [1, 1.1, 0.5], 7);
  } else if (type === 'FORTUNE') {
    g.sph(0.26, [0, -0.08, 0.17], '#b98aff', [1, 1, 0.5], 10); b.box(0.5, 0.1, 0.12, [0, -0.36, 0.17], '#d9b56a'); g.octa(0.08, [0.32, 0.24, 0.2], '#fff3c0');
  } else {
    g.sph(0.2, [0, -0.15, 0.16], '#2fd29a', [1.2, 1, 0.45], 7);
    for (const [x, y] of [[-0.3, 0.1], [-0.12, 0.28], [0.12, 0.28], [0.3, 0.1]]) g.sph(0.1, [x, y, 0.16], '#2fd29a', [1, 1.2, 0.45], 6);
  }
  const c = new Color(color);
  b.box(1.9, 0.06, 0.2, [0, 0.58, 0.02], '#' + c.getHexString());
  return { body: b.build(), glow: g.build() };
}

// ---------------------------------------------------------------------- NPC ---
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** `closed` is 0..1 (siege progress): the NPC runs to `door` and vanishes inside, and comes back out on reopen. */
function Shopkeeper({ cfg, door, near, closed, onOpen }: { cfg: NpcCfg; door: [number, number]; near: React.MutableRefObject<boolean>; closed: React.MutableRefObject<number>; onOpen: () => void }) {
  const ch = useCharacterInstance(cfg.key);
  const clips = useClips();
  const group = useRef<Group>(null!);
  const st = useRef({ mixer: null as AnimationMixer | null, interact: null as AnimationAction | null, run: null as AnimationAction | null, idle: null as AnimationAction | null, wasNear: false, yaw: 0, prevK: 0, runW: 0 });
  useEffect(() => () => disposeMerged(ch), [ch]);
  useEffect(() => {
    mergeCharacter(ch);   // 1 draw call instead of 7-9
    const m = new AnimationMixer(ch.root);
    const idle = m.clipAction(clips['Idle_A'] || clips['Idle_B']);
    idle.play(); idle.time = Math.random() * 2;
    const run = clips['Running_A'] ? m.clipAction(clips['Running_A']) : null;
    if (run) { run.setEffectiveWeight(0); run.play(); }
    const it = clips['Interact'] ? m.clipAction(clips['Interact']) : null;
    if (it) { it.setLoop(LoopOnce, 1); it.clampWhenFinished = false; }
    const tint = new Color(cfg.tint);
    ch.mats.forEach((mt: any) => mt.color && mt.color.copy(tint));
    st.current.mixer = m; st.current.interact = it; st.current.run = run; st.current.idle = idle;
    return () => { m.stopAllAction(); m.uncacheRoot(ch.root); };
  }, [ch, clips, cfg.tint]);
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05), s = st.current;
    s.mixer?.update(dt);
    const g = group.current; if (!g) return;
    const k = closed.current;
    const e = smooth(k);
    g.visible = k < 0.985;
    g.position.set(cfg.pos[0] + (door[0] - cfg.pos[0]) * e, 0, cfg.pos[1] + (door[1] - cfg.pos[1]) * e);
    const moving = Math.abs(k - s.prevK) > 1e-4 && k > 0.01 && k < 0.99;
    const dk = k - s.prevK;
    s.prevK = k;
    s.runW += ((moving ? 1 : 0) - s.runW) * Math.min(1, dt * 12);
    s.run?.setEffectiveWeight(s.runW); s.idle?.setEffectiveWeight(1 - s.runW + 1e-3);
    if (near.current && !s.wasNear && s.interact) { s.interact.reset().setEffectiveWeight(3).play(); }
    s.wasNear = near.current;
    const wp = g.parent!.position;
    let target = s.yaw;
    if (moving) target = Math.atan2((dk > 0 ? door[0] - cfg.pos[0] : cfg.pos[0] - door[0]), (dk > 0 ? door[1] - cfg.pos[1] : cfg.pos[1] - door[1]));
    else if (near.current) {   // face the hero (the shop group may be rotated: work in its local frame)
      const pr = g.parent!.rotation.y, c = Math.cos(pr), s2 = Math.sin(pr);
      const lx = c * (world.player.pos.x - wp.x) - s2 * (world.player.pos.z - wp.z), lz = s2 * (world.player.pos.x - wp.x) + c * (world.player.pos.z - wp.z);
      target = Math.atan2(lx - g.position.x, lz - g.position.z);
    }
    s.yaw = angleLerp(s.yaw, target, 1 - Math.exp(-8 * dt));
    g.rotation.y = s.yaw;
  });
  return (
    <group ref={group} position={[cfg.pos[0], 0, cfg.pos[1]]}>
      <primitive object={ch.root} />
      <mesh position={[0, 1.1, 0]} onClick={(e) => { e.stopPropagation(); onOpen(); }} onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
        <cylinderGeometry args={[0.7, 0.7, 2.4, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

// --------------------------------------------------------------------- shop ---
/** The shop sign's post + arm as one static geometry (the board itself sways); [right-hand, left-hand (brewer)]. */
const SIGN_POST = [1, -1].map((side) => { const b = new GB([1, 1]); b.box(0.22, 4.0, 0.22, [0, 2.0, 0], '#6e4b2b'); b.box(1.9, 0.16, 0.16, [0.9 * side, 3.85, 0], '#6e4b2b'); return b.build(); });

function Shop({ type, position, color, q, facing = 0 }: { type: ShopType; position: number[]; color: string; q: QualityCfg; facing?: number }) {
  const kit = KIT_SHOPS.has(type);   // body = town_kit_v2 shop_stall_house (render/townKit.tsx); the brewer's = nature_kit_v1 brewer_hut
  const sign = useMemo(() => buildSign(type, color), [type, color]);
  const mats = useMemo(() => ({
    lit: litMat({ roughness: 0.85 }),
    glow: nightGlow(new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.5, 1.35, 1.1) })),
    liquid: new MeshBasicMaterial({ color: new Color(0.6, 2.0, 0.7), toneMapped: false }),
  }), [color]);
  const craftDot = useGameStore((s) => type === 'BLACKSMITH' && canCraftAny(s));   // red dot: something can be forged
  const label = useMemo(() => { const l = labelMaterial(KEEPER[type], '#f6efe0', { size: 64, plate: 'plate', dot: craftDot }); l.mat.depthTest = false; return l; }, [type, color, craftDot]);   // drawn over roofs
  const role = useMemo(() => { const l = labelMaterial(TITLES[type], '#e9c46a', { size: 50, plate: 'mini' }); l.mat.depthTest = false; return l; }, [type]);
  const roleRef = useRef<Sprite>(null);
  const near = useRef(false);
  const closedK = useRef(0);
  const signRef = useRef<Group>(null!), titleRef = useRef<Sprite>(null!), light = useRef<PointLight>(null!), liquid = useRef<Mesh>(null!);
  const px = position[0], pz = position[2];
  const open = () => {
    const st = useGameStore.getState().status;
    if (st === GameStatus.MENU && useUiStore.getState().titleDone) walkAndOpen(px + Math.cos(facing) * NPC[type].pos[0] * 0.5 + Math.sin(facing) * 5.2, pz - Math.sin(facing) * NPC[type].pos[0] * 0.5 + Math.cos(facing) * 5.2, SHOP_TAB[type]);   // walk up to the counter first
    else if (st === GameStatus.PLAYING) useGameStore.getState().openSpecificShop(SHOP_TAB[type]);
  };

  useFrame(({ clock }, dt0) => {
    const dt = Math.min(dt0, 0.05), t = clock.elapsedTime;
    const status = useGameStore.getState().status;
    const lobby = isLobbyStatus(status) || status === GameStatus.GAME_OVER;
    closedK.current += (0 - closedK.current) * Math.min(1, dt * 2.2);
    if (closedK.current > 0.999) closedK.current = 1; else if (closedK.current < 0.001) closedK.current = 0;
    const closed = closedK.current > 0.5;
    const dx = world.player.pos.x - px, dz = world.player.pos.z - pz;
    const d = Math.hypot(dx, dz);
    near.current = !lobby && !closed && d < 6;
    if (signRef.current) signRef.current.rotation.z = Math.sin(t * 1.3 + px) * 0.05;
    if (titleRef.current) {   // the name tag rides on the shopkeeper (who walks to the door and in when the shop closes)
      const e = smooth(closedK.current), c = NPC[type].pos, dr = DOOR[type];
      titleRef.current.position.set(c[0] + (dr[0] - c[0]) * e, 3.45, c[1] + (dr[1] - c[1]) * e);
      titleRef.current.visible = closedK.current < 0.985;
      if (roleRef.current) { roleRef.current.position.set(titleRef.current.position.x, 4.2, titleRef.current.position.z); roleRef.current.visible = titleRef.current.visible; }
    }
    if (light.current) light.current.intensity = 14 + Math.sin(t * 9 + px) * 2 + Math.sin(t * 17) * 1.2;
    if (liquid.current) { const k = 1.4 + Math.sin(t * 4) * 0.35; mats.liquid.color.setRGB(0.5 * k, 1.8 * k, 0.6 * k); liquid.current.scale.y = 1 + Math.sin(t * 6) * 0.15; }
    // ambient emitters only when nearby (and not paused)
    if (d < 55 && useGameStore.getState().status !== GameStatus.PAUSED) {
      // (shop-local offsets are turned by the shop's yaw: the shops can face any way, owner 2026-10-21)
      const fc = Math.cos(facing), fs = Math.sin(facing), wx = (lx: number, lz: number) => px + lx * fc + lz * fs, wz = (lx: number, lz: number) => pz - lx * fs + lz * fc;
      if (type === 'SUPPLIES' && Math.random() < dt * 6) {
        const a = Math.random() * TAU, r = Math.random() * 0.55, ox = 1.9 + Math.cos(a) * r, oz = 3.7 + Math.sin(a) * r;
        FX.add.emit(wx(ox, oz), 1.6, wz(ox, oz), 0, 1.6, 0, 1.0, 0.18, 0.3, 0.6, 2.0, 0.7, 0.8, CELL.RING, 0, 0.5);
        if (Math.random() < 0.4) { const qx = 1.9 + (Math.random() - 0.5) * 0.8, qz = 3.7 + (Math.random() - 0.5) * 0.8; FX.add.emit(wx(qx, qz), 1.7, wz(qx, qz), 0, 2.2, 0, 1.6, 0.12, 0.02, 0.7, 2.0, 0.8, 0.9, CELL.DISC, -0.3, 0.2); }
        if (Math.random() < 0.5) { const a2 = Math.random() * TAU, r2 = Math.random() * 0.5, cx = -7.0 + Math.cos(a2) * r2, cz = 4.6 + Math.sin(a2) * r2; FX.add.emit(wx(cx, cz), 1.5, wz(cx, cz), 0, 1.2, 0, 1.0, 0.14, 0.3, 0.6, 2.0, 0.7, 0.8, CELL.RING, 0, 0.5); }   // (the cauldron's bubbles)
      } else if (type === 'BLACKSMITH') {
        const sx = wx(SHOP_CHIMNEY[0], SHOP_CHIMNEY[2]), sz = wz(SHOP_CHIMNEY[0], SHOP_CHIMNEY[2]);
        if (Math.random() < dt * 5) smokePuff(sx, SHOP_CHIMNEY[1] + 0.2, sz, 1, 0x6b6560, 1.8, 3.2, 1.4, 0.3, 0.5);
        if (Math.random() < dt * 1.6) embers(sx, SHOP_CHIMNEY[1], sz, 2, 0xffa040, 0.25, 2.2, 0.6, 0.12);   // sparks from the forge chimney
        if (Math.random() < dt * 2.2) embers(wx(-5.3, 0.8), 2.4, wz(-5.3, 0.8), 1, 0xff8a30, 0.2, 1.6, 0.5, 0.1);   // (and from the forge_furnace's stack)
      } else if (type === 'BREWER') {   // bubbles from the cauldron + green smoke from the chimney (shop-local -> world via the facing)
        const cf = Math.cos(facing), sf = Math.sin(facing);
        if (Math.random() < dt * 5) {
          const a = Math.random() * TAU, r = Math.random() * 0.3, lx = -1.5 + Math.cos(a) * r, lz = 2.7 + Math.sin(a) * r;
          FX.add.emit(px + lx * cf + lz * sf, 0.95, pz - lx * sf + lz * cf, 0, 1.2, 0, 1.0, 0.14, 0.3, 0.5, 2.0, 0.7, 0.8, CELL.RING, 0, 0.5);
        }
        if (Math.random() < dt * 2.5) smokePuff(px + 1.9 * cf - 1.3 * sf, 5.5, pz - 1.9 * sf - 1.3 * cf, 1, 0x7fbf7a, 1.4, 2.6, 1.2, 0.25, 0.45);
      } else if (type === 'PETS' && Math.random() < dt * 1.5) {
        { const ox = -0.9 + (Math.random() - 0.5) * 2, oz = 3 + Math.random(); FX.add.emit(wx(ox, oz), 2.6, wz(ox, oz), 0, 0.9, 0, 1.6, 0.35, 0.3, 0.5, 2.0, 1.1, 0.9, CELL.PLUS, 0, 0.1); }
      }
    }
  });

  const labelW = label.aspect * 0.78;   // name tag over the shopkeeper's head (owner: as big as the hero's name)
  const signSide = type === 'BREWER' || kit ? -1 : 1;   // (owner: the brewer's sign post stood on the tower path; it hangs on the other side)
  return (
    <group position={[px, 0, pz]} rotation={[0, facing, 0]}>
      {CAULDRON[type] && <mesh ref={liquid} material={mats.liquid} position={[CAULDRON[type]![0], CAULDRON[type]![1], CAULDRON[type]![2]]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[CAULDRON[type]![3], 12]} /></mesh>}
      <group position={kit ? [4.25, 0, 5.0] : [4.6, 0, 3.6]} scale={kit ? 1.5 : 1}>   {/* (kit shops: the sign stands in the gap between two shops, in front of the awnings) */}
        <mesh geometry={signSide > 0 ? SIGN_POST[0] : SIGN_POST[1]} material={mats.lit} castShadow />
        <group ref={signRef} position={[1.2 * signSide, 3.0, 0]}>
          <mesh geometry={sign.body} material={mats.lit} position={[0, -0.0, 0]} castShadow />
          <mesh geometry={sign.glow} material={mats.glow} />
        </group>
      </group>
      <sprite ref={roleRef} material={role.mat} renderOrder={5} position={[NPC[type].pos[0], 4.2, NPC[type].pos[1]]} scale={[role.aspect * 0.6, 0.6, 1]} />
      <sprite ref={titleRef} material={label.mat} renderOrder={5} position={[NPC[type].pos[0], 3.45, NPC[type].pos[1]]} scale={[labelW, 0.78, 1]} />
      {/* (owner: only the shopkeeper is clickable, not the building) */}
      <Shopkeeper cfg={NPC[type]} door={DOOR[type]} near={near} closed={closedK} onOpen={open} />
      {q.lights && <pointLight ref={light} position={[0, 3.6, 4.2]} color="#ffc47a" distance={14} decay={1.6} intensity={14} />}
    </group>
  );
}

// ------------------------------------------------- shrine + skill trainer ---
function buildShrine() {
  const b = new GB([0.85, 1.05]), g = new GB([1, 1]);
  b.cyl(2.0, 2.3, 0.35, 10, [0, 0.17, 0], '#6d6a76'); b.cyl(1.5, 1.7, 0.35, 10, [0, 0.52, 0], '#85828f'); b.cyl(0.9, 1.1, 1.0, 8, [0, 1.2, 0], '#9d9aa8'); b.cyl(1.15, 0.95, 0.2, 8, [0, 1.8, 0], '#b4b1c0');
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.78; b.box(0.35, 2.6, 0.35, [Math.cos(a) * 2.9, 1.3, Math.sin(a) * 2.9], '#7a7784'); g.octa(0.16, [Math.cos(a) * 2.9, 2.85, Math.sin(a) * 2.9], '#c58bff'); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.box(0.12, 0.05, 0.3, [Math.cos(a) * 1.25, 0.72, Math.sin(a) * 1.25], '#e9b949', [0, -a, 0]); }
  return { body: b.build(), glow: g.build() };
}
/** Skill Trainer: open-front striped training pavilion (rug, bench, scroll shelf, weapon wall) with straw dummies,
 *  a weapon rack, an archery target and hay bales out front. Faces +z (the north street). */
function buildTrainer() {
  const b = new GB([0.85, 1.05]), g = new GB([1, 1]);
  const wood = '#7a5230', dark = '#4a3020', canvas = '#efe4cc', red = '#a8352b', straw = '#d6b56a', steel = '#b8bcc6';
  const tz = -1.3, half = 2.4, poleH = 2.7;
  // floor: low wooden deck + rug
  b.box(5.4, 0.18, 5.2, [0, 0.09, tz], '#8a6a48');
  b.box(3.2, 0.03, 2.6, [0, 0.2, tz + 0.2], '#7a2a24'); b.box(2.8, 0.035, 2.2, [0, 0.21, tz + 0.2], '#b8873a');
  // poles + pyramid roof (cream canvas, red cap) + scalloped red / cream valance
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.09, 0.11, poleH, 6, [sx * half, poleH / 2, tz + sz * half], dark);
  b.cone(half * 1.5, 2.0, 4, [0, poleH + 1.0, tz], canvas, [0, Math.PI / 4, 0]);
  b.cone(half * 0.62, 0.83, 4, [0, poleH + 2.0 - 0.415 + 0.0, tz], red, [0, Math.PI / 4, 0]);
  b.cyl(0.04, 0.04, 0.9, 4, [0, poleH + 2.4, tz], dark); b.box(0.5, 0.32, 0.03, [0.27, poleH + 2.65, tz], red);
  for (let side = 0; side < 4; side++) {
    const ang = side * Math.PI / 2;
    for (let k = 0; k < 6; k++) {
      const u = -half + (k + 0.5) * (2 * half / 6);
      const lx = Math.cos(ang) * u - Math.sin(ang) * half * 1.02, lz = Math.sin(ang) * u + Math.cos(ang) * half * 1.02;
      b.box(2 * half / 6 + 0.02, 0.42, 0.05, [lx, poleH - 0.12, tz + lz], k % 2 ? canvas : red, [0, -ang, 0]);
    }
  }
  // back + side walls (sides tied half-open), front open
  b.box(2 * half, poleH - 0.3, 0.06, [0, (poleH - 0.3) / 2 + 0.18, tz - half], canvas);
  for (const sx of [-1, 1]) { b.box(0.06, poleH - 0.3, 2 * half * 0.55, [sx * half, (poleH - 0.3) / 2 + 0.18, tz - half * 0.45], canvas); b.box(0.12, 0.12, 0.5, [sx * half, 1.3, tz + 0.2], red); }
  // inside: weapon wall on the back, bench, scroll shelf
  b.box(2.2, 0.12, 0.1, [0, 1.95, tz - half + 0.1], dark); b.box(2.2, 0.12, 0.1, [0, 1.1, tz - half + 0.1], dark);
  for (let i = 0; i < 4; i++) b.box(0.08, 1.4, 0.06, [-0.75 + i * 0.5, 1.5, tz - half + 0.18], steel, [0, 0, 0.12 - i * 0.08]);
  b.cyl(0.35, 0.35, 0.06, 10, [-0.25, 1.55, tz - half + 0.22], '#7a1f22', [Math.PI / 2, 0, 0]);
  b.box(1.8, 0.12, 0.5, [-1.2, 0.62, tz + 0.6], wood); for (const x of [-1.95, -0.45]) b.box(0.12, 0.42, 0.42, [x, 0.4, tz + 0.6], dark);
  b.box(0.9, 1.3, 0.4, [1.7, 0.85, tz - 1.6], dark); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) b.cyl(0.07, 0.07, 0.34, 6, [1.45 + j * 0.25, 0.55 + i * 0.4, tz - 1.45], i === 1 ? '#e8dcc0' : '#d8c49a', [0, 0, Math.PI / 2]);
  // straw training dummies (left of the entrance)
  const dummy = (x: number, z: number, r: number) => {
    b.cyl(0.55, 0.6, 0.16, 8, [x, 0.08, z], '#6a6358');
    b.box(0.16, 1.9, 0.16, [x, 0.95, z], wood);
    b.cyl(0.3, 0.36, 0.95, 8, [x, 1.55, z], straw, [0, r, 0]);
    b.box(0.08, 0.95, 0.08, [x, 1.55, z], dark, [0, r, 0]);
    b.box(1.35, 0.14, 0.14, [x, 1.85, z], wood, [0, r, 0]);
    b.sph(0.27, [x, 2.32, z], '#e0c37e', 1, 8);
    b.box(0.5, 0.05, 0.5, [x, 1.4, z], red, [0, r + 0.4, 0]);
    b.torus(0.31, 0.04, [x, 1.25, z], '#7a5230', [Math.PI / 2, 0, 0]); b.torus(0.33, 0.04, [x, 1.85 - 0.25, z], '#7a5230', [Math.PI / 2, 0, 0]);
  };
  dummy(-3.4, 1.7, 0.3); dummy(-3.9, 3.6, -0.4);
  // weapon rack + archery target + hay (right of the entrance)
  b.box(0.16, 1.6, 0.16, [2.9, 0.8, 1.5], dark); b.box(0.16, 1.6, 0.16, [4.5, 0.8, 1.5], dark);
  b.box(1.8, 0.12, 0.16, [3.7, 1.45, 1.5], dark); b.box(1.8, 0.12, 0.16, [3.7, 0.55, 1.5], dark);
  for (let i = 0; i < 4; i++) { b.box(0.08, 1.5, 0.06, [3.1 + i * 0.4, 1.15, 1.62], steel, [0, 0, 0.1 - i * 0.07]); b.box(0.3, 0.07, 0.1, [3.1 + i * 0.4, 0.5, 1.62], '#6b4a2a'); }
  b.box(0.12, 1.7, 0.12, [3.6, 0.85, 3.6], dark, [0.25, 0, 0]); b.box(0.12, 1.7, 0.12, [4.4, 0.85, 3.6], dark, [0.25, 0, 0]);
  b.cyl(0.75, 0.75, 0.16, 16, [4.0, 1.55, 3.85], straw, [Math.PI / 2 - 0.2, 0, 0]);
  b.cyl(0.55, 0.55, 0.17, 16, [4.0, 1.55, 3.86], '#efe4cc', [Math.PI / 2 - 0.2, 0, 0]);
  b.cyl(0.36, 0.36, 0.18, 16, [4.0, 1.55, 3.87], red, [Math.PI / 2 - 0.2, 0, 0]);
  b.cyl(0.16, 0.16, 0.19, 12, [4.0, 1.55, 3.88], '#e9b949', [Math.PI / 2 - 0.2, 0, 0]);
  b.box(0.04, 0.04, 0.7, [3.85, 1.7, 4.15], dark, [0.3, 0.2, 0]); b.box(0.04, 0.04, 0.7, [4.2, 1.45, 4.2], dark, [0.2, -0.2, 0]);
  b.box(1.1, 0.6, 0.7, [2.6, 0.3, 3.9], straw); b.box(1.1, 0.06, 0.72, [2.6, 0.45, 3.9], '#b89850'); b.box(0.9, 0.5, 0.6, [2.75, 0.85, 3.85], straw, [0, 0.3, 0]);
  // banner pole (left back corner)
  b.box(0.18, 4.4, 0.18, [-3.6, 2.2, -2.6], dark); b.box(1.6, 0.14, 0.14, [-2.85, 4.2, -2.6], dark); b.box(1.3, 2.0, 0.06, [-2.85, 3.15, -2.6], red);
  b.tri([-3.5, 2.15, -2.57], [-2.2, 2.15, -2.57], [-2.85, 1.6, -2.57], red);
  g.sph(0.14, [-3.6, 4.5, -2.6], '#ffd070', 1, 6); g.box(0.7, 0.1, 0.02, [-2.85, 3.35, -2.54], '#ffd070'); g.box(0.1, 0.7, 0.02, [-2.85, 3.35, -2.54], '#ffd070');
  // lanterns on the front poles
  for (const sx of [-1, 1]) { g.sph(0.13, [sx * half, 2.1, tz + half + 0.15], '#ffd88a', 1, 6); b.box(0.22, 0.05, 0.22, [sx * half, 2.27, tz + half + 0.15], dark); }
  return { body: b.build(), glow: g.build() };
}

function Station({ kind, position }: { kind: 'SHRINE' | 'TRAINER'; position: [number, number, number] }) {
  const shrine = kind === 'SHRINE';
  const geos = useMemo(() => (shrine ? buildShrine() : buildTrainer()), [shrine]);
  const col = shrine ? '#b57cff' : '#ffb04a';
  const mats = useMemo(() => ({
    lit: litMat({ roughness: 0.85 }),
    glow: nightGlow(new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1.5, 1.35, 1.1) })),
    crystal: new MeshBasicMaterial({ color: new Color(1.8, 0.9, 2.6), toneMapped: false }),
    rune: new MeshBasicMaterial({ color: new Color(2.2, 1.6, 0.5), transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
  }), [col]);
  const trainDot = useGameStore((s) => !shrine && (canTrainSkill(s) || canBuyTalent(s)));   // only when a lesson / talent is affordable (owner)
  const canTrain = useGameStore((s) => !shrine && canTrainSkill(s));
  const label = useMemo(() => labelMaterial(shrine ? 'Summoning Shrine' : 'Skill Trainer', '#f1e2b8', { size: 60, plate: 'plate', dot: trainDot }), [shrine, trainDot]);
  const sp = useGameStore((s) => s.skillPoints);
  const spLabel = useMemo(() => (canTrain && sp > 0 ? labelMaterial(`${sp} SP to spend!`, '#ffffff', { size: 50, bg: 'rgba(10,8,6,0.86)', border: '#c8962e' }) : null), [sp]);
  const near = useRef(false), closedK = useRef(0);
  const crystalRef = useRef<Mesh>(null!), runeRef = useRef<Mesh>(null!), titleRef = useRef<Sprite>(null!), spRef = useRef<Sprite>(null!);
  const px = position[0], pz = position[2];
  const open = () => {
    const st = useGameStore.getState().status;
    if (st === GameStatus.MENU && useUiStore.getState().titleDone) walkAndOpen(px, pz + (shrine ? 3.2 : 2.8), shrine ? 'SUMMON' : 'SKILLS', 1.8);
    else if (st === GameStatus.PLAYING) useGameStore.getState().openSpecificShop(shrine ? 'SUMMON' : 'SKILLS');
  };
  useFrame(({ clock }, dt0) => {
    const dt = Math.min(dt0, 0.05), t = clock.elapsedTime;
    const status = useGameStore.getState().status;
    const lobby = isLobbyStatus(status) || status === GameStatus.GAME_OVER;
    closedK.current += (0 - closedK.current) * Math.min(1, dt * 2.2);
    const closed = closedK.current > 0.5;
    const d = Math.hypot(world.player.pos.x - px, world.player.pos.z - pz);
    near.current = !lobby && !closed && d < 6;
    const pulse = 0.5 + 0.5 * Math.sin(t * (near.current ? 5 : 1.6));
    if (titleRef.current) titleRef.current.visible = !closed;
    if (spRef.current) { spRef.current.visible = !closed; spRef.current.position.y = 7.4; }
    if (shrine) {
      if (crystalRef.current) { crystalRef.current.position.y = 3.3 + Math.sin(t * 1.6) * 0.25; crystalRef.current.rotation.y = t * 0.9; mats.crystal.color.setRGB(1.6 + Math.sin(t * 2) * 0.3, 0.9 + Math.sin(t * 2.7) * 0.25, 2.4); }
      if (runeRef.current) { runeRef.current.rotation.z = -t * 0.4; mats.rune.opacity = 0.35 + 0.3 * pulse; }
      if (d < 55 && status !== GameStatus.PAUSED && Math.random() < dt * 4) {
        const a = Math.random() * TAU, r = 0.5 + Math.random() * 0.9, gold = Math.random() < 0.5;
        FX.add.emit(px + Math.cos(a) * r, 2.0, pz + Math.sin(a) * r, 0, 0.7, 0, 2.4, 0.16, 0.02, gold ? 2.2 : 1.4, gold ? 1.6 : 0.6, gold ? 0.4 : 2.2, 0.8, CELL.GLOW);
      }
    }
  });
  const hover = (on: boolean) => { document.body.style.cursor = on ? 'pointer' : ''; };
  return (
    <group position={position}>
      <mesh geometry={geos.body} material={mats.lit} castShadow receiveShadow />
      <mesh geometry={geos.glow} material={mats.glow} />
      {shrine && <>
        <mesh ref={crystalRef} material={mats.crystal} position={[0, 3.3, 0]} scale={[0.6, 1.0, 0.6]}><octahedronGeometry args={[0.8, 0]} /></mesh>
        <mesh ref={runeRef} material={mats.rune} position={[0, 0.8, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.35, 1.55, 8]} /></mesh>
        {q_light(col)}
      </>}
      <sprite ref={titleRef} material={label.mat} position={[0, shrine ? 5.4 : 6.2, 0]} scale={[label.aspect * 0.85, 0.85, 1]} />
      {spLabel && !shrine && <sprite ref={spRef} material={spLabel.mat} position={[0, 7.4, 0]} scale={[spLabel.aspect * 0.8, 0.8, 1]} />}
      <mesh position={[0, 1.8, shrine ? 0 : 0.4]} onClick={(e) => { e.stopPropagation(); open(); }} onPointerOver={() => hover(true)} onPointerOut={() => hover(false)}>
        <boxGeometry args={shrine ? [5, 4, 5] : [9, 4.4, 7.4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
const q_light = (c: string) => <pointLight position={[0, 3, 0]} color={c} distance={12} decay={1.6} intensity={10} />;

// ------------------------------------------------------------- endless tower ---
/** The Endless Tower's name tag + click target + door glow (the tower itself is nature_kit_v1 'endless_tower', drawn by render/NatureScenery.tsx;
 *  its door faces north onto the forest road: townData TOWER, ry PI). */
function TowerLandmark() {
  const label = useMemo(() => labelMaterial('Endless Tower', '#e9d6ff', { size: 64, plate: 'plate' }), []);
  const best = useGameStore((s) => s.progress.towerBest[s.hero] ?? 0);
  const sub = useMemo(() => (best > 0 ? labelMaterial(`Best floor ${best}`, '#c9a6ff', { size: 46 }) : null), [best]);
  const open = () => { if (useGameStore.getState().status === GameStatus.MENU && useUiStore.getState().titleDone) walkTo(TOWER.door.x, TOWER.door.z, 'tower', '', 2.2); };
  return (
    <group position={[TOWER.x, TOWER_KNOLL.h, TOWER.z]}>
      <sprite material={label.mat} position={[0, 30.4, 0]} scale={[label.aspect * 1.4, 1.4, 1]} />
      {sub && <sprite material={sub.mat} position={[0, 28.9, 0]} scale={[sub.aspect * 0.8, 0.8, 1]} />}
      <pointLight position={[0, 3, -7.4]} color="#b77dff" distance={12} decay={1.6} intensity={12} />
      <mesh position={[0, 6, -1.6]} onClick={(e) => { e.stopPropagation(); open(); }} onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
        <cylinderGeometry args={[4.4, 4.4, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}


// ---- the adventurer's house (owner: unique): a name plate over its blue-and-gold gate arch 
function HeroHomeSign() {
  const label = useMemo(() => labelMaterial('Your Home', '#ffe9a8', { size: 64, plate: 'plate' }), []);
  const x = HERO_HOUSE.x - 0.8, z = HERO_HOUSE.z + HERO_HOUSE.d / 2;   // (over the front door)
  return <group position={[x, townLift(x, z), z]}><sprite material={label.mat} position={[0, 5.6, 0]} scale={[label.aspect * 0.9, 0.9, 1]} /></group>;
}

// ---- Adventure Portal: kit v3 `adventure_portal` (engine/townFill puts it in the plaza lawn at PORTAL, x PORTAL_S, front south); this adds the swirling gateway, rune stones, light + label
function PortalLandmark() {
  const mats = useMemo(() => ({
    lit: litMat({ roughness: 0.92 }),
    glow: new MeshBasicMaterial({ toneMapped: false, color: new Color(0.9, 1.9, 2.6) }),
    disc: new MeshBasicMaterial({ color: new Color(0.25, 0.6, 1.4), transparent: true, opacity: 0.55, side: DoubleSide, depthWrite: false, toneMapped: false }),
    swirl: new MeshBasicMaterial({ color: new Color(0.7, 1.4, 2.4), transparent: true, opacity: 0.6, side: DoubleSide, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
    swirl2: new MeshBasicMaterial({ color: new Color(1.4, 0.8, 2.2), transparent: true, opacity: 0.45, side: DoubleSide, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
  }), []);
  const label = useMemo(() => labelMaterial('Adventure Portal', '#d6f2ff', { size: 64, plate: 'plate' }), []);
  const r1 = useRef<Mesh>(null!), r2 = useRef<Mesh>(null!), r3 = useRef<Mesh>(null!), stones = useRef<Group>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (r1.current) r1.current.rotation.z = t * 0.9;
    if (r2.current) r2.current.rotation.z = -t * 1.4;
    if (r3.current) { r3.current.rotation.z = t * 0.4; r3.current.scale.setScalar(1 + Math.sin(t * 2) * 0.04); }
    mats.disc.opacity = 0.45 + Math.sin(t * 1.7) * 0.1;
    if (stones.current) { stones.current.rotation.y = t * 0.35; stones.current.children.forEach((c, i) => { c.position.y = 1.5 + i * 0.7 + Math.sin(t * 1.5 + i) * 0.18; }); }
  });
  const open = () => { if (useGameStore.getState().status === GameStatus.MENU && useUiStore.getState().titleDone) walkTo(PORTAL.front.x, PORTAL.front.z, 'none', '', 2.2); };
  const k = PORTAL_S, y0 = PLAZA_DECOR.lawnY;
  return (
    <group position={[PORTAL.x, y0, PORTAL.z]}>
      {/* the swirling gateway over the kit piece's stone disc (its front faces south, +z: the hero comes from the plaza) */}
      <group position={[0, 5.3 * k / 1.5, 0.62 * k / 1.5]} scale={k / 1.5}>
        <mesh material={mats.disc}><circleGeometry args={[3.35, 40]} /></mesh>
        <mesh ref={r1} material={mats.swirl} position={[0, 0, 0.02]}><ringGeometry args={[1.2, 3.3, 40, 1, 0, Math.PI * 1.3]} /></mesh>
        <mesh ref={r2} material={mats.swirl2} position={[0, 0, 0.04]}><ringGeometry args={[0.4, 2.6, 36, 1, 0, Math.PI * 0.9]} /></mesh>
        <mesh ref={r3} material={mats.swirl} position={[0, 0, 0.06]}><ringGeometry args={[2.9, 3.35, 48]} /></mesh>
      </group>
      {/* rune stones floating around the arch */}
      <group ref={stones}>
        {[0, 1, 2, 3].map((i) => <mesh key={i} material={mats.glow} position={[Math.cos(i * 1.57) * 4.2, 1.6 + i * 0.7, Math.sin(i * 1.57) * 4.2]}><octahedronGeometry args={[0.24, 0]} /></mesh>)}
      </group>
      <sprite material={label.mat} position={[0, 6.2, 0]} scale={[label.aspect * 0.8, 0.8, 1]} />
      <pointLight position={[0, 2.6, 2.4]} color="#7ad8ff" distance={10} decay={1.6} intensity={9} />
      <mesh position={[0, 2.6, 0.6]} onClick={(e) => { e.stopPropagation(); open(); }} onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
        <boxGeometry args={[6.6, 5.4, 2.4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function Town({ q }: { q: QualityCfg }) {
  // houses / stalls / gate / NPCs / animals: only in the peaceful village (and behind the title screen)
  const village = useGameStore((s) => s.status === GameStatus.MENU || s.status === GameStatus.HERO_SELECT);
  return (
    <>
      {village && <TownScenery q={q} />}
      {village && <Rockfall />}
      {village && <TownGates />}
      {village && <Stable />}
      {village && <Npcs />}
      {village && <TowerLandmark />}
      {village && <PortalLandmark />}
      {village && <HeroHomeSign />}
      {village && <Beach q={q} />}
      {SHOP_POSITIONS.map((s) => <Shop key={s.type} type={s.type as ShopType} position={s.position} color={s.color} q={q} facing={s.rot ?? 0} />)}
      <Station kind="TRAINER" position={TRAINER_POS} />
    </>
  );
}
export const __builders = { buildSign };
