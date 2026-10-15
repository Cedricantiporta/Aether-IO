// Ground arrow beside the hero in the town hub. Points ALONG THE WALKABLE ROUTE (engine/systems/townPath route hint) to
// where the current objective continues (engine/systems/questNav): the main quest's NPC / shop first (gold), then a
// bounty to claim, the King, loot to sell, a side quest to hand in (cyan), then the main quest's field objective (the
// Adventure Portal). Inside the castle it leads to the King / a castle NPC or the exit.
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { ConeGeometry, Color, Mesh, MeshBasicMaterial } from 'three';
import { world } from '../engine/world';
import { useGameStore } from '../store';
import { GameStatus } from '../types';
import { useUiStore } from '../ui/uiStore';
import { questDone, questNeedsKing } from '../quests';
import { npcMarkers } from '../engine/systems/npcQuestLogic';
import { mainNav, boardQuestNav, navNpc, npcArea, type NavTarget } from '../engine/systems/questNav';
import { updateRouteHint } from '../engine/systems/townPath';
import { gateOpen } from '../story';

const GOLD = new Color('#f2c14e'), QUEST = new Color('#4fe3ff');
const tgt = { x: 0, z: 0, reach: 2, quest: false, hideR: 4.5 };
const use = (t: NavTarget, quest: boolean): boolean => { tgt.x = t.x; tgt.z = t.z; tgt.reach = t.reach; tgt.quest = quest; tgt.hideR = Math.max(4.5, t.reach + 1); return true; };

function pickTarget(): boolean {
  const st = useGameStore.getState(), qs = st.quests;
  // 1) the main quest when it waits on someone / a shop in town (gold)
  const main = mainNav();
  if (main && !main.field) return use(main, false);
  // 2) a bounty to claim / report to the King / loot to sell, a side quest ready to hand in (cyan)
  const q = qs.find(questDone) ?? qs.find(questNeedsKing) ?? qs.find((x) => x.accepted && x.type === 'SELL_LOOT' && x.progress < x.target && st.inventory.some((i) => i.type === 'LOOT'));
  if (q) return use(boardQuestNav(q), true);
  const mk = npcMarkers(), here = world.village.area;
  let npcI = -1;
  for (let i = 0; i < mk.length; i++) if (mk[i] === 3 && (npcI < 0 || npcArea(i) === here)) npcI = i;   // prefer one in the current area
  if (npcI >= 0) return use(navNpc(npcI), true);
  // 3) the main quest's field objective: out to the Adventure Portal (once the gate is open)
  if (main && gateOpen(st.story)) { use(main, false); tgt.hideR = 9; return true; }
  return false;
}

export function GuideArrow() {
  const geo = useMemo(() => new ConeGeometry(0.55, 1.5, 3).rotateX(Math.PI / 2), []);
  const mat = useMemo(() => new MeshBasicMaterial({ transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false, color: GOLD.clone() }), []);
  const ref = useRef<Mesh>(null!);
  const S = useRef({ acc: 1, has: false, ax: 0, az: 0 });
  useFrame(({ clock }, dt) => {
    const m = ref.current; if (!m) return;
    const on = useGameStore.getState().status === GameStatus.MENU && useUiStore.getState().titleDone && !world.village.pending;
    const s = S.current, p = world.player.pos;
    s.acc += dt;
    if (on && s.acc > 0.25) {
      s.has = pickTarget(); mat.color.copy(tgt.quest ? QUEST : GOLD);
      if (s.has) { const h = updateRouteHint(p.x, p.z, tgt.x, tgt.z, tgt.reach, s.acc); s.ax = h.x; s.az = h.z; }
      s.acc = 0;
    }
    const dx = s.ax - p.x, dz = s.az - p.z, d = Math.hypot(dx, dz), dt2 = Math.hypot(tgt.x - p.x, tgt.z - p.z);
    m.visible = on && s.has && dt2 > tgt.hideR && d > 0.3;
    if (!m.visible) return;
    const k = 4.2 + Math.sin(clock.elapsedTime * 5) * 0.25;
    m.position.set(p.x + (dx / d) * k, (world.village.area !== 'TOWN' ? 0.35 : 0.25), p.z + (dz / d) * k);
    m.rotation.y = Math.atan2(dx, dz);
  });
  return <mesh ref={ref} geometry={geo} material={mat} visible={false} renderOrder={5} />;
}
